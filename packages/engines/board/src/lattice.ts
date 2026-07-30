import { CELL } from './geometry.js';
import type { Offset } from './geometry.js';

/**
 * Lưới ô của bàn (BD-07).
 *
 * **Vì sao cần.** Trước hạng mục này, board chỉ vẽ được lưới **vuông**, nên cả họ
 * bài phủ hình phi vuông — tam giác đều chia thành tam giác đơn vị, bàn ong lục
 * giác — không có cách nào vẽ. Đó là khoảng trống lớn nhất còn lại của engine được
 * dùng nhiều nhất trong kho.
 *
 * **Nguyên tắc: đổi hình ô, không đổi toạ độ.** Ô vẫn định danh bằng `(hàng, cột)`
 * và vẫn mang id `cell-<r>-<c>`, nên `holes`, `cell_overrides`, anchor, region,
 * validator và DSL không phải biết gì về lưới. Chỗ **duy nhất** biết là module
 * này: nó trả về đa giác của một ô, tâm ô, và ô nằm dưới một điểm. Thêm một lưới
 * thứ tư về sau là thêm một nhánh ở đây, không phải sửa mười chỗ.
 *
 * **Quy ước G-10 giữ nguyên** ở cả ba lưới: khoảng cách ngang giữa hai tâm ô kề
 * nhau luôn là `CELL` = 10 đơn vị. Nhờ vậy một bàn vuông 8×8 và một bàn ong 8×8
 * ra cùng cỡ trên màn hình, và lớp `scale.ts` không phải biết engine đang vẽ lưới
 * gì.
 */
export type Lattice = 'square' | 'hex' | 'triangle';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Chiều cao một hàng tam giác đều cạnh `CELL`. */
const TRI_H = (CELL * Math.sqrt(3)) / 2;

/**
 * Bán kính ngoại tiếp của lục giác **đỉnh nhọn hướng lên**.
 *
 * Bề ngang (cạnh phẳng tới cạnh phẳng) đúng bằng `CELL`, nên $R = CELL/\sqrt3$ và
 * chiều cao là $2R \approx 1{,}155\,CELL$. Chọn theo bề **ngang** chứ không theo
 * chiều cao là có lý do: G-10 nói "khoảng cách ngang giữa hai ô kề nhau", và ở
 * lưới lục giác hai ô kề ngang cách nhau đúng một bề ngang.
 */
const HEX_R = CELL / Math.sqrt(3);

/** Khoảng cách giữa hai hàng lục giác. */
const HEX_ROW = HEX_R * 1.5;

/**
 * Số ô của một hàng.
 *
 * Lưới tam giác là chỗ duy nhất con số này **đổi theo hàng**: tam giác cạnh $n$
 * có hàng $r$ gồm $2r+1$ ô — $r+1$ ô hướng lên xen $r$ ô hướng xuống. Cộng lại
 * đúng $n^2$ ô, nên `rows × cols` với `cols = rows` vẫn đếm đúng số ô và trần
 * `maxCells` không phải biết gì thêm.
 */
export function cellsInRow(lattice: Lattice, cols: number, row: number): number {
  return lattice === 'triangle' ? 2 * row + 1 : cols;
}

/** Tổng số ô của bàn. */
export function cellCount(lattice: Lattice, rows: number, cols: number): number {
  if (lattice !== 'triangle') return rows * cols;
  return rows * rows;
}

/** Ô $(r,c)$ có nằm trên bàn không. */
export function inBoard(
  lattice: Lattice,
  rows: number,
  cols: number,
  row: number,
  col: number,
): boolean {
  return row >= 0 && col >= 0 && row < rows && col < cellsInRow(lattice, cols, row);
}

/** Hoành độ mép trái của hàng `row` trên lưới tam giác. */
function triRowLeft(rows: number, row: number): number {
  return ((rows - 1 - row) * CELL) / 2;
}

/**
 * Đa giác của một ô, theo thứ tự vòng quanh.
 *
 * Mọi thứ khác — vẽ ô, đường bao region, tâm ô — đọc từ đây. Một ô có **một** hình
 * dạng, khai ở một chỗ.
 */
