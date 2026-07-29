import { defineCommand, type CommandRegistry, type HitTest } from '@combviz/editor';
import {
  parseValidatorId,
  type EngineSchemaFragment,
  type Scene,
  type SceneElement,
  type SceneValidator,
  type ValidationIssue,
} from '@combviz/schema';
import { buildGraph, VERTEX_RADIUS } from './graph.js';
import { layoutPositions, type LayoutId } from './layout.js';
import { bipartite, connectedComponents, matching, planarity } from './analyzers.js';
import { analyzePoset } from './poset.js';
import { EdgeElement, GRAPH_LIMITS, GraphConfig, VertexElement } from './schema.js';

export * from './schema.js';
export { graphTools } from './tools.js';
export * from './graph.js';
export * from './layout.js';
export * from './analyzers.js';
export * from './poset.js';
export * from './dsl.js';
export { graphRenderer } from './render.js';

// ---------------------------------------------------------------------------
// Command (ENG-01, GR-01/GR-02)
// ---------------------------------------------------------------------------

const addVertex = defineCommand<{ id: string; pos: [number, number]; label?: string }>({
  type: 'graph/add-vertex',
  label: (p) => `Thêm đỉnh${p.label ? ` ${p.label}` : ''}`,
  apply(scene, params) {
    if (scene.elements.some((e) => e.id === params.id)) return null;
    const vertex: SceneElement = {
      id: params.id,
      type: 'vertex',
      pos: [params.pos[0], params.pos[1]],
      ...(params.label === undefined ? {} : { label: params.label }),
    };
    return { ...scene, elements: [...scene.elements, vertex] };
  },
});

/**
 * Thêm cạnh, tự chọn `multi_index` sao cho cạnh song song không đè lên nhau.
 *
 * Tính chỉ số từ **scene hiện tại** chứ không nhận từ tham số: đây là suy diễn
 * xác định từ trạng thái, nên lệnh vẫn replay được. Bắt phía gọi phải đếm hộ sẽ
 * đẩy một luật vẽ ra khỏi engine.
 */
const addEdge = defineCommand<{ id: string; u: string; v: string; color_class?: number }>({
  type: 'graph/add-edge',
  label: () => 'Thêm cạnh',
  apply(scene, params) {
    if (scene.elements.some((e) => e.id === params.id)) return null;

    const hasEndpoints = ['u', 'v'].every((key) =>
      scene.elements.some(
        (e) => e.type === 'vertex' && e.id === params[key as 'u' | 'v'],
      ),
    );
    if (!hasEndpoints) return null;

    const parallel = scene.elements.filter(
      (e) =>
        e.type === 'edge' &&
        ((e['u'] === params.u && e['v'] === params.v) ||
          (e['u'] === params.v && e['v'] === params.u)),
    );

    const edge: SceneElement = {
      id: params.id,
      type: 'edge',
      u: params.u,
      v: params.v,
      ...(parallel.length > 0 ? { multi_index: parallel.length } : {}),
      ...(params.color_class === undefined ? {} : { color_class: params.color_class }),
    };

    return { ...scene, elements: [...scene.elements, edge] };
  },
});

const setColorClass = defineCommand<{ ids: readonly string[]; color_class: number | null }>({
  type: 'graph/set-color',
  label: (p) =>
    p.color_class === null ? 'Xoá màu' : `Đổi sang màu ${p.color_class}`,
  apply(scene, params) {
    const targets = new Set(params.ids);
    let changed = false;

    const elements = scene.elements.map((element) => {
      if (!targets.has(element.id)) return element;
      if (element.color_class === (params.color_class ?? undefined)) return element;
      changed = true;
      if (params.color_class === null) {
        const { color_class: _dropped, ...rest } = element;
        return rest as SceneElement;
      }
      return { ...element, color_class: params.color_class };
    });

    return changed ? { ...scene, elements } : null;
  },
});

const moveVertex = defineCommand<{ id: string; pos: [number, number] }>({
  type: 'graph/move-vertex',
  label: () => 'Di chuyển đỉnh',
  apply(scene, params) {
    const index = scene.elements.findIndex((e) => e.id === params.id);
    if (index === -1) return null;

    const current = scene.elements[index] as SceneElement;
    if (current.type !== 'vertex' || current['locked']) return null;

    const elements = [...scene.elements];
    elements[index] = { ...current, pos: [params.pos[0], params.pos[1]] };
    return { ...scene, elements };
  },
});

