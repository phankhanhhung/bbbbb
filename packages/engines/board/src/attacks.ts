import { CELL } from './geometry.js';
import type { Offset } from './geometry.js';

/**
 * Luật đi quân — **một cài đặt, ba nơi dùng**.
 *
 * Trước khi có file này, luật nằm trong `dsl.ts` và chỉ trả lời được câu hỏi
 * "quân A có ăn được quân B không". Overlay vùng khống chế (BD-02) hỏi câu khác
 * — "quân A khống chế những ô nào" — nên nó **không** dùng lại được, và kết quả
 * là `show_attacks` nằm trong schema từ M3 mà renderer bỏ qua hoàn toàn: đặt
 * `true` thì không có gì hiện ra và validate vẫn xanh.
 *
 * Cách chữa không phải là cài luật lần thứ hai cho renderer. Hai bản cài của
 * cùng một luật sẽ lệch nhau, và người phát hiện ra sẽ là học sinh nhìn thấy một
 * ô được tô là "bị khống chế" trong khi validator bảo không. Vì vậy luật sống ở
 * đây, dạng hình học thuần, và cả `attacks()` của DSL lẫn overlay đều hỏi nó.
 */
export interface AttackBoard {
  readonly rows: number;
  readonly cols: number;
  /** Ô có quân đứng, dạng `"r,c"` — dùng cho chặn tầm xe/tượng/hậu. */
  readonly occupied: ReadonlySet<string>;
}

const KNIGHT: readonly Offset[] = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
];

const KING: readonly Offset[] = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];

const ORTHOGONAL: readonly Offset[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAGONAL: readonly Offset[] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

/**
 * Những ô mà một quân ở `from` khống chế.
 *
 * Quân chặn tầm **vẫn bị khống chế**: một quân xe bị con mã chắn đường vẫn ăn
 * được chính con mã đó. Chỉ những ô *phía sau* nó mới thoát.
 */
export function attackedCells(
  kind: string,
  from: Offset,
  board: AttackBoard,
): Offset[] {
  const [r, c] = from;
  const inside = ([rr, cc]: Offset): boolean =>
    rr >= 0 && rr < board.rows && cc >= 0 && cc < board.cols;

  switch (kind) {
    case 'knight':
      return KNIGHT.map(([dr, dc]) => [r + dr, c + dc] as Offset).filter(inside);

    case 'king':
      return KING.map(([dr, dc]) => [r + dr, c + dc] as Offset).filter(inside);

    case 'pawn':
      // Quy ước: tốt đi lên (hàng giảm dần), ăn chéo.
      return ([[r - 1, c - 1], [r - 1, c + 1]] as Offset[]).filter(inside);

    case 'rook':
      return rays(from, ORTHOGONAL, board);

    case 'bishop':
      return rays(from, DIAGONAL, board);

    case 'queen':
      return [...rays(from, ORTHOGONAL, board), ...rays(from, DIAGONAL, board)];

    default:
      return [];
  }
}

/** Quân ở `from` có khống chế ô `target` không. */
export function attacksCell(
  kind: string,
  from: Offset,
  target: Offset,
  board: AttackBoard,
): boolean {
  if (from[0] === target[0] && from[1] === target[1]) return false;
  return attackedCells(kind, from, board).some(
    ([r, c]) => r === target[0] && c === target[1],
  );
}

function rays(
  from: Offset,
  directions: readonly Offset[],
  board: AttackBoard,
): Offset[] {
  const out: Offset[] = [];

  for (const [dr, dc] of directions) {
    let r = from[0] + dr;
    let c = from[1] + dc;
    while (r >= 0 && r < board.rows && c >= 0 && c < board.cols) {
      out.push([r, c]);
      if (board.occupied.has(`${r},${c}`)) break;
      r += dr;
      c += dc;
    }
  }

  return out;
}

/** Tâm của ô, trong toạ độ scene — dùng để đặt dấu overlay. */
export function cellCentre([r, c]: Offset): { x: number; y: number } {
  return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 };
}