export function cellPolygon(
  lattice: Lattice,
  rows: number,
  cols: number,
  row: number,
  col: number,
): readonly Point[] {
  if (lattice === 'square') {
    const x = col * CELL;
    const y = row * CELL;
    return [
      { x, y },
      { x: x + CELL, y },
      { x: x + CELL, y: y + CELL },
      { x, y: y + CELL },
    ];
  }

  if (lattice === 'hex') {
    const { x, y } = centreOf(lattice, rows, cols, row, col);
    const half = CELL / 2;
    return [
      { x, y: y - HEX_R },
      { x: x + half, y: y - HEX_R / 2 },
      { x: x + half, y: y + HEX_R / 2 },
      { x, y: y + HEX_R },
      { x: x - half, y: y + HEX_R / 2 },
      { x: x - half, y: y - HEX_R / 2 },
    ];
  }

  // Tam giác: ô chẵn hướng **lên**, ô lẻ hướng **xuống**.
  const j = Math.floor(col / 2);
  const left = triRowLeft(rows, row);
  const top = row * TRI_H;
  const bottom = top + TRI_H;

  if (col % 2 === 0) {
    return [
      { x: left + j * CELL, y: bottom },
      { x: left + (j + 1) * CELL, y: bottom },
      { x: left + (j + 0.5) * CELL, y: top },
    ];
  }

  return [
    { x: left + (j + 0.5) * CELL, y: top },
    { x: left + (j + 1.5) * CELL, y: top },
    { x: left + (j + 1) * CELL, y: bottom },
  ];
}

/** Tâm ô — trọng tâm đa giác. Chỗ đặt quân, glyph, dấu khống chế. */
export function centreOf(
  lattice: Lattice,
  rows: number,
  cols: number,
  row: number,
  col: number,
): Point {
  if (lattice === 'square') {
    return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
  }

  if (lattice === 'hex') {
    // Hàng lẻ đẩy sang phải nửa ô — quy ước "odd-r offset", cùng quy ước mà mọi
    // tài liệu về lưới lục giác dùng.
    const shift = row % 2 === 0 ? 0 : CELL / 2;
    return { x: col * CELL + shift + CELL / 2, y: row * HEX_ROW + HEX_R };
  }

  const poly = cellPolygon(lattice, rows, cols, row, col);
  return {
    x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
    y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
  };
}

/** Khung bao nội dung của cả bàn, chưa kể lề. */
export function latticeExtent(
  lattice: Lattice,
  rows: number,
  cols: number,
): { width: number; height: number } {
  if (lattice === 'square') return { width: cols * CELL, height: rows * CELL };
  if (lattice === 'hex') {
    // Hàng lẻ thò ra nửa ô bên phải; chỉ cộng khi thật sự có hàng lẻ.
    const jag = rows > 1 ? CELL / 2 : 0;
    return { width: cols * CELL + jag, height: (rows - 1) * HEX_ROW + 2 * HEX_R };
  }
  return { width: rows * CELL, height: rows * TRI_H };
}

/**
 * Ô nằm dưới một điểm, hoặc `null` nếu điểm rơi ngoài bàn.
 *
 * Ba lưới, ba cách, và mỗi cách là cách **đúng** chứ không phải cách gần đúng:
 *
 *   - vuông: chia lấy nguyên;
 *   - lục giác: **tâm gần nhất**. Lưới lục giác đều đúng là sơ đồ Voronoi của các
 *     tâm, nên "gần tâm nào nhất" không phải xấp xỉ — nó là định nghĩa của ô;
 *   - tam giác: toạ độ trong ô, rồi so với hai cạnh xiên.
 */
