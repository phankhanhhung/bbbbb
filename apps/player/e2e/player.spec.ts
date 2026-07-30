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

/**
 * CHO-02/09 — timeline nhiều pha, và bản đọc được khi tắt chuyển động.
 *
 * `telescoping-sum-fractions` s3 là bài đầu tiên có `choreography`: ba cặp hạng
 * tử triệt tiêu lần lượt rồi hai đầu mút sáng lên. Chọn nó vì thứ tự **là** lập
 * luận ở đây, không phải trang trí — nếu ai đó rút choreography xuống thành hiệu
 * ứng đẹp mắt thì đúng bài này sẽ mất nghĩa trước.
 */
test.describe('Choreography (CHO-02, CHO-09)', () => {
  const TELESCOPE = '/?p=telescoping-sum-fractions&sol=sol&step=s3';

  test('có thanh timeline, tua được, và mỗi pha ẩn thêm một cặp', async ({ page }) => {
    await page.goto(TELESCOPE);
    await reveal(page);

    const scrub = page.getByLabel('Tua trong bước');
    await expect(scrub).toBeVisible();

    // Đếm opacity thay vì chụp ảnh: nó nói đúng thứ choreography làm, và không đỏ
    // vì đổi phông. Khẳng định **có chờ** — patch chạy trong effect sau render,
    // nên `count()` một phát đọc trúng khung cũ và chỉ đỏ khi máy bận.
    const hidden = page.locator('.canvas svg [opacity="0"]');

    await scrub.fill('0');
    await expect(hidden).toHaveCount(0);

    await scrub.fill('1700');
    // Sáu hạng tử triệt tiêu cộng ba dấu phép giữa chúng và ba dấu đứng trước.
    await expect(hidden).toHaveCount(12);
  });

  test('reduced-motion: bộ đếm pha thay thanh tua, và đi được từng pha', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    await page.goto(TELESCOPE);
    await reveal(page);

    // Không có thanh tua — có bộ đếm. Đây là toàn bộ nội dung CHO-09: bỏ chuyển
    // động **không được** làm mất thông tin, nên pha phải đi được từng cái một
    // thay vì nhảy thẳng tới khung cuối (khung mất mát nhiều nhất).
    await expect(page.getByLabel('Tua trong bước')).toHaveCount(0);
    await expect(page.getByText(/Pha \d+\/\d+/)).toBeVisible();

    const hidden = (): Promise<number> => page.locator('.canvas svg [opacity="0"]').count();
    await page.getByRole('button', { name: 'Pha sau' }).click();
    const afterOne = await hidden();
    await page.getByRole('button', { name: 'Pha sau' }).click();
    const afterTwo = await hidden();

    expect(afterTwo).toBeGreaterThan(afterOne);
    await context.close();
  });
});

/**
 * PRN-04 — biến hình song ánh, kiểm bằng **chuyển động thật sự xảy ra**.
 *
 * Không phải test thừa. Bản đầu tiên của tính năng này chạy đủ thời lượng mà màn
 * hình đứng im, vì `move` lập chỉ mục theo id element còn node mang mực lại đeo
 * key riêng của renderer — một lỗi mà mọi unit test đều xanh và chỉ lộ ra khi
 * nhìn tận mắt. Đây là chốt canh cho đúng lớp lỗi ấy.
 */
