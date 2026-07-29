import { defineCommand, type CommandRegistry, type HitTest } from '@combviz/editor';
import type {
  EngineSchemaFragment,
  Scene,
  SceneElement,
  ValidationIssue,
} from '@combviz/schema';
import { buildPoints, POINT_RADIUS } from './geometry.js';
import {
  LineElement,
  PointConfig,
  PointElement,
  PolygonElement,
  SegmentElement,
  POINT_LIMITS,
} from './schema.js';
import { POINT_VALIDATOR_IDS, resolvePointValidator } from './validators.js';

export * from './schema.js';
export { pointTools } from './tools.js';
export * from './geometry.js';
export * from './validators.js';
export { pointEnvironment } from './dsl.js';
export { pointRenderer } from './render.js';

/**
 * Kéo một điểm sang chỗ khác — thao tác **chủ lực** của sandbox hình học.
 *
 * Cả họ bài này là "sắp đặt các điểm sao cho…", nên thứ người học cần làm là
 * dịch chuyển điểm và nhìn ràng buộc đổi theo: kéo cho hết thẳng hàng, kéo cho
 * ra vị trí lồi. Thao tác đó cộng với `general-position` là một bài tập hoàn
 * chỉnh mà máy chấm được.
 */
const movePoint = defineCommand<{ id: string; to: [number, number] }>({
  type: 'point/move',
  label: () => 'Dời điểm',
  apply(scene, params) {
    const index = scene.elements.findIndex(
      (e) => e.id === params.id && e.type === 'point',
    );
    if (index === -1) return null;

    const elements = scene.elements.slice();
    elements[index] = { ...(elements[index] as SceneElement), pos: [...params.to] };
    return { ...scene, elements };
  },
});

/** Nối hai điểm, hoặc bỏ đoạn nếu nó đã có. */
const toggleSegment = defineCommand<{ a: string; b: string }>({
  type: 'point/toggle-segment',
  label: () => 'Nối hai điểm',
  apply(scene, params) {
    if (params.a === params.b) return null;
    const hasPoint = (id: string): boolean =>
      scene.elements.some((e) => e.id === id && e.type === 'point');
    if (!hasPoint(params.a) || !hasPoint(params.b)) return null;

    const existing = scene.elements.findIndex(
      (e) =>
        e.type === 'segment' &&
        ((e['a'] === params.a && e['b'] === params.b) ||
          (e['a'] === params.b && e['b'] === params.a)),
    );
    if (existing !== -1) {
      return { ...scene, elements: scene.elements.filter((_, i) => i !== existing) };
    }

    const id = `seg-${params.a}-${params.b}`;
    if (scene.elements.some((e) => e.id === id)) return null;

    return {
      ...scene,
      elements: [...scene.elements, { id, type: 'segment', a: params.a, b: params.b }],
    };
  },
});

export const pointCommands: CommandRegistry = {
  [movePoint.type]: movePoint,
  [toggleSegment.type]: toggleSegment,
};

/** Chạm vào một điểm: bán kính chạm rộng hơn chấm vẽ, cho ngón tay (NFR-C2). */
export const pointHitTest: HitTest = (scene, point) => {
  const model = buildPoints(scene);
  const reach = POINT_RADIUS * 2.2;

  let best: string | null = null;
  let bestDistance = reach;
  for (const candidate of model.points) {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance <= bestDistance) {
      best = candidate.id;
      bestDistance = distance;
    }
  }
  return best === null ? [] : [best];
};

export const pointSchemaFragment: EngineSchemaFragment = {
  id: 'point',
  configSchema: PointConfig,
  elementSchemas: {
    point: PointElement,
    segment: SegmentElement,
    line: LineElement,
    polygon: PolygonElement,
  },
  bounds: { engine: 'point', limits: POINT_LIMITS },
  resolveValidator: resolvePointValidator,
  validatorIds: POINT_VALIDATOR_IDS,

  /**
   * Không có element ngầm định.
   *
   * Giao điểm của hai đoạn **trông** như một vật thể, nhưng nó không có danh
   * tính ổn định: dời một điểm đi thì nó biến mất, và cho nó một id là mời
   * anchor trỏ vào thứ có thể bốc hơi giữa hai step. Muốn nói về một giao điểm
   * thì đặt hẳn một `point` ở đó.
   */
  implicitElementIds(): Set<string> {
    return new Set();
  },

  checkBounds(scene: Scene, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const model = buildPoints(scene);

    if (model.points.length > POINT_LIMITS.maxPoints) {
      issues.push({
        code: 'bounds/too-many-points',
        severity: 'error',
        message: `${model.points.length} điểm, vượt trần ${POINT_LIMITS.maxPoints}`,
        path: `${path}/elements`,
      });
    }

    if (model.segments.length > POINT_LIMITS.maxSegments) {
      issues.push({
        code: 'bounds/too-many-segments',
        severity: 'error',
        message: `${model.segments.length} đoạn, vượt trần ${POINT_LIMITS.maxSegments}`,
        path: `${path}/elements`,
        hint: 'Đếm giao điểm là O(s²); trần đặt theo chỗ đó',
      });
    }

    // Đoạn và đa giác trỏ tới điểm không tồn tại: im lặng thì đoạn biến mất
    // khỏi hình mà không ai biết, và mọi phép đếm giao điểm lệch theo.
    const known = new Set(model.points.map((p) => p.id));
    for (const segment of [...model.segments, ...model.lines]) {
      for (const end of [segment.a, segment.b]) {
        if (!known.has(end)) {
          issues.push({
            code: 'bounds/unknown-point-ref',
            severity: 'error',
            message: `Đoạn "${segment.id}" nối tới điểm "${end}" không có trong scene`,
            path: `${path}/elements`,
          });
        }
      }
    }
    for (const polygon of model.polygons) {
      for (const id of polygon.points) {
        if (!known.has(id)) {
          issues.push({
            code: 'bounds/unknown-point-ref',
            severity: 'error',
            message: `Đa giác "${polygon.id}" đi qua điểm "${id}" không có trong scene`,
            path: `${path}/elements`,
          });
        }
      }
    }

    // Hai điểm trùng toạ độ: bao lồi, thẳng hàng và giao điểm đều mất nghĩa,
    // còn hình thì trông như thiếu mất một điểm.
    const seen = new Map<string, string>();
    for (const point of model.points) {
      const key = `${point.x} ${point.y}`;
      const other = seen.get(key);
      if (other !== undefined) {
        issues.push({
          code: 'bounds/duplicate-position',
          severity: 'error',
          message: `Điểm "${point.id}" trùng toạ độ với "${other}"`,
          path: `${path}/elements`,
          hint: 'Hai điểm chồng nhau nhìn ra một điểm, và mọi phép đếm lệch theo',
        });
      } else {
        seen.set(key, point.id);
      }
    }

    return issues;
  },
};