/**
 * GR-02 — áp layout dựng sẵn và **bake thành toạ độ tĩnh**.
 *
 * Không có "chế độ layout" lưu trong scene: nếu có, mở lại bài trên một phiên
 * bản khác của thuật toán sẽ ra hình khác, mà hình là nội dung sư phạm. Layout
 * là một thao tác một lần, kết quả là số.
 */
const applyLayout = defineCommand<{ layout: LayoutId; topSide?: readonly string[]; columns?: number }>({
  type: 'graph/apply-layout',
  label: (p) => `Sắp lại: ${p.layout}`,
  apply(scene, params) {
    const ids = scene.elements.filter((e) => e.type === 'vertex').map((e) => e.id);
    if (ids.length === 0) return null;

    const positions = layoutPositions(ids, params.layout, {
      ...(params.topSide ? { topSide: params.topSide } : {}),
      ...(params.columns === undefined ? {} : { columns: params.columns }),
    });

    return {
      ...scene,
      elements: scene.elements.map((element) => {
        const pos = positions.get(element.id);
        return element.type === 'vertex' && pos ? { ...element, pos } : element;
      }),
    };
  },
});

const removeElements = defineCommand<{ ids: readonly string[] }>({
  type: 'graph/remove',
  label: (p) => (p.ids.length === 1 ? 'Xoá' : `Xoá ${p.ids.length} phần tử`),
  apply(scene, params) {
    const doomed = new Set(params.ids);
    // Xoá một đỉnh phải xoá cả cạnh kề nó, nếu không scene còn lại cạnh trỏ vào
    // hư vô — hợp lệ về schema, vô nghĩa về đồ thị.
    const kept = scene.elements.filter((e) => {
      if (e['locked']) return true;
      if (doomed.has(e.id)) return false;
      if (e.type === 'edge') {
        return !doomed.has(String(e['u'])) && !doomed.has(String(e['v']));
      }
      return true;
    });

    return kept.length === scene.elements.length ? null : { ...scene, elements: kept };
  },
});

export const graphCommands: CommandRegistry = {
  [addVertex.type]: addVertex,
  [addEdge.type]: addEdge,
  [setColorClass.type]: setColorClass,
  [moveVertex.type]: moveVertex,
  [applyLayout.type]: applyLayout,
  [removeElements.type]: removeElements,
};

// ---------------------------------------------------------------------------
// Hit test (A-05)
// ---------------------------------------------------------------------------

export const graphHitTest: HitTest = (scene, point) => {
  const graph = buildGraph(scene);
  const hits: string[] = [];

  // Đỉnh trước cạnh: đỉnh nằm trên, và chạm gần một đỉnh gần như luôn có nghĩa là
  // muốn chọn đỉnh đó chứ không phải cạnh đi qua nó.
  for (const vertex of graph.vertices) {
    if (Math.hypot(vertex.x - point.x, vertex.y - point.y) <= VERTEX_RADIUS * 1.3) {
      hits.push(vertex.id);
    }
  }

  const tolerance = VERTEX_RADIUS * 0.8;
  for (const edge of graph.edges) {
    const u = graph.byId.get(edge.u);
    const v = graph.byId.get(edge.v);
    if (!u || !v || edge.u === edge.v) continue;
    if (distanceToSegment(point, u, v) <= tolerance) hits.push(edge.id);
  }

  return hits;
};

function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

const simpleGraph: SceneValidator = {
  id: 'simple-graph',
  label: 'Đồ thị đơn (không khuyên, không cạnh bội)',
  check(scene) {
    const graph = buildGraph(scene);
    const seen = new Set<string>();
    const violations: string[] = [];

    for (const edge of graph.edges) {
      if (edge.u === edge.v) {
        violations.push(edge.id);
        continue;
      }
      const key = [edge.u, edge.v].sort().join('~');
      if (seen.has(key)) violations.push(edge.id);
      seen.add(key);
    }

    return violations.length === 0
      ? { ok: true, violations: [] }
      : { ok: false, violations, message: `${violations.length} cạnh vi phạm` };
  },
};