export function cellAt(
  lattice: Lattice,
  rows: number,
  cols: number,
  point: Point,
): Offset | null {
  if (lattice === 'square') {
    const row = Math.floor(point.y / CELL);
    const col = Math.floor(point.x / CELL);
    return inBoard(lattice, rows, cols, row, col) ? [row, col] : null;
  }

  if (lattice === 'hex') {
    const guess = Math.round((point.y - HEX_R) / HEX_ROW);
    let best: Offset | null = null;
    let bestDistance = Infinity;

    for (let row = guess - 1; row <= guess + 1; row += 1) {
      if (row < 0 || row >= rows) continue;
      const shift = row % 2 === 0 ? 0 : CELL / 2;
      const near = Math.round((point.x - shift - CELL / 2) / CELL);
      for (let col = near - 1; col <= near + 1; col += 1) {
        if (!inBoard(lattice, rows, cols, row, col)) continue;
        const centre = centreOf(lattice, rows, cols, row, col);
        const d = (centre.x - point.x) ** 2 + (centre.y - point.y) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = [row, col];
        }
      }
    }

    // Ngoài bàn hẳn thì không trả ô nào: tâm gần nhất luôn tồn tại, nên phải
    // chặn bằng bán kính, không thì chạm cách bàn nửa màn hình vẫn "trúng" ô mép.
    return best !== null && bestDistance <= HEX_R * HEX_R ? best : null;
  }

  const row = Math.floor(point.y / TRI_H);
  if (row < 0 || row >= rows) return null;

  const u = (point.x - triRowLeft(rows, row)) / CELL;
  const j = Math.floor(u);
  const inCell = u - j;
  const v = point.y / TRI_H - row;

  // Trong ô đơn vị $[0,1)^2$, tam giác hướng lên chiếm phần $v \ge |2u-1|$; phần
  // còn lại thuộc tam giác hướng xuống bên trái hoặc bên phải.
  const col =
    v >= Math.abs(2 * inCell - 1) ? 2 * j : inCell < 0.5 ? 2 * j - 1 : 2 * j + 1;

  return inBoard(lattice, rows, cols, row, col) ? [row, col] : null;
}

/**
 * Ô kề cạnh với $(r,c)$.
 *
 * Dùng cho builtin `adjacent()` của DSL. Trước BD-07 nó là một dòng
 * `|Δr| + |Δc| == 1` viết thẳng trong `dsl.ts` — đúng cho lưới vuông và **sai
 * lặng lẽ** cho hai lưới kia: trên lưới ong, hai ô kề nhau có thể lệch cả hàng lẫn
 * cột, còn trên lưới tam giác thì một ô chỉ có **ba** láng giềng chứ không phải
 * bốn. Một biểu thức đếm cạnh sẽ ra một con số hợp lý và sai.
 */
export function neighbours(
  lattice: Lattice,
  rows: number,
  cols: number,
  row: number,
  col: number,
): readonly Offset[] {
  const candidates: Offset[] = [];

  if (lattice === 'square') {
    candidates.push([row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]);
  } else if (lattice === 'hex') {
    // "odd-r": hàng lẻ lệch phải, nên chỉ số cột của hai ô trên/dưới đổi theo
    // tính chẵn lẻ của hàng.
    const d = row % 2 === 0 ? -1 : 0;
    candidates.push(
      [row, col - 1],
      [row, col + 1],
      [row - 1, col + d],
      [row - 1, col + d + 1],
      [row + 1, col + d],
      [row + 1, col + d + 1],
    );
  } else if (col % 2 === 0) {
    // Tam giác hướng lên: hai ô cạnh bên, và ô hướng xuống ngay **dưới** nó.
    candidates.push([row, col - 1], [row, col + 1], [row + 1, col + 1]);
  } else {
    candidates.push([row, col - 1], [row, col + 1], [row - 1, col - 1]);
  }

  return candidates.filter(([r, c]) => inBoard(lattice, rows, cols, r, c));
}

/**
 * Số **hướng đi** của một lưới (BD-09).
 *
 * Khác số láng giềng ở chỗ nó không đổi theo ô: ô mép bàn vẫn có đủ ngần này
 * hướng, chỉ là đi theo vài hướng thì ra ngoài bàn. Quân ghép cần con số **cố
 * định** ấy — nếu chỉ số hướng trượt theo vị trí thì xoay một quân ở giữa bàn và
 * xoay đúng quân ấy ở góc sẽ ra hai hình khác nhau.
 */
export function directionCount(lattice: Lattice): number {
  return lattice === 'square' ? 4 : lattice === 'hex' ? 6 : 3;
}

/**
 * Ô kề theo **hướng hình học** `dir`, **không** lọc biên (BD-09).
 *
 * Thứ tự hướng là thứ tự vòng quanh, để `dir + 1` luôn là "quay một nấc":
 *
 *   - vuông: $0$ đông, $1$ nam, $2$ tây, $3$ bắc;
 *   - lục giác: $0$ đông, rồi vòng theo chiều kim đồng hồ tới $5$ đông-bắc;
 *   - tam giác: $0$ tây, $1$ đông, $2$ **qua cạnh ngang** — xuống nếu ô hướng lên,
 *     lên nếu ô hướng xuống. Chỉ có ba hướng, và hướng $2$ tự nghịch đảo.
 *
 * Đây là chỗ `neighbours()` không thay được: nó **lọc** ô ngoài bàn, nên chỉ số
 * trong danh sách trả về xê dịch theo vị trí ô.
 */
