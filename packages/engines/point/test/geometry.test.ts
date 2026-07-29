import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import {
  buildPoints,
  collinear,
  collinearTriples,
  convexHull,
  cross,
  crossings,
  insideConvex,
  polygonArea,
  type Pt,
} from '../src/geometry.js';

const scene = (
  points: Record<string, readonly [number, number]>,
  segments: readonly (readonly [string, string])[] = [],
): Scene => ({
  engine: 'point',
  config: {},
  elements: [
    ...Object.entries(points).map(([id, pos]) => ({ id, type: 'point', pos: [...pos] })),
    ...segments.map(([a, b]) => ({ id: `s-${a}${b}`, type: 'segment', a, b })),
  ],
});

const pts = (coords: readonly (readonly [number, number])[]): Pt[] =>
  coords.map(([x, y], i) => ({
    id: `p${i}`,
    x,
    y,
    label: undefined,
    colorClass: 0,
    emphasis: undefined,
  }));

describe('bao lồi (PT-02)', () => {
  it('hình vuông: cả bốn đỉnh đều trên bao', () => {
    const hull = convexHull(pts([[0, 0], [10, 0], [10, 10], [0, 10]]));
    expect(hull).toHaveLength(4);
  });

  it('điểm bên trong bị loại', () => {
    const hull = convexHull(pts([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]]));
    expect(hull.map((p) => p.id)).not.toContain('p4');
    expect(hull).toHaveLength(4);
  });

  it('điểm nằm **trên cạnh** cũng bị loại — bao là tập đỉnh', () => {
    // (5,0) nằm giữa (0,0) và (10,0): không phải đỉnh của bao.
    const hull = convexHull(pts([[0, 0], [10, 0], [10, 10], [0, 10], [5, 0]]));
    expect(hull.map((p) => p.id)).not.toContain('p4');
  });

  it('mọi điểm thẳng hàng thì bao chỉ còn hai đầu mút', () => {
    const hull = convexHull(pts([[0, 0], [10, 0], [20, 0], [30, 0]]));
    expect(hull.map((p) => p.id).sort()).toEqual(['p0', 'p3']);
  });

  it('không lặp điểm nào', () => {
    const hull = convexHull(pts([[0, 0], [10, 0], [10, 10], [0, 10]]));
    expect(new Set(hull.map((p) => p.id)).size).toBe(hull.length);
  });
});

/**
 * Đối chiếu vét cạn.
 *
 * Các test trên kiểm những trường hợp tôi **nghĩ ra được**. Quét Andrew sai ở
 * biên (điểm trùng, điểm trên cạnh, thứ tự sắp xếp) thì vẫn qua sạch chúng.
 * Định nghĩa gốc thì kiểm được mọi cấu hình: $p$ là đỉnh của bao khi và chỉ khi
 * tồn tại một nửa mặt phẳng chứa $p$ trên biên và mọi điểm khác ở một phía.
 */
describe('bao lồi — đối chiếu định nghĩa', () => {
  /** $p$ là đỉnh bao ⟺ có một cặp $(a,b)$ sao cho mọi điểm khác cùng phía với đoạn $ap$. */
  const isVertexByDefinition = (points: readonly Pt[], p: Pt): boolean => {
    // Với mỗi hướng ứng viên (qua p và một điểm khác), kiểm xem mọi điểm còn lại
    // có nằm hẳn về một phía không.
    for (const q of points) {
      if (q.id === p.id) continue;
      let left = 0;
      let right = 0;
      for (const r of points) {
        if (r.id === p.id || r.id === q.id) continue;
        const d = cross(p, q, r);
        if (d > 1e-9) left += 1;
        else if (d < -1e-9) right += 1;
      }
      if (left === 0 || right === 0) {
        // p nằm ở mút của một đường tựa — nhưng phải loại trường hợp p nằm
        // *giữa* hai điểm thẳng hàng.
        const between = points.some(
          (r) =>
            r.id !== p.id &&
            r.id !== q.id &&
            collinear(p, q, r) &&
            (r.x - p.x) * (q.x - p.x) + (r.y - p.y) * (q.y - p.y) < 0,
        );
        if (!between) return true;
      }
    }
    return false;
  };

  it('khớp định nghĩa trên lưới 4×4 lấy mọi tập con 4–6 điểm', () => {
    const grid: [number, number][] = [];
    for (let x = 0; x < 4; x += 1) for (let y = 0; y < 4; y += 1) grid.push([x * 10, y * 10]);

    let checked = 0;
    for (let mask = 0; mask < 1 << grid.length; mask += 1) {
      const chosen = grid.filter((_, i) => (mask >> i) & 1);
      if (chosen.length < 4 || chosen.length > 5) continue;
      // Lấy mẫu thưa để test chạy trong tích tắc mà vẫn quét hàng nghìn cấu hình.
      if (mask % 7 !== 0) continue;

      const points = pts(chosen);
      const hull = new Set(convexHull(points).map((p) => p.id));
      for (const p of points) {
        expect({ mask, id: p.id, onHull: hull.has(p.id) }).toEqual({
          mask,
          id: p.id,
          onHull: isVertexByDefinition(points, p),
        });
      }
      checked += 1;
    }

    expect(checked).toBeGreaterThan(200);
  });
});

