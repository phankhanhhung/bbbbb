import { describe, expect, it } from 'vitest';
import { applyChoreography, createContext, createRenderer, CELL_PX } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import type { SceneBox, SvgNode } from '@combviz/render';
import {
  Minter,
  algebraHitTest,
  algebraRenderer,
  algebraSchemaFragment,
  algebraChoreography,
  allPaths,
  drawnIds,
  elementId,
  explainIds,
  impliesSolutionSet,
  layout,
  measure,
  nodeAt,
  parse,
  place,
  readAlgebra,
  resolveAlgebraValidator,
  ROW,
  RULES,
  sameSolutionSet,
  sameValue,
  sameValueReal,
  substituteVar,
  varsOf,
  same,
  glyphBox,
  shrink,
  textWidth,
  toBox,
  unparse,
  FONT,
  ALGEBRA_LIMITS,
  type AlgebraStep,
  type Expr,
} from '../src/index.js';
import { toPlain } from '../src/parse.js';
import { evalReal } from '../src/check.js';

const renderer = createRenderer([algebraRenderer]);
const ctx = createContext(defaultTheme);

const scene = (start: string, steps: AlgebraStep[] = [], extra: object = {}): Scene =>
  ({ engine: 'algebra', config: { start, steps, ...extra }, elements: [] }) as never;

/**
 * Tham số cho phép quét ngẫu nhiên — **một dòng cho mỗi luật nhận tham số**.
 *
 * Bảng chứ không phải chuỗi `?:` lồng nhau, vì bảng thì thiếu một dòng là nhìn ra ngay,
 * còn chuỗi ba tầng `?:` thì luật thứ tư lặng lẽ rơi vào nhánh mặc định `'y'`, luôn bị
 * từ chối, và không bao giờ được quét.
 */
type ArgMaker = (pickAtom: () => string, node: { k: string; args?: readonly unknown[] }) => string;

const ARGS: Readonly<Record<string, ArgMaker>> = {
  commute: () => '0,1',
  factor: (p) => p(),
  cancel_common: (p) => p(),
  substitute: () => 'x := (y + 1)',
  set_variable: () => 't := (x^2 + 5*x)',
  quadratic_formula: () => '+',
  pow_both_sides: () => '2',
  abs_case: () => '+',
  evaluate_at: () => 'x := 3',
  // Chia cho **chính biến** ($a = 0$): ca đơn giản nhất mà bộ sinh có sẵn, và nó áp
  // được bất cứ khi nào hạng tử tự do bằng 0. Ghi ra thay vì để rơi vào nhánh mặc
  // định — trúng tình cờ thì hôm nào đó thôi trúng mà không ai biết.
  divide_by_linear_factor: () => 'y',
  // Chỗ cắt và lượng dịch phải là **hằng**: cả hai luật từ chối khi `arg` chứa chỉ số,
  // và một `arg` luôn bị từ chối thì luật ấy không bao giờ được quét.
  sum_split: () => '2',
  sum_shift: () => '1',
  // Phân hoạch phải **vừa với nút gặp phải**: `add` làm phẳng nên số hạng tử thay đổi
  // theo từng biểu thức, và một `arg` cố định `"0,1|2,3"` chỉ áp được cho tổng đúng
  // bốn hạng tử — tức là hầu như không bao giờ.
  factor_by_grouping: (_p, node) => {
    const n = node.args?.length ?? 0;
    if (n < 2) return '0|1';
    const half = Math.max(1, Math.floor(n / 2));
    const idx = Array.from({ length: n }, (_, i) => i);
    return `${idx.slice(0, half).join(',')}|${idx.slice(half).join(',')}`;
  },
};

/** Chuỗi biến đổi dùng đi dùng lại: khai triển rồi gộp. */
const EXPAND = scene('(x + 1)^2 + 3*x', [
  { rule: 'expand_square', at: '0' },
  { rule: 'drop_unit', at: '1' },
  { rule: 'eval_int', at: '2' },
  { rule: 'collect_like', at: '' },
]);

