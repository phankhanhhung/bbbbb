import { describe, expect, it } from 'vitest';
import { createContext, createRenderer } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import { graphRenderer } from '../src/index.js';

const renderer = createRenderer([graphRenderer]);
const ctx = createContext(defaultTheme);

interface EdgeSpec {
  readonly id: string;
  readonly u: string;
  readonly v: string;
  readonly multi_index?: number;
  readonly color_class?: number;
  readonly emphasis?: 'focus' | 'dim';
}

const scene = (
  vertices: Record<string, readonly [number, number]>,
  edges: readonly EdgeSpec[],
  vertexProps: Record<string, Record<string, unknown>> = {},
): Scene => ({
  engine: 'graph',
  config: { show_labels: false },
  elements: [
    ...Object.entries(vertices).map(([id, pos]) => ({
      id,
      type: 'vertex',
      pos: [...pos],
      ...(vertexProps[id] ?? {}),
    })),
    ...edges.map((e) => ({ type: 'edge', directed: true, ...e })),
  ],
});

/** Toạ độ các đỉnh của một `<polygon>` trong SVG. */
function polygons(svg: string): number[][][] {
  return [...svg.matchAll(/points="([^"]+)"/g)].map((m) =>
    (m[1] as string)
      .split(' ')
      .map((pair) => pair.split(',').map(Number) as number[]),
  );
}

describe('mũi tên cạnh có hướng (GR-01)', () => {
  it('vẽ thành lớp riêng, sau tất cả các nét cạnh', () => {
    // Chu trình 3 đỉnh, cả ba cạnh cùng được nhấn — halo của cạnh sau từng chôn
    // mũi tên của cạnh trước, và cả ba mũi tên biến mất khỏi hình.
    const svg = renderer.toSvg(
      scene(
        { a: [0, -10], b: [10, 5], c: [-10, 5] },
        [
          { id: 'e1', u: 'a', v: 'b', emphasis: 'focus' },
          { id: 'e2', u: 'b', v: 'c', emphasis: 'focus' },
          { id: 'e3', u: 'c', v: 'a', emphasis: 'focus' },
        ],
      ),
      ctx,
    );

    expect(polygons(svg)).toHaveLength(3);
    // Không một `<path>` nào được phép nằm sau `<polygon>` đầu tiên.
    expect(svg.indexOf('<path', svg.indexOf('<polygon'))).toBe(-1);
  });

  it('đầu mũi rộng hơn dải nét của chính cạnh, kể cả khi cạnh đội halo', () => {
    const spec = { id: 'e1', u: 'a', v: 'b' } as const;
    const plain = polygons(
      renderer.toSvg(scene({ a: [0, 0], b: [20, 0] }, [spec]), ctx),
    )[0] as number[][];
    const focused = polygons(
      renderer.toSvg(
        scene({ a: [0, 0], b: [20, 0] }, [{ ...spec, color_class: 1, emphasis: 'focus' }]),
        ctx,
      ),
    )[0] as number[][];

    const span = (p: number[][]): number =>
      Math.max(...p.map((q) => q[1] as number)) - Math.min(...p.map((q) => q[1] as number));

    expect(span(focused)).toBeGreaterThan(span(plain));
  });

  it('đầu mũi nằm trên cung, không nằm trên đoạn thẳng nối hai đỉnh', () => {
    const svg = renderer.toSvg(
      scene({ a: [0, 0], b: [0, 20] }, [{ id: 'e1', u: 'a', v: 'b', multi_index: 1 }]),
      ctx,
    );
    const tip = (polygons(svg)[0] as number[][])[0] as number[];

    // Cạnh phình sang ngang; mũi tên bám đoạn thẳng thì `x` của đầu mũi sẽ là 0.
    expect(Math.abs(tip[0] as number)).toBeGreaterThan(0.3);
  });
});

describe('cung nhiều cạnh (GR-02)', () => {
  it('hai cạnh ngược chiều cùng cặp đỉnh cong về hai phía', () => {
    // Chu trình độ dài 2 — bài hoán vị nào cũng có. Trước sửa này, pháp tuyến
    // dựng theo chiều cạnh nên cả hai cung cong cùng một bên và đè lên nhau.
    const svg = renderer.toSvg(
      scene({ a: [0, 0], b: [0, 20] }, [
        { id: 'e1', u: 'a', v: 'b', multi_index: 1 },
        { id: 'e2', u: 'b', v: 'a', multi_index: 2 },
      ]),
      ctx,
    );

    const controls = [...svg.matchAll(/Q(-?[\d.]+) /g)].map((m) => Number(m[1]));

    expect(controls).toHaveLength(2);
    expect(Math.min(...controls)).toBeLessThan(-0.3);
    expect(Math.max(...controls)).toBeGreaterThan(0.3);
  });
});

describe('hàng mã Prüfer (GR-09)', () => {
  const tree = (config: Record<string, unknown> = {}): Scene => ({
    engine: 'graph',
    config: { show_prufer: true, ...config },
    elements: [
      { id: '1', type: 'vertex', pos: [0, 0], label: '1' },
      { id: '4', type: 'vertex', pos: [10, 0], label: '4' },
      { id: '5', type: 'vertex', pos: [20, 0], label: '5' },
      { id: '2', type: 'vertex', pos: [30, -8], label: '2' },
      { id: '3', type: 'vertex', pos: [30, 8], label: '3' },
      { id: 'e0', type: 'edge', u: '1', v: '4' },
      { id: 'e1', type: 'edge', u: '4', v: '5' },
      { id: 'e2', type: 'edge', u: '5', v: '2' },
      { id: 'e3', type: 'edge', u: '5', v: '3' },
    ] as Scene['elements'],
  });

  it('vẽ đúng $n-2$ ô, mỗi ô một key', () => {
    const svg = renderer.toSvg(tree(), ctx);
    for (const i of [0, 1, 2]) expect(svg).toContain(`>${['4', '5', '5'][i]}<`);
    expect(svg).toContain('Mã Prüfer:');
  });

  it('khung chừa đủ chỗ — chữ không rơi ra ngoài mép dưới', () => {
    const svg = renderer.toSvg(tree(), ctx);
    const viewport = renderer.viewportOf(tree(), ctx);
    const ys = [...svg.matchAll(/<(?:text|rect)[^>]*\by="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.max(...ys)).toBeLessThan(viewport.y + viewport.height);
    // Và không có `show_prufer` thì khung trở lại như cũ.
    expect(renderer.viewportOf(tree({ show_prufer: false }), ctx).height).toBeLessThan(
      viewport.height,
    );
  });

  it('không phải cây thì **nói ra**, không để một khoảng trống', () => {
    const cyclic = tree();
    const withCycle: Scene = {
      ...cyclic,
      elements: [...cyclic.elements, { id: 'e4', type: 'edge', u: '1', v: '5' } as never],
    };
    expect(renderer.toSvg(withCycle, ctx)).toContain('Không phải cây');
  });
});
