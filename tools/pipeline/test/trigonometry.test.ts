import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULES } from '@combviz/engine-algebra';
import type { Problem, Scene } from '@combviz/schema';

/**
 * **Đối chiếu độc lập cho loạt bài lượng giác**, và một cái răng cho `ALGEBRA-COVERAGE.md`.
 *
 * Hai phần, và chúng canh hai thứ khác nhau:
 *
 * 1. **Đẳng thức mà narrative khẳng định** — kiểm bằng một bộ đánh giá số viết riêng ở
 *    đây, gọi thẳng `Math.sin`/`Math.cos`, trên một lưới góc cố định. Không gọi engine
 *    đại số, không dùng lại một dòng nào của `check.ts`. Lý do là bài học M78.3: luật
 *    viết lại và bộ kiểm của engine đi qua **cùng** một cây biểu thức, nên hỏi engine
 *    xem engine có đúng không là hỏi một người tự chấm bài mình. Phép tính dưới đây sai
 *    theo một cách *khác* nếu nó sai.
 *
 * 2. **Con số "chưa bài nào dùng" của `ALGEBRA-COVERAGE.md` §2/§5** — quét kho thật rồi
 *    so với chữ trong tài liệu. Mục ấy tự khai mình là *"đo bằng máy"* và tự gọi con số
 *    ấy là *"con số duy nhất trong bảng có thể xấu đi"*; một khẳng định như thế mà không
 *    có mã đỡ thì nó già đi im lặng — đúng lớp lỗi mà lượt soát tài liệu 2026-08-02 tìm
 *    thấy mười hai lần. Cùng khuôn với cái răng đã dựng cho bảng phân lớp §20.
 */

const PROBLEMS = 'packages/content/problems';
const load = async (id: string): Promise<Problem> =>
  JSON.parse(await readFile(join(PROBLEMS, `${id}.json`), 'utf8')) as Problem;

/** Lưới góc để so hai biểu thức. Tránh bội của $\pi/2$ để không chạm chỗ $\tan$ nổ. */
const GRID = Array.from({ length: 40 }, (_, i) => 0.137 + i * 0.1913);

/** Hai hàm một biến bằng nhau trên cả lưới, tới sai số máy. */
function agrees(f: (t: number) => number, g: (t: number) => number, grid = GRID): boolean {
  return grid.every((t) => {
    const [u, v] = [f(t), g(t)];
    return Number.isFinite(u) && Number.isFinite(v) && Math.abs(u - v) < 1e-9;
  });
}

