import { defineCommand, type CommandRegistry, type HitTest } from '@combviz/editor';
import type {
  EngineSchemaFragment,
  Scene,
  SceneElement,
  ValidationIssue,
} from '@combviz/schema';
import { readGame, type GameModel } from './model.js';
import { GameConfig, GAME_LIMITS, PileElement } from './schema.js';
import {
  allMoves,
  isLocalRule,
  spectrumReadable,
  stateSpaceEstimate,
  type Move,
} from './solver.js';
import { pileBands } from './render.js';
import { GAME_VALIDATOR_IDS, resolveGameValidator } from './validators.js';

export * from './schema.js';
export { gameTools } from './tools.js';
export * from './model.js';
export * from './solver.js';
export * from './validators.js';
export { gameEnvironment } from './dsl.js';
export { gameRenderer } from './render.js';

/**
 * Nước đi hợp lệ khớp với yêu cầu, hoặc `null`.
 *
 * Mọi lệnh đi đều qua đây, và đây gọi `allMoves` — đúng hàm solver dùng. Nếu để
 * lệnh tự do sửa số viên thì người học "thắng" được bằng cách đi một nước không
 * tồn tại, và sandbox mất hết ý nghĩa.
 */
function findMove(
  model: GameModel,
  match: (move: Move, counts: readonly number[]) => boolean,
): Move | null {
  const counts = model.piles.map((p) => p.count);
  return allMoves(counts, model.config.rule).find((move) => match(move, counts)) ?? null;
}

/** Chỉ số của một đống trong **danh sách đống** (không phải trong `elements`). */
function pileIndex(model: GameModel, id: string): number {
  return model.piles.findIndex((p) => p.id === id);
}

/** Vị trí của một đống trong `scene.elements`. */
function elementIndex(scene: Scene, id: string): number {
  return scene.elements.findIndex((e) => e.id === id && e.type === 'pile');
}

/** Đi một nước bốc từ **một** đống (GM-02, chơi luân phiên trên cùng máy). */
const take = defineCommand<{ pile: string; count: number }>({
  type: 'game/take',
  label: (params) => `Bốc ${params.count}`,
  apply(scene, params) {
    const model = readGame(scene);
    const at = elementIndex(scene, params.pile);
    const index = pileIndex(model, params.pile);
    if (at === -1 || index === -1) return null;

    const pile = model.piles[index] as GameModel['piles'][number];
    const move = findMove(
      model,
      (m) =>
        m.piles.length === 1 &&
        m.piles[0] === index &&
        (m.becomes[0] as readonly number[]).length === 1 &&
        (m.becomes[0] as readonly number[])[0] === pile.count - params.count,
    );
    if (move === null) return null;

    const elements = scene.elements.slice();
    elements[at] = {
      ...(elements[at] as SceneElement),
      count: pile.count - params.count,
    };
    return { ...scene, elements };
  },
});

/** Chia một đống làm hai phần (trò Grundy, Nim Lasker). */
const split = defineCommand<{ pile: string; first: number }>({
  type: 'game/split',
  label: () => 'Chia đống',
  apply(scene, params) {
    const model = readGame(scene);
    const at = elementIndex(scene, params.pile);
    const index = pileIndex(model, params.pile);
    if (at === -1 || index === -1) return null;

    const move = findMove(
      model,
      (m) =>
        m.piles.length === 1 &&
        m.piles[0] === index &&
        (m.becomes[0] as readonly number[]).length === 2 &&
        (m.becomes[0] as readonly number[])[0] === params.first,
    );
    if (move === null) return null;

    const parts = move.becomes[0] as readonly number[];
    const newId = `${params.pile}-b`;
    if (scene.elements.some((e) => e.id === newId)) return null;

    const elements = scene.elements.slice();
    elements[at] = { ...(elements[at] as SceneElement), count: parts[0] as number };
    elements.splice(at + 1, 0, {
      id: newId,
      type: 'pile',
      count: parts[1] as number,
    });
    return { ...scene, elements };
  },
});

