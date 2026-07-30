import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import { buildGraph } from '../src/graph.js';
import { faceAdjacency, planarFaces, planarity } from '../src/analyzers.js';
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

/**
 * GR-05 — **mặt** của một cách nhúng phẳng.
 *
 * Bài kiểm chính là công thức Euler: `planarity` đếm mặt bằng $e - v + 1 + c$,
 * còn `planarFaces` lần ra từng mặt bằng hệ quay. Hai đường hoàn toàn khác nhau
 * phải gặp nhau, và chúng chỉ gặp nhau nếu hệ quay đúng — không mắt nào bắt được
 * một hệ quay lệch trên hình mười mặt.
 *
 * Toạ độ ở đây viết tay chứ không xếp vòng tròn: một hình vẽ vòng tròn của hai
 * tam giác dán cạnh **có** giao điểm, và khi ấy mặt chưa có nghĩa gì.
 */
describe('GR-05 — mặt của hình phẳng', () => {
  /** Tam giác đơn. */
  const triangle = (): Scene =>
    scene({ a: [0, 0], b: [10, 0], c: [5, 9] }, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);

  /** Hai tam giác dán theo cạnh a–b: một hình kim cương, hai mặt trong. */
  const diamond = (): Scene =>
    scene({ a: [0, 0], b: [10, 0], c: [5, 9], d: [5, -9] }, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
      ['a', 'd'],
      ['b', 'd'],
    ]);

  const faces = (s: Scene) => planarFaces(buildGraph(s));

  it('tam giác: một mặt trong, một mặt ngoài', () => {
    const result = faces(triangle()).value!;
    expect(result.map((f) => f.id)).toEqual(['face-0', 'face-outer']);
    expect(result.filter((f) => f.outer)).toHaveLength(1);
    expect(result[0]!.edges).toHaveLength(3);
    expect(result[1]!.edges).toHaveLength(3);
  });

  it('cây: đúng **một** mặt, và biên đi qua mỗi cạnh hai lần', () => {
    const tree = scene({ a: [0, 0], b: [10, 0], c: [20, 6], d: [20, -6] }, [
      ['a', 'b'],
      ['b', 'c'],
      ['b', 'd'],
    ]);
    const result = faces(tree).value!;
    expect(result).toHaveLength(1);
    expect(result[0]!.outer).toBe(true);
    // Mỗi cạnh là một cầu nên biên đi qua nó hai lần theo hai chiều ngược nhau;
    // diện tích có dấu vì thế triệt tiêu, đúng như một cái cây phải thế.
    expect(result[0]!.edges).toHaveLength(6);
    expect(result[0]!.area).toBeCloseTo(0, 6);
  });

  it('số mặt lần ra **luôn** khớp công thức Euler', () => {
    const cases: Record<string, Scene> = {
      'tam giác': triangle(),
      'kim cương': diamond(),
      cây: scene({ a: [0, 0], b: [10, 0], c: [20, 6], d: [20, -6] }, [
        ['a', 'b'],
        ['b', 'c'],
        ['b', 'd'],
      ]),
      'một cạnh': scene({ a: [0, 0], b: [10, 0] }, [['a', 'b']]),
      'ngũ giác': scene(
        { a: [0, 0], b: [10, 0], c: [13, 9], d: [5, 15], e: [-3, 9] },
        [
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'd'],
          ['d', 'e'],
          ['e', 'a'],
        ],
      ),
      'ngũ giác có dây cung': scene(
        { a: [0, 0], b: [10, 0], c: [13, 9], d: [5, 15], e: [-3, 9] },
        [
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'd'],
          ['d', 'e'],
          ['e', 'a'],
          ['a', 'c'],
        ],
      ),
    };

    for (const [name, s] of Object.entries(cases)) {
      const traced = faces(s).value;
      const euler = run(s);
      expect({ name, traced: traced?.length }).toEqual({ name, traced: euler.faces });
    }
  });

  it('tổng chu vi các mặt bằng $2e$ — bổ đề nền của đếm hai chiều trên hình phẳng', () => {
    for (const s of [triangle(), diamond()]) {
      const graph = buildGraph(s);
      const total = faces(s).value!.reduce((sum, f) => sum + f.edges.length, 0);
      expect(total).toBe(2 * graph.edges.length);
    }
  });

  it('từ chối khi hình còn cắt nhau, và khi đồ thị không liên thông', () => {
    const k5 = faces(scene(onCircle(['a', 'b', 'c', 'd', 'e']), complete(['a', 'b', 'c', 'd', 'e'])));
    expect(k5.value).toBeNull();
    expect(k5.refused).toMatch(/cắt nhau/);

    const split = faces(
      scene({ a: [0, 0], b: [10, 0], c: [0, 20], d: [10, 20] }, [
        ['a', 'b'],
        ['c', 'd'],
      ]),
    );
    expect(split.value).toBeNull();
    expect(split.refused).toMatch(/liên thông/);
  });

  it('mặt kề nhau đọc theo **cạnh chung**, không theo đỉnh chung', () => {
    const result = faces(diamond()).value!;
    const near = faceAdjacency(result);
    const inner = result.filter((f) => !f.outer).map((f) => f.id);
    expect(inner).toHaveLength(2);
    expect(near.get(inner[0]!)).toContain(inner[1]!);
    expect(near.get(inner[0]!)).toContain('face-outer');
  });

  it('cầu **không** sinh quan hệ kề — nó có cùng một mặt ở hai bên', () => {
    const tailed = scene({ a: [0, 0], b: [10, 0], c: [5, 9], d: [5, 20] }, [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
      ['c', 'd'],
    ]);
    const near = faceAdjacency(faces(tailed).value!);
    expect(near.get('face-outer')).toEqual(['face-0']);
    expect(near.get('face-0')).toEqual(['face-outer']);
  });

  it('mặt ngoài nhận bằng **dấu** diện tích, không bằng "diện tích lớn nhất"', () => {
    // Hình lõm: mặt trong ôm gần hết khung bao, nên phần thấy được của mặt ngoài
    // nhỏ hơn nó. So bằng độ lớn sẽ chọn nhầm; so bằng dấu thì không.
    const concave = scene(
      { a: [0, 0], b: [30, 0], c: [30, 30], d: [0, 30], e: [15, 5] },
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'd'],
        ['d', 'a'],
        ['a', 'e'],
        ['e', 'b'],
      ],
    );
    const result = faces(concave).value!;
    expect(result.filter((f) => f.outer)).toHaveLength(1);
    const outer = result.find((f) => f.outer)!;
    const inner = result.filter((f) => !f.outer);
    // Mặt ngoài quay ngược chiều mọi mặt trong.
    for (const face of inner) {
      expect({ id: face.id, opposite: Math.sign(face.area) !== Math.sign(outer.area) }).toEqual({
        id: face.id,
        opposite: true,
      });
    }
  });
});
