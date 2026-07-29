import type { Scene } from '@combviz/schema';
import { buildGraph, type GraphModel } from './graph.js';
import { GRAPH_LIMITS } from './schema.js';

/**
 * Kết quả của một analyzer (GR-03/GR-04).
 *
 * `refused` không phải lỗi — nó là "bài này vượt bound, tôi không chạy". NFR-P4
 * đòi từ chối **kèm thông báo rõ** thay vì treo máy, nên trạng thái đó phải nằm
 * trong kiểu dữ liệu chứ không phải trong một `null` mà chỗ gọi tự đoán nghĩa.
 */
export interface AnalyzerResult<T> {
  readonly value: T | null;
  readonly refused?: string;
}

const ok = <T>(value: T): AnalyzerResult<T> => ({ value });
const refuse = <T>(reason: string): AnalyzerResult<T> => ({ value: null, refused: reason });

// ---------------------------------------------------------------------------
// Thành phần liên thông
// ---------------------------------------------------------------------------

export interface Components {
  /** Chỉ số thành phần của mỗi đỉnh, đánh số từ 1 để dùng thẳng làm color_class. */
  readonly componentOf: ReadonlyMap<string, number>;
  readonly count: number;
}

export function connectedComponents(graph: GraphModel): Components {
  const componentOf = new Map<string, number>();
  let count = 0;

  for (const vertex of graph.vertices) {
    if (componentOf.has(vertex.id)) continue;
    count += 1;

    const queue = [vertex.id];
    componentOf.set(vertex.id, count);

    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const { to } of graph.adjacency.get(current) ?? []) {
        if (componentOf.has(to)) continue;
        componentOf.set(to, count);
        queue.push(to);
      }
    }
  }

  return { componentOf, count };
}

// ---------------------------------------------------------------------------
// Hai phía
// ---------------------------------------------------------------------------

export interface Bipartition {
  readonly bipartite: boolean;
  /** Lớp 1 hoặc 2 cho mỗi đỉnh, dùng thẳng làm color_class khi tô hai lớp. */
  readonly side: ReadonlyMap<string, number>;
  /** Khi không hai phía: một chu trình lẻ làm nhân chứng. */
  readonly oddCycle: readonly string[];
}

export function bipartite(graph: GraphModel): Bipartition {
  const side = new Map<string, number>();
  const parent = new Map<string, string>();

  for (const start of graph.vertices) {
    if (side.has(start.id)) continue;
    side.set(start.id, 1);

    const queue = [start.id];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      const currentSide = side.get(current) as number;

      for (const { to } of graph.adjacency.get(current) ?? []) {
        // Khuyên là chu trình lẻ độ dài 1 — kết luận ngay, không cần BFS thêm.
        if (to === current) {
          return { bipartite: false, side, oddCycle: [current] };
        }

        const other = side.get(to);
        if (other === undefined) {
          side.set(to, currentSide === 1 ? 2 : 1);
          parent.set(to, current);
          queue.push(to);
        } else if (other === currentSide) {
          return {
            bipartite: false,
            side,
            oddCycle: pathBetween(parent, current, to),
          };
        }
      }
    }
  }

  return { bipartite: true, side, oddCycle: [] };
}

/** Đường nối hai đỉnh qua cây BFS, dùng làm nhân chứng chu trình lẻ. */
function pathBetween(
  parent: ReadonlyMap<string, string>,
  a: string,
  b: string,
): string[] {
  const ancestors = new Set<string>();
  for (let cursor: string | undefined = a; cursor; cursor = parent.get(cursor)) {
    ancestors.add(cursor);
  }

  const tail: string[] = [];
  let meeting = b;
  while (!ancestors.has(meeting)) {
    tail.push(meeting);
    const next = parent.get(meeting);
    if (!next) break;
    meeting = next;
  }

  const head: string[] = [];
  for (let cursor: string | undefined = a; cursor && cursor !== meeting; cursor = parent.get(cursor)) {
    head.push(cursor);
  }

  return [...head, meeting, ...tail.reverse()];
}

