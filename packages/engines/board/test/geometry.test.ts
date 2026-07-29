import { describe, expect, it } from 'vitest';
import { cellColorClass, outlinePath, tileOffsets } from '../src/geometry.js';
import type { BoardConfig } from '../src/schema.js';

describe('tileOffsets', () => {
  it('xoay domino 90° thành đứng', () => {
    expect(tileOffsets('domino', 90, false)).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it('xoay 360° về đúng tư thế ban đầu', () => {
    expect(tileOffsets('tromino-l', 360, false)).toEqual(tileOffsets('tromino-l', 0, false));
  });

  it('chuẩn hoá về gốc sau mỗi phép xoay', () => {
    // Không chuẩn hoá thì xoay một quân tại chỗ sẽ khiến nó nhảy sang chỗ khác,
    // và `pos` mất nghĩa "ô trên cùng bên trái của khung bao".
    for (const rot of [0, 90, 180, 270]) {
      const offsets = tileOffsets('tromino-l', rot, false);
      expect(Math.min(...offsets.map(([r]) => r))).toBe(0);
      expect(Math.min(...offsets.map(([, c]) => c))).toBe(0);
    }
  });

  it('lật tromino-l cho hình khác với chính nó', () => {
    expect(tileOffsets('tromino-l', 0, true)).not.toEqual(
      tileOffsets('tromino-l', 0, false),
    );
  });

  it('giữ nguyên số ô qua mọi phép biến đổi', () => {
    for (const rot of [0, 90, 180, 270]) {
      for (const flip of [false, true]) {
        expect(tileOffsets('tetromino-s', rot, flip)).toHaveLength(4);
      }
    }
  });

  it('tile custom dùng offsets khai trong file', () => {
    expect(tileOffsets('custom', 0, false, [[0, 0], [2, 2]])).toEqual([
      [0, 0],
      [2, 2],
    ]);
  });
});

describe('outlinePath', () => {
  it('domino cho đường bao 6 cạnh, không phải 8', () => {
    // Hai ô cạnh nhau chia nhau một cạnh trong; nếu cạnh đó lọt vào đường bao thì
    // quân domino trông như hai ô vuông rời — hỏng đúng cái nghĩa mà cả bài dựa
    // vào (một quân phủ hai ô).
    const segments = outlinePath(tileOffsets('domino', 0, false)).match(/M/g) ?? [];
    expect(segments).toHaveLength(6);
  });

  it('ô đơn cho đúng 4 cạnh', () => {
    expect((outlinePath([[0, 0]]).match(/M/g) ?? [])).toHaveLength(4);
  });
});

describe('cellColorClass', () => {
  const board: BoardConfig = { rows: 8, cols: 8 };

  it('checkerboard cho hai ô góc đối nhau cùng màu', () => {
    const config = { ...board, coloring_preset: { type: 'checkerboard' } } as BoardConfig;

    // Đây chính là mấu chốt của bài bàn cờ khuyết hai góc.
    expect(cellColorClass(config, 0, 0)).toBe(cellColorClass(config, 7, 7));
    expect(cellColorClass(config, 0, 0)).not.toBe(cellColorClass(config, 0, 1));
  });

  it('phase đảo màu checkerboard', () => {
    const a = { ...board, coloring_preset: { type: 'checkerboard' } } as BoardConfig;
    const b = {
      ...board,
      coloring_preset: { type: 'checkerboard', phase: 1 },
    } as BoardConfig;

    expect(cellColorClass(a, 0, 0)).not.toBe(cellColorClass(b, 0, 0));
  });

  it('sọc chéo k màu lặp đúng chu kỳ', () => {
    const config = {
      ...board,
      coloring_preset: { type: 'stripes', orientation: 'diag-right', k: 3 },
    } as BoardConfig;

    expect(cellColorClass(config, 0, 0)).toBe(cellColorClass(config, 0, 3));
    expect(cellColorClass(config, 0, 0)).not.toBe(cellColorClass(config, 0, 1));
  });

  it('sọc chéo trái không cho color_class âm', () => {
    const config = {
      ...board,
      coloring_preset: { type: 'stripes', orientation: 'diag-left', k: 3 },
    } as BoardConfig;

    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const value = cellColorClass(config, r, c);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(3);
      }
    }
  });

  it('cell_overrides đè lên preset', () => {
    const config = {
      ...board,
      coloring_preset: { type: 'checkerboard' },
      cell_overrides: { 'cell-0-0': { color_class: 5 } },
    } as BoardConfig;

    expect(cellColorClass(config, 0, 0)).toBe(5);
  });

  it('không có preset thì ô không mang color_class', () => {
    expect(cellColorClass(board, 3, 3)).toBeUndefined();
  });
});
