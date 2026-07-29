import { describe, expect, it } from 'vitest';
import { interpolateNodes } from '../src/interpolate.js';
import { diffNodes } from '../src/diff.js';
import { el, keyed, type SvgNode } from '../src/svg-node.js';
import { lerpAttr, lerpColor, lerpStructuredString } from '../src/lerp.js';

const at = (x: number): SvgNode =>
  keyed('t1', 'g', { transform: `translate(${x} 0)` }, [
    el('rect', { x: 0, y: 0, width: 10, height: 10, fill: '#000000' }),
  ]);

describe('bất biến hai đầu', () => {
  it('t = 1 cho ra đúng cây đích', () => {
    const a = [at(0)];
    const b = [at(50)];

    expect(interpolateNodes(a, b, 1)).toEqual(b);
  });

  it('t = 0 giữ nguyên tập key và thuộc tính của cây nguồn', () => {
    const a = [keyed('t1', 'rect', { x: 0, fill: '#000000' })];
    const b = [keyed('t2', 'rect', { x: 50, fill: '#ffffff' })];

    const frame = interpolateNodes(a, b, 0);

    // Element mới chưa tồn tại ở t = 0 — nếu nó xuất hiện với opacity 0 thì
    // khung đầu vẫn "bằng a" về mặt thị giác, nhưng không bằng về cấu trúc, và
    // golden test sẽ không còn khẳng định được gì.
    expect(frame).toEqual(a);
  });

  it('t = 1 loại hẳn element đã biến mất', () => {
    const a = [keyed('t1', 'rect', { x: 0 })];
    const b = [keyed('t2', 'rect', { x: 5 })];

    expect(interpolateNodes(a, b, 1)).toEqual(b);
  });
});

describe('chuyển động suy ra từ diff, không phải từ khai báo', () => {
  it('nội suy phép tịnh tiến trong transform', () => {
    const frame = interpolateNodes([at(0)], [at(100)], 0.25);

    expect(frame[0]!.attrs['transform']).toBe('translate(25 0)');
  });

  it('nội suy màu khi ô đổi color_class', () => {
    const a = [keyed('cell-0-0', 'rect', { fill: '#000000' })];
    const b = [keyed('cell-0-0', 'rect', { fill: '#ffffff' })];

    expect(interpolateNodes(a, b, 0.5)[0]!.attrs['fill']).toBe('#808080');
  });

  it('element mới hiện dần, element mất mờ dần', () => {
    const a = [keyed('old', 'rect', {})];
    const b = [keyed('new', 'rect', {})];

    const frame = interpolateNodes(a, b, 0.25);
    const byKey = new Map(frame.map((n) => [n.key, n]));

    expect(byKey.get('new')!.attrs['opacity']).toBe(0.25);
    expect(byKey.get('old')!.attrs['opacity']).toBe(0.75);
  });

  it('nội suy cả trong cây con', () => {
    const a = [keyed('g1', 'g', {}, [keyed('c', 'rect', { x: 0 })])];
    const b = [keyed('g1', 'g', {}, [keyed('c', 'rect', { x: 10 })])];

    expect(interpolateNodes(a, b, 0.5)[0]!.children![0]!.attrs['x']).toBe(5);
  });
});

describe('lerp', () => {
  it('chuyển dứt khoát khi hai chuỗi khác khung', () => {
    expect(lerpStructuredString('translate(0 0)', 'rotate(90)', 0.4)).toBe(
      'translate(0 0)',
    );
    expect(lerpStructuredString('translate(0 0)', 'rotate(90)', 0.6)).toBe('rotate(90)');
  });

  it('nội suy path d khi cấu trúc lệnh giống nhau', () => {
    expect(lerpStructuredString('M0 0L10 0', 'M0 0L20 0', 0.5)).toBe('M0 0L15 0');
  });

  it('không nội suy số nằm trong tham chiếu url()', () => {
    // `url(#cv-pat-1.5)` là tham chiếu không tồn tại: ô sẽ mất màu giữa chừng
    // animation ở chế độ pattern.
    expect(lerpAttr('fill', 'url(#cv-pat-1)', 'url(#cv-pat-2)', 0.5)).toBe(
      'url(#cv-pat-2)',
    );
  });

  it('chỉ nội suy chuỗi ở thuộc tính hình học', () => {
    expect(lerpAttr('transform', 'translate(0 0)', 'translate(10 0)', 0.5)).toBe(
      'translate(5 0)',
    );
    expect(lerpAttr('font-family', 'A 1', 'A 3', 0.5)).toBe('A 3');
  });

  it('lerpColor giữ nguyên hai đầu', () => {
    expect(lerpColor('#123456', '#abcdef', 0)).toBe('#123456');
    expect(lerpColor('#123456', '#abcdef', 1)).toBe('#abcdef');
  });
});

describe('diff', () => {
  it('phân loại đúng thêm / mất / đổi / giữ nguyên', () => {
    const a = [
      keyed('same', 'rect', { x: 1 }),
      keyed('moved', 'rect', { x: 1 }),
      keyed('gone', 'rect', { x: 1 }),
    ];
    const b = [
      keyed('same', 'rect', { x: 1 }),
      keyed('moved', 'rect', { x: 9 }),
      keyed('fresh', 'rect', { x: 1 }),
    ];

    expect(diffNodes(a, b)).toEqual({
      entered: ['fresh'],
      exited: ['gone'],
      changed: ['moved'],
      unchanged: ['same'],
    });
  });

  it('thấy được thay đổi nằm sâu trong cây', () => {
    const a = [el('g', {}, [keyed('deep', 'rect', { x: 1 })])];
    const b = [el('g', {}, [keyed('deep', 'rect', { x: 2 })])];

    expect(diffNodes(a, b).changed).toEqual(['deep']);
  });
});
