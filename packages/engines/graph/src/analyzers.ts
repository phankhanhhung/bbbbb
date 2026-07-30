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
  | 'hamilton'
  | 'matching'
  | 'planarity';

export interface GraphAnalysis {
  readonly components: Components;
  readonly bipartite: Bipartition;
  readonly cycle: readonly string[];
  readonly euler: EulerResult;
  readonly hamilton: AnalyzerResult<HamiltonResult>;
  readonly permutation: PermutationCycles;
  readonly matching: AnalyzerResult<MatchingResult>;
  readonly planarity: AnalyzerResult<PlanarityResult>;
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
    permutation: permutationCycles(graph),
    matching: matching(graph),
    planarity: planarity(graph),
  };
}

// ---------------------------------------------------------------------------
// Phân tích chu trình của một hoán vị
// ---------------------------------------------------------------------------

export interface PermutationCycles {
  /** Các chu trình, mỗi chu trình là dãy đỉnh theo thứ tự đi. */
  readonly cycles: readonly (readonly string[])[];
  /** Chỉ số chu trình của mỗi đỉnh, đánh số từ 1 để dùng thẳng làm color_class. */
  readonly cycleOf: ReadonlyMap<string, number>;
  /** Số điểm bất động (chu trình dài 1). */
  readonly fixedPoints: number;
  /**
   * Dấu của hoán vị: `+1` nếu chẵn, `-1` nếu lẻ.
   *
   * Bằng $(-1)^{n - c}$ với $c$ là số chu trình — công thức này là **chính** cái
   * mà cả họ bài "đổi chỗ" xoay quanh, nên nó phải là một con số đọc được chứ
   * không phải một điều tác giả tự nhẩm rồi viết vào narrative.
   */
  readonly sign: 1 | -1;
  /** `false` khi đồ thị không phải một hoán vị (có đỉnh ra ≠ 1 cạnh). */
  readonly isPermutation: boolean;
}

/**
 * Phân tích chu trình của hoán vị cho bởi đồ thị có hướng.
 *
 * Quy ước: mỗi đỉnh có **đúng một** cạnh có hướng đi ra, và cạnh $i \to j$ đọc là
 * $\sigma(i) = j$. Đồ thị nào không thoả thì trả `isPermutation: false` thay vì
 * đoán bừa — một "phân tích chu trình" của thứ không phải hoán vị là một câu trả
 * lời sai được trình bày tự tin.
 *
 * Không dựng engine riêng cho hoán vị: một hoán vị **là** một đồ thị có hướng, và
 * cái nó cần thêm chỉ là cách xếp đỉnh (layout hai hàng) cùng analyzer này.
 */
export function permutationCycles(graph: GraphModel): PermutationCycles {
  const next = new Map<string, string>();
  let valid = true;

  for (const vertex of graph.vertices) {
    const out = graph.edges.filter((e) => e.directed && e.u === vertex.id);
    if (out.length !== 1) {
      valid = false;
      continue;
    }
    next.set(vertex.id, (out[0] as { v: string }).v);
  }

  if (!valid || next.size !== graph.vertices.length) {
    return {
      cycles: [],
      cycleOf: new Map(),
      fixedPoints: 0,
      sign: 1,
      isPermutation: false,
    };
  }

  const cycleOf = new Map<string, number>();
  const cycles: string[][] = [];

  for (const vertex of graph.vertices) {
    if (cycleOf.has(vertex.id)) continue;

    const cycle: string[] = [];
    let current = vertex.id;
    while (!cycleOf.has(current)) {
      cycleOf.set(current, cycles.length + 1);
      cycle.push(current);
      current = next.get(current) as string;
    }

    // Chỉ nhận khi vòng khép về đúng điểm xuất phát. Với ánh xạ một-một thì luôn
    // vậy, nhưng kiểm rẻ hơn nhiều so với tin.
    if (current === vertex.id) cycles.push(cycle);
    else return { cycles: [], cycleOf: new Map(), fixedPoints: 0, sign: 1, isPermutation: false };
  }

  const n = graph.vertices.length;
  return {
    cycles,
    cycleOf,
    fixedPoints: cycles.filter((c) => c.length === 1).length,
    sign: (n - cycles.length) % 2 === 0 ? 1 : -1,
    isPermutation: true,
  };
}

