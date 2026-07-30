import type { Scene, SceneElement } from '@combviz/schema';
import { POINT_LIMITS } from './schema.js';
import { UNITS_PER_CELL } from '@combviz/render';

/** Khoảng cách chuẩn giữa hai điểm "kề nhau" trên lưới, theo quy ước G-10. */
/**
 * Đơn vị gốc, lấy từ **một** chỗ (G-10).
 *
 * Trước đây bảy engine mỗi cái tự khai `= 10`. Bảy bản sao của một quy ước là bảy
 * chỗ có thể lệch, và quy ước này lệch một cái là cả hình đổi cỡ — đúng thứ vừa
 * phải sửa ở M20. Nay nó là một hằng số, và engine thứ tám không có cách nào chọn
 * số khác mà vẫn trông như đang theo quy ước.
 */
export const UNIT = UNITS_PER_CELL;
export const POINT_RADIUS = 1.5;

export interface Pt {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly label: string | undefined;
  readonly colorClass: number;
  readonly emphasis: string | undefined;
}

export interface Seg {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  readonly colorClass: number;
  readonly style: string;
  readonly label: string | undefined;
  readonly emphasis: string | undefined;
}

export interface Poly {
  readonly id: string;
  readonly points: readonly string[];
  readonly colorClass: number;
  readonly label: string | undefined;
  readonly emphasis: string | undefined;
}

export interface PointModel {
  readonly points: readonly Pt[];
  readonly segments: readonly Seg[];
  /** Đường thẳng qua hai điểm; **không** tham gia đếm giao điểm. */
  readonly lines: readonly Seg[];
  readonly polygons: readonly Poly[];
  readonly byId: ReadonlyMap<string, Pt>;
}

export function buildPoints(scene: Scene): PointModel {
  const points: Pt[] = [];
  const segments: Seg[] = [];
  const lines: Seg[] = [];
  const polygons: Poly[] = [];

  for (const element of scene.elements) {
    if (element.type === 'point') points.push(toPoint(element));
    else if (element.type === 'segment') segments.push(toSegment(element));
    else if (element.type === 'line') lines.push(toSegment(element));
    else if (element.type === 'polygon') polygons.push(toPolygon(element));
  }

  // Đường thẳng **không** vào `segments`: `intersections` đếm giao điểm của các
  // đoạn mà bài toán dựng, và một đường kẻ phụ để minh hoạ lập luận không phải
  // một trong số đó. Trộn vào là làm sai mọi phép đếm đã có.
  return {
    points,
    segments,
    lines,
    polygons,
    byId: new Map(points.map((p) => [p.id, p])),
  };
}

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

function toPoint(element: SceneElement): Pt {
  const pos = element['pos'];
  const [x, y] = Array.isArray(pos) ? pos : [0, 0];
  return {
    id: element.id,
    x: num(x),
    y: num(y),
    label: str(element['label']),
    colorClass: num(element['color_class']),
    emphasis: str(element['emphasis']),
  };
}

function toSegment(element: SceneElement): Seg {
  return {
    id: element.id,
    a: String(element['a'] ?? ''),
    b: String(element['b'] ?? ''),
    colorClass: num(element['color_class']),
    style: str(element['style']) ?? 'solid',
    label: str(element['label']),
    emphasis: str(element['emphasis']),
  };
}

function toPolygon(element: SceneElement): Poly {
  const raw = element['points'];
  return {
    id: element.id,
    points: Array.isArray(raw) ? raw.map(String) : [],
    colorClass: num(element['color_class']),
    label: str(element['label']),
    emphasis: str(element['emphasis']),
  };
}

// ---------------------------------------------------------------------------
// Vị từ hình học
// ---------------------------------------------------------------------------

/**
 * Ngưỡng "coi như bằng 0" cho tích có hướng.
 *
 * Toạ độ là số thực do tác giả gõ, nên `=== 0` sẽ trả lời sai cho những điểm mà
 * *ai nhìn cũng thấy* là thẳng hàng. Với quy ước đơn vị $10$ (G-10) thì $10^{-9}$
 * nhỏ hơn mọi sai khác có nghĩa nhiều bậc, đồng thời lớn hơn sai số dấu phẩy
 * động của các phép nhân ở cỡ toạ độ vài trăm.
 */
const EPS = 1e-9;

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

