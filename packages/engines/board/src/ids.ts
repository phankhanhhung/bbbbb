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

/**
 * Id của **nét gạch** trên một ô (BD-10).
 *
 * Danh tính riêng, không dùng chung với ô — và đó là cả lý do nó tồn tại: một pha
 * `show` phải hiện được *nét gạch* mà không hiện lại chính ô nằm dưới nó. Chung id
 * thì `applyChoreography` chạm cả hai (nó tra `data-el ?? key`), và một pha "gạch
 * dần từng bội của $2$" sẽ làm cả trăm ô nhoà vào rồi hiện ra.
 */
export function strikeId(row: number, col: number): string {
  return `strike-${row}-${col}`;
}

const STRIKE_ID_RE = /^strike-(\d+)-(\d+)$/;

export function parseStrikeId(id: string): { row: number; col: number } | null {
  const match = STRIKE_ID_RE.exec(id);
  if (!match) return null;
  return { row: Number(match[1]), col: Number(match[2]) };
}

/**
 * Id của **một bước** trong một đường đi (BD-11, M74).
 *
 * Cả đường có một id (id của element), và mỗi đoạn nối hai ô liên tiếp có id
 * riêng. Không phải cho đủ bộ: đó là chỗ element này **thắng** cách hack cũ mà
 * không mất gì. Sáu quân mang glyph mũi tên cho phép trỏ vào *nước đi thứ ba*, và
 * một bài song ánh ghép từng nước với từng chữ cái cần đúng khả năng ấy. Một
 * `polyline` liền một mạch thì không trỏ vào giữa được, nên đường vẽ ra thành
 * **từng đoạn**, mỗi đoạn một `data-el`.
 *
 * Hệ quả kèm theo: choreography hiện dần từng bước — thứ mà sáu quân cờ làm được
 * nhưng một đường liền thì không.
 */
export function pathStepId(pathId: string, index: number): string {
  return `${pathId}-step-${index}`;
}
