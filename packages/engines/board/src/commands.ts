import { defineCommand, type CommandRegistry } from '@combviz/editor';
import type { Scene, SceneElement } from '@combviz/schema';
import { cellId, parseCellId } from './ids.js';
import { tileCells } from './dsl.js';
import type { BoardConfig, ColoringPreset } from './schema.js';
import { cellColorClass, FLIP_CLASSES, latticeOf, type Offset } from './geometry.js';
import { inBoard, neighbours } from './lattice.js';

/**
 * Command của Grid/Board (BD-01..03).
 *
 * Mọi lệnh là hàm thuần `(scene, params) → scene | null`. Không lệnh nào sinh id,
 * đọc giờ hay random — xem chú thích ở `@combviz/editor`.
 */

function withConfig(scene: Scene, config: BoardConfig): Scene {
  return { ...scene, config };
}

function withElements(scene: Scene, elements: SceneElement[]): Scene {
  return { ...scene, elements };
}

function boardConfig(scene: Scene): BoardConfig {
  return scene.config as BoardConfig;
}

function inBounds(config: BoardConfig, row: number, col: number): boolean {
  return row >= 0 && col >= 0 && row < config.rows && col < config.cols;
}

function isHoleAt(config: BoardConfig, row: number, col: number): boolean {
  return (config.holes ?? []).some(([r, c]) => r === row && c === col);
}

/**
 * BD-01 — tô màu ô, kể cả kéo quét.
 *
 * Nhận **danh sách** ô chứ không phải một ô: kéo quét qua 20 ô phải là *một* mục
 * trong lịch sử undo, không phải 20. Undo từng ô một là undo vô dụng.
 */
const paintCells = defineCommand<{ cells: readonly string[]; color_class: number | null }>({
  type: 'board/paint-cells',

  label(params) {
    const count = params.cells.length;
    const scope = count === 1 ? 'một ô' : `${count} ô`;
    return params.color_class === null
      ? `Xoá màu ${scope}`
      : `Tô ${scope} thành màu ${params.color_class}`;
  },

  apply(scene, params) {
    const config = boardConfig(scene);
    const overrides = { ...(config.cell_overrides ?? {}) };
    let changed = false;

    for (const id of params.cells) {
      const cell = parseCellId(id);
      if (!cell || !inBounds(config, cell.row, cell.col)) continue;
      if (isHoleAt(config, cell.row, cell.col)) continue;

      if (params.color_class === null) {
        if (overrides[id]) {
          const { color_class: _dropped, ...rest } = overrides[id];
          if (Object.keys(rest).length === 0) delete overrides[id];
          else overrides[id] = rest;
          changed = true;
        }
      } else if (overrides[id]?.color_class !== params.color_class) {
        overrides[id] = { ...overrides[id], color_class: params.color_class };
        changed = true;
      }
    }

    if (!changed) return null;
    return withConfig(scene, { ...config, cell_overrides: overrides });
  },
});

/** BD-01 — preset tham số hoá: công cụ chứng minh chủ lực của dạng tiling. */
const setPreset = defineCommand<{ preset: ColoringPreset | null }>({
  type: 'board/set-preset',
  label: (params) => (params.preset ? 'Áp preset tô màu' : 'Bỏ preset tô màu'),
  apply(scene, params) {
    const config = boardConfig(scene);
    if (params.preset === null) {
      if (!config.coloring_preset) return null;
      const { coloring_preset: _dropped, ...rest } = config;
      return withConfig(scene, rest as BoardConfig);
    }
    return withConfig(scene, { ...config, coloring_preset: params.preset });
  },
});

/** BD-03 — đặt tile. Id do phía gọi cấp (`allocateId`). */
const placeTile = defineCommand<{
  id: string;
  shape: string;
  pos: Offset;
  rot?: number;
  flip?: boolean;
  color_class?: number;
}>({
  type: 'board/place-tile',
  label: (params) => `Đặt ${params.shape}`,
  apply(scene, params) {
    // Polyomino là hình ghép từ ô **vuông**. Trên lưới tam giác hay lục giác nó
    // vẫn "đặt" được nếu để yên, và vẽ ra một hình chữ nhật nằm chồng lên mấy ô
    // méo — không lỗi, không cảnh báo, chỉ là sai. Từ chối ở đây, cùng chỗ mà
    // `checkBounds` từ chối lúc soạn.
    if (latticeOf(boardConfig(scene)) !== 'square') return null;
    if (scene.elements.some((e) => e.id === params.id)) return null;

    const element: SceneElement = {
      id: params.id,
      type: 'tile',
      shape: params.shape,
      pos: [params.pos[0], params.pos[1]],
      rot: params.rot ?? 0,
      ...(params.flip ? { flip: true } : {}),
      ...(params.color_class === undefined ? {} : { color_class: params.color_class }),
    };

    return withElements(scene, [...scene.elements, element]);
  },
});

