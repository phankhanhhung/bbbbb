import type { Scene } from '@combviz/schema';
import { evalReal, sameSolutionSet, sameValue } from './check.js';
import {
  Minter,
  children,
  depth,
  nodeAt,
  nodeCount,
  normalize,
  replaceAt,
  totalDegree,
  walk,
  withChildren,
  type Expr,
  type TermId,
} from './expr.js';
import { tryParse } from './parse.js';
import { ruleById } from './rules.js';
import { ALGEBRA_LIMITS, type AlgebraConfig } from './schema.js';
import { ROW, measure, toBox } from './typeset.js';

/**
 * Chạy chuỗi biến đổi.
 *
 * Tác giả khai `start` và `steps`; ở đây engine áp từng luật và **tính ra mọi dòng
 * còn lại**. Đó là toàn bộ đặt cược của engine, và nó y hệt `longdiv`: khi hình là
 * kết quả phép tính, sinh nó ở một chỗ là cách duy nhất để hình không lệch phép tính.
 */

export interface AlgebraRow {
  readonly id: string;
  readonly expr: Expr;
  /** Luật sinh ra dòng này; `null` ở dòng đầu. */
  readonly rule: string | null;
  readonly ruleLabel: string | null;
  readonly note: string | null;
  /** Nút cũ → nút mới. Chỉ ghi chỗ **đổi**; nút giữ nguyên id thì không có mặt. */
  readonly trace: ReadonlyMap<TermId, readonly TermId[]>;
  readonly born: readonly TermId[];
  /** Cây con được áp luật, để tô sáng chỗ đang biến đổi. */
  readonly at: string;
}

export interface AlgebraModel {
  readonly config: AlgebraConfig;
  readonly rows: readonly AlgebraRow[];
  readonly conditions: readonly string[];
  /** Bước nào không qua được phép kiểm §6 — **lỗi của engine**, không của tác giả. */
  readonly unsound: readonly string[];
  /**
   * Bước nào **không kiểm được** — khác hẳn "đã kiểm và đúng".
   *
   * `sameValue` bốc điểm ngẫu nhiên rồi bỏ những điểm mà biểu thức không xác định. Khi
   * bỏ hết thì nó vẫn trả `ok: true`, và trước khi có số mũ hữu tỉ thì chuyện ấy gần
   * như không xảy ra. Nay $x^{1/2}$ đòi cơ số $\ge 0$ trong khi bộ bốc điểm cố ý bốc
   * cả hai dấu (bỏ nửa âm là lỗ M47b), nên quá nửa số điểm bị bỏ và nhánh ấy thành
   * với tới được. Gom ra đây để nó **nói ra** thay vì trôi qua như một bước đã kiểm.
   */
  readonly unchecked: readonly string[];
  readonly refusal: string | null;
}

/** Thay mọi `var name` bằng `value` — dùng để thế ngược ẩn phụ khi kiểm. */
function replaceVar(e: Expr, name: string, value: Expr): Expr {
  if (e.k === 'var' && e.name === name) return value;
  const kids = children(e).map((c) => replaceVar(c, name, value));
  return kids.length === 0 ? e : withChildren(e, kids);
}

/**
 * `after` có dạng $x = r$: thay $r$ vào phương trình `before` xem có thoả không.
 *
 * Sai số nới rộng hơn chỗ khác vì $r$ thường chứa căn, và một đa thức bậc hai khuếch
 * đại sai số của căn lên bình phương.
 */
function rootSatisfies(before: Expr, after: Expr): { ok: boolean; message: string } {
  if (after.k !== 'rel' || after.lhs.k !== 'var') {
    return { ok: false, message: 'nhánh nghiệm phải có dạng x = …' };
  }
  if (before.k !== 'rel') return { ok: false, message: 'bước trước không phải phương trình' };

  const value = evalReal(after.rhs, new Map());
  if (value === null) return { ok: false, message: 'không tính được giá trị nghiệm' };
  const env = new Map([[after.lhs.name, value]]);
  const l = evalReal(before.lhs, env);
  const r = evalReal(before.rhs, env);
  if (l === null || r === null) return { ok: false, message: 'phương trình không xác định tại nghiệm' };

  const scale = Math.max(1, Math.abs(l), Math.abs(r), Math.abs(value) ** 2);
  return Math.abs(l - r) <= 1e-7 * scale
    ? { ok: true, message: `nghiệm ${value} thoả phương trình` }
    : { ok: false, message: `thay ${after.lhs.name} = ${value} vào thì ${l} ≠ ${r}` };
}

