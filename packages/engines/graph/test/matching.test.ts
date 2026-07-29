import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import { buildGraph } from '../src/graph.js';
import { matching } from '../src/analyzers.js';

/** `edges` viết dạng `'l1-r1'`. Đỉnh trái tên `l*`, đỉnh phải tên `r*`. */
const bip = (edges: readonly string[]): Scene => {
  const ids = [...new Set(edges.flatMap((e) => e.split('-')))];
  return {
    engine: 'graph',
    config: {},
    elements: [
      ...ids.map((id, i) => ({
        id,
        type: 'vertex',
        pos: [id.startsWith('l') ? 0 : 20, i * 10],
      })),
      ...edges.map((e) => {
        const [u, v] = e.split('-') as [string, string];
        return { id: `e-${u}-${v}`, type: 'edge', u, v };
      }),
    ],
  };
};

const run = (edges: readonly string[]) => {
  const result = matching(buildGraph(bip(edges)));
  expect(result.refused).toBeUndefined();
  return result.value!;
};

describe('GR-06 — ghép cặp hai phía', () => {
  it('ghép cặp hoàn hảo trên $K_{3,3}$', () => {
    const all = ['l1', 'l2', 'l3'].flatMap((l) => ['r1', 'r2', 'r3'].map((r) => `${l}-${r}`));
    expect(run(all).size).toBe(3);
  });

  it('mỗi đỉnh xuất hiện nhiều nhất một lần trong ghép cặp', () => {
    const result = run(['l1-r1', 'l1-r2', 'l2-r1', 'l2-r2', 'l3-r2', 'l3-r3']);
    const touched = result.matching.flatMap((id) => id.replace('e-', '').split('-'));

    expect(new Set(touched).size).toBe(touched.length);
  });

  it('tham lam có thể chưa tối đa, và đường tăng chữa đúng chỗ đó', () => {
    // l1 vơ lấy r1 trước, l2 hết chỗ; đường tăng đẩy l1 sang r2.
    const result = run(['l1-r1', 'l1-r2', 'l2-r1']);

    expect(result.greedy).toHaveLength(1);
    expect(result.size).toBe(2);
    expect(result.augmentingPaths).toHaveLength(1);
  });

  it('đường tăng bắt đầu và kết thúc ở đỉnh chưa ghép, độ dài lẻ', () => {
    const result = run(['l1-r1', 'l1-r2', 'l2-r1']);
    const path = result.augmentingPaths[0]!;

    // Dãy đỉnh xen kẽ trái/phải: số đỉnh chẵn, số cạnh lẻ.
    expect(path.length % 2).toBe(0);
    expect(new Set(path).size).toBe(path.length);
  });

  it('König: phủ đỉnh nhỏ nhất bằng đúng cỡ ghép cặp tối đa', () => {
    for (const edges of [
      ['l1-r1', 'l1-r2', 'l2-r1'],
      ['l1-r1', 'l2-r1', 'l3-r1'],
      ['l1-r1', 'l2-r2', 'l3-r3'],
      ['l1-r1', 'l1-r2', 'l2-r2', 'l2-r3', 'l3-r3'],
    ]) {
      const result = run(edges);
      expect(result.cover).toHaveLength(result.size);
    }
  });

  it('phủ của König thật sự phủ **mọi** cạnh', () => {
    const edges = ['l1-r1', 'l1-r2', 'l2-r2', 'l2-r3', 'l3-r3', 'l4-r1'];
    const result = run(edges);
    const cover = new Set(result.cover);

    for (const e of edges) {
      const [u, v] = e.split('-') as [string, string];
      expect(cover.has(u) || cover.has(v)).toBe(true);
    }
  });

  it('Hall: khi phía trái bão hoà thì không có nhân chứng', () => {
    expect(run(['l1-r1', 'l2-r2']).hallViolator).toEqual([]);
  });

  it('Hall: khi không bão hoà thì nhân chứng thoả $|N(S)| < |S|$', () => {
    // Ba đỉnh trái cùng chỉ nhìn thấy một đỉnh phải.
    const result = run(['l1-r1', 'l2-r1', 'l3-r1']);

    expect(result.hallViolator.length).toBeGreaterThan(result.hallNeighbourhood.length);
    expect(result.size).toBe(1);
  });

  it('từ chối đồ thị không hai phía thay vì trả về kết quả gần đúng', () => {
    const triangle: Scene = {
      engine: 'graph',
      config: {},
      elements: [
        { id: 'a', type: 'vertex', pos: [0, 0] },
        { id: 'b', type: 'vertex', pos: [10, 0] },
        { id: 'c', type: 'vertex', pos: [5, 8] },
        { id: 'e1', type: 'edge', u: 'a', v: 'b' },
        { id: 'e2', type: 'edge', u: 'b', v: 'c' },
        { id: 'e3', type: 'edge', u: 'c', v: 'a' },
      ],
    };
    const result = matching(buildGraph(triangle));

    expect(result.value).toBeNull();
    expect(result.refused).toMatch(/không hai phía/);
  });

  it('bỏ qua khuyên — cạnh nối đỉnh với chính nó không ghép được ai', () => {
    const scene = bip(['l1-r1']);
    scene.elements.push({ id: 'loop', type: 'edge', u: 'l1', v: 'l1' });

    // Khuyên làm đồ thị không hai phía, nên đây phải là **từ chối**, không phải
    // một ghép cặp tính sai. Nói ra còn hơn im lặng cho một con số vô nghĩa.
    expect(matching(buildGraph(scene)).value).toBeNull();
  });
});

