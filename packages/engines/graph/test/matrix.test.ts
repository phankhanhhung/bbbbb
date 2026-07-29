import { describe, expect, it } from 'vitest';
import { createContext, createRenderer, walk, type SvgNode } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import { graphRenderer } from '../src/index.js';

const renderer = createRenderer([graphRenderer]);
const ctx = createContext(defaultTheme);

const EDGES: [string, string][] = [
  ['v1', 'v2'],
  ['v2', 'v3'],
  ['v3', 'v4'],
  ['v4', 'v1'],
  ['v1', 'v3'],
];

const scene = (config: Record<string, unknown>): Scene => ({
  engine: 'graph',
  config,
  elements: [
    ...['v1', 'v2', 'v3', 'v4'].map((id, i) => ({
      id,
      type: 'vertex',
      pos: [i * 10, 0],
      label: String(i + 1),
    })),
    ...EDGES.map(([u, v]) => ({ id: `e${u}${v}`, type: 'edge', u, v })),
  ],
});

const MATRIX = scene({ view: 'matrix', show_sums: true });

const nodes = (s: Scene): SvgNode[] => {
  const out: SvgNode[] = [];
  walk(renderer.render(s, ctx), (node) => out.push(node));
  return out;
};

describe('GR-07 — ma trận kề', () => {
  it('mỗi cạnh vẽ thành **hai** ô đối xứng', () => {
    const cells = nodes(MATRIX).filter((n) => n.attrs['data-el'] !== undefined);
    expect(cells).toHaveLength(EDGES.length * 2);
  });

  it('key duy nhất toàn cây, kể cả khi hai ô cùng một cạnh', () => {
    // Diff và nội suy gộp theo key trên **cả cây** (DAT-12), nên hai ô trùng key
    // sẽ nội suy từ nhau: ô dưới trượt ngang qua bảng mỗi lần chuyển step. Lỗi
    // này không hiện ra trong SVG tĩnh — chỉ hiện trong Player.
    const keys = nodes(MATRIX)
      .map((n) => n.key)
      .filter((k): k is string => k !== undefined);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('hai ô của một cạnh cùng chỉ về **một** element', () => {
    const byElement = new Map<string, number>();
    for (const node of nodes(MATRIX)) {
      const el = node.attrs['data-el'];
      if (typeof el === 'string') byElement.set(el, (byElement.get(el) ?? 0) + 1);
    }

    expect([...byElement.keys()].sort()).toEqual(EDGES.map(([u, v]) => `e${u}${v}`).sort());
    expect([...byElement.values()]).toEqual(EDGES.map(() => 2));
  });

  it('nhấn một cạnh làm sáng **cả hai** ô', () => {
    const highlighted = createContext(defaultTheme, { highlight: new Set(['ev1v3']) });
    const out: SvgNode[] = [];
    walk(renderer.render(MATRIX, highlighted), (n) => out.push(n));

    const lit = out.filter(
      (n) => n.attrs['data-el'] === 'ev1v3' && n.attrs['stroke-width'] !== undefined,
    );
    expect(lit).toHaveLength(2);
  });

  it('ô trống không mang id — nó không phải element nào cả', () => {
    const blanks = nodes(MATRIX).filter(
      (n) => n.tag === 'rect' && n.attrs['data-el'] === undefined,
    );

    // 4×4 = 16 ô, 10 ô có cạnh ⇒ 6 ô trống (kể cả 4 ô chéo).
    expect(blanks).toHaveLength(6);
    expect(blanks.every((n) => n.key === undefined)).toBe(true);
  });

  it('tổng hàng là bậc đỉnh, tổng cả bảng là $2|E|$', () => {
    // Lọc theo **cột bậc**, không lọc theo nội dung: nhãn đỉnh "3" xuất hiện ở cả
    // hàng lẫn cột, nên đếm chuỗi "3" trong toàn hình sẽ đếm nhầm chúng.
    const degreeColumn = 4 * 10 + 10 * 0.4;
    const texts = nodes(MATRIX).filter((n) => n.tag === 'text');

    expect(texts.map((n) => n.text)).toContain('Σ 10');
    expect(
      texts
        .filter((n) => n.attrs['x'] === degreeColumn && !String(n.text).startsWith('Σ'))
        .map((n) => n.text),
    ).toEqual(['3', '2', '3', '2']);
  });

  it('view mặc định vẫn là đỉnh–cạnh', () => {
    const plain = nodes(scene({}));
    expect(plain.some((n) => n.attrs['data-el'] !== undefined)).toBe(false);
  });
});
