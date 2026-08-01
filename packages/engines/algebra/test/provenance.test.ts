import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import {
  algebraCommands,
  algebraIncident,
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
  moveRefusal,
  movesAtElement,
  parse,
  parseElementId,
  readAlgebra,
  RULES,
  sameValue,
  unparse,
  violationOf,
  WITNESS_MAX,
  type AlgebraStep,
} from '../src/index.js';

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
