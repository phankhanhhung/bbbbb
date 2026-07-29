import type { Scene } from '@combviz/schema';
import { hashScene } from '@combviz/render';
import { DslError, element, isElement, type DslEnvironment, type Value } from '@combviz/dsl';
import {
  buildPoints,
  collinear,
  collinearTriples,
  convexHull,
  crossings,
  distinctCrossings,
  insideConvex,
  polygonArea,
  type PointModel,
} from './geometry.js';

const cache = new Map<string, PointModel>();

function model(scene: Scene): PointModel {
  const key = hashScene(scene);
  const hit = cache.get(key);
  if (hit) return hit;
  const value = buildPoints(scene);
  if (cache.size > 64) cache.clear();
  cache.set(key, value);
  return value;
}

/**
 * Môi trường DSL của Point engine.
 *
 * Ba binding gánh gần hết họ bài hình học tổ hợp: `hull` (bao lồi), `collinear`
 * (số bộ ba thẳng hàng) và `intersections` (số giao điểm). Chúng là *đáp số*
 * của rất nhiều bài, nên chúng phải là con số máy tính ra — không phải con số
 * tác giả nhẩm rồi gõ vào narrative (bài học M13/M14).
 */
export function pointEnvironment(scene: Scene): DslEnvironment {
  const state = model(scene);
  const hull = convexHull(state.points);
  const hullIds = new Set(hull.map((p) => p.id));
  const triples = collinearTriples(state.points);

  const points: Value[] = state.points.map((p) =>
    element(p.id, {
      label: p.label ?? '',
      x: p.x,
      y: p.y,
      color_class: p.colorClass,
      on_hull: hullIds.has(p.id),
    }),
  );

  const segments: Value[] = state.segments.map((s) =>
    element(s.id, {
      label: s.label ?? '',
      color_class: s.colorClass,
      length: lengthOf(state, s.a, s.b),
    }),
  );

  const need = (id: string, what: string): { x: number; y: number } => {
    const point = state.byId.get(id);
    if (!point) throw new DslError(`${what}: không có điểm "${id}"`, 0);
    return point;
  };

  const asPoint = (value: Value, what: string): { x: number; y: number } => {
    if (!isElement(value)) throw new DslError(`${what} cần một điểm`, 0);
    return need(value.id, what);
  };

  return {
    bindings: {
      points,
      segments,
      n: state.points.length,
      /** Số **đỉnh** của bao lồi — không tính điểm nằm trên cạnh. */
      hull: hull.length,
      /** Số bộ ba thẳng hàng. Bằng $0$ nghĩa là tập điểm ở vị trí tổng quát. */
      collinear: triples.length,
      /**
       * Số **điểm** giao khác nhau (không tính chỗ chung đầu mút).
       *
       * Đếm điểm chứ không đếm cặp đoạn: ba đoạn đồng quy cho $3$ cặp nhưng chỉ
       * $1$ điểm, và bài toán hỏi số điểm. Đó cũng là con số hình vẽ ra.
       */
      intersections: distinctCrossings(state),
      /** Số **cặp** đoạn cắt nhau. Khác `intersections` khi có đoạn đồng quy. */
      crossing_pairs: crossings(state).length,
      /** Số điểm nằm **hẳn trong** bao lồi. */
      inside: state.points.filter((p) => !hullIds.has(p.id) && insideHull(hull, p)).length,
    },

    builtins: {
      /** `dist(p, q)` — khoảng cách Euclid. */
      dist: (args, pos) => {
        if (args.length !== 2) throw new DslError('dist cần đúng 2 điểm', pos);
        const p = asPoint(args[0] as Value, 'dist');
        const q = asPoint(args[1] as Value, 'dist');
        return Math.hypot(p.x - q.x, p.y - q.y);
      },

      /** `aligned(p, q, r)` — ba điểm có thẳng hàng không. */
      aligned: (args, pos) => {
        if (args.length !== 3) throw new DslError('aligned cần đúng 3 điểm', pos);
        const [p, q, r] = args.map((a) => asPoint(a, 'aligned')) as [
          { x: number; y: number },
          { x: number; y: number },
          { x: number; y: number },
        ];
        return collinear(p, q, r);
      },

      /**
       * `area(p, q, r)` — diện tích tam giác.
       *
       * Bằng $0$ đúng khi ba điểm thẳng hàng, nên nó cũng là cách nói "suy biến"
       * bằng một con số so sánh được thay vì một vị từ đúng/sai.
       */
      area: (args, pos) => {
        if (args.length !== 3) throw new DslError('area cần đúng 3 điểm', pos);
        return polygonArea(args.map((a) => asPoint(a, 'area')));
      },

      /** `on_hull(p)` — điểm có phải đỉnh của bao lồi không. */
      on_hull: (args, pos) => {
        if (args.length !== 1) throw new DslError('on_hull cần đúng 1 điểm', pos);
        const p = args[0] as Value;
        if (!isElement(p)) throw new DslError('on_hull cần một điểm', pos);
        return hullIds.has(p.id);
      },
    },
  };
}

function insideHull(
  hull: readonly { x: number; y: number }[],
  p: { x: number; y: number },
): boolean {
  return hull.length >= 3 && insideConvex(hull, p);
}

function lengthOf(state: PointModel, a: string, b: string): number {
  const p = state.byId.get(a);
  const q = state.byId.get(b);
  return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
}