/** BD-02 — đặt quân. */
const placePiece = defineCommand<{
  id: string;
  kind: string;
  pos: Offset;
  glyph?: string;
  color_class?: number;
}>({
  type: 'board/place-piece',
  label: (params) => `Đặt quân ${params.kind}`,
  apply(scene, params) {
    const config = boardConfig(scene);
    if (!inBounds(config, params.pos[0], params.pos[1])) return null;
    if (scene.elements.some((e) => e.id === params.id)) return null;

    const element: SceneElement = {
      id: params.id,
      type: 'piece',
      kind: params.kind,
      pos: [params.pos[0], params.pos[1]],
      ...(params.glyph === undefined ? {} : { glyph: params.glyph }),
      ...(params.color_class === undefined ? {} : { color_class: params.color_class }),
    };

    return withElements(scene, [...scene.elements, element]);
  },
});

/**
 * BD-02/03 — di chuyển element.
 *
 * Cho phép **kéo ra chỗ vi phạm**: chồng lấn và tràn biên là thứ validator báo
 * realtime (SBX-02), không phải thứ command chặn. Chặn ở đây sẽ biến sandbox
 * thành cái hộp không nghịch được, mà cả điểm của nó là học bằng nghịch.
 */
const moveElement = defineCommand<{ id: string; pos: Offset }>({
  type: 'board/move-element',
  label: () => 'Di chuyển',
  apply(scene, params) {
    const index = scene.elements.findIndex((e) => e.id === params.id);
    if (index === -1) return null;

    const current = scene.elements[index] as SceneElement;
    if (current['locked']) return null;

    const pos = current['pos'] as Offset | undefined;
    if (pos && pos[0] === params.pos[0] && pos[1] === params.pos[1]) return null;

    const elements = [...scene.elements];
    elements[index] = { ...current, pos: [params.pos[0], params.pos[1]] };
    return withElements(scene, elements);
  },
});

/** BD-03 — xoay tile tại chỗ. */
const rotateTile = defineCommand<{ id: string; delta: number }>({
  type: 'board/rotate-tile',
  label: () => 'Xoay',
  apply(scene, params) {
    const index = scene.elements.findIndex((e) => e.id === params.id);
    if (index === -1) return null;

    const current = scene.elements[index] as SceneElement;
    if (current.type !== 'tile' || current['locked']) return null;

    const rot = (((Number(current['rot'] ?? 0) + params.delta) % 360) + 360) % 360;
    const elements = [...scene.elements];
    elements[index] = { ...current, rot };
    return withElements(scene, elements);
  },
});

/** BD-03 — lật tile. */
const flipTile = defineCommand<{ id: string }>({
  type: 'board/flip-tile',
  label: () => 'Lật',
  apply(scene, params) {
    const index = scene.elements.findIndex((e) => e.id === params.id);
    if (index === -1) return null;

    const current = scene.elements[index] as SceneElement;
    if (current.type !== 'tile' || current['locked']) return null;

    const elements = [...scene.elements];
    elements[index] = { ...current, flip: !current['flip'] };
    return withElements(scene, elements);
  },
});

const removeElements = defineCommand<{ ids: readonly string[] }>({
  type: 'board/remove',
  label: (params) => (params.ids.length === 1 ? 'Xoá' : `Xoá ${params.ids.length} phần tử`),
  apply(scene, params) {
    const doomed = new Set(params.ids);
    const kept = scene.elements.filter((e) => !doomed.has(e.id) || e['locked']);
    if (kept.length === scene.elements.length) return null;
    return withElements(scene, kept);
  },
});

/** BD-02 — bật/tắt overlay vùng khống chế cho một quân. */
const toggleAttacks = defineCommand<{ id: string }>({
  type: 'board/toggle-attacks',
  label: () => 'Bật/tắt vùng khống chế',
  apply(scene, params) {
    const index = scene.elements.findIndex((e) => e.id === params.id);
    if (index === -1) return null;

    const current = scene.elements[index] as SceneElement;
    if (current.type !== 'piece') return null;

    const elements = [...scene.elements];
    elements[index] = { ...current, show_attacks: !current['show_attacks'] };
    return withElements(scene, elements);
  },
});