/**
 * Đối chiếu với vét cạn.
 *
 * Các test trên kiểm **tính chất** (không đỉnh nào ghép hai lần, phủ bằng cỡ
 * ghép cặp). Không cái nào chứng minh được rằng "tối đa" là tối đa thật: một
 * thuật toán bỏ sót đường tăng vẫn qua sạch chúng. Chỉ có vét cạn nói được điều
 * đó, và trên đồ thị nhỏ thì vét cạn là chuyện vặt.
 */
describe('GR-06 — đối chiếu vét cạn', () => {
  const brute = (edges: readonly string[]): number => {
    let best = 0;
    const pick = (i: number, used: Set<string>, size: number): void => {
      if (i === edges.length) {
        best = Math.max(best, size);
        return;
      }
      pick(i + 1, used, size);
      const [u, v] = (edges[i] as string).split('-') as [string, string];
      if (!used.has(u) && !used.has(v)) {
        used.add(u);
        used.add(v);
        pick(i + 1, used, size + 1);
        used.delete(u);
        used.delete(v);
      }
    };
    pick(0, new Set(), 0);
    return best;
  };

  it('cỡ ghép cặp khớp vét cạn trên mọi đồ thị con của $K_{3,3}$', () => {
    const all = ['l1', 'l2', 'l3'].flatMap((l) => ['r1', 'r2', 'r3'].map((r) => `${l}-${r}`));

    // Cả 512 tập con — đủ nhỏ để chạy hết, đủ lớn để không lọt trường hợp nào.
    for (let mask = 1; mask < 1 << all.length; mask += 1) {
      const edges = all.filter((_, i) => (mask >> i) & 1);
      expect({ mask, size: run(edges).size }).toEqual({ mask, size: brute(edges) });
    }
  });

  it('Hall đúng cả hai chiều trên mọi đồ thị con của $K_{3,3}$', () => {
    const all = ['l1', 'l2', 'l3'].flatMap((l) => ['r1', 'r2', 'r3'].map((r) => `${l}-${r}`));

    for (let mask = 1; mask < 1 << all.length; mask += 1) {
      const edges = all.filter((_, i) => (mask >> i) & 1);
      const result = run(edges);
      const saturated = result.size === result.left.length;

      // Có nhân chứng ⟺ phía trái không bão hoà, và nhân chứng phải thật sự vi phạm.
      expect(result.hallViolator.length > 0).toBe(!saturated);
      if (!saturated) {
        expect(result.hallNeighbourhood.length).toBeLessThan(result.hallViolator.length);
      }
    }
  });
});