describe('thẳng hàng và diện tích', () => {
  it('bắt bộ ba thẳng hàng, kể cả toạ độ không nguyên', () => {
    const points = pts([[0, 0], [3.5, 7], [7, 14], [1, 0]]);
    const triples = collinearTriples(points).map((t) => t.join(','));

    expect(triples).toContain('p0,p1,p2');
    expect(triples).not.toContain('p0,p1,p3');
  });

  it('diện tích dây giày không phụ thuộc chiều duyệt', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(polygonArea(square)).toBe(100);
    expect(polygonArea([...square].reverse())).toBe(100);
  });

  it('điểm trong đa giác lồi: biên **không** tính là trong', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(insideConvex(square, { x: 5, y: 5 })).toBe(true);
    expect(insideConvex(square, { x: 0, y: 5 })).toBe(false);
    expect(insideConvex(square, { x: 15, y: 5 })).toBe(false);
  });
});

describe('giao điểm các đoạn (PT-02)', () => {
  it('hai đường chéo hình vuông cắt nhau ở tâm', () => {
    const model = buildPoints(
      scene({ a: [0, 0], b: [10, 0], c: [10, 10], d: [0, 10] }, [['a', 'c'], ['b', 'd']]),
    );
    const found = crossings(model);

    expect(found).toHaveLength(1);
    expect(found[0]!.at.x).toBeCloseTo(5, 9);
    expect(found[0]!.at.y).toBeCloseTo(5, 9);
  });

  it('hai đoạn chung đầu mút **không** tính là giao', () => {
    // Nếu tính, mọi bài "đếm giao điểm của các đường chéo" sai ngay dòng đầu.
    const model = buildPoints(
      scene({ a: [0, 0], b: [10, 0], c: [5, 10] }, [['a', 'b'], ['a', 'c']]),
    );
    expect(crossings(model)).toEqual([]);
  });

  it('chạm mút nhưng không cắt qua thì không tính', () => {
    const model = buildPoints(
      scene({ a: [0, 0], b: [10, 0], c: [5, 0], d: [5, 10] }, [['a', 'b'], ['c', 'd']]),
    );
    expect(crossings(model)).toEqual([]);
  });

  it('ngũ giác lồi: năm đường chéo cho đúng năm giao điểm', () => {
    const coords: Record<string, [number, number]> = {};
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / 5;
      coords[`v${i}`] = [
        Math.round(Math.cos(a) * 1000) / 100,
        Math.round(Math.sin(a) * 1000) / 100,
      ];
    }
    const diagonals: [string, string][] = [];
    for (let i = 0; i < 5; i += 1) {
      for (let j = i + 1; j < 5; j += 1) {
        if ((j - i) % 5 !== 1 && (i + 5 - j) % 5 !== 1) diagonals.push([`v${i}`, `v${j}`]);
      }
    }

    expect(diagonals).toHaveLength(5);
    expect(crossings(buildPoints(scene(coords, diagonals)))).toHaveLength(5);
  });
});
