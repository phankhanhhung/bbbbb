import { describe, expect, it } from 'vitest';
import { matchScale } from '../src/BijectionPanes.jsx';

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
