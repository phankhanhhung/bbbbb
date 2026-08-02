import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Problem } from '@combviz/schema';

/**
 * **Đối chiếu độc lập cho `timetable-edge-colouring`** (GR-15).
 *
 * Sắc số cạnh ở đây tính bằng một phép **duyệt vét cạn viết riêng** — thử mọi cách gán
 * màu cho từng cạnh và tìm số màu nhỏ nhất khả thi. Không gọi validator, vì luật và
 * phép kiểm đi qua cùng một hàm thì chúng sai cùng nhau mà vẫn khớp (bài học M78.3).
 */

const LESSONS: readonly (readonly [string, string])[] = [
  ['t0', 'c0'], ['t0', 'c1'], ['t0', 'c2'],
  ['t1', 'c0'], ['t1', 'c1'],
  ['t2', 'c1'], ['t2', 'c2'],
];

/** Sắc số cạnh, tìm bằng cách thử $k$ tăng dần rồi quay lui trên từng cạnh. */
function edgeChromatic(edges: readonly (readonly [string, string])[]): number {
  for (let k = 1; k <= edges.length; k += 1) {
    const assign = new Array<number>(edges.length).fill(0);

    const adjacent = (a: readonly [string, string], b: readonly [string, string]): boolean =>
      a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1];

    /** Gán `colour` cho cạnh `i` có đụng cạnh nào **đã gán** và kề nó không. */
    const fits = (i: number, colour: number): boolean => {
      for (let j = 0; j < i; j += 1) {
        if (assign[j] !== colour) continue;
        if (adjacent(edges[j] as [string, string], edges[i] as [string, string])) return false;
      }
      return true;
    };
    const place = (i: number): boolean => {
      if (i === edges.length) return true;
      for (let colour = 1; colour <= k; colour += 1) {
        if (!fits(i, colour)) continue;
        assign[i] = colour;
        if (place(i + 1)) return true;
        assign[i] = 0;
      }
      return false;
    };
    if (place(0)) return k;
  }
  return edges.length;
}

const maxDegree = (edges: readonly (readonly [string, string])[]): number => {
  const deg = new Map<string, number>();
  for (const [u, v] of edges) {
    deg.set(u, (deg.get(u) ?? 0) + 1);
    deg.set(v, (deg.get(v) ?? 0) + 1);
  }
  return Math.max(...deg.values());
};

describe('timetable-edge-colouring — đối chiếu độc lập', () => {
  it('thời khoá biểu cần đúng $\\Delta = 3$ ca — König cho tô cạnh', () => {
    expect(maxDegree(LESSONS)).toBe(3);
    expect(edgeChromatic(LESSONS)).toBe(3);
    // Cận dưới là hiển nhiên; chỗ đáng kiểm là nó **đạt được**, tức $\Delta$ đủ.
    expect(edgeChromatic(LESSONS)).toBe(maxDegree(LESSONS));
  });

  it('tam giác cần $\\Delta + 1 = 3$ — điều kiện hai phía **không** phải trang trí', () => {
    const tri: [string, string][] = [['a', 'b'], ['b', 'c'], ['c', 'a']];
    expect(maxDegree(tri)).toBe(2);
    expect(edgeChromatic(tri)).toBe(3);
  });

  it('cách xếp vẽ trong bài **thật sự hợp lệ**, và dùng đúng ba màu', () => {
    const problem = JSON.parse(
      readFileSync(join('packages/content/problems', 'timetable-edge-colouring.json'), 'utf8'),
    ) as Problem;
    const s1 = problem.solutions[0]!.steps.find((s) => s.id === 's1')!;
    const edges = (s1.scene!.elements as { type: string; u?: string; v?: string; color_class?: number }[])
      .filter((e) => e.type === 'edge');
    expect(edges.length).toBe(7);

    for (const e of edges) expect(e.color_class, JSON.stringify(e)).toBeGreaterThan(0);
    expect(new Set(edges.map((e) => e.color_class)).size).toBe(3);

    // Hai cạnh chung đỉnh phải khác màu — kiểm bằng tay, không hỏi validator.
    for (let i = 0; i < edges.length; i += 1) {
      for (let j = i + 1; j < edges.length; j += 1) {
        const a = edges[i]!;
        const b = edges[j]!;
        const share = a.u === b.u || a.u === b.v || a.v === b.u || a.v === b.v;
        if (share) expect(a.color_class, `${i} vs ${j}`).not.toBe(b.color_class);
      }
    }
  });
});
