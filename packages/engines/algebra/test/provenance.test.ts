import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import {
  algebraCommands,
  algebraIncident,
  boxOf,
  ARG_RULE_PREDICATES,
  algebraLineage,
  drawnIds,
  explainIds,
  layout,
  ALGEBRA_LIMITS,
  allPaths,
  APPLY_RULE,
  applyRule,
  elementId,
  lineageOf,
  Minter,
  totalDegree,
  varsOf,
  moveRefusal,
  movesAtElement,
  parseElementId,
  parse,
  readAlgebra,
  ROW,
  RULES,
  solutionSetOf,
  contains,
  evalRelation,
  sameSolutionSet,
  sameValue,
  unparse,
  violationOf,
  WITNESS_MAX,
  type AlgebraStep,
  type Expr,
} from '../src/index.js';
import {
  fracText,
  impliesRelationSeries,
  sameRelationSeries,
  sameValueSeries,
  seriesOf,
} from '../src/series.js';
import { evalReal, hasBoundUninterpreted, sameValueReal } from '../src/check.js';
import { SERIES_TERMS } from '../src/series.js';
import { walk as walkExpr, same } from '../src/expr.js';
import { toPlain } from '../src/parse.js';

/**
 * Tiểu sử hạng tử (M63, AL-13).
 *
 * Chuỗi dùng suốt tệp này là `2*(x + 3) + 4*x`, phân phối rồi gom hạng tử — chọn nó vì
 * nó chứa **cả ba** hình dạng mà `trace` biết nói, trong ba dòng:
 *
 * | dòng | biểu thức | `trace` |
 * |---|---|---|
 * | 0 | $2(x+3) + 4x$ | — |
 * | 1 | $2x + 2\cdot3 + 4x$ | `e1→[e1,e11]` (**tách**), `e5→[]`, `e4→[]` (**mất**) |
 * | 2 | $6x + 2\cdot3$ | `e10→[e15]`, `e8→[e15]` (**nhập**), bốn nút mất |
 *
 * Và hình dạng thứ tư — nút **đi tiếp nguyên vẹn** — không có mặt trong bảng nào, vì
 * `trace` chỉ ghi chỗ đổi. Đó là hình dạng đông nhất và là chỗ phép nối phải tự suy.
 */
const scene = (start: string, steps: AlgebraStep[] = []): Scene =>
  ({ engine: 'algebra', config: { start, steps }, elements: [] }) as never;

const CHAIN = scene('2*(x + 3) + 4*x', [
  { rule: 'distribute', at: '0' },
  { rule: 'collect_like', at: '' },
]);

const model = readAlgebra(CHAIN);

const rowsOf = (l: ReadonlyMap<number, ReadonlySet<string>>): Record<number, string[]> =>
  Object.fromEntries([...l].map(([row, ids]) => [row, [...ids].sort()]));

describe('chuỗi dùng làm giá đỡ đúng như mô tả', () => {
  it('ba dòng, không từ chối, và `trace` có đủ ba hình dạng', () => {
    expect(model.refusal).toBeNull();
    expect(model.rows.map((r) => unparse(r.expr))).toEqual([
      '((2 * (x + 3)) + (4 * x))',
      '((2 * x) + (2 * 3) + (4 * x))',
      '((6 * x) + (2 * 3))',
    ]);
    // tách, mất, nhập — nếu một luật đổi cách ghi thì các test dưới mất nghĩa chứ
    // không đỏ, nên khoá lại ở đây.
    expect(model.rows[1]!.trace.get('e1')).toEqual(['e1', 'e11']);
    expect(model.rows[1]!.trace.get('e5')).toEqual([]);
    expect(model.rows[2]!.trace.get('e10')).toEqual(['e15']);
    expect(model.rows[2]!.trace.get('e8')).toEqual(['e15']);
  });
});

describe('phả hệ xuôi chiều', () => {
  it('nút **tách hai** thì phả hệ rẽ nhánh, rồi một nhánh chết', () => {
    // Hệ số $2$ của $2(x+3)$: phân phối nhân nó thành hai bản, rồi `collect_like`
    // nuốt bản đứng trước $x$ vào hệ số $6$ và để bản kia lại trong $2\cdot3$.
    expect(rowsOf(lineageOf(model, 0, 'e1'))).toEqual({
      0: ['e1'],
      1: ['e1', 'e11'],
      2: ['e11'],
    });
  });

  it('nút **không ai chạm tới** vẫn tự nối qua cả ba dòng', () => {
    // Đây là nhánh gánh việc: `e3` không xuất hiện trong bảng `trace` nào cả. Bỏ
    // nhánh "còn sống thì tự nối" thì phả hệ này còn đúng một dòng.
    expect(rowsOf(lineageOf(model, 0, 'e3'))).toEqual({ 0: ['e3'], 1: ['e3'], 2: ['e3'] });
  });

  it('nút **biến mất** thì dừng ở dòng cuối cùng nó còn sống', () => {
    // `e5` là cái ngoặc $(x+3)$: phân phối xoá nó. Dòng 1 **không có mặt** trong map,
    // chứ không phải có mặt với tập rỗng.
    expect(rowsOf(lineageOf(model, 0, 'e5'))).toEqual({ 0: ['e5'] });
  });
});

describe('phả hệ ngược chiều', () => {
  it('nút **nhập từ hai** thì đi lên ra hai tổ tiên', () => {
    // "Số $6$ này từ đâu ra?" — từ $2$ và $4$; và lên nữa thì $2$ ấy chưa tồn tại ở
    // dòng đầu (phân phối mới sinh ra nó), nên chỉ còn $4$.
    expect(rowsOf(lineageOf(model, 2, 'e15'))).toEqual({ 0: ['e8'], 1: ['e10', 'e8'], 2: ['e15'] });
  });

  it('chạm giữa chuỗi thì thấy **cả hai chiều**', () => {
    expect(rowsOf(lineageOf(model, 1, 'e11'))).toEqual({ 0: ['e1'], 1: ['e11'], 2: ['e11'] });
  });

  it('nút **mới sinh** không bịa ra tổ tiên', () => {
    expect(rowsOf(lineageOf(model, 2, 'e14'))).toEqual({ 2: ['e14'] });
  });

  it('nút tách hai đi lên đúng một tổ tiên, không nhân đôi', () => {
    // `e1` vừa là **khoá** của `trace` (bản dòng trên đã nhân đôi) vừa còn sống ở
    // dòng dưới với chính tên ấy — hai đường đều dẫn về `e1` ở dòng 0, và `Set` gộp
    // chúng. Xem chú thích trong `provenance.ts` về lớp canh đã gỡ ở đây.
    expect(rowsOf(lineageOf(model, 1, 'e1'))).toEqual({ 0: ['e1'], 1: ['e1'] });
  });
});

describe('từ chối', () => {
  it('id không phải hạng tử → `null`, không phải tập rỗng', () => {
    for (const id of ['row0', 'note1', 'nope', 'cell-0-0', '']) {
      expect(algebraLineage(CHAIN, id)).toBeNull();
    }
  });

  it('hạng tử **không có ở dòng ấy** → `null`', () => {
    // `e1` chết ở dòng 2, `e10` sinh ở dòng 1: hai chiều hụt.
    expect(algebraLineage(CHAIN, 'r2-e1')).toBeNull();
    expect(algebraLineage(CHAIN, 'r0-e10')).toBeNull();
  });

  it('scene engine từ chối → `null`, không nổ', () => {
    expect(algebraLineage(scene('x + 1', [{ rule: 'expand_square', at: '' }]), 'r0-e1')).toBeNull();
  });

  it('`parseElementId` là chiều ngược đúng của `elementId`', () => {
    expect(parseElementId('r12-e34')).toEqual({ row: 12, term: 'e34' });
    expect(parseElementId('row3')).toBeNull();
    expect(parseElementId('rx-e1')).toBeNull();
  });
});

