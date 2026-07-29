import { expect, test, type Page } from '@playwright/test';
import { defaultTheme } from '@combviz/theme';

/**
 * Halo highlight lấy màu từ theme, không phải từ hằng số chép tay ở đây (DAT-20).
 * Nếu ai đó đổi màu trong theme, test này đi theo — đúng ý; nếu ai đó bỏ hẳn
 * halo, test này đỏ — cũng đúng ý.
 */
const HALO = `.canvas svg [stroke="${defaultTheme.emphasis.anchorHalo}"]`;

/**
 * E2E cho những hành vi mà unit test **không thể** bảo vệ: điều hướng cây thật,
 * anchor hai chiều đi qua DOM thật, deep-link, bàn phím, reduced-motion.
 *
 * Mỗi test ở đây từng là một lần mở browser bằng tay trong M4–M6. Việc đó không
 * chia tỷ lệ được với 25 bài, và nó là cách duy nhất tới giờ tìm ra loại lỗi
 * "test xanh mà màn hình sai" — nên nó phải thành máy chạy.
 */
const RAMSEY = '/?p=ramsey-3-3-six';
const CHESS = '/?p=mutilated-chessboard';

/** CMS-03: lời giải che mặc định — mọi test lời giải phải mở nó ra trước. */
async function reveal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Xem lời giải' }).click();
  await expect(page.locator('.narrative')).toBeVisible();
}

test.describe('Kho bài (CMS-02)', () => {
  /**
   * Không khoá cứng **số bài trong kho**.
   *
   * Bản đầu tiên viết `toHaveCount(2)` và bấm vào thẻ đầu tiên. Nó đỏ ngay lần
   * kho lớn lên — mà kho lớn lên là việc bình thường nhất của dự án này, nên
   * một test đỏ vì lý do đó đang canh sai thứ. Ràng buộc đúng là **hành vi**:
   * kho có bài, lọc thu hẹp được, và bấm vào một thẻ cụ thể thì mở đúng bài đó.
   */
  test('liệt kê, lọc và mở được một bài', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.bank__card');
    const total = await cards.count();
    expect(total).toBeGreaterThan(1);

    // Tìm kiếm chuẩn hoá dấu: học sinh gõ bàn phím điện thoại hay bỏ dấu.
    await page.getByPlaceholder('Tìm trong đề bài và lời giải…').fill('ban co khuyet hai o goc');
    await expect(cards).toHaveCount(1);
    expect(await cards.count()).toBeLessThan(total);

    await cards.first().click();
    await expect(page.locator('.player__head h1')).toContainText('Bàn cờ');
    await expect(page).toHaveURL(/p=mutilated-chessboard/);
  });

  test('tiêu đề render bằng KaTeX chứ không hiện tên lệnh thô', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Tìm trong đề bài và lời giải…').fill('ban co khuyet hai o goc');
    const title = page.locator('.bank__title').first();

    await expect(title).not.toContainText('times');
    // Đề bài này có ba đoạn toán ($8\times8$, $31$, $1\times2$); ràng buộc ở đây
    // là "có render", không phải đếm đúng số đoạn — đếm sẽ vỡ khi sửa đề.
    expect(await title.locator('.katex').count()).toBeGreaterThan(0);
  });

  test('chữ **đậm** hiện ra là chữ đậm, không phải dấu sao', async ({ page }) => {
    // 46 chỗ trên 23 bài dùng cú pháp này, và nó hiện thô suốt cho tới M13 —
    // ở cả trang kho lẫn trong bài, mà không test nào kêu.
    await page.goto('/');
    await page.getByPlaceholder('Tìm trong đề bài và lời giải…').fill('chia 10 chiec keo');

    const title = page.locator('.bank__title').first();
    await expect(title.locator('strong')).toHaveCount(1);
    await expect(title).not.toContainText('**');
  });
});