/** Tích có hướng $\vec{ab} \times \vec{ac}$: dương nếu $c$ nằm bên trái $ab$. */
export function cross(a: Point2, b: Point2, c: Point2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function collinear(a: Point2, b: Point2, c: Point2): boolean {
  return Math.abs(cross(a, b, c)) <= EPS;
}

/** Diện tích đa giác theo công thức dây giày; luôn trả giá trị **không âm**. */
export function polygonArea(points: readonly Point2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i] as Point2;
    const q = points[(i + 1) % points.length] as Point2;
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Bao lồi (PT-02) bằng quét Andrew, trả về theo **chiều kim đồng hồ trên màn
 * hình**.
 *
 * Điểm nằm *trên cạnh* bao bị loại: bao lồi mà bài toán hỏi luôn là tập đỉnh,
 * và một điểm giữa cạnh không phải đỉnh. Đó cũng là lý do so sánh dùng `<= EPS`
 * chứ không `< -EPS`.
 *
 * Trục $y$ của SVG hướng xuống, nên "ngược chiều kim đồng hồ" trong hệ toán học
 * hiện ra thành chiều kim đồng hồ trên màn hình. Ghi ra đây vì nó là thứ khiến
 * người đọc code nghi ngờ đúng chỗ mà thuật toán không sai.
 */
export function convexHull(input: readonly Pt[]): readonly Pt[] {
  const points = [...input].sort((p, q) => p.x - q.x || p.y - q.y);
  if (points.length <= 2) return dedupe(points);

  const half = (source: readonly Pt[]): Pt[] => {
    const out: Pt[] = [];
    for (const p of source) {
      while (out.length >= 2) {
        const a = out[out.length - 2] as Pt;
        const b = out[out.length - 1] as Pt;
        if (cross(a, b, p) > EPS) break;
        out.pop();
      }
      out.push(p);
    }
    return out;
  };

  const lower = half(points);
  const upper = half([...points].reverse());
  return dedupe([...lower.slice(0, -1), ...upper.slice(0, -1)]);
}

function dedupe(points: readonly Pt[]): Pt[] {
  const seen = new Set<string>();
  return points.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

/** Mọi bộ ba thẳng hàng. Trả về id, đã sắp để kết quả ổn định. */
export function collinearTriples(
  points: readonly Pt[],
): readonly (readonly [string, string, string])[] {
  const out: [string, string, string][] = [];
  if (points.length > POINT_LIMITS.maxCollinearScan) return out;

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      for (let k = j + 1; k < points.length; k += 1) {
        const a = points[i] as Pt;
        const b = points[j] as Pt;
        const c = points[k] as Pt;
        if (collinear(a, b, c)) out.push([a.id, b.id, c.id]);
      }
    }
  }
  return out;
}

export interface Crossing {
  readonly segments: readonly [string, string];
  readonly at: Point2;
}

/**
 * Giao điểm **thực sự** của các đoạn: cắt trong lòng cả hai đoạn.
 *
 * Hai đoạn chung đầu mút không tính — chúng gặp nhau vì cùng đi qua một điểm đã
 * có tên, và đếm chúng vào sẽ làm mọi bài "đếm giao điểm của các đường chéo" ra
 * sai ngay từ dòng đầu.
 */
export function crossings(model: PointModel): readonly Crossing[] {
  const out: Crossing[] = [];
  const segments = model.segments.slice(0, POINT_LIMITS.maxSegments);

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const s = segments[i] as Seg;
      const t = segments[j] as Seg;
      if (s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b) continue;

      const p1 = model.byId.get(s.a);
      const p2 = model.byId.get(s.b);
      const p3 = model.byId.get(t.a);
      const p4 = model.byId.get(t.b);
      if (!p1 || !p2 || !p3 || !p4) continue;

      const d1 = cross(p3, p4, p1);
      const d2 = cross(p3, p4, p2);
      const d3 = cross(p1, p2, p3);
      const d4 = cross(p1, p2, p4);

      const straddles =
        ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
        ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
      if (!straddles) continue;

      const t1 = d3 / (d3 - d4);
      out.push({
        segments: [s.id, t.id],
        at: { x: p3.x + t1 * (p4.x - p3.x), y: p3.y + t1 * (p4.y - p3.y) },
      });
    }
  }

  return out;
}

/**
 * Số **điểm** giao khác nhau — không phải số cặp đoạn cắt nhau.
 *
 * Hai con số đó khác nhau đúng khi có ba đoạn trở lên **đồng quy**, và trường
 * hợp ấy không hiếm chút nào: lục giác đều có ba đường chéo chính gặp nhau ở
 * tâm, nên $15$ cặp cắt nhau chỉ cho $13$ điểm. Bài "đếm giao điểm của các
 * đường chéo" hỏi số **điểm**, nên trả về số cặp là trả lời sai — và sai một
 * cách khó thấy, vì hình vẽ ra đúng $13$ chấm trong khi con số ghi $15$.
 */
export function distinctCrossings(model: PointModel): number {
  const seen = new Set<string>();
  for (const c of crossings(model)) {
    // Gom theo lưới thô hơn EPS nhiều bậc: hai giao điểm tính từ hai cặp đoạn
    // khác nhau không bao giờ ra bit-để-bit giống nhau.
    seen.add(`${Math.round(c.at.x * 1e6)} ${Math.round(c.at.y * 1e6)}`);
  }
  return seen.size;
}

/** Điểm nằm hẳn **trong** đa giác lồi cho trước (biên không tính). */
export function insideConvex(polygon: readonly Point2[], p: Point2): boolean {
  if (polygon.length < 3) return false;

  let sign = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i] as Point2;
    const b = polygon[(i + 1) % polygon.length] as Point2;
    const d = cross(a, b, p);
    if (Math.abs(d) <= EPS) return false;
    const current = d > 0 ? 1 : -1;
    if (sign === 0) sign = current;
    else if (sign !== current) return false;
  }
  return true;
}
