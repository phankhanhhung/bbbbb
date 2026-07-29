import type { HitTest, ScenePoint } from '@combviz/editor';
import type { Scene } from '@combviz/schema';
import { CELL, tileOffsets, type Offset } from './geometry.js';
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
  const [row, col] = pointToCell(point);

  const hits: string[] = [];

  // Duyệt ngược mảng: element vẽ sau nằm trên, nên nó được chạm trước.
  const ordered = [...scene.elements].sort((a, b) => (b.layer ?? 0) - (a.layer ?? 0));
  for (const element of ordered) {
    if (occupies(element, row, col)) hits.push(element.id);
  }

  if (
    config &&
    row >= 0 &&
    col >= 0 &&
    row < config.rows &&
    col < config.cols
  ) {
    hits.push(cellId(row, col));
  }

  return hits;
};

function occupies(
  element: Scene['elements'][number],
  row: number,
  col: number,
): boolean {
  if (element.type === 'tile') {
    return tileCells(element).some(([r, c]) => r === row && c === col);
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
 */
export function previewCells(
  shape: string,
  pos: Offset,
  rot: number,
  flip: boolean,
): Offset[] {
  return tileOffsets(shape, rot, flip, undefined).map(
    ([dr, dc]) => [pos[0] + dr, pos[1] + dc] as Offset,
  );
}
