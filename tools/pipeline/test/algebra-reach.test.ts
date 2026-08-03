import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readAlgebra } from '@combviz/engine-algebra';
import type { Scene } from '@combviz/schema';

/**
 * **§6 bước 3 — "thử soạn", đo bằng máy** (`ALGEBRA-COVERAGE.md`).
 *
 * §6 vạch bốn bước để biến bảng ước lượng §3 thành phép đo. Bước 1–2 cần một **danh
 * sách đề thật** (IMO Shortlist mục A + đề quốc gia); kho không có corpus ấy
 * (`source.contest` đếm ra 146 folklore / 4 IMO / 1 Shortlist) và hai nguồn ngoài đều
 * bị chặn ở proxy. Bịa một bảng phân loại từ trí nhớ là đúng thứ tài liệu này cấm.
 *
 * Bước 3 thì **không** cần corpus, và §6 gọi nó là *"bước duy nhất tốn công thật, và
 * cũng là bước duy nhất không thay thế được"*: với mỗi họ bài, thử soạn thật rồi xem
 * engine kể được lập luận không. Tệp này là bước ấy, chạy lại được ở mỗi commit.
 *
 * ## Con số này là **chặn dưới**, không phải phần trăm phủ
 *
 * Hai chiều đều không suy ra được:
 *
 * - *"soạn được"* nói engine kể được **dạng này**, không nói nó kể được cả họ.
 * - *"chưa soạn được"* nói **tôi** không tìm ra đường, không nói đường ấy không có.
 *   Đúng hai lần trong lượt dựng tệp này: `sum_linear` và `rationalize` ban đầu bị ghi
 *   là chỗ hụt, hoá ra chỉ là gọi nhầm luật — engine làm được cả hai, và chính lời từ
 *   chối của nó chỉ sang luật đúng.
 *
 * Nên nó **không** thay cột "Phủ" của §3. Nó đo thứ khác, và thứ ấy đo được: *hôm nay,
 * bằng máy, những dạng nào đi qua được engine.*
 *
 * ## Vì sao danh sách phải chứa cả những lần soạn **hỏng**
 *
 * Một corpus chỉ gồm thứ chạy được thì mẫu số tự gọt và tỉ lệ luôn đẹp — đúng kiểu
 * "chốt canh luôn xanh" mà `ENGINE-BACKLOG.md` §3b đã gỡ năm lần. Nên mỗi mục khai sẵn
 * `verdict`, và **hai chiều đều đỏ**:
 *
 * - khai `'soạn được'` mà engine từ chối ⇒ đỏ (engine thụt lùi);
 * - khai `'chưa soạn được'` mà nay chạy ⇒ **cũng** đỏ (danh sách phải ngắn lại, không
 *   được chỉ dài ra — cùng khuôn `KNOWN_QUIET` của `validator-bite.test.ts`).
 */

/** Mười họ bài của `ALGEBRA-COVERAGE.md` §3, đúng tên và đúng thứ tự. */
type Family =
  | 'bất đẳng thức'
  | 'phương trình hàm'
  | 'đa thức'
  | 'dãy số và truy hồi'
  | 'hàm sinh / chuỗi'
  | 'biến đổi / căn thức'
  | 'hệ phương trình'
  | 'log / mũ / lượng giác'
  | 'bất phương trình, tập nghiệm'
  | 'số học ⟂ đại số';

interface Attempt {
  readonly family: Family;
  /** Hai miền của §1 — bảng §3 có **một** cột "Phủ" cho cả hai, và đó là chỗ nó hỏng. */
  readonly level: 'phổ thông' | 'olympiad';
  readonly what: string;
  readonly start: string;
  readonly steps: ReadonlyArray<{ rule: string; at?: string; arg?: string }>;
  readonly assume?: readonly string[];
  readonly verdict: 'soạn được' | 'chưa soạn được';
  /** Bắt buộc khi `'chưa soạn được'`: chỗ chặn, ghi bằng lời engine nói. */
  readonly because?: string;
}

