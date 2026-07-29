import katex from 'katex';

/**
 * Render các đoạn `$…$` trong một chuỗi nội dung.
 *
 * Dùng chung cho đề bài, narrative, nhãn — mọi chỗ hiện văn bản của tác giả. Có
 * đúng một đường: nếu tách ra, sẽ có chỗ hiện `$8\times8$` thô như đề bài từng
 * bị, và nó chỉ lộ ra khi có người nhìn màn hình.
 *
 * `trust: false` (NFR-S1): file problem là **dữ liệu**. `\href{javascript:…}`
 * nằm trong một bài phải không làm được gì.
 */
const MATH_RE = /\$([^$]+)\$/g;

export function renderMath(source: string): string {
  let out = '';
  let cursor = 0;
  MATH_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MATH_RE.exec(source)) !== null) {
    out += escapeHtml(source.slice(cursor, match.index));
    try {
      out += katex.renderToString(match[1] as string, {
        trust: false,
        throwOnError: false,
        output: 'html',
      });
    } catch {
      out += escapeHtml(match[0]);
    }
    cursor = match.index + match[0].length;
  }
  out += escapeHtml(source.slice(cursor));

  return out;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