// ---------------------------------------------------------------------------
// Chu trình
// ---------------------------------------------------------------------------

/**
 * Tìm **một** chu trình bất kỳ, trả về dãy đỉnh.
 *
 * Đủ cho GR-03 ("tìm và highlight một chu trình"): mục đích là chỉ cho người học
 * thấy một chu trình cụ thể, không phải liệt kê mọi chu trình.
 */
export function findCycle(graph: GraphModel): readonly string[] {
  const visited = new Set<string>();
  const stack = new Map<string, number>();
  const path: string[] = [];

  const dfs = (current: string, viaEdge: string | null): string[] | null => {
    visited.add(current);
    stack.set(current, path.length);
    path.push(current);

    for (const { to, edge } of graph.adjacency.get(current) ?? []) {
      // Khuyên: chu trình độ dài 1.
      if (to === current) return [current];
      // Không quay lại **đúng cạnh** vừa đi; quay lại qua một cạnh song song khác
      // thì lại là chu trình thật (độ dài 2) và phải được nhận ra.
      if (edge === viaEdge) continue;

      const depth = stack.get(to);
      if (depth !== undefined) return path.slice(depth);
      if (!visited.has(to)) {
        const found = dfs(to, edge);
        if (found) return found;
      }
    }

    stack.delete(current);
    path.pop();
    return null;
  };

  for (const vertex of graph.vertices) {
    if (visited.has(vertex.id)) continue;
    const found = dfs(vertex.id, null);
    if (found) return found;
  }

  return [];
}

// ---------------------------------------------------------------------------
// Euler
// ---------------------------------------------------------------------------

export interface EulerResult {
  readonly kind: 'circuit' | 'path' | 'none';
  /** Dãy id cạnh theo thứ tự đi — thứ mà GR-03 phải chỉ ra, không chỉ nói "có". */
  readonly trail: readonly string[];
  readonly oddVertices: readonly string[];
  readonly reason?: string;
}

export function eulerian(graph: GraphModel): EulerResult {
  const odd = graph.vertices
    .filter((v) => (graph.degree.get(v.id) ?? 0) % 2 === 1)
    .map((v) => v.id);

  const active = graph.vertices.filter((v) => (graph.degree.get(v.id) ?? 0) > 0);
  if (active.length === 0) {
    return { kind: 'none', trail: [], oddVertices: [], reason: 'Đồ thị không có cạnh' };
  }

  // Chỉ xét liên thông trên các đỉnh **có cạnh**: một đỉnh cô lập không phá vỡ
  // sự tồn tại của đường Euler, nó chỉ không nằm trên đường đó.
  const components = connectedComponents(graph);
  const activeComponents = new Set(active.map((v) => components.componentOf.get(v.id)));
  if (activeComponents.size > 1) {
    return {
      kind: 'none',
      trail: [],
      oddVertices: odd,
      reason: 'Các cạnh không nằm trong cùng một thành phần liên thông',
    };
  }

  if (odd.length > 2) {
    return {
      kind: 'none',
      trail: [],
      oddVertices: odd,
      reason: `Có ${odd.length} đỉnh bậc lẻ; đường Euler cần 0 hoặc 2`,
    };
  }

  const start = odd[0] ?? (active[0] as { id: string }).id;
  const trail = hierholzer(graph, start);

  return {
    kind: odd.length === 0 ? 'circuit' : 'path',
    trail,
    oddVertices: odd,
  };
}

function hierholzer(graph: GraphModel, start: string): string[] {
  const used = new Set<string>();
  const cursor = new Map<string, number>();
  const stack: string[] = [start];
  const trail: string[] = [];

  while (stack.length > 0) {
    const current = stack[stack.length - 1] as string;
    const list = graph.adjacency.get(current) ?? [];

    let index = cursor.get(current) ?? 0;
    while (index < list.length && used.has((list[index] as { edge: string }).edge)) {
      index += 1;
    }
    cursor.set(current, index);

    if (index === list.length) {
      stack.pop();
      const previous = stack[stack.length - 1];
      if (previous !== undefined) {
        const edge = findUnusedBetween(graph, previous, current, trail);
        if (edge) trail.push(edge);
      }
      continue;
    }

    const { to, edge } = list[index] as { to: string; edge: string };
    used.add(edge);
    stack.push(to);
  }

  return trail.reverse();
}

