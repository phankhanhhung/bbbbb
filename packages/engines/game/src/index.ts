import { defineCommand, type CommandRegistry, type HitTest } from '@combviz/editor';
import type {
  EngineSchemaFragment,
  Scene,
  SceneElement,
  ValidationIssue,
} from '@combviz/schema';
import { readGame } from './model.js';
import { GameConfig, GAME_LIMITS, PileElement } from './schema.js';
import { movesFromPile } from './solver.js';
import { GAME_VALIDATOR_IDS, resolveGameValidator } from './validators.js';

export * from './schema.js';
export * from './model.js';
export * from './solver.js';
export * from './validators.js';
export { gameEnvironment } from './dsl.js';
export { gameRenderer } from './render.js';

/**
 * Đi một nước (GM-02, chơi luân phiên trên cùng máy).
 *
 * Lệnh **tự kiểm luật**: nó gọi `movesFromPile`, đúng hàm mà solver dùng, và từ
 * chối nước không hợp lệ. Nếu để lệnh tự do sửa số viên thì người học "thắng"
 * được bằng cách đi một nước không tồn tại, và sandbox mất hết ý nghĩa.
 */
const take = defineCommand<{ pile: string; count: number }>({
  type: 'game/take',
  label: (params) => `Bốc ${params.count}`,
  apply(scene, params) {
    const model = readGame(scene);
    const index = scene.elements.findIndex(
      (e) => e.id === params.pile && e.type === 'pile',
    );
    if (index === -1) return null;

    const pile = model.piles.find((p) => p.id === params.pile);
    if (!pile) return null;

    const legal = movesFromPile(pile.count, model.config.rule).filter(
      (after) => after.length === 1,
    );
    if (!legal.some((after) => after[0] === pile.count - params.count)) return null;

    const elements = scene.elements.slice();
    elements[index] = {
      ...(elements[index] as SceneElement),
      count: pile.count - params.count,
    };
    return { ...scene, elements };
  },
});

/** Chia một đống làm hai phần khác nhau (trò Grundy). */
const split = defineCommand<{ pile: string; first: number }>({
  type: 'game/split',
  label: () => 'Chia đống',
  apply(scene, params) {
    const model = readGame(scene);
    const index = scene.elements.findIndex(
      (e) => e.id === params.pile && e.type === 'pile',
    );
    if (index === -1) return null;

    const pile = model.piles.find((p) => p.id === params.pile);
    if (!pile) return null;

    const legal = movesFromPile(pile.count, model.config.rule).filter(
      (after) => after.length === 2,
    );
    const chosen = legal.find((after) => after[0] === params.first);
    if (!chosen) return null;

    const newId = `${pile.id}-b`;
    if (scene.elements.some((e) => e.id === newId)) return null;

    const elements = scene.elements.slice();
    elements[index] = { ...(elements[index] as SceneElement), count: chosen[0] as number };
    elements.splice(index + 1, 0, {
      id: newId,
      type: 'pile',
      count: chosen[1] as number,
    });
    return { ...scene, elements };
  },
});

export const gameCommands: CommandRegistry = {
  [take.type]: take,
  [split.type]: split,
};

/** Chạm vào cột đống: chia theo ô rộng một `SLOT` (10 đơn vị scene). */
export const gameHitTest: HitTest = (scene, point) => {
  const model = readGame(scene);
  const index = Math.floor(point.x / 10);
  const pile = model.piles[index];
  return pile && point.x >= 0 ? [pile.id] : [];
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

    // `spectrum` chỉ đọc được cho luật bốc: luật chia biến một đống thành hai,
    // và bảng một chiều không nói được gì về tổng của hai trò con.
    if (config?.view === 'spectrum' && config.rule?.type === 'split-unequal') {
      issues.push({
        code: 'bounds/spectrum-needs-subtract-rule',
        severity: 'error',
        message: 'View `spectrum` không dùng được với luật chia đống',
        path: `${path}/config/view`,
        hint: 'Chia đống sinh ra hai trò con; phổ một chiều không mô tả được điều đó',
      });
    }

    return issues;
  },
};