/**
 * Biểu thức này vẽ ra có vừa khung không — **trần đọc được thật sự**.
 *
 * Đo bằng chính bộ sắp chữ sẽ vẽ nó, nên câu trả lời không thể lệch với cái hiện ra.
 * `depth()` đứng ở chỗ này suốt từ M47 và đo nhầm vật: nó từ chối kết quả trục căn
 * thức (cao 1,66 ô, chữ 4,10) trong khi cho qua phân thức lồng ba tầng (cao 1,69 ô,
 * chữ 2,76).
 */
function tooBig(e: Expr): string | null {
  const m = measure(toBox(e));
  const h = (m.above + m.below) / ROW;
  const w = m.w / ROW;
  if (h > ALGEBRA_LIMITS.maxHeightCells) {
    return `cao ${h.toFixed(2)} ô, quá ${ALGEBRA_LIMITS.maxHeightCells}`;
  }
  // Player giữ tỉ lệ khung cố định (chốt canh G-10), nên công thức quá rộng **tràn**
  // chứ không co lại. Bề ngang phải có trần riêng, không suy ra được từ chiều cao.
  if (w > ALGEBRA_LIMITS.maxWidthCells) {
    return `rộng ${w.toFixed(2)} ô, quá ${ALGEBRA_LIMITS.maxWidthCells}`;
  }
  return null;
}

const idsOfExpr = (e: Expr): Set<string> => {
  const out = new Set<string>();
  walk(e, (n) => out.add(n.id));
  return out;
};

