import { hashScene } from '@combviz/render';
import {
  DslError,
  element,
  isElement,
  type DslEnvironment,
  type ElementValue,
  type Value,
} from '@combviz/dsl';
import type { Scene } from '@combviz/schema';
import { buildGraph, type GraphModel } from './graph.js';
import { bipartite, connectedComponents } from './analyzers.js';

/**
 * Trạng thái dẫn xuất của một scene đồ thị (A-04), memo theo hash scene.
 *
 * Bậc đỉnh và thành phần liên thông được tính **một lần** cho mỗi scene. Nếu để
 * `deg(v)` tự đếm mỗi lần gọi, một biểu thức cực trị như
 * `max(vertices, v => deg(v))` trên 300 đỉnh sẽ thành O(đỉnh × cạnh).
 */
interface GraphDerived {
  readonly graph: GraphModel;
  readonly vertices: readonly ElementValue[];
  readonly edges: readonly ElementValue[];
}

const cache = new Map<string, GraphDerived>();
const CACHE_LIMIT = 64;

function derive(scene: Scene): GraphDerived {
  const key = hashScene(scene);
  const hit = cache.get(key);
  if (hit) return hit;

  const graph = buildGraph(scene);
  const components = connectedComponents(graph);
  const parts = bipartite(graph);

  const vertices = graph.vertices.map((v) =>
    element(v.id, {
      label: v.label ?? '',
      color_class: v.colorClass,
      deg: graph.degree.get(v.id) ?? 0,
      component: components.componentOf.get(v.id) ?? 0,
      side: parts.bipartite ? (parts.side.get(v.id) ?? 0) : 0,
      x: v.x,
      y: v.y,
    }),
  );

  const edges = graph.edges.map((e) =>
    element(e.id, {
      color_class: e.colorClass,
      directed: e.directed,
      weight: e.weight ?? 0,
      loop: e.u === e.v,
      multi_index: e.multiIndex,
    }),
  );

  const derived: GraphDerived = { graph, vertices, edges };

  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, derived);
  return derived;
}

export function graphEnvironment(scene: Scene): DslEnvironment {
  const { graph, vertices, edges } = derive(scene);

  const neighbours = new Map<string, Set<string>>(
    graph.vertices.map((v) => [
      v.id,
      new Set((graph.adjacency.get(v.id) ?? []).map((entry) => entry.to)),
    ]),
  );

  return {
    bindings: {
      vertices,
      edges,
      n: graph.vertices.length,
      m: graph.edges.length,
      components: connectedComponents(graph).count,
    },
    builtins: {
      deg: (args, pos) => {
        const vertex = expectElement(args, pos, 'deg');
        return Number(vertex.props['deg'] ?? 0);
      },

      adjacent: (args, pos) => {
        const [a, b] = expectTwoElements(args, pos, 'adjacent');
        return neighbours.get(a.id)?.has(b.id) ?? false;
      },

      /** `incident(e, v)` — cạnh `e` có nối vào đỉnh `v` không. */
      incident: (args, pos) => {
        const [edge, vertex] = expectTwoElements(args, pos, 'incident');
        const found = graph.edges.find((e) => e.id === edge.id);
        return found ? found.u === vertex.id || found.v === vertex.id : false;
      },
    },
  };
}

function expectElement(args: readonly Value[], pos: number, fn: string): ElementValue {
  const [target] = args;
  if (args.length !== 1 || !target || !isElement(target)) {
    throw new DslError(`${fn}() cần đúng một element`, pos);
  }
  return target;
}

function expectTwoElements(
  args: readonly Value[],
  pos: number,
  fn: string,
): [ElementValue, ElementValue] {
  const [a, b] = args;
  if (args.length !== 2 || !a || !b || !isElement(a) || !isElement(b)) {
    throw new DslError(`${fn}() cần đúng hai element`, pos);
  }
  return [a, b];
}
