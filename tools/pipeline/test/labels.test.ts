import { describe, expect, it } from 'vitest';
import { labelWidth, lookupLabel } from '@combviz/render';
import { buildAtlas } from '../src/labels.js';

/**
 * Test cho phần **sinh** label atlas (D-07).
 *
 * Đây là nơi duy nhất trong kho chạy MathJax, nên cũng là nơi duy nhất đối chiếu
 * được cái ta dựng ra với cái MathJax nói.
 */
describe('dựng atlas', () => {
  it('dựng được công thức thường gặp', () => {
    const { atlas, failures } = buildAtlas([
      'n^2',
      '\\frac{1}{k(k+1)}',
      '\\sum_{k=1}^{n} k',
      '\\binom{n}{k}',
      '=',
      '\\le',
    ]);
    expect(failures).toEqual([]);
    expect(Object.keys(atlas.entries)).toHaveLength(6);
    for (const tex of ['n^2', '\\binom{n}{k}', '\\le']) {
      expect(lookupLabel(atlas, tex)).not.toBeNull();
    }
  });

  it('bảng **ổn định**: cùng đầu vào cho cùng đầu ra, thứ tự nào cũng thế', () => {
    // Nếu không, mỗi lần chạy lại sinh một diff git khác nhau và bảng thành thứ
    // không ai dám cam kết.
    const a = buildAtlas(['n^2', '\\frac{1}{k}']);
    const b = buildAtlas(['\\frac{1}{k}', 'n^2', 'n^2']);
    expect(JSON.stringify(a.atlas)).toBe(JSON.stringify(b.atlas));
  });

  it('công thức hỏng thì **báo tên**, không âm thầm bỏ qua', () => {
    const { atlas, failures } = buildAtlas(['\\frac{1}{k}', '\\khongcolenh{x}']);
    expect(lookupLabel(atlas, '\\frac{1}{k}')).not.toBeNull();
    expect(failures.map((f) => f.tex)).toEqual(['\\khongcolenh{x}']);
  });

  it('chỉ giữ `g`, `path`, `rect` — thẻ lạ phải làm vỡ, không vẽ thiếu', () => {
    const { atlas } = buildAtlas(['\\sum_{k=1}^{n} k', '\\frac{1}{2}']);
    const tags = new Set<string>();
    const walk = (nodes: readonly { t: string; c?: readonly unknown[] }[]): void => {
      for (const node of nodes) {
        tags.add(node.t);
        if (node.c) walk(node.c as { t: string; c?: readonly unknown[] }[]);
      }
    };
    for (const entry of Object.values(atlas.entries)) walk(entry.c);
    expect([...tags].sort()).toEqual(['g', 'path', 'rect']);
  });

  it('bỏ siêu dữ liệu của MathJax — bảng phải gọn', () => {
    const { atlas } = buildAtlas(['n^2']);
    const json = JSON.stringify(atlas);
    expect(json).not.toContain('data-c');
    expect(json).not.toContain('data-mml-node');
    expect(json).not.toContain('aria');
  });

  it('bề ngang dựng ra khớp bề ngang MathJax **tự khai**', () => {
    // Chốt canh cho `UNITS_PER_EX`. Phần sinh đã tự kiểm và ném khi lệch quá 1%;
    // test này khoá thêm ở đầu ra, với cỡ chữ thật của engine.
    const { atlas, failures } = buildAtlas(['n^2']);
    expect(failures).toEqual([]);
    // MathJax khai `n^2` rộng 2.345ex ở dạng trưng bày; ở cỡ chữ 5 đơn vị scene
    // thì một `ex` là 2.5 đơn vị, nên bề ngang phải quanh 5.86.
    expect(labelWidth(lookupLabel(atlas, 'n^2')!, 5)).toBeCloseTo(2.345 * 2.5, 1);
  });

  it('phiên bản đổi khi tập chuỗi đổi', () => {
    expect(buildAtlas(['n^2']).atlas.version).not.toBe(
      buildAtlas(['n^2', 'k']).atlas.version,
    );
  });
});