test.describe('Trình chiếu (PLY-01, CMS-03)', () => {
  test('lời giải ẩn cho tới khi bấm xem', async ({ page }) => {
    await page.goto(CHESS);

    await expect(page.locator('.narrative')).toHaveCount(0);
    await expect(page.getByText('Lời giải đang ẩn.')).toBeVisible();

    await reveal(page);
  });

  test('đi tới đi lui bằng nút và bằng phím', async ({ page }) => {
    await page.goto(CHESS);
    await reveal(page);

    const next = page.getByRole('button', { name: 'Sau →' });
    await expect(page.getByRole('button', { name: '← Trước' })).toBeDisabled();

    await next.click();
    await expect(page).toHaveURL(/step=s1/);

    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/step=s2/);
    await expect(next).toBeDisabled();

    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/step=s1/);
  });

  test('deep-link tới step giữa lời giải mở đúng chỗ (DAT-14)', async ({ page }) => {
    await page.goto(`${RAMSEY}&sol=sol-dirichlet&step=s3`);
    await reveal(page);

    await expect(page.locator('.tree__crumbs')).toContainText('Trường hợp');
  });

  test('link trỏ tới step không tồn tại thì về gốc êm, không trắng màn', async ({ page }) => {
    await page.goto(`${CHESS}&step=khong-co-buoc-nay`);
    await reveal(page);

    await expect(page.locator('.narrative')).toBeVisible();
  });
});

