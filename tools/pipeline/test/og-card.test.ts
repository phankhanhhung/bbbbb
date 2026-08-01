import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runOg } from '../src/commands/og.js';

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
