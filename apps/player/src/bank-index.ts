export interface IndexEntry {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly contest: string;
  readonly year?: number;
  readonly topics: readonly string[];
  readonly techniques: readonly string[];
  readonly engines: readonly string[];
  readonly difficulty: number;
  readonly slot: string;
  readonly kind: string;
  readonly steps: number;
  readonly hasBranching: boolean;
  readonly hasInvariants: boolean;
  readonly hasSandbox: boolean;
  /**
   * Số thứ tự trong sổ `packages/content/order.json`, đếm từ $1$, cũ nhất là $1$.
   *
   * **Chỉ để hiển thị.** Danh tính vẫn là `id` — nó là slug trên URL và tên của
   * 334 file golden. Đánh số vào dữ liệu thì thêm một bài cũ vào giữa sẽ dời tên
   * của mọi bài sau nó.
   */
  readonly ordinal: number;
  /**
   * Thuộc mẻ bài **thêm gần nhất**.
   *
   * Nó tự tắt khi mẻ sau được thêm, nên nhãn "MỚI" hết hạn mà không ai phải nhớ
   * đi gỡ — một dấu "mới" gài cứng sẽ nằm lại mãi và thành lời nói dối.
   */
  readonly isNew: boolean;
}
