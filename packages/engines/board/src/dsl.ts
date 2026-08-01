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
import { cellColorClass, latticeOf, tileOffsets, type Offset } from './geometry.js';
import {
  cellsInRow,
  isLatticeShape,
  latticeTileCells,
  neighbours,
  wrapCell,
  wrapOf,
  type Lattice,
  type Wrap,
} from './lattice.js';
import { attacksCell, type AttackBoard } from './attacks.js';
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
  /** BD-11 — đường đi. Mỗi cái phơi `length` và `color_class`. */
  readonly paths: readonly ElementValue[];
  readonly rows: number;
  readonly cols: number;
  readonly lattice: Lattice;
  /** BD-05 — mép bàn có dán không. Quyết định `adjacent()` trả lời thế nào. */
  readonly wrap: Wrap;
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
  const lattice = latticeOf(config);
  const wrap = wrapOf(config);

  for (const item of scene.elements) {
    if (item.type !== 'tile') continue;
    const cells = tileCells(item, lattice, { rows, cols, wrap });
    occupancy.set(item.id, cells);
    for (const [r, c] of cells) coveredCells.add(`${r},${c}`);
  }

  const cells: ElementValue[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cellsInRow(lattice, cols, r); c += 1) {
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
        size: (occupancy.get(e.id) ?? []).length,
        color_class: Number(e.color_class ?? 0),
        // Hai họ hình mang **hai** bộ thuộc tính tư thế, và chỉ bộ đúng mới hiện
        // ra (BD-09). Quân trên lưới tam giác không có `rot` vì phép quay $90°$
        // không phải phép đối xứng của lưới ấy; trả về `rot: 0` cho nó là bịa ra
        // một con số đúng cú pháp và vô nghĩa — cùng lý do mà `xor`/`grundy` vắng
        // mặt ở game engine khi luật chơi không phải Nim.
        ...(isLatticeShape(String(e['shape']))
          ? { dir: Number(e['dir'] ?? 0) }
          : { rot: Number(e['rot'] ?? 0), flip: Boolean(e['flip']) }),
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

  // BD-11 — đường đi đọc được từ DSL bằng **độ dài** và màu. Không phơi cả dãy ô:
  // một `invariant` đọc "đường này đi qua ô (2,3)" là một phát biểu về *một* bài
  // chứ không phải một bất biến, và DSL chỉ nên nói những thứ đếm được.
  const paths = scene.elements
    .filter((e) => e.type === 'path')
    .map((e) =>
      element(e.id, {
        length: ((e['cells'] as Offset[] | undefined) ?? []).length,
        color_class: Number(e.color_class ?? 0),
      }),
    );

  return { cells, tiles, pieces, regions, paths, rows, cols, lattice, wrap, occupancy };
}

/**
 * Các ô mà một quân phủ.
 *
 * **Hai họ hình, một hàm** (BD-09). Polyomino là một tập offset tịnh tiến tới
 * `pos`; quân trên lưới phi vuông là một đường đi trên đồ thị kề, bắt đầu từ `pos`.
 * Hai mô hình khác nhau vì hai lưới khác nhau về toán — xem `LATTICE_SHAPES` — chứ
 * không phải vì lịch sử. Nhưng mọi thứ phía sau (validator chồng lấn, đếm phủ,
 * lệnh xoá) chỉ cần **tập ô**, nên chúng gặp nhau ở đúng đây và không chỗ nào khác
 * phải biết có hai họ.
 *
 * Cần `lattice` vì thế: một quân không còn tự mô tả được nếu không biết nó nằm trên
 * lưới nào. Và cần `board` để biết mép bàn có dán không (BD-05): trên bàn xuyến,
 * một quân thò qua mép **phải** vòng về mép trái, không phải nằm ngoài bàn.
 */
export function tileCells(
  item: SceneElement,
  lattice: Lattice = 'square',
  board?: { rows: number; cols: number; wrap: Wrap },
): readonly Offset[] {
  const pos = (item['pos'] as Offset) ?? [0, 0];
  const shape = String(item['shape']);

  const raw = isLatticeShape(shape)
    ? latticeTileCells(lattice, shape, Number(item['dir'] ?? 0), pos[0], pos[1])
    : tileOffsets(
        shape,
        Number(item['rot'] ?? 0),
        Boolean(item['flip']),
        item['offsets'] as Offset[] | undefined,
      ).map(([dr, dc]) => [pos[0] + dr, pos[1] + dc] as Offset);

  if (!board || board.wrap === 'none') return raw;

  // Ô vòng về vẫn là ô thật, nên `tiles-in-bounds` cho qua — đúng ý nghĩa của một
  // bàn dán mép. Ô rơi ra khỏi chiều **không** dán thì vẫn là tràn biên và giữ
  // nguyên toạ độ ngoài bàn, để validator còn chỉ ra được.
  return raw.map(
    ([r, c]) => wrapCell(lattice, board.rows, board.cols, board.wrap, r, c) ?? ([r, c] as Offset),
  );
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
      paths: derived.paths,
      rows: derived.rows,
      cols: derived.cols,
    },
    builtins: {
      covered: (args, pos) => readBoolean(args, pos, 'covered', 'covered'),
      hole: (args, pos) => readBoolean(args, pos, 'hole', 'hole'),

      /**
       * Hai ô có kề **cạnh** nhau không.
       *
       * Hỏi thẳng `lattice.ts` chứ không tự tính `|Δr| + |Δc| == 1`: công thức ấy
       * đúng cho lưới vuông và sai lặng lẽ cho hai lưới kia — trên bàn ong hai ô
       * kề nhau lệch cả hàng lẫn cột, trên lưới tam giác một ô chỉ có **ba** láng
       * giềng. Một biểu thức đếm cạnh sẽ ra con số hợp lý và sai.
       */
      adjacent: (args, pos) => {
        const [a, b] = expectTwoElements(args, pos, 'adjacent');
        const row = Number(a.props['row']);
        const col = Number(a.props['col']);
        return neighbours(
          derived.lattice,
          derived.rows,
          derived.cols,
          row,
          col,
          derived.wrap,
        ).some(
          ([r, c]) => r === Number(b.props['row']) && c === Number(b.props['col']),
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
 * Luật thật nằm ở `attacks.ts`; hàm này chỉ dịch từ ngôn ngữ của DSL
 * (`ElementValue`) sang ngôn ngữ hình học. Overlay BD-02 hỏi cùng một nguồn, nên
 * hình và validator không thể bất đồng ý kiến về một thế cờ.
 */
function attacks(a: ElementValue, b: ElementValue, derived: BoardDerived): boolean {
  if (a.id === b.id) return false;

  return attacksCell(
    String(a.props['kind']),
    [Number(a.props['row']), Number(a.props['col'])],
    [Number(b.props['row']), Number(b.props['col'])],
    attackBoard(derived),
  );
}

/** Bàn cờ dạng mà luật đi quân cần: kích thước + ô có quân đứng. */
export function attackBoard(derived: BoardDerived): AttackBoard {
  return {
    rows: derived.rows,
    cols: derived.cols,
    occupied: new Set(derived.pieces.map((p) => `${p.props['row']},${p.props['col']}`)),
  };
}

