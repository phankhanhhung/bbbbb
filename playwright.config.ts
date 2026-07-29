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
    command: 'pnpm --filter @combviz/app-player build && pnpm --filter @combviz/app-player preview --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
