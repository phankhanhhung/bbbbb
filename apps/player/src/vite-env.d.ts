/**
 * Kiểu của `import.meta.glob`.
 *
 * Khai tay thay vì thêm `"vite/client"` vào `types` của tsconfig gốc: `types` ở
 * gốc áp cho **cả** package chạy trong Node (`tools/`, `packages/`), và kéo kiểu
 * DOM của vite vào đó sẽ làm biến mất đúng những lỗi mà ranh giới phụ thuộc
 * dựng ra để bắt — renderer thuần lỡ chạm `document` sẽ không còn kêu.
 */
interface ImportMeta {
  glob<T>(pattern: string): Record<string, () => Promise<T>>;
}
