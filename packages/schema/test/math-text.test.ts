import { describe, expect, it } from 'vitest';
import {
  stripBoldMarkup,
  toReadableMath,
  toSearchableText,
  unhandledMathCommands,
} from '../src/math-text.js';

/**
 * Hai chế độ phải **khác nhau đúng chỗ**: một cái dành cho mắt người, một cái
 * dành cho so khớp chuỗi. Trộn chúng làm một thì hoặc OG card hiện `\times`,
 * hoặc gõ "time" ra mọi bài có phép nhân — dự án này đã dính cả hai.
 */
describe('toReadableMath — chỗ có người đọc', () => {
  it('đổi ký hiệu quen thuộc sang Unicode', () => {
    expect(toReadableMath('bàn $8\\times8$')).toBe('bàn 8×8');
    expect(toReadableMath('$m \\leq 6$')).toBe('m ≤ 6');
    expect(toReadableMath('$a \\neq b$')).toBe('a ≠ b');
  });

  it('giữ nguyên phần văn xuôi ngoài `$…$`', () => {
    expect(toReadableMath('Chứng minh $n$ chia hết cho $3$.')).toBe(
      'Chứng minh n chia hết cho 3.',
    );
  });

  it('đổi chỉ số và số mũ khi có ký tự Unicode tương ứng', () => {
    expect(toReadableMath('$v_1$')).toBe('v₁');
    expect(toReadableMath('$2^n$')).toBe('2ⁿ');
    expect(toReadableMath('$x_{12}$')).toBe('x₁₂');
  });

  it('giữ dấu `_` khi không đổi trọn vẹn được, nhưng bỏ ngoặc nhóm', () => {
    // `v_{max}` mà thành "vmax" thì mất ranh giới giữa tên và chỉ số; để nguyên
    // ngoặc nhọn thì lộ cú pháp LaTeX ra mặt người đọc. `v_max` là chỗ đứng giữa.
    expect(toReadableMath('$v_{max}$')).toBe('v_max');
  });

  it('bỏ lệnh chỉ chỉnh khoảng cách', () => {
    expect(toReadableMath('$1\\!-\\!2$')).toBe('1-2');
    expect(toReadableMath('$a \\quad b$')).toBe('a  b');
  });

  it('không để sót tên lệnh lạ trong kết quả', () => {
    // Lệnh không có trong bảng thì bỏ hẳn, không in ra chữ "frac".
    expect(toReadableMath('$\\frac{1}{2}$')).not.toContain('frac');
  });

  it('văn bản không có toán thì đi qua nguyên vẹn', () => {
    const plain = 'Bàn cờ khuyết hai ô góc đối nhau.';
    expect(toReadableMath(plain)).toBe(plain);
  });
});

describe('toSearchableText — chỗ máy so khớp', () => {
  it('tước cả tên lệnh, không chỉ dấu backslash', () => {
    const out = toSearchableText('Bàn cờ $8\\times8$ và $31$ domino $1\\times2$.');

    expect(out).not.toContain('times');
    expect(out).not.toContain('\\');
    expect(out).not.toContain('$');
    expect(out).toBe('Bàn cờ 8 8 và 31 domino 1 2.');
  });

  it('giữ chữ thường để gõ tiếng Việt vẫn tìm ra', () => {
    expect(toSearchableText('Trong $6$ người bất kỳ')).toContain('người bất kỳ');
  });

  it('gộp khoảng trắng thừa do việc tước sinh ra', () => {
    expect(toSearchableText('$a$   $b$')).toBe('a b');
  });
});

/**
 * M69 — hai lỗ lộ ra ở **lượt nhìn OG card**, không ở test nào.
 *
 * Card là thứ duy nhất người ta thấy khi ai đó chia sẻ link (§11 gọi nó là kênh
 * growth chính), và nó vẽ bằng resvg — không KaTeX, không thẻ `<strong>`. Mọi
 * markup mà Player biết đổi thì ở đây phải được đổi **trước** khi thành chữ.
 */
