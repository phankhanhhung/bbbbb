import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Ngân sách perf NFR-P1..P3, đo bằng script (§13.1 nói rõ: "script tự động trong
 * CI perf **+** checklist tay trên thiết bị thật").
 *
 * **Đây là nửa script, không phải nửa thiết bị.** Gate G-A đòi 55fps trên iPad
 * Gen 9 / Safari; ở đây là Chromium desktop có bóp CPU. Hai thứ đó khác nhau ở
 * chỗ quan trọng nhất — engine JS khác, GPU khác, và Safari xử lý SVG lớn theo
 * cách riêng. Con số ở đây **không đóng được G-A**; nó chỉ làm một việc: bắt hồi
 * quy. Khi kho lên 25 bài, thứ giết perf hiếm khi là một thay đổi lớn, mà là
 * mười thay đổi nhỏ không ai đo — và cái đó thì script bắt được.
 *
 * Ngân sách ở đây đặt **chặt hơn** SRS một chút cho P2, vì máy chạy CI khoẻ hơn
 * iPad: một con số vừa đủ chạm ngưỡng ở đây gần như chắc chắn trượt trên iPad.
 */
const CHESS = '/?p=mutilated-chessboard';
const DIST = fileURLToPath(new URL('../dist', import.meta.url));

/** SRS: ≤ 150ms p95. Trên máy CI, đặt 100ms để còn chỗ cho iPad. */
const STEP_BUDGET_MS = 100;
/** SRS NFR-P1: p95 frame ≤ 18ms (55fps). */
const FRAME_BUDGET_MS = 18;
/** SRS NFR-P3: ≤ 300KB gzip, chưa tính phông KaTeX. */
const BUNDLE_BUDGET_KB = 300;

function p95(values: readonly number[]): number {
  return quantile(values, 0.95);
}

function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}

interface Sweep {
  readonly p50: number;
  readonly p95: number;
  readonly overBudget: number;
  readonly count: number;
}

/**
 * Tô quét ba lượt chéo qua cả bàn — thao tác nặng nhất của BD-01.
 *
 * Ba lượt chứ không một: p95 trên ~40 frame nghĩa là "frame tệ thứ ba", một con
 * số nhảy loạn giữa các lần chạy. Với ~240 frame thì nó mới nói được điều nó
 * hứa nói.
 */
async function sweep(page: Page, cpuRate: number, swatch = 0): Promise<Sweep> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });

  await page.evaluate(() => {
    const frames: number[] = [];
    let last = performance.now();
    (globalThis as unknown as { __frames: number[] }).__frames = frames;
    const tick = (): void => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Bật **rõ ràng** công cụ tô trước khi quét. Trước đây phép đo dựa vào một mặc
  // định ngầm (công cụ mặc định của sandbox là tô màu 1), và khi mặc định đổi
  // thành "Chọn" thì phép quét vẫn chạy trơn tru, vẫn ra một con số đẹp — chỉ là
  // nó đo thao tác *chọn* chứ không đo thao tác *tô*. Một phép đo sai còn tệ hơn
  // không đo, vì nó dạy người ta bỏ qua màu xanh.
  //
  // Mỗi lượt quét dùng **một màu khác**: hàm này được gọi hai lần trên cùng một
  // trang (gate ×2 rồi cảnh báo ×4), và tô lại đúng màu vừa tô thì hình không đổi
  // — chốt canh bên dưới sẽ báo động nhầm.
  await page.locator('.sandbox__bar .swatch').nth(swatch).click();

  const box = (await page.locator('.sandbox .canvas svg').boundingBox())!;
  // Chỉ cần biết **hình có đổi không**. Đếm số màu phân biệt thì quá thô: bàn cờ
  // đã sẵn ba màu trước khi tô một nét nào.
  const snapshot = () => page.locator('.sandbox .canvas svg').innerHTML();
  const before = await snapshot();

  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 1; i <= 80; i += 1) {
      const t = i / 81;
      await page.mouse.move(
        box.x + box.width * t,
        box.y + box.height * (pass % 2 === 1 ? 1 - t : t),
      );
    }
  }
  await page.mouse.up();

  const frames = (
    await page.evaluate(() => (globalThis as unknown as { __frames: number[] }).__frames)
  ).slice(5); // vài frame đầu là chi phí dựng sandbox, không phải chi phí tô

  // Nét quét **phải** đổi được hình. Không có dòng này thì bài đo im lặng thành
  // vô nghĩa đúng lúc nó ngừng tô được.
  expect(await snapshot()).not.toBe(before);

  return {
    p50: quantile(frames, 0.5),
    p95: quantile(frames, 0.95),
    overBudget: (100 * frames.filter((f) => f > FRAME_BUDGET_MS).length) / frames.length,
    count: frames.length,
  };
}

