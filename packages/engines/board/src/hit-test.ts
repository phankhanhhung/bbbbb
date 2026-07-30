import type { HitTest, ScenePoint } from '@combviz/editor';
import type { Scene } from '@combviz/schema';
import { CELL, latticeOf, tileOffsets, type Offset } from './geometry.js';
import {
  cellAt,
  isLatticeShape,
  latticeTileCells,
  wrapOf,
  type Lattice,
  type Wrap,
} from './lattice.js';
import { cellId } from './ids.js';
import { tileCells } from './dsl.js';
import type { BoardConfig } from './schema.js';

/**
 * Đổi một điểm trong hệ toạ độ scene sang toạ độ ô.
 *
 * `Math.floor` chứ không `Math.round`: ô (0,0) trải từ 0 đến 10, nên điểm 9.9
 * vẫn thuộc ô 0. Làm tròn sẽ khiến nửa sau của mỗi ô nhận nhầm sang ô kế tiếp —
 * loại lỗi mà người dùng cảm thấy là "canvas lệch một ô" chứ không mô tả được.
 */
export function pointToCell(point: ScenePoint): Offset {
  return [Math.floor(point.y / CELL), Math.floor(point.x / CELL)];
}

export function cellToPoint([row, col]: Offset): ScenePoint {
  return { x: col * CELL, y: row * CELL };
}

/**
 * Element nằm dưới một điểm, **trên trước dưới sau**.
 *
 * Quân và tile được xét trước ô: người dùng chạm vào quân domino thì họ muốn
 * chọn quân, không phải ô nằm dưới nó. Ô luôn là phần tử cuối cùng trong danh
 * sách nên UI có thể lấy phần tử đầu để chọn, mà vẫn biết mình đang ở ô nào.
 */
export const boardHitTest: HitTest = (scene: Scene, point: ScenePoint): string[] => {
  const config = scene.config as BoardConfig;

  // Ô nằm dưới con trỏ đọc từ `lattice.ts` — cùng module mà renderer dùng để đặt
  // ô. Chia lấy nguyên theo `CELL` chỉ đúng cho lưới vuông; trên bàn ong nó lệch
  // dần theo hàng, và người dùng chỉ mô tả được thành "canvas chạm lệch".
  const cell = config
    ? cellAt(latticeOf(config), config.rows, config.cols, point)
    : pointToCell(point);
  const [row, col] = cell ?? [-1, -1];

  const hits: string[] = [];
  const lattice = latticeOf(config);
  const board = { rows: config?.rows ?? 0, cols: config?.cols ?? 0, wrap: wrapOf(config) };

  // Duyệt ngược mảng: element vẽ sau nằm trên, nên nó được chạm trước.
  const ordered = [...scene.elements].sort((a, b) => (b.layer ?? 0) - (a.layer ?? 0));
  for (const element of ordered) {
    if (occupies(element, lattice, board, row, col)) hits.push(element.id);
  }

  if (cell !== null && row >= 0 && col >= 0) hits.push(cellId(row, col));

  return hits;
};

function occupies(
  element: Scene['elements'][number],
  lattice: Lattice,
  board: { rows: number; cols: number; wrap: Wrap },
  row: number,
  col: number,
): boolean {
  if (element.type === 'tile') {
    return tileCells(element, lattice, board).some(([r, c]) => r === row && c === col);
  }

  if (element.type === 'piece') {
    const pos = element['pos'] as Offset | undefined;
    return pos?.[0] === row && pos?.[1] === col;
  }

  if (element.type === 'region') {
    const cells = (element['cells'] as Offset[] | undefined) ?? [];
    return cells.some(([r, c]) => r === row && c === col);
  }

  return false;
}

/**
 * Ô mà một tile sẽ phủ nếu đặt ở `pos` — dùng để vẽ bóng xem trước khi kéo thả.
 *
 * Nhận `lattice` vì với quân lưới phi vuông, bóng xem trước **đổi hình** theo ô
 * đang trỏ tới: cùng một hình thoi rê qua tam giác hướng lên và tam giác hướng
 * xuống cho ra hai hình khác nhau. Đó chính là thứ người học cần thấy trước khi
 * thả (BD-09).
 */
export function previewCells(
  shape: string,
  pos: Offset,
  rot: number,
  flip: boolean,
  lattice: Lattice = 'square',
  dir = 0,
): Offset[] {
  if (isLatticeShape(shape)) {
    return [...latticeTileCells(lattice, shape, dir, pos[0], pos[1])];
  }
  return tileOffsets(shape, rot, flip, undefined).map(
    ([dr, dc]) => [pos[0] + dr, pos[1] + dc] as Offset,
  );
}