describe('stripBoldMarkup — chữ đậm ở nơi không có chữ đậm', () => {
  it('bỏ dấu, giữ chữ', () => {
    expect(stripBoldMarkup('bằng **hai** con đường')).toBe('bằng hai con đường');
  });

  it('không đụng `**` nằm trong công thức — ở đó nó là phép nhân', () => {
    expect(stripBoldMarkup('tính $a ** b$ rồi **so** sánh')).toBe('tính $a ** b$ rồi so sánh');
  });

  it('số dấu **lẻ** thì để nguyên tất — tác giả đang viết phép nhân', () => {
    expect(stripBoldMarkup('2 ** 3 và 4')).toBe('2 ** 3 và 4');
  });

  it('không có dấu nào thì trả về đúng chuỗi cũ', () => {
    expect(stripBoldMarkup('không có gì')).toBe('không có gì');
  });
});

describe('toReadableMath — ngoặc thoát là ngoặc thật', () => {
  it('`\\{…\\}` giữ được ngoặc của tập hợp', () => {
    // Trước lượt này ra `\1,2,…,n\`: hai dấu gạch chéo lạc giữa tiêu đề, trên
    // card của đúng những bài nói về tập hợp.
    expect(toReadableMath('tập $\\{1,2,\\dots,n\\}$ có')).toBe('tập {1,2,…,n} có');
  });

  it('ngoặc **nhóm** vẫn bị bỏ như cũ', () => {
    expect(toReadableMath('$x^{12}$')).toBe('x¹²');
    expect(toReadableMath('$a_{max}$')).toBe('a_max');
  });
});

/**
 * **Chỗ mù của cái răng ở trên, và ba phép so bịt nó.**
 *
 * Chốt canh quét kho hỏi *"lệnh nào bị xoá im lặng?"*. Nó không hỏi được *"lệnh nào bị
 * **gặm**?"* — và gặm là lỗi thật: `[/\\cdot/g, '·']` đứng trước `\cdots` biến
 * `$a \cdots z$` thành `a ·s z`, mà với cái răng kia thì `\cdot` *đã* được xử nên
 * không có gì để than. Cũng thế với hai lệnh **có đối số** dưới đây: bỏ nhánh xử
 * chúng đi thì tên lệnh vẫn biến mất qua một đường khác, chỉ nội dung là mất.
 *
 * Ba phép so này là phần bù. Cả ba đều từng sống sót một lượt bẻ răng.
 */
describe('lệnh dài không bị lệnh ngắn gặm mất', () => {
  it('`\\cdots` đọc trọn, không thành `·s`', () => {
    expect(toReadableMath('$a \\cdots z$')).toBe('a … z');
    expect(toReadableMath('$a \\cdot b$')).toBe('a · b');
  });

  it('lệnh **lạ** đi nguyên vẹn, không bị ăn mất nửa đầu', () => {
    // `\subsetneq` chưa có trong bảng, mà `subset` thì có. Không có ranh giới chữ cái
    // thì nó ra `⊂neq` — một ký hiệu **sai** mà không chốt canh nào than được, vì
    // `\subset` "đã được xử". Có ranh giới thì nó đi thẳng tới chỗ báo là chưa xử.
    expect(unhandledMathCommands('a \\subsetneq b')).toEqual(['\\subsetneq']);
    expect(unhandledMathCommands('a \\subset b')).toEqual([]);
  });

  it('`\\pmod` không bị `\\pm` ăn mất', () => {
    expect(toReadableMath('$n \\equiv 0 \\pmod 4$')).toBe('n ≡ 0 (mod 4)');
    expect(toReadableMath('$s \\equiv n \\pmod{2^k}$')).toBe('s ≡ n (mod 2ᵏ)');
    expect(toReadableMath('$\\pm 1$')).toBe('± 1');
  });

  it('`\\begin{cases}` giữ được **cả hai** phương trình', () => {
    // Bỏ nhánh này thì `\begin{cases}` vẫn biến mất — nhưng hai dòng dính liền nhau
    // kèm hai dấu gạch chéo lạc giữa. Card của bài giải hệ mất đúng thứ nó đang dạy.
    expect(toReadableMath('$\\begin{cases} x + 2y = 5 \\\\ 3x - y = 1 \\end{cases}$')).toBe(
      'x + 2y = 5; 3x - y = 1',
    );
  });
});