test.describe('Ngân sách perf', () => {
  /**
   * Đo perf song song với test khác cho ra số của **máy CI đang bận**, không phải
   * của Player: p95 nhảy từ 17.6ms lên 22ms mà không đổi một dòng code nào. Một
   * phép đo sai như vậy tệ hơn không đo, vì nó dạy người ta bỏ qua màu đỏ.
   */
  test.beforeAll(() => {
    const { workers } = test.info().config;
    if (workers > 1) {
      throw new Error(
        `Perf phải chạy một worker (đang ${workers}). Dùng: pnpm e2e:perf`,
      );
    }
  });

  test('NFR-P2 — chuyển step ≤ ngân sách p95', async ({ page }) => {
    await page.goto(CHESS);
    await page.getByRole('button', { name: 'Xem lời giải' }).click();

    // Bóp CPU 4× để con số nói về một máy yếu, không về máy CI.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const samples: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const forward = i % 2 === 0;
      const elapsed = await page.evaluate(async (dir) => {
        const canvas = document.querySelector('.canvas svg');
        if (!canvas) throw new Error('không thấy canvas');

        const started = performance.now();
        const settled = new Promise<number>((resolve) => {
          const observer = new MutationObserver(() => {
            observer.disconnect();
            // Chờ hết frame kế tiếp: "bắt đầu animation" nghĩa là khung đầu đã vẽ.
            requestAnimationFrame(() => resolve(performance.now() - started));
          });
          observer.observe(canvas, { attributes: true, childList: true, subtree: true });
        });

        dispatchEvent(new KeyboardEvent('keydown', { key: dir ? 'ArrowRight' : 'ArrowLeft' }));
        return settled;
      }, forward);

      samples.push(elapsed);
    }

    const measured = p95(samples);
    console.log(`NFR-P2 p95 = ${measured.toFixed(1)}ms (CPU ×4, ngân sách ${STEP_BUDGET_MS}ms)`);
    expect(measured).toBeLessThanOrEqual(STEP_BUDGET_MS);
  });

  test('NFR-P1 — tô quét giữ p95 frame ≤ 18ms', async ({ page }) => {
    await page.goto(CHESS);
    await page.getByRole('button', { name: 'Xem lời giải' }).click();
    await page.getByRole('button', { name: 'Thử từ đây' }).click();

    const canvas = page.locator('.sandbox .canvas svg');
    await expect(canvas).toBeVisible();

    // Gate chạy ở ×2; ×4 chỉ **báo động sớm**, không làm đỏ. Lý do nằm ở số đo:
    // frame bị vsync lượng tử hoá quanh 16.7ms, nên ở ×4 p95 rơi đúng 18.0–18.2ms
    // — hai bên mép ngân sách. Một gate đứng ở đó sẽ đỏ ngẫu nhiên, và một gate
    // đỏ ngẫu nhiên bị tắt trong hai tuần. Ở ×2 phép đo lặp lại được: p95 17.3ms,
    // dưới 2% frame vượt ngưỡng.
    const gate = await sweep(page, 2, 0);
    console.log(
      `NFR-P1 CPU ×2: p50=${gate.p50.toFixed(1)}ms p95=${gate.p95.toFixed(1)}ms` +
        ` · ${gate.overBudget.toFixed(1)}% frame > ${FRAME_BUDGET_MS}ms (n=${gate.count})`,
    );

    const warn = await sweep(page, 4, 1);
    console.log(
      `NFR-P1 CPU ×4 (cảnh báo sớm, không gate): p95=${warn.p95.toFixed(1)}ms` +
        ` · ${warn.overBudget.toFixed(1)}% frame > ${FRAME_BUDGET_MS}ms`,
    );

    expect(gate.p95).toBeLessThanOrEqual(FRAME_BUDGET_MS);
  });

  test('NFR-P3 — bundle ≤ 300KB gzip, chưa tính phông KaTeX', async ({ browser }) => {
    // Đo những file **thật sự được tải** khi mở một trang bài, không cộng mọi
    // file trong `dist`.
    //
    // Cộng cả thư mục là đúng khi mọi bài nằm trong bundle. Từ lúc bài tách
    // thành chunk lười, con số đó đo **tổng dung lượng site** chứ không đo thứ
    // người dùng tải: bài thứ hai trăm sẽ làm CI đỏ trong khi mỗi người đọc vẫn
    // tải đúng chừng ấy byte. Mà NFR-P3 nói về trang problem, và câu ngay dưới
    // đây đo đúng trang đó trên 4G.
    //
    // Không tin `content-length` của server preview: nó có thể không nén. Lấy
    // đường dẫn từ mạng rồi tự gzip file trên đĩa thì con số không phụ thuộc
    // cấu hình server, và vẫn không thể lách bằng cách chia nhỏ chunk — chia
    // bao nhiêu thì cũng ngần ấy file bị fetch.
    // Context **riêng**, vì cache đi theo context: chạy sau một test khác thì
    // vài chunk đã nằm sẵn trong cache và không xuất hiện trên mạng nữa. Đo kiểu
    // đó cho ra 177KB hay 244KB tuỳ thứ tự test — một ngưỡng phụ thuộc thứ tự
    // thì không canh được gì.
    const context = await browser.newContext();
    const page = await context.newPage();

    const fetched = new Set<string>();
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (/\.(js|css)$/.test(path)) fetched.add(path.replace(/^\//, ''));
    });

    // Bài đồ thị: đường nặng nhất, vì nó kéo theo cả analyzer worker.
    await page.goto('/?p=ramsey-3-3-six');
    await expect(page.locator('.canvas svg')).toBeVisible();

    let bytes = 0;
    for (const name of fetched) {
      const path = join(DIST, name);
      if (!statSync(path).isFile()) continue;
      bytes += gzipSync(readFileSync(path)).byteLength;
    }

    await context.close();

    const kb = bytes / 1024;
    // In thêm tổng cả thư mục để còn theo dõi xu hướng — nhưng không gate nó.
    const all = readdirSync(join(DIST, 'assets'))
      .filter((n) => /\.(js|css)$/.test(n))
      .reduce((n, name) => n + gzipSync(readFileSync(join(DIST, 'assets', name))).byteLength, 0);

    console.log(
      `NFR-P3 trang bài = ${kb.toFixed(1)}KB gzip (${fetched.size} file)` +
        ` · cả kho ${(all / 1024).toFixed(1)}KB, không gate`,
    );
    // Bài đo phải ĐO được gì đã: asset đổi đuôi (.mjs), inline vào HTML, hay
    // listener hụt → bytes = 0 → gate xanh trong khi không cân được gì. Cùng
    // nguyên tắc với "nét quét phải đổi được hình" ở bài đo sweep phía trên.
    expect(fetched.size, 'gate bundle bắt được 0 file — bài đo thành vô nghĩa').toBeGreaterThan(0);
    expect(kb).toBeLessThanOrEqual(BUNDLE_BUDGET_KB);
  });

  test('NFR-P3 — trang bài dùng được trên mạng 4G', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    // 4G "tốt": 9Mbps xuống, RTT 85ms. Không phải trường hợp xấu nhất, mà là
    // trường hợp **điển hình** của học sinh dùng điện thoại/iPad ngoài lớp.
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (9 * 1024 * 1024) / 8,
      uploadThroughput: (3 * 1024 * 1024) / 8,
      latency: 85,
    });

    const started = Date.now();
    await page.goto(CHESS);
    // "Dùng được" = hình đã có mặt, không phải "DOM đã parse".
    await expect(page.locator('.canvas svg')).toBeVisible();
    const elapsed = Date.now() - started;

    console.log(`NFR-P3 TTI ≈ ${elapsed}ms trên 4G mô phỏng (ngân sách 3000ms)`);
    expect(elapsed).toBeLessThanOrEqual(3000);
  });
});
