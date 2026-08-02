import type { Scene, SceneElement } from '@combviz/schema';
import { UNITS_PER_CELL } from '@combviz/render';

/** Khoảng cách đỉnh chuẩn, theo quy ước đơn vị scene ở `StrokeTokens`. */
/**
 * Đơn vị gốc, lấy từ **một** chỗ (G-10).
 *
 * Trước đây bảy engine mỗi cái tự khai `= 10`. Bảy bản sao của một quy ước là bảy
 * chỗ có thể lệch, và quy ước này lệch một cái là cả hình đổi cỡ — đúng thứ vừa
 * phải sửa ở M20. Nay nó là một hằng số, và engine thứ tám không có cách nào chọn
 * số khác mà vẫn trông như đang theo quy ước.
 */
export const SPACING = UNITS_PER_CELL;
export const VERTEX_RADIUS = 2.3;

export interface Vertex {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly label: string | undefined;
  readonly colorClass: number;
  readonly shape: string;
  readonly emphasis: string | undefined;
  /**
   * Số mang trên đỉnh (GR-14), hoặc `undefined` khi bài không khai.
   *
   * **`undefined` chứ không phải `0`**: cùng quy ước mà `colorClass` đã đặt cho "chưa
   * tô". Một bài đặt số $0$ lên một đỉnh là chuyện có thật, và trộn nó với "đỉnh này
   * không mang số nào" sẽ làm mọi tổng đọc sai một cách im lặng.
   */
  readonly value: number | undefined;
}

export interface Edge {
  readonly id: string;
  readonly u: string;
  readonly v: string;
  readonly directed: boolean;
  readonly multiIndex: number;
  readonly colorClass: number;
  readonly weight: number | undefined;
  readonly label: string | undefined;
  readonly style: string;
  readonly emphasis: string | undefined;
}

/**
 * Cấu trúc kề, dựng một lần cho mỗi scene.
 *
 * Cạnh **song song và khuyên đều được giữ** (§5.1): một số bài đếm dựa hẳn vào
 * chúng. Vì vậy `neighbours` là danh sách chứ không phải tập hợp, và bậc đỉnh
 * tính khuyên **hai lần** — đó là định nghĩa chuẩn, và nó là thứ làm bổ đề bắt
 * tay đúng.
 */
export interface GraphModel {
  readonly vertices: readonly Vertex[];
  readonly edges: readonly Edge[];
  readonly byId: ReadonlyMap<string, Vertex>;
  /** Danh sách (đỉnh kề, id cạnh) cho mỗi đỉnh; cạnh song song xuất hiện nhiều lần. */
  readonly adjacency: ReadonlyMap<string, readonly { to: string; edge: string }[]>;
  readonly degree: ReadonlyMap<string, number>;
}

export function buildGraph(scene: Scene): GraphModel {
  const vertices: Vertex[] = [];
  const edges: Edge[] = [];

  for (const element of scene.elements) {
    if (element.type === 'vertex') vertices.push(toVertex(element));
    else if (element.type === 'edge') edges.push(toEdge(element));
  }

  const byId = new Map(vertices.map((v) => [v.id, v]));
  const adjacency = new Map<string, { to: string; edge: string }[]>();
  const degree = new Map<string, number>();

  for (const vertex of vertices) {
    adjacency.set(vertex.id, []);
    degree.set(vertex.id, 0);
  }

  for (const edge of edges) {
    // Cạnh trỏ tới đỉnh không tồn tại bị bỏ qua ở đây; `validate` mới là chỗ báo
    // lỗi đó, còn analyzer thì không được sập vì dữ liệu méo.
    if (!byId.has(edge.u) || !byId.has(edge.v)) continue;

    adjacency.get(edge.u)?.push({ to: edge.v, edge: edge.id });
    degree.set(edge.u, (degree.get(edge.u) ?? 0) + 1);

    if (edge.u === edge.v) {
      // Khuyên đóng góp 2 vào bậc, nhưng chỉ là **một** mục kề — nếu ghi hai mục,
      // thuật toán Euler sẽ đi qua nó hai lần.
      degree.set(edge.u, (degree.get(edge.u) ?? 0) + 1);
    } else {
      adjacency.get(edge.v)?.push({ to: edge.u, edge: edge.id });
      degree.set(edge.v, (degree.get(edge.v) ?? 0) + 1);
    }
  }

  return { vertices, edges, byId, adjacency, degree };
}

function toVertex(element: SceneElement): Vertex {
  const pos = (element['pos'] as [number, number] | undefined) ?? [0, 0];
  return {
    id: element.id,
    x: pos[0],
    y: pos[1],
    label: element['label'] as string | undefined,
    colorClass: Number(element.color_class ?? 0),
    shape: String(element['shape'] ?? 'circle'),
    emphasis: element.emphasis,
    value: typeof element['value'] === 'number' ? element['value'] : undefined,
  };
}

function toEdge(element: SceneElement): Edge {
  return {
    id: element.id,
    u: String(element['u']),
    v: String(element['v']),
    directed: Boolean(element['directed']),
    multiIndex: Number(element['multi_index'] ?? 0),
    colorClass: Number(element.color_class ?? 0),
    weight: element['weight'] as number | undefined,
    label: element['label'] as string | undefined,
    style: String(element['style'] ?? 'solid'),
    emphasis: element.emphasis,
  };
}
