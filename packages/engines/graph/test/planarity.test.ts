import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import { buildGraph } from '../src/graph.js';
import { planarity } from '../src/analyzers.js';
import { layoutPositions } from '../src/layout.js';

const scene = (
  positions: Record<string, readonly [number, number]>,
  edges: readonly (readonly [string, string])[],
): Scene => ({
  engine: 'graph',
  config: {},
  elements: [
    ...Object.entries(positions).map(([id, pos]) => ({ id, type: 'vertex', pos: [...pos] })),
    ...edges.map(([u, v]) => ({ id: `e-${u}${v}`, type: 'edge', u, v })),
  ],
});

const run = (s: Scene) => {
  const result = planarity(buildGraph(s));
  expect(result.refused).toBeUndefined();
  return result.value!;
};

/** Đỉnh của đa giác đều $n$ cạnh, dùng làm hình vẽ "ngây thơ". */
const onCircle = (ids: readonly string[]): Record<string, [number, number]> =>
  Object.fromEntries([...layoutPositions(ids, 'circle')]);

const complete = (ids: readonly string[]): [string, string][] =>
  ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as [string, string]));

describe('GR-05 — tính phẳng', () => {
  it('hình không có giao điểm là **chứng chỉ** phẳng', () => {
    // Tứ giác: bốn đỉnh, bốn cạnh, không cạnh nào cắt nhau.
    const square = scene(
      { a: [0, 0], b: [10, 0], c: [10, 10], d: [0, 10] },
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'd'],
        ['d', 'a'],
      ],
    );
    const result = run(square);

    expect(result.verdict).toBe('planar');
    expect(result.crossings).toEqual([]);
    // Euler: $v - e + f = 2$ ⇒ hai mặt (trong và ngoài).
    expect(result.faces).toBe(2);
  });

  it('$K_5$ là không phẳng, và lý do là chặn Euler chứ không phải hình xấu', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const result = run(scene(onCircle(ids), complete(ids)));

    expect(result.verdict).toBe('not-planar');
    expect(result.edges).toBe(10);
    expect(result.maxEdges).toBe(9); // 3·5 − 6
  });

  it('$K_{3,3}$ dùng chặn cho đồ thị không tam giác', () => {
    const ids = ['u1', 'u2', 'u3', 'w1', 'w2', 'w3'];
    const edges = ['u1', 'u2', 'u3'].flatMap((u) =>
      ['w1', 'w2', 'w3'].map((w) => [u, w] as [string, string]),
    );
    const result = run(scene(onCircle(ids), edges));

    expect(result.triangleFree).toBe(true);
    expect(result.maxEdges).toBe(8); // 2·6 − 4, chứ không phải 3·6 − 6 = 12
    expect(result.edges).toBe(9);
    expect(result.verdict).toBe('not-planar');
  });

  it('hình vụng của một đồ thị phẳng cho "chưa biết", không cho "không phẳng"', () => {
    // $K_4$ vẽ trên vòng tròn: hai đường chéo cắt nhau. Nhưng $K_4$ **là** phẳng,
    // nên kết luận duy nhất trung thực ở đây là "chưa biết".
    const ids = ['a', 'b', 'c', 'd'];
    const result = run(scene(onCircle(ids), complete(ids)));

    expect(result.crossings.length).toBeGreaterThan(0);
    expect(result.verdict).toBe('unknown');
  });

  it('cùng đồ thị đó, vẽ lại cho khéo thì thành chứng chỉ phẳng', () => {
    // $K_4$ với một đỉnh đặt vào giữa tam giác — không còn giao điểm nào.
    const result = run(
      scene({ a: [0, -10], b: [-9, 5], c: [9, 5], d: [0, 0] }, complete(['a', 'b', 'c', 'd'])),
    );

    expect(result.verdict).toBe('planar');
    expect(result.faces).toBe(4);
  });

  it('cạnh đi xuyên qua một đỉnh cũng tính là cắt', () => {
    // b nằm đúng giữa đoạn a–c, và cạnh a–c không chung đỉnh với b–d.
    const result = run(
      scene({ a: [0, 0], b: [10, 0], c: [20, 0], d: [10, 10] }, [
        ['a', 'c'],
        ['b', 'd'],
      ]),
    );

    expect(result.crossings).toHaveLength(1);
  });

  it('hai cạnh chung đỉnh không tính là cắt', () => {
    const result = run(
      scene({ a: [0, 0], b: [10, 0], c: [5, 10] }, [
        ['a', 'b'],
        ['a', 'c'],
      ]),
    );

    expect(result.crossings).toEqual([]);
    expect(result.verdict).toBe('planar');
  });

  it('từ chối đồ thị không đơn thay vì áp chặn Euler sai', () => {
    const loop = scene({ a: [0, 0], b: [10, 0] }, [['a', 'b']]);
    loop.elements.push({ id: 'self', type: 'edge', u: 'a', v: 'a' });
    expect(planarity(buildGraph(loop)).refused).toMatch(/khuyên/);

    const multi = scene({ a: [0, 0], b: [10, 0] }, [['a', 'b']]);
    multi.elements.push({ id: 'again', type: 'edge', u: 'a', v: 'b' });
    expect(planarity(buildGraph(multi)).refused).toMatch(/cạnh bội/);
  });

  it('từ chối khi có cạnh vẽ cong — đoạn thẳng không mô tả đúng hình đó', () => {
    const curved = scene({ a: [0, 0], b: [10, 0] }, [['a', 'b']]);
    (curved.elements[2] as Record<string, unknown>)['multi_index'] = 1;

    expect(planarity(buildGraph(curved)).refused).toMatch(/cong/);
  });
});