describe('danh tính vẽ ra', () => {
  it('trả về id có mực, dùng thẳng được cho `highlight`', () => {
    expect([...algebraLineage(CHAIN, 'r0-e1')!].sort()).toEqual([
      'r0-e1',
      'r1-e1',
      'r1-e11',
      'r2-e11',
    ]);
  });

  it('phả hệ chạm **nhiều hơn một dòng** — đó là cả điểm của tính năng', () => {
    const rows = new Set([...algebraLineage(CHAIN, 'r2-e15')!].map((id) => id.slice(0, 2)));
    expect(rows.size).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Bằng chứng nhìn được (M64, AL-14).
 *
 * Hai câu hỏi khác nhau, và chúng cần hai loại dữ liệu khác nhau:
 *
 * - *"bước này có được kiểm không, bao nhiêu lần?"* → `row.evidence.witnesses`;
 * - *"thì sao nếu vi phạm điều kiện?"* → `Condition.guard` + `algebraIncident`.
 */
describe('witness — điểm đã bốc, giữ lại thay vì vứt đi', () => {
  it('bước qua được để lại **các điểm đồng thuận**, không chỉ một con số', () => {
    const row = model.rows[1]!;
    expect(row.evidence?.ok).toBe(true);
    expect(row.evidence?.verified).toBe(true);
    const w = row.evidence?.witnesses ?? [];
    expect(w.length).toBeGreaterThan(0);
    expect(w.every((x) => x.verdict === 'agree')).toBe(true);
    // Env **thật**, không phải một object rỗng cho có.
    expect(Object.keys(w[0]!.env)).toContain('x');
  });

  it('không quá `WITNESS_MAX`, **kể cả** khi phép kiểm chạy nhiều lần hơn', () => {
    // Chuỗi trên đi sân so **giá trị** (8 lượt), nên trần không bao giờ chạm tới ở đó —
    // bỏ hẳn trần đi mà test vẫn xanh. Phải hỏi ở sân so **tập nghiệm**: 24 lượt, và
    // đó là chỗ trần thật sự làm việc. (Bài học M48, lần thứ ba trong đợt này.)
    const rel = readAlgebra(
      scene('2 - 3*x < 8', [{ rule: 'add_both_sides', at: '', arg: '-2' }]),
    );
    const e = rel.rows[1]!.evidence!;
    expect(e.message).toMatch(/24 điểm/);
    expect(e.witnesses).toHaveLength(WITNESS_MAX);

    for (const row of [...model.rows, ...rel.rows]) {
      expect((row.evidence?.witnesses ?? []).length).toBeLessThanOrEqual(WITNESS_MAX);
    }
  });

  it('dòng đầu **không** có evidence: không bước nào sinh ra nó', () => {
    expect(model.rows[0]!.evidence).toBeNull();
  });

  it('bước **sai** để lại điểm phản chứng ở cuối, kèm hai giá trị lệch nhau', () => {
    // Một luật hỏng thật thì không dựng được từ nội dung, nên gọi thẳng bộ kiểm với
    // hai biểu thức khác nhau — đúng thứ mà một luật viết lỗi sẽ trả về.
    const bad = sameValue(parse('(x + 1)^2', new Minter()), parse('x^2 + 1', new Minter()));
    expect(bad.ok).toBe(false);
    const w = bad.witnesses ?? [];
    const last = w.at(-1)!;
    expect(last.verdict).toBe('refute');
    expect(w.slice(0, -1).every((x) => x.verdict === 'agree')).toBe(true);
    // **Số**, không chỉ chữ: hai vế thật sự khác nhau tại điểm ấy.
    const [va, vb] = last.values!;
    expect(va).not.toBe(vb);
  });

  it('bốc điểm là **tất định**: hai lần gọi cho cùng bộ witness', () => {
    const once = readAlgebra(CHAIN).rows[1]!.evidence?.witnesses;
    expect(JSON.stringify(once)).toBe(JSON.stringify(model.rows[1]!.evidence?.witnesses));
  });
});

describe('điều kiện hỏi được', () => {
  const cancel = scene('6*a / (3*a)', [{ rule: 'cancel_common', at: '', arg: 'a' }]);

  it('điều kiện mang theo `guard`, không chỉ mang chữ', () => {
    const m = readAlgebra(cancel);
    expect(m.conditions.map((c) => c.text)).toEqual(['a ≠ 0']);
    expect(m.conditions[0]!.guard).not.toBeNull();
  });

  it('chạm dòng đỏ → **điểm cụ thể** làm nó gãy', () => {
    expect(algebraIncident(cancel, 'note0')?.text).toBe('tại a = 0: a = 0 — chia cho không');
  });

  it('điều kiện có dấu thì nói rõ nó lệch về bên nào', () => {
    const abs = scene('abs(x - 2)', [{ rule: 'abs_case', at: '', arg: '+' }]);
    expect(algebraIncident(abs, 'note0')?.text).toBe('tại x = 0: x − 2 = −2 < 0');
  });

  it('điều kiện **không thể** vi phạm thì im — không bịa một điểm', () => {
    // $2^x > 0$ đúng ở mọi $x$ thực. Không tìm được điểm nào là câu trả lời **đúng**.
    const exp = scene('2^x = 8', [{ rule: 'log_both_sides', at: '' }]);
    expect(readAlgebra(exp).conditions.map((c) => c.text)).toEqual(['2^x > 0']);
    expect(algebraIncident(exp, 'note0')).toBeNull();
  });

  it('id không phải dòng đỏ, hoặc bài không có điều kiện → `null`', () => {
    expect(algebraIncident(cancel, 'r0-e1')).toBeNull();
    expect(algebraIncident(cancel, 'note1')).toBeNull();
    expect(algebraIncident(CHAIN, 'note0')).toBeNull();
  });

  it('điểm tìm được ưu tiên **số đẹp**: mẫu nhỏ trước, rồi tới trị nhỏ', () => {
    const found = violationOf([{ expr: parse('x - 3', new Minter()), sign: '>=0' }])!;
    expect(found.env.get('x')).toBe(0);
  });
});

describe('chấm chứng cứ chỉ sống ở chế độ giải thích', () => {
  it('mỗi dòng có evidence được **một** chấm, không phải một dải', () => {
    const box = layout(model);
    const dots = box.explain.evidence;
    expect(dots).toHaveLength(model.rows.filter((r) => r.evidence !== null).length);
    expect(new Set(dots.map((d) => d.id)).size).toBe(dots.length);
  });

  it('chấm nằm trong **máng** giữa công thức và nhãn luật, không đè ai', () => {
    const box = layout(model);
    for (const d of box.explain.evidence) {
      const line = box.lines[d.step]!;
      expect(d.cx).toBeGreaterThan(line.box.x + line.box.width);
      expect(d.cx).toBeLessThan(line.label!.x);
    }
  });

  it('danh tính chấm nằm trong `explainIds` — neo được, mà không vào `drawnIds`', () => {
    const box = layout(model);
    const ids = explainIds(box);
    const drawn = drawnIds(box);
    for (const d of box.explain.evidence) {
      expect(ids.has(d.id)).toBe(true);
      expect(drawn.has(d.id)).toBe(false);
    }
  });
});

/**
 * Sandbox đại số (M65, SBX-01) — trả món nợ của một chú thích.
 *
 * `index.ts` mô tả bảng nước đi đã lọc từ M46 như thể nó đã có; `movesAt` được viết
 * cùng câu ấy và **không có một call site nào** suốt sáu mốc.
 */
describe('nước đi tại một nút', () => {
  const start = scene('(x + 1)^2 + 3*x');

  it('`movesAt` hết mồ côi: có người gọi, và gọi bằng danh tính vẽ ra', () => {
    // Nút gốc của dòng cuối là một tổng.
    const moves = movesAtElement(start, elementId(0, readAlgebra(start).rows[0]!.expr.id));
    expect(moves.length).toBeGreaterThan(0);
  });

  it('bảng **đã lọc**: chỉ luật áp được tại đúng nút ấy', () => {
    const m = readAlgebra(start);
    const square = allPaths(m.rows[0]!.expr).get('0')!;
    const ids = movesAtElement(start, elementId(0, square.id)).map((x) => x.id);

    expect(ids).toContain('expand_square');
    // Nút này là $(x+1)^2$, không phải một phương trình bậc hai.
    expect(ids).not.toContain('quadratic_formula');
    expect(ids).not.toContain('add_both_sides');
  });

  it('luật cần tham số được đánh dấu, để giao diện mở ô nhập', () => {
    const m = readAlgebra(start);
    const moves = movesAtElement(start, elementId(0, m.rows[0]!.expr.id));
    const factor = moves.find((x) => x.id === 'factor');
    expect(factor?.needsArg).toBe(true);
    expect(moves.find((x) => x.id === 'complete_square')?.needsArg).toBe(false);
  });

  it('chạm dòng **không phải dòng cuối** thì không có nước đi nào', () => {
    // Chuỗi ba dòng: chỉ đáy mới đi tiếp được, vì áp luật vào giữa là viết lại lịch sử.
    const m = readAlgebra(CHAIN);
    expect(movesAtElement(CHAIN, elementId(0, m.rows[0]!.expr.id))).toEqual([]);
    expect(movesAtElement(CHAIN, elementId(2, m.rows[2]!.expr.id)).length).toBeGreaterThan(0);
  });

  it('id không phải hạng tử → rỗng, không nổ', () => {
    for (const id of ['row0', 'note0', 'cell-0-0', '']) {
      expect(movesAtElement(start, id)).toEqual([]);
    }
  });

  it('**mọi** luật cần tham số phải khai chỗ nó áp được', () => {
    // Luật không cần tham số thì thử thẳng là biết. Luật cần tham số thì không, nên
    // nó phải tự khai — hoặc bằng `accepts` (kiểu nút), hoặc bằng một vị từ trong
    // `ARG_RULE_PREDICATES`. Thiếu cả hai thì mặc định là **giấu**, và chốt canh này
    // là thứ duy nhất biến "giấu im lặng" thành "đỏ ngay".
    const missing = RULES.filter(
      (r) => r.needsArg === true && r.accepts === undefined && !(r.id in ARG_RULE_PREDICATES),
    ).map((r) => r.id);
    expect(missing).toEqual([]);
  });

  it('bảng nước đi không bày luật của một họ nút khác', () => {
    // Đo được ở M65 trước khi sửa: gốc của $(x+1)^2 + 3x$ bày ra 15 nút, 9 trong đó
    // là luật của hệ phương trình, của $\Sigma$, của trị tuyệt đối.
    const m = readAlgebra(start);
    const ids = movesAtElement(start, elementId(0, m.rows[0]!.expr.id)).map((x) => x.id);
    for (const alien of ['add_equations', 'scale_equation', 'sum_split', 'sum_shift', 'abs_case']) {
      expect(ids).not.toContain(alien);
    }
  });
});

describe('lệnh áp luật', () => {
  const start = scene('(x + 1)^2 + 3*x');

  it('áp được thì scene mới có thêm **đúng một** bước', () => {
    const next = applyRule(start, { at: '0', rule: 'expand_square' });
    expect('refusal' in next).toBe(false);
    const config = (next as Scene).config as { steps?: unknown[] };
    expect(config.steps).toHaveLength(1);
    expect(readAlgebra(next as Scene).rows).toHaveLength(2);
  });

  it('không áp được thì trả **nguyên văn** lời từ chối của engine', () => {
    const why = moveRefusal(start, { at: '1', rule: 'expand_square' });
    expect(why).toContain('luỹ thừa bậc 2');
  });

  it('tham số hỏng cũng ra nguyên văn, không ra một dấu ✗', () => {
    const why = moveRefusal(start, { at: '', rule: 'factor', arg: 'z' });
    expect(why).not.toBeNull();
    expect(why!.length).toBeGreaterThan(10);
  });

  it('lệnh và `moveRefusal` **không thể lệch nhau** — cùng một hàm thuần', () => {
    const params = { at: '1', rule: 'expand_square' };
    expect(moveRefusal(start, params)).not.toBeNull();
    expect(algebraCommands[APPLY_RULE]!.apply(start, params)).toBeNull();
  });

  it('trần `maxSteps` canh luôn đường vào mới — răng M55.2 làm việc ở đây', () => {
    // Chồng đủ bước cho tới khi model từ chối. Không phải một trần riêng của sandbox:
    // `applyRule` chỉ nối bước rồi để `readAlgebra` chạy lại, nên mọi hàng rào của
    // model canh sẵn đường này.
    let current: Scene = scene('x + 0');
    let refusal: string | null = null;
    for (let i = 0; i < ALGEBRA_LIMITS.maxSteps + 2; i += 1) {
      const out = applyRule(current, { at: '', rule: 'commute', arg: '0,1' });
      if ('refusal' in out) {
        refusal = out.refusal;
        break;
      }
      current = out;
    }
    expect(refusal).toContain(`${ALGEBRA_LIMITS.maxSteps}`);
  });
});

/**
 * Trục số (M67, AL-15) — tập nghiệm vẽ ra được.
 *
 * Chuyện kiểm ở đây là **vẽ đúng cái đã kiểm**: mỗi đoạn tô được đối chiếu với chính
 * `evalRelation` mà bộ kiểm dùng, chứ không với một bản sao logic. Hai bản không lệch
 * nhau được vì chỉ có một bản.
 */
describe('đọc tập nghiệm ra từ cấu trúc', () => {
  const setOf = (start: string, steps: AlgebraStep[] = []) =>
    solutionSetOf(readAlgebra(scene(start, steps)).rows.at(-1)!.expr);

  it('tuyển hai tia thì giữ **hai** mảnh', () => {
    const set = setOf('x^2 - 3*x + 2 > 0', [
      { rule: 'factor_quadratic', at: 'L' },
      { rule: 'interval_from_factors', at: '' },
    ])!;
    expect(set.name).toBe('x');
    expect(set.pieces).toEqual([
      { lo: null, hi: 1, loClosed: false, hiClosed: false },
      { lo: 2, hi: null, loClosed: false, hiClosed: false },
    ]);
  });

  it('hội hai nửa thì **giao** thành một khoảng', () => {
    const set = setOf('x^2 - 3*x + 2 < 0', [
      { rule: 'factor_quadratic', at: 'L' },
      { rule: 'interval_from_factors', at: '' },
    ])!;
    expect(set.pieces).toEqual([{ lo: 1, hi: 2, loClosed: false, hiClosed: false }]);
  });

  it('dấu **không ngặt** cho đầu mút đặc', () => {
    expect(setOf('x >= -2; x <= 2')!.pieces).toEqual([
      { lo: -2, hi: 2, loClosed: true, hiClosed: true },
    ]);
  });

  it('vế đảo cũng đọc được, và **lật dấu** đúng', () => {
    // `3 > x` là `x < 3`. Quên lật dấu ở đây là cái bẫy đã cắn `mul_both_sides` một lần.
    expect(setOf('3 > x')!.pieces).toEqual([{ lo: null, hi: 3, loClosed: false, hiClosed: false }]);
  });

  it('dạng **không chuẩn** thì im, không đoán', () => {
    // `abs_to_interval` cho ra $(x-1) > -3$: vế trái không phải biến trần. Dịch nó
    // thành $x > -2$ là *giải* một bước, và một bước giải người học không thấy là đúng
    // thứ §4 cấm.
    expect(setOf('abs(x - 1) < 3', [{ rule: 'abs_to_interval', at: '' }])).toBeNull();
    expect(setOf('x + y > 0')).toBeNull();
    expect(setOf('x^2 + 1')).toBeNull();
  });

  it('**vẽ đúng cái đã kiểm**: mọi điểm khớp với `evalRelation`', () => {
    for (const [start, steps] of [
      ['x^2 - 3*x + 2 > 0', [{ rule: 'factor_quadratic', at: 'L' }, { rule: 'interval_from_factors', at: '' }]],
      ['x^2 - 3*x + 2 < 0', [{ rule: 'factor_quadratic', at: 'L' }, { rule: 'interval_from_factors', at: '' }]],
      ['x >= -2; x <= 2', []],
      ['x > 1; x > 2', [{ rule: 'merge_intervals', at: '' }]],
      // Hợp hai tia **gõ thẳng ở `start`** — đường vào mới của M77. Hai ca đầu đã đi
      // tới một hệ `hoặc` qua `interval_from_factors`, nhưng đi tới và **bắt đầu từ**
      // là hai đường khác nhau, và đường thứ hai vừa mới mở.
      ['x < 1 hoặc x > 2', []],
      ['x <= -1 hoặc x >= 3', []],
    ] as [string, AlgebraStep[]][]) {
      const expr = readAlgebra(scene(start, steps)).rows.at(-1)!.expr;
      const set = solutionSetOf(expr)!;
      expect(set, start).not.toBeNull();

      let checked = 0;
      for (let t = -40; t <= 40; t += 1) {
        const x = t / 4;
        const truth = evalRelation(expr, new Map([[set.name, x]]));
        if (truth === null) continue;
        expect(contains(set, x), `${start} tại x = ${x}`).toBe(truth);
        checked += 1;
      }
      // Bài học M48: một vòng lặp không chạy lần nào là một chốt canh rỗng.
      expect(checked, start).toBeGreaterThan(50);
    }
  });
});

describe('hình học trục số', () => {
  const CHAIN_SET = scene('x^2 - 3*x + 2 > 0', [
    { rule: 'factor_quadratic', at: 'L' },
    { rule: 'interval_from_factors', at: '' },
  ]);
  const withFlag = (on: boolean): Scene =>
    ({
      ...CHAIN_SET,
      config: { ...(CHAIN_SET.config as object), show_sets: on },
    }) as Scene;

  it('cờ tắt thì **không có gì đổi** — kho cũ không đụng một byte', () => {
    expect(layout(readAlgebra(withFlag(false))).sets).toEqual([]);
    expect(drawnIds(layout(readAlgebra(withFlag(false)))).size).toBe(
      drawnIds(layout(readAlgebra(CHAIN_SET))).size,
    );
  });

  it('cờ bật thì trục nằm dưới **đúng dòng** của nó, gióng mép trái', () => {
    const box = layout(readAlgebra(withFlag(true)));
    expect(box.sets).toHaveLength(1);
    const set = box.sets[0]!;
    const line = box.lines[set.step]!;
    expect(set.x1).toBe(line.box.x);
    expect(set.y).toBeGreaterThan(line.box.y + line.box.height);
  });

  it('danh tính trục **neo được**: có trong `drawnIds` và `boxOf` tra ra', () => {
    const box = layout(readAlgebra(withFlag(true)));
    const id = box.sets[0]!.id;
    expect(drawnIds(box).has(id)).toBe(true);
    expect(boxOf(box, id)).not.toBeNull();
  });

  it('tia chạm mép trục, đoạn hữu hạn thì không', () => {
    const rays = layout(readAlgebra(withFlag(true))).sets[0]!;
    expect(rays.spans[0]!.x1).toBe(rays.x1);
    expect(rays.spans[1]!.x2).toBe(rays.x2);

    const inner = layout(
      readAlgebra({
        ...CHAIN_SET,
        config: { start: 'x >= -2; x <= 2', steps: [], show_sets: true },
      } as Scene),
    ).sets[0]!;
    expect(inner.spans[0]!.x1).toBeGreaterThan(inner.x1);
    expect(inner.spans[0]!.x2).toBeLessThan(inner.x2);
  });
});

describe('trục số và các trần', () => {
  const chain = (on: boolean): Scene =>
    ({
      engine: 'algebra',
      config: {
        start: 'x^2 - 3*x + 2 > 0',
        steps: [
          { rule: 'factor_quadratic', at: 'L' },
          { rule: 'interval_from_factors', at: '' },
        ],
        show_sets: on,
      },
      elements: [],
    }) as Scene;

  it('trục số **không** đụng trần `maxHeightCells`', () => {
    // `tooBig` đo **một biểu thức**, không đo cả trang: một chuỗi 5 dòng đã cao hơn 3 ô
    // từ lâu và vẫn hợp lệ. Trục số cộng vào chiều cao *trang*, nên nó nằm ngoài trần
    // ấy theo đúng thiết kế — khẳng định ra đây để lần sau ai đó đọc `maxHeightCells`
    // thì biết nó canh cái gì.
    expect(readAlgebra(chain(true)).refusal).toBeNull();
  });

  it('mỗi trục cộng chưa tới **0,6 ô** chiều cao — đo, không đoán', () => {
    const off = layout(readAlgebra(chain(false)));
    const on = layout(readAlgebra(chain(true)));
    const perStrip = (on.height - off.height) / ROW / on.sets.length;
    expect(on.sets.length).toBe(1);
    expect(perStrip).toBeGreaterThan(0.3);
    expect(perStrip).toBeLessThan(0.6);
  });

  it('trục **không** làm hình rộng thêm ở bài này', () => {
    // Trục gióng mép trái với dòng của nó và rộng $5{,}2$ cỡ chữ; dòng luật vốn đã đẩy
    // mép phải xa hơn thế. Nếu một ngày trục vượt qua, `right` đã tính nó rồi.
    expect(layout(readAlgebra(chain(true))).width).toBe(
      layout(readAlgebra(chain(false))).width,
    );
  });
});

/**
 * Sân kiểm thứ tư — chuỗi luỹ thừa hình thức (M68, AL-16).
 *
 * Ba sân cũ bốc điểm và trả lời "bằng nhau tại điểm này chứ?". Câu ấy **không có
 * nghĩa** với một tổng vô hạn. Sân này hỏi câu khác — "cùng hệ số chứ?" — và trả lời
 * **chính xác tuyệt đối**.
 */
describe('nguyên tử ∞', () => {
  const P = (src: string) => parse(src, new Minter());

  it('đọc, in ra, và **khứ hồi** đúng', () => {
    expect(toPlain(P('inf'))).toBe('∞');
    expect(unparse(P('sum(k, 0, inf, x^k)'))).toBe(unparse(P(unparse(P('sum(k, 0, inf, x^k)')))));
  });

  it('không phải một biến — `varsOf` không thấy nó', () => {
    expect([...varsOf(P('sum(k, 0, inf, x^k)'))]).toEqual(['x']);
  });

  it('**không có giá trị**: ba sân bốc điểm đều câm', () => {
    expect(evalReal(P('inf'), new Map())).toBeNull();
    // Và vì thế `totalDegree` là vô cùng, tức "không có bậc" chứ không phải "bậc lớn".
    expect(totalDegree(P('inf'))).toBe(Infinity);
  });
});

describe('so bằng hệ số', () => {
  const P = (src: string) => parse(src, new Minter());
  const cmp = (a: string, b: string) => sameValueSeries(P(a), P(b));

  it('$\\sum x^k$ **bằng** $1/(1-x)$, chính xác tuyệt đối', () => {
    const r = cmp('sum(k, 0, inf, x^k)', '1/(1 - x)');
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(true);
    expect(r.message).toContain('chính xác tuyệt đối');
  });

  it('...và **không** bằng $1/(1-2x)$ — nói rõ lệch ở hệ số nào', () => {
    const r = cmp('sum(k, 0, inf, x^k)', '1/(1 - 2*x)');
    expect(r.ok).toBe(false);
    // Con số, không chỉ một lời than: hệ số của $x^1$ là $1$ bên này, $2$ bên kia.
    expect(r.message).toBe('hệ số của x^1 lệch: 1 ≠ 2');
  });

  it('hệ số **hữu tỉ** không mất chính xác — đó là lý do dùng `bigint`', () => {
    const s = seriesOf(P('1/(2 - x)'), 'x', 4)!;
    expect(s.map(fracText)).toEqual(['1/2', '1/4', '1/8', '1/16', '1/32']);
  });

  it('mẫu có hệ số tự do $0$ thì **không phải** một chuỗi luỹ thừa', () => {
    expect(seriesOf(P('1/x'), 'x', 4)).toBeNull();
    expect(cmp('1/x', '1/x').verified).toBe(false);
  });

  it('hai biến thì **không đoán** biến chuỗi nào', () => {
    const r = cmp('sum(k, 0, inf, (x*y)^k)', '1/(1 - x*y)');
    expect(r.verified).toBe(false);
    expect(r.message).toContain('biến chuỗi duy nhất');
  });

  it('$\\exp$, căn, trị tuyệt đối → không khai được, và nói ra', () => {
    for (const src of ['exp(x)', 'sqrt(1 - x)', 'abs(x)']) {
      expect(seriesOf(P(src), 'x', 4), src).toBeNull();
    }
  });
});

describe('luật chuỗi hình học', () => {
  const run = (start: string, steps: AlgebraStep[]) => readAlgebra(scene(start, steps));

  it('gấp lại: $\\sum_{k\\ge0} x^k \\to 1/(1-x)$, kèm điều kiện hội tụ', () => {
    const m = run('sum(k, 0, inf, x^k)', [{ rule: 'geometric_series', at: '' }]);
    expect(m.refusal).toBeNull();
    expect(unparse(m.rows[1]!.expr)).toBe('(1 / (1 + ((-1) * x)))');
    expect(m.conditions.map((c) => c.text)).toEqual(['|x| < 1']);
    expect(m.unsound).toEqual([]);
    expect(m.unchecked).toEqual([]);
  });

  it('mở ra: $1/(1-x) \\to \\sum_{k\\ge0} x^k$ — **hai chiều**', () => {
    const m = run('1/(1 - x)', [{ rule: 'geometric_series', at: '' }]);
    expect(m.refusal).toBeNull();
    expect(m.rows[1]!.expr.k).toBe('big');
    expect(m.unsound).toEqual([]);
  });

  it('cố ý **hẹp**: từ chối mọi biến thể, có lời', () => {
    for (const [src, why] of [
      ['sum(k, 1, inf, x^k)', 'cận dưới phải là 0'],
      ['sum(k, 0, inf, x^(2*k))', 'số mũ phải là chính chỉ số'],
      ['sum(k, 0, 5, x^k)', 'cận trên phải là ∞'],
      ['2/(1 - x)', 'tử phải là 1'],
      // Ranh giới thật của lượt nới: bậc $\ge 2$ ở mẫu. $\frac{1}{1-x-x^2}$ cần phân
      // thức riêng phần trên $\mathbb{Q}(\sqrt5)$ — đó là viết một CAS, không phải nới
      // một luật.
      ['1/(1 - x - x^2)', 'mẫu phải có dạng 1 − a·x'],
      ['1/(1 - x^2)', 'mẫu phải có dạng 1 − a·x'],
      ['sum(k, 0, inf, (x*y)^k)', 'cơ số phải là một biến'],
    ] as [string, string][]) {
      expect(run(src, [{ rule: 'geometric_series', at: '' }]).refusal, src).toContain(why);
    }
  });

  /**
   * Hệ số dẫn $a$ (loạt bài 3/4).
   *
   * Bản M68 chỉ nhận biến trần, và chú thích của nó **hứa** một đường vòng qua
   * `sum_shift`/`sum_linear` cho các biến thể. Đường ấy không tồn tại — cả ba luật đều
   * từ chối $\sum(2x)^k$ — nên $[x^n]\frac{1}{1-2x} = 2^n$ không đi được, dù
   * `series.ts` lấy đúng chuỗi ấy làm ví dụ mở đầu cho việc nó phải dùng `bigint`.
   */
  describe('hệ số dẫn a', () => {
    it('hai chiều với $a$ hằng nguyên, và **điều kiện hội tụ theo $a$**', () => {
      const fwd = run('sum(k, 0, inf, (2*x)^k)', [{ rule: 'geometric_series', at: '' }]);
      expect(fwd.refusal).toBeNull();
      expect(toPlain(fwd.rows[1]!.expr)).toBe('1/(1 − 2x)');
      // Răng chính của lượt nới: $\sum(2x)^k$ hội tụ khi $|x| < 1/2$, **không** phải
      // $|x| < 1$. In câu chung là nới xong rồi nói dối ngay dòng vừa nới.
      expect(fwd.conditions.map((c) => c.text)).toEqual(['|x| < 1/2']);
      expect(fwd.unsound).toEqual([]);
      expect(fwd.unchecked).toEqual([]);

      const rev = run('1/(1 - 3*x)', [{ rule: 'geometric_series', at: '' }]);
      expect(rev.refusal).toBeNull();
      expect(rev.conditions.map((c) => c.text)).toEqual(['|x| < 1/3']);
      expect(rev.unsound).toEqual([]);

      // $|a| = 1$ thì $1/|a| = 1$, và không ai viết "|x| < 1/1".
      const minus = run('1/(1 + x)', [{ rule: 'geometric_series', at: '' }]);
      expect(minus.refusal).toBeNull();
      expect(minus.conditions.map((c) => c.text)).toEqual(['|x| < 1']);
      expect(minus.unsound).toEqual([]);
    });

    it('$a = 1$ dựng **đúng cây cũ** — 129 bài đang xuất bản không đổi một byte', () => {
      const fwd = run('sum(k, 0, inf, x^k)', [{ rule: 'geometric_series', at: '' }]);
      expect(unparse(fwd.rows[1]!.expr)).toBe('(1 / (1 + ((-1) * x)))');
      const rev = run('1/(1 - x)', [{ rule: 'geometric_series', at: '' }]);
      expect(unparse(rev.rows[1]!.expr)).toBe('sum(k, 0, inf, (x)^(k))');
    });

    it('$[x^n]\\frac{1}{(1-ax)^m} = a^n\\dbinom{n+m-1}{m-1}$, và bộ kiểm **có** kiểm', () => {
      const one = run('coeff(x, n, 1/(1 - 2*x))', [{ rule: 'coeff_repeated_geometric', at: '' }]);
      expect(toPlain(one.rows[1]!.expr)).toBe('2^n');
      expect(one.unsound).toEqual([]);
      // Nới luật mà sân chuỗi im thì là nới hỏng: dòng mới phải được **kiểm**, không
      // phải được cho qua.
      expect(one.unchecked).toEqual([]);

      const three = run('coeff(x, n, 1/(1 - 2*x)^3)', [
        { rule: 'coeff_repeated_geometric', at: '' },
      ]);
      expect(toPlain(three.rows[1]!.expr)).toBe('2^nC(n + 2,2)');
      expect(three.unsound).toEqual([]);
      expect(three.unchecked).toEqual([]);

      const neg = run('coeff(x, n, 1/(1 + x)^2)', [{ rule: 'coeff_repeated_geometric', at: '' }]);
      expect(toPlain(neg.rows[1]!.expr)).toBe('(−1)^nC(n + 1,1)');
      expect(neg.unsound).toEqual([]);
      expect(neg.unchecked).toEqual([]);
    });

    /**
     * Lộ ra ở đúng ca $a = -1$: `toPlain` in $(-1)^n$ thành `−1^n`, đọc thành
     * $-(1^n) = -1$ — **sai giá trị**, không phải xấu. `PLAIN_PREC` hỏi kiểu nút, mà
     * `int(−1)` có ưu tiên cao nhất nên không được ngoặc.
     *
     * `typeset.ts` (đường **vẽ**) đã đúng từ trước — nó hỏi dấu của hằng số, không hỏi
     * bảng ưu tiên. Nên hình thì đúng còn chữ thì sai, và chữ ấy là thứ đi vào
     * `alt_text`: người đọc bằng mắt thấy đúng, người dùng screen reader nghe sai.
     */
    it('cơ số âm có ngoặc trong `toPlain` — `−1^n` là một giá trị **khác**', () => {
      const P = (src: string) => parse(src, new Minter());
      expect(toPlain(P('(-1)^n'))).toBe('(−1)^n');
      expect(toPlain(P('(-2)^3'))).toBe('(−2)^3');
      // Không ngoặc thừa cho cơ số dương.
      expect(toPlain(P('2^n'))).toBe('2^n');
      expect(toPlain(P('x^n'))).toBe('x^n');
    });

    /**
     * `partial_fractions` (AL-20) — mảnh cuối nối truy hồi tuyến tính với hàm sinh.
     *
     * Trước nó $[x^n]\frac{1}{(1-x)(1-2x)}$ không đi được: `coeff_of_product` đòi một
     * `mul`, mà parser dựng ra một `div` có mẫu là tích. Tách xong thì `coeff_linear`
     * và `coeff_repeated_geometric` lo nốt.
     */
    describe('phân thức riêng phần', () => {
      it('tách mẫu hai thừa số, hệ số **hữu tỉ chính xác**', () => {
        const two = run('1/((1-x)*(1-2*x))', [{ rule: 'partial_fractions', at: '' }]);
        expect(two.refusal).toBeNull();
        expect(toPlain(two.rows[1]!.expr)).toBe('−1/(1 − x) + 2·1/(1 − 2x)');
        expect(two.unsound).toEqual([]);
        // Sân kiểm chuỗi **có** kiểm dòng này — tách mà bộ kiểm im thì là tách hỏng.
        expect(two.unchecked).toEqual([]);

        // Ba thừa số cho hệ số không nguyên, và `rat` mang chúng chính xác.
        const three = run('1/((1-x)*(1-2*x)*(1-3*x))', [
          { rule: 'partial_fractions', at: '' },
        ]);
        expect(toPlain(three.rows[1]!.expr)).toBe('1/2·1/(1 − x) − 4·1/(1 − 2x) + 9/2·1/(1 − 3x)');
        expect(three.unsound).toEqual([]);
        expect(three.unchecked).toEqual([]);
      });

      it('nối được tới tận công thức đóng: tháp Hà Nội ra $2^n - 1$', () => {
        const m = run('coeff(x, n, (x) * (1/((1-x)*(1-2*x))))', [
          { rule: 'coeff_shift', at: '' },
          { rule: 'partial_fractions', at: '@1/((1-x)*(1-2*x))' },
          { rule: 'coeff_linear', at: '' },
          { rule: 'coeff_linear', at: '0' },
          { rule: 'coeff_linear', at: '1' },
          { rule: 'coeff_repeated_geometric', at: '0.1' },
          { rule: 'coeff_repeated_geometric', at: '1.1' },
        ]);
        expect(m.refusal).toBeNull();
        expect(toPlain(m.rows[m.rows.length - 1]!.expr)).toBe('−1 + 2·2^(n − 1)');
        expect(m.unsound).toEqual([]);
        expect(m.unchecked).toEqual([]);
      });

    /**
     * Trần số học của phép so giá trị — răng cho **chính cái trần**.
     *
     * Bẻ răng lúc thêm `partial_fractions` lộ ra: nới trần từ $10^{-15}$ lên $10^{-3}$
     * mà **không test nào đỏ**. Tức là cả phép quét bảo toàn giá trị có thể đang chạy
     * với một trần lỏng tuỳ ý và không ai biết — nó vẫn xanh, chỉ là không còn bắt gì.
     *
     * Ba khẳng định, và chúng phải đi cùng nhau: bằng nhau thì nói bằng, khác nhau thì
     * nói khác, và khác **ít** thì vẫn phải nói khác.
     */
    describe('trần số học của `sameValueReal`', () => {
      const P = (src: string) => parse(src, new Minter());

      it('hai biểu thức bằng nhau ⇒ khớp', () => {
        expect(sameValueReal(P('(x + 1)^2'), P('x^2 + 2*x + 1'), 11, 24).ok).toBe(true);
      });

      it('khác nhau **rõ** ⇒ bắt được', () => {
        const out = sameValueReal(P('(x + 1)^2'), P('x^2 + 2*x + 2'), 11, 24);
        expect(out.ok).toBe(false);
        expect(out.verified).toBe(true);
      });

      it('khác nhau **ít** vẫn phải bắt — đây là chỗ trần lỏng sẽ lọt', () => {
        // Lệch $10^{-6}$ trên biểu thức không triệt tiêu: thang kết quả cỡ $1$, thang
        // trung gian cũng cỡ $1$, nên trần đúng phải là $10^{-9}$ và $10^{-6}$ lọt qua
        // được là dấu hiệu trần đã lỏng.
        // Parser chỉ nhận số nguyên, nên viết lệch bằng phân số: $1 + 10^{-6}$.
        const out = sameValueReal(P('x + 1'), P('x + 1000001/1000000'), 11, 24);
        expect(out.ok).toBe(false);
      });

      it('triệt tiêu lớn thì **không** bị gọi nhầm là sai', () => {
        // Cùng một giá trị, viết hai cách, đi qua $12!$ rồi trừ gần hết. Trần đo bằng
        // thang kết quả sẽ gọi đây là sai; đo bằng thang trung gian thì đúng.
        const a = P('((3 + fact(12)) - (fact(12) - y^2)) / (x^2 * (y^3 + 3))');
        const b = P('(3 + y^2) / (x^2 * (y^3 + 3))');
        expect(sameValueReal(a, b, 11, 24).ok).toBe(true);
      });
    });

      it('mẫu là tích **một** thừa số ⇒ từ chối — guard này phải với tới được', () => {
        // `1/(1-2x)` không tới được nhánh ấy: mẫu của nó không phải `mul`, nên lời từ
        // chối đến từ một guard **khác**. Bẻ răng lộ ra điều đó — bỏ `factors.length < 2`
        // đi mà không test nào đỏ. Nên dựng thẳng cây có `mul` một thừa số.
        const m = new Minter();
        const one: Expr = {
          k: 'div',
          num: { k: 'int', v: 1, id: m.next() },
          den: { k: 'mul', args: [parse('1 - 2*x', m)], id: m.next() },
          id: m.next(),
        } as Expr;
        const rule = RULES.find((r) => r.id === 'partial_fractions')!;
        const out = rule.run(m, one, undefined);
        expect('refusal' in out).toBe(true);
        expect((out as { refusal: string }).refusal).toContain('ít nhất hai thừa số');
      });

      it('từ chối có lời ở **đúng ba** chỗ ranh giới', () => {
        // Nghiệm lặp: công thức che không sinh ra hạng tử bậc cao, nên nói ra thay vì
        // trả một khai triển thiếu.
        expect(
          run('1/((1-x)*(1-x))', [{ rule: 'partial_fractions', at: '' }]).refusal,
        ).toContain('thừa số lặp');
        // Bậc 2 không tách được thành thừa số tuyến tính **hữu tỉ** — đây là chỗ
        // Fibonacci dừng lại, và nó là nợ có tên chứ không phải một lỗi.
        expect(
          run('1/(1 - x - x^2)', [{ rule: 'partial_fractions', at: '' }]).refusal,
        ).toContain('tích');
        // Một thừa số duy nhất thì chẳng có gì để tách.
        expect(
          run('1/(1-2*x)', [{ rule: 'partial_fractions', at: '' }]).refusal,
        ).toContain('tích');
      });
    });

    it('$a$ ký hiệu ⇒ từ chối; $a = 0$ ⇒ từ chối', () => {
      expect(
        run('coeff(x, n, 1/(1 - a*x))', [{ rule: 'coeff_repeated_geometric', at: '' }]).refusal,
      ).toContain('a nguyên ≠ 0');
      // $1 - 0\cdot x = 1$: không còn là chuỗi hình học, và $\frac11$ chẳng cần luật nào.
      expect(
        run('coeff(x, n, 1/(1 - 0*x))', [{ rule: 'coeff_repeated_geometric', at: '' }]).refusal,
      ).toContain('a nguyên ≠ 0');
    });
  });

  it('`sum_expand` **từ chối** vô hạn, và lời từ chối là nội dung', () => {
    const m = run('sum(k, 0, inf, x^k)', [{ rule: 'sum_expand', at: '' }]);
    expect(m.refusal).toContain('không viết hết được vô hạn hạng tử');
  });

  it('`sum_shift` giữ cận vô hạn: $\\infty + c = \\infty$', () => {
    const m = run('sum(k, 0, inf, x^k)', [{ rule: 'sum_shift', at: '', arg: '1' }]);
    expect(m.refusal).toBeNull();
    const after = m.rows[1]!.expr as Expr & { k: 'big' };
    expect(after.to.k).toBe('inf');
    // Và bước ấy **kiểm được** trên sân chuỗi, không rơi vào "chưa kiểm".
    expect(m.unchecked).toEqual([]);
  });
});

/**
 * Lượt rà toàn hệ trước freeze (G-C) — răng cho sáu lỗ đã vá trong engine đại số.
 *
 * Mỗi test dưới đây tái hiện đúng một đường đi thật của dữ liệu sai: tổng phân kỳ
 * được "kiểm xanh", id trùng trong cây vẽ ra, biến ràng buộc bị thế mất, một nước
 * đi hợp lệ bị kết tội oan. Chúng đứng cạnh nhau vì cùng một mẫu bệnh: chỗ nào
 * một lớp *tưởng* lớp kia đã lo, chỗ đó là lỗ.
 */
describe('lượt rà trước freeze — engine đại số', () => {
  const P = (src: string) => parse(src, new Minter());
  const run = (start: string, steps: AlgebraStep[]) => readAlgebra(scene(start, steps));
  const idsOf = (e: Expr): string[] => {
    const out: string[] = [];
    walkExpr(e, (n) => out.push(n.id));
    return out;
  };

  describe('bigSeries — chứng cứ cắt được thay cho lời hứa', () => {
    it('tổng phân kỳ **không** khai được thành chuỗi: thân không tăng bậc theo k', () => {
      // Trước fix: seriesOf trả [0, 13, 0, …] — tức 13x — cho một tổng không
      // phải chuỗi luỹ thừa, và sum_shift trên nó được kiểm XANH "chính xác
      // tuyệt đối". Một chốt canh xanh bịa còn tệ hơn không có chốt canh.
      expect(seriesOf(P('sum(k, 0, inf, x)'), 'x', 12)).toBeNull();

      const r = sameValueSeries(P('sum(k, 0, inf, x)'), P('13*x'));
      expect(r.verified).toBe(false);
    });

    it('thân có phần không phụ thuộc chỉ số cũng chết ngay trong cửa sổ', () => {
      expect(seriesOf(P('sum(k, 0, inf, x^k + 1)'), 'x', 12)).toBeNull();
    });

    /**
     * Hai cửa sổ là hai lớp chắn cho hai hướng chết khác nhau — ca `x` trần ở
     * trên bị CẢ HAI bắt, nên cặp test dưới đây mới là răng riêng của từng lớp:
     * bậc quay đầu *sớm* chỉ cửa sổ cộng thấy, quay đầu *muộn* chỉ cửa sổ đuôi.
     */
    it('bậc quay đầu SỚM — cửa sổ cộng bắt: $x^{(k-3)^2}$ có bậc 9, 4, 1 giảm dần', () => {
      expect(seriesOf(P('sum(k, 0, inf, x^((k - 3)^2))'), 'x', 12)).toBeNull();
    });

    it('bậc quay đầu MUỘN — cửa sổ đuôi bắt: $x^{k(24-k)}$ sạch suốt 13 hạng tử đầu', () => {
      expect(seriesOf(P('sum(k, 0, inf, x^(k * (24 - k)))'), 'x', 12)).toBeNull();
    });

    it('…nhưng $\\sum k\\,x^k$ vẫn tính được — minDeg tăng theo $k$ là đủ, không đòi đơn thức', () => {
      const s = seriesOf(P('sum(k, 0, inf, k * x^k)'), 'x', 4);
      expect(s?.map(fracText)).toEqual(['0', '1', '2', '3', '4']);
    });

    it('chuỗi hình học chuẩn vẫn qua nguyên vẹn sau khi siết', () => {
      const r = sameValueSeries(P('sum(k, 0, inf, x^k)'), P('1/(1 - x)'));
      expect(r.ok).toBe(true);
      expect(r.verified).toBe(true);
    });
  });

  describe('freshCopy — đệ quy vào MỌI kiểu nút', () => {
    it('add_both_sides "sqrt(2)": hai bản của √2 mang hai bộ id khác nhau', () => {
      // Trước fix: switch viết tay bỏ quên root/abs/fn/big/sys ở nhánh default —
      // nút `2` trong sqrt bên trái và "bản sao" bên phải là CÙNG một danh tính.
      const m = run('x = 3', [{ rule: 'add_both_sides', at: '', arg: 'sqrt(2)' }]);
      expect(m.refusal).toBeNull();
      const ids = idsOf(m.rows[1]!.expr);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('sum_expand: ba bản khai của thân mang ba bộ id khác nhau', () => {
      const m = run('sum(j, 1, 3, C(n, j))', [{ rule: 'sum_expand', at: '' }]);
      expect(m.refusal).toBeNull();
      const ids = idsOf(m.rows[1]!.expr);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('evaluate_at — phạm vi của biến ràng buộc', () => {
    it('không thế vào chỉ số bị Σ ràng buộc, và lời từ chối nói thật', () => {
      // Trước fix: "k := 3" trên sum(k,1,n,k) ra sum(k,1,n,3) — n(n+1)/2 thành
      // 3n — và hợp đồng instance kiểm XANH vì replaceVar của model mù phạm vi
      // theo đúng cùng một cách.
      const m = run('sum(k, 1, n, k)', [{ rule: 'evaluate_at', at: '', arg: 'k := 3' }]);
      expect(m.refusal).toContain('chỉ số bị ràng buộc');
    });

    it('thế vào **cận** thì được, và hợp đồng instance kiểm xanh', () => {
      const m = run('sum(k, 1, n, k)', [{ rule: 'evaluate_at', at: '', arg: 'n := 3' }]);
      expect(m.refusal).toBeNull();
      const after = m.rows[1]!.expr as Expr & { k: 'big' };
      expect(after.to).toMatchObject({ k: 'int', v: 3 });
      expect(m.unsound).toEqual([]);
    });

    it('tên vừa TỰ DO ngoài Σ vừa ràng buộc trong: thế đúng bản tự do, hợp đồng đồng ý', () => {
      // Test này cắn riêng `replaceVar` của model: luật (đã sửa) chỉ thay bản k
      // tự do, và nếu replaceVar còn mù phạm vi thì `want` thay cả bản ràng buộc
      // trong thân — hai phía lệch nhau và một bước ĐÚNG bị kết tội unsound.
      const m = run('k + sum(k, 1, n, k)', [{ rule: 'evaluate_at', at: '', arg: 'k := 3' }]);
      expect(m.refusal).toBeNull();
      expect(m.unsound).toEqual([]);
    });

    it('gọi thẳng vào GIỮA thân qua đường dẫn cũng bị model chặn', () => {
      // Luật không cứu được ca này: tại đường dẫn "2" nó chỉ thấy một `var k`
      // trần, cái Σ ràng buộc đứng ngoài cây con nó được đưa. Chỉ model biết
      // đường dẫn — nên model phải hỏi.
      const m = run('sum(k, 1, n, k)', [{ rule: 'evaluate_at', at: '2', arg: 'k := 3' }]);
      expect(m.refusal).toContain('ràng buộc');
    });
  });

  describe('substitute — đổi hệ quy chiếu, nói ra thay vì kết tội oan', () => {
    it('tại một cây con biểu thức: không còn unsound oan', () => {
      // Trước fix: nhánh loại trừ chỉ che sameSolutionSet, nên thế tại "L" rơi
      // vào sameValue và engine tự nhận "lỗi của engine" cho một nước đi hợp lệ.
      const m = run('x + 1 = 5', [{ rule: 'substitute', at: 'L', arg: 'x := 2*y' }]);
      expect(m.refusal).toBeNull();
      expect(m.unsound).toEqual([]);
      expect(m.unchecked).toEqual([]);
      expect(m.rows[1]!.evidence?.verified).toBe(false);
      expect(m.rows[1]!.evidence?.message).toContain('hệ quy chiếu');
    });

    it('tại cả quan hệ: evidence nói "không hợp đồng nào áp được", không im lặng null', () => {
      const m = run('x + 1 = 5', [{ rule: 'substitute', at: '', arg: 'x := 2*y' }]);
      expect(m.refusal).toBeNull();
      expect(m.unsound).toEqual([]);
      expect(m.rows[1]!.evidence).not.toBeNull();
      expect(m.rows[1]!.evidence?.verified).toBe(false);
    });
  });

  describe('substitute_from — một bản sao id riêng cho từng lần xuất hiện', () => {
    it('phương trình đích chứa ẩn hai lần: không id nào trùng trong dòng vẽ ra', () => {
      const m = run('x = 2*y + 1; x^2 + x = 5', [
        { rule: 'substitute_from', at: '', arg: '0,1' },
      ]);
      expect(m.refusal).toBeNull();
      const ids = idsOf(m.rows[1]!.expr);
      expect(new Set(ids).size).toBe(ids.length);
      // Và phả hệ được ghi: bản sao nối về nguồn qua trace, không mồ côi.
      expect(m.rows[1]!.trace.size).toBeGreaterThan(0);
    });
  });

  describe('sum_const — entry ∞ từng bị bỏ sót trong bảng', () => {
    it('từ chối cận vô hạn có lời, thay vì vẽ ra "(inf + 0 + 1)·c"', () => {
      const m = run('sum(k, 0, inf, y)', [{ rule: 'sum_const', at: '' }]);
      expect(m.refusal).toContain('vô hạn');
    });
  });
});

/**
 * M69.1 — cửa định tuyến ∞ cho **hai hợp đồng tập nghiệm**.
 *
 * Trước lượt này chỉ `sameValue` biết hỏi `hasInfinity`. Hai hợp đồng quan hệ đi
 * thẳng vào bốc điểm, `evalRelation` → `evalReal` trả `null` ở mọi nút `inf`, nên
 * `done`/`held` luôn bằng $0$ và **mọi** thao tác nhóm ★ trên một đẳng thức hàm
 * sinh mang vệt vàng "không tìm được điểm nào" vĩnh viễn — đúng thất bại M45, trên
 * đúng thể loại bài mà sân chuỗi sinh ra để phục vụ.
 */
describe('M69 — ∞ trên quan hệ: hết vàng vĩnh viễn', () => {
  const P = (src: string) => parse(src, new Minter());
  const GF_TRUE = 'sum(k, 0, inf, x^k) = 1/(1 - x)';
  const GF_FALSE = 'sum(k, 0, inf, x^k) = 1/(1 - 2*x)';
  const run = (start: string, steps: AlgebraStep[]) => readAlgebra(scene(start, steps));

  it('bốn thao tác ★ trên đẳng thức hàm sinh đều KIỂM ĐƯỢC, không còn vệt vàng', () => {
    const moves: AlgebraStep[] = [
      { rule: 'add_both_sides', at: '', arg: '1' },
      { rule: 'mul_both_sides', at: '', arg: '2' },
      { rule: 'geometric_series', at: 'L' },
      { rule: 'pow_both_sides', at: '', arg: '2' },
    ];
    for (const move of moves) {
      const m = run(GF_TRUE, [move]);
      expect(m.refusal, move.rule).toBeNull();
      expect(m.unchecked, move.rule).toEqual([]);
      expect(m.unsound, move.rule).toEqual([]);
      expect(m.rows[1]!.evidence?.verified, move.rule).toBe(true);
    }
  });

  it('chân lý đổi giữa hai dòng là **lỗi**, và nói rõ hệ số nào', () => {
    const broken = sameRelationSeries(P(GF_TRUE), P(GF_FALSE));
    expect(broken.ok).toBe(false);
    expect(broken.message).toContain('hệ số của x^1 lệch: 1 ≠ 2');

    // Chiều ngược cũng là lỗi: một bước biến câu sai thành câu đúng thì nó không
    // phải phép biến đổi tương đương, nó là một câu khác được viết ra.
    const backwards = sameRelationSeries(P(GF_FALSE), P(GF_TRUE));
    expect(backwards.ok).toBe(false);
    expect(backwards.message).toContain('không bảo toàn chân lý');
  });

  it('cả hai cùng sai thì vẫn xanh — nhưng lời nhắn nói thẳng ra là cả hai đều sai', () => {
    // Cùng hành vi với bản bốc điểm khi hai quan hệ cùng sai ở mọi điểm. "Xanh" ở
    // ca này dễ đọc nhầm thành "bước đã chứng minh điều gì đó", nên chữ phải chặn.
    const both = sameRelationSeries(P(GF_FALSE), P('sum(k, 0, inf, x^k) = 1/(1 - 3*x)'));
    expect(both.ok).toBe(true);
    expect(both.message).toContain('đều **sai**');
  });

  it('kéo theo: đúng → sai là lỗi; sai → đúng là **nới rộng**', () => {
    const bad = impliesRelationSeries(P(GF_TRUE), P(GF_FALSE));
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain('kéo theo sai');

    const wide = impliesRelationSeries(P(GF_FALSE), P(GF_TRUE));
    expect(wide.ok).toBe(true);
    expect(wide.widened).toBe(true);
  });

  it('cố ý HẸP: thứ tự và hai biến đều bị từ chối có lời', () => {
    // Chuỗi luỹ thừa hình thức **không có thứ tự** — "Σ < 1/(1−x)" là câu vô nghĩa
    // chứ không phải câu khó, nên từ chối là câu trả lời đúng.
    const ordered = sameRelationSeries(
      P('sum(k, 0, inf, x^k) < 1/(1 - x)'),
      P('sum(k, 0, inf, x^k) < 1/(1 - x)'),
    );
    expect(ordered.verified).toBe(false);
    expect(ordered.message).toContain('"=" hoặc "≠"');

    const twoVars = sameRelationSeries(
      P('sum(k, 0, inf, (x*y)^k) = 1/(1 - x*y)'),
      P('sum(k, 0, inf, (x*y)^k) = 1/(1 - x*y)'),
    );
    expect(twoVars.verified).toBe(false);
    expect(twoVars.message).toContain('biến chuỗi duy nhất');
  });
});

/**
 * M73 — **ký hiệu hàm không diễn giải** (AL-17).
 *
 * Bảng đo M70 xếp mục này lên đầu bằng một con số: phương trình hàm chiếm ~20% đề
 * đại số olympiad và engine phủ đúng $0$ — $f(x+y) = f(x)+f(y)$ trước đây **viết
 * ra cũng không được**, chứ chưa nói kiểm.
 */
describe('M73 — ký hiệu hàm không diễn giải', () => {
  const P = (src: string) => parse(src, new Minter());
  const run = (start: string, steps: AlgebraStep[]) => readAlgebra(scene(start, steps));

  describe('đọc và in', () => {
    it('`f(x + y)` đọc được, khứ hồi qua `unparse`', () => {
      expect(unparse(P('f(x + y) = f(x) + f(y)'))).toBe('(f((x + y)) = (f(x) + f(y)))');
      expect(toPlain(P('g(x, y)'))).toBe('g(x, y)');
    });

    it('đọc được vì engine **cấm nhân ngầm** — cùng cổ tức mà `C(n,k)` đã ăn', () => {
      // Một biến không bao giờ đứng sát `(`, nên `f(` chỉ có thể là một lời gọi.
      // Không cần khai trước tên nào là hàm; chỗ nó đứng đã nói.
      expect(unparse(P('f(x)'))).toBe('f(x)');
      expect(unparse(P('h(x) + h(y)'))).toBe('(h(x) + h(y))');
    });

    it('một số hạng dãy **không** gọi được như hàm: `a_1(x)` là lỗi cú pháp', () => {
      // Từ M71 `a_1` đọc thành một số hạng dãy, nên `(x)` đứng sau nó là thừa. Lời
      // từ chối đổi chỗ chứ không mất: trước là "phải là một chữ cái", nay là
      // "thừa ký tự" — cả hai đều chặn cùng một cái viết nhầm.
      expect(() => P('a_1(x)')).toThrow(/thừa ký tự/);
    });
  });

  describe('không sân nào tính được nó — và đó là điều kiện để kiểm được', () => {
    it('ba sân bốc điểm đều trả `null` tại nút `ufn`', () => {
      expect(evalReal(P('f(x)'), new Map([['x', 2]]))).toBeNull();
    });

    it('sân chuỗi cũng không khai được nó', () => {
      expect(seriesOf(P('f(x)'), 'x', 4)).toBeNull();
    });
  });

  /**
   * Phép trừu tượng hoá: mỗi lời gọi `f(t)` thành một nguyên tử. Nhờ nó **cả 73
   * luật** chạy được trên biểu thức có $f$ mà không luật nào phải biết về $f$.
   */
  describe('trừu tượng hoá: coi mỗi f(…) là một ẩn', () => {
    it('thao tác ★ trên phương trình hàm **kiểm được**, không còn vệt vàng', () => {
      const m = run('f(x + y) = f(x) + f(y)', [
        { rule: 'add_both_sides', at: '', arg: '-1*f(y)' },
      ]);
      expect(m.refusal).toBeNull();
      expect(m.unchecked).toEqual([]);
      expect(m.unsound).toEqual([]);
      expect(m.rows[1]!.evidence?.verified).toBe(true);
    });

    it('cùng đối số ⇒ **cùng** nguyên tử: `f(x) + f(x)` gộp được thành `2f(x)`', () => {
      const r = sameValue(P('f(x) + f(x)'), P('2*f(x)'));
      expect(r.ok).toBe(true);
      expect(r.verified).toBe(true);
    });

    it('khác đối số ⇒ **khác** nguyên tử — và đó là răng của phép trừu tượng hoá', () => {
      // Không có chỗ này thì mọi $f(\cdot)$ thành một ẩn duy nhất và bộ kiểm xanh
      // cho mọi thứ.
      expect(sameValue(P('f(x) + f(y)'), P('2*f(x)')).ok).toBe(false);
    });

    it('bước sai trên quan hệ bị bắt', () => {
      // Hỏi bằng **bất đẳng thức**, không bằng đẳng thức: hai đẳng thức khác nhau
      // đều sai ở hầu hết mọi điểm nên chúng "đồng ý" — đó là tính chất sẵn có của
      // `sameSolutionSet` (tập nghiệm có độ đo $0$), không phải chuyện phép trừu
      // tượng hoá làm hỏng. Chỗ bốc điểm có răng thật là chỗ có dấu.
      expect(sameSolutionSet(P('f(x) < 0'), P('f(x) > 0'), null, 7).ok).toBe(false);
    });
  });

  describe('`specialize` — nước đi cốt lõi của chuyên đề', () => {
    it('thay bởi một **biểu thức**, không chỉ một hằng', () => {
      const m = run('f(x + y) = f(x) + f(y)', [
        { rule: 'specialize', at: '', arg: 'y := -1*x' },
        { rule: 'collect_like', at: 'L.0' },
      ]);
      expect(m.refusal).toBeNull();
      expect(unparse(m.rows[2]!.expr)).toBe('(f(0) = (f(x) + f(((-1) * x))))');
      expect(m.unsound).toEqual([]);
      expect(m.unchecked).toEqual([]);
    });

    it('chỉ áp cho cả một phương trình, không cho một cây con', () => {
      // Thế vào một cây con là **đổi hệ quy chiếu** (M69), một chuyện khác hẳn.
      const m = run('f(x + y) = f(x) + f(y)', [{ rule: 'specialize', at: 'L', arg: 'y := 0' }]);
      expect(m.refusal).toContain('không cho một cây con');
    });

    it('biến không có trong phương trình thì từ chối có lời', () => {
      expect(run('f(x) = x', [{ rule: 'specialize', at: '', arg: 'z := 0' }]).refusal).toContain(
        'không thấy biến "z"',
      );
    });

    it('mỗi lần xuất hiện một bản sao riêng — không id nào trùng trong dòng vẽ ra', () => {
      const m = run('f(x + y) = f(x) + f(y)', [
        { rule: 'specialize', at: '', arg: 'y := 2*x' },
      ]);
      const ids: string[] = [];
      walkExpr(m.rows[1]!.expr, (n) => ids.push(n.id));
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it('chuỗi Cauchy đầy đủ: $f(0) = 0$, mọi bước đều được kiểm', () => {
    const m = run('f(x + y) = f(x) + f(y)', [
      { rule: 'specialize', at: '', arg: 'y := 0' },
      { rule: 'drop_unit', at: 'L.0' },
      { rule: 'add_both_sides', at: '', arg: '-1*f(x)' },
      { rule: 'collect_like', at: 'L' },
      { rule: 'collect_like', at: 'R' },
    ]);
    expect(m.refusal).toBeNull();
    expect(unparse(m.rows.at(-1)!.expr)).toBe('(0 = f(0))');
    expect(m.unsound).toEqual([]);
    expect(m.unchecked).toEqual([]);
  });
});

/**
 * Dãy số: $a_n$, tổng triệt tiêu dây chuyền, và cửa định tuyến thứ hai (M71, AL-18).
 *
 * Mục này không thêm một kiểu nút nào, cũng không thêm một sân bốc điểm nào — nó thêm
 * một *cách viết* cho kiểu nút M73 vừa dựng, và một cách đưa nó **về đất bằng** cho
 * đúng chỗ mà cách cũ mù.
 */
describe('M71 — dãy số', () => {
  const P = (src: string) => parse(src, new Minter());
  const run = (start: string, steps: AlgebraStep[]) => readAlgebra(scene(start, steps));

  describe('đọc và in', () => {
    it('`a_n`, `a_1`, `a_{k+1}` — chỉ số là một `Expr` đầy đủ', () => {
      expect(toPlain(P('a_n'))).toBe('a_n');
      expect(toPlain(P('a_1'))).toBe('a_1');
      expect(toPlain(P('a_{k + 1}'))).toBe('a_{k + 1}');
      expect(unparse(P('a_{k+1}'))).toBe('a_{(k + 1)}');
    });

    it('chỉ số không ngoặc đọc đúng **một** nguyên tử: `a_n+1` là $a_n + 1$', () => {
      // Đoán hộ ở đây thì cái sai đi suốt cả bài mà không ai báo — nên `a_{n+1}`
      // phải gõ ngoặc, và hai cây dưới đây khác nhau thật.
      expect(same(P('a_n + 1'), P('a_{n+1}'))).toBe(false);
      expect(unparse(P('a_n+1'))).toBe(unparse(P('a_n + 1')));
    });

    it('`_` trống là lỗi cú pháp, không phải một tên', () => {
      expect(() => P('a_')).toThrow(/cần một chỉ số/);
      expect(() => P('a_{n')).toThrow(/thiếu dấu "}"/);
    });

    it('$a_1$ và $f(1)$ **không** bằng nhau: cách viết là một phần danh tính', () => {
      // In ra hai thứ khác nhau trên hình, nên coi chúng bằng nhau là để một bước
      // đổi cách viết trôi qua mà không ai thấy.
      expect(same(P('a_1'), P('a(1)'))).toBe(false);
    });
  });

  /**
   * Cửa định tuyến. Trừu tượng hoá (M73) trả lời *"đúng với **mọi** $f$"* và mạnh hơn
   * — nhưng nó **mù** khi đối số dùng chỉ số bị ràng buộc, và mù kiểu tệ nhất: nó kết
   * tội thay vì im.
   */
  describe('chọn sân: trừu tượng hoá hay diễn giải', () => {
    it('nhận ra chỗ trừu tượng hoá mù', () => {
      expect(hasBoundUninterpreted(P('sum(k, 1, n, a_{k+1} - a_k)'))).toBe(true);
      // Chỉ số **tự do** thì trừu tượng hoá vẫn nhìn thấy — không đổi sân.
      expect(hasBoundUninterpreted(P('a_{n+1} - a_1'))).toBe(false);
      expect(hasBoundUninterpreted(P('f(x + y) = f(x) + f(y)'))).toBe(false);
      // Cận của Σ đọc **ngoài** phạm vi ràng buộc, nên $a_k$ ở cận là $k$ tự do.
      expect(hasBoundUninterpreted(P('sum(j, 1, a_k, j)'))).toBe(false);
    });

    it('đẳng thức triệt tiêu dây chuyền **được kiểm**, không bị kết tội oan', () => {
      const r = sameValue(P('sum(k, 1, n, a_{k+1} - a_k)'), P('a_{n+1} - a_1'));
      expect(r.ok).toBe(true);
      expect(r.verified).toBe(true);
    });

    it('bẻ răng: hai vế **sai** ở hai đầu đều bị bắt', () => {
      const lhs = 'sum(k, 1, n, a_{k+1} - a_k)';
      expect(sameValue(P(lhs), P('a_n - a_1')).ok).toBe(false);
      expect(sameValue(P(lhs), P('a_{n+1} - a_0')).ok).toBe(false);
      expect(sameValue(P('sum(k, 1, n, a_k)'), P('n * a_n')).ok).toBe(false);
    });

    it('bẻ răng: họ đa thức phải **đủ giàu** — một dãy hằng thì mọi hiệu đều là 0', () => {
      // Nếu bậc của họ thay thế tụt về 0 thì khẳng định dưới đây xanh, và cả sân
      // này thành một cỗ máy gật đầu.
      expect(sameValue(P('sum(k, 1, n, a_{k+1} - a_k)'), P('0')).ok).toBe(false);
    });

    it('ký hiệu **nhiều đối số** dưới dấu Σ: khai không kiểm được, không bịa', () => {
      // Một họ đa thức nhiều biến không có hạng tử chéo lại đúng $f(x+y) = f(x)+f(y)$
      // — tức nó gật đầu cho phương trình Cauchy như thể đó là đồng nhất thức.
      const r = sameValue(P('sum(k, 1, n, g(k, 1))'), P('n * g(1, 1)'));
      expect(r.ok).toBe(true);
      expect(r.verified).toBe(false);
      expect(r.message).toContain('nhiều đối số');
    });
  });

  describe('`sum_telescope`', () => {
    it('$\\sum (a_{k+1} - a_k) = a_{n+1} - a_1$', () => {
      const m = run('sum(k, 1, n, a_{k+1} - a_k)', [{ rule: 'sum_telescope', at: '' }]);
      expect(m.refusal).toBeNull();
      expect(unparse(m.rows[1]!.expr)).toBe(unparse(P('a_{n+1} - a_1')));
      expect(m.unsound).toEqual([]);
      expect(m.unchecked).toEqual([]);
    });

    it('thân **không** phải hiệu shift-một-bậc thì từ chối có lời', () => {
      expect(run('sum(k, 1, n, a_{k+2} - a_k)', [{ rule: 'sum_telescope', at: '' }]).refusal)
        .toContain('tiến một bậc');
      expect(run('sum(k, 1, n, a_{k+1} + a_k)', [{ rule: 'sum_telescope', at: '' }]).refusal)
        .toContain('hiệu hai hạng tử');
      expect(run('prod(k, 1, n, a_{k+1} - a_k)', [{ rule: 'sum_telescope', at: '' }]).refusal)
        .toContain('cần một tổng');
    });

    it('khoảng vô hạn: từ chối, và lời từ chối là nội dung', () => {
      expect(run('sum(k, 1, inf, a_{k+1} - a_k)', [{ rule: 'sum_telescope', at: '' }]).refusal)
        .toContain('số hạng cuối');
    });

    it('không phải chỉ dãy: thân nào cũng được, miễn khớp cấu trúc', () => {
      const m = run('sum(k, 1, n, 1/k - 1/(k + 1))', [{ rule: 'sum_telescope', at: '' }]);
      // Hiệu ở đây là $f(k) - f(k+1)$, tức **lùi** một bậc — luật đòi tiến, nên nó
      // từ chối, đúng như khai. Đảo dấu thì áp được.
      expect(m.refusal).toContain('tiến một bậc');
      const ok = run('sum(k, 1, n, 1/(k + 1) - 1/k)', [{ rule: 'sum_telescope', at: '' }]);
      expect(ok.refusal).toBeNull();
      expect(ok.unsound).toEqual([]);
    });
  });

  describe('`substitute_from` nhận một số hạng dãy làm ẩn', () => {
    it('$a_1 = 3$ ràng buộc đúng một giá trị, y hệt $x = 3$', () => {
      const m = run('a_1 = 3; a_{n+1} - a_1 = 5*n', [
        { rule: 'substitute_from', at: '', arg: '0,1' },
      ]);
      expect(m.refusal).toBeNull();
      // `−1·3` chứ không phải `−3`: phép thế **không** kiêm rút gọn, và mỗi phép rút
      // gọn là một bước có tên, hiện ra trên hình.
      expect(toPlain(m.rows[1]!.expr)).toBe('a_1 = 3; a_{n + 1} − 3 = 5n');
      expect(m.unsound).toEqual([]);
    });

    it('chỉ số **tự do** thì từ chối: $a_k = 3$ là câu về mọi $k$', () => {
      expect(
        run('a_k = 3; a_{n+1} - a_1 = 5*n', [{ rule: 'substitute_from', at: '', arg: '0,1' }])
          .refusal,
      ).toContain('mới thế được');
    });
  });

  it('chuỗi đầy đủ: từ $a_{k+1} - a_k = 5$ tới $a_{n+1} = 5n + 3$', () => {
    const m = run('a_1 = 3; sum(k, 1, n, a_{k+1} - a_k) = sum(k, 1, n, 5)', [
      { rule: 'sum_telescope', at: '1.L' },
      { rule: 'sum_const', at: '1.R' },
      { rule: 'collect_like', at: '1.R.0' },
      { rule: 'substitute_from', at: '', arg: '0,1' },
      { rule: 'add_both_sides', at: '1', arg: '3' },
      { rule: 'collect_like', at: '1.L' },
      { rule: 'commute', at: '1.R.0', arg: '0,1' },
    ]);
    expect(m.refusal).toBeNull();
    expect(unparse(m.rows.at(-1)!.expr)).toBe(unparse(P('a_1 = 3; a_{n+1} = 5*n + 3')));
    expect(m.unsound).toEqual([]);
    expect(m.unchecked).toEqual([]);
  });
});

/**
 * Hàm sinh tầng hai: trích hệ số và tích chập (M72, AL-19).
 *
 * M68 dựng được **chuỗi**; mục này dựng chỗ *đọc lấy một hệ số* — và nhờ đó mọi đồng
 * nhất thức hàm sinh với $n$ ký hiệu thành một câu hỏi mà bộ bốc điểm **nguyên** sẵn
 * có trả lời được.
 */
describe('M72 — trích hệ số và tích chập', () => {
  const P = (src: string) => parse(src, new Minter());
  const run = (start: string, steps: AlgebraStep[]) => readAlgebra(scene(start, steps));

  describe('đọc, in, và phạm vi', () => {
    it('khứ hồi qua `unparse`, in ra dạng $[x^n]F$', () => {
      expect(unparse(P('coeff(x, n, 1/(1 - x))'))).toBe('coeff(x, n, (1 / (1 + ((-1) * x))))');
      expect(toPlain(P('coeff(x, n, 1/(1 - x)^3)'))).toBe('[x^n] 1/(1 − x)^3');
    });

    it('bậc **bọc ngoặc** khi nó không phải nguyên tử', () => {
      // `[x^n − k]` đọc thành "$[x^n]$ trừ $k$", một biểu thức khác hẳn.
      expect(toPlain(P('coeff(x, n - k, 1/(1 - x))'))).toBe('[x^(n − k)] 1/(1 − x)');
    });

    it('biến chuỗi **bị ràng buộc**; bậc thì không', () => {
      // Quên chỗ này thì bộ kiểm bốc một giá trị cho $x$ và mọi thứ sai im lặng.
      expect([...varsOf(P('coeff(x, n, 1/(1 - x))'))]).toEqual(['n']);
    });

    it('trùng tên với một dấu bao ngoài: từ chối ngay ở tầng ngữ pháp', () => {
      expect(() => P('sum(x, 0, 3, coeff(x, 1, 1/(1 - x)))')).toThrow(/đã bị một dấu bao ngoài/);
    });

    it('dấu nhân hiện ra đúng chỗ thiếu nó thì đọc sai', () => {
      // `x^21/(1 − x)` đọc thành "x mũ hai mươi mốt" — hai chữ số dính vào nhau.
      expect(toPlain(P('coeff(x, n, x^2 * (1/(1 - x)))'))).toBe('[x^n] x^2·1/(1 − x)');
      // Còn chỗ không thiếu thì vẫn kề nhau, như người ta viết tay.
      expect(toPlain(P('2*x'))).toBe('2x');
    });
  });

  describe('nút biết tự tính — và đó là cả AL-19', () => {
    it('bậc hằng: khai chuỗi rồi đọc lấy', () => {
      expect(evalReal(P('coeff(x, 3, 1/(1 - x))'), new Map())).toBe(1);
      // $\dbinom{6}{2} = 15$ — số cách chia 4 kẹo cho 3 đứa.
      expect(evalReal(P('coeff(x, 4, 1/(1 - x)^3)'), new Map())).toBe(15);
    });

    it('bậc chưa bốc, bậc âm, bậc không nguyên: `null`, không đoán', () => {
      expect(evalReal(P('coeff(x, n, 1/(1 - x))'), new Map())).toBeNull();
      expect(evalReal(P('coeff(x, 0 - 1, 1/(1 - x))'), new Map())).toBeNull();
      expect(evalReal(P('coeff(x, 1/2, 1/(1 - x))'), new Map())).toBeNull();
    });

    it('chuỗi không khai được thì `null` — không có chỗ nào bịa', () => {
      // $\frac1x$ không phải chuỗi luỹ thừa; $f$ thì không có gì để khai.
      expect(evalReal(P('coeff(x, 2, 1/x)'), new Map())).toBeNull();
      expect(evalReal(P('coeff(x, 2, f(x))'), new Map())).toBeNull();
    });

    it('biến tự do khác được **đóng băng** vào cây trước khi khai chuỗi', () => {
      // Nhờ đó nhị thức Newton kiểm được: $[x^k](1+x)^n = \dbinom{n}{k}$.
      const r = sameValue(P('coeff(x, k, (1 + x)^n)'), P('C(n, k)'));
      expect(r.ok).toBe(true);
      expect(r.verified).toBe(true);
    });

    it('bẻ răng: hai vế lệch một bậc thì bị bắt', () => {
      expect(sameValue(P('coeff(x, n, 1/(1 - x)^3)'), P('C(n + 2, 2)')).ok).toBe(true);
      expect(sameValue(P('coeff(x, n, 1/(1 - x)^3)'), P('C(n + 3, 2)')).ok).toBe(false);
      expect(sameValue(P('coeff(x, k, (1 + x)^n)'), P('C(n, k + 1)')).ok).toBe(false);
    });
  });

  describe('bốn luật', () => {
    it('tích chập Cauchy: $[x^n](FG) = \\sum_i ([x^i]F)([x^{n-i}]G)$', () => {
      const m = run('coeff(x, n, (1/(1 - x)) * (1/(1 - x)^2))', [
        { rule: 'coeff_of_product', at: '' },
      ]);
      expect(m.refusal).toBeNull();
      expect(toPlain(m.rows[1]!.expr)).toBe(
        'Σ(k=0..n) ([x^k] 1/(1 − x))([x^(n − k)] 1/(1 − x)^2)',
      );
      expect(m.unsound).toEqual([]);
      expect(m.unchecked).toEqual([]);
    });

    it('chỉ số chạy khác **cả** biến chuỗi', () => {
      // `varsOf` không kể biến bị ràng buộc, nên dùng lại đúng tên ấy là bắt một
      // biến đang bị che — bộ kiểm sẽ không thấy gì và cả dòng sai im lặng.
      const m = run('coeff(k, n, (1/(1 - k)) * (1/(1 - k)^2))', [
        { rule: 'coeff_of_product', at: '' },
      ]);
      expect(m.refusal).toBeNull();
      expect(toPlain(m.rows[1]!.expr)).toContain('Σ(i=0..n)');
      expect(m.unsound).toEqual([]);
    });

    it('tuyến tính: tổng tách ra, hằng rời khỏi ngoặc vuông', () => {
      const sum = run('coeff(x, n, 1/(1 - x) + 1/(1 - x)^2)', [{ rule: 'coeff_linear', at: '' }]);
      expect(sum.refusal).toBeNull();
      expect(sum.unsound).toEqual([]);
      const konst = run('coeff(x, n, 5 * (1/(1 - x)))', [{ rule: 'coeff_linear', at: '' }]);
      expect(toPlain(konst.rows[1]!.expr)).toBe('5([x^n] 1/(1 − x))');
      expect(konst.unsound).toEqual([]);
    });

    it('dịch bậc, và điều kiện $n \\ge d$ **là một `guard`**, không chỉ là chữ', () => {
      const m = run('coeff(x, n, x^2 * (1/(1 - x)))', [{ rule: 'coeff_shift', at: '' }]);
      expect(m.refusal).toBeNull();
      expect(toPlain(m.rows[1]!.expr)).toBe('[x^(n − 2)] 1/(1 − x)');
      expect(m.conditions.map((c) => c.text)).toEqual(['n ≥ 2']);
      // `guard` thật, không chỉ là chữ: nó có cây kèm theo để bộ kiểm bỏ đúng những
      // điểm $n < 2$ thay vì lặng lẽ trượt qua chúng.
      expect(m.conditions[0]!.guard).not.toBeNull();
      expect(m.unsound).toEqual([]);
    });

    it('chia kẹo: $[x^n]\\frac{1}{(1-x)^m} = \\dbinom{n+m-1}{m-1}$', () => {
      const m = run('coeff(x, n, 1/(1 - x)^3)', [{ rule: 'coeff_repeated_geometric', at: '' }]);
      expect(m.refusal).toBeNull();
      expect(toPlain(m.rows[1]!.expr)).toBe('C(n + 2,2)');
      expect(m.unsound).toEqual([]);
      expect(m.unchecked).toEqual([]);
      // $m = 1$: $\binom{n}{0}$ **là** hằng số $1$, nên in nó ra là để lại trên hình
      // một thứ người đọc phải tự biết mà bỏ đi.
      expect(
        toPlain(
          run('coeff(x, n, 1/(1 - x))', [{ rule: 'coeff_repeated_geometric', at: '' }]).rows[1]!
            .expr,
        ),
      ).toBe('1');
    });

    it('mỗi luật từ chối có lời khi hình dạng không khớp', () => {
      expect(run('coeff(x, n, 1/(1 - x))', [{ rule: 'coeff_of_product', at: '' }]).refusal).toContain(
        'một tích',
      );
      expect(run('coeff(x, n, 1/(1 - x))', [{ rule: 'coeff_shift', at: '' }]).refusal).toContain(
        'một tích',
      );
      // $m$ ký hiệu: không khai chuỗi được ở bậc nào, nên từ chối thay vì dựng một
      // dòng mà bộ kiểm chỉ biết nói "chưa kiểm được".
      expect(
        run('coeff(x, n, 1/(1 - x)^m)', [{ rule: 'coeff_repeated_geometric', at: '' }]).refusal,
      ).toContain('m nguyên ≥ 1');
      expect(run('1 + x', [{ rule: 'coeff_linear', at: '' }]).refusal).toContain('trích hệ số');
    });
  });
});

/**
 * **Độ sâu của sân chuỗi là một chốt canh, và nó từng không có răng nào.**
 *
 * Lượt bẻ răng hàng loạt lộ ra: đặt `SERIES_TERMS = 1` — tức chỉ so hệ số bậc $0$ và
 * $1$ — mà **toàn bộ 3792 test vẫn xanh**. Sân kiểm thứ tư là thứ gác cho mọi đồng nhất
 * thức hàm sinh trong kho, và độ sâu của nó có thể bị hạ xuống gần như không mà không
 * ai biết. Cổng vẫn xanh, chỉ là không còn gác gì.
 *
 * Ba khẳng định dưới đây pin đúng ba chuyện khác nhau, và chúng phải đi cùng nhau:
 * lệch **sâu** thì bắt được, lệch **nông** thì tất nhiên bắt được, và chỗ sân này
 * **thôi không nhìn nữa** phải nói ra thành một con số chứ không phải một cảm giác.
 */
describe('SERIES_TERMS — độ sâu của sân kiểm chuỗi', () => {
  const P = (src: string) => parse(src, new Minter());

  it('lệch ở bậc **ngay dưới trần** vẫn bắt được', () => {
    // $\frac{1}{1-x}$ và nó cộng $x^{11}$: khớp từng hệ số tới bậc $10$, lệch ở $11$.
    // Với `SERIES_TERMS = 12` thì bắt; hạ trần xuống dưới $11$ thì lọt.
    const out = sameValueSeries(P('1/(1 - x)'), P('1/(1 - x) + x^11'));
    expect(out.ok).toBe(false);
    expect(out.verified).toBe(true);
    expect(out.message).toContain('11');
  });

  it('lệch nông thì bắt, và **nói rõ hệ số nào**', () => {
    const out = sameValueSeries(P('1/(1 - x)'), P('1/(1 - 2*x)'));
    expect(out.ok).toBe(false);
    // Chỗ sân này dạy được nhiều nhất: nói hệ số của $x^1$ là $2$ chứ không phải $1$.
    expect(out.message).toMatch(/1/);
  });

  it('bằng nhau thật thì khớp, không báo động giả', () => {
    expect(sameValueSeries(P('1/(1 - x)'), P('1/(1 - x)')).ok).toBe(true);
    expect(sameValueSeries(P('1/((1 - x)*(1 - x))'), P('1/(1 - x)^2')).ok).toBe(true);
  });

  /**
   * **Trần là trần, và nó phải nói ra.**
   *
   * Hai chuỗi khớp tới bậc $12$ rồi lệch ở bậc $13$ thì sân này nói "khớp" — đúng theo
   * hợp đồng của nó ("chính xác tuyệt đối **tới bậc $N$**"), nhưng đó là một giới hạn
   * thật, và một giới hạn không viết thành test là một giới hạn sẽ bị quên. Test này
   * **khoá con số $12$**: đổi nó thì đây đỏ, và người đổi buộc phải nghĩ.
   */
  it('không nhìn quá bậc `SERIES_TERMS` — giới hạn có thật, viết ra chứ không giấu', () => {
    expect(SERIES_TERMS).toBe(12);
    const beyond = sameValueSeries(P('1/(1 - x)'), P('1/(1 - x) + x^13'));
    expect(beyond.ok).toBe(true);
  });
});