test.describe('Biến hình song ánh (PRN-04)', () => {
  /**
   * Ràng buộc phân biệt "**theo từng cặp**" (SRS §257) với "đồng loạt": ở một
   * mốc giữa timeline, cặp đầu đã dịch chỗ mà cặp cuối thì chưa.
   *
   * Bản M37 dời tất cả cùng một `t`, và mọi test đều xanh — vì không test nào
   * hỏi câu này. Cộng thêm hai lần tính năng "chạy" mà màn hình đứng im, đây là
   * chốt canh cho đúng lớp lỗi ấy.
   */
  for (const [name, url, first, last] of [
    ['tập con ↔ xâu nhị phân', '/?p=subsets-binary-strings', '[data-el="x1"]', '[data-el="x4"]'],
    ['đồ thị ↔ ma trận kề', '/?p=adjacency-matrix-handshake', '[data-k="ev1v2"]', '[data-k="ev1v3"]'],
  ] as const) {
    test(`${name}: bay theo từng cặp, không đồng loạt`, async ({ page }) => {
      await page.goto(url);
      await reveal(page);
      await page.getByRole('button', { name: 'Biến hình' }).click();

      const scrub = page.getByLabel('Tua trong bước');
      const head = page.locator(`.bijection svg ${first}`).first();
      const tail = page.locator(`.bijection svg ${last}`).first();

      // $t = 0$ phải bằng đúng cây nguồn — không `translate(0 0)` nào.
      await scrub.fill('0');
      await expect(head).not.toHaveAttribute('transform');

      // Giữa chừng: cặp đầu **đã** dịch, cặp cuối **chưa**. Chính chỗ này là
      // khác biệt giữa "từng cặp" và "đồng loạt".
      const total = Number(await scrub.getAttribute('max'));
      await scrub.fill(String(Math.round(total * 0.45)));
      await expect(head).toHaveAttribute('transform', /^translate\(/);
      await expect(tail).not.toHaveAttribute('transform');

      await scrub.fill(String(total));
      await expect(page.getByRole('button', { name: 'Về hai hình' })).toBeVisible();
    });
  }

  test('mỗi pha có nhãn riêng — bộ đếm pha đọc được (CHO-09)', async ({ page }) => {
    await page.goto('/?p=subsets-binary-strings');
    await reveal(page);
    await page.getByRole('button', { name: 'Biến hình' }).click();

    const scrub = page.getByLabel('Tua trong bước');
    await scrub.fill('0');
    const first = await scrub.getAttribute('aria-valuetext');
    await scrub.fill(String(Math.round(Number(await scrub.getAttribute('max')) * 0.5)));
    const later = await scrub.getAttribute('aria-valuetext');

    // Mọi pha chung một anchor (bài này có đúng một), nên nhãn là thứ duy nhất
    // phân biệt chúng. Trùng nhau thì "bấm qua từng cặp" mất hết nghĩa.
    expect(first).not.toBe(later);
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

  /**
   * Hai lệnh có từ M4 mà tới M36 **không nút nào gọi**: `board/move-element` và
   * `board/rotate-tile`. Chú thích của lệnh đầu còn mô tả hành vi "kéo ra chỗ vi
   * phạm" — một hành vi sandbox chưa bao giờ chạm tới được. Test này đứng ở chỗ
   * đúng để bắt loại lỗi ấy: nó bấm **qua giao diện thật**, nên một lệnh không có
   * đường tới sẽ đỏ ở đây chứ không xanh ở unit test của engine.
   */
  test('di chuyển quân bằng **hai chạm**, và xoay bằng nút', async ({ page }) => {
    await page.goto('/?p=tromino-l-4x4&sol=sol-chia-tu&step=s3');
    await reveal(page);
    await page.getByRole('button', { name: 'Thử từ đây' }).click();

    const canvas = page.locator('.sandbox .canvas svg');
    // So **toàn bộ** tư thế các quân, không so một quân chọn sẵn: chỗ bấm rơi vào
    // quân nào là chuyện của hit-test, còn điều cần khẳng định là "có gì đó đổi".
    const poses = async (): Promise<string> =>
      (await canvas.locator('g[transform^="translate"]').evaluateAll((nodes) =>
        nodes.map((n) => `${n.getAttribute('transform')}|${n.querySelector('path')?.getAttribute('d') ?? ''}`),
      )).join('~');

    const box = (await canvas.boundingBox())!;
    const at = (fx: number, fy: number) =>
      page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);

    // Xoay: chọn công cụ, bấm vào quân ở giữa bàn.
    const beforeRotate = await poses();
    await page.getByRole('button', { name: /Xoay/ }).click();
    await at(0.5, 0.5);
    await expect.poll(poses).not.toBe(beforeRotate);

    // Di chuyển: chạm quân, rồi chạm ô đích.
    const beforeMove = await poses();
    await page.getByRole('button', { name: /Di chuyển/ }).click();
    await at(0.5, 0.5);
    await at(0.85, 0.15);
    await expect.poll(poses).not.toBe(beforeMove);
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

/**
 * Tỉ lệ scene → màn hình (G-10).
 *
 * Đây là lưới lẽ ra phải có từ đầu. Quy ước "một ô = 10 đơn vị scene" nằm trong
 * tài liệu từ M1 mà **không ai thi hành**: Player kéo mỗi `viewBox` cho đầy pane,
 * nên tỉ lệ thật là `pane / viewport.width` và nó đổi theo từng scene. Đo trên kho
 * 56 bài trước khi sửa: cùng một đối tượng chênh **7,1×** giữa các step của một
 * bài, và **10,2×** giữa các bài.
 *
 * Đại lượng đo ở đây là `px trên một đơn vị scene`, tính từ `viewBox` và kích cỡ
 * thật của thẻ `<svg>`. Đó là đại lượng duy nhất so sánh được giữa bảy engine —
 * đo "phần tử đầu tiên có key" thì mỗi scene một loại hình, không so được.
 */
test.describe('Tỉ lệ đồng nhất (G-10)', () => {
  const CELL_PX = 44;

  /** px cho **một ô** (10 đơn vị scene) của step đang hiện. */
  const cellPx = (page: Page): Promise<number | null> =>
    page
      .locator('.canvas svg')
      .first()
      .evaluate((el) => {
        const vb = (el.getAttribute('viewBox') ?? '').trim().split(/\s+/).map(Number);
        const rect = el.getBoundingClientRect();
        return vb[2] && vb[2] > 0 ? (rect.width / vb[2]) * 10 : null;
      });

  test('trong **một** bài, cỡ đối tượng không đổi giữa các step', async ({ page }) => {
    // Bài này là ca tệ nhất đo được: step đầu một đống sỏi, step sau cả phổ 40 ô.
    // Trước khi khoá tỉ lệ, hai step chênh nhau 7,1×.
    await page.goto('/?p=take-at-most-half');
    await reveal(page);

    const seen: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const px = await cellPx(page);
      if (px !== null) seen.push(px);
      const next = page.getByRole('button', { name: /Sau/ });
      if (await next.isDisabled()) break;
      await next.click();
      await page.waitForTimeout(120);
    }

    expect(seen.length).toBeGreaterThan(2);
    for (const px of seen) expect(px).toBeCloseTo(CELL_PX, 0);
  });

  test('giữa các bài và các engine, một ô là **cùng một** số pixel', async ({ page }) => {
    // Bảy engine, bảy bài. Đây là chỗ chênh 10,2× trước khi sửa.
    for (const id of [
      'mutilated-chessboard',
      'tromino-l-4x4',
      'ramsey-3-3-six',
      'venn-three-clubs',
      'happy-ending-five-points',
      'nim-three-piles-xor',
      'telescoping-sum-fractions',
    ]) {
      await page.goto(`/?p=${id}`);
      await reveal(page);
      const px = await cellPx(page);
      expect({ id, px: px === null ? null : Math.round(px) }).toEqual({ id, px: CELL_PX });
    }
  });

  test('scene nhỏ **không** bị thổi phồng cho đầy pane', async ({ page }) => {
    // Bàn 4×4 phải nhỏ hơn bàn 8×8 trên màn hình. Trước khi sửa thì ngược lại:
    // cả hai căng hết pane nên ô của bàn 4×4 to gần gấp đôi.
    await page.goto('/?p=tromino-l-4x4');
    await reveal(page);
    const small = (await page.locator('.canvas svg').first().boundingBox())!;

    await page.goto('/?p=mutilated-chessboard');
    await reveal(page);
    const big = (await page.locator('.canvas svg').first().boundingBox())!;

    expect(small.width).toBeLessThan(big.width);
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
