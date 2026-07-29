import { describe, expect, it } from 'vitest';
import {
  parseValueMarkup,
  renderValueMarkup,
  stripValueMarkup,
} from '../src/value-markup.js';

describe('markup giá trị `{{expr}}`', () => {
  it('đọc ra biểu thức, cắt khoảng trắng hai đầu', () => {
    expect(parseValueMarkup('có {{ inversions }} cặp').map((s) => s.expr)).toEqual([
      'inversions',
    ]);
  });

  it('đọc được nhiều biểu thức trong một câu', () => {
    const spans = parseValueMarkup('{{n}} đỉnh và {{m}} cạnh');
    expect(spans.map((s) => s.expr)).toEqual(['n', 'm']);
  });

  it('nhận biểu thức có dấu chấm và ngoặc', () => {
    expect(parseValueMarkup('{{count(vertices, v => deg(v) > 2)}}')[0]?.expr).toBe(
      'count(vertices, v => deg(v) > 2)',
    );
  });

  it('thay bằng giá trị', () => {
    expect(renderValueMarkup('có {{inversions}} cặp', () => '3')).toBe('có 3 cặp');
  });

  it('tính không được thì **giữ nguyên markup**', () => {
    // Thay bằng chuỗi rỗng sẽ cho ra "có  cặp" — đọc như câu bình thường và
    // không ai phát hiện. `{{…}}` còn nguyên thì đập vào mắt ngay.
    expect(renderValueMarkup('có {{hong}} cặp', () => null)).toBe('có {{hong}} cặp');
  });

  it('không đụng tới markup anchor', () => {
    const text = '[[a1|ba cặp]] và {{inversions}}';
    expect(renderValueMarkup(text, () => '3')).toBe('[[a1|ba cặp]] và 3');
  });

  it('strip giữ lại tên biểu thức cho chỉ mục tìm kiếm', () => {
    expect(stripValueMarkup('có {{inversions}} cặp')).toBe('có inversions cặp');
  });

  it('ngoặc đơn lẻ không phải markup', () => {
    expect(parseValueMarkup('tập {1, 2} và {{n}}').map((s) => s.expr)).toEqual(['n']);
  });
});
