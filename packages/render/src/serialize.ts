import type { SvgNode } from './svg-node.js';
import type { Viewport } from '@combviz/schema';

/**
 * Cây SVG → chuỗi SVG.
 *
 * Deterministic tuyệt đối: thuộc tính sắp theo tên, số làm tròn cố định. Đó là
 * điều kiện để golden snapshot test có nghĩa — một chuỗi khác đi phải có nghĩa
 * là *hình đã đổi*, không phải là thứ tự khoá của object đã đổi.
 *
 * Cũng là đầu ra dùng cho REN-01 (render headless) và SBX-05 (export SVG).
 */

export interface SerializeOptions {
  readonly viewport: Viewport;
  /** Kích thước pixel của khung ngoài. Vắng thì SVG co giãn theo khung chứa. */
  readonly width?: number;
  readonly height?: number;
  readonly background?: string;
  /** Chèn thêm node ở cuối (watermark REN-03, chú thích...). */
  readonly overlay?: readonly SvgNode[];
}

export function toSvgString(
  nodes: readonly SvgNode[],
  options: SerializeOptions,
): string {
  const { viewport, width, height, background, overlay } = options;

  const rootAttrs: Record<string, string | number> = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `${round(viewport.x)} ${round(viewport.y)} ${round(viewport.width)} ${round(
      viewport.height,
    )}`,
  };
  if (width !== undefined) rootAttrs['width'] = width;
  if (height !== undefined) rootAttrs['height'] = height;

  const body: SvgNode[] = [];
  if (background) {
    body.push({
      tag: 'rect',
      attrs: {
        x: viewport.x,
        y: viewport.y,
        width: viewport.width,
        height: viewport.height,
        fill: background,
      },
    });
  }
  body.push(...nodes);
  if (overlay) body.push(...overlay);

  return `<svg${serializeAttrs(rootAttrs)}>${body.map(serializeNode).join('')}</svg>`;
}

export function serializeNode(node: SvgNode): string {
  const attrs = serializeAttrs(node.attrs);

  if (node.text !== undefined) {
    return `<${node.tag}${attrs}>${escapeText(node.text)}</${node.tag}>`;
  }
  if (!node.children || node.children.length === 0) {
    return `<${node.tag}${attrs}/>`;
  }
  return `<${node.tag}${attrs}>${node.children.map(serializeNode).join('')}</${node.tag}>`;
}

function serializeAttrs(attrs: Readonly<Record<string, string | number>>): string {
  const names = Object.keys(attrs).sort();
  if (names.length === 0) return '';
  return ` ${names
    .map((name) => `${name}="${escapeAttr(formatValue(attrs[name] as string | number))}"`)
    .join(' ')}`;
}

function formatValue(value: string | number): string {
  return typeof value === 'number' ? String(round(value)) : value;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