/**
 * Bốc **cùng một số** viên ở hai đống (GM-05, nước chéo của Wythoff).
 *
 * Hai id chứ không phải một: người học bấm hai đống rồi mới có nước. Đây là lý do
 * `Move.piles` là danh sách — một lệnh "bốc ở đống này" không diễn đạt được nước
 * mà bản chất là **một** nước trên hai đống.
 */
const takeBoth = defineCommand<{ pile_a: string; pile_b: string; count: number }>({
  type: 'game/take-both',
  label: (params) => `Bốc ${params.count} ở cả hai đống`,
  apply(scene, params) {
    if (params.pile_a === params.pile_b) return null;
    const model = readGame(scene);
    const first = pileIndex(model, params.pile_a);
    const second = pileIndex(model, params.pile_b);
    if (first === -1 || second === -1) return null;

    const [lo, hi] = first < second ? [first, second] : [second, first];
    const after = (index: number): number =>
      (model.piles[index] as GameModel['piles'][number]).count - params.count;

    const move = findMove(
      model,
      (m) =>
        m.piles.length === 2 &&
        m.piles[0] === lo &&
        m.piles[1] === hi &&
        (m.becomes[0] as readonly number[])[0] === after(lo) &&
        (m.becomes[1] as readonly number[])[0] === after(hi),
    );
    if (move === null) return null;

    const elements = scene.elements.slice();
    for (const index of [lo, hi]) {
      const at = elementIndex(scene, (model.piles[index] as GameModel['piles'][number]).id);
      if (at === -1) return null;
      elements[at] = { ...(elements[at] as SceneElement), count: after(index) };
    }
    return { ...scene, elements };
  },
});

export const gameCommands: CommandRegistry = {
  [take.type]: take,
  [split.type]: split,
  [takeBoth.type]: takeBoth,
};

/**
 * Chạm vào cột đống.
 *
 * Dải hoành độ đọc từ `pileBands`, **cùng** hàm mà renderer dùng để đặt các cột.
 * Bản trước chia đều theo `SLOT = 10`, mà cột nhiều viên xếp thành nhiều dãy nên
 * rộng hơn thế: từ đống thứ hai trở đi, chạm vào cột này chọn trúng cột khác. Lỗi
 * ấy vô hình cho tới khi có một công cụ cần **hai** đống — bấm hai cột rồi nhận
 * lại một cặp id không phải cặp mình bấm.
 *
 * View `spectrum` không trả gì: ở đó không vẽ đống nào, và không lệnh nào tác động
 * lên một ô phổ. Trả về một id đống trong lúc đống không hiện trên hình là mời
 * người học bấm vào chỗ không có gì.
 */
export const gameHitTest: HitTest = (scene, point) => {
  const model = readGame(scene);
  if (model.config.view === 'spectrum') return [];
  const band = pileBands(model).find((b) => point.x >= b.from && point.x < b.to);
  return band ? [band.id] : [];
};