describe('loạt bài lượng giác — đối chiếu độc lập', () => {
  it('`trig-square-of-sum`: $(\\sin x + \\cos x)^2 = 1 + \\sin 2x$', () => {
    expect(
      agrees(
        (x) => (Math.sin(x) + Math.cos(x)) ** 2,
        (x) => 1 + Math.sin(2 * x),
      ),
    ).toBe(true);

    // Và phép so **biết nói không**: nếu nó luôn `true` thì khẳng định trên vô nghĩa.
    expect(
      agrees(
        (x) => (Math.sin(x) + Math.cos(x)) ** 2,
        (x) => 1 + Math.cos(2 * x),
      ),
    ).toBe(false);
  });

  it('`trig-square-of-sum`: hệ quả narrative rút ra — $(\\sin x + \\cos x)^2 \\le 2$', () => {
    // Narrative nói "không bao giờ vượt $2$", và nói thêm rằng lý do là $\sin 2x \le 1$.
    // Kiểm cả hai vế của câu ấy: trần đúng bằng $2$ chứ không phải một cận lỏng nào.
    const values = GRID.map((x) => (Math.sin(x) + Math.cos(x)) ** 2);

    expect(Math.max(...values)).toBeLessThanOrEqual(2 + 1e-12);
    // Chạm được trần: $x = \pi/4$ cho đúng $2$.
    expect((Math.sin(Math.PI / 4) + Math.cos(Math.PI / 4)) ** 2).toBeCloseTo(2, 12);
  });

  it('`trig-sum-and-product`: $\\frac{\\sin a + \\sin b}{\\cos a + \\cos b} = \\tan\\frac{a+b}{2}$', () => {
    // Hai biến, nên lưới hai chiều — và bỏ những cặp làm mẫu ban đầu triệt tiêu, đúng
    // điều kiện mà engine in ra dòng đỏ.
    let compared = 0;
    for (const a of GRID.slice(0, 12)) {
      for (const b of GRID.slice(0, 12)) {
        const den = Math.cos(a) + Math.cos(b);
        if (Math.abs(den) < 1e-6) continue;
        compared += 1;
        expect((Math.sin(a) + Math.sin(b)) / den).toBeCloseTo(Math.tan((a + b) / 2), 8);
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('`trig-sum-and-product`: điều kiện $\\cos\\frac{a-b}{2} \\ne 0$ **có nội dung**', () => {
    // Engine kèm điều kiện ấy khi rút gọn. Nó không phải một lời dặn suông: chỗ
    // $\cos\frac{a-b}{2} = 0$ đúng là chỗ tử **và** mẫu cùng bằng 0, tức chỗ phân số
    // ban đầu không xác định. Lấy $a - b = \pi$.
    const b = 0.61;
    const a = b + Math.PI;

    expect(Math.cos((a - b) / 2)).toBeCloseTo(0, 12);
    expect(Math.sin(a) + Math.sin(b)).toBeCloseTo(0, 12);
    expect(Math.cos(a) + Math.cos(b)).toBeCloseTo(0, 12);
  });

  it('`trig-sum-and-product`: $\\sin 3x\\cos x = \\frac12(\\sin 4x + \\sin 2x)$', () => {
    expect(
      agrees(
        (x) => Math.sin(3 * x) * Math.cos(x),
        (x) => (Math.sin(4 * x) + Math.sin(2 * x)) / 2,
      ),
    ).toBe(true);
  });

  it('`trig-equation-double-angle`: $\\sin 2x = \\sin x \\iff \\sin x(2\\cos x - 1) = 0$', () => {
    // Không chỉ "hai vế bằng nhau" — mà **tập nghiệm trùng nhau**, vì cả bài là chuyện
    // đừng làm mất nghiệm. So bằng cách quét: chỗ nào vế này triệt tiêu thì vế kia cũng.
    expect(
      agrees(
        (x) => Math.sin(2 * x) - Math.sin(x),
        (x) => Math.sin(x) * (2 * Math.cos(x) - 1),
      ),
    ).toBe(true);

    // Và cái bẫy mà narrative chỉ ra: chia hai vế cho $\sin x$ vứt mất họ nghiệm
    // $\sin x = 0$. $x = \pi$ là nghiệm của phương trình gốc mà **không** phải nghiệm
    // của $2\cos x = 1$.
    expect(Math.sin(2 * Math.PI) - Math.sin(Math.PI)).toBeCloseTo(0, 12);
    expect(2 * Math.cos(Math.PI) - 1).toBeCloseTo(-3, 12);
  });
});

/** Mọi `rule` mà kho thật có gọi, quét qua mọi scene `algebra` của mọi bài. */
async function rulesUsedInBank(): Promise<Set<string>> {
  const used = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const scene = node as Partial<Scene> & Record<string, unknown>;
    if (scene.engine === 'algebra') {
      const steps = ((scene.config ?? {}) as { steps?: { rule?: string }[] }).steps ?? [];
      for (const step of steps) if (step.rule) used.add(step.rule);
    }
    for (const child of Object.values(scene)) walk(child);
  };

  for (const name of await readdir(PROBLEMS)) {
    if (!name.endsWith('.json')) continue;
    walk(JSON.parse(await readFile(join(PROBLEMS, name), 'utf8')));
  }
  return used;
}

describe('ALGEBRA-COVERAGE.md §2/§5 — con số duy nhất có thể xấu đi', () => {
  it('danh sách và con số "chưa bài nào dùng" khớp kho thật', async () => {
    const used = await rulesUsedInBank();
    const unused = RULES.map((r) => r.id)
      .filter((id) => !used.has(id))
      .sort();

    const doc = await readFile('docs/ALGEBRA-COVERAGE.md', 'utf8');
    const lines = doc.split('\n');

    // (a) Con số trong bảng §2.
    const row = lines.find((l) => l.includes('…chưa bài nào dùng'));
    const stated = /\*\*(\d+)\*\*/.exec(row as string);
    expect(Number((stated as RegExpExecArray)[1])).toBe(unused.length);

    // (b) Danh sách tên trong khối mã của §5 — **cùng tập**, không chỉ cùng số lượng.
    // Một tài liệu đúng số mà sai tên vẫn dạy sai người đọc nó.
    const head = lines.findIndex((l) => l.startsWith('## 5.'));
    const open = lines.findIndex((l, i) => i > head && l.trim() === '```');
    const close = lines.findIndex((l, i) => i > open && l.trim() === '```');
    const listed = lines
      .slice(open + 1, close)
      .join(' ')
      .split(/\s+/)
      .filter(Boolean)
      .sort();

    expect(listed).toEqual(unused);

    // (c) Và tiêu đề §5 đếm đúng bằng chữ.
    const WORDS: Readonly<Record<number, string>> = {
      6: 'Sáu', 7: 'Bảy', 8: 'Tám', 9: 'Chín', 10: 'Mười', 11: 'Mười một', 12: 'Mười hai',
    };
    expect(lines[head]).toContain(`## 5. ${WORDS[unused.length] ?? unused.length} luật chưa bài nào dùng`);
  });

  it('hai con số cuối bảng §2 — bài dùng engine, và bài bật hộp cát', async () => {
    // Cùng khuôn với cái răng ở trên: quét kho thật, so với đúng chữ in trong tài liệu.
    // Dòng "bật hộp cát" đo một thứ khác hẳn phần còn lại của bảng — không phải engine
    // biết làm gì mà **nội dung có đi qua đường tương tác không** — và nó là con số duy
    // nhất trong bảng đứng yên ở $0$ suốt từ M65 tới AL-23.
    let algebra = 0;
    let sandboxed = 0;
    let total = 0;

    for (const name of await readdir(PROBLEMS)) {
      if (!name.endsWith('.json')) continue;
      total += 1;
      const problem = await load(name.replace(/\.json$/, ''));
      if (!(problem.engines_used ?? []).includes('algebra')) continue;
      algebra += 1;
      if ((problem.kind ?? 'illustration') !== 'illustration') sandboxed += 1;
    }

    const doc = await readFile('docs/ALGEBRA-COVERAGE.md', 'utf8');
    const lines = doc.split('\n');
    const cell = (label: string): string[] => {
      const row = lines.find((l) => l.includes(label));
      return [...(row as string).matchAll(/\*\*([\d\s/]+)\*\*/g)].map((m) => m[1] as string);
    };

    expect(cell('| Bài dùng engine |')[0]?.replace(/\s/g, '')).toBe(`${algebra}/${total}`);
    expect(cell('…bật hộp cát')[0]).toBe(String(sandboxed));
    expect(sandboxed).toBeGreaterThan(0);
  });

  it('bốn luật lượng giác đã có bài dùng, và bài ấy tồn tại', async () => {
    const used = await rulesUsedInBank();

    for (const id of ['double_angle', 'product_to_sum', 'sum_to_product', 'pythagorean_identity']) {
      expect(used.has(id), `luật ${id} lại không có bài nào dùng`).toBe(true);
    }

    // Bảng trong §5 khai bài nào tiêu luật nào; kiểm ba bài ấy có thật và chạy engine
    // đại số. Không có phép này thì bảng kia là ba cái tên không ai đối chiếu.
    for (const id of ['trig-square-of-sum', 'trig-sum-and-product', 'trig-equation-double-angle']) {
      const problem = await load(id);
      expect(problem.engines_used).toContain('algebra');
    }
  });
});
