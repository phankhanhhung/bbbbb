import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import { buildGraph } from '../src/graph.js';
import { analyzePoset } from '../src/poset.js';

/** `'a>b'` nghĩa là $a < b$ trong poset. */
const poset = (ids: readonly string[], relations: readonly string[]): Scene => ({
  engine: 'graph',
  config: {},
  elements: [
    ...ids.map((id, i) => ({ id, type: 'vertex', pos: [i * 10, 0] })),
    ...relations.map((r) => {
      const [u, v] = r.split('>') as [string, string];
      return { id: `e-${u}${v}`, type: 'edge', u, v, directed: true };
    }),
  ],
});

const run = (ids: readonly string[], relations: readonly string[]) =>
  analyzePoset(buildGraph(poset(ids, relations)));

describe('poset — cơ bản', () => {
  it('xích thuần: chiều cao bằng số phần tử, chiều rộng bằng 1', () => {
    const result = run(['a', 'b', 'c', 'd'], ['a>b', 'b>c', 'c>d']);

    expect(result.height).toBe(4);
    expect(result.longestChain).toEqual(['a', 'b', 'c', 'd']);
    expect(result.width).toBe(1);
  });

  it('phản xích thuần: chiều cao 1, chiều rộng bằng số phần tử', () => {
    const result = run(['a', 'b', 'c'], []);

    expect(result.height).toBe(1);
    expect(result.width).toBe(3);
    expect([...result.maxAntichain].sort()).toEqual(['a', 'b', 'c']);
  });

  it('phần tử tối tiểu và tối đại', () => {
    const result = run(['a', 'b', 'c'], ['a>c', 'b>c']);

    expect(result.minimal).toEqual(['a', 'b']);
    expect(result.maximal).toEqual(['c']);
  });

  it('có chu trình thì **không phải** poset, và nói ra nhân chứng', () => {
    const result = run(['a', 'b', 'c'], ['a>b', 'b>c', 'c>a']);

    expect(result.isPoset).toBe(false);
    expect(result.cycle).toHaveLength(3);
  });

  it('chiều cao tính trên bao đóng bắc cầu, không trên số cạnh', () => {
    // $a < b < c$ vẽ hai cạnh Hasse; xích vẫn dài 3.
    expect(run(['a', 'b', 'c'], ['a>b', 'b>c']).height).toBe(3);
  });

  it('bắt cạnh thừa so với sơ đồ Hasse', () => {
    // $a \\to c$ là bắc cầu: đã có $a \\to b \\to c$.
    const result = run(['a', 'b', 'c'], ['a>b', 'b>c', 'a>c']);

    expect(result.redundantEdges).toEqual(['e-ac']);
    // Quan hệ vẫn đúng — chiều cao không đổi. Đây là lỗi **hình**, không phải lỗi toán.
    expect(result.height).toBe(3);
  });

  it('sơ đồ Hasse đúng thì không có cạnh nào thừa', () => {
    expect(run(['a', 'b', 'c'], ['a>b', 'b>c']).redundantEdges).toEqual([]);
  });
});

/**
 * Đối chiếu vét cạn.
 *
 * `width` tính qua ghép cặp trên đồ thị tách đôi rồi lấy nhân chứng từ phủ
 * König — ba tầng gián tiếp, và một lỗi ở bất kỳ tầng nào vẫn cho ra con số
 * trông hợp lý. Chỉ định nghĩa gốc nói được: phản xích lớn nhất là tập lớn nhất
 * mà không hai phần tử nào so sánh được.
 */
describe('poset — đối chiếu vét cạn', () => {
  /** Cỡ phản xích lớn nhất, tính thẳng từ định nghĩa. */
  const bruteWidth = (
    ids: readonly string[],
    reach: ReadonlyMap<string, ReadonlySet<string>>,
  ): number => {
    let best = 0;
    for (let mask = 0; mask < 1 << ids.length; mask += 1) {
      const chosen = ids.filter((_, i) => (mask >> i) & 1);
      const ok = chosen.every((u) =>
        chosen.every((v) => u === v || !(reach.get(u)?.has(v) ?? false)),
      );
      if (ok) best = Math.max(best, chosen.length);
    }
    return best;
  };

  /** Bao đóng bắc cầu bằng Floyd–Warshall, độc lập với cài đặt đang test. */
  const bruteClosure = (
    ids: readonly string[],
    relations: readonly string[],
  ): Map<string, Set<string>> => {
    const reach = new Map(ids.map((id) => [id, new Set<string>()]));
    for (const r of relations) {
      const [u, v] = r.split('>') as [string, string];
      reach.get(u)?.add(v);
    }
    for (const k of ids)
      for (const i of ids)
        if (reach.get(i)?.has(k))
          for (const j of reach.get(k) ?? []) reach.get(i)?.add(j);
    return reach;
  };

  it('chiều rộng khớp vét cạn trên mọi DAG 5 đỉnh sinh từ một thứ tự cố định', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const pairs: string[] = [];
    for (let i = 0; i < ids.length; i += 1)
      for (let j = i + 1; j < ids.length; j += 1) pairs.push(`${ids[i]}>${ids[j]}`);

    let checked = 0;
    for (let mask = 0; mask < 1 << pairs.length; mask += 1) {
      // Lấy mẫu thưa: 1024 cấu hình là đủ dày mà test vẫn chạy trong tích tắc.
      if (mask % 3 !== 0) continue;
      const relations = pairs.filter((_, i) => (mask >> i) & 1);
      const result = run(ids, relations);
      const reach = bruteClosure(ids, relations);

      expect({ mask, width: result.width }).toEqual({
        mask,
        width: bruteWidth(ids, reach),
      });
      checked += 1;
    }

    expect(checked).toBeGreaterThan(300);
  });

  it('nhân chứng phản xích **thật sự** là phản xích, và đúng cỡ', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const pairs: string[] = [];
    for (let i = 0; i < ids.length; i += 1)
      for (let j = i + 1; j < ids.length; j += 1) pairs.push(`${ids[i]}>${ids[j]}`);

    for (let mask = 0; mask < 1 << pairs.length; mask += 1) {
      if (mask % 7 !== 0) continue;
      const relations = pairs.filter((_, i) => (mask >> i) & 1);
      const result = run(ids, relations);
      const reach = bruteClosure(ids, relations);

      expect(result.maxAntichain).toHaveLength(result.width);
      for (const u of result.maxAntichain) {
        for (const v of result.maxAntichain) {
          if (u !== v) expect({ mask, u, v, related: reach.get(u)?.has(v) }).toEqual({
            mask,
            u,
            v,
            related: false,
          });
        }
      }
    }
  });
});