/**
 * G-11 — hoán vị hai lớp màu trên **cả một hàng hoặc một cột**.
 *
 * Cả một họ bài tổ hợp có dạng "mỗi bước được lật dấu một hàng hoặc một cột" —
 * bảng ±1, đèn bật/tắt, lật đồng xu. §16 xếp chúng vào cụm invariant-centric và
 * đòi ≥ 5 bài. Trước lệnh này, những bài đó **không có sandbox được**: người học
 * chỉ tô được từng ô một, mà tô từng ô thì phá luôn cái luật làm nên bài toán —
 * bất biến chỉ tồn tại vì thao tác hợp lệ đụng vào **cả hàng cùng lúc**.
 *
 * Vì vậy đây không phải tiện ích. Nó là ràng buộc của bài toán, viết thành thao
 * tác: người học không thể lách được bất biến, đúng như trên giấy.
 *
 * Ô khuyết bị bỏ qua, và ô chưa mang màu nào (`color_class` chưa đặt) cũng vậy —
 * "chưa xét" không phải một lớp để lật.
 */
/**
 * Luật lan truyền trên bàn — tập **đóng** (BD-08).
 *
 * `cross` là lights-out kinh điển: bấm một ô thì nó **và** các ô kề đổi trạng
 * thái. `neighbours` là biến thể chỉ đổi các ô kề, không đổi ô được bấm — cùng họ,
 * khác hẳn bài, vì với nó việc bấm hai lần vẫn về chỗ cũ nhưng lời giải khác.
 *
 * Enum chứ không phải biểu thức, cùng lý do đã ghi ở `COMBINE_RULES` và
 * `GameRule`: cho nhập biểu thức là mở cửa hậu cho DSL-03.
 */
const SPREAD_RULES = {
  cross: true,
  neighbours: false,
} as const;

export type SpreadRule = keyof typeof SPREAD_RULES;
export const SPREAD_RULE_IDS = Object.keys(SPREAD_RULES) as readonly SpreadRule[];

const SPREAD_LABELS: Readonly<Record<SpreadRule, string>> = {
  cross: 'Lật ô và các ô kề',
  neighbours: 'Lật các ô kề (không lật ô bấm)',
};

export function spreadRuleLabel(rule: string): string {
  return Object.hasOwn(SPREAD_LABELS, rule) ? (SPREAD_LABELS[rule as SpreadRule] as string) : rule;
}

/**
 * BD-08 — bấm một ô, lật cả chùm ô quanh nó (lights-out).
 *
 * Chạy đúng trên **cả ba lưới** mà không phải viết ba lần: danh sách ô kề đọc từ
 * `neighbours()` của `lattice.ts`, nên trên bàn vuông là chữ thập bốn ô, trên bàn
 * ong là sáu ô, trên lưới tam giác là ba. Đây là lãi trực tiếp của BD-07 — hình
 * học nằm ở **một** chỗ nên tính năng sau không phải biết lưới nào.
 *
 * Ô khuyết bị bỏ qua. Ô **chưa mang màu** tính là lớp thứ nhất — khác `flip-line`,
 * và khác có chủ ý: một bàn trống là một bàn ở **trạng thái nghỉ**, nên bắt tác
 * giả tô sẵn cả bàn chỉ để nói "chưa ai đụng vào" là bắt gõ thừa. Lớp thứ nhất
 * nghĩa là gì thì tuỳ bài đặt, chỗ này không giả định.
 */
const toggleCross = defineCommand<{
  cell: string;
  rule?: SpreadRule;
  /** Cặp lớp màu hoán đổi cho nhau. Mặc định 1 ↔ 2. */
  classes?: readonly [number, number];
}>({
  type: 'board/toggle-cross',
  label: (params) => spreadRuleLabel(params.rule ?? 'cross'),

  apply(scene, params) {
    const config = boardConfig(scene);
    const lattice = latticeOf(config);
    const cell = parseCellId(params.cell);
    if (!cell) return null;

    const { row, col } = cell;
    // `inBoard` chứ không phải `inBounds`: trên lưới tam giác hàng $r$ chỉ có
    // $2r+1$ ô, nên "trong khung chữ nhật" không đồng nghĩa "có thật".
    if (!inBoard(lattice, config.rows, config.cols, row, col)) return null;

    // `Object.hasOwn` chứ không phải `!== undefined`: tra thẳng thì `rule:
    // 'toString'` lấy được hàm trên prototype, và một giá trị truthy ở đây nghĩa
    // là luật lạ **chạy im lặng** như `cross`. Cùng cái bẫy đã ghi ở DSL-03.
    const rule = params.rule ?? 'cross';
    if (!Object.hasOwn(SPREAD_RULES, rule)) return null;
    const includeSelf = SPREAD_RULES[rule];

    const [a, b] = params.classes ?? FLIP_CLASSES;
    const targets = [
      ...(includeSelf ? ([[row, col]] as const) : []),
      ...neighbours(lattice, config.rows, config.cols, row, col),
    ];

    const overrides = { ...(config.cell_overrides ?? {}) };
    let changed = false;

    for (const [r, c] of targets) {
      if (isHoleAt(config, r, c)) continue;
      const id = cellId(r, c);
      // Chưa tô nghĩa là **lớp thứ nhất**: bàn trống là bàn tắt hết đèn.
      const current = cellColorClass(config, r, c) ?? a;
      const next = current === a ? b : current === b ? a : null;
      if (next === null) continue;
      overrides[id] = { ...overrides[id], color_class: next };
      changed = true;
    }

    return changed ? { ...scene, config: { ...config, cell_overrides: overrides } } : null;
  },
});

