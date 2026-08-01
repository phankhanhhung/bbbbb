import type { Scene } from '@combviz/schema';
import { evalReal, impliesSolutionSet, sameSolutionSet, sameValue } from './check.js';
import {
  Minter,
  allPaths,
  children,
  depth,
  nodeAt,
  nodeCount,
  normalize,
  replaceAt,
  same,
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
  /**
   * Các **vai** trong hằng đẳng thức của bước này — nhóm $i$ một màu.
   *
   * `TermId` bền qua các dòng, nên cùng một danh sách id tô được **cả** dòng nguồn lẫn
   * dòng kết quả: mắt nối hai vế của $(a+b)^2 = a^2+2ab+b^2$ mà không cần mũi tên nào.
   */
  readonly roles: ReadonlyArray<readonly TermId[]>;
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
  /**
   * Bước nào **nới rộng** tập nghiệm ⇒ có thể sinh nghiệm ngoại lai.
   *
   * Không phải lỗi: bình phương hai vế là nước đi hợp lệ và thường xuyên. Nhưng nó để
   * lại một **món nợ** — phải thử lại nghiệm — và engine không tự trả được, vì bước
   * thử lại thường nằm ở một step khác trong cây lời giải mà một scene không nhìn thấy.
   * Nên nó ghi món nợ **ra hình**, chữ đỏ vĩnh viễn cho người đọc. Cùng lý lẽ AL-08
   * (M47c): chốt canh mạnh nhất không phải cảnh báo cho người soạn.
   */
  readonly extraneous: readonly string[];
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
  // Player **co** hình cho vừa pane và không bao giờ giãn (`render/scale.ts`), nên một
  // dòng quá rộng không tràn ra ngoài — nó kéo *mọi* step của cùng bài nhỏ lại, vì hệ số
  // co dùng chung. Bề ngang phải có trần riêng, không suy ra được từ chiều cao.
  //
  // (Chú thích cũ ở đây nói "tràn chứ không co lại" — sai, và sai theo hướng làm người
  //  đọc tưởng trần này canh chuyện khác. `scale.ts` là nguồn sự thật.)
  if (w > ALGEBRA_LIMITS.maxWidthCells) {
    return `rộng ${w.toFixed(2)} ô, quá ${ALGEBRA_LIMITS.maxWidthCells}`;
  }
  return null;
}

/**
 * Nút này là một **mệnh đề** — quan hệ hay hệ quan hệ.
 *
 * Có vì hai nhánh cuối của phép kiểm hỏi `k === 'rel'`, và M60 sinh ra bước đầu tiên đi
 * từ `rel` sang `sys` ($|x| > 2$ thành một tuyển). Không sửa thì bước ấy **không rơi vào
 * nhánh kiểm nào cả**: `unsound` rỗng vì chưa ai hỏi, chứ không vì đã hỏi và đúng. Đó là
 * đúng loại lỗ mà M47c gọi tên — chỗ miễn kiểm là chỗ lỗ hổng nằm — và nó chỉ lộ ra khi
 * đi tìm *nhánh nào đã chạy*, không lộ ở con số 0.
 */
const isPredicate = (e: Expr): boolean => e.k === 'rel' || e.k === 'sys';

const idsOfExpr = (e: Expr): Set<string> => {
  const out = new Set<string>();
  walk(e, (n) => out.add(n.id));
  return out;
};

/**
 * Giải `step.at` thành một đường dẫn — và cho phép **trỏ bằng nội dung**.
 *
 * `at: "@abs(x - 2)"` nghĩa là "cây con nào khớp mẫu này". Có vì đường dẫn theo vị trí
 * **dịch chỗ** khi một luật trả về `add` vào trong một `add`: đo được ở M55, chạy
 * `abs_case` tại `L.0` của $|x-1|+|x-2|=3$ thì dấu $|\cdot|$ thứ hai nhảy từ `L.1` sang
 * `L.2`, vì `x + (-1)` bị làm phẳng vào tổng cha và đẩy mọi chỉ số sau nó lùi một nấc.
 * Bất biến làm phẳng là **cố ý** (bỏ nó là mở lại lỗi M47 #8), nên chỗ chữa nằm ở đây.
 *
 * **Không** cho trỏ bằng `TermId`: id do `Minter` cấp theo thứ tự dựng cây, tác giả
 * không đoán được nó, nên id-trong-`at` là một đường cụt đội lốt tính năng.
 *
 * Mẫu parse bằng một `Minter` **riêng**: `same()` bỏ qua id, nên so sánh không cần id
 * thật, và mượn bộ đếm của scene thì mọi nút sinh sau đó mang số khác — danh tính bền
 * là thứ cả choreography dựa vào (§3.4).
 */
