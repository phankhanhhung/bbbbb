/**
 * Markup giá trị trong narrative: `{{inversions}}` — số **tính từ scene**, không
 * phải số gõ tay.
 *
 * Vì sao cần: bài `sorting-adjacent-swaps` từng viết "có $4$ cặp như vậy" trong
 * khi bảng bất biến ngay cạnh hiện $3$. Hai con số mâu thuẫn nhau trên cùng một
 * màn hình, qua nhiều commit, và không thứ gì trong pipeline kêu lên — vì với
 * máy thì chúng là hai thứ không liên quan: một bên là chữ, một bên là kết quả
 * DSL.
 *
 * Sửa bằng cách **bỏ hẳn bản sao** thay vì đi kiểm hai bản có khớp nhau không.
 * Viết `{{inversions}}` thì chữ và hình là *cùng một giá trị*, nên chúng không
 * thể lệch — không phải "khó lệch hơn", mà là không có đường nào lệch được.
 *
 * Cố ý dùng chính DSL của engine (DSL-01, grammar đóng, có ngân sách bước) chứ
 * không thêm ngôn ngữ mới: nội dung bài vẫn là **dữ liệu** (NFR-S1), và tác giả
 * chỉ phải học một thứ.
 */

const VALUE_RE = /\{\{([^{}]+)\}\}/g;

export interface ValueSpan {
  /** Biểu thức DSL, đã cắt khoảng trắng hai đầu. */
  readonly expr: string;
  readonly start: number;
  readonly end: number;
}

export function parseValueMarkup(text: string): ValueSpan[] {
  const spans: ValueSpan[] = [];
  VALUE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VALUE_RE.exec(text)) !== null) {
    spans.push({
      expr: (match[1] as string).trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return spans;
}

/**
 * Thay mỗi `{{expr}}` bằng giá trị.
 *
 * `resolve` trả `null` nghĩa là không tính được. Khi đó **giữ nguyên markup**
 * chứ không thay bằng chuỗi rỗng hay `undefined`: một câu thiếu mất con số đọc
 * như câu bình thường và không ai phát hiện, còn `{{expr}}` còn nguyên thì đập
 * vào mắt ngay.
 */
export function renderValueMarkup(
  text: string,
  resolve: (expr: string) => string | null,
): string {
  return text.replace(VALUE_RE, (full, expr: string) => resolve(expr.trim()) ?? full);
}

/** Bỏ markup, giữ lại biểu thức — dùng cho index tìm kiếm và alt_text fallback. */
export function stripValueMarkup(text: string): string {
  return text.replace(VALUE_RE, (_full, expr: string) => expr.trim());
}
