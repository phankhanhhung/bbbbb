/**
 * Id ổn định của một ô (DAT-12).
 *
 * Với ô, **vị trí chính là danh tính**: ô không di chuyển, nên toạ độ là id tự
 * nhiên và ổn định qua mọi lần sửa. Nhờ vậy anchor trỏ vào `cell-0-0` sống sót
 * qua mọi chỉnh sửa scene mà không cần bảng ánh xạ nào.
 *
 * Tách khỏi `index.ts` để `geometry.ts` (thuần) dùng được mà không kéo theo cả
 * engine fragment.
 */
export function cellId(row: number, col: number): string {
  return `cell-${row}-${col}`;
}

const CELL_ID_RE = /^cell-(\d+)-(\d+)$/;

export function parseCellId(id: string): { row: number; col: number } | null {
  const match = CELL_ID_RE.exec(id);
  if (!match) return null;
  return { row: Number(match[1]), col: Number(match[2]) };
}
