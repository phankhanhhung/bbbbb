/**
 * Cây SVG thuần — kết quả của renderer.
 *
 * Cố ý **không** phải DOM: renderer là hàm thuần `Scene → SvgNode[]`, không biết
 * gì về chuột, touch hay `document`. Đó là điều kiện để đúng renderer đó chạy
 * headless trong Node (REN-01/02) và để video P2 không bao giờ lệch player
 * (REN-04). Lớp chạm vào DOM nằm riêng ở `./dom`.
 */

export type AttrValue = string | number;

export interface SvgNode {
  readonly tag: string;
  /**
   * Danh tính ổn định của node, thường là id của Element (DAT-12).
   *
   * Đây là thứ mà diff và patch bám vào để nhận ra "vẫn là quân domino đó, chỉ
   * di chuyển" thay vì "xoá một quân, thêm một quân". Không có key thì mọi
   * chuyển động biến thành nhấp nháy.
   */
  readonly key?: string;
  readonly attrs: Readonly<Record<string, AttrValue>>;
  readonly children?: readonly SvgNode[];
  /** Nội dung văn bản (dùng cho `<text>`). Không đi cùng `children`. */
  readonly text?: string;
}

export function el(
  tag: string,
  attrs: Readonly<Record<string, AttrValue>>,
  children?: readonly SvgNode[],
): SvgNode {
  return children ? { tag, attrs, children } : { tag, attrs };
}

export function keyed(
  key: string,
  tag: string,
  attrs: Readonly<Record<string, AttrValue>>,
  children?: readonly SvgNode[],
): SvgNode {
  return children ? { tag, key, attrs, children } : { tag, key, attrs };
}

export function text(
  tag: string,
  attrs: Readonly<Record<string, AttrValue>>,
  content: string,
): SvgNode {
  return { tag, attrs, text: content };
}

/** Duyệt cây theo thứ tự vẽ (cha trước con). */
export function walk(nodes: readonly SvgNode[], visit: (node: SvgNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.children) walk(node.children, visit);
  }
}

/** Tập key có mặt trong cây — dùng cho diff và cho test. */
export function collectKeys(nodes: readonly SvgNode[]): Set<string> {
  const keys = new Set<string>();
  walk(nodes, (node) => {
    if (node.key !== undefined) keys.add(node.key);
  });
  return keys;
}