export function readAlgebra(scene: Scene): AlgebraModel {
  const config = (scene.config ?? {}) as AlgebraConfig;
  const m = new Minter();
  const empty: AlgebraModel = {
    config,
    rows: [],
    conditions: [],
    unsound: [],
    unchecked: [],
    refusal: null,
  };

  const parsed = tryParse(config.start ?? '', m);
  if ('error' in parsed) return { ...empty, refusal: `không đọc được biểu thức: ${parsed.error}` };

  let current = parsed.expr;
  if (nodeCount(current) > ALGEBRA_LIMITS.maxNodes) {
    return { ...empty, refusal: `biểu thức có ${nodeCount(current)} nút, quá ${ALGEBRA_LIMITS.maxNodes}` };
  }
  if (depth(current) > ALGEBRA_LIMITS.maxDepth) {
    return { ...empty, refusal: `cây sâu ${depth(current)} tầng, quá ${ALGEBRA_LIMITS.maxDepth}` };
  }
  const startTooBig = tooBig(current);
  if (startTooBig !== null) return { ...empty, refusal: `biểu thức vẽ ra ${startTooBig}` };

  const rows: AlgebraRow[] = [
    {
      id: 'row0',
      expr: current,
      rule: null,
      ruleLabel: null,
      note: null,
      trace: new Map(),
      born: [],
      at: '',
    },
  ];
  const conditions: string[] = [];
  const unsound: string[] = [];
  const unchecked: string[] = [];

  const steps = config.steps ?? [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i] as NonNullable<AlgebraConfig['steps']>[number];
    const rule = ruleById(step.rule);
    if (rule === null) return { ...empty, rows, refusal: `không có luật tên "${step.rule}"` };

    const target = nodeAt(current, step.at);
    if (target === null) {
      return { ...empty, rows, refusal: `đường dẫn "${step.at}" không trỏ vào nút nào` };
    }

    const before = idsOfExpr(current);
    const outcome = rule.run(m, target, step.arg);
    if ('refusal' in outcome) {
      return {
        ...empty,
        rows,
        refusal: `bước ${i + 1} (${rule.label} tại "${step.at || 'gốc'}"): ${outcome.refusal}`,
      };
    }

    const spliced = replaceAt(current, step.at, outcome.after);
    if (spliced === null) return { ...empty, rows, refusal: `không thay được cây con tại "${step.at}"` };
    // Ghép xong phải chuẩn hoá lại: luật trả về `add` mà chỗ thay vào nằm trong `add`
    // thì sinh ra `add` lồng `add`, và từ đó mọi đường dẫn của bước sau trỏ lệch.
    const next = normalize(spliced);

    // Phép kiểm: canh **engine**, không canh tác giả.
    //
    // Hai câu hỏi khác nhau, và trộn chúng là bỏ lọt. Biểu thức thì hỏi "có **đồng
    // nhất bằng nhau**không"; quan hệ thì hỏi "có **cùng tập nghiệm** không". Đặc tả
    // §6 nói nhóm ★ đúng "do cấu trúc" nên miễn kiểm — câu ấy sai, và nó che đúng
    // một lỗi: nhân bất đẳng thức với số âm mà không đổi chiều.
    const judge = (verdict: { ok: boolean; message: string; verified?: boolean }): void => {
      const where = `bước ${i + 1} (${rule.label})`;
      if (!verdict.ok) unsound.push(`${where}: ${verdict.message}`);
      else if (verdict.verified === false) unchecked.push(`${where}: ${verdict.message}`);
    };

    if (outcome.binding !== undefined) {
      // Đặt ẩn phụ: `after` viết bằng biến mới, nên so thẳng là so hai thứ khác biến.
      // Thế ngược lại rồi mới so — chính xác, và không cần đụng vào bộ kiểm.
      const back = replaceVar(outcome.after, outcome.binding.name, outcome.binding.expr);
      judge(sameValue(target, back, 20260731 + i));
    } else if (outcome.verify === 'root') {
      // Một nhánh nghiệm **hẹp hơn** tập nghiệm gốc, nên hỏi "cùng tập nghiệm" là hỏi
      // sai. Điều phải kiểm là nghiệm ấy **thoả** phương trình trước đó.
      judge(rootSatisfies(target, outcome.after));
    } else if (target.k === 'rel' && outcome.after.k === 'rel' && rule.id !== 'substitute') {
      const guard =
        outcome.condition === undefined || step.arg === undefined
          ? null
          : ((): Expr | null => {
              const g = tryParse(step.arg, m);
              return 'error' in g ? null : g.expr;
            })();
      judge(sameSolutionSet(target, outcome.after, guard, 20260731 + i));
    } else if (!rule.onRelation && target.k !== 'rel' && outcome.after.k !== 'rel') {
      judge(sameValue(target, outcome.after, 20260731 + i));
    }

    if (outcome.condition !== undefined && !conditions.includes(outcome.condition)) {
      conditions.push(outcome.condition);
    }

    const after = idsOfExpr(next);
    const trace = new Map<TermId, readonly TermId[]>();
    for (const [from, to] of outcome.dup ?? []) {
      trace.set(from, [...(trace.get(from) ?? [from]), to]);
    }
    for (const [from, to] of outcome.merged ?? []) {
      for (const one of from) trace.set(one, to === '' ? [] : [to]);
    }
    // Nút biến mất mà không luật nào khai ⇒ vẫn ghi là biến mất. Đây là chỗ
    // `derivation` phải nhờ tác giả bật cờ `cancelled`, và cờ bật tay thì bật sai được.
    for (const id of before) {
      if (!after.has(id) && !trace.has(id)) trace.set(id, []);
    }
    const born = [...after].filter((id) => !before.has(id));

    rows.push({
      id: `row${rows.length}`,
      expr: next,
      rule: rule.id,
      ruleLabel: rule.label,
      note: step.note ?? null,
      trace,
      born,
      at: step.at,
    });
    current = next;

    if (nodeCount(current) > ALGEBRA_LIMITS.maxNodes) {
      return { ...empty, rows, refusal: `sau bước ${i + 1} cây có quá ${ALGEBRA_LIMITS.maxNodes} nút` };
    }
    // `Number.isFinite` không phải cho chắc: $x^n$ và $x^{\sqrt 2}$ có `totalDegree`
    // bằng `Infinity` vì chúng **không phải hàm hữu tỉ**, nên "bậc" của chúng vô nghĩa.
    // Bỏ điều kiện này thì mọi số mũ ký hiệu bị từ chối vì "bậc vượt trần" — đúng cái
    // vừa mở ra. Cận Schwartz–Zippel vẫn được canh ở `check.ts`, chỗ nó thật sự dùng.
    const deg = totalDegree(current);
    if (Number.isFinite(deg) && deg > ALGEBRA_LIMITS.maxDegree) {
      return { ...empty, rows, refusal: `sau bước ${i + 1} bậc vượt ${ALGEBRA_LIMITS.maxDegree}` };
    }
    const big = tooBig(current);
    if (big !== null) return { ...empty, rows, refusal: `sau bước ${i + 1} hình ${big}` };
  }

  return { config, rows, conditions, unsound, unchecked, refusal: null };
}