const connected: SceneValidator = {
  id: 'connected',
  label: 'Liên thông',
  check(scene) {
    const graph = buildGraph(scene);
    if (graph.vertices.length === 0) return { ok: true, violations: [] };

    const components = connectedComponents(graph);
    if (components.count === 1) return { ok: true, violations: [] };

    // Chỉ ra đỉnh **không** thuộc thành phần lớn nhất: chúng là phần bị rời ra.
    const sizes = new Map<number, string[]>();
    for (const [id, component] of components.componentOf) {
      sizes.set(component, [...(sizes.get(component) ?? []), id]);
    }
    const largest = [...sizes.values()].sort((a, b) => b.length - a.length)[0] ?? [];
    const inLargest = new Set(largest);

    return {
      ok: false,
      violations: graph.vertices.filter((v) => !inLargest.has(v.id)).map((v) => v.id),
      message: `${components.count} thành phần liên thông`,
    };
  },
};

const isBipartite: SceneValidator = {
  id: 'bipartite',
  label: 'Hai phía',
  check(scene) {
    const result = bipartite(buildGraph(scene));
    return result.bipartite
      ? { ok: true, violations: [] }
      : {
          ok: false,
          violations: result.oddCycle,
          message: `Có chu trình lẻ độ dài ${result.oddCycle.length}`,
        };
  },
};

/**
 * Không có tam giác đơn sắc.
 *
 * Với bài $R(3,3)=6$ thì **chính việc validator này luôn đỏ là bài học**: người
 * học tô hết cách này đến cách khác trên $K_6$ và không bao giờ tránh được. Đó là
 * cách duy nhất để "không thể tránh" trở thành một điều họ tự phát hiện thay vì
 * một câu ta bảo họ tin.
 *
 * Duyệt bộ ba nên là O(n³); chặn ở 30 đỉnh (27 000 bộ ba) để nó vẫn chạy được
 * trong một lần thao tác mà không cần worker.
 */
const MONO_TRIANGLE_LIMIT = 30;

const noMonoTriangle: SceneValidator = {
  id: 'no-mono-triangle',
  label: 'Không có tam giác đơn sắc',
  check(scene) {
    const graph = buildGraph(scene);
    if (graph.vertices.length > MONO_TRIANGLE_LIMIT) {
      return {
        ok: true,
        violations: [],
        message: `Bỏ qua: đồ thị quá ${MONO_TRIANGLE_LIMIT} đỉnh`,
      };
    }

    // Cạnh chưa tô (color_class 0) không tạo thành tam giác đơn sắc: "chưa xét"
    // khác với "cùng màu".
    const colorOf = new Map<string, { color: number; id: string }>();
    for (const edge of graph.edges) {
      if (edge.colorClass === 0) continue;
      colorOf.set([edge.u, edge.v].sort().join('~'), {
        color: edge.colorClass,
        id: edge.id,
      });
    }

    const ids = graph.vertices.map((v) => v.id);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        for (let k = j + 1; k < ids.length; k += 1) {
          const ab = colorOf.get([ids[i] as string, ids[j] as string].sort().join('~'));
          const bc = colorOf.get([ids[j] as string, ids[k] as string].sort().join('~'));
          const ca = colorOf.get([ids[i] as string, ids[k] as string].sort().join('~'));
          if (!ab || !bc || !ca) continue;
          if (ab.color === bc.color && bc.color === ca.color) {
            return {
              ok: false,
              violations: [ab.id, bc.id, ca.id],
              message: `Tam giác đơn sắc màu ${ab.color}`,
            };
          }
        }
      }
    }

    return { ok: true, violations: [] };
  },
};

/**
 * Không chứa tam giác — ràng buộc của cả cụm bài cực trị kiểu Turán (§16).
 *
 * Khác `no-mono-triangle` ở một điểm quyết định: validator kia hỏi về **màu**
 * cạnh và bỏ qua cạnh chưa tô, còn cái này hỏi về **sự tồn tại** của cạnh. Bài
 * "đồ thị $n$ đỉnh không tam giác có nhiều nhất bao nhiêu cạnh" không có màu nào
 * cả, nên trước khi có validator này nó chỉ kiểm gián tiếp được bằng
 * `bipartite` — một ràng buộc mạnh hơn hẳn, tức là cấm nhầm cả những đồ thị hợp
 * lệ (chu trình $5$ đỉnh không có tam giác mà cũng không hai phía).
 *
 * Cùng bound O(n³) và cùng lý do với `no-mono-triangle`.
 */