// ---------------------------------------------------------------------------
// Mã Prüfer (GR-09)
// ---------------------------------------------------------------------------

export interface PruferResult {
  /** Mã Prüfer, dài $n-2$, mỗi phần tử là **id đỉnh**. */
  readonly code: readonly string[];
  /**
   * Số lần mỗi đỉnh xuất hiện trong mã.
   *
   * Bậc đỉnh $=$ số lần $+\;1$. Đây là bổ đề làm cả song ánh chạy, và nó là thứ
   * duy nhất người học cần tin — phần còn lại là đếm.
   */
  readonly occurrences: ReadonlyMap<string, number>;
  /** Thứ tự đỉnh dùng để chọn "lá nhỏ nhất". */
  readonly order: readonly string[];
}

/**
 * Thứ tự đỉnh cho thuật toán Prüfer.
 *
 * Mã Prüfer là song ánh **giữa cây có nhãn và dãy**, nên nó cần một thứ tự toàn
 * phần trên nhãn — không có thứ tự thì "lá nhỏ nhất" vô nghĩa. Lấy `label` nếu có,
 * không thì `id`, và so **kiểu số khi cả hai đều là số**: bài toán nói về nhãn
 * $1..n$, mà so chuỗi thì $10 < 9$.
 */
export function pruferOrder(graph: GraphModel): readonly string[] {
  const keyOf = new Map(graph.vertices.map((v) => [v.id, v.label ?? v.id]));
  return graph.vertices
    .map((v) => v.id)
    .sort((a, b) => {
      const ka = keyOf.get(a) as string;
      const kb = keyOf.get(b) as string;
      const na = Number(ka);
      const nb = Number(kb);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return ka.localeCompare(kb);
    });
}

