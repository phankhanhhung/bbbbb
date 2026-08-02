import { describe, expect, it } from 'vitest';
import type { Viewport } from '@combviz/schema';
import {
  CELL_PX,
  matchScale,
  PREFERRED_SCALE,
  UNITS_PER_CELL,
  MAX_CANVAS_VH,
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

describe('PRN-04 — cân tỉ lệ hai pane', () => {
  const tall = { x: -20, y: -13, width: 34, height: 57 };
  const wide = { x: -6, y: -9, width: 52, height: 24 };

  it('hai khung ra cùng kích thước', () => {
    const [a, b] = matchScale(tall, wide);

    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
  });

  it('mỗi khung nới quanh tâm của chính nó', () => {
    const centre = (box: { x: number; width: number }): number => box.x + box.width / 2;
    const [a, b] = matchScale(tall, wide);

    // Nới lệch tâm thì hình trôi trong khung, và hai pane lệch nhau theo chiều
    // dọc đúng lúc người đọc đang so hàng này với hàng kia.
    expect(centre(a)).toBeCloseTo(centre(tall), 6);
    expect(centre(b)).toBeCloseTo(centre(wide), 6);
  });

  it('không thu nhỏ khung nào — chỉ nới ra', () => {
    const [a, b] = matchScale(tall, wide);

    expect(a.width).toBeGreaterThanOrEqual(tall.width);
    expect(a.height).toBeGreaterThanOrEqual(tall.height);
    expect(b.width).toBeGreaterThanOrEqual(wide.width);
    expect(b.height).toBeGreaterThanOrEqual(wide.height);
  });

  it('hai khung sẵn bằng nhau thì giữ nguyên', () => {
    const [a, b] = matchScale(tall, tall);

    expect(a).toEqual(tall);
    expect(b).toEqual(tall);
  });
});

/**
 * **Trần chiều cao canvas** — chốt canh này từng không có răng nào.
 *
 * Lượt bẻ răng hàng loạt lộ ra: nới `MAX_CANVAS_VH` từ $72$ lên $9999$ mà **toàn bộ
 * test vẫn xanh**. Nó là hàng rào duy nhất trên trục dọc — trục ngang đã do `width` và
 * `maxWidth` khoá — nên bỏ nó đi thì một scene rất cao (bảng incidence nhiều phần tử)
 * đẩy narrative ra khỏi màn hình, và người học mất chính thứ cần đọc **cùng** hình.
 *
 * Đây là loại hỏng không test nào khác bắt được: hình vẫn đúng, tỉ lệ vẫn đúng, golden
 * vẫn khớp từng byte. Chỉ có bố cục hỏng, và bố cục thì phải hỏi thẳng.
 */
describe('trần chiều cao canvas', () => {
  it('`maxHeight` luôn có mặt và luôn tính theo **viewport**, không theo pixel', () => {
    // `vh` chứ không phải `px`: trần phải co theo màn hình. Một trần pixel cố định thì
    // đúng trên máy bàn và sai trên điện thoại, mà điện thoại là chỗ nó cần nhất.
    for (const box of [
      { x: 0, y: 0, width: 40, height: 40 },
      { x: 0, y: 0, width: 40, height: 400 },
      { x: 0, y: 0, width: 400, height: 40 },
    ]) {
      const style = sceneBoxStyle(box, 400);
      expect(style.maxHeight, JSON.stringify(box)).toMatch(/^\d+vh$/);
    }
  });

  it('trần ấy phải **chừa chỗ cho chữ** — không được quá 80% viewport', () => {
    // Con số cụ thể là quyết định thiết kế; điều test này khoá là *có* một trần và nó
    // để lại đủ chỗ cho narrative. Nới lên $9999$vh thì đây đỏ, và đó chính là mutant
    // đã sống sót.
    expect(MAX_CANVAS_VH).toBeGreaterThan(0);
    expect(MAX_CANVAS_VH).toBeLessThanOrEqual(80);
    const style = sceneBoxStyle({ x: 0, y: 0, width: 40, height: 4000 }, 40);
    expect(Number.parseInt(style.maxHeight, 10)).toBeLessThanOrEqual(80);
  });
});
