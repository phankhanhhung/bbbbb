import type { SvgNode } from '../svg-node.js';

/**
 * Lớp duy nhất trong `packages/render` được phép chạm DOM.
 *
 * Mọi thứ ở `../` là hàm thuần và chạy được trong Node; chỗ này chỉ làm đúng một
 * việc: đưa một cây `SvgNode` vào DOM và **tái dùng** element cũ theo key thay vì
 * dựng lại. Tái dùng mới là điểm mấu chốt của NFR-P1: mỗi khung hình animation
 * chỉ ghi lại vài thuộc tính đã đổi, không đụng tới 1600 ô còn lại.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Thuộc tính mang danh tính element trong DOM.
 *
 * Xuất ra ngoài vì lớp trên cần nó để **tra ngược**: từ một node chuột đang chỉ
 * vào, tìm ra element nào của scene. Để mỗi nơi tự viết chuỗi `'data-k'` thì
 * ngày nào đó đổi tên ở đây, chỗ kia im lặng hỏng — chuột rê mà không có gì
 * sáng lên, không một thông báo.
 */
export const KEY_ATTR = 'data-k';

/**
 * Element **ngữ nghĩa** mà một node thuộc về, khi nó khác danh tính DOM.
 *
 * Một element có thể được vẽ thành nhiều node: ma trận kề vẽ mỗi cạnh thành hai
 * ô đối xứng (GR-07). Hai ô đó bắt buộc phải mang `data-k` khác nhau — diff và
 * nội suy gộp theo key, nên trùng key thì ô này nội suy từ ô kia và trượt ngang
 * qua bảng. Nhưng cả hai vẫn **là** một cạnh, và lớp trên cần biết điều đó để
 * rê chuột vào ô nào cũng ra đúng cạnh ấy.
 */
export const ELEMENT_ATTR = 'data-el';

export function patch(container: Element, nodes: readonly SvgNode[]): void {
  patchChildren(container, nodes);
}

function patchChildren(parent: Element, nodes: readonly SvgNode[]): void {
  const existing = new Map<string, Element>();
  const unkeyed: Element[] = [];

  for (const child of Array.from(parent.children)) {
    const key = child.getAttribute(KEY_ATTR);
    if (key !== null) existing.set(key, child);
    else unkeyed.push(child);
  }

  let unkeyedCursor = 0;
  const kept = new Set<Element>();
  const ordered: Element[] = [];

  for (const node of nodes) {
    let element: Element | undefined;

    if (node.key !== undefined) {
      const candidate = existing.get(node.key);
      if (candidate && candidate.tagName === node.tag) element = candidate;
    } else {
      const candidate = unkeyed[unkeyedCursor];
      unkeyedCursor += 1;
      if (candidate && candidate.tagName === node.tag) element = candidate;
    }

    if (!element) {
      element = document.createElementNS(SVG_NS, node.tag);
      if (node.key !== undefined) element.setAttribute(KEY_ATTR, node.key);
    }

    applyAttrs(element, node);
    kept.add(element);
    ordered.push(element);

    if (node.text !== undefined) {
      if (element.textContent !== node.text) element.textContent = node.text;
    } else {
      patchChildren(element, node.children ?? []);
    }
  }

  for (const child of Array.from(parent.children)) {
    if (!kept.has(child)) parent.removeChild(child);
  }

  // Sắp lại thứ tự vẽ. So sánh với node đang đứng đúng vị trí trước khi gọi
  // insertBefore: SVG repaint vì thao tác DOM, không vì giá trị thay đổi.
  ordered.forEach((element, i) => {
    if (parent.children[i] !== element) {
      parent.insertBefore(element, parent.children[i] ?? null);
    }
  });
}

function applyAttrs(element: Element, node: SvgNode): void {
  for (const [name, value] of Object.entries(node.attrs)) {
    const next = String(value);
    if (element.getAttribute(name) !== next) element.setAttribute(name, next);
  }

  for (const attr of Array.from(element.attributes)) {
    if (attr.name === KEY_ATTR) continue;
    if (!(attr.name in node.attrs)) element.removeAttribute(attr.name);
  }
}