const ATTEMPTS: readonly Attempt[] = [
  // ---- bất đẳng thức — 35% olympiad, ô lớn nhất của §3 ----
  {
    family: 'bất đẳng thức',
    level: 'phổ thông',
    what: '(a−b)² ≥ 0 dựng ra a²+b² ≥ 2ab',
    start: '(a + (-1)*b)^2 >= 0',
    steps: [
      { rule: 'multiply_out', at: 'L' },
      { rule: 'add_both_sides', arg: '2*a*b' },
      { rule: 'collect_like', at: 'L' },
      { rule: 'drop_unit', at: 'R' },
    ],
    verdict: 'soạn được',
  },
  {
    family: 'bất đẳng thức',
    level: 'phổ thông',
    what: 'AM–GM dùng như một nước đi có tên',
    start: '2*sqrt(a*b) >= 6',
    steps: [{ rule: 'am_gm', arg: '2*sqrt(a*b)' }],
    verdict: 'soạn được',
  },
  {
    family: 'bất đẳng thức',
    level: 'phổ thông',
    what: 'Cauchy–Schwarz dạng Engel',
    start: '(a + b)^2/(x + y) >= 1',
    steps: [{ rule: 'cauchy_schwarz', arg: 'a^2/x + b^2/y' }],
    verdict: 'soạn được',
  },
  {
    family: 'bất đẳng thức',
    level: 'olympiad',
    what: 'không mất tổng quát rồi nhân hai vế với a−b',
    start: 'a^2 + b^2 >= 2*a*b',
    steps: [{ rule: 'wlog', arg: 'a >= b' }, { rule: 'mul_both_sides', arg: 'a - b' }],
    verdict: 'soạn được',
  },
  {
    family: 'bất đẳng thức',
    level: 'olympiad',
    what: 'Schur bậc 1: bước chọn thứ tự trên biểu thức ba biến',
    start:
      'a*(a + (-1)*b)*(a + (-1)*c) + b*(b + (-1)*a)*(b + (-1)*c) + c*(c + (-1)*a)*(c + (-1)*b) >= 0',
    steps: [{ rule: 'wlog', arg: 'a >= b' }],
    verdict: 'soạn được',
  },
  {
    family: 'bất đẳng thức',
    level: 'olympiad',
    what: 'SOS ba biến, chuyển vế từ dạng đã nhân đôi',
    start: '2*a^2 + 2*b^2 + 2*c^2 >= 2*a*b + 2*b*c + 2*c*a',
    steps: [{ rule: 'add_both_sides', arg: '-2*a*b + -2*b*c + -2*c*a' }],
    verdict: 'chưa soạn được',
    because: 'hình rộng 15.30 ô, quá trần 13.6 — bất đẳng thức ba biến chạm trần bề ngang',
  },

  // ---- phương trình hàm — 20% ----
  {
    family: 'phương trình hàm',
    level: 'phổ thông',
    what: 'thế y := 0 vào phương trình Cauchy',
    start: 'f(x + y) = f(x) + f(y)',
    steps: [{ rule: 'specialize', arg: 'y := 0' }],
    verdict: 'soạn được',
  },
  {
    family: 'phương trình hàm',
    level: 'olympiad',
    what: 'dùng tính đơn ánh để bóc f khỏi hai vế',
    start: 'f(x) = f(y)',
    steps: [{ rule: 'use_injective' }],
    assume: ['f: đơn ánh'],
    verdict: 'soạn được',
  },
  {
    family: 'phương trình hàm',
    level: 'olympiad',
    what: 'dùng tính đơn điệu ngặt để bóc một bất đẳng thức',
    start: 'f(x) < f(y)',
    steps: [{ rule: 'use_monotone', arg: 'tăng' }],
    assume: ['f: tăng ngặt'],
    verdict: 'soạn được',
  },
  {
    family: 'phương trình hàm',
    level: 'olympiad',
    what: 'dùng tính toàn ánh: với mọi y có x sao cho f(x) = y',
    start: 'f(x) = y',
    steps: [{ rule: 'use_surjective' }],
    assume: ['f: toàn ánh'],
    verdict: 'chưa soạn được',
    because:
      'không có luật `use_surjective` — toàn ánh **sinh** một biến mới, không bóc f khỏi hai vế, nên nó là một hợp đồng mới chứ không phải một dòng thêm vào khuôn AL-22 (§4.2)',
  },

  // ---- đa thức — 15% ----
  {
    family: 'đa thức',
    level: 'phổ thông',
    what: 'phân tích tam thức bậc hai',
    start: 'x^2 + -3*x + 2 = 0',
    steps: [{ rule: 'factor_quadratic', at: 'L' }],
    verdict: 'soạn được',
  },
  {
    family: 'đa thức',
    level: 'olympiad',
    what: 'hằng đẳng thức đối xứng a³+b³ kiểm bằng khai triển',
    start: 'a^3 + b^3 = (a + b)*(a^2 + -1*a*b + b^2)',
    steps: [{ rule: 'multiply_out', at: 'R' }],
    verdict: 'soạn được',
  },
  {
    family: 'đa thức',
    level: 'olympiad',
    what: 'Vieta: nghiệm của x² + px + q với hệ số ký hiệu',
    start: 'x^2 + p*x + q = 0',
    steps: [{ rule: 'quadratic_formula', arg: '+' }],
    verdict: 'chưa soạn được',
    because:
      '`quadratic_formula` đòi đa thức **một biến**, mà p và q là ký hiệu — Vieta như một quan hệ có tên vẫn là nợ mở của §3',
  },

  // ---- dãy số và truy hồi — 15% ----
  {
    family: 'dãy số và truy hồi',
    level: 'phổ thông',
    what: 'tách Σ(k+1) thành hai tổng',
    start: 'sum(k, 1, n, k + 1) = 0',
    steps: [{ rule: 'sum_linear', at: 'L' }],
    verdict: 'soạn được',
  },
  {
    family: 'dãy số và truy hồi',
    level: 'olympiad',
    what: 'tổng telescope Σ(a_{k+1} − a_k)',
    start: 'sum(k, 1, n, a_{k+1} + -1*a_{k}) = 0',
    steps: [{ rule: 'sum_telescope', at: 'L' }],
    verdict: 'soạn được',
  },
  {
    family: 'dãy số và truy hồi',
    level: 'olympiad',
    what: 'thế một chỉ số cụ thể vào quan hệ truy hồi',
    start: 'a_{n} = a_{n+-1} + a_{n+-2}',
    steps: [{ rule: 'specialize', arg: 'n := 3' }],
    verdict: 'soạn được',
  },

  // ---- hàm sinh / chuỗi — 5% ----
  {
    family: 'hàm sinh / chuỗi',
    level: 'phổ thông',
    what: 'chuỗi hình học Σx^k',
    start: 'sum(k, 0, inf, x^k) = 0',
    steps: [{ rule: 'geometric_series', at: 'L' }],
    verdict: 'soạn được',
  },
  {
    family: 'hàm sinh / chuỗi',
    level: 'olympiad',
    what: 'phân thức riêng phần, nghiệm hữu tỉ phân biệt',
    start: '1/((1 + -1*x)*(1 + -2*x)) = 0',
    steps: [{ rule: 'partial_fractions', at: 'L' }],
    verdict: 'soạn được',
  },
  {
    family: 'hàm sinh / chuỗi',
    level: 'olympiad',
    what: 'Binet: 1/(1−x−x²) tách trên Q(√5)',
    start: '1/(1 + -1*x + -1*x^2) = 0',
    steps: [{ rule: 'partial_fractions', at: 'L' }],
    verdict: 'chưa soạn được',
    because:
      'mẫu phải là **tích** các thừa số 1 − a·x với a hữu tỉ — ranh giới vô tỉ mà `series.ts` tự vạch (§5.1), cố ý không mở',
  },

  // ---- biến đổi / căn thức — 4% olympiad nhưng 25% phổ thông ----
  {
    family: 'biến đổi / căn thức',
    level: 'phổ thông',
    what: 'trục căn thức ở mẫu là một căn đơn',
    start: '1/sqrt(2) = 0',
    steps: [{ rule: 'rationalize', at: 'L' }],
    verdict: 'soạn được',
  },
  {
    family: 'biến đổi / căn thức',
    level: 'phổ thông',
    what: 'mẫu là tổng chứa căn: nhân liên hợp',
    start: '1/(1 + sqrt(2)) = 0',
    steps: [{ rule: 'multiply_by_conjugate', at: 'L' }],
    verdict: 'soạn được',
  },
  {
    family: 'biến đổi / căn thức',
    level: 'olympiad',
    what: 'căn lồng √(3+2√2)',
    start: 'sqrt(3 + 2*sqrt(2)) = 0',
    steps: [{ rule: 'denest_radical', at: 'L' }],
    verdict: 'soạn được',
  },

  // ---- hệ phương trình — 3% ----
  {
    family: 'hệ phương trình',
    level: 'phổ thông',
    what: 'cộng hai phương trình để khử một ẩn',
    start: 'x + y = 3; x + -1*y = 1',
    steps: [{ rule: 'add_equations', arg: '0,1,1' }],
    verdict: 'soạn được',
  },
  {
    family: 'hệ phương trình',
    level: 'olympiad',
    what: 'hệ đối xứng ba ẩn: nhân một hàng với hằng',
    start: 'x + y + z = 6; x*y*z = 6; x*y + y*z + z*x = 11',
    steps: [{ rule: 'scale_equation', arg: '0,2' }],
    verdict: 'soạn được',
  },

  // ---- log / mũ / lượng giác — 2% olympiad, 15% phổ thông ----
  {
    family: 'log / mũ / lượng giác',
    level: 'phổ thông',
    what: 'log của một tích',
    start: 'log(2, x*y) = 5',
    steps: [{ rule: 'log_product', at: 'L' }],
    verdict: 'soạn được',
  },
  {
    family: 'log / mũ / lượng giác',
    level: 'olympiad',
    what: 'bung sin 2x',
    start: 'sin(2*x) = 0',
    steps: [{ rule: 'double_angle', at: 'L' }],
    verdict: 'soạn được',
  },

  // ---- bất phương trình, tập nghiệm — 1% ----
  {
    family: 'bất phương trình, tập nghiệm',
    level: 'phổ thông',
    what: '|x| > 2 thành một tuyển',
    start: 'abs(x) > 2',
    steps: [{ rule: 'abs_to_interval' }],
    verdict: 'soạn được',
  },
  {
    family: 'bất phương trình, tập nghiệm',
    level: 'olympiad',
    what: 'dấu của một tích hai nhân tử',
    start: '(x + -1)*(x + -3) > 0',
    steps: [{ rule: 'interval_from_factors' }],
    verdict: 'soạn được',
  },

  // ---- số học ⟂ đại số — 0% olympiad theo §3, ghi ra vì chỗ chặn nằm ở **ngữ pháp** ----
  {
    family: 'số học ⟂ đại số',
    level: 'olympiad',
    what: 'đồng dư như một quan hệ nội dung: x ≡ 3 (mod 5)',
    start: 'x = 3 mod 5',
    steps: [],
    verdict: 'chưa soạn được',
    because: 'parser không có quan hệ đồng dư — chặn ở **ngữ pháp**, không ở tập luật',
  },
  {
    family: 'số học ⟂ đại số',
    level: 'olympiad',
    what: 'chia hết như một quan hệ: 5 | x',
    start: '5 | x',
    steps: [],
    verdict: 'chưa soạn được',
    because: 'parser không có quan hệ chia hết — cùng chỗ chặn',
  },
];

