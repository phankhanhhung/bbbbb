import { lerpAttr } from './lerp.js';
import type { AttrValue, SvgNode } from './svg-node.js';

/**
 * Sinh khung hình tại thời điểm `t ∈ [0,1]` giữa hai cây SVG.
 *
 * Hàm thuần (D-05). Player gọi nó mỗi rAF; render video gọi nó với timestep cố
 * định. Một hàm, hai đường tiêu thụ — nên clip không thể lệch player.
 *
 * Hai bất biến được test khoá lại:
 *   - `interpolate(a, b, 1)` bằng đúng `b`,
 *   - `interpolate(a, b, 0)` chứa đúng tập key và thuộc tính của `a`.
 *
 * Thứ tự vẽ luôn theo `b` (node biến mất được chèn lại đúng vị trí cũ của nó).
 * Giữ một thứ tự duy nhất xuyên suốt quan trọng hơn là khớp tuyệt đối thứ tự của
 * `a` ở khung đầu: đổi thứ tự giữa chừng làm các element chồng nhau nhảy lớp.
 */
export function interpolateNodes(
  before: readonly SvgNode[],
  after: readonly SvgNode[],
  t: number,
): SvgNode[] {
  if (t <= 0 && after.length === 0) return [...before];
  return mergeLevel(before, after, t);
}

function mergeLevel(
  before: readonly SvgNode[],
  after: readonly SvgNode[],
  t: number,
): SvgNode[] {
  const beforeByKey = new Map<string, SvgNode>();
  const beforeIndexByKey = new Map<string, number>();
  before.forEach((node, i) => {
    if (node.key !== undefined) {
      beforeByKey.set(node.key, node);
      beforeIndexByKey.set(node.key, i);
    }
  });

  const unkeyedBefore = before.filter((n) => n.key === undefined);
  let unkeyedCursor = 0;

  const result: SvgNode[] = [];
  const consumed = new Set<string>();

  for (const node of after) {
    if (node.key === undefined) {
      const prev = unkeyedBefore[unkeyedCursor];
      unkeyedCursor += 1;
      result.push(prev && prev.tag === node.tag ? mergeNode(prev, node, t) : node);
      continue;
    }

    const prev = beforeByKey.get(node.key);
    if (prev) {
      consumed.add(node.key);
      result.push(mergeNode(prev, node, t));
    } else if (t > 0) {
      // Element mới: hiện dần. Ở t = 0 nó chưa tồn tại, nên không xuất hiện —
      // đó là điều giữ cho `interpolate(a, b, 0)` bằng đúng `a`.
      result.push(withOpacity(node, t));
    }
  }

  if (t < 1) {
    // Element biến mất: mờ dần tại chỗ cũ, để mắt theo kịp thứ vừa mất.
    const leaving = before
      .map((node, i) => ({ node, i }))
      .filter(({ node }) => node.key !== undefined && !consumed.has(node.key));

    for (const { node, i } of leaving) {
      result.splice(Math.min(i, result.length), 0, withOpacity(node, 1 - t));
    }
  }

  return result;
}

function mergeNode(before: SvgNode, after: SvgNode, t: number): SvgNode {
  if (before.tag !== after.tag) return t < 0.5 ? before : after;

  const attrs: Record<string, AttrValue> = {};
  for (const [name, value] of Object.entries(after.attrs)) {
    const prev = before.attrs[name];
    attrs[name] = prev === undefined ? value : lerpAttr(name, prev, value, t);
  }
  for (const [name, value] of Object.entries(before.attrs)) {
    if (!(name in attrs)) attrs[name] = value;
  }

  const merged: {
    tag: string;
    key?: string;
    attrs: Record<string, AttrValue>;
    children?: SvgNode[];
    text?: string;
  } = { tag: after.tag, attrs };

  if (after.key !== undefined) merged.key = after.key;

  if (after.children || before.children) {
    merged.children = mergeLevel(before.children ?? [], after.children ?? [], t);
  }
  if (after.text !== undefined || before.text !== undefined) {
    merged.text = (t < 0.5 ? before.text : after.text) ?? after.text ?? before.text;
  }

  return merged;
}

function withOpacity(node: SvgNode, factor: number): SvgNode {
  // Ở hai đầu quãng, trả về node **y nguyên** thay vì gắn `opacity: 1`. Gắn thêm
  // một thuộc tính vô hại về mặt thị giác vẫn phá bất biến "khung cuối bằng đúng
  // cây đích", và bất biến đó mới là thứ bảo đảm clip render ra khớp player.
  if (factor >= 1) return node;

  const current = node.attrs['opacity'];
  const base = typeof current === 'number' ? current : 1;
  const value = Math.round(base * factor * 1000) / 1000;
  return { ...node, attrs: { ...node.attrs, opacity: value } };
}
