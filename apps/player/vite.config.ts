import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],

  /**
   * Cấu hình preview nằm **ở đây**, không nằm trong cờ dòng lệnh của Playwright.
   *
   * Hai lý do, cả hai đều là bài học từ một lần CI đỏ:
   *
   *   - `host` khai tường minh `127.0.0.1`. Mặc định vite nghe trên `localhost`,
   *     mà trên runner của GitHub `localhost` phân giải ra `::1` trước — server
   *     lên IPv6 còn Playwright gõ cửa IPv4 và chờ tới hết giờ. Tiến trình vẫn
   *     sống, cổng vẫn "mở", nên lỗi hiện ra dưới dạng timeout câm chứ không
   *     phải một thông báo.
   *   - Không truyền `--port` qua `pnpm --filter`: đường đó phụ thuộc vào việc
   *     pnpm chuyển tiếp cờ cho script con, một hành vi ta không kiểm soát.
   *     Cấu hình trong file thì lệnh chạy ở đâu cũng ra một kết quả.
   */
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    // NFR-P3: bundle Player ≤ 300KB gzip. Báo động sớm hơn ngưỡng để còn kịp xoay
    // sở, thay vì phát hiện lúc đã trượt.
    chunkSizeWarningLimit: 260,
  },
});