/** Chạy một lần thử, trả về `null` khi soạn được, hoặc lời từ chối. */
function attempt(one: Attempt): string | null {
  const config: Record<string, unknown> = {
    start: one.start,
    steps: one.steps.map((s) => ({ at: '', ...s })),
  };
  if (one.assume) config['assume'] = [...one.assume];
  const model = readAlgebra({ engine: 'algebra', config } as unknown as Scene);
  if (model.refusal !== null) return model.refusal;
  if (model.unsound.length > 0) return `unsound: ${model.unsound.join('; ')}`;
  if (model.unchecked.length > 0) return `unchecked: ${model.unchecked.join('; ')}`;
  return null;
}

describe('§6 bước 3 — thử soạn theo họ bài', () => {
  it('mỗi mục khai `chưa soạn được` phải khai kèm chỗ chặn', () => {
    // Không có phép này thì danh sách thành chỗ trốn: khai một chữ rồi thôi.
    const mute = ATTEMPTS.filter((a) => a.verdict === 'chưa soạn được' && !a.because?.trim());
    expect(mute.map((a) => a.what)).toEqual([]);
  });

  it('khai `soạn được` thì phải soạn được thật', async () => {
    const broken = ATTEMPTS.filter((a) => a.verdict === 'soạn được')
      .map((a) => ({ a, why: attempt(a) }))
      .filter((r) => r.why !== null)
      .map((r) => `${r.a.family} · ${r.a.what}\n      ${r.why}`);
    expect(broken, `engine thụt lùi ở:\n    ${broken.join('\n    ')}`).toEqual([]);
    await Promise.resolve();
  });

  it('khai `chưa soạn được` mà **nay chạy được** thì cũng đỏ', () => {
    // Vế này là vế giữ cho danh sách ngắn lại được. Thiếu nó thì mỗi lượt engine mạnh
    // lên, con số vẫn đứng yên và không ai biết — cùng khuôn `KNOWN_QUIET`.
    const stale = ATTEMPTS.filter((a) => a.verdict === 'chưa soạn được')
      .filter((a) => attempt(a) === null)
      .map((a) => `${a.family} · ${a.what}`);
    expect(stale, `nay soạn được rồi, sửa \`verdict\`:\n    ${stale.join('\n    ')}`).toEqual([]);
  });

  it('bảng §3b của ALGEBRA-COVERAGE.md khớp phép đo này', async () => {
    const doc = await readFile('docs/ALGEBRA-COVERAGE.md', 'utf8');
    const rows = doc
      .split('\n')
      .filter((l) => /^\| \*\*/.test(l) && l.includes('|') && /\d+ \/ \d+/.test(l));

    const counted = new Map<string, string>();
    for (const one of ATTEMPTS) {
      for (const level of ['phổ thông', 'olympiad'] as const) {
        const set = ATTEMPTS.filter((a) => a.family === one.family && a.level === level);
        const ok = set.filter((a) => a.verdict === 'soạn được').length;
        counted.set(`${one.family}|${level}`, set.length === 0 ? '—' : `${ok} / ${set.length}`);
      }
    }

    const missing: string[] = [];
    for (const [key, want] of counted) {
      const [family, level] = key.split('|') as [string, string];
      const row = rows.find((l) => l.includes(`**${family}**`));
      if (row === undefined) {
        missing.push(`thiếu dòng "${family}" trong §3b`);
        continue;
      }
      const cells = row.split('|').map((c) => c.trim());
      const at = level === 'phổ thông' ? 1 : 2;
      const got = cells[at + 1];
      if (want !== '—' && got !== want) {
        missing.push(`${family} (${level}): tài liệu khai "${got}", đo được "${want}"`);
      }
    }
    expect(missing, missing.join('\n    ')).toEqual([]);
  });
});