const flipLine = defineCommand<{
  axis: 'row' | 'col';
  index: number;
  /** Cặp lớp màu hoán đổi cho nhau. Mặc định 1 ↔ 2. */
  classes?: readonly [number, number];
}>({
  type: 'board/flip-line',

  label: (params) =>
    `Lật ${params.axis === 'row' ? 'hàng' : 'cột'} ${params.index}`,

  apply(scene, params) {
    const config = boardConfig(scene);
    if (latticeOf(config) !== 'square') return null;
    const [a, b] = params.classes ?? FLIP_CLASSES;

    const span = params.axis === 'row' ? config.cols : config.rows;
    if (params.index < 0 || params.index >= (params.axis === 'row' ? config.rows : config.cols)) {
      return null;
    }

    const overrides = { ...(config.cell_overrides ?? {}) };
    let changed = false;

    for (let i = 0; i < span; i += 1) {
      const row = params.axis === 'row' ? params.index : i;
      const col = params.axis === 'row' ? i : params.index;
      if (isHoleAt(config, row, col)) continue;

      const id = cellId(row, col);
      // Đọc màu **hiệu dụng**: ô chưa có override vẫn có màu do preset sinh ra,
      // và lật một hàng của bàn cờ tô sẵn phải đổi đúng những ô đó.
      const current = cellColorClass(config, row, col);
      const next = current === a ? b : current === b ? a : null;
      if (next === null) continue;

      overrides[id] = { ...overrides[id], color_class: next };
      changed = true;
    }

    if (!changed) return null;
    return withConfig(scene, { ...config, cell_overrides: overrides });
  },
});

export const boardCommands: CommandRegistry = {
  [flipLine.type]: flipLine,
  [toggleCross.type]: toggleCross,
  [paintCells.type]: paintCells,
  [setPreset.type]: setPreset,
  [placeTile.type]: placeTile,
  [placePiece.type]: placePiece,
  [moveElement.type]: moveElement,
  [rotateTile.type]: rotateTile,
  [flipTile.type]: flipTile,
  [removeElements.type]: removeElements,
  [toggleAttacks.type]: toggleAttacks,
};

/**
 * Số ô đã phủ / tổng số ô hợp lệ (BD-03).
 *
 * Không phải command — chỉ là số đọc ra từ scene, hiện cạnh canvas trong khi
 * người học đặt quân.
 */
export function coverage(scene: Scene): { covered: number; total: number } {
  const config = boardConfig(scene);
  const holes = new Set((config.holes ?? []).map(([r, c]) => `${r},${c}`));
  const covered = new Set<string>();

  for (const element of scene.elements) {
    if (element.type !== 'tile') continue;
    for (const [r, c] of tileCells(element)) {
      if (inBounds(config, r, c) && !holes.has(`${r},${c}`)) covered.add(`${r},${c}`);
    }
  }

  return { covered: covered.size, total: config.rows * config.cols - holes.size };
}

/** BD-06 — đếm ô theo `color_class`, phục vụ lập luận đếm-theo-màu. */
export function colorSummary(scene: Scene): Map<number, number> {
  const config = boardConfig(scene);
  const counts = new Map<number, number>();

  for (let r = 0; r < config.rows; r += 1) {
    for (let c = 0; c < config.cols; c += 1) {
      if (isHoleAt(config, r, c)) continue;
      // Dùng lại `cellColorClass` chứ không cài lại luật preset: nếu bảng đếm
      // và hình vẽ tính màu bằng hai đường khác nhau, có ngày chúng bất đồng ý
      // kiến và người học đọc được điều đó trước ta.
      const value = cellColorClass(config, r, c);
      if (value === undefined) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  return counts;
}