describe('lệnh có đối số giữ được đối số', () => {
  it('`\\frac` thành phép chia, có ngoặc khi cần', () => {
    expect(toReadableMath('$\\frac{1}{2}$')).toBe('1/2');
    expect(toReadableMath('$\\frac{1}{1-x^{2}}$')).toBe('1/(1-x²)');
    expect(toReadableMath('$\\dfrac{a+b}{2}$')).toBe('(a+b)/2');
  });

  it('`\\sqrt`, `\\text`, `\\bar` — cả ba đều mang nội dung', () => {
    expect(toReadableMath('$\\sqrt{48} = 4\\sqrt3$')).toBe('√48 = 4√3');
    expect(toReadableMath('$(\\text{chẵn},\\text{lẻ})$')).toBe('(chẵn,lẻ)');
    expect(toReadableMath('$\\bar S$')).toBe('S̄');
  });

  it('tên phép toán ra chữ, không ra rỗng — kể cả khi có chỉ số', () => {
    // `\b` sau `log` **không** khớp trước `_`, vì `_` là ký tự từ trong JS regex.
    // Bản đầu của lượt này dính đúng chỗ đó và `$\log_2 x$` ra `₂ x`.
    expect(toReadableMath('Rút gọn $(\\sin x + \\cos x)^2$.')).toBe('Rút gọn (sin x + cos x)².');
    expect(toReadableMath('$\\log_2 x$')).toBe('log₂ x');
    expect(toReadableMath('$\\max(a,b) \\ge \\min(a,b)$')).toBe('max(a,b) ≥ min(a,b)');
  });
});

/**
 * **Cái chổi quét cuối, và vì sao nó phải quét vào chỗ trống.**
 *
 * `toReadableMath` kết thúc bằng `.replace(/\\[a-zA-Z]+/g, '')` — vứt mọi lệnh LaTeX
 * còn sót. Câu ấy đọc như một lưới an toàn, nhưng nó **không phân biệt** lệnh trình
 * bày với lệnh mang nội dung, nên nó xoá cả hai. Đo được: `$(\sin x + \cos x)^2$`
 * hiện lên OG card thành `( x + x)²` — không phải chữ xấu mà chữ **sai**, trên đúng
 * thứ duy nhất người ta nhìn thấy khi ai đó chia sẻ link. Cùng lớp lỗi ấy ăn vào 31
 * lệnh khác nhau: `\sqrt` (49 lần), `\frac` (49), `\ne` (13 — bảng chỉ khai `\neq`).
 *
 * Chữa từng lệnh một thì lệnh thứ 32 lại rơi vào chổi, và lại rơi **im lặng**. Nên
 * chốt canh không hỏi "đã xử `\sin` chưa" mà hỏi câu tổng: *sau khi chạy hết bảng
 * ký hiệu, bảng phép toán và các lệnh có đối số, kho thật còn sót lệnh nào không?*
 * Còn một cái là đỏ, kèm tên nó và tên bài — nên bài kế tiếp gõ một lệnh mới sẽ
 * biết ngay lúc `pnpm test`, chứ không phải lúc card đã lên mạng.
 */
describe('không lệnh nào của kho rơi xuống chổi quét cuối', () => {
  const PROBLEMS = 'packages/content/problems';

  /** Mọi đoạn `$…$` của mọi bài, kèm tên bài để lời than có địa chỉ. */
  async function mathSpans(): Promise<{ problem: string; math: string }[]> {
    const { readFile, readdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const out: { problem: string; math: string }[] = [];

    for (const file of await readdir(PROBLEMS)) {
      if (!file.endsWith('.json')) continue;
      const raw = await readFile(join(PROBLEMS, file), 'utf8');
      const walk = (node: unknown, key?: string): void => {
        if (Array.isArray(node)) {
          for (const child of node) walk(child, key);
        } else if (node !== null && typeof node === 'object') {
          for (const [k, v] of Object.entries(node)) walk(v, k);
        } else if (typeof node === 'string' && (key === 'vi' || key === 'en')) {
          for (const m of node.matchAll(/\$([^$]*)\$/g)) {
            out.push({ problem: file, math: m[1] as string });
          }
        }
      };
      walk(JSON.parse(raw));
    }
    return out;
  }

  it('quét 144 bài, không lệnh nào bị xoá im lặng', async () => {
    const spans = await mathSpans();
    expect(spans.length).toBeGreaterThan(500);

    const leftovers = new Map<string, string>();
    for (const { problem, math } of spans) {
      for (const name of unhandledMathCommands(math)) leftovers.set(name, problem);
    }

    expect(
      [...leftovers].map(([name, where]) => `${name} (${where})`).sort(),
      'lệnh bị chổi quét cuối xoá im lặng — thêm vào SYMBOLS/OPERATORS/structures',
    ).toEqual([]);
  });
});
