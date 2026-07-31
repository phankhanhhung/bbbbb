import { defineConfig, devices } from '@playwright/test';

/**
 * E2E cho Player (§9).
 *
 * Chạy trên **bản build thật**, không phải dev server: thứ cần bảo vệ là cái đến
 * tay người học, và bundle qua Vite có những khác biệt (nạp engine động theo
 * `engines_used[]`, tree-shaking, chỉ mục sinh lúc build) mà dev server che mất.
 *
 * Một profile iPad nằm sẵn ở đây. Nó **không** thay được phép đo trên máy thật
 * của gate G-A — Chromium desktop giả lập viewport và touch, không giả lập được
 * Safari WebKit lẫn CPU của iPad Gen 9. Nó chỉ bắt lớp lỗi rẻ hơn: bố cục vỡ ở
 * 1024×768 và những chỗ chỉ có hover mới bấm được.
 */
export default defineConfig({
  testDir: './apps/player/e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  projects: [
    // Perf tách project riêng và **phải chạy một worker** (`pnpm e2e:perf`): đo
    // frame time trong khi hai worker khác đang dựng browser thì con số nói về
    // máy CI đang bận, không về Player. Lần đầu chạy chung, p95 vọt lên 22ms rồi
    // về 17.6ms khi chạy riêng — cùng một dòng code.
    { name: 'desktop', testIgnore: /perf\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'ipad',
      testIgnore: /perf\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        isMobile: false,
      },
    },
    {
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Cổng và host khai trong `apps/player/vite.config.ts` — xem chú thích ở đó.
    command:
      'pnpm --filter @combviz/app-player build && pnpm --filter @combviz/app-player preview',
    url: 'http://127.0.0.1:4173',
    // **Luôn build lại**, kể cả ở máy cá nhân.
    //
    // Trước đây là `!process.env.CI`, tức ở local thì dùng lại server đang chạy. Một
    // server `vite preview` bật từ trước phục vụ `dist` **cũ**, nên e2e chạy xanh
    // trên bản build không có thay đổi vừa viết — và nó im lặng, không có dòng nào
    // nói "đang dùng lại". Đã mất một vòng debug vì đúng chuyện đó: `hold` nằm trong
    // JSON, nằm trong schema, mà bundle thì không có.
    //
    // Cùng bài học M45, khác chỗ: bộ kiểm chạy tay mà khác bộ kiểm CI thì nó không
    // phải bộ kiểm. Đổi lại vài giây build mỗi lần chạy.
    reuseExistingServer: false,
    timeout: 180_000,
    // Cho stdout của server chảy vào log. Không có nó, một server không lên chỉ
    // hiện ra sau ba phút im lặng rồi một dòng "Timed out" — đúng thứ đã xảy ra,
    // và nó khiến việc chẩn đoán phải đoán mò thay vì đọc.
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
