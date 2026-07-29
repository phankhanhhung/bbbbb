/**
 * Hash chuẩn tắc của một Scene (A-03).
 *
 * Ba chỗ dùng chung nó, nên nó phải sống ở một chỗ:
 *   - ENG-04: cache kết quả analyzer theo hash scene,
 *   - golden test: nhận ra scene đã đổi,
 *   - label atlas (D-07): cache nhãn LaTeX đã pre-render.
 *
 * Yêu cầu: **thứ tự khoá không được ảnh hưởng kết quả**. Hai file khác nhau thứ
 * tự khoá nhưng cùng nội dung là cùng một scene; nếu hash khác nhau thì cache
 * trượt sạch mỗi lần Studio lưu lại file.
 */

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';

  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`)
    .join(',')}}`;
}

/**
 * FNV-1a 32-bit chạy hai lần với offset khác nhau, ghép thành 64 bit hex.
 *
 * Không phải hash mật mã và không cần là: đây là khoá cache, không phải chữ ký.
 * Đổi lại được chạy đồng nhất trong browser và Node mà không kéo theo phụ thuộc
 * nào — `crypto.subtle` là async và khác API giữa hai nền tảng.
 */
export function hashString(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;

  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }

  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');
  return hex(h1) + hex(h2);
}

export function hashScene(scene: unknown): string {
  return hashString(canonicalStringify(scene));
}
