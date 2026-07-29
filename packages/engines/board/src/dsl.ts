import type { Scene, SceneElement } from '@combviz/schema';
import { hashScene } from '@combviz/render';
import {
  DslError,
  element,
  isElement,
  type DslEnvironment,
  type ElementValue,
  type Value,
} from '@combviz/dsl';
import { cellColorClass, tileOffsets, type Offset } from './geometry.js';
import { cellId } from './ids.js';
import type { BoardConfig } from './schema.js';

/**
 * Trạng thái dẫn xuất của một scene bàn cờ (A-04).
 *
 * Tính **một lần** cho mỗi scene rồi memo theo hash: `covered(c)` suy ra từ toàn
 * bộ tile, `attacks(p,q)` suy ra từ luật đi của quân. Nếu để mỗi lần gọi builtin
 * tự tính lại, một biểu thức như
 * `count(cells, c => !covered(c))` trên bàn 40×40 sẽ thành O(ô × quân) và
 * invariant strip trượt NFR-P2 mà không ai hiểu vì sao.
 */
export interface BoardDerived {
  readonly cells: readonly ElementValue[];
  readonly tiles: readonly ElementValue[];
  readonly pieces: readonly ElementValue[];
  readonly regions: readonly ElementValue[];
  readonly rows: number;
  readonly cols: number;
  /** Toạ độ các ô mà mỗi quân chiếm, tra theo id. */
  readonly occupancy: ReadonlyMap<string, readonly Offset[]>;
}

const cache = new Map<string, BoardDerived>();
const CACHE_LIMIT = 64;

export function deriveBoard(scene: Scene): BoardDerived {
  const key = hashScene(scene);
  const hit = cache.get(key);
  if (hit) return hit;

  const derived = computeDerived(scene);

  // Bộ nhớ đệm nhỏ, thải theo thứ tự vào trước ra trước: Player chỉ đi lại giữa
  // các step gần nhau, còn CLI thì quét tuyến tính — không cần LRU thật.
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, derived);
  return derived;
}

function computeDerived(scene: Scene): BoardDerived {
  const config = scene.config as BoardConfig;
  const rows = config?.rows ?? 0;
  const cols = config?.cols ?? 0;

  const holes = new Set((config?.holes ?? []).map(([r, c]) => `${r},${c}`));
  const occupancy = new Map<string, readonly Offset[]>();
  const coveredCells = new Set<string>();

  for (const item of scene.elements) {
    if (item.type !== 'tile') continue;
    const cells = tileCells(item);
    occupancy.set(item.id, cells);
    for (const [r, c] of cells) coveredCells.add(`${r},${c}`);
  }

  const cells: ElementValue[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const hole = holes.has(`${r},${c}`);
      cells.push(
        element(cellId(r, c), {
          row: r,
          col: c,
          // Ô không được tô mang color_class 0, không phải "không có giá trị":
          // DSL không có null, nên `c.color_class == 1` luôn trả lời được.
          color_class: hole ? 0 : (cellColorClass(config, r, c) ?? 0),
          hole,
          covered: coveredCells.has(`${r},${c}`),
        }),
      );
    }
  }

  const tiles = scene.elements
    .filter((e) => e.type === 'tile')
    .map((e) =>
      element(e.id, {
        shape: String(e['shape']),
        row: Number((e['pos'] as Offset)?.[0] ?? 0),
        col: Number((e['pos'] as Offset)?.[1] ?? 0),
        rot: Number(e['rot'] ?? 0),
        flip: Boolean(e['flip']),
        size: (occupancy.get(e.id) ?? []).length,
        color_class: Number(e.color_class ?? 0),
      }),
    );

  const pieces = scene.elements
    .filter((e) => e.type === 'piece')
    .map((e) =>
      element(e.id, {
        kind: String(e['kind']),
        row: Number((e['pos'] as Offset)?.[0] ?? 0),
        col: Number((e['pos'] as Offset)?.[1] ?? 0),
        color_class: Number(e.color_class ?? 0),
      }),
    );

  const regions = scene.elements
    .filter((e) => e.type === 'region')
    .map((e) =>
      element(e.id, {
        size: ((e['cells'] as Offset[] | undefined) ?? []).length,
        color_class: Number(e.color_class ?? 0),
      }),
    );

  return { cells, tiles, pieces, regions, rows, cols, occupancy };
}

export function tileCells(item: SceneElement): readonly Offset[] {
  const pos = (item['pos'] as Offset) ?? [0, 0];
  const offsets = tileOffsets(
    String(item['shape']),
    Number(item['rot'] ?? 0),
    Boolean(item['flip']),
    item['offsets'] as Offset[] | undefined,
  );
  return offsets.map(([dr, dc]) => [pos[0] + dr, pos[1] + dc] as Offset);
}

