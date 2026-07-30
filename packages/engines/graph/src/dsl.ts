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
import {
  bipartite,
  connectedComponents,
  isTree,
  matching,
  permutationCycles,
  planarity,
  pruferCode,
} from './analyzers.js';
import { analyzePoset } from './poset.js';
import { buildGraph, type GraphModel } from './graph.js';

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

  // Mã Prüfer chỉ tồn tại khi đồ thị **là cây**. Với đồ thị khác, `in_code` và
  // `prufer_code` **vắng mặt** thay vì mang một giá trị mặc định: một claim viết
  // trên số 0 sẽ đạt, bài trông như đã kiểm, mà con số ấy không có nghĩa gì.
  const prufer = pruferCode(graph).value;

  const vertices = graph.vertices.map((v) =>
    element(v.id, {
      label: v.label ?? '',
      color_class: v.colorClass,
      deg: graph.degree.get(v.id) ?? 0,
      component: components.componentOf.get(v.id) ?? 0,
      side: parts.bipartite ? (parts.side.get(v.id) ?? 0) : 0,
      x: v.x,
      y: v.y,
      ...(prufer ? { in_code: prufer.occurrences.get(v.id) ?? 0 } : {}),
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
  const prufer = pruferCode(graph).value;
  const cyclesOf = permutationCycles(graph);
  const match = matching(graph).value;
  const plane = planarity(graph).value;
  const order = analyzePoset(graph);

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

      /**
       * Cây và mã Prüfer (GR-09).
       *
       * `prufer_code` là **chuỗi nhãn nối bằng dấu phẩy**, để một claim viết được
       * thẳng: `prufer_code == "4,5,5"`. Đồ thị không phải cây thì binding này
       * **vắng mặt** — cây hai đỉnh có mã rỗng, nên trả `""` sẽ trộn hai chuyện
       * khác hẳn nhau vào một giá trị.
       */
      is_tree: isTree(graph),
      leaves: graph.vertices.filter((v) => (graph.degree.get(v.id) ?? 0) === 1).length,
      ...(prufer
        ? {
            prufer_code: prufer.code
              .map((id) => graph.byId.get(id)?.label ?? id)
              .join(','),
          }
        : {}),
      /**
       * Số chu trình khi đồ thị có hướng là một hoán vị, và **dấu** của nó.
       *
       * Bài "sắp xếp bằng đổi chỗ" xoay quanh đúng hai con số này; bắt tác giả
       * tự nhẩm rồi viết vào narrative là mời một lỗi không ai kiểm được.
       * Đồ thị không phải hoán vị thì cả hai bằng 0 — đọc ra ngay là "câu hỏi
       * này không áp dụng" thay vì một con số trông có vẻ đúng.
       */
      cycles: cyclesOf.isPermutation ? cyclesOf.cycles.length : 0,
      sign: cyclesOf.isPermutation ? cyclesOf.sign : 0,
      fixed_points: cyclesOf.isPermutation ? cyclesOf.fixedPoints : 0,

      /**
       * Cụm Hall/König (GR-06).
       *
       * `matching` và `cover` bằng nhau **theo định lý König**, nên viết cả hai
       * vào invariant strip là cách rẻ nhất để người học tự thấy định lý đó
       * đúng trên bài đang mở, thay vì đọc một câu khẳng định.
       *
       * Đồ thị không hai phía thì cả ba bằng $-1$: thuật toán đường tăng không
       * áp dụng được, và trả về 0 sẽ đọc nhầm thành "không ghép được cặp nào".
       * $-1$ thì không ai nhầm với một phép đếm.
       */
      matching: match?.size ?? -1,
      cover: match?.cover.length ?? -1,
      unmatched: match ? match.left.length - match.size : -1,

      /**
       * Tính phẳng (GR-05). `crossings` đếm giao điểm **trong hình đã vẽ**, nên
       * nó là một sự thật về hình chứ không phải về đồ thị — và đó chính là
       * điều làm nó dùng được: "vẽ lại cho hết cắt nhau" là một mục tiêu người
       * học kiểm được bằng mắt và invariant strip đếm hộ.
       *
       * `faces` chỉ có nghĩa khi hình đã hết giao điểm; khi còn cắt nhau thì
       * bằng 0. Đồ thị không đơn thì cả hai bằng $-1$ (analyzer từ chối).
       */
      crossings: plane ? plane.crossings.length : -1,
      faces: plane ? plane.faces : -1,
      max_planar_edges: plane ? plane.maxEdges : -1,

      /**
       * Thứ tự bộ phận: chiều cao (xích dài nhất) và chiều rộng (phản xích lớn
       * nhất).
       *
       * Hai con số này **là** hai vế của định lý Dilworth và định lý Mirsky, nên
       * đặt cạnh nhau trong bảng bất biến là cách rẻ nhất để người học tự thấy
       * chúng đúng trên bài đang mở. Đồ thị có chu trình thì cả hai bằng $-1$:
       * không phải poset, và trả $0$ sẽ đọc nhầm thành "rỗng".
       */
      height: order.isPoset ? order.height : -1,
      width: order.isPoset ? order.width : -1,
      minimal: order.minimal.length,
      maximal: order.maximal.length,
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