function resolveAt(root: Expr, at: string): { path: string } | { refusal: string } {
  if (!at.startsWith('@')) return { path: at };
  const source = at.slice(1).trim();
  const pattern = tryParse(source, new Minter());
  if ('error' in pattern) return { refusal: `mẫu "${source}" không đọc được: ${pattern.error}` };

  const hits = [...allPaths(root)]
    .filter(([, node]) => same(node, pattern.expr))
    .map(([path]) => path);
  if (hits.length === 0) return { refusal: `không cây con nào khớp mẫu "${source}"` };
  if (hits.length > 1) {
    const where = hits.map((h) => `"${h || 'gốc'}"`).join(', ');
    return { refusal: `${hits.length} cây con cùng khớp mẫu "${source}" (${where}) — hãy dùng đường dẫn` };
  }
  return { path: hits[0] as string };
}

export function readAlgebra(scene: Scene): AlgebraModel {
  const config = (scene.config ?? {}) as AlgebraConfig;
  const m = new Minter();
  const empty: AlgebraModel = {
    config,
    rows: [],
    conditions: [],
    unsound: [],
    unchecked: [],
    extraneous: [],
    refusal: null,
  };

  // Trần số bước phải ép **ở đây**, không chỉ ở `maxItems` của TypeBox.
  //
  // Đo được ở lượt soát M55: `readAlgebra` chạy tuốt 14 bước và `checkBounds` im lặng
  // hoàn toàn — thứ duy nhất chặn là ajv, tức chỉ chặn nội dung tác giả gõ. Mọi trần
  // khác (`maxNodes`, `maxDegree`, `maxHeightCells`, `maxWidthCells`) đều ép ở tầng
  // này; riêng cái này lệch, và lệch **âm thầm**. Sandbox, engine gọi thẳng, hay bất
  // kỳ đường vào nào không qua ajv đều đi vòng qua nó.
  const stepCount = (config.steps ?? []).length;
  if (stepCount > ALGEBRA_LIMITS.maxSteps) {
    return { ...empty, refusal: `${stepCount} bước, quá trần ${ALGEBRA_LIMITS.maxSteps}` };
  }

  const parsed = tryParse(config.start ?? '', m);
  if ('error' in parsed) return { ...empty, refusal: `không đọc được biểu thức: ${parsed.error}` };

  let current = parsed.expr;
  if (nodeCount(current) > ALGEBRA_LIMITS.maxNodes) {
    return { ...empty, refusal: `biểu thức có ${nodeCount(current)} nút, quá ${ALGEBRA_LIMITS.maxNodes}` };
  }
  if (depth(current) > ALGEBRA_LIMITS.maxDepth) {
    return { ...empty, refusal: `cây sâu ${depth(current)} tầng, quá ${ALGEBRA_LIMITS.maxDepth}` };
  }
  // Hệ quá nhiều dòng thì cao vượt khung trước khi kịp dạy được gì. Ép ở đây cùng
  // khuôn với mọi trần khác — bài học M55: một trần chỉ khai ở TypeBox là một trần chỉ
  // chặn được một đường vào.
  if (current.k === 'sys' && current.rels.length > ALGEBRA_LIMITS.maxRelations) {
    return {
      ...empty,
      refusal: `hệ ${current.rels.length} phương trình, quá trần ${ALGEBRA_LIMITS.maxRelations}`,
    };
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
      roles: [],
    },
  ];
  const conditions: string[] = [];
  const unsound: string[] = [];
  const unchecked: string[] = [];
  const extraneous: string[] = [];

  const steps = config.steps ?? [];
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i] as NonNullable<AlgebraConfig['steps']>[number];
    const rule = ruleById(step.rule);
    if (rule === null) return { ...empty, rows, refusal: `không có luật tên "${step.rule}"` };

    // Giải `at` **trước** khi đi tìm nút: nó có thể là một mẫu nội dung (`"@..."`), và
    // `nodeAt` thì chỉ hiểu đường dẫn theo vị trí.
    const resolved = resolveAt(current, step.at);
    if ('refusal' in resolved) {
      return { ...empty, rows, refusal: `bước ${i + 1} (${rule.label}): ${resolved.refusal}` };
    }
    const at = resolved.path;

    const target = nodeAt(current, at);
    if (target === null) {
      return { ...empty, rows, refusal: `đường dẫn "${at}" không trỏ vào nút nào` };
    }

    const before = idsOfExpr(current);
    const outcome = rule.run(m, target, step.arg);
    if ('refusal' in outcome) {
      return {
        ...empty,
        rows,
        refusal: `bước ${i + 1} (${rule.label} tại "${at || 'gốc'}"): ${outcome.refusal}`,
      };
    }

    const spliced = replaceAt(current, at, outcome.after);
    if (spliced === null) return { ...empty, rows, refusal: `không thay được cây con tại "${at}"` };
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

    // `guard` nay do **luật tự khai**. Bản trước dựng nó bằng cách parse lại `step.arg`
    // — đúng tình cờ cho `mul_both_sides`, nơi arg *là* thừa số, và sai với mọi luật
    // khác. `abs_case` cần "$A \ge 0$", thứ không đọc ra được từ chuỗi tác giả gõ.
    const guard = outcome.guard ?? null;

    if (outcome.claim !== undefined) {
      // Hợp đồng thứ bảy (M59): đẳng thức bước này khẳng định. `left` đọc từ cây **sau**,
      // `right` dựng từ cây **trước**, nên một phép biến đổi hàng sai làm nó hỏng ngay.
      judge(sameValue(outcome.claim.left, outcome.claim.right, 20260731 + i, 8, guard));
    } else if (outcome.verify === 'instance') {
      // Thế một giá trị cụ thể: không phải chuyện tập nghiệm mà là chuyện "có thế đúng
      // không". Kiểm bằng **cấu trúc**, và vì thế nó có răng thật.
      const binding = outcome.binding as NonNullable<typeof outcome.binding>;
      const want = normalize(replaceVar(target, binding.name, binding.expr));
      judge(
        same(want, outcome.after)
          ? { ok: true, verified: true, message: `thế ${binding.name} đúng ở mọi chỗ` }
          : { ok: false, verified: true, message: 'kết quả không bằng phép thế trực tiếp' },
      );
    } else if (outcome.binding !== undefined) {
      // Đặt ẩn phụ: `after` viết bằng biến mới, nên so thẳng là so hai thứ khác biến.
      // Thế ngược lại rồi mới so — chính xác, và không cần đụng vào bộ kiểm.
      const back = replaceVar(outcome.after, outcome.binding.name, outcome.binding.expr);
      judge(sameValue(target, back, 20260731 + i, 8, guard));
    } else if (outcome.verify === 'root') {
      // Một nhánh nghiệm **hẹp hơn** tập nghiệm gốc, nên hỏi "cùng tập nghiệm" là hỏi
      // sai. Điều phải kiểm là nghiệm ấy **thoả** phương trình trước đó.
      judge(rootSatisfies(target, outcome.after));
    } else if (outcome.verify === 'implies') {
      // Bước **nới rộng**: chỉ hỏi được chiều "nghiệm cũ còn là nghiệm mới". Nghĩa vụ
      // còn lại — thử lại để loại nghiệm ngoại lai — ghi ra hình, không tự làm.
      const verdict = impliesSolutionSet(target, outcome.after, guard, 20260731 + i);
      if (!verdict.ok) unsound.push(`bước ${i + 1} (${rule.label}): ${verdict.message}`);

      // Món nợ ghi theo **hợp đồng**, không theo kết quả bốc điểm. Với phương trình,
      // tập nghiệm có độ đo $0$ nên `widened` gần như không bao giờ chạm tới — treo
      // dòng đỏ vào nó là để nó **không bao giờ hiện ra** ở đúng ca cần nó nhất. Chọn
      // `verify: 'implies'` đã là lời khai "bước này một chiều"; `widened` chỉ xác nhận
      // thêm khi may mắn bốc trúng (thường là ca bất đẳng thức).
      //
      // Và tình trạng kiểm được ghi **vào đây**, không vào `unchecked`: với phương
      // trình thì "không bốc trúng nghiệm nào" là chuyện **cấu trúc**, xảy ra ở mọi
      // bước bình phương, nên đẩy nó thành cảnh báo cho tác giả là dựng một vệt vàng
      // thường trực mà tác giả không sửa được — đúng cái M45 dạy đừng làm.
      extraneous.push(
        `bước ${i + 1} (${rule.label}) nới rộng tập nghiệm` +
          (verdict.widened
            ? ' — đã bốc trúng điểm nghiệm mới'
            : verdict.verified
              ? ''
              : ' (chiều kéo theo chưa bốc trúng điểm nào để kiểm)'),
      );
    } else if (isPredicate(target) && isPredicate(outcome.after) && rule.id !== 'substitute') {
      judge(sameSolutionSet(target, outcome.after, guard, 20260731 + i));
    } else if (!rule.onRelation && !isPredicate(target) && !isPredicate(outcome.after)) {
      judge(sameValue(target, outcome.after, 20260731 + i, 8, guard));
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
      // Đường dẫn **đã giải**, không phải chuỗi tác giả gõ: `layout` và `choreography`
      // đưa nó thẳng vào `nodeAt` để tìm cây con vừa đổi, mà `nodeAt` không hiểu `"@..."`.
      at,
      roles: outcome.roles ?? [],
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

  return { config, rows, conditions, unsound, unchecked, extraneous, refusal: null };
}
