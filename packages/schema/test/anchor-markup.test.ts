import { describe, expect, it } from 'vitest';
import { parseAnchorMarkup, stripAnchorMarkup } from '../src/anchor-markup.js';

describe('parseAnchorMarkup', () => {
  it('đọc được nhiều anchor trong một câu', () => {
    const spans = parseAnchorMarkup('Xét [[a1|đỉnh $v$]] và [[a2|các cạnh kề]].');

    expect(spans.map((s) => s.key)).toEqual(['a1', 'a2']);
    expect(spans[0]!.label).toBe('đỉnh $v$');
  });

  it('giữ nguyên LaTeX có ngoặc vuông trong nhãn', () => {
    const spans = parseAnchorMarkup('[[a1|ô $c_{[i,j]}$]] bị phủ.');

    expect(spans).toHaveLength(1);
    expect(spans[0]!.label).toBe('ô $c_{[i,j]}$');
  });

  it('trả về vị trí để Studio bôi đen đúng chỗ', () => {
    const text = 'Còn [[a1|62 ô]] chưa phủ.';
    const span = parseAnchorMarkup(text)[0]!;

    expect(text.slice(span.start, span.end)).toBe('[[a1|62 ô]]');
  });

  it('không nhận khoá sai định dạng', () => {
    expect(parseAnchorMarkup('[[A1|hoa]] [[1a|số]] [[|rỗng]]')).toEqual([]);
  });

  it('không bị dính hai anchor liền nhau thành một', () => {
    const spans = parseAnchorMarkup('[[a1|x]][[a2|y]]');

    expect(spans.map((s) => s.label)).toEqual(['x', 'y']);
  });
});

describe('stripAnchorMarkup', () => {
  it('bỏ markup, giữ nhãn', () => {
    expect(stripAnchorMarkup('Xét [[a1|đỉnh $v$]] kề [[a2|$u$]].')).toBe(
      'Xét đỉnh $v$ kề $u$.',
    );
  });
});
