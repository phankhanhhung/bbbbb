import { describe, expect, it } from 'vitest';
import { createContext, createRenderer } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import {
  Minter,
  algebraHitTest,
  algebraRenderer,
  algebraSchemaFragment,
  allPaths,
  layout,
  nodeAt,
  parse,
  readAlgebra,
  resolveAlgebraValidator,
  RULES,
  sameSolutionSet,
  sameValue,
  same,
  unparse,
  type AlgebraStep,
} from '../src/index.js';

const renderer = createRenderer([algebraRenderer]);
const ctx = createContext(defaultTheme);

const scene = (start: string, steps: AlgebraStep[] = [], extra: object = {}): Scene =>
  ({ engine: 'algebra', config: { start, steps, ...extra }, elements: [] }) as never;

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
    const ATOMS = ['x', 'y', '2', '3', '-1', 'x^2', 'a_1', 'sqrt(x)', 'sqrt(2)', 'root(3, y)'];
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
    const ATOMS = ['x', 'y', '2', '3', '-1', 'x^2', 'sqrt(x)', 'sqrt(6)', 'abs(x)'];
    let s = 4242;
    const rand = (): number => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
    const gen = (d: number): string =>
      d === 0 || rand() < 0.3
        ? pick(ATOMS)
        : `(${gen(d - 1)} ${pick(['+', '-', '*', '/'])} ${gen(d - 1)})`;

    const bad: string[] = [];
    let applied = 0;

    for (let i = 0; i < 16000; i += 1) {
      const src = gen(3);
      const root = parse(src, new Minter());
      const at = pick([...allPaths(root).keys()]);
      const node = nodeAt(root, at);
      const rule = pick(RULES);
      if (node === null) continue;

      const arg =
        rule.id === 'commute'
          ? '0,1'
          : rule.id === 'factor' || rule.id === 'cancel_common'
            ? pick(ATOMS)
            : rule.id === 'substitute'
              ? 'x := (y + 1)'
              : rule.needsArg
                ? 'y'
                : undefined;

      const out = rule.run(new Minter(), node, arg);
      if ('refusal' in out) continue;
      applied += 1;
      // Nhóm ★ và `substitute` đổi *nghĩa*, không phải giá trị — kiểm bằng điểm
      // ngẫu nhiên ở đó là hỏi sai câu hỏi.
      if (rule.onRelation || rule.id === 'substitute') continue;
      if (node.k === 'rel' || out.after.k === 'rel') continue;

      const verdict = sameValue(node, out.after, 777 + i);
      if (!verdict.ok) bad.push(`${rule.id} tại "${at}" của ${src}: ${verdict.message}`);
    }

    // Ngưỡng canh **phép quét có chạy thật**, không canh tỉ lệ trúng. Thêm luật thì
    // tỉ lệ trúng giảm (mỗi vòng bốc 1 trong N luật), nên số vòng phải tăng theo —
    // hạ ngưỡng thay vì tăng vòng là làm chốt canh yếu đi mà vẫn xanh.
    expect(applied).toBeGreaterThan(300);
    expect(bad.slice(0, 5), bad.slice(0, 5).join('\n')).toEqual([]);
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
    const box = algebraRenderer.elementBoxes!(EXPAND, 'e1')[0]!;
    const hits = algebraHitTest(EXPAND, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });

    expect(hits[0]).toBe('e1');
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
