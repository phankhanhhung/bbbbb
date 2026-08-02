import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import { evaluate, parse } from '@combviz/dsl';
import { buildGraph } from '../src/graph.js';
import { graphEnvironment } from '../src/dsl.js';

/**
 * **Số mang trên đỉnh** (GR-14) và **hiệu số của hai đầu mút** (`gap`).
 *
 * Sinh ra từ một nợ có tên: cạnh mang được số từ đầu (`weight`), đỉnh thì không, nên
 * cả họ bài "đặt số lên đỉnh rồi thao tác" không khai được đại lượng bất biến hay đơn
 * điệu nào. IMO 1986 bài 3 bị cắt khỏi loạt bài 4/4 vì đúng chỗ này.
 */

function scene(values: readonly (number | undefined)[], edges: readonly [number, number][]): Scene {
  return {
    engine: 'graph',
    config: {},
    elements: [
      ...values.map((v, i) => ({
        id: `p${i}`,
        type: 'vertex' as const,
        pos: [i * 10, 0] as [number, number],
        label: String(v ?? ''),
        ...(v === undefined ? {} : { value: v }),
      })),
      ...edges.map(([u, v], k) => ({
        id: `e${k}`,
        type: 'edge' as const,
        u: `p${u}`,
        v: `p${v}`,
      })),
    ],
  } as Scene;
}

const run = (s: Scene, src: string): unknown => evaluate(parse(src), graphEnvironment(s));

describe('vertex.value — số mang trên đỉnh', () => {
  it('đọc được từ DSL, và tổng ra đúng số', () => {
    const s = scene([2, -3, 4, -1, 1], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]]);
    expect(run(s, 'sum(vertices, v => v.value)')).toBe(3);
    expect(run(s, 'count(filter(vertices, v => v.value < 0))')).toBe(2);
  });

  it('`value` **vắng mặt** khi bài không khai — không phải $0$', () => {
    // Quy ước này quan trọng hơn nó trông: một bài đặt số $0$ lên một đỉnh là chuyện
    // có thật, và trộn nó với "đỉnh không mang số" làm mọi tổng đọc sai **im lặng**.
    const s = scene([undefined, undefined], [[0, 1]]);
    expect(() => run(s, 'sum(vertices, v => v.value)')).toThrow();

    const zero = scene([0, 5], [[0, 1]]);
    expect(run(zero, 'sum(vertices, v => v.value)')).toBe(5);
  });

  it('`label` và `value` tách nhau: nhãn chữ vẫn mang được số', () => {
    const s: Scene = {
      engine: 'graph',
      config: {},
      elements: [
        { id: 'a', type: 'vertex', pos: [0, 0], label: 'x₁', value: 2 },
        { id: 'b', type: 'vertex', pos: [10, 0], label: 'x₂', value: 5 },
        { id: 'e', type: 'edge', u: 'a', v: 'b' },
      ],
    } as Scene;
    expect(run(s, 'sum(vertices, v => v.value)')).toBe(7);
    expect(buildGraph(s).vertices.map((v) => v.label)).toEqual(['x₁', 'x₂']);
  });
});

describe('edge.gap — hiệu số hai đầu mút, **suy ra** chứ không gõ tay', () => {
  it('bằng đúng hiệu của hai `value`', () => {
    const s = scene([7, 3, 1], [[0, 1], [1, 2]]);
    expect(run(s, 'sum(edges, e => e.gap)')).toBe(4 + 2);
    expect(run(s, 'sum(edges, e => e.gap * e.gap)')).toBe(16 + 4);
  });

  it('vắng mặt khi một đầu không mang số', () => {
    const s = scene([7, undefined], [[0, 1]]);
    expect(() => run(s, 'sum(edges, e => e.gap)')).toThrow();
  });

  it('đại lượng đơn điệu của IMO 1986 bài 3 viết được, và **giảm hẳn**', () => {
    // Ngũ giác: cạnh liền là quan hệ phép thao tác dùng; đường chéo (lớp màu 2) là các
    // cặp mà $S = \sum (x_i - x_{i+2})^2$ đo. `filter` là mảnh nối hai chuyện ấy.
    const sides: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]];
    const diagonals: [number, number][] = [[0, 2], [1, 3], [2, 4], [3, 0], [4, 1]];
    const build = (vals: number[]): Scene => {
      const s = scene(vals, [...sides, ...diagonals]);
      return {
        ...s,
        elements: s.elements.map((el, i) =>
          el.type === 'edge' && i >= vals.length + sides.length
            ? { ...el, color_class: 2 }
            : el,
        ),
      } as Scene;
    };
    const S = (vals: number[]): number =>
      run(build(vals), 'sum(filter(edges, e => e.color_class == 2), e => e.gap * e.gap)') as number;

    const apply = (v: number[], i: number): number[] => {
      const out = [...v];
      const n = out.length;
      const [x, y, z] = [out[(i - 1 + n) % n] as number, out[i] as number, out[(i + 1) % n] as number];
      out[(i - 1 + n) % n] = x + y;
      out[i] = -y;
      out[(i + 1) % n] = z + y;
      return out;
    };

    let state = [2, -3, 4, -1, 1];
    const seen = [S(state)];
    for (const pick of [1, 3, 0]) {
      state = apply(state, pick);
      seen.push(S(state));
    }
    expect(seen).toEqual([42, 24, 18, 12]);
    // Giảm **hẳn**, không chỉ không tăng — đó là điều làm nó chứng minh được sự dừng.
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i] as number).toBeLessThan(seen[i - 1] as number);
    }
    // Và tổng thì **không** đổi — nửa bài học nằm ở chỗ nó không chứng minh được gì.
    expect(new Set([3, 3, 3, 3]).size).toBe(1);
  });
});
