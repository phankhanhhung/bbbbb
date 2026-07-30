import type { BoardConfig, ColoringPreset } from './schema.js';
import { cellId } from './ids.js';
import { UNITS_PER_CELL } from '@combviz/render';

/** Cạnh một ô, tính bằng đơn vị toạ độ scene. */
/**
 * Đơn vị gốc, lấy từ **một** chỗ (G-10).
 *
 * Trước đây bảy engine mỗi cái tự khai `= 10`. Bảy bản sao của một quy ước là bảy
 * chỗ có thể lệch, và quy ước này lệch một cái là cả hình đổi cỡ — đúng thứ vừa
 * phải sửa ở M20. Nay nó là một hằng số, và engine thứ tám không có cách nào chọn
 * số khác mà vẫn trông như đang theo quy ước.
 */
export const CELL = UNITS_PER_CELL;

/** Lề quanh bàn, để viền nhấn mạnh và nhãn không bị cắt. */
export const BOARD_PADDING = 4;

export type Offset = readonly [number, number];

/**
 * Hình dạng polyomino ở tư thế chuẩn (rot 0, chưa lật).
 *
 * Toạ độ là (hàng, cột) tương đối so với `pos` của tile.
 */
export const TILE_SHAPES: Readonly<Record<string, readonly Offset[]>> = {
  domino: [[0, 0], [0, 1]],
  'tromino-i': [[0, 0], [0, 1], [0, 2]],
  'tromino-l': [[0, 0], [0, 1], [1, 0]],
  'tetromino-i': [[0, 0], [0, 1], [0, 2], [0, 3]],
  'tetromino-o': [[0, 0], [0, 1], [1, 0], [1, 1]],
  'tetromino-t': [[0, 0], [0, 1], [0, 2], [1, 1]],
  'tetromino-s': [[0, 1], [0, 2], [1, 0], [1, 1]],
  'tetromino-l': [[0, 0], [1, 0], [2, 0], [2, 1]],
};

/**
 * Tư thế thật của một tile sau khi xoay và lật.
 *
 * Chuẩn hoá về gốc (0,0) sau mỗi phép biến đổi, để `pos` luôn có nghĩa là "ô trên
 * cùng bên trái của khung bao" bất kể xoay thế nào. Không chuẩn hoá thì xoay một
 * quân tại chỗ sẽ khiến nó nhảy sang chỗ khác — đúng loại bug mà tác giả phát
 * hiện bằng cách nhìn thấy hình sai chứ không ai báo.
 */
export function tileOffsets(
  shape: string,
  rot: number,
  flip: boolean,
  custom?: readonly Offset[],
): readonly Offset[] {
  const base = shape === 'custom' ? (custom ?? []) : (TILE_SHAPES[shape] ?? []);
  if (base.length === 0) return [];

  let offsets: Offset[] = base.map(([r, c]) => [r, c] as Offset);

  if (flip) offsets = normalize(offsets.map(([r, c]) => [r, -c] as Offset));

  const turns = (((rot / 90) % 4) + 4) % 4;
  for (let i = 0; i < turns; i += 1) {
    // Xoay 90° thuận chiều kim đồng hồ: (r, c) → (c, −r).
    offsets = normalize(offsets.map(([r, c]) => [c, -r] as Offset));
  }

  return offsets;
}

function normalize(offsets: readonly Offset[]): Offset[] {
  const minR = Math.min(...offsets.map(([r]) => r));
  const minC = Math.min(...offsets.map(([, c]) => c));
  return offsets.map(([r, c]) => [r - minR, c - minC] as Offset);
}

/**
 * Đường bao ngoài của một polyomino: các cạnh không giáp ô nào khác của chính nó.
 *
 * Nhờ vậy quân domino trông như **một** vật thể chứ như hai ô vuông cạnh nhau —
 * khác biệt nhỏ về hình nhưng lớn về nghĩa, vì cả lập luận của bài xoay quanh
 * chuyện một quân phủ hai ô.
 */
export function outlinePath(offsets: readonly Offset[]): string {
  const inside = new Set(offsets.map(([r, c]) => `${r},${c}`));
  const has = (r: number, c: number): boolean => inside.has(`${r},${c}`);
  const segments: string[] = [];

  for (const [r, c] of offsets) {
    const x = c * CELL;
    const y = r * CELL;
    if (!has(r - 1, c)) segments.push(`M${x} ${y}L${x + CELL} ${y}`);
    if (!has(r + 1, c)) segments.push(`M${x} ${y + CELL}L${x + CELL} ${y + CELL}`);
    if (!has(r, c - 1)) segments.push(`M${x} ${y}L${x} ${y + CELL}`);
    if (!has(r, c + 1)) segments.push(`M${x + CELL} ${y}L${x + CELL} ${y + CELL}`);
  }

  return segments.join('');
}

/**
 * `color_class` của một ô: preset trước, `cell_overrides` đè lên.
 *
 * Preset là công cụ chứng minh chủ lực của dạng tiling (BD-01) nên nó phải là
 * first-class chứ không phải "tô tay cho nhanh": bàn 8×8 tô xen kẽ là **một dòng
 * config**, không phải 64 dòng dữ liệu.
 */
export function cellColorClass(
  config: BoardConfig,
  row: number,
  col: number,
): number | undefined {
  const override = config.cell_overrides?.[cellId(row, col)];
  if (override?.color_class !== undefined) return override.color_class;
  if (!config.coloring_preset) return undefined;
  return presetColorClass(config.coloring_preset, row, col);
}

function presetColorClass(preset: ColoringPreset, row: number, col: number): number {
  if (preset.type === 'checkerboard') {
    const phase = preset.phase ?? 0;
    return (row + col + phase) % 2 === 0 ? 1 : 2;
  }

  const { k, orientation } = preset;
  const phase = preset.phase ?? 0;
  const index =
    orientation === 'row'
      ? row
      : orientation === 'col'
        ? col
        : orientation === 'diag-right'
          ? row + col
          : row - col;

  return (((index + phase) % k) + k) % k + 1;
}