describe('tầng 0 — parser và printer', () => {
  it('khứ hồi giữ **đúng cấu trúc** trên biểu thức sinh ngẫu nhiên', () => {
    // Chốt canh của tầng rủi ro nhất. Không kiểm chuỗi in ra giống nhau — kiểm cây
    // giống nhau, vì `unparse` cố ý in dư ngoặc.
    const ATOMS = [
      'x', 'y', '2', '3', '-1', 'x^2', 'a_1', 'sqrt(x)', 'sqrt(2)', 'root(3, y)',
      // Mỗi kiểu nút mới phải có mặt ở đây, nếu không chốt canh tầng 0 — chốt canh của
      // tầng rủi ro nhất — im lặng bỏ qua đúng thứ vừa thêm.
      'n!', 'C(n, k)', 'A(n, 2)', '(x + 1)!',
      'sum(k, 1, n, k)', 'prod(k, 1, 3, k + 1)',
    ];
    let s = 987654321;
    const rand = (): number => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
    const gen = (d: number): string =>
      d === 0 || rand() < 0.3
        ? pick(ATOMS)
        : `(${gen(d - 1)} ${pick(['+', '-', '*', '/'])} ${gen(d - 1)})`;

    const broken: string[] = [];
    for (let i = 0; i < 300; i += 1) {
      const src = gen(3);
      const tree = parse(src, new Minter());
      if (!same(tree, parse(unparse(tree), new Minter()))) broken.push(src);
    }

    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('cấm nhân ngầm — `2x` là lỗi cú pháp, không phải $2\\cdot x$', () => {
    expect(() => parse('2x')).toThrow();
    expect(() => parse('2*x')).not.toThrow();
  });

  it('dấu âm ở **giữa** một tích vẫn in thành dấu trừ của cả hạng tử', () => {
    // `distribute` trên $a(a-b)$ cho ra `mul[a, −1, b]` vì phép làm phẳng gộp `a`
    // với `(−1)·b`. Bản đầu chỉ nhìn `args[0]` và in ra `a·−1b`.
    const svg = renderer.toSvg(scene('a*(a - b)', [{ rule: 'distribute', at: '' }]), ctx);

    expect(svg).not.toContain('−1');
    expect(svg).toContain('−');
  });
});

describe('tầng 1 — máy luật và phép kiểm đúng', () => {
  it('mọi luật áp được đều **bảo toàn giá trị** trên quét ngẫu nhiên', () => {
    // Bản đại số của phép quét $A = BQ + R$ ở `longdiv`. Chốt canh này canh **engine**,
    // không canh tác giả: tác giả không gõ vế sau nên không sai kiểu đó được.
    //
    // Bộ sinh phải **với tới được mọi luật**, và bản đầu thì không: nó không bao giờ
    // sinh một quan hệ, nên cả nhóm ★ chưa từng bị quét lần nào; không có số mũ hữu tỉ
    // nên `power_to_root` cũng thế. Chốt canh độ phủ ở cuối test này là thứ phát hiện
    // ra chuyện đó — 13 luật, trong đó 6 luật có từ trước M50.
    const ATOMS = [
      'x', 'y', '2', '3', '-1', 'x^2', 'y^2', 'x^3', 'y^3',
      'sqrt(x)', 'sqrt(6)', 'abs(x)', 'x^(1/2)', '1/x', '2/y',
      'n!', 'C(n, k)', 'A(n, 3)', 'sum(k, 1, n, k)',
    ];
    let s = 4242;
    const rand = (): number => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
    const gen = (d: number): string =>
      d === 0 || rand() < 0.3
        ? pick(ATOMS)
        : `(${gen(d - 1)} ${pick(['+', '-', '*', '/'])} ${gen(d - 1)})`;
    // Một phần tư số lượt là **quan hệ** — không có nhánh này thì nhóm ★ vô hình.
    const genTop = (): string =>
      rand() < 0.25 ? `${gen(2)} ${pick(['=', '<', '>', '<=', '>='])} ${gen(2)}` : gen(3);

    // Hình dạng mà bộ sinh ngẫu nhiên **không với tới được**: nó không có toán tử `^`
    // nên không bao giờ dựng $(A+B)^2$, và xác suất bốc trúng $\sqrt{48}$ hay một căn
    // lồng đúng dạng là số không. Gieo thẳng, và ghi rõ đây là gieo — chốt canh độ phủ
    // ở cuối nói cho biết còn thiếu gì, chứ không im lặng nhận là đã quét hết.
    const SEEDS = [
      '(x + 1)^2', '(x + y)^3', '(x + 1)^2 - (y + 2)^2', 'x^2 - y^2', 'x^2 - 4',
      '(x - y)*(x + y)', 'sqrt(48)', 'sqrt(4)', '(sqrt(x))^2', '(x^2)^3',
      'sqrt(3 + 2*sqrt(2))', 'sqrt(x)*sqrt(y)', 'x^2 + 5*x + 4 = 0',
      'x^2 + 5*x + 4', '(x^2 + 5*x) + 4 = 0', '1/x + 1/y', 'x/6 + y/6',
      'a*b + a*c + b*d + c*d', '2*x^2 + 2*x + 3*x + 3', 'a^4 - b^4', 'a^3 + b^3',
      'sqrt(x + 5) = x - 1', 'abs(x - 2) = 3*x', 'x^2 + 6*x + 5',
      // M56: `binom_absorb` cần đúng hình dạng $k\,C_n^k$, một thứ bộ sinh ngẫu nhiên
      // gần như không bao giờ dựng trúng — cùng lý do đã phải gieo $\sqrt{48}$.
      'k*C(n, k)', 'C(n, k)', 'n!', '3*k*C(n, k)', 'C(n, k) + C(n, k + 1)',
      // M57: mỗi luật $\Sigma$ đòi một hình dạng thân riêng — hằng, tích, tổng, phân
      // số triệt tiêu — mà bộ sinh ngẫu nhiên chỉ dựng được cái đầu.
      'sum(k, 1, n, 5)', 'sum(k, 1, n, 3*k)', 'sum(k, 1, n, k + k^2)',
      'sum(k, 1, 4, k^2)', 'prod(k, 1, 3, k)', 'prod(k, 1, n, (k + 1)/k)',
      'sum(k, 1, n, k) + x', 'prod(k, 1, n, x)',
      // M58: số mũ **ký hiệu** — bộ sinh không có toán tử `^` nên nó không bao giờ
      // dựng $x^{m+n}$ hay $a^n - b^n$, đúng lý do đã phải gieo $\sqrt{48}$.
      'x^(m + n)', 'a^n - b^n', 'x^n - 1', 'a^n + b^n', 'x^m * x^n', '(x^m)^n',
    ];

    const bad: string[] = [];
    const seen = new Set<string>();
    let applied = 0;

    // **Mọi luật tại mọi nút**, không phải một luật ngẫu nhiên mỗi vòng. Bản cũ bốc
    // một cặp (nút, luật) mỗi vòng, và đo ra thì $40\,000$ vòng chỉ áp được $175$ lần
    // và chạm tới $4$ luật: xác suất trúng cả *hình dạng nút đúng* lẫn *luật đúng* cùng
    // lúc là tích của hai số nhỏ. Quét đủ thì cùng ngần ấy công cho độ phủ toàn phần.
    const sources = [...SEEDS, ...Array.from({ length: 900 }, () => genTop())];
    for (const [i, src] of sources.entries()) {
      const root = parse(src, new Minter());

      for (const [at, node] of allPaths(root)) {
        for (const rule of RULES) {
          // Mỗi luật nhận tham số phải có dòng riêng trong `ARGS`. Thiếu dòng thì luật
          // ấy **luôn từ chối** và trôi qua phép quét mà không ai biết — lỗ im lặng
          // đúng kiểu ba test rỗng đã bị bắt ở M48. Chốt canh độ phủ ở cuối bắt nó.
          const arg =
            ARGS[rule.id] !== undefined
              ? (ARGS[rule.id] as ArgMaker)(() => pick(ATOMS), node)
              : rule.needsArg
                ? 'y'
                : undefined;

          const out = rule.run(new Minter(), node, arg);
          if ('refusal' in out) continue;
          applied += 1;
          seen.add(rule.id);
          // Nhóm ★, `substitute`, `evaluate_at` đổi *nghĩa* chứ không đổi giá trị; luật
          // có `guard` thì chỉ hứa đúng **trong** điều kiện của nó. Kiểm chúng bằng
          // điểm ngẫu nhiên không điều kiện là hỏi sai câu hỏi.
          if (rule.onRelation || rule.id === 'substitute' || rule.id === 'evaluate_at') continue;
          // `binding` nghĩa là "viết bằng biến mới, phải thế ngược lại rồi mới so" —
          // hỏi thẳng bằng điểm ngẫu nhiên là hỏi sai câu hỏi. Bỏ theo **cấu trúc kết
          // quả**, không theo danh sách tên: danh sách tên thì luật thứ mười lại lọt.
          if (out.binding !== undefined) continue;
          if (node.k === 'rel' || out.after.k === 'rel') continue;

          // `guard` thì **không** bỏ qua nữa: bộ kiểm nhận được nó và tự bỏ những điểm
          // vi phạm. Bản cũ bỏ nguyên bước, và đó là một lỗ im lặng — bốn trong năm
          // luật tổ hợp của M56 đều có `guard`, nên chúng sẽ được đếm là "đã quét" mà
          // giá trị thì chưa ai kiểm. Chỗ bỏ qua là chỗ lỗ hổng nằm (M47c).
          const verdict = sameValue(node, out.after, 777 + i, 8, out.guard ?? null);
          if (!verdict.ok) bad.push(`${rule.id} tại "${at}" của ${src}: ${verdict.message}`);
        }
      }
    }

    // Ngưỡng canh **phép quét có chạy thật**, không canh tỉ lệ trúng. Thêm luật thì
    // tỉ lệ trúng giảm (mỗi vòng bốc 1 trong N luật), nên số vòng phải tăng theo —
    // hạ ngưỡng thay vì tăng vòng là làm chốt canh yếu đi mà vẫn xanh.
    expect(applied).toBeGreaterThan(300);
    expect(bad.slice(0, 5), bad.slice(0, 5).join('\n')).toEqual([]);

    // Và canh **độ phủ**, không chỉ số lượt: 300 lượt dồn hết vào ba luật dễ áp thì
    // vẫn qua ngưỡng trên trong khi cả tầng A không được sờ tới lần nào.
    const untouched = RULES.map((r) => r.id).filter((id) => !seen.has(id));
    expect(untouched, `luật chưa từng áp được lần nào: ${untouched.join(', ')}`).toEqual([]);
  });

  it('bắt được luật hỏng — chốt canh trên có răng', () => {
    // Nếu `sameValue` luôn trả `ok` thì khẳng định trên vô nghĩa. Đây là phép thử
    // ngược: hai biểu thức khác nhau **phải** bị bắt.
    const a = parse('(x + 1)^2', new Minter());
    const b = parse('x^2 + 1', new Minter());

    expect(sameValue(a, b).ok).toBe(false);
    expect(sameValue(a, parse('x^2 + 2*x + 1', new Minter())).ok).toBe(true);
  });

  it('chạy hết chuỗi và ra đúng kết quả', () => {
    const m = readAlgebra(EXPAND);

    expect(m.refusal).toBeNull();
    expect(m.unsound).toEqual([]);
    expect(m.rows).toHaveLength(5);
    expect(unparse(m.rows.at(-1)!.expr)).toBe(unparse(parse('x^2 + 5*x + 1', new Minter())));
  });

  it('luật không áp được thì **từ chối**, không vẽ nửa vời', () => {
    const m = readAlgebra(scene('x + 1', [{ rule: 'expand_square', at: '' }]));

    expect(m.refusal).toContain('luỹ thừa bậc 2');
    expect(algebraRenderer.elementBoxes!(scene('x + 1', [{ rule: 'expand_square', at: '' }]), 'row0')).toEqual([]);
  });

  it('ghép cây con xong phải **chuẩn hoá lại**, nếu không đường dẫn trỏ lệch', () => {
    // `replaceAt` chỉ thay chỗ, nên một luật trả về `add` thay vào trong `add` sinh
    // ra `add` lồng `add`. Triệu chứng: bước sau nhắm `"1"` lại trúng nút khác hẳn.
    const m = readAlgebra(EXPAND);
    const afterExpand = m.rows[1]!.expr;

    expect(afterExpand.k).toBe('add');
    expect((afterExpand as { args: readonly { k: string }[] }).args.map((a) => a.k)).toEqual([
      'pow',
      'mul',
      'pow',
      'mul',
    ]);
  });
});

describe('căn thức', () => {
  it('bộ kiểm **đổi sân** khi có căn, và bắt được $\\sqrt{x^2} \\ne x$', () => {
    // Đây là lỗ hổng nguy hiểm nhất của căn thức, và nó **lọt** ở bản đầu vì bộ lấy
    // mẫu chỉ bốc số dương. $\sqrt{x^2} = |x|$, không phải $x$.
    const verdict = sameValue(parse('sqrt(x^2)', new Minter()), parse('x', new Minter()));

    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('x=-');
  });

  it('nhận ra đẳng thức căn **đúng**, không chỉ biết nói không', () => {
    expect(sameValue(parse('sqrt(2)*sqrt(3)', new Minter()), parse('sqrt(6)', new Minter())).ok).toBe(true);
    expect(sameValue(parse('sqrt(2)*sqrt(3)', new Minter()), parse('sqrt(5)', new Minter())).ok).toBe(false);
  });

  it('rút thừa số chính phương: $\\sqrt{48} = 4\\sqrt3$', () => {
    const m = readAlgebra(scene('sqrt(48)', [{ rule: 'pull_square_out', at: '' }]));

    expect(m.refusal).toBeNull();
    expect(m.unsound).toEqual([]);
    expect(unparse(m.rows[1]!.expr)).toBe(unparse(parse('4*sqrt(3)', new Minter())));
  });

  it('trục căn thức ở mẫu, và hệ số $1$ không hiện ra', () => {
    const one = scene('1/sqrt(2)', [{ rule: 'rationalize', at: '' }]);
    const m = readAlgebra(one);

    expect(m.unsound).toEqual([]);
    // Dòng đầu **có** số $1$ (tử của $1/\sqrt2$); dòng sau thì không, dù nút $1$ vẫn
    // còn trong cây — bỏ nó đi là việc của luật `drop_unit`, có tên và có dòng riêng.
    expect(unparse(m.rows[1]!.expr)).toContain('1');
    expect(renderer.toSvg(one, ctx).match(/>1</g) ?? []).toHaveLength(1);
  });

  it('dấu căn vẽ bằng path, và vạch trùm dài đúng bằng ruột', () => {
    // Vạch trùm nói cho người đọc biết căn ăn tới đâu; ăn sai một hạng tử là đọc ra
    // một biểu thức khác hẳn.
    // Đo từ `layout`, không bới chuỗi SVG: bới chuỗi thì test đỏ vì đổi thứ tự thuộc
    // tính, và xanh nhầm vì một regex không khớp lại trả về 0 ở cả hai vế.
    const bar = (start: string): number => {
      const line = layout(readAlgebra(scene(start))).lines[0]!;
      const rule = line.rules[0];
      expect(rule, `${start}: không có vạch trùm nào`).toBeDefined();
      return (rule as { x1: number; x2: number }).x2 - (rule as { x1: number; x2: number }).x1;
    };

    expect(renderer.toSvg(scene('sqrt(x + 1)'), ctx)).toContain('<path');
    expect(bar('sqrt(x + 1)')).toBeGreaterThan(bar('sqrt(x)'));
  });
});

describe('bất đẳng thức', () => {
  it('nhân số âm thì **đổi chiều** — và bộ kiểm quan hệ bắt được nếu quên', () => {
    // Lỗi thật, đã có trong kho một lượt: engine cho ra $x<3 \Rightarrow -x<-3$ và
    // không gì kêu, vì `model` bỏ qua hẳn nút `rel`. Đặc tả §6 khai nhóm ★ đúng "do
    // cấu trúc" nên miễn kiểm — câu ấy sai, và nó che đúng lỗi này.
    const m = readAlgebra(scene('x < 3', [{ rule: 'mul_both_sides', at: '', arg: '-1' }]));

    expect(m.unsound).toEqual([]);
    expect((m.rows[1]!.expr as { op: string }).op).toBe('>');

    const right = parse('x < 3', new Minter());
    expect(sameSolutionSet(right, parse('-x < -3', new Minter()), null, 1).ok).toBe(false);
    expect(sameSolutionSet(right, parse('-x > -3', new Minter()), null, 1).ok).toBe(true);
  });

  it('dấu chưa biết thì **từ chối**, không ghi điều kiện', () => {
    // Ở trường người ta tách trường hợp. Một điều kiện "$y > 0$" ở đây giấu mất đúng
    // cái phải tách, và người đọc tưởng chỉ cần thêm một giả thiết là xong.
    const m = readAlgebra(scene('x < 3', [{ rule: 'mul_both_sides', at: '', arg: 'y' }]));

    expect(m.refusal).toContain('tách trường hợp');
  });

  it('với đẳng thức thì vẫn là chuyện điều kiện, không phải chuyện chiều', () => {
    const m = readAlgebra(scene('a = b', [{ rule: 'mul_both_sides', at: '', arg: 'a - b' }]));

    expect(m.conditions).toEqual(['a − b ≠ 0']);
    expect(m.unsound).toEqual([]);
  });
});

describe('hằng đẳng thức và phân tích nhân tử', () => {
  const cases: Array<[string, string, string]> = [
    ['(a+b)³', '(a + b)^3', 'expand_cube'],
    ['hiệu hai bình phương', 'x^2 - 9', 'factor_diff_squares'],
    ['tổng hai lập phương', 'a^3 + 8', 'factor_cubes'],
    ['hiệu hai lập phương', 'a^3 - b^3', 'factor_cubes'],
    ['tam thức', 'x^2 + 5*x + 6', 'factor_quadratic'],
    ['tam thức hệ số âm', 'x^2 - x - 6', 'factor_quadratic'],
  ];

  for (const [name, start, rule] of cases) {
    it(`${name} — áp được và **bảo toàn giá trị**`, () => {
      const m = readAlgebra(scene(start, [{ rule, at: '' }]));

      expect(m.refusal).toBeNull();
      expect(m.unsound).toEqual([]);
      expect(m.rows).toHaveLength(2);
    });
  }

  it('tam thức không phân tích được bằng số nguyên thì từ chối', () => {
    const m = readAlgebra(scene('x^2 + x + 1', [{ rule: 'factor_quadratic', at: '' }]));

    expect(m.refusal).toContain('không có cặp số nguyên');
  });

  it('$\\sqrt{x^2}$ rút thành $|x|$, không phải $x$', () => {
    // Trước khi có nút `abs`, engine phải **từ chối** chỗ này. Nay nó viết ra đúng
    // ký hiệu — và bộ kiểm (bốc cả số âm) xác nhận.
    const m = readAlgebra(scene('sqrt(x^2)', [{ rule: 'pull_square_out', at: '' }]));

    expect(m.unsound).toEqual([]);
    expect(unparse(m.rows[1]!.expr)).toBe('abs(x)');
    expect(sameValue(parse('abs(x)', new Minter()), parse('x', new Minter())).ok).toBe(false);
  });
});

describe('đặt ẩn phụ và công thức nghiệm', () => {
  it('nhân hai đa thức là **một** bước, không phải sáu', () => {
    // Không có `multiply_out` thì $(x+1)(x+4)$ tốn `distribute` ba lần, `drop_unit`,
    // `pow_add`, rồi `collect_like`. Học sinh viết một dòng, và sáu dòng cho một phép
    // nhân làm chìm mất bước thật sự đáng nhìn của bài.
    const m = readAlgebra(scene('(x + 1)*(x + 4)', [{ rule: 'multiply_out', at: '' }]));

    expect(m.unsound).toEqual([]);
    expect(unparse(m.rows[1]!.expr)).toBe(unparse(parse('x^2 + 5*x + 4', new Minter())));
  });

  it('chọn được **cặp** thừa số để nhân — `mul` làm phẳng nên không nhóm bằng cấu trúc', () => {
    const m = readAlgebra(
      scene('(x + 1)*(x + 4)*(x + 3)', [{ rule: 'multiply_out', at: '', arg: '0,1' }]),
    );

    expect(m.unsound).toEqual([]);
    const after = m.rows[1]!.expr as { args: readonly { k: string }[] };
    expect(after.args).toHaveLength(2);
  });

  it('ẩn phụ khớp **một phần** trong tổng, và phép kiểm biết ràng buộc', () => {
    // $x^2+5x$ nằm trong $x^2+5x+4$ mà không phải một nút, vì `add` làm phẳng. Khớp
    // cả cây thì luật này gần như vô dụng. Và phép kiểm phải thế ngược lại — không thì
    // nó thấy hai biểu thức khác biến rồi kết tội oan.
    const m = readAlgebra(
      scene('(x^2 + 5*x + 4)*(x^2 + 5*x + 6)', [
        { rule: 'set_variable', at: '', arg: 't := x^2 + 5*x' },
      ]),
    );

    expect(m.refusal).toBeNull();
    expect(m.unsound).toEqual([]);
    expect(unparse(m.rows[1]!.expr)).toBe(unparse(parse('(t + 4)*(t + 6)', new Minter())));
  });

  it('công thức nghiệm cho **một nhánh mỗi lần**, và nghiệm ấy phải thoả phương trình', () => {
    // Một nhánh nghiệm hẹp hơn tập nghiệm gốc, nên hỏi "cùng tập nghiệm" là hỏi sai.
    // Điều phải kiểm là nghiệm ấy **thoả** phương trình trước đó.
    const plus = readAlgebra(scene('x^2 + 5*x + 2 = 0', [{ rule: 'quadratic_formula', at: '', arg: '+' }]));
    const minus = readAlgebra(scene('x^2 + 5*x + 2 = 0', [{ rule: 'quadratic_formula', at: '', arg: '-' }]));

    expect(plus.unsound).toEqual([]);
    expect(minus.unsound).toEqual([]);
    expect(unparse(plus.rows[1]!.expr)).toContain('sqrt(17)');
    expect(unparse(plus.rows[1]!.expr)).not.toBe(unparse(minus.rows[1]!.expr));
  });

  it('biệt thức âm thì **từ chối**, và lời từ chối là câu trả lời', () => {
    const m = readAlgebra(scene('x^2 + 5*x + 8 = 0', [{ rule: 'quadratic_formula', at: '', arg: '+' }]));

    expect(m.refusal).toContain('vô nghiệm thực');
    expect(m.refusal).toContain('-7');
  });

  it('cả bài $(x+1)(x+2)(x+3)(x+4)-8=0$ rút về bậc hai, mọi bước đều qua kiểm', () => {
    const m = readAlgebra(
      scene('(x + 1)*(x + 2)*(x + 3)*(x + 4) - 8 = 0', [
        { rule: 'commute', at: 'L.0', arg: '1,3' },
        { rule: 'multiply_out', at: 'L.0', arg: '0,1' },
        { rule: 'multiply_out', at: 'L.0', arg: '1,2' },
        { rule: 'set_variable', at: 'L', arg: 't := x^2 + 5*x' },
        { rule: 'multiply_out', at: 'L.0' },
        { rule: 'collect_like', at: 'L' },
      ]),
    );

    expect(m.refusal).toBeNull();
    expect(m.unsound).toEqual([]);
    expect(unparse(m.rows.at(-1)!.expr)).toBe(unparse(parse('t^2 + 10*t + 16 = 0', new Minter())));
  });
});

describe('AL-08 — cái bẫy nhân hai vế', () => {
  it('nhân với thứ **có thể bằng 0** thì ghi điều kiện ra hình', () => {
    // Đường đi của mọi "chứng minh 1 = 2". Engine không chặn — nó nói ra, vì bước
    // ấy vẫn hợp lệ khi điều kiện đúng, và vì chỗ này chính là nội dung đáng dạy.
    const m = readAlgebra(scene('a = b', [{ rule: 'mul_both_sides', at: '', arg: 'a - b' }]));

    expect(m.conditions).toEqual(['a − b ≠ 0']);
    expect(renderer.toSvg(scene('a = b', [{ rule: 'mul_both_sides', at: '', arg: 'a - b' }]), ctx)).toContain(
      'a − b ≠ 0',
    );
  });

  it('nhân với hằng khác 0 thì **không** phiền ai', () => {
    const m = readAlgebra(scene('a = b', [{ rule: 'mul_both_sides', at: '', arg: '3' }]));

    expect(m.conditions).toEqual([]);
  });

  it('validator nói ra chuyện ấy', () => {
    const check = resolveAlgebraValidator('no-vanishing-divisor')!.check(
      scene('a = b', [{ rule: 'mul_both_sides', at: '', arg: 'a - b' }]),
    );

    expect(check.ok).toBe(false);
    expect(check.message).toContain('a − b ≠ 0');
  });
});

describe('danh tính', () => {
  it('hạng tử **không** bị đụng tới thì giữ nguyên id qua các dòng', () => {
    // Dựng lại một hạng tử không hề đổi là cấp cho nó id mới, và diff biến nó thành
    // một cặp xoá–thêm: nó nhấp nháy trong khi lời kể nói nó đứng yên.
    const m = readAlgebra(scene('3*x + 2 + 5*x', [{ rule: 'collect_like', at: '' }]));
    const two = m.rows[0]!.expr;
    const constId = (two as { args: readonly { k: string; id: string }[] }).args[1]!.id;

    expect(m.rows[1]!.trace.get(constId)).toBeUndefined();
    const after = m.rows[1]!.expr;
    const ids = (after as { args: readonly { id: string }[] }).args.map((a) => a.id);
    expect(ids).toContain(constId);
  });

  it('gộp hai hạng tử ⇒ hai id **nhập một**', () => {
    const m = readAlgebra(scene('3*x + 5*x', [{ rule: 'collect_like', at: '' }]));
    const before = m.rows[0]!.expr as { args: readonly { id: string }[] };
    const merged = [...m.rows[1]!.trace].filter(([, to]) => to.length === 1);

    expect(merged.map(([from]) => from).sort()).toEqual(
      before.args.map((a) => a.id).sort(),
    );
    expect(new Set(merged.map(([, to]) => to[0])).size).toBe(1);
  });

  it('nhân phân phối ⇒ một id **ra hai**', () => {
    const m = readAlgebra(scene('a*(b + c)', [{ rule: 'distribute', at: '' }]));
    const split = [...m.rows[1]!.trace].filter(([, to]) => to.length === 2);

    expect(split.length).toBeGreaterThan(0);
  });

  it('mọi id khai ra đều có mực, và mực **đổi** khi được nhấn (ANC-01)', () => {
    const ids = [...algebraSchemaFragment.implicitElementIds(EXPAND)];
    expect(ids.length).toBeGreaterThan(15);

    const plain = renderer.toSvg(EXPAND, ctx);
    const dead = ids.filter(
      (id) => renderer.toSvg(EXPAND, createContext(defaultTheme, { highlight: new Set([id]) })) === plain,
    );

    expect(dead, `id không phản ứng khi nhấn: ${dead.join(', ')}`).toEqual([]);
  });

  it('glyph mang danh tính của nút bao nó, không chỉ cái hộp vô hình', () => {
    // Lỗi đã **xuất bản** ở board (M44): pha `dim` nhắm vào một ô chỉ chạm cái ô,
    // không chạm con số trong nó, vì node chữ không mang `data-el`.
    const svg = renderer.toSvg(EXPAND, ctx);
    const owners = [...svg.matchAll(/<text[^>]*data-el="([^"]+)"/g)].length;

    expect(owners).toBeGreaterThan(10);
  });

  it('chạm vào một chỗ thì chọn trúng nút **sâu nhất**', () => {
    // Danh tính mực mang tên **theo dòng** (`r0-e1`), vì `TermId` bền qua các dòng
    // nên một tên trần chạm vào mọi dòng còn chứa nó — xem `elementId`.
    const id = elementId(0, 'e1');
    const box = algebraRenderer.elementBoxes!(EXPAND, id)[0]!;
    const hits = algebraHitTest(EXPAND, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });

    expect(hits[0]).toBe(id);
  });
});

describe('bound', () => {
  it('scene khai element là lỗi — cả chuỗi phải suy từ config', () => {
    const dirty = { ...EXPAND, elements: [{ id: 'x', type: 'row' }] } as never as Scene;
    const codes = algebraSchemaFragment.checkBounds(dirty, '').map((i) => i.code);

    expect(codes).toContain('bounds/algebra-no-elements');
  });

  it('không có bước nào thì cảnh báo, không chặn', () => {
    const issues = algebraSchemaFragment.checkBounds(scene('x + 1'), '');

    expect(issues.map((i) => i.code)).toContain('algebra/no-steps');
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('cú pháp sai là lỗi, và nói ra sai ở đâu', () => {
    const issues = algebraSchemaFragment.checkBounds(scene('2x + '), '');

    expect(issues.map((i) => i.code)).toContain('bounds/algebra-refused');
    expect(issues[0]!.message).toContain('vị trí');
  });
});

describe('lồng sâu và số mũ biểu thức', () => {
  /** Liên phân số lồng `n` tầng — mỗi tầng một nhánh, không nhân đôi. */
  const nestedFraction = (n: number): string => {
    let s = 'x';
    for (let i = 0; i < n; i += 1) s = `1 / (2 + ${s})`;
    return s;
  };
  const nestedRadical = (n: number): string => {
    let s = 'x';
    for (let i = 0; i < n; i += 1) s = `sqrt(1 + ${s})`;
    return s;
  };
  const drawn = (src: string): ReturnType<typeof place> =>
    place(toBox(parse(src, new Minter())), 0, 0);

  it('sàn cỡ chữ giữ được: lồng bao nhiêu tầng cũng không teo dưới 3 đơn vị', () => {
    // TeX có ba cỡ rồi dừng. Không dừng thì mỗi tầng nhân $0{,}82$, và tầng 5 còn
    // $1{,}85$ đơn vị $\approx 8$px — vẽ ra mà không đọc được.
    for (const n of [1, 3, 6]) {
      const sizes = drawn(nestedFraction(n)).glyphs.map((g) => g.size);
      expect(Math.min(...sizes), `lồng ${n} tầng`).toBeGreaterThanOrEqual(shrink(0, 1));
    }
    expect(shrink(FONT, 0.01)).toBe(FONT * 0.6);
  });

  it('không glyph nào chồng lên glyph nào — so **hộp với hộp**, hai chiều', () => {
    // So từng cặp, không chỉ cặp cùng đường chân: hai ca đè nguy hiểm nhất của engine
    // này (số mũ đè cơ số, tử phân số đè vạch) nằm ở **khác** đường chân, nên phép so
    // theo đường chân bỏ qua đúng chỗ cần nhìn.
    //
    // Và đo bằng bảng `EM` của engine, không bằng `estimateTextWidth` — hàm ấy ước đều
    // $0{,}55$ em và ước **dôi**, nên nó báo nhầm hai ca lúc khảo sát.
    const cases = [
      nestedFraction(5),
      nestedRadical(5),
      'x^(1/2) + x^((n + 1) / 2)',
      'x^sqrt(2) * x^(1 + sqrt(5))',
      '(x^(1/2) + 1) / (x^(1/3) - 1)',
      '2^x + x^-2',
    ];
    let compared = 0;

    for (const src of cases) {
      const boxes = drawn(src).glyphs.map((g) => ({ g, b: glyphBox(g) }));
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!;
          const z = boxes[j]!;
          compared += 1;
          const overlap =
            a.b.x1 < z.b.x2 - 1e-9 &&
            z.b.x1 < a.b.x2 - 1e-9 &&
            a.b.y1 < z.b.y2 - 1e-9 &&
            z.b.y1 < a.b.y2 - 1e-9;
          expect(overlap, `${src}: "${a.g.s}" đè "${z.g.s}"`).toBe(false);
        }
      }
    }
    // Chốt canh của chốt canh: nếu vòng lặp không so cặp nào thì nó xanh vô nghĩa.
    expect(compared).toBeGreaterThan(200);
  });

  it('nâng đúng hai bậc trở lên, và trần cắn theo **chiều cao** chứ không theo độ sâu', () => {
    // Trần cũ `maxDepth: 6` chặn ở lồng 3 tầng (depth 7). Nay:
    for (const n of [3, 4, 5, 6]) {
      expect(readAlgebra(scene(nestedFraction(n))).refusal, `lồng ${n} tầng`).toBeNull();
    }
    // Và vẫn có trần — không phải bỏ trần, mà là đo đúng vật.
    const refusal = readAlgebra(scene(nestedFraction(8))).refusal;
    expect(refusal).toContain('cao');
    expect(refusal).not.toContain('sâu');
  });

  it('căn lồng sâu gần như miễn phí, và trần mới không phạt nó', () => {
    // Số đo: căn lồng 6 tầng cao $1{,}50$ ô, chữ vẫn $5{,}00$. Trần theo độ sâu phạt
    // nó ngang với phân thức lồng 6 tầng (cao $2{,}93$) — đó là chỗ nó đo nhầm.
    const m = measure(toBox(parse(nestedRadical(6), new Minter())));
    expect((m.above + m.below) / ROW).toBeLessThan(2);
    expect(readAlgebra(scene(nestedRadical(6))).refusal).toBeNull();
  });

  it('ca trục căn thức từng bị chặn nay chạy', () => {
    // `depth` của kết quả là 9, nhưng nó **thấp hơn và chữ to hơn** phân thức lồng 3
    // tầng vốn được cho qua. Đây là bài THCS bình thường.
    const m = readAlgebra(
      scene('1 / (1 + sqrt(3 + 2*sqrt(2)))', [{ rule: 'multiply_by_conjugate', at: '' }]),
    );

    expect(m.refusal).toBeNull();
    expect(m.unsound).toEqual([]);
    expect(m.rows).toHaveLength(2);
  });

  it('số mũ là biểu thức: hữu tỉ, ký hiệu, vô tỉ — parse, khứ hồi, vẽ', () => {
    for (const src of [
      'x^(1/2)',
      'x^(2/3)',
      'x^n',
      'x^(n + 1)',
      'x^-2',
      'x^sqrt(2)',
      'x^(1 + sqrt(5))',
      '2^x',
    ]) {
      const m = new Minter();
      const e = parse(src, m);
      expect(same(parse(unparse(e), new Minter()), e), `khứ hồi ${src}`).toBe(true);
      expect(drawn(src).glyphs.length, `vẽ ${src}`).toBeGreaterThan(1);
      expect(readAlgebra(scene(src)).refusal, `dựng ${src}`).toBeNull();
    }
  });

  it('bộ kiểm đổi sân đúng lúc: $\\sqrt x = x^{1/2}$, và $x^{1/2} \\ne x^{1/3}$', () => {
    const p = (s: string): ReturnType<typeof parse> => parse(s, new Minter());

    expect(sameValue(p('sqrt(x)'), p('x^(1/2)')).ok).toBe(true);
    expect(sameValue(p('x^(1/2)'), p('x^(1/3)')).ok).toBe(false);
    expect(sameValue(p('x^sqrt(2)*x^sqrt(2)'), p('x^(2*sqrt(2))')).ok).toBe(true);
  });

  it('§2.5(a) — không kiểm được thì **nói ra**, không im lặng cho qua', () => {
    // `ok: true` một mình nhập nhằng giữa "đã thử và khớp" với "không tìm được điểm
    // nào để thử". Trước khi có số mũ hữu tỉ, nhánh sau gần như không với tới.
    const verdict = sameValue(parse('x^(1/2)', new Minter()), parse('x^(1/2)', new Minter()));
    expect(verdict.ok).toBe(true);
    expect(verdict.verified).toBe(true);

    // Cơ số âm với số mũ không nguyên là vô định ở **mọi** điểm bốc được.
    const blind = sameValue(parse('(0 - 3)^(1/2)', new Minter()), parse('1', new Minter()));
    expect(blind.verified).toBe(false);

    const m = readAlgebra(scene('sqrt(48)', [{ rule: 'pull_square_out', at: '' }]));
    expect(m.unchecked).toEqual([]);
  });

  it('§2.5(b) — bộ kiểm vẫn bốc cả số âm, nên $(x^2)^{1/2} \\ne x$ vẫn bị bắt', () => {
    // Cách "sửa" hiển nhiên cho (a) là chỉ bốc cơ số dương khi có số mũ hữu tỉ. Làm
    // thế là dựng lại lỗ M47b lùi một tầng.
    const p = (s: string): ReturnType<typeof parse> => parse(s, new Minter());

    expect(sameValue(p('(x^2)^(1/2)'), p('x')).ok).toBe(false);
    expect(sameValue(p('(x^2)^(1/2)'), p('abs(x)')).ok).toBe(true);

    // Và luật tự chặn trước cả bộ kiểm — để lời báo là "từ chối", không phải "engine sai".
    const m = readAlgebra(scene('(x^2)^(1/2)', [{ rule: 'pow_mul', at: '' }]));
    expect(m.refusal).toContain('cơ số có thể âm');
  });

  it('§2.5(c) — căn bậc lẻ không thành luỹ thừa hữu tỉ được, và bộ kiểm không bắt nổi', () => {
    // $\sqrt[3]{-8} = -2$ còn $(-8)^{1/3}$ không xác định trên $\mathbb R$. Chỗ chúng
    // khác nhau đúng là chỗ vế phải trả `null`, tức là điểm bị **bỏ qua** — nên bộ
    // kiểm im lặng, và chặn buộc phải nằm ở luật.
    expect(sameValue(parse('root(3, x)', new Minter()), parse('x^(1/3)', new Minter())).ok).toBe(true);

    expect(readAlgebra(scene('root(3, x)', [{ rule: 'root_to_power', at: '' }])).refusal).toContain(
      'căn bậc lẻ',
    );
    const ok = readAlgebra(scene('root(3, 8)', [{ rule: 'root_to_power', at: '' }]));
    expect(ok.refusal).toBeNull();
    expect(ok.unsound).toEqual([]);

    // Bậc chẵn thì hai vế xác định ở đúng cùng một miền, nên đi được cả hai chiều.
    const both = readAlgebra(
      scene('sqrt(x)', [{ rule: 'root_to_power', at: '' }, { rule: 'power_to_root', at: '' }]),
    );
    expect(both.refusal).toBeNull();
    expect(both.unsound).toEqual([]);
    expect(same(both.rows[2]!.expr, parse('sqrt(x^1)', new Minter()))).toBe(true);
  });

  it('`pow_add` và `pow_mul` chạy ký hiệu, mà số nguyên vẫn gộp thành một số', () => {
    const symbolic = readAlgebra(scene('x^a * x^b', [{ rule: 'pow_add', at: '' }]));
    expect(symbolic.refusal).toBeNull();
    expect(symbolic.unsound).toEqual([]);
    expect(symbolic.unchecked).toEqual([]);
    expect(same(symbolic.rows[1]!.expr, parse('x^(a + b)', new Minter()))).toBe(true);

    // Hành vi cũ không đổi: $x^2x^3$ vẫn ra $x^5$, không ra $x^{2+3}$.
    const numeric = readAlgebra(scene('x^2 * x^3', [{ rule: 'pow_add', at: '' }]));
    expect(same(numeric.rows[1]!.expr, parse('x^5', new Minter()))).toBe(true);
  });

  it('luật cũ giữ nguyên hành vi: số mũ không nguyên thì **từ chối**, không đoán', () => {
    for (const rule of ['expand_square', 'expand_cube', 'multiply_out']) {
      const m = readAlgebra(scene('(x + 1)^(1/2)', [{ rule, at: '' }]));
      expect(m.refusal, rule).not.toBeNull();
    }
    // Còn với số mũ nguyên thì vẫn chạy y như trước.
    expect(readAlgebra(scene('(x + 1)^2', [{ rule: 'expand_square', at: '' }])).refusal).toBeNull();
  });

  it('số mũ neo được: nó là một nút thật, có id và có đường dẫn `.1`', () => {
    // Trước đây số mũ là một `number` nên không có danh tính, không tô sáng được, và
    // không luật nào áp vào nó được.
    const e = parse('x^(n + 1)', new Minter());
    expect(nodeAt(e, '1')).not.toBeNull();
    expect(unparse(nodeAt(e, '1') as never)).toContain('n');

    const m = readAlgebra(scene('x^(2 + 3)', [{ rule: 'eval_int', at: '1' }]));
    expect(m.refusal).toBeNull();
    expect(same(m.rows[1]!.expr, parse('x^5', new Minter()))).toBe(true);
  });
});

describe('tập luật mở rộng — quy đồng, nhóm, hoàn thành bình phương', () => {
  const run = (start: string, steps: AlgebraStep[]): ReturnType<typeof readAlgebra> =>
    readAlgebra(scene(start, steps));
  const tree = (src: string): ReturnType<typeof parse> => parse(src, new Minter());

  it('quy đồng rồi gộp là một chuỗi chạy được, và cả hai đều đúng giá trị', () => {
    // Lỗ rõ nhất của tập luật cũ: `split_fraction` có mà nghịch đảo thì không, nên mọi
    // chuỗi biến đổi hữu tỉ chỉ đi được một chiều.
    const m = run('1/x + 1/y', [{ rule: 'common_denominator', at: '' }]);

    expect(m.refusal).toBeNull();
    expect(m.unsound).toEqual([]);
    expect(m.unchecked).toEqual([]);
    // Miền không đổi ⇒ **không** sinh điều kiện. Khác hẳn `cancel_common`, vốn bỏ đi
    // một mẫu và vì thế phải khai.
    expect(m.conditions).toEqual([]);
    expect(sameValue(m.rows[1]!.expr, tree('1/x + 1/y')).ok).toBe(true);
  });

  it('hai luật phân số nối vào nhau, và lời từ chối chỉ sang luật kia', () => {
    expect(run('a/c + b/d', [{ rule: 'combine_fraction', at: '' }]).refusal).toContain(
      'common_denominator',
    );
    expect(run('1/x + 2/x', [{ rule: 'common_denominator', at: '' }]).refusal).toContain(
      'combine_fraction',
    );

    const ok = run('a/c + b/c', [{ rule: 'combine_fraction', at: '' }]);
    expect(ok.unsound).toEqual([]);
    expect(same(ok.rows[1]!.expr, tree('(a + b)/c'))).toBe(true);
  });

  it('hoàn thành bình phương giữ số học **hữu tỉ chính xác**', () => {
    expect(same(run('x^2 + 6*x + 5', [{ rule: 'complete_square', at: '' }]).rows[1]!.expr,
      tree('(x + 3)^2 - 4'))).toBe(true);

    // $2x^2+3x+1 = 2(x+\frac34)^2 - \frac18$. Đi bằng `number` thì $-1/8$ ra
    // $-0.12499999999999997$ và dòng hình sai — nên `rat` là bắt buộc, không phải gu.
    const m = run('2*x^2 + 3*x + 1', [{ rule: 'complete_square', at: '' }]);
    expect(m.unsound).toEqual([]);
    expect(sameValue(m.rows[1]!.expr, tree('2*x^2 + 3*x + 1')).ok).toBe(true);
    expect(unparse(m.rows[1]!.expr)).toContain('3 / 4');

    // Bình phương đúng thì **không** còn phần dư lủng lẳng `+ 0`.
    expect(same(run('x^2 + 4*x + 4', [{ rule: 'complete_square', at: '' }]).rows[1]!.expr,
      tree('(x + 2)^2'))).toBe(true);
  });

  it('nhóm hạng tử lấy nhân tử chung **có số mũ**, không chỉ thừa số y hệt', () => {
    // $2x^2+2x$ có nhân tử chung $2x$, không phải $2$. So thừa số bằng `same` thì $x^2$
    // và $x$ là hai vật khác nhau, ra $2(x^2+x)$ — và thế là **không lộ** ra thừa số
    // $(x+1)$ chung với nhóm kia, tức hỏng đúng việc luật này sinh ra để làm.
    const m = run('2*x^2 + 2*x + 3*x + 3', [
      { rule: 'factor_by_grouping', at: '', arg: '0,1|2,3' },
    ]);
    expect(m.unsound).toEqual([]);
    expect(same(m.rows[1]!.expr, tree('2*x*(x + 1) + 3*(x + 1)'))).toBe(true);

    // Và nối tiếp được: nhóm xong thì `factor` rút $(x+1)$ ra.
    const full = run('2*x^2 + 2*x + 3*x + 3', [
      { rule: 'factor_by_grouping', at: '', arg: '0,1|2,3' },
      { rule: 'factor', at: '', arg: '(x + 1)' },
    ]);
    expect(full.unsound).toEqual([]);
    expect(sameValue(full.rows.at(-1)!.expr, tree('2*x^2 + 5*x + 3')).ok).toBe(true);
  });

  it('phân hoạch hỏng thì từ chối, và nói hỏng ở đâu', () => {
    const bad = (arg: string): string | null =>
      run('a*b + a*c + b*d + c*d', [{ rule: 'factor_by_grouping', at: '', arg }]).refusal;

    expect(bad('0,1|2')).toContain('không thuộc nhóm nào');
    expect(bad('0,1|1,2,3')).toContain('hai nhóm');
    expect(bad('0,1,2,3|4')).toContain('ngoài khoảng');
  });
});

describe('nghiệm ngoại lai và các bước có điều kiện', () => {
  const run = (start: string, steps: AlgebraStep[]): ReturnType<typeof readAlgebra> =>
    readAlgebra(scene(start, steps));

  it('bình phương bất đẳng thức khi chưa biết dấu thì **từ chối**', () => {
    // $-5<3$ mà $25>9$. Bám tiền lệ `mul_both_sides`: ở trường người ta tách trường
    // hợp, và một điều kiện lấp liếm ở đây sẽ giấu mất đúng cái phải tách.
    expect(run('x < 3', [{ rule: 'pow_both_sides', at: '', arg: '2' }]).refusal).toContain(
      'tách trường hợp',
    );
  });

  it('và nếu quên cái chặn ấy thì bộ kiểm một chiều **bắt được** — chốt canh có răng', () => {
    // Chỗ `implies` thật sự có răng là bất đẳng thức: "vế trước đúng" xảy ra ở nửa số
    // điểm, nên phản ví dụ $x=-5$ hiện ra ngay. Dựng thẳng cặp quan hệ để kiểm.
    const before = parse('x < 3', new Minter());
    const after = parse('x^2 < 9', new Minter());
    const verdict = impliesSolutionSet(before, after, null, 20260731);

    expect(verdict.ok).toBe(false);
    expect(verdict.verified).toBe(true);
    expect(verdict.message).toContain('kéo theo sai');
  });

  it('bậc **lẻ** thì bảo toàn tập nghiệm, không mắc nợ gì', () => {
    // $x \mapsto x^3$ là song ánh tăng trên $\mathbb R$ — đúng cả với bất đẳng thức.
    const eq = run('root(3, x) = 2', [{ rule: 'pow_both_sides', at: '', arg: '3' }]);
    expect(eq.unsound).toEqual([]);
    expect(eq.extraneous).toEqual([]);

    const ineq = run('x < 3', [{ rule: 'pow_both_sides', at: '', arg: '3' }]);
    expect(ineq.refusal).toBeNull();
    expect(ineq.unsound).toEqual([]);
    expect(ineq.extraneous).toEqual([]);
  });

  it('bậc chẵn trên phương trình ghi **món nợ** ra hình, không ghi cảnh báo cho tác giả', () => {
    const m = run('sqrt(x + 5) = x - 1', [{ rule: 'pow_both_sides', at: '', arg: '2' }]);

    expect(m.unsound).toEqual([]);
    expect(m.extraneous).toHaveLength(1);
    // Món nợ ghi theo **hợp đồng**, không theo kết quả bốc điểm: tập nghiệm có độ đo
    // $0$ nên bốc trúng nó là chuyện không xảy ra, và treo dòng đỏ vào `widened` là để
    // nó không bao giờ hiện ra ở đúng ca cần nó nhất.
    expect(m.unchecked).toEqual([]);

    const svg = renderer.toSvg(
      scene('sqrt(x + 5) = x - 1', [{ rule: 'pow_both_sides', at: '', arg: '2' }]),
      ctx,
    );
    expect(svg).toContain('ngoại lai');

    // Và không sinh cảnh báo thường trực cho tác giả — bài học M45.
    const codes = algebraSchemaFragment
      .checkBounds(scene('sqrt(x + 5) = x - 1', [{ rule: 'pow_both_sides', at: '', arg: '2' }]), '')
      .map((issue) => issue.code);
    expect(codes).not.toContain('algebra/unchecked');
  });

  it('`abs_case` chỉ đúng **trong** điều kiện, và `guard` là thứ làm nó kiểm được', () => {
    const plus = run('abs(x - 2) = 3*x', [{ rule: 'abs_case', at: 'L', arg: '+' }]);
    const minus = run('abs(x - 2) = 3*x', [{ rule: 'abs_case', at: 'L', arg: '-' }]);

    expect(plus.unsound).toEqual([]);
    expect(minus.unsound).toEqual([]);
    // Điều kiện in ra hình phải là **chữ trơn đọc được**, không phải `unparse` dư ngoặc.
    expect(plus.conditions).toEqual(['x − 2 ≥ 0']);
    expect(minus.conditions).toEqual(['x − 2 ≤ 0']);

    // Chốt canh của chính `guard`: bỏ nó đi thì $|x-2| = x-2$ sai ở mọi điểm $x<2$.
    expect(sameValue(parse('abs(x - 2)', new Minter()), parse('x - 2', new Minter())).ok).toBe(false);
  });

  it('`evaluate_at` kiểm bằng **cấu trúc**, nên nó không xin miễn kiểm', () => {
    const m = run('x^2 - 3*x - 4 = 0', [
      { rule: 'evaluate_at', at: '', arg: 'x := 4' },
      { rule: 'eval_int', at: 'L' },
    ]);
    expect(m.refusal).toBeNull();
    expect(m.unsound).toEqual([]);
    // $4^2-3\cdot4-4 = 0$ ⇒ nghiệm nhận.
    expect(same(m.rows.at(-1)!.expr, parse('0 = 0', new Minter()))).toBe(true);

    // Nghiệm ngoại lai bị loại: $\sqrt{-1+5} = 2$ còn $-1-1 = -2$.
    const bad = run('sqrt(x + 5) = x - 1', [
      { rule: 'evaluate_at', at: '', arg: 'x := -1' },
      { rule: 'eval_int', at: 'R' },
      { rule: 'eval_int', at: 'L.0' },
      { rule: 'eval_root', at: 'L' },
    ]);
    expect(bad.unsound).toEqual([]);
    expect(same(bad.rows.at(-1)!.expr, parse('2 = -2', new Minter()))).toBe(true);

    expect(run('y + 1', [{ rule: 'evaluate_at', at: '', arg: 'x := 3' }]).refusal).toContain(
      'không thấy biến',
    );
  });
});

describe('chia cho nhân tử tuyến tính (M54)', () => {
  const run = (start: string, steps: AlgebraStep[]): ReturnType<typeof readAlgebra> =>
    readAlgebra(scene(start, steps));

  it('chia đúng, và thương do **engine tính** nên nó không thể lệch', () => {
    const m = run('x^3 - 3*x + 2', [
      { rule: 'divide_by_linear_factor', at: '', arg: 'x - 1' },
    ]);
    expect(m.refusal).toBeNull();
    expect(m.unsound).toEqual([]);
    expect(same(m.rows[1]!.expr, parse('(x - 1)*(x^2 + x - 2)', new Minter()))).toBe(true);

    // Và nối tiếp được tới hết: nghiệm kép $x=1$ hiện ra.
    const full = run('x^3 - 3*x + 2', [
      { rule: 'divide_by_linear_factor', at: '', arg: 'x - 1' },
      { rule: 'factor_quadratic', at: '1' },
    ]);
    expect(full.unsound).toEqual([]);
    expect(sameValue(full.rows.at(-1)!.expr, parse('x^3 - 3*x + 2', new Minter())).ok).toBe(true);
  });

  it('**dư ≠ 0 thì từ chối, và nói số dư** — lời từ chối chính là câu trả lời', () => {
    // "$(x-3)$ có phải nhân tử không" là *câu hỏi của bài*, không phải lỗi kỹ thuật.
    const refusal = run('x^3 - 3*x + 2', [
      { rule: 'divide_by_linear_factor', at: '', arg: 'x - 3' },
    ]).refusal as string;

    expect(refusal).toContain('dư 20');
    expect(refusal).toContain('không phải nhân tử');
  });

  it('ước số phải bậc nhất và đơn khởi — nói rõ hỏng ở đâu', () => {
    const why = (arg: string): string =>
      run('x^3 - 3*x + 2', [{ rule: 'divide_by_linear_factor', at: '', arg }]).refusal as string;

    expect(why('x^2 - 1')).toContain('bậc nhất');
    expect(why('2*x - 2')).toContain('hệ số dẫn đầu');
    expect(why('y - 1')).toContain('cùng biến');
  });

  it('hệ số hữu tỉ bị chặn **từ trước** — và chốt canh nói đúng chỗ nó bị chặn', () => {
    // Luật có một cửa "hệ số phải nguyên", nhưng cửa ấy không với tới được: `flatten`
    // đã từ chối cả `rat` lẫn `div` từ trước. Khẳng định ở đây là **hành vi quan sát
    // được**, không phải nhánh code tao mong nó chạy — một test không với tới được
    // nhánh nó nhắm là một test xanh vô nghĩa (bài học M48).
    expect(
      run('x^2/3 + x', [{ rule: 'divide_by_linear_factor', at: '', arg: 'x - 1' }]).refusal,
    ).toContain('không phải đa thức');

    // Kể cả khi hệ số hữu tỉ do chính engine sinh ra ở bước trước.
    expect(
      run('2*x^2 + 3*x + 1', [
        { rule: 'complete_square', at: '' },
        { rule: 'divide_by_linear_factor', at: '', arg: 'x - 1' },
      ]).refusal,
    ).toContain('không phải đa thức');
  });

  it('mạch chuyên toán liền một hơi: định lý dư → tách nhân tử → bậc hai', () => {
    // Đây là mạch mà bản rà soát chỉ ra là **gãy ở giữa**, và nó gãy thật: `longdiv`
    // là một scene riêng nên không giảm bậc được *bên trong* một chuỗi đại số.
    const check = run('x^3 - 3*x + 2', [
      { rule: 'evaluate_at', at: '', arg: 'x := 1' },
      { rule: 'eval_int', at: '' },
    ]);
    expect(same(check.rows.at(-1)!.expr, parse('0', new Minter()))).toBe(true);

    const solve = run('x^3 - 3*x + 2 = 0', [
      { rule: 'divide_by_linear_factor', at: 'L', arg: 'x - 1' },
      { rule: 'factor_quadratic', at: 'L.1' },
    ]);
    expect(solve.refusal).toBeNull();
    expect(solve.unsound).toEqual([]);
    expect(sameSolutionSet(solve.rows[0]!.expr, solve.rows.at(-1)!.expr, null, 7).ok).toBe(true);
  });
});

describe('hằng đẳng thức luỹ thừa bậc n', () => {
  const run = (start: string, steps: AlgebraStep[]): ReturnType<typeof readAlgebra> =>
    readAlgebra(scene(start, steps));

  it('hiệu và tổng bậc n ra đúng nhân tử, không sót thừa số 1', () => {
    const diff = run('a^4 - b^4', [{ rule: 'factor_power_difference', at: '' }]);
    expect(diff.unsound).toEqual([]);
    expect(same(diff.rows[1]!.expr, parse('(a - b)*(a^3 + a^2*b + a*b^2 + b^3)', new Minter()))).toBe(true);

    const sum = run('a^3 + b^3', [{ rule: 'factor_power_sum_odd', at: '' }]);
    expect(sum.unsound).toEqual([]);
    expect(same(sum.rows[1]!.expr, parse('(a + b)*(a^2 - a*b + b^2)', new Minter()))).toBe(true);

    expect(run('a^5 + b^5', [{ rule: 'factor_power_sum_odd', at: '' }]).unsound).toEqual([]);
  });

  it('bậc chẵn của **tổng** thì từ chối, và lời từ chối là chữ trơn', () => {
    const refusal = run('a^4 + b^4', [{ rule: 'factor_power_sum_odd', at: '' }]).refusal as string;
    expect(refusal).toContain('không phân tích được');
    // Lời từ chối đi thẳng vào `checkBounds`, nơi nó hiện nguyên văn — nên không LaTeX.
    expect(refusal).not.toContain('$');
  });

  it('bậc quá lớn thì **trần kích thước** từ chối, và nói ra số đo', () => {
    // Không có trần $n$ riêng trong luật: nhân tử sau có $n$ hạng tử nên nó tự đụng
    // trần rộng, mà từ M49 trần ấy đo đúng thứ nó nói. Thêm một trần $n \le 5$ ở đây
    // là dựng lại đúng cái lỗi M49 vừa gỡ.
    const m = run('a^12 - b^12', [{ rule: 'factor_power_difference', at: '' }]);
    expect(m.refusal).not.toBeNull();
    expect(m.refusal).toMatch(/rộng|nút/);
  });
});

describe('AL-06 — choreography sinh từ model', () => {
  const spec = (start: string, steps: AlgebraStep[]): NonNullable<ReturnType<typeof algebraChoreography>> =>
    algebraChoreography(scene(start, steps)) as never;

  it('mọi đích của mọi pha đều là danh tính **có mực**', () => {
    // Một pha nhắm vào tên không tồn tại là một pha im lặng không làm gì: chạy đủ
    // thời lượng, màn hình đứng im. Vì choreography này sinh lúc chạy nên
    // `structure.ts` không soi nó — chốt canh phải nằm ở đây.
    let checked = 0;
    for (const [start, steps] of [
      ['(x + 1)^2 + 3*x', [{ rule: 'expand_square', at: '0' }, { rule: 'collect_like', at: '' }]],
      ['1/x + 1/y', [{ rule: 'common_denominator', at: '' }]],
      ['a*(a - b)', [{ rule: 'distribute', at: '' }]],
      ['sqrt(x + 5) = x - 1', [{ rule: 'pow_both_sides', at: '', arg: '2' }]],
      ['2*x^2 + 2*x + 3*x + 3', [{ rule: 'factor_by_grouping', at: '', arg: '0,1|2,3' }]],
    ] as Array<[string, AlgebraStep[]]>) {
      const s = scene(start, steps);
      const box = layout(readAlgebra(s));
      // Đích hợp lệ = mực thường **và** mực giải thích. Cái sau chỉ tồn tại khi
      // `ctx.explain` — tức đúng lúc Player vẽ, đúng lúc timeline chạy.
      const drawn = new Set([...drawnIds(box), ...explainIds(box)]);
      const timeline = algebraChoreography(s);
      expect(timeline, start).toBeDefined();

      for (const phase of (timeline as NonNullable<typeof timeline>).phases) {
        for (const id of phase.targets) {
          checked += 1;
          expect(drawn.has(id), `${start}: pha ${phase.id} nhắm "${id}" — không có mực`).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('`hold` đứng ở chỗ **sắp đổi**, và không bao giờ ở pha cuối', () => {
    // Luật `lint/hold-at-end` (M48) không soi được timeline sinh lúc chạy, nên bất
    // biến ấy phải tự giữ ở đây.
    const timeline = spec('(x + 1)^2 + 3*x', [
      { rule: 'expand_square', at: '0' },
      { rule: 'drop_unit', at: '1' },
      { rule: 'collect_like', at: '' },
    ]);
    const ordered = [...timeline.phases].sort((a, b) => a.at - b.at);
    const holds = ordered.filter((p) => p.hold === true);

    expect(holds.length).toBe(3);
    expect(holds.every((p) => p.kind === 'focus')).toBe(true);
    // Mỗi `hold` phải có nhãn — dừng lại mà không có gì đọc là kẹt, không phải nghỉ.
    expect(holds.every((p) => (p.label?.vi ?? '').length > 0)).toBe(true);
    expect(ordered.at(-1)?.hold).not.toBe(true);
  });

  it('nhãn pha là **chữ trơn**, không LaTeX', () => {
    // Nhãn vào giao diện nguyên văn (aria-valuetext, bộ đếm pha). `$x^2$` ở đó hiện
    // ra đúng bốn ký tự và trình đọc màn hình đọc "đô la x mũ hai đô la" — chính là
    // luật `lint/label-not-plain` của M48, nay áp cho chữ engine tự sinh.
    const timeline = spec('a*(a - b)', [{ rule: 'distribute', at: '' }]);
    for (const p of timeline.phases) {
      const text = p.label?.vi ?? '';
      expect(text).not.toMatch(/\$.+\$/);
      expect(text).not.toMatch(/\\[a-zA-Z]/);
    }
  });

  it('kể đúng chuyện: nhân bản, gộp lại, phần mới', () => {
    // Đọc từ **cấu trúc** `trace`, không từ tên luật — nên luật thứ 42 cũng có nhịp.
    const label = (start: string, steps: AlgebraStep[]): string[] =>
      spec(start, steps).phases.map((p) => p.label?.vi ?? '');

    // `distribute` nhân bản một nhánh ⇒ `trace` có mục ra hai bản.
    expect(label('a*(a - b)', [{ rule: 'distribute', at: '' }])).toContain('nhân bản');
    // `collect_like` nhập hai hạng tử ⇒ nhiều mục cùng về một.
    expect(
      label('x + 2*x', [{ rule: 'collect_like', at: '' }]),
    ).toContain('gộp lại');
    // Nhãn của pha `focus` đầu là **tên luật**, hoặc `note` khi tác giả đè.
    expect(label('sqrt(48)', [{ rule: 'pull_square_out', at: '', note: 'rút ra ngoài' }])).toContain(
      'rút ra ngoài',
    );
  });

  it('khung đầu chỉ có **dòng một** — kể cả nhãn luật', () => {
    // Chốt canh cho một lỗi mà 78 test không bắt và lượt nhìn khung 0 bắt ngay: nhãn
    // luật không mang danh tính nào, nên `show` không chạm tới nó và khung đầu bày
    // sẵn tên cả bốn phép biến đổi trong khi mới có một dòng.
    // Dùng scene **có dòng điều kiện**: nó là ca dễ lọt nhất, vì dòng đỏ không thuộc
    // dòng nào nên không pha `show` nào của một dòng chạm tới nó.
    const s = scene('(6*a)/(3*a)', [
      { rule: 'cancel_common', at: '', arg: 'a' },
      { rule: 'eval_int', at: '' },
    ]);
    const nodes = applyChoreography(
      algebraRenderer.render(s, ctx),
      algebraChoreography(s) as never,
      0,
    );

    // Soi **mọi `<text>`**, không soi theo `data-el`. Đó là cả điểm: lỗi vừa sửa là
    // nhãn **không có** `data-el`, nên một chốt canh hỏi "danh tính này thuộc dòng
    // nào" sẽ bỏ qua đúng cái nó phải bắt. Câu hỏi đúng là "chữ nào còn mực ở khung
    // 0", và mọi chữ ấy phải thuộc dòng một. (Scene này không có dòng điều kiện — mấy
    // dòng đỏ ấy là tóm tắt cả chuỗi, không thuộc dòng nào.)
    const leaked: string[] = [];
    const visit = (list: readonly SvgNode[]): void => {
      for (const n of list) {
        if (n.tag === 'text' && Number(n.attrs['opacity'] ?? 1) > 0) {
          const owner = n.attrs['data-el'];
          if (typeof owner !== 'string' || !owner.startsWith('r0-')) {
            leaked.push(`${String(n.children?.[0] ?? '?')} (${String(owner)})`);
          }
        }
        if (n.children) visit(n.children as readonly SvgNode[]);
      }
    };
    visit(nodes as readonly SvgNode[]);

    expect(leaked, `lộ trước ở khung 0: ${leaked.join(' | ')}`).toEqual([]);
  });

  it('CHO-12 — hạng tử đi tiếp **bay xuống từ chỗ cũ**, và dòng trên không thủng lỗ', () => {
    // Thứ M51 phải bỏ vì `move` khi ấy chỉ biết "bay tới". `from` lật đúng chiều.
    const s = scene('(a + b)^2 + 3*a', [{ rule: 'expand_square', at: '0' }]);
    const spec = algebraChoreography(s) as NonNullable<ReturnType<typeof algebraChoreography>>;
    const fly = spec.phases.filter((p) => p.kind === 'move');

    expect(fly.length).toBeGreaterThan(0);
    // Mọi pha bay phải khai `from`, **không** khai `to`: `to` sẽ lấy bản ở dòng trên
    // đi và đục một lỗ vào nó.
    expect(fly.every((p) => p.from !== undefined && p.to === undefined)).toBe(true);
    // Và nguồn phải ở **dòng ngay trên** đích — cùng hạng tử, khác dòng.
    for (const p of fly) {
      const target = p.targets[0] as string;
      const source = p.from as string;
      expect(target.slice(target.indexOf('-'))).toBe(source.slice(source.indexOf('-')));
      expect(Number(target.slice(1, target.indexOf('-')))).toBe(
        Number(source.slice(1, source.indexOf('-'))) + 1,
      );
    }

    // Chốt canh có răng: giữa chừng pha bay, hạng tử phải **lệch khỏi** chỗ của nó.
    const boxOf = (id: string): readonly SceneBox[] => algebraRenderer.elementBoxes!(s, id);
    const mid = (fly[0] as (typeof fly)[number]).at + (fly[0] as (typeof fly)[number]).duration / 2;
    const shifted = applyChoreography(algebraRenderer.render(s, ctx), spec, mid, { boxOf });
    const moved: string[] = [];
    const visit = (list: readonly SvgNode[]): void => {
      for (const n of list) {
        if (typeof n.attrs['transform'] === 'string') moved.push(String(n.key ?? n.attrs['data-el']));
        if (n.children) visit(n.children as readonly SvgNode[]);
      }
    };
    visit(shifted as readonly SvgNode[]);
    expect(moved.length, 'không nút nào lệch chỗ giữa pha bay').toBeGreaterThan(0);

    // Còn ở cuối pha thì về đúng chỗ — không còn `translate` nào.
    const landed = applyChoreography(algebraRenderer.render(s, ctx), spec, 100_000, { boxOf });
    const still: string[] = [];
    const visit2 = (list: readonly SvgNode[]): void => {
      for (const n of list) {
        if (typeof n.attrs['transform'] === 'string') still.push(String(n.key));
        if (n.children) visit2(n.children as readonly SvgNode[]);
      }
    };
    visit2(landed as readonly SvgNode[]);
    expect(still, 'vẫn còn lệch chỗ ở khung cuối').toEqual([]);
  });

  it('không có gì để kể thì **không** sinh timeline', () => {
    // Một dòng thì không có bước nào, và một timeline rỗng chỉ tổ hiện thanh điều
    // khiển trống.
    expect(algebraChoreography(scene('x + 1', []))).toBeUndefined();
    // Scene bị từ chối cũng thế — không có model thì không có nhịp.
    expect(algebraChoreography(scene('2x +', []))).toBeUndefined();
  });

  it('pha xếp theo thời gian và không pha nào dài quá trần lược đồ', () => {
    const timeline = spec('(x + 1)^2 + 3*x', [
      { rule: 'expand_square', at: '0' },
      { rule: 'drop_unit', at: '1' },
      { rule: 'eval_int', at: '2' },
      { rule: 'collect_like', at: '' },
    ]);
    for (const p of timeline.phases) {
      expect(p.at).toBeGreaterThanOrEqual(0);
      expect(p.at + p.duration).toBeLessThanOrEqual(60_000);
      expect(p.targets.length).toBeGreaterThan(0);
      expect(p.targets.length).toBeLessThanOrEqual(200);
    }
    // Mỗi bước sinh ít nhất hai pha: chỗ sắp đổi, rồi dòng mới.
    expect(timeline.phases.length).toBeGreaterThanOrEqual(8);
  });

  it('danh tính mực mang tên theo dòng, nên `show` dòng sau không đụng dòng trước', () => {
    // Đây là lý do `elementId` tồn tại. `TermId` bền qua các dòng (DAT-11/12) nên một
    // tên trần chạm mọi dòng còn chứa nó — hiện dòng 2 sẽ hiện luôn dòng 1.
    const s = scene('(x + 1)^2 + 3*x', [{ rule: 'expand_square', at: '0' }]);
    const box = layout(readAlgebra(s));
    const row0 = new Set(box.lines[0]!.boxes.map((b) => b.id));
    const row1 = new Set(box.lines[1]!.boxes.map((b) => b.id));

    const shared = [...row0].filter((id) => row1.has(id));
    expect(shared, `tên dùng chung giữa hai dòng: ${shared.join(', ')}`).toEqual([]);

    // Và hạng tử **không đổi** vẫn nhận ra được là một vật, qua phần đuôi của tên.
    const term = (id: string): string => id.slice(id.indexOf('-') + 1);
    const carried = [...row0].map(term).filter((t) => [...row1].map(term).includes(t));
    expect(carried.length).toBeGreaterThan(0);
  });
});

describe('mực giải thích (M52)', () => {
  const explainOf = (start: string, steps: AlgebraStep[]): ReturnType<typeof layout>['explain'] =>
    layout(readAlgebra(scene(start, steps))).explain;
  const explainCtx = createContext(defaultTheme, { explain: true });

  it('**vắng mặt** ở ảnh tĩnh, có mặt khi có người kể chuyện', () => {
    // Đây là cả lý do `ctx.explain` tồn tại: golden và OG card render **không qua**
    // choreography, nên mực nào engine vẽ ra là hiện luôn. Và `opacity: 0` không cứu
    // được — `applyChoreography` **nhân** vào độ mờ sẵn có, nên $0$ nhân gì cũng ra $0$
    // và mực ấy sẽ không bao giờ hiện, im lặng, không lỗi.
    const s = scene('2*x^2 + 2*x + 3*x + 3', [
      { rule: 'factor_by_grouping', at: '', arg: '0,1|2,3' },
    ]);
    const plain = algebraRenderer.render(s, ctx);
    const told = algebraRenderer.render(s, explainCtx);

    const keys = (nodes: readonly SvgNode[]): string[] => {
      const out: string[] = [];
      const go = (list: readonly SvgNode[]): void => {
        for (const n of list) {
          if (n.key !== undefined) out.push(n.key);
          if (n.children) go(n.children as readonly SvgNode[]);
        }
      };
      go(nodes);
      return out;
    };

    const extra = keys(told).filter((k) => !keys(plain).includes(k));
    expect(extra.length, 'không vẽ thêm mực nào khi bật explain').toBeGreaterThan(0);
    expect(keys(plain).some((k) => k.startsWith('g1-') || k.startsWith('t1-'))).toBe(false);
  });

  it('màu vai bắc cầu **qua hai dòng**, vì `TermId` bền', () => {
    // $(a+b)^2 = a^2+2ab+b^2$: $a$ một màu, $b$ một màu, và cùng màu ấy ở cả hai dòng.
    // Mắt nối hai vế mà không cần một mũi tên nào.
    const e = explainOf('(x + 1)^2', [{ rule: 'expand_square', at: '' }]);
    const rows = new Map<number, Set<number>>();
    for (const [id, role] of e.roleOf) {
      const k = Number(id.slice(1, id.indexOf('-')));
      rows.set(k, (rows.get(k) ?? new Set()).add(role));
    }

    expect(rows.get(0)?.size, 'dòng nguồn phải có cả hai vai').toBe(2);
    expect(rows.get(1)?.size, 'dòng kết quả phải có cả hai vai').toBe(2);
  });

  it('sợi nối chỉ đi từ **mảnh sơ cấp**, không từ nút bao', () => {
    // `freshCopy` khai cặp cho *mọi* nút nó sao, kể cả nút bao. Nối hai nút bao thì sợi
    // chạy từ giữa cả biểu thức tới giữa cả biểu thức — đúng dữ liệu, vô nghĩa với mắt,
    // và mấy sợi ấy phủ kín hình.
    const m = readAlgebra(scene('a*(a - b)', [{ rule: 'distribute', at: '' }]));
    const box = layout(m);
    const leafWidth = Math.max(
      ...box.lines[0]!.boxes.filter((b) => b.width < FONT).map((b) => b.width),
    );

    expect(box.explain.threads.length).toBeGreaterThan(0);
    for (const t of box.explain.threads) {
      // Sợi phải đi **xuống** (dòng sau nằm dưới) và xuất phát từ một chỗ hẹp.
      expect(t.y2).toBeGreaterThan(t.y1);
      const source = box.lines[0]!.boxes.find(
        (b) => Math.abs(b.x + b.width / 2 - t.x1) < 0.01,
      );
      expect(source?.width ?? 0, `sợi ${t.id} xuất phát từ một nút bao`).toBeLessThanOrEqual(
        leafWidth * 2,
      );
    }
  });

  it('gạch triệt tiêu chỉ khi nút được áp luật **sống sót**', () => {
    // Nút được áp luật mà biến mất nghĩa là cả cây con vừa bị viết lại; lúc ấy mọi lá
    // bên trong "biến mất" theo và gạch từng cái là gạch nát cả dòng. Đo trên chính ca
    // đã bắt được lỗi: `factor_by_grouping` dựng lại toàn bộ tổng.
    expect(
      explainOf('2*x^2 + 2*x + 3*x + 3', [
        { rule: 'factor_by_grouping', at: '', arg: '0,1|2,3' },
      ]).strikes,
    ).toEqual([]);
    expect(explainOf('(x + 1)^2', [{ rule: 'expand_square', at: '' }]).strikes).toEqual([]);

    // Còn thế ẩn phụ **bên trong một tích đang đứng yên** thì có: nút `mul` sống sót,
    // và mấy hạng tử bị nuốt vào ẩn phụ mới là thứ thật sự biến mất. Đây đúng chuỗi
    // của bài `quartic-by-substitution` trong kho.
    const swap = explainOf('(x^2 + 5*x + 4)*(x^2 + 5*x + 6) - 8 = 0', [
      { rule: 'set_variable', at: 'L', arg: 't := x^2 + 5*x' },
    ]);
    expect(swap.strikes.length).toBeGreaterThan(0);
  });

  it('ngoặc nhóm chỉ mọc ở luật thật sự **nhóm**', () => {
    const grouped = explainOf('2*x^2 + 2*x + 3*x + 3', [
      { rule: 'factor_by_grouping', at: '', arg: '0,1|2,3' },
    ]);
    expect(grouped.braces).toHaveLength(2);
    // Hai ngoặc không được đè lên nhau — chúng nói về hai nhóm rời.
    const [a, b] = [...grouped.braces].sort((p, q) => p.x1 - q.x1) as [
      (typeof grouped.braces)[number],
      (typeof grouped.braces)[number],
    ];
    expect(a.x2).toBeLessThanOrEqual(b.x1);

    expect(explainOf('sqrt(48)', [{ rule: 'pull_square_out', at: '' }]).braces).toEqual([]);
  });

  it('dòng điều kiện được **nối** với hình', () => {
    // Trước M52 dòng đỏ lơ lửng dưới hình không dính vào gì: người đọc phải tự đoán
    // "$a \\ne 0$" đang ràng buộc cái mẫu số nào.
    const cut = explainOf('(6*a)/(3*a)', [{ rule: 'cancel_common', at: '', arg: 'a' }]);
    expect(cut.conditionLinks).toHaveLength(1);

    // Không có điều kiện thì không có sợi — nó không phải đồ trang trí thường trực.
    expect(explainOf('sqrt(48)', [{ rule: 'pull_square_out', at: '' }]).conditionLinks).toEqual([]);
  });
});

describe('hình', () => {
  it('mỗi dòng một hàng, gióng theo dấu quan hệ', () => {
    const m = readAlgebra(scene('x + 1 = 2', [{ rule: 'add_both_sides', at: '', arg: '1' }]));
    const box = layout(m);

    expect(box.lines).toHaveLength(2);
    // Vế trái dài ra thì dòng phải dịch sang trái để dấu $=$ vẫn thẳng cột.
    expect(box.lines[0]!.box.x).toBeGreaterThan(box.lines[1]!.box.x);
  });

  it('tắt cột luật thì không còn nhãn luật nào', () => {
    const off = scene('(x + 1)^2', [{ rule: 'expand_square', at: '' }], { show_rules: false });

    expect(layout(readAlgebra(off)).lines.every((l) => l.label === null)).toBe(true);
    expect(renderer.toSvg(off, ctx)).not.toContain('khai triển');
  });
});

describe('M55 — dọn nhà', () => {
  const run = (start: string, steps: AlgebraStep[]) => readAlgebra(scene(start, steps));
  const last = (start: string, steps: AlgebraStep[]): string => {
    const m = run(start, steps);
    if (m.refusal !== null) throw new Error(m.refusal);
    return unparse(m.rows.at(-1)!.expr);
  };

  describe('`at` trỏ bằng **nội dung**', () => {
    // Cái bẫy: `abs_case` trả về một `add`, nó bị làm phẳng vào tổng cha, và mọi chỉ
    // số sau nó lùi một nấc. Dấu $|\cdot|$ thứ hai đứng ở `L.1` trước bước, `L.2` sau.
    it('đường dẫn theo vị trí **dịch chỗ** — đó là lý do `@` tồn tại', () => {
      const shifted = run('abs(x - 1) + abs(x - 2) = 3', [
        { rule: 'abs_case', at: 'L.0', arg: '+' },
        { rule: 'abs_case', at: 'L.1', arg: '+' },
      ]);
      expect(shifted.refusal).toContain('cần một dấu giá trị tuyệt đối');

      // Cùng bài, khai bằng nội dung: chạy thẳng, không phải đoán chỉ số nào cả.
      expect(
        last('abs(x - 1) + abs(x - 2) = 3', [
          { rule: 'abs_case', at: '@abs(x - 1)', arg: '+' },
          { rule: 'abs_case', at: '@abs(x - 2)', arg: '+' },
        ]),
      ).toBe('((x + (-1) + x + (-2)) = 3)');
    });

    it('không khớp, khớp nhiều chỗ, và mẫu hỏng — ba lời từ chối khác nhau', () => {
      expect(run('x + 1 = 2', [{ rule: 'abs_case', at: '@abs(y)', arg: '+' }]).refusal).toContain(
        'không cây con nào khớp',
      );

      const many = run('abs(x) + abs(x) = 3', [{ rule: 'abs_case', at: '@abs(x)', arg: '+' }]);
      expect(many.refusal).toContain('2 cây con cùng khớp');
      // Nói **chỗ nào** khớp, để tác giả chuyển sang đường dẫn được ngay.
      expect(many.refusal).toContain('"L.0"');

      expect(run('x + 1 = 2', [{ rule: 'commute', at: '@((', arg: '0,1' }]).refusal).toContain(
        'không đọc được',
      );
    });

    it('`row.at` giữ đường dẫn **đã giải**, không giữ chuỗi tác giả gõ', () => {
      // `layout` và `choreography` đưa thẳng nó vào `nodeAt`, mà `nodeAt` không hiểu `@`.
      const m = run('abs(x - 1) + abs(x - 2) = 3', [
        { rule: 'abs_case', at: '@abs(x - 2)', arg: '+' },
      ]);
      expect(m.rows.at(-1)!.at).toBe('L.1');
      expect(nodeAt(m.rows[0]!.expr, m.rows.at(-1)!.at)).not.toBeNull();
    });
  });

  it('`maxSteps` bị chặn ở **tầng model**, không chỉ ở ajv', () => {
    const many = (n: number): AlgebraStep[] =>
      Array.from({ length: n }, () => ({ rule: 'commute', at: '', arg: '0,1' }));

    // Trước M55 chỗ này im lặng chạy đủ 13 bước: `maxItems` của TypeBox là hàng rào
    // duy nhất, nên mọi đường vào không qua ajv đều đi vòng qua nó.
    const over = run('a + b', many(ALGEBRA_LIMITS.maxSteps + 1));
    expect(over.refusal).toContain(`quá trần ${ALGEBRA_LIMITS.maxSteps}`);
    expect(run('a + b', many(ALGEBRA_LIMITS.maxSteps)).refusal).toBeNull();
  });

  describe('`factor_quadratic` hệ số dẫn đầu khác 1', () => {
    const factor = (s: string): string => last(s, [{ rule: 'factor_quadratic', at: '' }]);

    it('hệ số nguyên, không dùng số thực', () => {
      expect(factor('2*x^2 + 7*x + 3')).toBe('((x + 3) * ((2 * x) + 1))');
      expect(factor('3*x^2 - 5*x - 2')).toBe('((x + (-2)) * ((3 * x) + 1))');
      expect(factor('6*x^2 + 11*x + 3')).toBe('(((2 * x) + 3) * ((3 * x) + 1))');
      expect(factor('4*x^2 - 9')).toBe('(((2 * x) + (-3)) * ((2 * x) + 3))');
      // Hệ số dẫn đầu **âm** cũng đi được, không phải đổi dấu trước.
      expect(factor('-2*x^2 + 5*x - 3')).toBe('((x + (-1)) * (((-2) * x) + 3))');
      // $c = 0$ có nhánh riêng: $0$ không có ước nào để vét.
      expect(factor('2*x^2 + 3*x')).toBe('(x * ((2 * x) + 3))');
    });

    it('nhánh $a = 1$ cho ra **đúng cây cũ** — kho không phải soát lại', () => {
      expect(factor('x^2 + 5*x + 6')).toBe('((x + 2) * (x + 3))');
      expect(factor('x^2 - x - 6')).toBe('((x + (-3)) * (x + 2))');
      expect(factor('x^2 - 4')).toBe('((x + (-2)) * (x + 2))');
    });

    it('vô tỉ thì từ chối, và **chỉ đường** sang công thức nghiệm', () => {
      const why = run('2*x^2 + 2*x + 3', [{ rule: 'factor_quadratic', at: '' }]).refusal as string;
      expect(why).toContain('không có cặp số nguyên');
      expect(why).toContain('công thức nghiệm');
    });
  });

  describe('`rationalize` cho căn bậc $n$', () => {
    const rat = (s: string): string => last(s, [{ rule: 'rationalize', at: '' }]);

    it('bậc ba trở lên nhân cho $\\sqrt[n]{b^{n-1}}$', () => {
      expect(rat('1/root(3, 2)')).toBe('((1 * root(3, (2)^(2))) / 2)');
      expect(rat('5/root(4, x)')).toBe('((5 * root(4, (x)^(3))) / x)');
      expect(rat('1/root(5, 2)')).toBe('((1 * root(5, (2)^(4))) / 2)');
    });

    it('bậc hai giữ nguyên từng chữ của bản cũ', () => {
      expect(rat('1/sqrt(2)')).toBe('((1 * sqrt(2)) / 2)');
      expect(rat('3/sqrt(x)')).toBe('((3 * sqrt(x)) / x)');
    });

    it('kết quả **đúng về giá trị** — không phải chỉ đúng hình dạng', () => {
      // Chốt canh thật của luật này: bộ kiểm thực phải xác nhận, và nó có xác nhận
      // được (chứ không rơi vào `unchecked`, thứ nghĩa là "không tìm được điểm nào").
      for (const s of ['1/root(3, 2)', '5/root(4, x)', '1/root(5, 2)']) {
        const m = run(s, [{ rule: 'rationalize', at: '' }]);
        expect(m.unsound).toEqual([]);
        expect(m.unchecked).toEqual([]);
      }
    });

    it('mẫu là **tổng** chứa căn thì chỉ sang luật đúng', () => {
      expect(run('1/(sqrt(2) + 1)', [{ rule: 'rationalize', at: '' }]).refusal).toContain(
        'multiply_by_conjugate',
      );
    });
  });

  describe('trần bề ngang đo lại', () => {
    it('$(a+b+c)^3$ **qua được** — hằng đẳng thức SGK không còn bị chặn', () => {
      const m = run('(a + b + c)^3', [{ rule: 'multiply_out', at: '' }]);
      expect(m.refusal).toBeNull();
    });

    it('trần vẫn còn răng, và lời từ chối nói **rộng bao nhiêu ô**', () => {
      const why = run('(a + b)^8', [{ rule: 'multiply_out', at: '' }]).refusal as string;
      expect(why).toContain('rộng');
      expect(why).toContain(`quá ${ALGEBRA_LIMITS.maxWidthCells}`);
    });

    it('trần khớp với chỗ chữ tụt xuống dưới 12px trên màn hẹp nhất', () => {
      // Con số $13$ không phải chọn cho vừa một bài: nó là bề rộng cuối cùng còn giữ
      // chữ trên 12px ở điện thoại 360px, với luật co của `render/scale.ts`.
      // Khẳng định lại phép tính ấy ở đây để nó không lặng lẽ hết đúng.
      const pane = 360 - 32; // padding 1rem hai bên
      const px = (w: number): number => FONT * (CELL_PX / ROW) * Math.min(1, pane / (CELL_PX * w));

      expect(px(ALGEBRA_LIMITS.maxWidthCells)).toBeGreaterThan(12);
      expect(px(ALGEBRA_LIMITS.maxWidthCells + 1)).toBeLessThan(12);
    });
  });
});

describe('M56 — hàm tổ hợp và bộ bốc điểm số nguyên', () => {
  const run = (start: string, steps: AlgebraStep[] = []) => readAlgebra(scene(start, steps));
  const last = (start: string, steps: AlgebraStep[]): string => {
    const m = run(start, steps);
    if (m.refusal !== null) throw new Error(m.refusal);
    return unparse(m.rows.at(-1)!.expr);
  };
  const tree = (s: string): Expr => parse(s, new Minter());

  describe('cú pháp', () => {
    it('`n!` và `n != 3` là **hai** thứ khác nhau', () => {
      // `!=` là toán tử quan hệ. Nuốt nhầm dấu `!` làm giai thừa thì `n != 3` thành
      // lỗi cú pháp — và lỗi ấy sẽ chỉ lộ ra ở bài đầu tiên dùng dấu khác.
      expect(unparse(tree('n != 3'))).toBe('(n != 3)');
      expect(unparse(tree('n! = 3'))).toBe('(fact(n) = 3)');
    });

    it('`C` vừa là tên biến vừa là tên hàm, và không mơ hồ', () => {
      // Vì engine **cấm nhân ngầm** (§3.3): một biến không bao giờ đứng sát `(`.
      expect(unparse(tree('C + 1'))).toBe('(C + 1)');
      expect(unparse(tree('C(n, k)'))).toBe('C(n, k)');
      expect(() => parse('C(n, k)', new Minter())).not.toThrow();
    });

    it('giai thừa là **hậu tố** và ăn trước dấu mũ', () => {
      expect(unparse(tree('n!^2'))).toBe('(fact(n))^(2)');
      expect(unparse(tree('2^n!'))).toBe('(2)^(fact(n))');
    });

    it('chữ trơn bọc ngoặc khi đối số không phải nguyên tử', () => {
      // `x + 1!` đọc ra $x + (1!)$ — một biểu thức khác hẳn $(x+1)!$.
      expect(toPlain(tree('(x + 1)!'))).toBe('(x + 1)!');
      expect(toPlain(tree('n!'))).toBe('n!');
      expect(toPlain(tree('C(n, k)'))).toBe('C(n,k)');
    });
  });

  describe('bộ bốc điểm số nguyên — phần đắt nhất', () => {
    it('bộ **thực** không kiểm được giai thừa, bộ **nguyên** thì được', () => {
      // Đây là cả lý lẽ của M56 gói trong một khẳng định. `sameValueReal` bốc trong
      // $[-4,-0{,}3] \cup [0{,}3,4]$, toàn số không nguyên ⇒ `fact` trả `null` ở **mọi**
      // điểm ⇒ `verified: false`. Không có bộ nguyên thì mọi bước tổ hợp thành
      // `unchecked`, tức vàng thường trực trên mọi bài — đúng thất bại M45.
      const a = tree('n!');
      const b = tree('n * (n - 1)!');

      expect(sameValueReal(a, b, 1, 8).verified).toBe(false);
      const withInteger = sameValue(a, b);
      expect(withInteger.verified).toBe(true);
      expect(withInteger.ok).toBe(true);
    });

    it('và nó **bắt** được đồng nhất thức sai', () => {
      expect(sameValue(tree('n!'), tree('n * (n - 2)!')).ok).toBe(false);
      expect(sameValue(tree('C(n, k)'), tree('C(n, k + 1)')).ok).toBe(false);
      expect(sameValue(tree('C(n, k)'), tree('C(n, n - k)')).ok).toBe(true);
    });

    it('điểm ngoài miền bị **bỏ**, không bị kết tội', () => {
      // $(n-k)!$ với $k > n$ không xác định. Bộ kiểm phải bỏ điểm ấy như bỏ căn bậc
      // chẵn của số âm — nếu nó kết tội thì `binom_to_factorial` đỏ oan.
      const v = sameValue(tree('C(n, k)'), tree('n! / (k! * (n - k)!)'));
      expect(v.ok).toBe(true);
      expect(v.verified).toBe(true);
    });
  });

  describe('năm luật', () => {
    it('cho ra đúng vế sau', () => {
      expect(last('n!', [{ rule: 'factorial_step', at: '' }])).toBe('(n * fact((n + (-1))))');
      expect(last('C(n, k)', [{ rule: 'binom_symmetry', at: '' }])).toBe('C(n, (n + ((-1) * k)))');
      expect(last('C(n, k)', [{ rule: 'pascal', at: '' }])).toBe(
        '(C((n + (-1)), (k + (-1))) + C((n + (-1)), k))',
      );
      expect(last('k*C(n, k)', [{ rule: 'binom_absorb', at: '' }])).toBe(
        '(n * C((n + (-1)), (k + (-1))))',
      );
      expect(last('C(n, k)', [{ rule: 'binom_to_factorial', at: '' }])).toBe(
        '(fact(n) / (fact(k) * fact((n + ((-1) * k)))))',
      );
    });

    it('cả năm đều **kiểm được** — không luật nào rơi vào `unchecked`', () => {
      const cases: Array<[string, string]> = [
        ['n!', 'factorial_step'],
        ['C(n, k)', 'binom_to_factorial'],
        ['C(n, k)', 'binom_symmetry'],
        ['C(n, k)', 'pascal'],
        ['k*C(n, k)', 'binom_absorb'],
      ];
      for (const [start, rule] of cases) {
        const m = run(start, [{ rule, at: '' }]);
        expect(m.refusal, `${rule}: ${m.refusal}`).toBeNull();
        expect(m.unsound, rule).toEqual([]);
        expect(m.unchecked, rule).toEqual([]);
      }
    });

    it('`binom_absorb` so thừa số bằng **cấu trúc**, không bằng tên', () => {
      expect(last('3*k*C(n, k)', [{ rule: 'binom_absorb', at: '' }])).toBe(
        '(3 * n * C((n + (-1)), (k + (-1))))',
      );
      expect(run('3*C(n, k)', [{ rule: 'binom_absorb', at: '' }]).refusal).toContain(
        'không có thừa số bằng k',
      );
    });

    it('điều kiện in ra khi có biến, **im** khi hiển nhiên đúng', () => {
      // Chữ đỏ thường trực và vô ích là cách nhanh nhất để người ta ngừng đọc mọi chữ
      // đỏ, kể cả dòng thật (M45). "$0 \\le 2 \\le 5$" là một dòng như thế.
      expect(run('C(n, k)', [{ rule: 'pascal', at: '' }]).conditions).toEqual(['n ≥ 1']);
      expect(run('C(5, 2)', [{ rule: 'binom_to_factorial', at: '' }]).conditions).toEqual([]);
      expect(run('C(n, k)', [{ rule: 'binom_to_factorial', at: '' }]).conditions).toEqual([
        '0 ≤ k ≤ n',
      ]);
      // Đối xứng đúng ở **mọi** $k$ nguyên nhờ quy ước $C_n^k = 0$ ngoài $[0,n]$.
      expect(run('C(n, k)', [{ rule: 'binom_symmetry', at: '' }]).conditions).toEqual([]);
    });
  });

  describe('sắp chữ', () => {
    it('$C_n^k$ **chồng cột** — bề ngang là `max`, không phải tổng', () => {
      // Ghép `sup` với `shift` cho ra $C_n{}^k$ — chỉ số dưới rồi mới tới số mũ, đọc ra
      // một thứ khác. Đây là lý do `subsup` phải là một hộp riêng.
      const wide = measure(toBox(tree('C(n, k)')));
      const base = measure(toBox(tree('C')));
      const sub = measure(toBox(tree('n'), shrink(FONT, 0.68)));
      expect(wide.w).toBeLessThan(base.w + sub.w * 2);
    });

    it('không glyph nào chồng lên nhau, kể cả khi lồng tới sàn cỡ chữ', () => {
      // $C_n^k$ lồng trong chỉ số dưới của một $C_n^k$ khác đẩy cả hai tầng xuống sàn
      // `SIZE_FLOOR`, và ở đó `supRise`/`subDrop` — mỗi cái chỉ nhìn *một* tầng —
      // không còn tách được chúng. Lượt quét này là thứ bắt được, ở $0{,}07$ đơn vị.
      for (const src of ['C(n, k)', 'C(C(n, k), 2)', 'n!^2', 'C(n, k) = n! / (k! * (n - k)!)']) {
        const p = place(toBox(tree(src), FONT), 0, 0);
        const hits: string[] = [];
        for (let i = 0; i < p.glyphs.length; i += 1) {
          for (let j = i + 1; j < p.glyphs.length; j += 1) {
            const a = glyphBox(p.glyphs[i]!);
            const b = glyphBox(p.glyphs[j]!);
            const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
            const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
            if (ox > 0.05 && oy > 0.05) hits.push(`"${p.glyphs[i]!.s}"×"${p.glyphs[j]!.s}"`);
          }
        }
        expect(hits, `${src}: ${hits.join(', ')}`).toEqual([]);
      }
    });

    it('dấu `!` được đo riêng — không thì số mũ trôi khỏi nó', () => {
      // `estimateTextWidth` ước đều $0{,}5$ em, dôi $0{,}22$ em cho một nét đứng. Đủ để
      // $n!^2$ vẽ ra hai vật rời nhau. Cùng lớp lỗi với bảng `EM` sinh ra để dẹp.
      expect(textWidth('!', FONT)).toBeLessThan(textWidth('x', FONT));
    });
  });
});

describe('M57 — tổng và tích', () => {
  const run = (start: string, steps: AlgebraStep[] = []) => readAlgebra(scene(start, steps));
  const last = (start: string, steps: AlgebraStep[]): string => {
    const m = run(start, steps);
    if (m.refusal !== null) throw new Error(m.refusal);
    return unparse(m.rows.at(-1)!.expr);
  };
  const tree = (s: string): Expr => parse(s, new Minter());
  const at = (s: string, env: Record<string, number>): number | null =>
    evalReal(tree(s), new Map(Object.entries(env)));

  describe('phạm vi biến — rủi ro chính của hạng mục', () => {
    it('biến chỉ số **không** là biến tự do', () => {
      // Bỏ sót chỗ trừ này thì hai chỗ hỏng cùng lúc và cả hai đều im lặng: `maxVars`
      // đếm thừa, và bộ kiểm bốc một giá trị cho $k$ rồi vòng lặp của `big` đè lên nó —
      // phép kiểm vẫn xanh, nhưng xanh vì một lý do khác với lý do người ta tưởng.
      expect([...varsOf(tree('sum(k, 1, n, k)'))]).toEqual(['n']);
      expect([...varsOf(tree('sum(k, 1, n, k*x))'.slice(0, -1)))].sort()).toEqual(['n', 'x']);
    });

    it('hai **cận** nằm ngoài phạm vi ràng buộc', () => {
      // $\\sum_{k=1}^{k}$ — cận trên là một $k$ khác, **tự do**. Trộn hai thứ ấy là lỗi
      // phạm vi cổ điển nhất, và nó không có triệu chứng nào ngoài một con số sai.
      expect([...varsOf(tree('sum(k, 1, k, k)'))]).toEqual(['k']);
    });

    it('lồng nhau thì mỗi tầng ràng buộc tên của nó', () => {
      expect([...varsOf(tree('sum(j, 1, n, sum(k, 1, j, k)))'.slice(0, -1)))]).toEqual(['n']);
      // Và trùng tên thì **từ chối ở parser**. Đổi tên tự động là một mẹo, và mẹo ở
      // tầng ngữ pháp là chỗ lỗi nằm: tác giả gõ `k` rồi `at` của bước sau trỏ vào một
      // cái tên chưa từng gõ.
      expect(() => parse('sum(k, 1, n, sum(k, 1, m, k))', new Minter())).toThrow('đã bị');
    });

    it('`substituteVar` không thò vào thân đã che tên', () => {
      const e = tree('sum(k, 1, n, k) + k');
      const out = substituteVar(e, 'k', tree('9'));
      // $k$ tự do ở ngoài bị thay; $k$ trong thân tổng thì không.
      expect(unparse(out)).toBe('(sum(k, 1, n, k) + 9)');
    });
  });

  describe('đánh giá', () => {
    it('khai đúng khi hai cận là số nguyên', () => {
      expect(at('sum(k, 1, n, k)', { n: 4 })).toBe(10);
      expect(at('sum(k, 1, 4, k^2)', {})).toBe(30);
      expect(at('prod(k, 1, n, k)', { n: 4 })).toBe(24);
      expect(at('sum(k, 0, n, C(n, k))', { n: 4 })).toBe(16);
      expect(at('sum(j, 1, n, sum(k, 1, j, k))', { n: 4 })).toBe(20);
    });

    it('khoảng **rỗng** cho $0$ với tổng và $1$ với tích', () => {
      // Quy ước chuẩn, và nó có việc thật: `sum_split` tại $m = b$ sinh ra đúng một
      // khoảng rỗng, nên nếu chỗ này trả `null` thì luật ấy hoá ra không kiểm được.
      expect(at('sum(k, 1, 0, k)', {})).toBe(0);
      expect(at('prod(k, 1, 0, k)', {})).toBe(1);
    });

    it('cận không nguyên ⇒ điểm vô dụng, **không** phải bằng chứng sai', () => {
      expect(at('sum(k, 1, n, k)', { n: 2.5 })).toBeNull();
    });
  });

  describe('sáu luật', () => {
    it('cho ra đúng vế sau', () => {
      expect(last('sum(k, 1, n, 5)', [{ rule: 'sum_const', at: '' }])).toBe('((n + (-1) + 1) * 5)');
      expect(last('prod(k, 1, n, x)', [{ rule: 'sum_const', at: '' }])).toBe('(x)^((n + (-1) + 1))');
      expect(last('sum(k, 1, n, 3*k)', [{ rule: 'sum_linear', at: '' }])).toBe(
        '(3 * sum(k, 1, n, k))',
      );
      expect(last('sum(k, 1, 4, k^2)', [{ rule: 'sum_expand', at: '' }])).toBe(
        '((1)^(2) + (2)^(2) + (3)^(2) + (4)^(2))',
      );
      expect(last('prod(k, 1, n, (k + 1)/k)', [{ rule: 'prod_telescope', at: '' }])).toBe(
        '((n + 1) / 1)',
      );
    });

    it('cả sáu **kiểm được** — không luật nào rơi vào `unchecked`', () => {
      const cases: Array<[string, string, string | undefined]> = [
        ['sum(k, 1, n, 5)', 'sum_const', undefined],
        ['sum(k, 1, n, 3*k)', 'sum_linear', undefined],
        ['sum(k, 1, n, k)', 'sum_split', '2'],
        ['sum(k, 1, n, k^2)', 'sum_shift', '1'],
        ['sum(k, 1, 4, k^2)', 'sum_expand', undefined],
        ['prod(k, 1, n, (k + 1)/k)', 'prod_telescope', undefined],
      ];
      for (const [start, rule, arg] of cases) {
        const m = run(start, [arg === undefined ? { rule, at: '' } : { rule, at: '', arg }]);
        expect(m.refusal, `${rule}: ${m.refusal}`).toBeNull();
        expect(m.unsound, rule).toEqual([]);
        expect(m.unchecked, rule).toEqual([]);
      }
    });

    it('`sum_expand` là **cầu nối** về `add` thường', () => {
      // Không có nó thì $\\Sigma$ là một ốc đảo: cả 47 luật cũ đều không áp được vào
      // một nút `big`.
      expect(
        last('sum(k, 1, 4, k)', [
          { rule: 'sum_expand', at: '' },
          { rule: 'eval_int', at: '' },
        ]),
      ).toBe('10');
    });

    it('`prod_telescope` nhận dạng bằng **cấu trúc**, không bằng mẫu chuỗi', () => {
      expect(run('prod(k, 1, n, (k + 2)/k)', [{ rule: 'prod_telescope', at: '' }]).refusal).toContain(
        'lùi một bậc',
      );
    });

    it('trần sáu hạng tử để **trần kích thước** tự lo phần còn lại', () => {
      const why = run('sum(k, 1, 7, k)', [{ rule: 'sum_expand', at: '' }]).refusal as string;
      expect(why).toContain('7 hạng tử');
    });
  });

  describe('`guard` phải nhận **số nhiều**', () => {
    it('`sum_split` sai khi chỗ cắt nằm ngoài khoảng — và engine bắt được', () => {
      // Đây là ca buộc `Guard` phải thành `Guards`. Tách $\\sum_{k=1}^{n}$ tại $m=3$ chỉ
      // đúng khi $0 \\le 3 \\le n$; ở $n = 1$ vế trái là $1$ còn vế phải là $6 + 0$.
      // Gói hai bất đẳng thức vào một biểu thức — $(b-m)(m-a+1) \\ge 0$ — thì đúng tình
      // cờ và sai khi cả hai cùng âm.
      const guards = [
        { expr: tree('n - 3'), sign: '>=0' as const },
        { expr: tree('3 - 1 + 1'), sign: '>=0' as const },
      ];
      const before = tree('sum(k, 1, n, k)');
      const after = tree('sum(k, 1, 3, k) + sum(k, 4, n, k)');

      // Không điều kiện ⇒ bắt được sai.
      expect(sameValue(before, after).ok).toBe(false);
      // Có **cả hai** điều kiện ⇒ đúng.
      expect(sameValue(before, after, 20260731, 8, guards).ok).toBe(true);
    });

    it('luật tự khai đủ hai điều kiện, và in ra hình', () => {
      const m = run('sum(k, 1, n, k)', [{ rule: 'sum_split', at: '', arg: '3' }]);
      expect(m.unsound).toEqual([]);
      expect(m.conditions).toEqual(['1 − 1 ≤ 3 ≤ n']);
    });
  });

  it('vẽ ra vừa trần — kể cả $\\Sigma$ chồng $\\Sigma$ trong một phân số', () => {
    for (const src of [
      'sum(k, 1, n, k^2) = n*(n + 1)*(2*n + 1)/6',
      '(sum(k, 1, n, k))/(sum(k, 1, n, 1))',
      'sum(j, 1, n, sum(k, 1, j, k))',
    ]) {
      const mm = measure(toBox(tree(src)));
      expect((mm.above + mm.below) / ROW, src).toBeLessThanOrEqual(ALGEBRA_LIMITS.maxHeightCells);
      expect(mm.w / ROW, src).toBeLessThanOrEqual(ALGEBRA_LIMITS.maxWidthCells);
    }
  });
});

describe('M58 — số mũ ký hiệu', () => {
  const run = (start: string, steps: AlgebraStep[] = []) => readAlgebra(scene(start, steps));
  const plain = (start: string, steps: AlgebraStep[]): string => {
    const m = run(start, steps);
    if (m.refusal !== null) throw new Error(m.refusal);
    return toPlain(m.rows.at(-1)!.expr);
  };

  it('luật luỹ thừa cũ **đã** chạy với số mũ ký hiệu — không khai lại', () => {
    // Soát trước khi viết: `pow_add` và `pow_mul` chạy sẵn từ M49, nên M58 chỉ thêm
    // chiều còn thiếu. Khẳng định ở đây để lần sau không ai viết lại chúng.
    expect(plain('x^m * x^n', [{ rule: 'pow_add', at: '' }])).toBe('x^(m + n)');
    expect(plain('(x^m)^n', [{ rule: 'pow_mul', at: '' }])).toBe('x^(mn)');
  });

  it('`pow_split` — chiều ngược, và nó **chưa** có', () => {
    expect(plain('x^(m + n)', [{ rule: 'pow_split', at: '' }])).toBe('x^mx^n');
    expect(run('x^n', [{ rule: 'pow_split', at: '' }]).refusal).toContain('số mũ phải là một tổng');
  });

  describe('$\\Sigma$ mở khoá hằng đẳng thức bậc $n$ ký hiệu', () => {
    it('$a^n - b^n$ viết được **không cần dấu ba chấm**', () => {
      // Đây là lý do "nút dấu ba chấm" nằm ở mục cố ý không làm: $\\Sigma$ *là* dấu ba
      // chấm, có ngữ nghĩa, và kiểm được.
      expect(plain('a^n - b^n', [{ rule: 'factor_power_difference', at: '' }])).toBe(
        '(a − b)(Σ(k=0..n − 1) a^kb^(n − 1 − k))',
      );
      // $x^n - 1$ là ví dụ kinh điển nhất của cả họ, và $1$ **là** $1^n$.
      expect(plain('x^n - 1', [{ rule: 'factor_power_difference', at: '' }])).toBe(
        '(x − 1)(Σ(k=0..n − 1) x^k)',
      );
    });

    it('và bộ kiểm **xác nhận** được nó', () => {
      for (const src of ['a^n - b^n', 'x^n - 1']) {
        const m = run(src, [{ rule: 'factor_power_difference', at: '' }]);
        expect(m.unsound, src).toEqual([]);
        expect(m.unchecked, src).toEqual([]);
      }
    });

    it('chỉ số mới **không được** bắt một biến đang có', () => {
      // $a^k - b^k$ mà lấy luôn tên `k` làm chỉ số thì biến tự do $k$ bị ràng buộc mất
      // — đúng lỗi phạm vi mà M57 dựng cả `varsOf` để tránh.
      expect(plain('a^k - b^k', [{ rule: 'factor_power_difference', at: '' }])).toContain('i=0');
    });

    it('chuỗi đi hết từ ký hiệu về số cụ thể', () => {
      expect(
        plain('x^n - 1', [
          { rule: 'factor_power_difference', at: '' },
          { rule: 'evaluate_at', at: '', arg: 'n := 4' },
          { rule: 'eval_int', at: '1.1' },
          { rule: 'sum_expand', at: '1' },
        ]),
      ).toBe('(x − 1)(1 + x + x^2 + x^3)');
    });
  });

  it('tổng hai luỹ thừa bậc ký hiệu **từ chối**, và nói vì sao', () => {
    // Tính chẵn/lẻ quyết định hẳn câu trả lời, mà engine không biết chẵn lẻ của một ký
    // hiệu. Đúng tiền lệ `pow_both_sides`.
    const why = run('a^n + b^n', [{ rule: 'factor_power_sum_odd', at: '' }]).refusal as string;
    expect(why).toContain('chẵn hay lẻ');
  });

  describe('`substitute` chui được vào mọi kiểu nút — lỗi có sẵn từ M47b', () => {
    it('trước M58 nó im lặng bỏ qua căn, trị tuyệt đối, hàm, và tổng', () => {
      // Bản cũ liệt kê `add`/`mul`/`pow`/`div`/`rel` rồi `default: return e`. Lời từ
      // chối còn nói sai hẳn — "không thấy biến x" trong khi biến nằm ngay đó.
      for (const [src, want] of [
        ['sqrt(x) + 1', '√(4) + 1'],
        ['abs(x) + 1', '|4| + 1'],
        ['C(x, 2)', 'C(4,2)'],
        ['x!', '4!'],
        ['sum(k, 1, x, k)', 'Σ(k=1..4) k'],
      ] as const) {
        expect(plain(src, [{ rule: 'substitute', at: '', arg: 'x := 4' }]), src).toBe(want);
      }
    });

    it('và nó tôn trọng **phạm vi**', () => {
      // $k$ tự do ở ngoài bị thay; $k$ trong thân tổng thì không.
      expect(plain('sum(k, 1, n, k) + k', [{ rule: 'substitute', at: '', arg: 'k := 9' }])).toBe(
        'Σ(k=1..n) k + 9',
      );
      // Cận trên **ngoài** phạm vi ràng buộc, nên nó bị thay.
      expect(plain('sum(k, 1, k, k)', [{ rule: 'substitute', at: '', arg: 'k := 9' }])).toBe(
        'Σ(k=1..9) k',
      );
    });
  });
});