const triangleFree: SceneValidator = {
  id: 'triangle-free',
  label: 'Không có tam giác',
  check(scene) {
    const graph = buildGraph(scene);
    if (graph.vertices.length > MONO_TRIANGLE_LIMIT) {
      return {
        ok: true,
        violations: [],
        message: `Bỏ qua: đồ thị quá ${MONO_TRIANGLE_LIMIT} đỉnh`,
      };
    }

    // Khuyên (u == v) không tham gia tam giác; bỏ chúng ra để cạnh song song
    // cũng không tự tạo "tam giác" giả.
    const edgeOf = new Map<string, string>();
    for (const edge of graph.edges) {
      if (edge.u === edge.v) continue;
      edgeOf.set([edge.u, edge.v].sort().join('~'), edge.id);
    }

    const ids = graph.vertices.map((v) => v.id);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const ab = edgeOf.get([ids[i] as string, ids[j] as string].sort().join('~'));
        if (!ab) continue;
        for (let k = j + 1; k < ids.length; k += 1) {
          const bc = edgeOf.get([ids[j] as string, ids[k] as string].sort().join('~'));
          const ca = edgeOf.get([ids[i] as string, ids[k] as string].sort().join('~'));
          if (bc && ca) {
            return {
              ok: false,
              violations: [ab, bc, ca],
              message: 'Có tam giác',
            };
          }
        }
      }
    }

    return { ok: true, violations: [] };
  },
};

/**
 * `plane-drawing` — hình vẽ hiện tại không có cạnh nào cắt nhau (GR-05).
 *
 * Ràng buộc về **hình**, không về đồ thị, và đó là chủ ý: nó biến "vẽ lại đồ thị
 * này cho phẳng" thành một bài tập Sandbox chấm được. Người học kéo đỉnh, số
 * giao điểm giảm dần, và khi về 0 thì họ vừa **chứng minh** đồ thị phẳng — bằng
 * đúng cách một bài thi chấp nhận.
 */
const planeDrawing: SceneValidator = {
  id: 'plane-drawing',
  label: 'Không cạnh nào cắt nhau',
  check(scene) {
    const result = planarity(buildGraph(scene));
    if (result.value === null) {
      return { ok: true, violations: [], message: `Bỏ qua: ${result.refused ?? ''}` };
    }
    const crossings = result.value.crossings;
    return crossings.length === 0
      ? { ok: true, violations: [] }
      : {
          ok: false,
          violations: [...new Set(crossings.flat())],
          message: `${crossings.length} chỗ cắt nhau`,
        };
  },
};

/**
 * `matching-saturates-left` — mọi đỉnh phía trái đều được ghép (GR-06).
 *
 * Ràng buộc trung tâm của cụm Hall: "ghép đủ" là mục tiêu, và khi không đạt thì
 * `violations` trả về **đúng tập vi phạm Hall**, không phải một danh sách đỉnh
 * lẻ tẻ. Người học nhìn thấy ngay tập nào quá đông so với hàng xóm của nó.
 */
const matchingSaturatesLeft: SceneValidator = {
  id: 'matching-saturates-left',
  label: 'Ghép cặp phủ hết một phía',
  check(scene) {
    const result = matching(buildGraph(scene));
    if (result.value === null) {
      return { ok: true, violations: [], message: `Bỏ qua: ${result.refused ?? ''}` };
    }
    const { size, left, hallViolator } = result.value;
    return size === left.length
      ? { ok: true, violations: [] }
      : {
          ok: false,
          violations: [...hallViolator],
          message: `Thiếu ${left.length - size} cặp; tập vi phạm Hall có ${hallViolator.length} đỉnh nhưng chỉ ${result.value.hallNeighbourhood.length} hàng xóm`,
        };
  },
};

/**
 * `hasse-diagram` — đồ thị là sơ đồ Hasse hợp lệ: có hướng, không chu trình, và
 * **không cạnh nào thừa**.
 *
 * Cạnh bắc cầu không sai về quan hệ nhưng sai về hình: sơ đồ Hasse chỉ vẽ quan
 * hệ phủ, nên một cạnh $a \to c$ vẽ thêm cạnh $a \to b \to c$ làm người đọc
 * tưởng nó mang thông tin mới. `violations` trả về đúng những cạnh thừa ấy.
 */
