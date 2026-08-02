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
    // Chờ kho vẽ xong rồi mới chụp mốc — `count()` không tự chờ.
    await expect.poll(() => cards.count()).toBeGreaterThan(1);
    const total = await cards.count();

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

  test('số thứ tự chạy từ #1, và nhãn "MỚI" nằm đúng ở đuôi kho', async ({ page }) => {
    await page.goto('/');
    // Chốt web-first trước khi đọc DOM hàng loạt: `evaluateAll` không thử lại,
    // nên chạy nó lúc danh sách chưa render xong sẽ ra mảng rỗng và mọi khẳng
    // định "mọi phần tử đều…" xanh vô nghĩa.
    await expect(page.locator('.bank__no').first()).toHaveText('#1');

    const cards = await page.locator('.bank__card').evaluateAll((list) =>
      list.map((card) => ({
        n: Number(card.querySelector('.bank__no')?.textContent?.replace('#', '')),
        fresh: card.querySelector('.bank__new') !== null,
      })),
    );

    // Không khoá cứng số bài lẫn cỡ mẻ mới — cả hai đổi mỗi lần thêm bài.
    expect(cards.map((c) => c.n)).toEqual(cards.map((_, i) => i + 1));

    const fresh = cards.filter((c) => c.fresh);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.length).toBeLessThan(cards.length);
    // Mẻ thêm gần nhất là một **đuôi liền** của sổ. Nếu nhãn rơi vào giữa thì
    // hoặc sổ bị xếp lại, hoặc `newest` không còn là mẻ cuối — cả hai đều làm
    // con số in trên thẻ mất nghĩa.
    expect(fresh.map((c) => c.n)).toEqual(cards.slice(-fresh.length).map((c) => c.n));
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

  /**
   * **Một chấm, một cỡ** — trên mọi bài, và cả sau khi thu gọn một nhánh.
   *
   * Đây là chốt canh cho luật tỉ lệ của bản đồ, và nó phải đo **pixel thật trên
   * màn hình** chứ không đọc thuộc tính `r`: cái sai cũ nằm đúng ở chỗ `r` không
   * đổi mà pixel thì đổi. `viewBox` tính từ hộp bao của cây cộng `width: 100%`
   * cho ra hệ số riêng cho từng bài — đo được $2{,}17\times$ ở một lời giải
   * tuyến tính và $1{,}73\times$ ở `ramsey-3-3-six`, tức cùng một chấm chênh nhau
   * $25\%$.
   *
   * Ba phép so, và chiều thứ ba là chiều tinh vi nhất: thu gọn một nhánh làm
   * `layout.height` đổi, nên ở bản cũ **mọi** node đổi cỡ vì một thao tác chỉ
   * đáng lẽ giấu vài node đi.
   */
  test('chấm trên bản đồ luôn cùng một cỡ — khác bài, và sau khi thu gọn', async ({ page }) => {
    // Node **không** được chọn: node hiện tại cố ý to hơn ($r = 8$ thay vì $6$),
    // nên lấy `.tree__node circle` đầu tiên là so hai bán kính khác nhau — và tuỳ
    // bố cục mà node đầu danh sách là gốc (sợi) hay một lá (cây).
    const dotWidth = async (): Promise<number> => {
      const box = await page
        .locator('.tree__node[aria-selected="false"] circle')
        .first()
        .boundingBox();
      expect(box).not.toBeNull();
      return Math.round((box as { width: number }).width);
    };

    await page.goto(RAMSEY);
    await reveal(page);
    const onRamsey = await dotWidth();

    // Thu gọn một nhánh: hộp bao của cây đổi, chấm thì không được đổi.
    await page.locator('.tree__collapse').first().click();
    expect(await dotWidth()).toBe(onRamsey);

    await page.goto(CHESS);
    await reveal(page);
    expect(await dotWidth()).toBe(onRamsey);

    // Và nó phải đúng con số mà hằng số hứa. Hộp bao **gồm cả nét viền**, nên
    // đường kính đo được là $(2r + \text{stroke}) \times$ hệ số, không phải $2r$ —
    // chép công thức thiếu nét viền thì test đỏ ở một con số đúng.
    expect(onRamsey).toBe(Math.round(((2 * 6 + 1.5) * 44) / 26));
  });

  /**
   * **122/143 lời giải không có nhánh nào**, và với chúng bản đồ phải là một sợi.
   *
   * Đo chiều cao **thật trên màn hình** chứ không đếm hàng: cái mua được ở đây là
   * chỗ trong một aside rộng 22rem, nên nếu một ngày ai đó dựng sợi bằng bốn hàng
   * chồng lên nhau thì test này phải đỏ dù `shape` vẫn khai `'strip'`.
   *
   * `mutilated-chessboard` thẳng, `ramsey-3-3-six` phân nhánh — cùng luật, hai hình.
   */
  test('lời giải thẳng vẽ thành sợi, không thành cây', async ({ page }) => {
    const mapHeight = async (): Promise<number> => {
      const box = await page.locator('.tree__canvas svg').boundingBox();
      expect(box).not.toBeNull();
      return (box as { height: number }).height;
    };

    await page.goto(CHESS);
    await reveal(page);
    await expect(page.locator('.tree--strip')).toHaveCount(1);
    // Sợi là **một** hàng: đúng một ô cao, cộng không gì khác.
    const strip = await mapHeight();
    expect(strip).toBeLessThanOrEqual(60);
    // Và không có nút thu gọn nào — thu gọn một sợi là tự giấu phần chưa đọc.
    await expect(page.locator('.tree__collapse')).toHaveCount(0);
    await expect(page.locator('.tree__toggle')).toContainText('Các bước');

    await page.goto(RAMSEY);
    await reveal(page);
    await expect(page.locator('.tree--tree')).toHaveCount(1);
    expect(await mapHeight()).toBeGreaterThan(strip * 2);
    await expect(page.locator('.tree__collapse').first()).toBeVisible();
    await expect(page.locator('.tree__toggle')).toContainText('Cấu trúc');
  });

  /**
   * `role="tree"` là một lời hứa về bàn phím, không chỉ về nhãn.
   *
   * Trước lượt này mỗi node mang `tabIndex={0}`, nên một cây 11 node ăn 11 lần Tab
   * — ngược hẳn với thứ `role="tree"` khai với screen reader — và nút thu gọn là
   * một `<circle>` có `onClick`, tức người dùng bàn phím **không thu gọn được
   * nhánh nào**.
   */
  test('bàn phím: một tab stop, ↑↓ đi node, ←→ thu mở nhánh', async ({ page }) => {
    await page.goto(RAMSEY);
    await reveal(page);

    const stops = page.locator('.tree__node[tabindex="0"]');
    await expect(stops).toHaveCount(1);

    await stops.first().focus();
    const start = await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label'),
    );

    await page.keyboard.press('ArrowDown');
    const next = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(next).not.toBe(start);
    // Roving: vẫn đúng **một** tab stop, và nó đã dời theo focus.
    await expect(stops).toHaveCount(1);

    // ← trên một node có con đang mở thì thu nhánh ấy lại.
    const expandable = page.locator('.tree__node[aria-expanded="true"]').first();
    await expandable.focus();
    const before = await page.locator('.tree__node').count();
    await page.keyboard.press('ArrowLeft');
    expect(await page.locator('.tree__node').count()).toBeLessThan(before);
    await expect(page.locator('.tree__node[aria-expanded="false"]')).toHaveCount(1);

    // → mở lại, và focus không rơi về body giữa chừng.
    await page.keyboard.press('ArrowRight');
    expect(await page.locator('.tree__node').count()).toBe(before);
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  });
});