export function step(lattice: Lattice, row: number, col: number, dir: number): Offset {
  if (lattice === 'square') {
    const table: readonly Offset[] = [
      [row, col + 1],
      [row + 1, col],
      [row, col - 1],
      [row - 1, col],
    ];
    return table[((dir % 4) + 4) % 4] as Offset;
  }

  if (lattice === 'hex') {
    // "odd-r": hàng lẻ lệch phải, nên chỉ số cột của bốn ô chéo đổi theo tính chẵn
    // lẻ của hàng — cùng công thức mà `neighbours()` dùng, viết lại theo hướng.
    const d = row % 2 === 0 ? -1 : 0;
    const table: readonly Offset[] = [
      [row, col + 1],
      [row + 1, col + d + 1],
      [row + 1, col + d],
      [row, col - 1],
      [row - 1, col + d],
      [row - 1, col + d + 1],
    ];
    return table[((dir % 6) + 6) % 6] as Offset;
  }

  const up = col % 2 === 0;
  const table: readonly Offset[] = [
    [row, col - 1],
    [row, col + 1],
    up ? [row + 1, col + 1] : [row - 1, col - 1],
  ];
  return table[((dir % 3) + 3) % 3] as Offset;
}

/**
 * Hướng ngược lại — hướng đưa ta về chỗ cũ.
 *
 * Trên lưới tam giác, hướng $2$ **là** hướng ngược của chính nó: đi qua cạnh ngang
 * từ ô hướng lên thì tới ô hướng xuống, và đi tiếp cùng hướng ấy thì về lại. Đó
 * không phải trường hợp đặc biệt phải nhớ — nó là hệ quả của việc lưới tam giác có
 * hai loại ô, và là bất biến mà test ép: `step(step(x, d), opposite(d)) == x` với
 * **mọi** ô và mọi hướng ở cả ba lưới.
 */
export function oppositeDirection(lattice: Lattice, dir: number): number {
  const n = directionCount(lattice);
  const d = ((dir % n) + n) % n;
  if (lattice === 'square') return (d + 2) % 4;
  if (lattice === 'hex') return (d + 3) % 6;
  return d === 2 ? 2 : 1 - d;
}

/**
 * Quân ghép trên lưới **phi vuông** (BD-09).
 *
 * **Vì sao không dùng lại `TILE_SHAPES`.** Mô hình polyomino là "một tập offset
 * $(\Delta r, \Delta c)$, tịnh tiến tới `pos`, xoay $90°$". Cả ba mệnh đề đó đều
 * hỏng ngay khi rời lưới vuông:
 *
 *   - **Tịnh tiến không bảo toàn hình.** Trên lưới tam giác, ô cột chẵn hướng lên
 *     còn ô cột lẻ hướng xuống. Cùng một tập offset đặt ở hai ô khác tính chẵn lẻ
 *     cho ra hai hình **khác nhau** — nên offset không mô tả được một quân.
 *   - **$90°$ không phải phép đối xứng của lưới.** Nhóm đối xứng của lưới tam giác
 *     quay $60°$, của lưới lục giác cũng vậy. Xoay một hình thoi đi $90°$ cho ra
 *     một hình **không nằm trên lưới nào cả**. Vì thế quân ở đây mang `dir` chứ
 *     không mang `rot`, và đó là khác biệt về toán, không phải về đặt tên.
 *
 * **Mô hình thay thế: đi bộ trên đồ thị kề.** Một hình là một **đường đi** — bắt
 * đầu ở ô neo, rồi mỗi bước rẽ theo một hướng *tương đối* so với `dir`. Nhờ vậy
 * hình luôn gồm những ô có thật và luôn liền nhau, ở bất kỳ ô neo nào, trên bất kỳ
 * lưới nào. Hình học vẫn nằm trọn trong `lattice.ts`.
 *
 * Bảng này cố tình **ngắn**: chỉ có hình mà kho đang cần. Thêm một hình là thêm
 * một dòng ở đây, không phải sửa renderer, validator hay tập lệnh.
 */
