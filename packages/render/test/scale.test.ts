import { describe, expect, it } from 'vitest';
import type { Viewport } from '@combviz/schema';
import {
  CELL_PX,
  PREFERRED_SCALE,
  UNITS_PER_CELL,
  sceneBoxStyle,
  widestWidth,
} from '../src/scale.js';

/**
 * Luật tỉ lệ (G-10).
 *
 * Test này khoá đúng bất biến mà kho đã **vi phạm suốt** trước khi có lớp scale:
 * cùng một đối tượng phải có cùng cỡ pixel, ở mọi step và mọi bài. Đo trước khi
 * sửa: chênh 7,1× trong một bài, 10,2× toàn kho.
 */
const box = (width: number, height = 40): Viewport => ({ x: 0, y: 0, width, height });

/** Tỉ lệ thật mà một style sinh ra, ở bề rộng pane cho trước. */
function scaleOf(style: { width: string; maxWidth: string }, pane: number): number {
  const share = Number(style.width.replace('%', '')) / 100;
  const cap = Number(style.maxWidth.replace('px', ''));
  return Math.min(share * pane, cap);
}

describe('hằng số neo', () => {
  it('một ô là 44px — cùng con số với ngưỡng chạm NFR-A3', () => {
    expect(CELL_PX).toBe(44);
    expect(UNITS_PER_CELL).toBe(10);
    expect(PREFERRED_SCALE).toBeCloseTo(4.4, 10);
  });
});

describe('tỉ lệ dùng chung trong một bài', () => {
  const boxes = [box(18), box(60), box(127)];
  const widest = widestWidth(boxes);

  it('mọi step chia nhau **một** tỉ lệ, ở pane rộng', () => {
    // Pane rộng ⇒ trần 44px/ô thắng ⇒ mọi step ở đúng tỉ lệ đầy đủ.
    const scales = boxes.map((b) => scaleOf(sceneBoxStyle(b, widest), 2000) / b.width);
    for (const s of scales) expect(s).toBeCloseTo(PREFERRED_SCALE, 6);
  });

  it('mọi step chia nhau **một** tỉ lệ, ở pane hẹp', () => {
    // Pane hẹp ⇒ nhánh phần trăm thắng ⇒ cả bài co cùng một hệ số.
    const pane = 300;
    const scales = boxes.map((b) => scaleOf(sceneBoxStyle(b, widest), pane) / b.width);
    // Bằng nhau **tương đối** tới $10^{-6}$: phần trăm CSS là số hữu hạn chữ số nên
    // không thể bằng nhau tuyệt đối. Ở cỡ ô 44px, $10^{-6}$ là $4\cdot10^{-5}$px.
    for (const s of scales) {
      expect(Math.abs(s / (scales[0] as number) - 1)).toBeLessThan(1e-6);
    }
    // Và hệ số ấy đúng bằng "vừa khít step rộng nhất".
    expect(scales[0]).toBeCloseTo(pane / widest, 4);
  });

  it('**chỉ co, không bao giờ giãn** quá tỉ lệ đầy đủ', () => {
    for (const pane of [200, 400, 800, 1600, 4000]) {
      for (const b of boxes) {
        const scale = scaleOf(sceneBoxStyle(b, widest), pane) / b.width;
        expect(scale).toBeLessThanOrEqual(PREFERRED_SCALE + 1e-9);
      }
    }
  });

  it('bài nhỏ **không** bị thổi phồng cho đầy pane', () => {
    // Lỗi gốc: `width: 100%` kéo mọi scene cho đầy pane, nên bàn 4×4 có ô to gấp
    // đôi bàn 8×8. Ở đây bàn nhỏ dừng ở đúng 44px một ô.
    const small = box(48); // bàn 4×4 kể cả lề
    const big = box(88); // bàn 8×8
    const w = widestWidth([small, big]);
    const cellSmall = (scaleOf(sceneBoxStyle(small, w), 2000) / small.width) * UNITS_PER_CELL;
    const cellBig = (scaleOf(sceneBoxStyle(big, w), 2000) / big.width) * UNITS_PER_CELL;
    expect(cellSmall).toBeCloseTo(CELL_PX, 6);
    expect(cellBig).toBeCloseTo(CELL_PX, 6);
  });
});

describe('tỉ lệ dùng chung giữa các bài', () => {
  it('hai bài khác nhau cho cùng cỡ ô khi cả hai vừa khít', () => {
    const a = sceneBoxStyle(box(48), 48);
    const b = sceneBoxStyle(box(127), 127);
    const cellA = (scaleOf(a, 2000) / 48) * UNITS_PER_CELL;
    const cellB = (scaleOf(b, 2000) / 127) * UNITS_PER_CELL;
    expect(cellA).toBeCloseTo(cellB, 6);
    expect(cellA).toBeCloseTo(CELL_PX, 6);
  });
});

describe('trường hợp biên', () => {
  it('`widestWidth` của danh sách rỗng là 0, và style vẫn dùng được', () => {
    expect(widestWidth([])).toBe(0);
    const style = sceneBoxStyle(box(60), 0);
    // Không có mẫu số thì lấy chính mình — không sinh ra `NaN%` hay `Infinity`.
    expect(style.width).toBe('100%');
    expect(Number.isFinite(Number(style.maxWidth.replace('px', '')))).toBe(true);
  });

  it('không sinh ra `-0` hay số mũ trong CSS', () => {
    for (const w of [1, 7, 48, 184.567]) {
      const style = sceneBoxStyle(box(w), 184.567);
      expect(style.width).toMatch(/^[0-9]+(\.[0-9]+)?%$/);
      expect(style.maxWidth).toMatch(/^[0-9]+(\.[0-9]+)?px$/);
    }
  });

  it('luôn căn giữa và luôn có trần chiều cao', () => {
    const style = sceneBoxStyle(box(60), 60);
    expect(style.marginInline).toBe('auto');
    expect(style.maxHeight).toMatch(/vh$/);
  });
});
