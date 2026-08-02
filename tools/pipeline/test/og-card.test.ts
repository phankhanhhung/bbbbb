import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runOg } from '../src/commands/og.js';
import { uiTextWidth } from '../src/fonts.js';
import { defaultTheme } from '@combviz/theme';

/**
 * OG card — **cả hai** pane của một bài song ánh (M69, REN-02).
 *
 * `composeCard` nhận đúng một scene suốt từ M6, nên card của $19$ bài song ánh
 * chỉ có nửa trái: một bàn cờ, hoặc một xâu nhị phân, đứng một mình. Mà "cái này
 * ứng với cái kia" là **toàn bộ** nội dung của những bài ấy — card kể nửa câu
 * chuyện thì nó quảng cáo sai món hàng, ở đúng kênh mà §11 gọi là kênh growth
 * chính.
 *
 * Chạy `runOg` thật vào thư mục tạm chứ không gọi hàm dựng nội bộ: đường đi thật
 * còn có `pickOgStep` chọn step, và một card đúng ở hàm dựng mà sai ở khâu chọn
 * step thì vẫn là một card sai.
 */
const CONTENT = fileURLToPath(new URL('../../../packages/content', import.meta.url));

async function cardOf(problemId: string): Promise<string> {
  const out = await mkdtemp(join(tmpdir(), 'combviz-og-'));
  await runOg({ root: CONTENT, out, problemId });
  return readFile(join(out, `${problemId}.svg`), 'utf8');
}

/** Số scene được nhúng: mỗi pane là một `<svg>` lồng trong card. */
const panes = (svg: string): number => (svg.match(/<svg /g) ?? []).length - 1;

describe('OG card', () => {
  afterEach(() => vi.restoreAllMocks());

  it('bài song ánh lên card bằng **hai** pane', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(panes(await cardOf('rooks-permutation-bijection'))).toBe(2);
  });

  it('…và hai pane ấy dùng hai engine khác nhau, cả hai đều vẽ ra mực', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const svg = await cardOf('pascal-two-proofs');

    // Trái là chuỗi biến đổi đại số (nhãn luật), phải là bàn cờ Pascal (glyph số).
    expect(svg).toContain('công thức Pascal');
    expect(svg).toContain('>10<');
  });

  it('bài thường vẫn đúng **một** pane — không đổi bố cục của 95 bài còn lại', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(panes(await cardOf('mutilated-chessboard'))).toBe(1);
  });

  it('không card nào in dấu `**` ra ảnh', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // `pascal-two-proofs` có "**hai** con đường" trong đề bài; SVG không có thẻ
    // nào để đổi sang, nên markup phải được tước **trước** khi thành chữ.
    expect(await cardOf('pascal-two-proofs')).not.toContain('**');
  });
});

/**
 * **Tiêu đề không được tràn mép phải** — `PLAN-P1.md` §10.3b, đóng ở lượt lượng giác.
 *
 * `titleLines` ngắt dòng bằng **đếm ký tự** với hằng `FONT * 0.5` từ M6, tức giả định
 * mọi ký tự rộng nửa em, và tự bào chữa rằng *"render headless thì không đo được bề
 * rộng chữ"*. Giả định ấy sai theo cả hai chiều — ở cỡ $34$px, `iiiiiiiiii` rộng
 * $94{,}5$px chứ không $170$, `MMMMMMMMMM` rộng $293{,}3$ — nên nó vừa cắt sớm chỗ
 * này vừa để tràn chỗ kia. Đo bằng mực trên PNG: **18/144** card có nét chạm cột
 * $8$px sát mép phải. Sau lượt này: **0**.
 *
 * Chốt canh đo trên **chuỗi SVG**, không trên PNG: nhanh gấp trăm lần, chạy hết kho
 * chứ không lấy mẫu, và nó hỏi đúng cái tính chất — mọi dòng tiêu đề phải nằm trong
 * khung. Bù lại nó tin `uiTextWidth`, nên phép so ngay dưới bắt hàm ấy phải phân biệt
 * được chữ hẹp với chữ rộng: một thước sai **đều** thì cả hai phép so đều xanh, và đó
 * đúng là lỗi bản đầu của lượt này (chọn nhầm bảng con `cmap`).
 */
describe('§10.3b — tiêu đề nằm trong khung, cả 144 bài', () => {
  const FONT = 34;
  const CARD_PADDING = 48;

  it('`uiTextWidth` phân biệt chữ hẹp với chữ rộng', () => {
    const narrow = uiTextWidth('iiiiiiiiii', FONT);
    const wide = uiTextWidth('MMMMMMMMMM', FONT);

    expect(wide).toBeGreaterThan(narrow * 2);
    // Và không phải một hằng số nhân độ dài: dấu tiếng Việt rộng hơn chữ trần.
    expect(uiTextWidth('ữữữữữữữữữữ', FONT)).toBeGreaterThan(uiTextWidth('aaaaaaaaaa', FONT));
  });

  it('không dòng tiêu đề nào của kho vượt mép phải', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = await mkdtemp(join(tmpdir(), 'combviz-og-all-'));
    await runOg({ root: CONTENT, out });

    const { ogWidth } = defaultTheme.brand;
    const limit = ogWidth - CARD_PADDING;
    const over: string[] = [];
    let measured = 0;

    for (const file of await readdir(out)) {
      if (!file.endsWith('.svg')) continue;
      const svg = await readFile(join(out, file), 'utf8');
      for (const m of svg.matchAll(/<text([^>]*font-size="34"[^>]*)>([^<]*)<\/text>/g)) {
        const x = Number(/ x="([-\d.]+)"/.exec(m[1] as string)?.[1] ?? 0);
        const line = unescapeXml(m[2] as string);
        measured += 1;
        if (x + uiTextWidth(line, FONT) > limit) {
          over.push(`${file}: "${line}" → ${Math.round(x + uiTextWidth(line, FONT))} > ${limit}`);
        }
      }
    }

    // Không có dòng nào để đo thì phép so trên là một phép so rỗng — và một cổng xanh
    // vì nó chưa nhìn gì cả là đúng thứ lượt soát 2026-08-02 đi tìm.
    expect(measured).toBeGreaterThan(400);
    expect(over).toEqual([]);
  }, 120_000);
});

const unescapeXml = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