/** Cạnh đã dùng để đi từ `a` sang `b` mà chưa được ghi vào trail. */
function findUnusedBetween(
  graph: GraphModel,
  a: string,
  b: string,
  trail: readonly string[],
): string | null {
  const recorded = new Set(trail);
  for (const edge of graph.edges) {
    if (recorded.has(edge.id)) continue;
    if ((edge.u === a && edge.v === b) || (edge.u === b && edge.v === a)) return edge.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hamilton (GR-04)
// ---------------------------------------------------------------------------

export interface HamiltonResult {
  readonly kind: 'cycle' | 'path' | 'none';
  readonly order: readonly string[];
}

/**
 * Backtracking, chỉ chạy khi `n ≤ 20` (NFR-P4).
 *
 * Vượt bound thì **từ chối kèm lý do**, không chạy rồi treo. Đây là khác biệt
 * giữa một công cụ minh hoạ lời giải thi đấu và một công cụ nghiên cứu (NG-05):
 * ta thà nói "bài này quá lớn cho tính năng này" còn hơn để người học nhìn một
 * cái spinner vô hạn.
 */
export function hamiltonian(graph: GraphModel): AnalyzerResult<HamiltonResult> {
  const n = graph.vertices.length;
  if (n === 0) return ok({ kind: 'none', order: [] });
  if (n > GRAPH_LIMITS.maxHamiltonVertices) {
    return refuse(
      `Đồ thị có ${n} đỉnh, vượt trần ${GRAPH_LIMITS.maxHamiltonVertices} của tìm chu trình Hamilton`,
    );
  }

  const ids = graph.vertices.map((v) => v.id);
  const neighbours = new Map<string, Set<string>>(
    ids.map((id) => [
      id,
      new Set((graph.adjacency.get(id) ?? []).map((entry) => entry.to).filter((to) => to !== id)),
    ]),
  );

  const path: string[] = [];
  const used = new Set<string>();

  const search = (current: string): 'cycle' | 'path' | null => {
    path.push(current);
    used.add(current);

    if (path.length === n) {
      const first = path[0] as string;
      const closes = neighbours.get(current)?.has(first) ?? false;
      if (closes) return 'cycle';
      // Giữ lại đường đi đầy đủ ngay cả khi không khép được: với nhiều bài, "có
      // đường đi qua mọi đỉnh" đã là kết luận cần.
      return 'path';
    }

    for (const next of neighbours.get(current) ?? []) {
      if (used.has(next)) continue;
      const found = search(next);
      if (found === 'cycle') return found;
      if (found === 'path') return found;
    }

    path.pop();
    used.delete(current);
    return null;
  };

  for (const start of ids) {
    const found = search(start);
    if (found) return ok({ kind: found, order: [...path] });
    path.length = 0;
    used.clear();
  }

  return ok({ kind: 'none', order: [] });
}

// ---------------------------------------------------------------------------
// Vỏ chạy trên Scene
// ---------------------------------------------------------------------------

export type GraphAnalyzerId =
  | 'components'
  | 'bipartite'
  | 'cycle'
  | 'euler'
  | 'hamilton';

export interface GraphAnalysis {
  readonly components: Components;
  readonly bipartite: Bipartition;
  readonly cycle: readonly string[];
  readonly euler: EulerResult;
  readonly hamilton: AnalyzerResult<HamiltonResult>;
}

/** Chạy toàn bộ analyzer. Dùng trong worker (ENG-04) và trong test. */
export function analyzeGraph(scene: Scene): GraphAnalysis {
  const graph = buildGraph(scene);
  return {
    components: connectedComponents(graph),
    bipartite: bipartite(graph),
    cycle: findCycle(graph),
    euler: eulerian(graph),
    hamilton: hamiltonian(graph),
  };
}
