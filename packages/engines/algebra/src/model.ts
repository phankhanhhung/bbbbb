import type { Scene } from '@combviz/schema';
import { sameValue } from './check.js';
import {
  Minter,
  depth,
  nodeAt,
  nodeCount,
  normalize,
  replaceAt,
  totalDegree,
  walk,
  type Expr,
  type TermId,
} from './expr.js';
import { tryParse } from './parse.js';
import { ruleById } from './rules.js';
import { ALGEBRA_LIMITS, type AlgebraConfig } from './schema.js';

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
  readonly refusal: string | null;
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

    // Phép kiểm §6: canh **engine**, không canh tác giả. Nhóm ★ đổi quan hệ chứ
    // không đổi một biểu thức, nên nó bảo toàn tập nghiệm bằng cấu trúc, không bằng
    // đồng nhất thức — kiểm bằng điểm ngẫu nhiên ở đó là hỏi sai câu hỏi.
    if (!rule.onRelation && target.k !== 'rel' && outcome.after.k !== 'rel') {
      const verdict = sameValue(target, outcome.after, 20260731 + i);
      if (!verdict.ok) unsound.push(`bước ${i + 1} (${rule.label}): ${verdict.message}`);
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
    if (totalDegree(current) > ALGEBRA_LIMITS.maxDegree) {
      return { ...empty, rows, refusal: `sau bước ${i + 1} bậc vượt ${ALGEBRA_LIMITS.maxDegree}` };
    }
  }

  return { config, rows, conditions, unsound, refusal: null };
}