const hasseDiagram: SceneValidator = {
  id: 'hasse-diagram',
  label: 'Sơ đồ Hasse hợp lệ',
  check(scene) {
    const result = analyzePoset(buildGraph(scene));
    if (!result.isPoset) {
      return {
        ok: false,
        violations: [...result.cycle],
        message: 'Có chu trình có hướng nên không phải thứ tự bộ phận',
      };
    }
    return result.redundantEdges.length === 0
      ? { ok: true, violations: [] }
      : {
          ok: false,
          violations: [...result.redundantEdges],
          message: `${result.redundantEdges.length} cạnh bắc cầu vẽ thừa`,
        };
  },
};

const FIXED: readonly SceneValidator[] = [
  simpleGraph,
  connected,
  isBipartite,
  noMonoTriangle,
  triangleFree,
  planeDrawing,
  matchingSaturatesLeft,
  hasseDiagram,
];

export function resolveGraphValidator(id: string): SceneValidator | null {
  const found = FIXED.find((v) => v.id === id);
  if (found) return found;

  const { name, arg } = parseValidatorId(id);
  if (name === 'max-degree' && arg !== undefined) {
    return {
      id,
      label: `Mọi đỉnh có bậc ≤ ${arg}`,
      check(scene) {
        const graph = buildGraph(scene);
        const violations = graph.vertices
          .filter((v) => (graph.degree.get(v.id) ?? 0) > arg)
          .map((v) => v.id);
        return violations.length === 0
          ? { ok: true, violations: [] }
          : { ok: false, violations, message: `${violations.length} đỉnh vượt bậc ${arg}` };
      },
    };
  }

  return null;
}

export const GRAPH_VALIDATOR_IDS: readonly string[] = [
  ...FIXED.map((v) => v.id),
  'max-degree:<k>',
];

// ---------------------------------------------------------------------------
// Schema fragment
// ---------------------------------------------------------------------------

export const graphSchemaFragment: EngineSchemaFragment = {
  id: 'graph',
  configSchema: GraphConfig,
  elementSchemas: { vertex: VertexElement, edge: EdgeElement },
  bounds: { engine: 'graph', limits: GRAPH_LIMITS },
  resolveValidator: resolveGraphValidator,
  validatorIds: GRAPH_VALIDATOR_IDS,

  /** Đồ thị không có element ngầm định — mọi đỉnh và cạnh đều nằm trong file. */
  implicitElementIds: () => new Set<string>(),

  checkBounds(scene: Scene, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const vertices = scene.elements.filter((e) => e.type === 'vertex');
    const edges = scene.elements.filter((e) => e.type === 'edge');

    if (vertices.length > GRAPH_LIMITS.maxVertices) {
      issues.push({
        code: 'bounds/too-many-vertices',
        severity: 'error',
        message: `${vertices.length} đỉnh, vượt trần ${GRAPH_LIMITS.maxVertices}`,
        path: `${path}/elements`,
      });
    }

    if (edges.length > GRAPH_LIMITS.maxEdges) {
      issues.push({
        code: 'bounds/too-many-edges',
        severity: 'error',
        message: `${edges.length} cạnh, vượt trần ${GRAPH_LIMITS.maxEdges}`,
        path: `${path}/elements`,
      });
    }

    // Cạnh trỏ vào đỉnh không tồn tại là loại lỗi **im lặng**: analyzer bỏ qua nó,
    // hình vẫn vẽ ra bình thường, và bậc đỉnh trong lời giải sai đi một đơn vị mà
    // không có gì báo.
    const vertexIds = new Set(vertices.map((v) => v.id));
    scene.elements.forEach((element, i) => {
      if (element.type !== 'edge') return;
      for (const end of ['u', 'v'] as const) {
        const target = String(element[end]);
        if (!vertexIds.has(target)) {
          issues.push({
            code: 'graph/edge-dangling',
            severity: 'error',
            message: `Cạnh "${element.id}" trỏ tới đỉnh "${target}" không tồn tại`,
            path: `${path}/elements/${i}/${end}`,
          });
        }
      }
    });

    return issues;
  },
};