export interface LatticeShape {
  /** Lưới mà hình này có nghĩa. Đặt lên lưới khác là lỗi, không phải là vẽ méo. */
  readonly lattice: Lattice;
  /**
   * Các bước đi, tính bằng **độ lệch hướng** so với `dir`.
   *
   * Rỗng nghĩa là hình một ô. `[0]` nghĩa là "đi một bước theo đúng `dir`".
   */
  readonly walk: readonly number[];
  readonly label: string;
}

export const LATTICE_SHAPES: Readonly<Record<string, LatticeShape>> = {
  /**
   * Hình thoi — **hai** tam giác kề cạnh.
   *
   * Ba hướng cho ba hình thoi, và đó là toàn bộ: một tam giác có đúng ba cạnh, nên
   * đúng ba hình thoi chứa nó. Không thiếu tư thế nào, không thừa tư thế nào.
   */
  lozenge: { lattice: 'triangle', walk: [0], label: 'hình thoi' },
};

/**
 * Các ô mà một quân trên lưới phi vuông phủ.
 *
 * Trả về mảng **rỗng** khi hình không tồn tại hoặc đặt sai lưới — cùng cách mà
 * `tileOffsets` xử lý hình lạ. Ô nằm ngoài bàn vẫn trả về: chặn biên là việc của
 * validator `tiles-in-bounds` (SBX-02), không phải việc của hình học.
 */
export function latticeTileCells(
  lattice: Lattice,
  shape: string,
  dir: number,
  row: number,
  col: number,
): readonly Offset[] {
  if (!Object.hasOwn(LATTICE_SHAPES, shape)) return [];
  const spec = LATTICE_SHAPES[shape] as LatticeShape;
  if (spec.lattice !== lattice) return [];

  const n = directionCount(lattice);
  const cells: Offset[] = [[row, col]];
  let cursor: Offset = [row, col];

  for (const turn of spec.walk) {
    const d = (((dir + turn) % n) + n) % n;
    cursor = step(lattice, cursor[0], cursor[1], d);
    cells.push(cursor);
  }

  return cells;
}

/** Hình quân có phải hình của lưới phi vuông không. */
export function isLatticeShape(shape: string): boolean {
  return Object.hasOwn(LATTICE_SHAPES, shape);
}

/**
 * Đường bao ngoài của một tập ô: cạnh nào chỉ thuộc **một** ô thì giữ.
 *
 * Cùng ý tưởng với `outlinePath` của polyomino, nhưng phát biểu trên đa giác nên
 * nó đúng cho cả ba lưới. Hai hàm cùng tồn tại là có chủ ý — `outlinePath` chạy
 * trên *offset* của một quân chưa đặt, hàm này chạy trên *ô* của một bàn cụ thể —
 * và có test ép chúng cho ra **cùng một** hình trên lưới vuông, để "hai bản cài
 * đặt" không lặng lẽ trôi khỏi nhau.
 */
export function outlineOfCells(
  lattice: Lattice,
  rows: number,
  cols: number,
  cells: readonly Offset[],
): string {
  const seen = new Map<string, { from: Point; to: Point; count: number }>();

  for (const [row, col] of cells) {
    if (!inBoard(lattice, rows, cols, row, col)) continue;
    const poly = cellPolygon(lattice, rows, cols, row, col);
    poly.forEach((from, i) => {
      const to = poly[(i + 1) % poly.length] as Point;
      const key = edgeKey(from, to);
      const hit = seen.get(key);
      if (hit) hit.count += 1;
      else seen.set(key, { from, to, count: 1 });
    });
  }

  return [...seen.values()]
    .filter((edge) => edge.count === 1)
    .map((edge) => `M${r3(edge.from.x)} ${r3(edge.from.y)}L${r3(edge.to.x)} ${r3(edge.to.y)}`)
    .join('');
}

/** Khoá của một cạnh, **không** phân biệt chiều: hai ô kề đi ngược chiều nhau. */
function edgeKey(a: Point, b: Point): string {
  const one = `${r3(a.x)},${r3(a.y)}`;
  const two = `${r3(b.x)},${r3(b.y)}`;
  return one < two ? `${one}|${two}` : `${two}|${one}`;
}

function r3(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}
