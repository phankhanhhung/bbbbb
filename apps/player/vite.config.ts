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
  /**
   * Worker đóng gói thành **ES module**, không phải IIFE.
   *
   * `play.worker.ts` nạp engine bằng `import()` động, cùng lý do với `engines.ts`: một
   * bài Chomp không việc gì phải tải cả engine đồ thị lẫn engine bốc đống. Nhưng
   * `import()` nghĩa là code-splitting, và Vite mặc định đóng worker thành IIFE — một
   * định dạng **không** chia mã được. Kết quả là bản build đổ, còn dev server thì im,
   * đúng lớp khác biệt mà `playwright.config.ts` đã ghi là lý do e2e chạy trên bản build
   * thật.
   *
   * Cả hai worker vốn đã được tạo bằng `new Worker(…, { type: 'module' })`, nên dòng này
   * chỉ làm bản đóng gói khớp với lời khai sẵn có ở chỗ gọi. Module worker có từ Safari
   * 15, dưới mốc `es2022` mà build đã nhắm.
   */
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // NFR-P3: bundle Player ≤ 300KB gzip. Báo động sớm hơn ngưỡng để còn kịp xoay
    // sở, thay vì phát hiện lúc đã trượt.
    chunkSizeWarningLimit: 260,
  },
});
