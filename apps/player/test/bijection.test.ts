import { describe, expect, it } from 'vitest';
import { matchScale, unionBox } from '../src/BijectionPanes.jsx';
import { renderMath } from '../src/math.js';

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
 * Phép biến hình **không** còn ở file này.
 *
 * M37 dựng nó tại chỗ: đo tâm bằng cách suy ngược từ cây đã render, tự nuôi vòng
 * rAF, tự có thanh kéo. Cả ba phần đã chuyển về đúng tầng của chúng —
 * `EngineRenderer.elementBoxes` (engine tự khai hình học),
 * `applyChoreography` (nội suy thuần, có test riêng ở `packages/render`), và
 * `useChoreography` + `Timeline` (đồng hồ dùng chung với step có choreography).
 *
 * Còn lại ở đây đúng thứ chỉ file này biết: cân tỉ lệ hai pane, và khung hợp cho
 * chế độ biến hình.
 */
describe('PRN-04 — khung hợp', () => {
  it('chứa trọn cả hai', () => {
    const box = unionBox({ x: 0, y: 0, width: 10, height: 4 }, { x: -6, y: 2, width: 5, height: 9 });

    expect(box).toEqual({ x: -6, y: 0, width: 16, height: 11 });
  });
});

describe('renderMath — chữ đậm ngoài công thức', () => {
  it('đổi `**…**` thành <strong>', () => {
    expect(renderMath('phủ **hai lần**')).toContain('<strong>hai lần</strong>');
  });

  it('vẫn thoát HTML — nội dung bài là dữ liệu (NFR-S1)', () => {
    // Escape chạy **trước**, nên regex đậm chỉ còn gặp văn bản trơ.
    const out = renderMath('**<img src=x onerror=alert(1)>**');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('không đụng `**` nằm trong công thức', () => {
    expect(renderMath('$a ** b$')).not.toContain('<strong>');
  });

  it('dấu sao lẻ để nguyên, không nuốt phần còn lại', () => {
    expect(renderMath('2 ** 3 và 4')).toContain('2 ** 3 và 4');
  });
});

describe('renderMath — chữ đậm bao quanh công thức', () => {
  it('mở ở đoạn này, đóng ở đoạn kia', () => {
    // Hai dấu sao rơi vào hai đoạn văn khác nhau vì có công thức chen giữa. Đây
    // là dạng phổ biến nhất trong kho, và bản đầu tiên bỏ sót đúng nó.
    const out = renderMath('sao cho **mỗi bạn nhận ít nhất $1$ chiếc**.');

    expect(out).toContain('<strong>');
    expect(out).toContain('</strong>');
    expect(out).not.toContain('**');
  });

  it('thẻ mở và thẻ đóng cân nhau', () => {
    const out = renderMath('**a** rồi $x$ rồi **b $y$ c**');
    expect((out.match(/<strong>/g) ?? []).length).toBe(2);
    expect((out.match(/<\/strong>/g) ?? []).length).toBe(2);
  });
});