export const gameSchemaFragment: EngineSchemaFragment = {
  id: 'game',
  configSchema: GameConfig,
  elementSchemas: { pile: PileElement },
  bounds: { engine: 'game', limits: GAME_LIMITS },
  resolveValidator: resolveGameValidator,
  validatorIds: GAME_VALIDATOR_IDS,

  /**
   * View `spectrum` sinh ô ngầm định `pos-<n>`.
   *
   * Nhờ vậy anchor trỏ thẳng vào một thế cụ thể được — "[[a1|thế $n = 8$]] cũng
   * thua" — mà ANC-02 không báo rot. Cùng cơ chế với ô bàn cờ (D-16).
   */
  implicitElementIds(scene: Scene): Set<string> {
    const model = readGame(scene);
    if (model.config.view !== 'spectrum') return new Set();

    const upTo = Math.min(
      GAME_LIMITS.maxSpectrum,
      model.config.spectrum_to ?? Math.max(...model.piles.map((p) => p.count), 12),
    );
    const ids = new Set<string>();
    for (let n = 0; n <= upTo; n += 1) ids.add(`pos-${n}`);
    return ids;
  },

  checkBounds(scene: Scene, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const model = readGame(scene);
    const config = scene.config as GameConfig | undefined;

    // Thiếu luật là lỗi **của bài**, không phải mặc định êm: hai bài cùng một
    // hình đống sỏi mà khác luật thì khác hẳn đáp số.
    if (!config?.rule) {
      issues.push({
        code: 'bounds/missing-rule',
        severity: 'error',
        message: 'Scene game không khai `rule`',
        path: `${path}/config`,
        hint: 'Cùng một hình đống sỏi, hai luật khác nhau cho hai đáp số khác nhau',
      });
    }

    if (model.piles.length > GAME_LIMITS.maxPiles) {
      issues.push({
        code: 'bounds/too-many-piles',
        severity: 'error',
        message: `${model.piles.length} đống, vượt trần ${GAME_LIMITS.maxPiles}`,
        path: `${path}/elements`,
      });
    }

    for (const pile of model.piles) {
      if (pile.count > GAME_LIMITS.maxPerPile) {
        issues.push({
          code: 'bounds/pile-too-large',
          severity: 'error',
          message: `Đống "${pile.id}" có ${pile.count} viên, vượt trần ${GAME_LIMITS.maxPerPile}`,
          path: `${path}/elements`,
          hint: 'Solver duyệt lùi toàn bộ không gian thế; trần đặt theo chỗ đó (NFR-P4)',
        });
      }
    }

    // `spectrum` chỉ đọc được cho luật bốc trên **một** đống: luật chia biến một
    // đống thành hai, còn Wythoff và Euclid cần từ hai đống trở lên.
    if (config?.view === 'spectrum' && config.rule && !spectrumReadable(config.rule)) {
      issues.push({
        code: 'bounds/spectrum-needs-subtract-rule',
        severity: 'error',
        message: 'View `spectrum` chỉ dùng được với luật bốc từ một đống',
        path: `${path}/config/view`,
        hint: 'Chia đống sinh ra hai trò con, còn luật đọc đống khác cần ít nhất hai đống; phổ một chiều không mô tả được cả hai',
      });
    }

    // Grundy: chặn **trước** khi hình vẽ ra một con số tự tin và sai. Với luật
    // toàn cục hay quy ước misère, Sprague–Grundy không áp dụng, nên "g=" dưới
    // mỗi đống sẽ là một khẳng định không có cơ sở.
    if (config?.show_grundy === true && config.rule) {
      const why = !isLocalRule(config.rule)
        ? 'luật có nước đụng nhiều đống hoặc đọc đống khác, nên ván không phải tổng các trò con độc lập'
        : config.misere === true
          ? 'quy ước misère'
          : null;
      if (why !== null) {
        issues.push({
          code: 'bounds/grundy-not-applicable',
          severity: 'error',
          message: `\`show_grundy\` không dùng được: ${why}`,
          path: `${path}/config/show_grundy`,
          hint: 'Sprague–Grundy chỉ áp cho tổng các trò con độc lập, luật chơi thường',
        });
      }
    }

    // Luật toàn cục giải bằng duyệt lùi, nên cỡ thế là chuyện của bài chứ không
    // phải của solver. Đo lúc soạn thì tác giả sửa được; để tới lúc chạy thì
    // người học nhận một khung trống kèm dòng "đã từ chối".
    if (config?.rule && !isLocalRule(config.rule)) {
      const estimate = stateSpaceEstimate(model.piles.map((p) => p.count));
      if (estimate > GAME_LIMITS.maxStates) {
        issues.push({
          code: 'bounds/state-space-too-large',
          severity: 'error',
          message: `Không gian thế cỡ ${estimate} (trần ${GAME_LIMITS.maxStates})`,
          path: `${path}/elements`,
          hint: 'Luật đụng nhiều đống không có bảng Grundy; solver phải duyệt lùi cả thế (NFR-P4)',
        });
      }
    }

    return issues;
  },
};