test.describe('Cây lời giải phân nhánh (PLY-02)', () => {
  test('dừng ở điểm rẽ nhánh và bắt người học chọn', async ({ page }) => {
    // s1 có hai con `case` ⇒ chính nó là điểm rẽ nhánh.
    await page.goto(`${RAMSEY}&step=s1`);
    await reveal(page);

    // Cả Next lẫn Play đều tắt, và hai lựa chọn hiện ra: không đường nào được
    // chọn hộ người học.
    await expect(page.getByRole('heading', { name: 'Chọn trường hợp để đi tiếp' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sau →' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Chạy/ })).toBeDisabled();
    await expect(page.locator('.choice')).toHaveCount(2);
  });

  test('breadcrumb theo đúng nhánh đang đi, và "về điểm rẽ nhánh" quay lại được', async ({
    page,
  }) => {
    await page.goto(`${RAMSEY}&step=s2`);
    await reveal(page);

    await page.locator('.choice').first().click();
    await expect(page.locator('.tree__crumbs')).toContainText('Trường hợp 1');

    await page.getByRole('button', { name: '↑ Về điểm rẽ nhánh' }).click();
    await expect(page.locator('.choice')).toHaveCount(2);
  });

  test('minimap cây chọn được một bước bất kỳ', async ({ page }) => {
    await page.goto(RAMSEY);
    await reveal(page);

    const nodes = page.locator('.tree__node');
    await expect(nodes.first()).toBeVisible();

    // Thứ tự node trong minimap là thứ tự bố cục cây, không phải thứ tự id —
    // nên test hỏi node đang nhắm tới bước nào thay vì đoán.
    const target = nodes.nth(1);
    const label = (await target.getAttribute('aria-label')) ?? '';
    await target.click();

    await expect(page).toHaveURL(/step=s\d/);
    await expect(page.locator('.tree__node[aria-selected="true"]')).toHaveAttribute(
      'aria-label',
      label,
    );
  });
});

test.describe('Anchor hai chiều (ANC-01)', () => {
  test('rê vào anchor thì tô sáng element, rời ra thì tắt', async ({ page }) => {
    await page.goto(CHESS);
    await reveal(page);

    const anchor = page.locator('.anchor').first();
    await expect(anchor).toBeVisible();

    const highlighted = page.locator(HALO);
    await expect(highlighted).toHaveCount(0);

    await anchor.hover();
    await expect(highlighted.first()).toBeVisible();

    await page.locator('.player__head h1').hover();
    await expect(highlighted).toHaveCount(0);
  });

  test('anchor tới được bằng bàn phím, không chỉ bằng chuột (NFR-A2)', async ({ page }) => {
    await page.goto(CHESS);
    await reveal(page);

    await page.locator('.anchor').first().focus();
    await expect(page.locator(HALO).first()).toBeVisible();
  });
});

test.describe('Tiếp cận (NFR-A3, NFR-C3)', () => {
  test('canvas có nhãn mô tả cho screen reader', async ({ page }) => {
    await page.goto(CHESS);

    const svg = page.locator('.canvas svg');
    await expect(svg).toHaveAttribute('role', 'img');
    const label = await svg.getAttribute('aria-label');
    expect(label?.length ?? 0).toBeGreaterThan(10);
  });

  test('reduced-motion: chuyển bước xong ngay, không kẹt giữa animation', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    await page.goto(CHESS);
    await reveal(page);
    await page.getByRole('button', { name: 'Sau →' }).click();

    // Không chờ animation: dưới reduced-motion, khung cuối phải có mặt ngay.
    // `data-k` là danh tính ổn định mà patch/diff bám vào (DAT-12).
    await expect(page.locator('.canvas svg [data-k]').first()).toBeVisible({ timeout: 1000 });
    await context.close();
  });
});

test.describe('Sandbox (SBX-01)', () => {
  test('"Thử từ đây" mở sandbox và không đụng vào lời giải', async ({ page }) => {
    await page.goto(CHESS);
    await reveal(page);

    await page.getByRole('button', { name: 'Thử từ đây' }).click();
    await expect(page.getByText('thao tác ở đây không đổi lời giải')).toBeVisible();
  });

  /**
   * Thanh công cụ phải **thuộc về engine đang mở** (SBX-01).
   *
   * Lỗi gốc do chính chủ tìm ra khi bấm thử: sandbox bày y một bộ công cụ ở mọi
   * bài — tám ô màu, các hình tile, "Xoá quân", "Lật hàng/cột" — trong khi bốn
   * nút cuối chỉ có nghĩa trên bàn cờ. Ở bài đồ thị hay bài game, bấm vào không
   * có gì xảy ra và cũng không có gì báo.
   */
  test('công cụ đổi theo engine, không phải một bộ dùng chung', async ({ page }) => {
    await page.goto(CHESS);
    await reveal(page);
    await page.getByRole('button', { name: 'Thử từ đây' }).click();

    const tools = page.locator('.sandbox__bar .tools').first();
    await expect(tools.getByRole('button', { name: 'domino' })).toBeVisible();
    await expect(tools.getByRole('button', { name: /Lật hàng/ })).toBeVisible();

    // Cùng nút ấy **không** được có ở bài game.
    await page.goto('/?p=nim-three-piles-xor');
    await reveal(page);
    await page.getByRole('button', { name: 'Thử từ đây' }).click();

    const gameTools = page.locator('.sandbox__bar .tools').first();
    await expect(gameTools.getByRole('button', { name: 'domino' })).toHaveCount(0);
    await expect(gameTools.getByRole('button', { name: /Lật hàng/ })).toHaveCount(0);
    // ...và nước đi thật thì phải có.
    await expect(gameTools.getByRole('button', { name: /^Bốc / }).first()).toBeVisible();
  });

  test('bấm một nước đi trong sandbox game **thật sự** đổi thế', async ({ page }) => {
    await page.goto('/?p=nim-three-piles-xor');
    await reveal(page);
    await page.getByRole('button', { name: 'Thử từ đây' }).click();

    const before = await page.locator('.sandbox .canvas svg circle').count();
    await page.getByRole('button', { name: /^Bốc 1$/ }).first().click();

    const canvas = page.locator('.sandbox .canvas svg');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.4);

    // Ít nhất một viên sỏi biến mất — nút không còn im lặng nữa.
    await expect
      .poll(async () => page.locator('.sandbox .canvas svg circle').count())
      .toBeLessThan(before);
  });
});

test.describe('Giá trị nội suy trong narrative', () => {
  test('{{expr}} hiện ra thành số, không hiện markup thô', async ({ page }) => {
    // Bài này từng ghi "có 4 cặp" trong khi bảng bất biến ngay cạnh hiện 3. Nay
    // hai chỗ là **cùng một giá trị**, nên chúng không thể lệch nữa — test này
    // canh chính đường render đó.
    await page.goto('/?p=sorting-adjacent-swaps');
    await reveal(page);

    const narrative = page.locator('.narrative');
    await expect(narrative).not.toContainText('{{');
    await expect(narrative).toContainText('3');

    // Và con số trong chữ khớp con số trong bảng bất biến.
    await expect(page.locator('.invariant__value').first()).toHaveText('3');
  });
});