/** Môi trường DSL của board: tên tập hợp, hằng số, và builtin riêng của engine. */
export function boardEnvironment(scene: Scene): DslEnvironment {
  const derived = deriveBoard(scene);

  return {
    bindings: {
      cells: derived.cells,
      tiles: derived.tiles,
      pieces: derived.pieces,
      regions: derived.regions,
      rows: derived.rows,
      cols: derived.cols,
    },
    builtins: {
      covered: (args, pos) => readBoolean(args, pos, 'covered', 'covered'),
      hole: (args, pos) => readBoolean(args, pos, 'hole', 'hole'),

      adjacent: (args, pos) => {
        const [a, b] = expectTwoElements(args, pos, 'adjacent');
        return (
          Math.abs(Number(a.props['row']) - Number(b.props['row'])) +
            Math.abs(Number(a.props['col']) - Number(b.props['col'])) ===
          1
        );
      },

      attacks: (args, pos) => {
        const [a, b] = expectTwoElements(args, pos, 'attacks');
        return attacks(a, b, derived);
      },
    },
  };
}

/**
 * Quân `aId` có ăn được `bId` trong scene này không.
 *
 * Validator `no-attacks` gọi hàm này thay vì tự cài lại luật đi quân: một luật,
 * một cách hiểu. Nếu validator và builtin `attacks()` của DSL cài riêng, sandbox
 * và invariant sẽ bất đồng ý kiến về cùng một thế cờ — và người học là người phát
 * hiện ra điều đó.
 */
export function piecesAttack(scene: Scene, aId: string, bId: string): boolean {
  const derived = deriveBoard(scene);
  const a = derived.pieces.find((p) => p.id === aId);
  const b = derived.pieces.find((p) => p.id === bId);
  return a && b ? attacks(a, b, derived) : false;
}

function readBoolean(
  args: readonly Value[],
  pos: number,
  fn: string,
  prop: string,
): boolean {
  const [target] = args;
  if (args.length !== 1 || !target || !isElement(target)) {
    throw new DslError(`${fn}() cần đúng một element`, pos);
  }
  return Boolean(target.props[prop]);
}

function expectTwoElements(
  args: readonly Value[],
  pos: number,
  fn: string,
): [ElementValue, ElementValue] {
  const [a, b] = args;
  if (args.length !== 2 || !a || !b || !isElement(a) || !isElement(b)) {
    throw new DslError(`${fn}() cần đúng hai element`, pos);
  }
  return [a, b];
}

/**
 * Quân `a` có ăn được `b` không, theo luật cờ vua.
 *
 * Xe/tượng/hậu bị **chặn tầm**: quân đứng giữa che đường. Không mô hình hoá chặn
 * tầm thì bài "8 quân hậu" vẫn đúng (hậu nào cũng chặn hậu nào), nhưng bài xe
 * kiểu "đặt xe sao cho không ăn nhau, được phép dùng vật cản" thì sai — và loại
 * bài đó có thật trong đề thi.
 */
function attacks(a: ElementValue, b: ElementValue, derived: BoardDerived): boolean {
  const ar = Number(a.props['row']);
  const ac = Number(a.props['col']);
  const br = Number(b.props['row']);
  const bc = Number(b.props['col']);

  if (a.id === b.id) return false;

  const dr = br - ar;
  const dc = bc - ac;
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);

  switch (String(a.props['kind'])) {
    case 'knight':
      return (adr === 1 && adc === 2) || (adr === 2 && adc === 1);

    case 'king':
      return adr <= 1 && adc <= 1;

    case 'pawn':
      // Quy ước: tốt đi lên (hàng giảm dần), ăn chéo.
      return dr === -1 && adc === 1;

    case 'rook':
      return (dr === 0 || dc === 0) && clearPath(ar, ac, br, bc, derived);

    case 'bishop':
      return adr === adc && clearPath(ar, ac, br, bc, derived);

    case 'queen':
      return (dr === 0 || dc === 0 || adr === adc) && clearPath(ar, ac, br, bc, derived);

    default:
      return false;
  }
}

function clearPath(
  ar: number,
  ac: number,
  br: number,
  bc: number,
  derived: BoardDerived,
): boolean {
  const stepR = Math.sign(br - ar);
  const stepC = Math.sign(bc - ac);
  const steps = Math.max(Math.abs(br - ar), Math.abs(bc - ac));

  const occupied = new Set(
    derived.pieces.map((p) => `${p.props['row']},${p.props['col']}`),
  );

  for (let i = 1; i < steps; i += 1) {
    if (occupied.has(`${ar + stepR * i},${ac + stepC * i}`)) return false;
  }
  return true;
}