/** Đồ thị này có phải một **cây** không: liên thông, đơn, và $m = n - 1$. */
export function isTree(graph: GraphModel): boolean {
  const n = graph.vertices.length;
  if (n === 0) return false;
  if (graph.edges.length !== n - 1) return false;
  if (graph.edges.some((e) => e.u === e.v)) return false;
  const seen = new Set<string>();
  for (const e of graph.edges) {
    const key = e.u < e.v ? `${e.u}|${e.v}` : `${e.v}|${e.u}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return connectedComponents(graph).count === 1;
}

/**
 * Mã Prüfer của một cây có nhãn (GR-09).
 *
 * Thuật toán gốc, không rút gọn: lặp $n-2$ lần, mỗi lần bỏ **lá có nhãn nhỏ nhất**
 * và ghi lại láng giềng của nó. $O(n^2)$ với $n \le 300$ là vài chục nghìn phép —
 * rẻ hơn nhiều so với chi phí đọc hiểu một bản khéo hơn.
 *
 * Không phải cây thì **từ chối kèm lý do**, không trả một dãy trông hợp lý: mã
 * Prüfer của một thứ không phải cây là một câu trả lời sai được trình bày tự tin.
 */
export function pruferCode(graph: GraphModel): AnalyzerResult<PruferResult> {
  if (!isTree(graph)) {
    return refuse(
      `Không phải cây: ${graph.vertices.length} đỉnh, ${graph.edges.length} cạnh` +
        `${connectedComponents(graph).count > 1 ? ', và không liên thông' : ''}`,
    );
  }

  const order = pruferOrder(graph);
  const degree = new Map(order.map((id) => [id, (graph.adjacency.get(id) ?? []).length]));
  const alive = new Set(order);
  const code: string[] = [];

  for (let step = 0; step < order.length - 2; step += 1) {
    const leaf = order.find((id) => alive.has(id) && degree.get(id) === 1) as string;
    const parent = (graph.adjacency.get(leaf) ?? []).find((e) => alive.has(e.to))
      ?.to as string;
    code.push(parent);
    alive.delete(leaf);
    degree.set(parent, (degree.get(parent) as number) - 1);
  }

  const occurrences = new Map(order.map((id) => [id, 0]));
  for (const id of code) occurrences.set(id, (occurrences.get(id) as number) + 1);

  return ok({ code, occurrences, order });
}

/**
 * Chiều ngược của song ánh: dãy → cây.
 *
 * Không có lệnh nào trong Player dựng cây từ mã, nên hàm này **chỉ dùng trong
 * test** — và đó là chỗ nó đáng giá nhất: giải mã rồi mã hoá lại phải ra đúng dãy
 * ban đầu, với **mọi** dãy. Đó là cách duy nhất kiểm "song ánh" bằng máy thay vì
 * bằng niềm tin, và nó chính là công thức Cayley được dựng ra chứ không được tra.
 */
export function pruferDecode(
  code: readonly string[],
  order: readonly string[],
): readonly (readonly [string, string])[] {
  const degree = new Map(order.map((id) => [id, 1]));
  for (const id of code) degree.set(id, (degree.get(id) as number) + 1);

  const edges: (readonly [string, string])[] = [];
  const used = new Set<string>();

  for (const parent of code) {
    // Không cần loại `parent` ra: lúc chọn, `degree[parent]` còn đếm cả lần xuất
    // hiện đang xử lý nên nó **luôn** $\ge 2$. Test khứ hồi là thứ chứng minh
    // điều đó, không phải một dòng canh thừa.
    const leaf = order.find((id) => !used.has(id) && degree.get(id) === 1) as string;
    edges.push([leaf, parent]);
    used.add(leaf);
    degree.set(parent, (degree.get(parent) as number) - 1);
  }

  const rest = order.filter((id) => !used.has(id) && (degree.get(id) as number) === 1);
  if (rest.length === 2) edges.push([rest[0] as string, rest[1] as string]);
  return edges;
}

// ---------------------------------------------------------------------------
// Ghép cặp trên đồ thị hai phía (GR-06)
// ---------------------------------------------------------------------------

export interface MatchingResult {
  /** Id cạnh của một ghép cặp **tối đa**. */
  readonly matching: readonly string[];
  readonly size: number;
  /** Bạn ghép của mỗi đỉnh; đỉnh chưa ghép thì vắng mặt. */
  readonly partner: ReadonlyMap<string, string>;
  /**
   * Ghép cặp tham lam ban đầu, và các **đường tăng** đã dùng để đi từ đó lên
   * tối đa — theo đúng thứ tự thuật toán tìm ra.
   *
   * Đây là phần sư phạm thật sự của GR-06. "Ghép cặp tối đa là thế này" không
   * dạy ai điều gì; thứ dạy được là *vì sao* nó tối đa: tham lam cho một kết
   * quả, một đường tăng lật nó lên cao hơn một đơn vị, rồi tới lúc không còn
   * đường tăng nào — và **đó** là định lý Berge. Tác giả dựng từng bước từ
   * danh sách này.
   */
  readonly greedy: readonly string[];
  /** Mỗi đường tăng là một dãy **đỉnh**, bắt đầu và kết thúc ở đỉnh chưa ghép. */
  readonly augmentingPaths: readonly (readonly string[])[];
  /**
   * König: phủ đỉnh nhỏ nhất, và $|\text{phủ}| = |\text{ghép cặp}|$.
   *
   * Dựng từ chính ghép cặp tối đa (dựng Z rồi lấy $(L \setminus Z) \cup (R \cap Z)$),
   * nên hai con số bằng nhau **theo cấu tạo** chứ không phải theo may mắn.
   */
  readonly cover: readonly string[];
  /**
   * Hall: một tập $S$ ở phía trái với $|N(S)| < |S|$; rỗng khi phía trái bão hoà.
   *
   * Nhân chứng cho chiều "không có ghép cặp bão hoà" của định lý Hall — thứ mà
   * lời giải phải chỉ ra tận tay, không phải khẳng định suông.
   */
  readonly hallViolator: readonly string[];
  /** $N(S)$ của `hallViolator`. */
  readonly hallNeighbourhood: readonly string[];
  /** Phía trái, theo phân hoạch hai phía (lớp 1). */
  readonly left: readonly string[];
}

/**
 * Ghép cặp tối đa bằng đường tăng (thuật toán Kuhn), $O(V \cdot E)$.
 *
 * Chỉ chạy trên đồ thị **hai phía**. Đồ thị tổng quát cần thuật toán bông hoa
 * của Edmonds — gấp mấy lần độ phức tạp cho một họ bài gần như không xuất hiện
 * ở đề thi, trong khi cụm Hall/König thì hai phía là toàn bộ nội dung. Không
 * hai phía thì **từ chối kèm lý do**, không trả về một ghép cặp "gần đúng" mà
 * chỗ gọi tưởng là tối đa.
 *
 * Khuyên bị bỏ qua: một cạnh nối đỉnh với chính nó không ghép được ai với ai.
 */
export function matching(graph: GraphModel): AnalyzerResult<MatchingResult> {
  const parts = bipartite(graph);
  if (!parts.bipartite) {
    return refuse(
      'Đồ thị không hai phía nên thuật toán đường tăng không áp dụng được; ' +
        'ghép cặp trên đồ thị tổng quát cần thuật toán bông hoa (ngoài phạm vi P1)',
    );
  }

  const left = graph.vertices.filter((v) => parts.side.get(v.id) === 1).map((v) => v.id);
  const leftSet = new Set(left);

  // Cạnh kề, đã bỏ khuyên và quy về chiều trái → phải.
  const out = new Map<string, { to: string; edge: string }[]>();
  for (const id of left) out.set(id, []);
  for (const edge of graph.edges) {
    if (edge.u === edge.v) continue;
    const [from, to] = leftSet.has(edge.u) ? [edge.u, edge.v] : [edge.v, edge.u];
    if (!leftSet.has(from)) continue;
    out.get(from)?.push({ to, edge: edge.id });
  }

  const solved = solveBipartite(left, out);
  const { partnerOf, edgeOf, greedy, augmentingPaths } = solved;

  const matched = left.filter((l) => partnerOf.has(l));
  const edges = matched.map((l) => edgeOf.get(l) as string);

  return ok({
    matching: edges,
    size: edges.length,
    partner: partnerOf,
    greedy,
    augmentingPaths,
    ...konig(left, out, partnerOf),
    ...hall(left, out, partnerOf),
    left,
  });
}

export interface BipartiteSolution {
  readonly partnerOf: ReadonlyMap<string, string>;
  readonly edgeOf: ReadonlyMap<string, string>;
  readonly greedy: readonly string[];
  readonly augmentingPaths: readonly (readonly string[])[];
}

/**
 * Lõi ghép cặp hai phía, tách khỏi đồ thị.
 *
 * Nhận thẳng danh sách kề trái → phải chứ không nhận `GraphModel`, vì **hai** chỗ
 * cần nó: `matching()` cho GR-06, và Dilworth cho poset — ở đó đồ thị hai phía
 * là thứ *dựng ra* từ bao đóng bắc cầu chứ không có sẵn trong scene. Viết lần
 * thứ hai là mời hai bản lệch nhau, và lệch ở một thuật toán mà kết quả sai vẫn
 * trông hợp lý.
 */
export function solveBipartite(
  left: readonly string[],
  out: ReadonlyMap<string, readonly { to: string; edge: string }[]>,
): BipartiteSolution {
  const partnerOf = new Map<string, string>();
  const edgeOf = new Map<string, string>();

  const link = (l: string, r: string, edge: string): void => {
    partnerOf.set(l, r);
    partnerOf.set(r, l);
    edgeOf.set(l, edge);
    edgeOf.set(r, edge);
  };

  // Bước 1 — tham lam. Không chỉ để chạy nhanh hơn: nó là **bước đầu tiên mà
  // người học tự làm được**, và đường tăng chỉ có nghĩa khi đã có cái gì đó để
  // cải thiện.
  for (const l of left) {
    if (partnerOf.has(l)) continue;
    for (const { to, edge } of out.get(l) ?? []) {
      if (!partnerOf.has(to)) {
        link(l, to, edge);
        break;
      }
    }
  }
  const greedy = left.filter((l) => partnerOf.has(l)).map((l) => edgeOf.get(l) as string);

  // Bước 2 — đường tăng cho từng đỉnh trái còn trống.
  const augmentingPaths: string[][] = [];
  for (const start of left) {
    if (partnerOf.has(start)) continue;

    const cameFrom = new Map<string, string>();
    const seen = new Set<string>();
    const endpoint = augment(start, out, partnerOf, seen, cameFrom);
    if (endpoint === null) continue;

    // Dựng lại đường **trước khi** lật, rồi mới lật: lật xong thì `partnerOf`
    // đã đổi và đường đi không còn đọc lại được.
    const path = [endpoint];
    for (let cursor = endpoint; cameFrom.has(cursor); ) {
      const l = cameFrom.get(cursor) as string;
      path.push(l);
      const previous = partnerOf.get(l);
      if (previous === undefined) break;
      path.push(previous);
      cursor = previous;
    }
    augmentingPaths.push([...path].reverse());

    flip(endpoint, out, partnerOf, edgeOf, cameFrom, link);
  }

  return { partnerOf, edgeOf, greedy, augmentingPaths };
}

/** Tìm đỉnh phải kết thúc một đường tăng xuất phát từ `l`. */
function augment(
  l: string,
  out: ReadonlyMap<string, readonly { to: string; edge: string }[]>,
  partnerOf: ReadonlyMap<string, string>,
  seen: Set<string>,
  cameFrom: Map<string, string>,
): string | null {
  for (const { to } of out.get(l) ?? []) {
    if (seen.has(to)) continue;
    seen.add(to);
    cameFrom.set(to, l);

    const held = partnerOf.get(to);
    if (held === undefined) return to;

    const found = augment(held, out, partnerOf, seen, cameFrom);
    if (found !== null) return found;
  }
  return null;
}

/** Lật đường tăng: cạnh ngoài ghép thành trong, trong thành ngoài. */
function flip(
  endpoint: string,
  out: ReadonlyMap<string, readonly { to: string; edge: string }[]>,
  partnerOf: Map<string, string>,
  edgeOf: Map<string, string>,
  cameFrom: ReadonlyMap<string, string>,
  link: (l: string, r: string, edge: string) => void,
): void {
  let r = endpoint;
  for (;;) {
    const l = cameFrom.get(r) as string;
    const previous = partnerOf.get(l);
    const edge = (out.get(l) ?? []).find((e) => e.to === r)?.edge as string;

    link(l, r, edge);
    if (previous === undefined) return;

    partnerOf.delete(previous);
    edgeOf.delete(previous);
    r = previous;
  }
}

/**
 * Phủ đỉnh nhỏ nhất theo chứng minh của König.
 *
 * $Z$ = các đỉnh tới được từ đỉnh trái chưa ghép, đi cạnh ngoài ghép từ trái và
 * cạnh trong ghép từ phải. Phủ là $(L \setminus Z) \cup (R \cap Z)$.
 */
export function konig(
  left: readonly string[],
  out: ReadonlyMap<string, readonly { to: string; edge: string }[]>,
  partnerOf: ReadonlyMap<string, string>,
): { cover: string[] } {
  const inZ = new Set<string>();
  const queue = left.filter((l) => !partnerOf.has(l));
  for (const l of queue) inZ.add(l);

  while (queue.length > 0) {
    const l = queue.shift() as string;
    for (const { to } of out.get(l) ?? []) {
      if (inZ.has(to)) continue;
      inZ.add(to);
      const held = partnerOf.get(to);
      if (held !== undefined && !inZ.has(held)) {
        inZ.add(held);
        queue.push(held);
      }
    }
  }

  const cover = left.filter((l) => !inZ.has(l));
  for (const l of left) {
    for (const { to } of out.get(l) ?? []) {
      if (inZ.has(to) && !cover.includes(to)) cover.push(to);
    }
  }
  return { cover };
}

/**
 * Nhân chứng vi phạm điều kiện Hall.
 *
 * Cùng tập $Z$ của König: khi phía trái không bão hoà, $S = L \cap Z$ thoả
 * $|N(S)| < |S|$ — và đó chính là tập mà lời giải cần chỉ ra.
 */
function hall(
  left: readonly string[],
  out: ReadonlyMap<string, readonly { to: string; edge: string }[]>,
  partnerOf: ReadonlyMap<string, string>,
): { hallViolator: string[]; hallNeighbourhood: string[] } {
  if (left.every((l) => partnerOf.has(l))) {
    return { hallViolator: [], hallNeighbourhood: [] };
  }

  const inZ = new Set<string>();
  const queue = left.filter((l) => !partnerOf.has(l));
  for (const l of queue) inZ.add(l);

  while (queue.length > 0) {
    const l = queue.shift() as string;
    for (const { to } of out.get(l) ?? []) {
      const held = partnerOf.get(to);
      if (held !== undefined && !inZ.has(held)) {
        inZ.add(held);
        queue.push(held);
      }
    }
  }

  const violator = left.filter((l) => inZ.has(l));
  const neighbourhood: string[] = [];
  for (const l of violator) {
    for (const { to } of out.get(l) ?? []) {
      if (!neighbourhood.includes(to)) neighbourhood.push(to);
    }
  }
  return { hallViolator: violator, hallNeighbourhood: neighbourhood };
}

// ---------------------------------------------------------------------------
// Tính phẳng (GR-05)
// ---------------------------------------------------------------------------

export interface PlanarityResult {
  /**
   * Kết luận về **đồ thị**, không phải về hình vẽ.
   *
   * - `planar` — hình tác giả vẽ không có giao điểm nào, và đó là **chứng chỉ**:
   *   một cách nhúng phẳng cụ thể, kiểm được bằng mắt.
   * - `not-planar` — số cạnh vượt chặn Euler, nên không cách vẽ nào cứu được.
   * - `unknown` — hình có giao điểm nhưng chặn Euler chưa loại trừ. Nói thẳng
   *   là "chưa biết" thay vì đoán: hình xấu không chứng minh được điều gì cả.
   */
  readonly verdict: 'planar' | 'not-planar' | 'unknown';
  /** Các cặp cạnh cắt nhau **trong hình đã vẽ**, mỗi cặp một lần. */
  readonly crossings: readonly (readonly [string, string])[];
  readonly edges: number;
  /** Chặn Euler: $3v - 6$, hoặc $2v - 4$ khi đồ thị không có tam giác. */
  readonly maxEdges: number;
  readonly triangleFree: boolean;
  /** Số mặt theo công thức Euler; chỉ có nghĩa khi `verdict === 'planar'`. */
  readonly faces: number;
}

/**
 * Kiểm tính phẳng bằng **chính hình mà tác giả đã vẽ**, cộng chặn Euler.
 *
 * Đây không phải thuật toán kiểm tính phẳng tổng quát (LR / PQ-tree), và chỗ
 * này phải nói thẳng: hàm dưới đây **không** trả lời được cho mọi đồ thị. Nó
 * trả lời được cho hai trường hợp, và may thay đó là hai trường hợp mà lời giải
 * thi đấu thực sự dùng:
 *
 *   - Cần chứng minh **phẳng**: cách duy nhất được chấp nhận trong một bài thi
 *     là *vẽ ra* một cách nhúng. Ở dự án này toạ độ đỉnh vốn đã là nội dung
 *     (GR-02), nên hình trong file **chính là** chứng chỉ — chỉ cần kiểm rằng
 *     không cạnh nào cắt nhau.
 *   - Cần chứng minh **không phẳng**: $e > 3v - 6$ (hoặc $2v-4$ khi không có
 *     tam giác) là lập luận chuẩn mực, và nó giết $K_5$ với $K_{3,3}$ ngay.
 *
 * Còn lại là `unknown`, và đó là câu trả lời trung thực chứ không phải thiếu
 * sót che giấu: một hình vẽ vụng không nói lên điều gì về đồ thị. Đồ thị không
 * đơn (khuyên, cạnh bội) hoặc có cạnh vẽ cong thì **từ chối** — phân tích đoạn
 * thẳng không mô tả đúng hình đó, và chặn Euler chỉ đúng cho đồ thị đơn.
 */
export function planarity(graph: GraphModel): AnalyzerResult<PlanarityResult> {
  const n = graph.vertices.length;
  if (n > GRAPH_LIMITS.maxPlanarityVertices) {
    return refuse(
      `Đồ thị có ${n} đỉnh, vượt trần ${GRAPH_LIMITS.maxPlanarityVertices} của kiểm tính phẳng`,
    );
  }

  if (graph.edges.some((e) => e.u === e.v)) {
    return refuse('Đồ thị có khuyên: chặn Euler chỉ đúng cho đồ thị đơn');
  }
  if (graph.edges.some((e) => e.multiIndex > 0)) {
    return refuse('Có cạnh vẽ cong (`multi_index`): kiểm giao điểm bằng đoạn thẳng không mô tả đúng hình đó');
  }
  const pairs = new Set(graph.edges.map((e) => [e.u, e.v].sort().join(' ')));
  if (pairs.size < graph.edges.length) {
    return refuse('Đồ thị có cạnh bội: chặn Euler chỉ đúng cho đồ thị đơn');
  }

  const triangleFree = !hasTriangle(graph);
  const maxEdges = n < 3 ? graph.edges.length : (triangleFree ? 2 * n - 4 : 3 * n - 6);
  const crossings = drawingCrossings(graph);
  const components = connectedComponents(graph).count;

  const verdict: PlanarityResult['verdict'] =
    crossings.length === 0
      ? 'planar'
      : graph.edges.length > maxEdges
        ? 'not-planar'
        : 'unknown';

  return ok({
    verdict,
    crossings,
    edges: graph.edges.length,
    maxEdges,
    triangleFree,
    // Euler mở rộng cho đồ thị nhiều thành phần: $v - e + f = 1 + c$.
    faces: verdict === 'planar' ? graph.edges.length - n + 1 + components : 0,
  });
}

function hasTriangle(graph: GraphModel): boolean {
  const neighbours = new Map<string, Set<string>>(
    graph.vertices.map((v) => [
      v.id,
      new Set((graph.adjacency.get(v.id) ?? []).map((e) => e.to)),
    ]),
  );
  for (const edge of graph.edges) {
    const a = neighbours.get(edge.u);
    const b = neighbours.get(edge.v);
    if (!a || !b) continue;
    for (const w of a) {
      if (w !== edge.u && w !== edge.v && b.has(w)) return true;
    }
  }
  return false;
}

/** Các cặp cạnh cắt nhau trong hình, bỏ qua cặp dùng chung đầu mút. */
function drawingCrossings(graph: GraphModel): (readonly [string, string])[] {
  const out: [string, string][] = [];

  for (let i = 0; i < graph.edges.length; i += 1) {
    for (let j = i + 1; j < graph.edges.length; j += 1) {
      const a = graph.edges[i] as GraphModel['edges'][number];
      const b = graph.edges[j] as GraphModel['edges'][number];
      if (a.u === b.u || a.u === b.v || a.v === b.u || a.v === b.v) continue;

      const p1 = graph.byId.get(a.u);
      const p2 = graph.byId.get(a.v);
      const p3 = graph.byId.get(b.u);
      const p4 = graph.byId.get(b.v);
      if (!p1 || !p2 || !p3 || !p4) continue;

      if (segmentsCross(p1, p2, p3, p4)) out.push([a.id, b.id]);
    }
  }

  return out;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Tích có hướng, dùng để biết `c` nằm bên nào của $ab$. */
function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

const EPS = 1e-9;

function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);

  // Cắt thật sự: mỗi đoạn có hai đầu nằm hai bên đoạn kia.
  if (
    ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
  ) {
    return true;
  }

  // Suy biến: một đầu mút nằm **trên** đoạn kia, hoặc hai đoạn trùng phương và
  // chồng nhau. Hai cạnh không chung đỉnh mà chạm nhau thì hình đó cũng không
  // phải một cách nhúng phẳng hợp lệ, nên tính là cắt.
  return (
    (Math.abs(d1) <= EPS && onSegment(p3, p4, p1)) ||
    (Math.abs(d2) <= EPS && onSegment(p3, p4, p2)) ||
    (Math.abs(d3) <= EPS && onSegment(p1, p2, p3)) ||
    (Math.abs(d4) <= EPS && onSegment(p1, p2, p4))
  );
}

function onSegment(a: Point, b: Point, c: Point): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= c.x &&
    c.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= c.y &&
    c.y <= Math.max(a.y, b.y) + EPS
  );
}