test.describe('Đầu bài', () => {
  test('ghi chú nguồn được **sắp chữ**, không in ra `$...$` thô', async ({ page }) => {
    // `source.note` từng bị nội suy thẳng vào chuỗi, nên `$R(3,3)=6$` hiện ra đúng
    // mười ba ký tự — ở 21 bài trong kho. Statement ngay phía trên thì sắp chữ đúng,
    // nên lỗi này nằm im rất lâu: nhìn lướt thì tưởng ghi chú vốn viết thế.
    await page.goto('/?p=ramsey-3-3-six');
    const source = page.locator('.source');

    await expect(source).toBeVisible();
    await expect(source).not.toContainText('$');
    await expect(source.locator('.katex').first()).toBeVisible();
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

  test('CHO-11 — nhãn pha **hiện ra**, không chỉ nằm trong aria', async ({ page }) => {
    // Chữ giải thích từng pha đã được viết sẵn cho cả 87 pha của kho, nhưng chỉ bộ
    // đếm pha (giảm chuyển động) in nó ra. Người sáng mắt ở chế độ thường xem hình
    // đổi mà không có một chữ nào.
    await page.goto(TELESCOPE);
    await reveal(page);

    const phase = page.locator('.timeline__phase');
    await expect(phase).toBeVisible();
    await page.getByLabel('Tua trong bước').fill('900');
    await expect(page.locator('.timeline__label')).not.toBeEmpty();
  });

  test('CHO-11 — timeline **không tự chạy** khi vừa mở bước', async ({ page }) => {
    // Tự chạy nghĩa là hình bắt đầu đổi trước khi người xem kịp đọc câu đầu của lời
    // kể — mà lời kể mới là thứ nói cho họ biết phải nhìn cái gì.
    await page.goto(TELESCOPE);
    await reveal(page);

    // `exact` vì "Chạy lại" cũng chứa "Chạy"; khoanh vùng vì bảng điều khiển bước
    // cũng có một nút tên "Chạy".
    await expect(
      page.locator('.timeline').getByRole('button', { name: 'Chạy', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Tua trong bước')).toHaveValue('0');
    await page.waitForTimeout(400);
    await expect(page.getByLabel('Tua trong bước')).toHaveValue('0');
  });

  test('CHO-11 — ai cũng bật được chế độ từng pha, không riêng reduced-motion', async ({ page }) => {
    await page.goto(TELESCOPE);
    await reveal(page);

    await expect(page.getByLabel('Tua trong bước')).toBeVisible();
    await page.getByRole('button', { name: 'Từng pha' }).click();
    await expect(page.getByLabel('Tua trong bước')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pha sau' })).toBeVisible();
  });

  test('AL-06 — bài đại số có timeline **do engine sinh**, không do tác giả gõ', async ({ page }) => {
    // Trước M51: 39/39 step đại số không có một pha nào, tức mọi hình đại số trong
    // kho là ảnh tĩnh và cả bộ máy timeline của M48 chưa chạm tới engine mới nhất.
    // Không bài nào trong kho khai `choreography` cho engine này — nên thanh điều
    // khiển hiện ra ở đây **chỉ có thể** đến từ bộ sinh.
    await page.goto('/?p=grouping-and-completing-square&sol=sol&step=s0');
    await reveal(page);

    const scrub = page.getByLabel('Tua trong bước');
    await expect(scrub).toBeVisible();
    await expect(scrub).toHaveValue('0');

    // Khung đầu chỉ có dòng một: mực của dòng sau bị `show` giữ ở độ hiện 0.
    const inkAt = async (): Promise<number> =>
      page.locator('.canvas svg text:not([opacity="0"])').count();
    const first = await inkAt();
    expect(first).toBeGreaterThan(0);

    // Nhịp có mốc dừng: bộ sinh đặt `hold` ở đúng chỗ sắp đổi, nên bấm chạy thì nó
    // dừng giữa chừng và nút đổi thành "Tiếp". Kiểm **trước** khi kéo thanh tua —
    // kéo tới cuối rồi thì không còn pha nào phía sau để mà dừng.
    const bar = page.locator('.timeline');
    await bar.getByRole('button', { name: 'Chạy', exact: true }).click();
    await expect(bar.getByRole('button', { name: 'Tiếp' })).toBeVisible({ timeout: 8000 });

    // Kéo tới cuối thì mọi dòng đã hiện — nhiều chữ hơn hẳn khung đầu.
    await scrub.fill(String(await scrub.getAttribute('max')));
    await expect.poll(inkAt).toBeGreaterThan(first);
  });

  test('CHO-11 — `hold` **dừng** phát lại giữa chừng, và nút đổi thành "Tiếp"', async ({ page }) => {
    // Không phải chuyện tốc độ: chỉnh chậm lại thì cả timeline chậm đều, mà thứ cần
    // là **nhịp không đều** — dừng đúng chỗ tác giả bảo dừng.
    await page.goto('/?p=polynomial-division-longform&sol=sol&step=e1');
    await reveal(page);

    const scrub = page.getByLabel('Tua trong bước');
    const bar = page.locator('.timeline');
    await bar.getByRole('button', { name: 'Chạy', exact: true }).click();
    await expect(bar.getByRole('button', { name: 'Tiếp' })).toBeVisible({ timeout: 8000 });

    const stopped = Number(await scrub.inputValue());
    expect(stopped).toBeGreaterThan(0);
    expect(stopped).toBeLessThan(Number(await scrub.getAttribute('max')));
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

    // Đồng bộ theo **bộ đếm pha**, không theo thứ tự lệnh: `count()` không tự chờ,
    // nên đọc ngay sau `click()` là đọc trạng thái của pha *trước*. Chờ nhãn pha nhảy
    // số rồi mới đếm — đó là chỗ giao diện tự khai nó đã sang pha mới.
    const hidden = (): Promise<number> => page.locator('.canvas svg [opacity="0"]').count();
    const phase = page.getByText(/Pha \d+\/\d+/);

    await page.getByRole('button', { name: 'Pha sau' }).click();
    await expect(phase).toContainText('Pha 2/');
    const afterOne = await hidden();

    await page.getByRole('button', { name: 'Pha sau' }).click();
    await expect(phase).toContainText('Pha 3/');
    await expect.poll(hidden).toBeGreaterThan(afterOne);
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
/**
 * M69 — đồng hồ timeline phải reset **trong lượt render**, không đợi effect.
 *
 * Auto-diff của một lần chuyển step so *khung cuối cùng đã vẽ của step trước* với
 * *khung đầu của step mới*. Vế trái **được phép** phụ thuộc chỗ timeline cũ đang
 * đậu — đó là màn hình thật. Vế phải thì không: khung đầu luôn là mốc $0$.
 *
 * Nên chốt canh hỏi đúng vế phải, không cần con số phép màu nào: đậu timeline cũ
 * ở **cuối** rồi chuyển step thì auto-diff phải **lớn hơn hẳn** so với khi cả hai
 * cùng ở mốc $0$ — vì khung mốc $0$ của step mới giấu gần hết mọi dòng, còn khung
 * cuối của step cũ thì bày hết. Khi khung mới bị dựng nhầm ở mốc cũ, hai lần đo
 * **bằng nhau**: cả hai đều đang so hai khung cùng-mốc.
 *
 * Đo trước khi viết (`identity-roles-in-colour`, s0 → s1): đúng là *đổi 22*, dựng
 * ở mốc cuối timeline cũ ra *đổi 10* — bằng đúng số của lần không đậu.
 *
 * Và nó **dính lại**, không phải một khung thoáng qua: lượt effect kế tiếp thấy
 * `isStepChange` đã false nên không tính lại `setDiff` nữa, và bảng chẩn đoán mang
 * con số sai ấy suốt cả step.
 */
test.describe('Chuyển step: khung đầu dựng ở mốc 0 (M69)', () => {
  const ALG = '/?p=identity-roles-in-colour&sol=sol&step=s0';

  const changedAfterStepChange = async (page: Page, parkAtEnd: boolean): Promise<number> => {
    await page.goto(ALG);
    await reveal(page);
    const scrub = page.locator('.timeline__scrub');
    await expect(scrub).toBeVisible();
    if (parkAtEnd) {
      await scrub.fill((await scrub.getAttribute('max')) ?? '0');
      await expect(scrub).not.toHaveValue('0');
    }
    await page.getByRole('button', { name: 'Sau →' }).click();

    const diagnostics = page.locator('.diagnostics');
    await expect(diagnostics).toBeVisible();
    const text = await diagnostics.innerText();
    const changed = /đổi\s+(\d+)/.exec(text);
    expect(changed, `không đọc được số "đổi" trong "${text}"`).not.toBeNull();
    return Number(changed![1]);
  };

  test('khung đầu của step mới ở mốc 0, kể cả khi timeline cũ đậu ở cuối', async ({ page }) => {
    const bothAtZero = await changedAfterStepChange(page, false);
    const oldAtEnd = await changedAfterStepChange(page, true);

    expect(oldAtEnd).toBeGreaterThan(bothAtZero);
  });
});

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

    const stones = page.locator('.sandbox .canvas svg circle');
    // **Chờ sandbox vẽ xong rồi mới chụp mốc.** `count()` không tự chờ như
    // `expect(locator)`: gọi ngay sau khi bấm "Thử từ đây" thì nó trả $0$, và khẳng
    // định cuối bài thành "số sỏi < 0" — một điều kiện **không bao giờ đúng**, nên
    // test đỏ với thông báo vô nghĩa `Expected: < 0, Received: 14`. Nó xanh trên máy
    // rảnh và đỏ khi CI chạy hai worker song song.
    //
    // Khẳng định mốc khác $0$ chứ không chỉ chờ: mốc $0$ là một lỗi của **test**, và
    // nó phải nói ra điều đó thay vì hoá trang thành một lỗi của sản phẩm.
    await expect.poll(() => stones.count()).toBeGreaterThan(0);
    const before = await stones.count();

    await page.getByRole('button', { name: /^Bốc 1$/ }).first().click();

    const canvas = page.locator('.sandbox .canvas svg');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.4);

    // Ít nhất một viên sỏi biến mất — nút không còn im lặng nữa.
    await expect.poll(() => stones.count()).toBeLessThan(before);
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

test.describe('Tiểu sử hạng tử (AL-13)', () => {
  /**
   * Bài `factoring-identities` bước `c3` là một bất phương trình sáu dòng — đủ dài để
   * một hạng tử có tiểu sử đáng nhìn, và hệ số $3$ sống suốt từ dòng đầu tới dòng cuối.
   */
  const CHAIN = '/?p=factoring-identities&sol=sol&step=c3';

  /** Glyph mang danh tính hạng tử — `r{dòng}-{hạng tử}` (`layout.elementId`). */
  const TERM = '.canvas svg [data-el^="r0-"]';

  /**
   * Danh tính **đang đeo halo**, đọc từ DOM.
   *
   * Halo không nằm trên chính glyph mà trên một `<rect fill="none">` trong `<g>` mang
   * `data-k` — stroke đặt thẳng lên chữ sẽ vẽ viền quanh từng nét và biến hạng tử
   * thành vệt mực (`render.ts`). Nên đi từ rect ngược lên tìm `data-k`.
   */
  const lit = (page: Page): Promise<string[]> =>
    page.evaluate(() =>
      [
        ...new Set(
          [...document.querySelectorAll('.canvas svg rect[stroke]')]
            .filter((n) => (n.getAttribute('stroke') ?? '').toUpperCase() === '#E8B004')
            .map((n) => n.closest('[data-k]')?.getAttribute('data-k') ?? '')
            .filter(Boolean),
        ),
      ].sort(),
    );

  const rowsOf = (ids: string[]): Set<string> => new Set(ids.map((id) => id.split('-')[0]!));

  test('chạm một hạng tử thì cả phả hệ sáng lên ở nhiều dòng', async ({ page }) => {
    await page.goto(CHAIN);
    await reveal(page);

    // Nền: step này có anchor, và pha đầu của timeline bắt đầu ngay tại `ms = 0`, nên
    // đã có sẵn một vệt sáng trước khi ai chạm vào đâu. So với nền chứ không so với
    // rỗng — giả định "chưa chạm thì tối om" sai, và test đầu tiên đỏ vì đúng nó.
    const before = await lit(page);

    // `click()` của Playwright là pointerdown+pointerup tại cùng một điểm, tức dưới
    // ngưỡng 8px — đúng cử chỉ "chạm tại chỗ", không phải vuốt.
    await page.locator(TERM).nth(1).click();

    await expect.poll(() => lit(page)).not.toEqual(before);
    const after = await lit(page);
    // Phả hệ phải chạm **nhiều hơn một dòng**: đó là cả điểm của tính năng. Đếm dòng
    // chứ không đếm element — một dòng nhiều glyph sáng vẫn chỉ nói "chỗ này", không
    // nói "chỗ này đến từ đâu".
    expect(rowsOf(after).size).toBeGreaterThanOrEqual(2);
  });

  test('chạm vào chỗ trống thì vệt sáng về như cũ', async ({ page }) => {
    await page.goto(CHAIN);
    await reveal(page);

    const before = await lit(page);
    await page.locator(TERM).nth(1).click();
    await expect.poll(() => lit(page)).not.toEqual(before);

    // Mép dưới canvas — trong vùng bắt cử chỉ nhưng ngoài mọi hạng tử.
    const box = (await page.locator('.canvas').boundingBox())!;
    await page.mouse.click(box.x + 4, box.y + box.height - 4);
    await expect.poll(() => lit(page)).toEqual(before);
  });

  test('Escape cũng trả vệt sáng về như cũ', async ({ page }) => {
    await page.goto(CHAIN);
    await reveal(page);

    const before = await lit(page);
    await page.locator(TERM).nth(1).click();
    await expect.poll(() => lit(page)).not.toEqual(before);

    await page.keyboard.press('Escape');
    await expect.poll(() => lit(page)).toEqual(before);
  });

  test('vuốt ngang vẫn đổi step — cử chỉ mới không nuốt cử chỉ cũ', async ({ page }) => {
    await page.goto(CHAIN);
    await reveal(page);

    const box = (await page.locator('.canvas').boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 20, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 20, y, { steps: 8 });
    await page.mouse.up();

    // Vuốt sang phải là lùi một bước: `c3` có cha là `s0`.
    await expect(page).toHaveURL(/step=s0/);
  });
});

test.describe('Chạm vào điều kiện (AL-14)', () => {
  /** `6a/3a` rút gọn bởi $a$ — dòng đỏ "với $a \ne 0$" nằm dưới hình. */
  const COND = '/?p=what-disappears-and-why&sol=sol&step=s1';

  /**
   * Tua timeline tới cuối trước khi chạm.
   *
   * Ở khung $0$ dòng đỏ **chưa hiện** (choreography giữ nó lại — đọc kết luận trước
   * khi nghe kể là mất cả bước lập luận). Playwright vẫn bấm được một node `opacity:
   * 0`, nên bỏ bước này thì test xanh trên một trạng thái người dùng không với tới —
   * đúng loại chốt canh rỗng mà M63 vừa dính.
   */
  const toEnd = async (page: Page): Promise<void> => {
    await page.locator('.timeline__scrub').evaluate((el) => {
      const input = el as HTMLInputElement;
      input.value = input.max;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('.canvas svg [data-k="note0"]')).toHaveAttribute('opacity', '1');
  };

  test('chạm dòng đỏ → hiện đúng điểm làm điều kiện gãy', async ({ page }) => {
    await page.goto(COND);
    await reveal(page);

    await expect(page.locator('.incident')).toHaveCount(0);

    // Dòng đỏ mang danh tính `note0` — `key`, không phải `data-el` (`render.ts`).
    await toEnd(page);
    await page.locator('.canvas svg [data-k="note0"]').click();

    const incident = page.locator('.incident');
    await expect(incident).toBeVisible();
    await expect(incident).toContainText('a = 0');
    await expect(incident).toContainText('chia cho không');
  });

  test('đổi step thì lời giải thích biến mất — nó nói về step cũ', async ({ page }) => {
    await page.goto(COND);
    await reveal(page);

    await toEnd(page);
    await page.locator('.canvas svg [data-k="note0"]').click();
    await expect(page.locator('.incident')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.incident')).toHaveCount(0);
  });

  test('bài không có điều kiện thì chạm chỗ nào cũng không ra dòng ấy', async ({ page }) => {
    await page.goto('/?p=factoring-identities&sol=sol&step=s0');
    await reveal(page);

    const box = (await page.locator('.canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.incident')).toHaveCount(0);
  });
});

test.describe('Sandbox đại số: bảng nước đi (SBX-01, M65)', () => {
  /** `x^2 − 9` phân tích thành `(x−3)(x+3)` — dòng cuối là một tích nhân lại được. */
  const ALG = '/?p=factoring-identities&sol=sol&step=s0';

  const openSandbox = async (page: Page): Promise<void> => {
    await page.goto(ALG);
    await reveal(page);
    await page.getByRole('button', { name: 'Thử từ đây' }).click();
    await expect(page.locator('.sandbox')).toBeVisible();
  };

  /**
   * Bấm vào giữa hộp một hạng tử ở **dòng cuối**.
   *
   * Dòng cuối chứ không phải dòng đầu, và đó không phải chi tiết: chuỗi biến đổi lớn
   * lên ở đáy, nên chỉ dòng cuối mới có nước đi. Bản đầu của chốt canh này chạm dòng
   * $0$ và bảng rỗng — engine trả lời **đúng**, test hỏi sai.
   */
  const tapLastRowTerm = async (page: Page, index = 0): Promise<void> => {
    const box = await page
      .locator('.sandbox .canvas svg .cv-alg-row')
      .last()
      .locator('[data-k]')
      .nth(index)
      .locator('rect')
      .boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  };

  /**
   * Chạm lần lượt từng hạng tử của dòng cuối tới khi gặp một nút có nước đi **không
   * cần tham số**.
   *
   * Không đoán trước nút nào có: hit-test chọn hộp nhỏ nhất chứa điểm bấm, và hộp nào
   * nhỏ nhất thì phụ thuộc bố cục. Dò thì chốt canh nói đúng điều nó muốn nói — *"có
   * một chỗ bấm được là chạy ngay"* — thay vì khoá cứng vào một toạ độ.
   */
  const tapUntilPlainMove = async (page: Page): Promise<void> => {
    const count = await page
      .locator('.sandbox .canvas svg .cv-alg-row')
      .last()
      .locator('[data-k]')
      .count();
    for (let i = 0; i < count; i += 1) {
      await tapLastRowTerm(page, i);
      if ((await page.locator('.moves__item').filter({ hasNotText: '…' }).count()) > 0) return;
    }
    throw new Error('không hạng tử nào của dòng cuối có nước đi không cần tham số');
  };

  test('chưa chọn gì thì panel mời chạm, chọn rồi thì liệt kê luật', async ({ page }) => {
    await openSandbox(page);

    const panel = page.locator('.moves');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Chạm một phần của dòng cuối');

    await tapLastRowTerm(page);
    await expect(panel.locator('.moves__item').first()).toBeVisible();
  });

  test('bảng **đã lọc**: không bày luật của họ nút khác', async ({ page }) => {
    await openSandbox(page);
    await tapLastRowTerm(page);

    const labels = await page.locator('.moves__item').allInnerTexts();
    // Chiều dương trước: bảng rỗng thì hai khẳng định not-contain dưới xanh mà
    // chưa kiểm phép lọc nào — hit-test đổi bố cục là test thành vô nghĩa.
    expect(labels.length).toBeGreaterThan(0);
    // Nút đại số thường: không có luật của hệ phương trình hay của tổng $\Sigma$.
    expect(labels.join(' ')).not.toContain('hệ phương trình');
    expect(labels.join(' ')).not.toContain('tách tổng');
  });

  test('bấm một luật thì chuỗi dài thêm một dòng, và hoàn tác được', async ({ page }) => {
    await openSandbox(page);

    const rows = page.locator('.sandbox .canvas svg .cv-alg-row');
    const before = await rows.count();

    await tapUntilPlainMove(page);
    // Luật **không** cần tham số (không có dấu …): bấm là chạy ngay.
    await page.locator('.moves__item').filter({ hasNotText: '…' }).first().click();
    await expect(rows).toHaveCount(before + 1);

    await page.getByRole('button', { name: /Hoàn tác/ }).click();
    await expect(rows).toHaveCount(before);
  });

  /**
   * SBX-06 — bản đồ vết chân (M75).
   *
   * Thứ nó phải chứng minh không phải "có vẽ ra": mà là **nó giữ được nhánh mà
   * undo vứt đi**, và chạm vào một chấm thì đứng về đúng đó.
   */
  test('bản đồ mọc theo từng nước, và giữ nhánh mà hoàn tác vứt đi', async ({ page }) => {
    await openSandbox(page);

    // Chưa đi bước nào thì không có bản đồ: một chấm lẻ không phải một tấm bản đồ.
    await expect(page.locator('.trail__map')).toHaveCount(0);

    const rows = page.locator('.sandbox .canvas svg .cv-alg-row');
    const before = await rows.count();
    await tapUntilPlainMove(page);
    await page.locator('.moves__item').filter({ hasNotText: '…' }).first().click();
    await expect(rows).toHaveCount(before + 1);
    await expect(page.locator('.trail__dot')).toHaveCount(2);

    // Hoàn tác: chấm cũ **còn nguyên** trên bản đồ (khác hẳn `future: []` của
    // lịch sử undo), và chỗ đang đứng lùi về gốc.
    await page.getByRole('button', { name: /Hoàn tác/ }).click();
    await expect(rows).toHaveCount(before);
    await expect(page.locator('.trail__dot')).toHaveCount(2);
    await expect(page.locator('.trail__dot.is-here')).toHaveCount(1);
  });

  test('chạm một chấm là **đứng về đó** — không phải một gợi ý, là lịch sử của chính mình', async ({
    page,
  }) => {
    await openSandbox(page);
    const rows = page.locator('.sandbox .canvas svg .cv-alg-row');
    const before = await rows.count();

    await tapUntilPlainMove(page);
    await page.locator('.moves__item').filter({ hasNotText: '…' }).first().click();
    await expect(rows).toHaveCount(before + 1);

    // Chấm đầu tiên là gốc — chạm vào nó thì chuỗi về lại độ dài ban đầu.
    await page.locator('.trail__dot').first().click();
    await expect(rows).toHaveCount(before);
  });

  test('tham số hỏng → **nguyên văn** lời từ chối của engine, không phải một dấu ✗', async ({
    page,
  }) => {
    await openSandbox(page);
    await tapLastRowTerm(page);

    // Luật cần tham số mở một ô nhập ngay dưới nó.
    const needsArg = page.locator('.moves__item', { hasText: '…' }).first();
    await needsArg.click();
    await page.locator('.moves__arg input').fill('zzz');
    await page.locator('.moves__arg button').click();

    const refusal = page.locator('.moves__refusal');
    await expect(refusal).toBeVisible();
    // Câu đầy đủ, không phải một ký tự.
    expect((await refusal.innerText()).length).toBeGreaterThan(10);
  });

  /**
   * Lượt rà trước freeze: hai listener bàn phím — của Player và của Sandbox —
   * từng cùng sống trên window và cùng mù `event.target`. Space trong ô nhập bị
   * Player nuốt để toggle autoplay chạy sau lưng; Ctrl+Z trong ô nhập bị Sandbox
   * nuốt để undo cả bàn làm việc và đóng luôn form đang gõ.
   */
  test('phím của Player **im** khi đã fork: mũi tên không lái player ẩn phía sau', async ({
    page,
  }) => {
    await openSandbox(page);
    const url = page.url();

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    expect(page.url()).toBe(url);
  });

  test('Space gõ được vào ô nhập tham số — không bị nuốt để toggle autoplay', async ({
    page,
  }) => {
    await openSandbox(page);
    await tapLastRowTerm(page);
    await page.locator('.moves__item', { hasText: '…' }).first().click();

    const input = page.locator('.moves__arg input');
    await input.click();
    await page.keyboard.type('a b');

    await expect(input).toHaveValue('a b');
  });

  test('Ctrl+Z trong ô nhập là undo văn bản, không phải undo sandbox', async ({ page }) => {
    await openSandbox(page);

    const rows = page.locator('.sandbox .canvas svg .cv-alg-row');
    const before = await rows.count();
    await tapUntilPlainMove(page);
    await page.locator('.moves__item').filter({ hasNotText: '…' }).first().click();
    await expect(rows).toHaveCount(before + 1);

    // Mở một ô nhập trên dòng cuối mới rồi Ctrl+Z ngay trong đó.
    const count = await rows.last().locator('[data-k]').count();
    for (let i = 0; i < count; i += 1) {
      await tapLastRowTerm(page, i);
      if ((await page.locator('.moves__item').filter({ hasText: '…' }).count()) > 0) break;
    }
    const input = page.locator('.moves__arg input');
    await page.locator('.moves__item').filter({ hasText: '…' }).first().click();
    await input.click();
    await page.keyboard.type('xy');
    await page.keyboard.press('ControlOrMeta+z');

    // Sandbox KHÔNG hoàn tác: dòng vừa thêm vẫn còn, form vẫn mở.
    await expect(rows).toHaveCount(before + 1);
    await expect(input).toBeVisible();
  });
});

test.describe('Lượt rà: cử chỉ trên canvas không lái nhầm chỗ', () => {
  test('kéo dọc lệch ngang quá 48px KHÔNG đổi step — trục trội mới được nói', async ({
    page,
  }) => {
    await page.goto(CHESS);
    await reveal(page);
    await page.getByRole('button', { name: 'Sau →' }).click();
    await expect(page).toHaveURL(/step=s1/);

    // Kéo dọc 100px, lệch ngang +60px. `touch-action: none` nên cú kéo này
    // không cuộn trang mà giao trọn cho canvas — bản cũ chỉ nhìn dx>48 và lùi
    // step, người dùng không hiểu chuyện gì vừa xảy ra.
    const box = (await page.locator('.canvas').boundingBox())!;
    const cx = box.x + box.width / 2;
    await page.mouse.move(cx, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(cx + 60, box.y + 120, { steps: 5 });
    await page.mouse.up();

    await expect(page).toHaveURL(/step=s1/);
  });

  test('chạm hình khi lời giải còn che: không phả hệ, không sự cố', async ({ page }) => {
    await page.goto('/?p=factoring-identities&sol=sol&step=s0');
    // KHÔNG reveal — phả hệ và sự cố là công cụ đọc lời giải, trước "Xem lời
    // giải" thì trả lời là rò rỉ nội dung đang che.
    //
    // So TRƯỚC/SAU chứ không đòi 0 tuyệt đối: khung 0 của choreography sinh máy
    // vốn đã tô sáng anchor của pha đầu, và halo ấy không phải thứ test này canh.
    // Điều phải giữ là cú chạm KHÔNG THÊM vệt nào. Mốc "trước" chỉ được chụp sau
    // khi canvas render xong — engine nạp async, chụp sớm thì đếm được 0 rồi đổ
    // oan cho cú chạm cái halo vốn thuộc về khung 0.
    await expect(page.locator('.canvas svg .cv-alg-row').first()).toBeVisible();
    await page.waitForTimeout(250);
    const halos = page.locator(HALO);
    const before = await halos.count();

    const term = page
      .locator('.canvas svg .cv-alg-row')
      .last()
      .locator('[data-k] rect')
      .first();
    const box = (await term.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(120);

    await expect(halos).toHaveCount(before);
    await expect(page.locator('.incident')).toHaveCount(0);
  });
});

test.describe('Anchor xuyên pane (ANC-05, M66)', () => {
  const TWO = '/?p=pascal-two-proofs';

  /** Danh tính đang đeo halo, gộp cả hai pane. */
  const lit = (page: Page): Promise<string[]> =>
    page.evaluate(() =>
      [
        ...new Set(
          [...document.querySelectorAll('.bijection svg [stroke]')]
            .filter((n) => (n.getAttribute('stroke') ?? '').toUpperCase() === '#E8B004')
            .map((n) => n.closest('[data-k]')?.getAttribute('data-k') ?? '')
            .filter(Boolean),
        ),
      ].sort(),
    );

  test('anchor mặc định đã sáng **cả hai** pane ngay khi mở', async ({ page }) => {
    await page.goto(TWO);
    await reveal(page);

    // Engine đại số tự sinh timeline cho pane trái, và pha đầu bắt đầu ngay tại
    // `ms = 0`, nên `a1` đã sáng sẵn — giống hệt baseline mà M63/M64 gặp. So với nền
    // chứ không so với rỗng.
    const on = await lit(page);
    expect(on).toContain('r0-e3'); // hạng tử $C_5^2$, pane trái
    expect(on).toContain('target'); // ô $C_5^2 = 10$, pane phải
  });

  test('rê vào một anchor khác thì cả hai pane theo nó', async ({ page }) => {
    await page.goto(TWO);
    await reveal(page);
    const before = await lit(page);

    // Anchor `a2` — "$C_4^1$" — trỏ vào một hạng tử bên trái **và** một region bên phải.
    await page.locator('.anchor').nth(1).hover();
    await expect.poll(() => lit(page)).not.toEqual(before);

    const on = await lit(page);
    expect(on).toContain('r4-e10'); // hạng tử, pane trái
    expect(on).toContain('above-left'); // region, pane phải
  });

  test('rời chuột thì cả hai về nền', async ({ page }) => {
    await page.goto(TWO);
    await reveal(page);
    const before = await lit(page);

    await page.locator('.anchor').nth(1).hover();
    await expect.poll(() => lit(page)).not.toEqual(before);

    await page.locator('.player__head h1').hover();
    await expect.poll(() => lit(page)).toEqual(before);
  });

  test('nút Biến hình chạy được xuyên engine', async ({ page }) => {
    await page.goto(TWO);
    await reveal(page);

    await expect(page.locator('.bijection__pane')).toHaveCount(2);
    await page.getByRole('button', { name: /Biến hình/ }).click();

    // Chế độ biến hình gộp hai pane thành **một** canvas, và canvas ấy phải có mực —
    // morph xuyên engine đi đường toạ độ scene (`boxOf`), không đường sao chép thuộc
    // tính, nên một khung trống ở đây nghĩa là đường ấy đứt.
    const pane = page.locator('.bijection__pane');
    await expect(pane).toHaveCount(1);
    expect(await pane.locator('svg *').count()).toBeGreaterThan(0);
  });
});

/**
 * GM-02/03/04 — chơi một ván bằng chuột (M78.7).
 *
 * Chỗ này e2e trả tiền: sáu lượt trước dựng đủ bộ máy để chơi mà không lượt nào chứng
 * minh được rằng **người ta bấm được**. Ba thứ chỉ tồn tại trong browser thật — hit-test
 * trên SVG đã scale, Worker của solver, và cái nút tải draft — nên unit test không với
 * tới, đúng như `moves`/anchor của những lượt trước.
 */
const CHOMP = '/?p=chomp-poison-corner';

test.describe('Ván chơi (GM-02/03/04, M78.7)', () => {
  async function open(page: Page): Promise<void> {
    await page.goto(CHOMP);
    await page.getByRole('button', { name: 'Chơi thử', exact: true }).click();
    await expect(page.locator('.play__canvas')).toBeVisible();
  }

  test('chơi hết một ván bằng **chuột trên hình**, đúng lượt, và hiện người thắng', async ({
    page,
  }) => {
    await open(page);
    // Bàn $3\times3$ ⇒ chín ô còn lại là chín nước.
    await expect(page.locator('.moves__item')).toHaveCount(9);
    await expect(page.locator('.turn__chip--on')).toHaveText(/Người 1/);

    const canvas = page.locator('.play__canvas');
    const box = (await canvas.boundingBox())!;
    // Ăn ô góc dưới–phải: một ô, nên bàn còn tám.
    await page.mouse.click(box.x + box.width * 0.83, box.y + box.height * 0.83);

    await expect(page.locator('.moves__item')).toHaveCount(8);
    // Đổi lượt — và đây là chỗ `first` + số nước phải khớp với thứ hiện ra.
    await expect(page.locator('.turn__chip--on')).toHaveText(/Người 2/);
    await expect(page.locator('.play__log-item')).toHaveCount(1);

    // Đi bừa cho tới hết ván bằng bảng nước đi.
    for (let i = 0; i < 12; i += 1) {
      const items = page.locator('.moves__item');
      if ((await items.count()) === 0) break;
      await items.first().click();
    }

    // Hết nước ⇒ băng người thắng, và **Chomp là misère**: người ăn ô độc thua.
    const winner = page.locator('.play__winner');
    await expect(winner).toBeVisible();
    await expect(winner).toContainText('thắng');
    await expect(page.locator('.moves__item')).toHaveCount(0);
  });

  test('rê trên hình thì **đúng một ô** sáng lên', async ({ page }) => {
    // Bản đầu sáng mọi nước hợp lệ cùng lúc, và cả bàn hoá một khối vàng — "sáng" mà
    // không phân biệt được gì thì không phải một tín hiệu.
    await open(page);
    const canvas = page.locator('.play__canvas');
    const box = (await canvas.boundingBox())!;

    const halo = `.play__canvas [stroke="${defaultTheme.emphasis.anchorHalo}"]`;
    await expect(page.locator(halo)).toHaveCount(0);

    await page.mouse.move(box.x + box.width * 0.83, box.y + box.height * 0.83);
    await expect(page.locator(halo)).toHaveCount(1);
  });

  test('Lùi một nước trả lại đúng thế trước đó, Chơi lại về đầu', async ({ page }) => {
    await open(page);
    const canvas = page.locator('.play__canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.83, box.y + box.height * 0.83);
    await expect(page.locator('.moves__item')).toHaveCount(8);

    await page.getByRole('button', { name: '↶ Lùi một nước' }).click();
    await expect(page.locator('.moves__item')).toHaveCount(9);
    await expect(page.locator('.turn__chip--on')).toHaveText(/Người 1/);
    await expect(page.locator('.play__log-item')).toHaveCount(0);

    await page.mouse.click(box.x + box.width * 0.83, box.y + box.height * 0.83);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.17);
    await expect(page.locator('.play__log-item')).toHaveCount(2);
    await page.getByRole('button', { name: '⟲ Chơi lại' }).click();
    await expect(page.locator('.moves__item')).toHaveCount(9);
    await expect(page.locator('.play__log-item')).toHaveCount(0);
  });

  test('"Ai thắng thế này?" chạy trong Worker và đánh dấu nước thắng', async ({ page }) => {
    // Solver M78.5 chạy trong Worker (M78.6). Nó không tồn tại trong unit test, và đây
    // là chốt canh duy nhất nói được rằng đường Worker thật sự nối tới màn hình.
    await open(page);
    await page.getByRole('button', { name: 'Ai thắng thế này?' }).click();
    await expect(page.locator('.play__advice')).toBeVisible({ timeout: 15_000 });
    // Bàn $3\times3$: người đi trước thắng, và nước thắng duy nhất là ăn ô $(1,1)$.
    await expect(page.locator('.play__advice')).toContainText('Bạn thắng');
    await expect(page.locator('.moves__item--win')).toHaveCount(1);
    await expect(page.locator('.moves__item--win')).toContainText('(1, 1)');

    // Đi một nước thì lời khuyên **tắt**: nó nói về thế cũ, và một câu trả lời đúng cho
    // thế cũ là một câu sai cho thế đang xem.
    //
    // Đi **nước thắng**, không phải nước đầu danh sách: nước đầu là "Ăn ô độc", và nó
    // kết thúc ván ngay — lúc ấy không có nút hỏi nào để mà kiểm, đúng như thiết kế.
    await page.locator('.moves__item--win').click();
    await expect(page.locator('.play__advice')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ai thắng thế này?' })).toBeVisible();
  });

  test('bài **không** khai `play` thì không có nút chơi', async ({ page }) => {
    // Nút chơi hiện ra ở một bài không chơi được là một lời hứa hão: bấm vào rồi mới
    // biết engine không có họ luật nào.
    await page.goto(CHESS);
    await expect(page.getByRole('button', { name: 'Chơi thử', exact: true })).toHaveCount(0);
  });
});

/**
 * Partizan đi hết stack tới màn hình (GM-01, M78.4 + M78.7).
 *
 * `player` đi qua bốn tầng — `legalMoves` → `settle` → `playMove` → giao diện. Unit test
 * kiểm ba tầng đầu; chỉ chỗ này nói được rằng tầng thứ tư **hiện đúng tập nước của đúng
 * bên**. Và Hackenbush là họ luật duy nhất mà câu ấy có nội dung: ở ba họ impartial kia,
 * nối `player` sai vẫn cho ra một bảng nước đi trông hợp lệ.
 */
test.describe('Hackenbush: hai bên **hai tập nước** (M78.4)', () => {
  test('đổi lượt thì bảng nước đi đổi hẳn, không chỉ đổi nhãn', async ({ page }) => {
    await page.goto('/?p=hackenbush-blue-red-halves');
    await page.getByRole('button', { name: 'Chơi thử', exact: true }).click();
    await expect(page.locator('.play__canvas')).toBeVisible();

    // Người 1 gỡ cạnh xanh: hai cạnh xanh ⇒ hai nước.
    await expect(page.locator('.turn__chip--on')).toContainText('cạnh xanh');
    await expect(page.locator('.moves__item')).toHaveCount(2);
    const cua1 = await page.locator('.moves__item').allTextContents();

    await page.locator('.moves__item').first().click();

    // Tới lượt Người 2 — và tập nước là **của cam**, không phải của xanh.
    await expect(page.locator('.turn__chip--on')).toContainText('cạnh cam');
    const cua2 = await page.locator('.moves__item').allTextContents();
    expect(cua2).not.toEqual(cua1);
    // Gỡ cạnh xanh dưới cùng làm cả nhánh rụng, nên Người 2 còn hai cạnh cam.
    await expect(page.locator('.moves__item')).toHaveCount(2);
  });
});

/**
 * Geography: bàn chơi đọc được `config.token`, và **quân vẽ ra được**.
 *
 * Trạng thái vô hình là hạng lỗi mà cả M78.4 lẫn M78.7 đều vấp: luật đúng, chốt canh
 * xanh, và hình thì câm.
 */
test('Geography: quân hiện trên hình và nước đi theo cạnh', async ({ page }) => {
  await page.goto('/?p=geography-token-on-graph');
  await page.getByRole('button', { name: 'Chơi thử', exact: true }).click();
  await expect(page.locator('.play__canvas .cv-play-token')).toBeVisible();
  // Đỉnh $A$ chỉ có một cạnh ⇒ đúng một nước, và đó là cả nội dung của step đầu.
  await expect(page.locator('.moves__item')).toHaveCount(1);

  await page.locator('.moves__item').click();
  // Sau khi sang $B$: hai lối, và quân vẫn vẽ ra.
  await expect(page.locator('.moves__item')).toHaveCount(2);
  await expect(page.locator('.play__canvas .cv-play-token')).toBeVisible();
});
