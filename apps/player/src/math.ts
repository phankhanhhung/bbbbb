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
  // Cắt thành đoạn văn và đoạn công thức trước, rồi mới xử lý `**` **trên toàn
  // chuỗi**. Bản đầu tiên đổi `**` trong từng đoạn văn riêng lẻ, và chữ đậm bao
  // quanh một công thức — `**ít nhất $1$ chiếc**`, thứ nội dung dùng liên tục —
  // rơi hai dấu sao vào hai đoạn khác nhau, nên không đoạn nào có đủ một cặp và
  // cả hai hiện ra thô.
  const parts: { math: boolean; value: string }[] = [];
  let cursor = 0;
  MATH_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MATH_RE.exec(source)) !== null) {
    parts.push({ math: false, value: source.slice(cursor, match.index) });
    parts.push({ math: true, value: match[1] as string });
    cursor = match.index + match[0].length;
  }
  parts.push({ math: false, value: source.slice(cursor) });

  // Số dấu `**` lẻ nghĩa là tác giả đang viết phép nhân, không phải chữ đậm —
  // để nguyên còn hơn mở một thẻ nuốt hết phần còn lại của câu.
  const markers = parts
    .filter((p) => !p.math)
    .reduce((n, p) => n + (p.value.match(/\*\*/g) ?? []).length, 0);
  const bolding = markers > 0 && markers % 2 === 0;

  let open = false;
  let out = '';
  for (const part of parts) {
    if (!part.math) {
      out += bolding ? toggleBold(part.value, () => (open = !open)) : escapeHtml(part.value);
      continue;
    }
    try {
      out += katex.renderToString(part.value, {
        trust: false,
        throwOnError: false,
        output: 'html',
      });
    } catch {
      out += escapeHtml(`$${part.value}$`);
    }
  }

  return out;
}

/** Đổi mỗi `**` thành thẻ mở hoặc thẻ đóng, luân phiên. */
function toggleBold(value: string, flip: () => boolean): string {
  return escapeHtml(value).replace(/\*\*/g, () => (flip() ? '<strong>' : '</strong>'));
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
