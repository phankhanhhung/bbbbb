import type { Scene } from '@combviz/schema';
import {
  evalReal,
  guardList,
  impliesSolutionSet,
  sameSolutionSet,
  sameValue,
  type Guard,
  type Guards,
  type SoundnessResult,
  type Witness,
} from './check.js';
import {
  Minter,
  add,
  allPaths,
  boundAlong,
  commutativeKey,
  negate,
  variable,
  depth,
  flipOp,
  nodeAt,
  nodeCount,
  normalize,
  rel,
  replaceAt,
  same,
  substituteVar,
  totalDegree,
  trySegments,
  walk,
  type Expr,
  type TermId,
} from './expr.js';
import { checkArity } from './functions.js';
import { ParseError, toPlain, tryParse } from './parse.js';
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
   * Kết quả phép kiểm của **chính bước này** (AL-14). `null` khi không hợp đồng nào
   * chạy — chẳng hạn luật nhóm ★ trên một dòng mà cả hai vế đều không phải vị từ.
   *
   * Khác `model.unsound`/`unchecked`: hai danh sách ấy là của cả scene và chỉ nói khi
   * có chuyện. Dòng nào đã kiểm và **qua** thì trước M64 không để lại dấu vết nào — mà
   * đó chính là thứ đáng cho người đọc thấy.
   */
  readonly evidence: SoundnessResult | null;
  /**
   * Các **vai** trong hằng đẳng thức của bước này — nhóm $i$ một màu.
   *
   * `TermId` bền qua các dòng, nên cùng một danh sách id tô được **cả** dòng nguồn lẫn
   * dòng kết quả: mắt nối hai vế của $(a+b)^2 = a^2+2ab+b^2$ mà không cần mũi tên nào.
   */
  readonly roles: ReadonlyArray<readonly TermId[]>;
}

/**
 * Một điều kiện tích luỹ (AL-08) — **chữ đi kèm `guard`**.
 *
 * Trước M64 đây chỉ là một chuỗi. Chuỗi in ra được nhưng không **hỏi** được: câu
 * *"với $x \ne 1$"* hiện trên màn hình, còn câu người học thật sự muốn hỏi là *"thì
 * sao nếu $x = 1$"*, và chỉ `guard` trả lời được.
 */
export interface Condition {
  readonly text: string;
  readonly guard: Guards | null;
}

export interface AlgebraModel {
  readonly config: AlgebraConfig;
  readonly rows: readonly AlgebraRow[];
  readonly conditions: readonly Condition[];
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

/**
 * Thay mọi `var name` **tự do** bằng `value` — dùng để thế ngược ẩn phụ khi kiểm.
 *
 * Uỷ quyền cho `substituteVar` của `expr.ts` thay vì tự đi cây: bản chép tay ở
 * đây từng **mù phạm vi** — thay cả biến chỉ số bị $\Sigma$ ràng buộc — trong khi
 * chú thích của `substituteVar` nói thẳng "cả rules lẫn model đều cần". Hai bản
 * chép tay thì bản thứ hai quên đúng dòng phạm vi; và vì hợp đồng `instance` so
 * `after` với kết quả của chính hàm này, cái mù ấy làm một bước thế sai — thế
 * vào cả $k$ trong $\sum_k$ — được kiểm **XANH**.
 */
const replaceVar = substituteVar;

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

/**
 * Mọi nút `fn` trong cây có **đúng số đối số** không.
 *
 * Arity được ép ở parser — nhưng chỉ ở parser. Luật thì dựng nút `fn` bằng tay
 * (`binom_to_factorial`, `binom_symmetry`, `binom_absorb`, `pascal`, …), và trên đường
 * ấy **không có gì hỏi**. Một luật dựng `C(n)` thiếu một đối số thì `evalReal` đọc
 * `args[1]` ra `undefined`, và cái sai chảy vào một con số chứ không thành một lời từ
 * chối.
 *
 * `checkArity` viết ra từ M56 cho đúng khe này rồi **chưa từng được gọi** — một hàm
 * kiểm mồ côi là một lời hứa chưa ai thu. Nay nó chạy sau mỗi bước.
 *
 * Đây là backstop, không phải hàng rào cho nội dung: parser đã chặn phía tác giả, nên
 * nếu nó nổ thì lỗi ở **luật**, và lời từ chối nói đúng như thế.
 */
function badArity(e: Expr): string | null {
  let bad: string | null = null;
  walk(e, (n) => {
    if (bad === null && n.k === 'fn') bad = checkArity(n);
  });
  return bad;
}

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
  if (!at.startsWith('@')) {
    // `at` là **nội dung tác giả**, nên một đường dẫn hỏng phải ra lời từ chối chứ
    // không ra một ngoại lệ. Trước M77 nó rơi thẳng xuống `segmentsOf` và ném ra khỏi
    // `readAlgebra` — tức `combviz validate` **sập** trên một bản nháp gõ nhầm, thay
    // vì in ra một dòng lint. Xem chú thích ở `readAlgebra`.
    if (trySegments(at) === null) return { refusal: `đường dẫn "${at}" không hợp lệ` };
    return { path: at };
  }
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

/**
 * **`readAlgebra` trả về, không ném.** Đây là hợp đồng của cả engine (M77).
 *
 * Mọi thứ đứng trên engine — validator, layout, render, `combviz film`, sandbox —
 * đều đi qua đúng cửa này, và cửa này khai kiểu trả về là `AlgebraModel` với một
 * trường `refusal`. Một ngoại lệ lọt ra là **phá hợp đồng ở chỗ không ai bọc**.
 *
 * Nó từng lọt, ở hai lối, và cả hai đều bắt nguồn từ **nội dung tác giả**:
 *
 * | lối | ví dụ | hậu quả |
 * |---|---|---|
 * | `at` không phải đường dẫn | `at: "zzz"` | `segmentsOf` ném |
 * | `arg` không đọc được | `arg: "x := (((("` | luật gọi `parse` và `ParseError` ném |
 *
 * Cả hai đều là chuỗi trong JSON của bài, tức **dữ liệu, không phải mã** (NFR-S1).
 * Đo được: `algebraSchemaFragment.checkBounds` trên một bản nháp gõ nhầm dấu ngoặc
 * **sập cả `combviz validate`** thay vì in một dòng lint — đúng ca mà validator sinh
 * ra để phục vụ.
 *
 * Chữa ở **một** chỗ chứ không vá 79 luật: đường dẫn soát ngay tại `resolveAt`, còn
 * `ParseError` từ `arg` thì bắt quanh `rule.run`. Cái lưới ngoài cùng dưới đây bắt nốt
 * phần còn lại, nhưng nó **nói rõ đó là lỗi engine** — một lời từ chối im lặng nuốt
 * mất một lỗi lập trình thì tệ hơn hẳn một ngoại lệ, vì ngoại lệ ít ra còn to tiếng.
 *
 * Và chốt canh **hỏi luôn cái lưới**: quét chéo luật × đường dẫn × tham số rồi khẳng
 * định không lượt nào rơi vào nó. Không có khẳng định ấy thì lưới này là chỗ tiện nhất
 * để một lỗi thật nằm im — bẻ hai chỗ chữa ở trên ra thì test đỏ, còn bẻ **cái lưới**
 * ra thì test vẫn xanh, và đó là bằng chứng nó đang là hàng rào chứ không phải cái nạng.
 */
/**
 * `after` có đúng bằng phép bóc trực tiếp của `before` không — **bản của bộ kiểm**.
 *
 * Đây là bản **thứ hai** của phép bóc; bản thứ nhất là `peelSameFunction` trong
 * `rules.ts`. Chép có chủ đích, và lý do là bài học M78.3: luật và phép kiểm đi qua
 * *một* hàm thì sai cùng nhau mà vẫn khớp, nên phép so hoá ra chỉ khẳng định rằng hàm
 * ấy tự đồng ý với chính nó.
 *
 * **Mutant tương đương của AL-22, hết tương đương ở AL-24.** Lúc `use_injective` là luật
 * duy nhất của hợp đồng, cho `model` tin thẳng `outcome.after` thì không test nào đỏ:
 * luật ấy **từ chối** mọi hình dạng không bóc được, nên không có đường nào đưa một
 * `after` sai tới đây. §53.3 ghi lại nguyên văn. `use_monotone` là luật thứ hai, và nó
 * **quyết định dấu** — nên từ đây hàm này gánh một việc mà không ai khác gánh: kiểm rằng
 * dấu quan hệ đúng thứ giả thiết hứa, chứ không phải thứ luật nói.
 *
 * ## Nó đọc `assumption` chứ không nhận sẵn một hướng
 *
 * Hướng suy ra **từ tên giả thiết** — cùng chuỗi mà `readAlgebra` vừa đối chiếu với
 * `config.assume`. Nếu hàm này nhận sẵn một cờ `flip` do luật truyền sang thì luật lại
 * tự chấm bài mình, đúng thứ M78.3 dựng bản thứ hai để tránh. Tên hàm cũng phải khớp:
 * khai *"$f$ tăng ngặt"* rồi bóc một lời gọi $g$ là bóc bằng một giả thiết không có.
 */
export function peelsTo(before: Expr, after: Expr, assumption: string): boolean {
  const at = assumption.indexOf(':');
  if (at === -1) return false;
  const [name, property] = [assumption.slice(0, at).trim(), assumption.slice(at + 1).trim()];

  const call = (e: Expr): (Expr & { k: 'ufn' }) | null =>
    e.k === 'ufn' && e.args.length === 1 ? e : null;
  if (before.k !== 'rel') return false;

  // `đơn ánh` chỉ nói về dấu bằng; `tăng ngặt` giữ dấu; `giảm ngặt` lật. Không tính chất
  // nào nói gì về `!=` — chiều ấy đúng với mọi hàm và không cần giả thiết nào.
  const want =
    property === 'đơn ánh'
      ? before.op === '='
        ? '='
        : null
      : before.op === '!='
        ? null
        : property === 'tăng ngặt'
          ? before.op
          : property === 'giảm ngặt'
            ? flipOp(before.op)
            : null;
  if (want === null) return false;

  const [left, right] = [call(before.lhs), call(before.rhs)];
  if (left === null || right === null) return false;
  if (left.name !== right.name || left.notation !== right.notation) return false;
  if (left.name !== name) return false;
  return same(normalize(rel(new Minter(), want, left.args[0] as Expr, right.args[0] as Expr)), after);
}

/** Tiền tố của một giả thiết **thứ tự** — nguồn của nó là chuỗi, không phải `config`. */
const ORDER_PREFIX = 'thứ tự: ';

/** `"thứ tự: a >= b"` → `{hi: 'a', lo: 'b'}`; mọi chuỗi khác → `null` (AL-28). */
function orderAssumption(assumption: string): { hi: string; lo: string } | null {
  if (!assumption.startsWith(ORDER_PREFIX)) return null;
  const parts = assumption.slice(ORDER_PREFIX.length).split('>=');
  if (parts.length !== 2) return null;
  const [hi, lo] = parts.map((p) => p.trim()) as [string, string];
  return hi === '' || lo === '' ? null : { hi, lo };
}

/** Cây $u - v$, dựng lại **độc lập** với luật — bản thứ hai, đúng bài học M78.3. */
function varDiff(hi: string, lo: string): Expr {
  const m = new Minter();
  return add(m, [variable(m, hi), negate(m, variable(m, lo))]);
}

export function readAlgebra(scene: Scene): AlgebraModel {
  try {
    return readAlgebraOrThrow(scene);
  } catch (error) {
    return {
      config: (scene.config ?? {}) as AlgebraConfig,
      rows: [],
      conditions: [],
      unsound: [],
      unchecked: [],
      extraneous: [],
      refusal: `lỗi trong engine: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function readAlgebraOrThrow(scene: Scene): AlgebraModel {
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

  /**
   * **Giả thiết mâu thuẫn thì chứng minh được mọi thứ** (AL-24).
   *
   * `assume` là lời khai của tác giả, và tới AL-22 thì mỗi lời khai chỉ *mở* thêm một
   * nước đi — khai thừa cũng chỉ tốn một dòng đỏ. Hai tính chất đơn điệu thì khác: khai
   * cả *"$f$ tăng ngặt"* lẫn *"$f$ giảm ngặt"* cho **cùng một hàm** là khai một hàm
   * không tồn tại, và từ đó $f(A) < f(B)$ suy ra được cả $A < B$ lẫn $A > B$ — hai dòng
   * cùng "đã kiểm ✓" mà mâu thuẫn nhau.
   *
   * Bắt ở đây chứ không ở lint: `readAlgebra` là chỗ duy nhất mọi đường vào đều qua,
   * kể cả sandbox và scene dựng tại chỗ.
   */
  const monotone = new Map<string, string>();
  for (const claim of config.assume ?? []) {
    const at = claim.indexOf(':');
    if (at === -1) continue;
    const [who, what] = [claim.slice(0, at).trim(), claim.slice(at + 1).trim()];
    if (what !== 'tăng ngặt' && what !== 'giảm ngặt') continue;
    const already = monotone.get(who);
    if (already !== undefined && already !== what) {
      return {
        ...empty,
        refusal: `scene khai "${who}" vừa ${already} vừa ${what} — không hàm nào như thế`,
      };
    }
    monotone.set(who, what);
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

  const startArity = badArity(current);
  if (startArity !== null) return { ...empty, refusal: `lỗi trong engine: ${startArity}` };

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
      evidence: null,
      born: [],
      at: '',
      roles: [],
    },
  ];
  const conditions: Condition[] = [];
  /** Giả thiết đã khai và còn hiệu lực — rỗng cho tới lúc một bước `wlog` khai (AL-28). */
  let standing: readonly Guard[] = [];
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
    // Luật nào nhận một **biểu thức** làm tham số đều gọi `parse` trên `step.arg`, và
    // `arg` là chuỗi tác giả gõ. Bắt ở đây một lần thay vì bọc `try` trong từng luật:
    // lời từ chối ra cùng một khuôn với mọi lời từ chối khác, và luật mới viết sau này
    // được che sẵn mà không phải nhớ gì.
    let outcome: ReturnType<typeof rule.run>;
    try {
      outcome = rule.run(m, target, step.arg);
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
      return {
        ...empty,
        rows,
        refusal: `bước ${i + 1} (${rule.label}): tham số "${step.arg ?? ''}" không đọc được: ${error.message}`,
      };
    }
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
    let evidence: SoundnessResult | null = null;
    const judge = (verdict: {
      ok: boolean;
      message: string;
      verified?: boolean;
      witnesses?: readonly Witness[];
    }): void => {
      // Giữ **kết quả kiểm nguyên vẹn** cạnh dòng, không chỉ giữ lời than khi hỏng
      // (M64). `unsound`/`unchecked` là hai danh sách của cả scene và chúng chỉ nói khi
      // có chuyện; dòng nào **đã được kiểm và qua** thì trước đây không để lại dấu vết
      // nào. Mà "đã kiểm, qua trên 8 điểm" chính là thứ đáng cho người đọc thấy.
      evidence = { ok: verdict.ok, message: verdict.message, verified: verdict.verified ?? true, ...(verdict.witnesses ? { witnesses: verdict.witnesses } : {}) };
      const where = `bước ${i + 1} (${rule.label})`;
      if (!verdict.ok) unsound.push(`${where}: ${verdict.message}`);
      else if (verdict.verified === false) unchecked.push(`${where}: ${verdict.message}`);
    };

    // `guard` nay do **luật tự khai**. Bản trước dựng nó bằng cách parse lại `step.arg`
    // — đúng tình cờ cho `mul_both_sides`, nơi arg *là* thừa số, và sai với mọi luật
    // khác. `abs_case` cần "$A \ge 0$", thứ không đọc ra được từ chuỗi tác giả gõ.
    //
    // **Và giả thiết đang đứng** (AL-28): một bước `wlog` khai `standing`, và lời khai
    // ấy đi theo **mọi bước sau**. Nhập vào đây chứ không ở từng luật, vì luật không
    // thấy được các bước khác — chỉ `readAlgebra` mới biết chuỗi.
    //
    // Thứ tự trong danh sách không đổi kết quả: `guardHolds` đòi **mọi** điều kiện cùng
    // đúng. Nhưng nó phải nhập **trước** khi bước này được kiểm, không phải sau — chính
    // bước `wlog` cũng chạy dưới giả thiết nó vừa khai.
    standing = [...standing, ...guardList(outcome.standing ?? null)];
    const guard = [...guardList(outcome.guard ?? null), ...standing];

    if (outcome.standing !== undefined && same(target, outcome.after)) {
      /**
       * **Bước không đổi biểu thức, mà đổi giả thiết** (AL-28) — và chứng cứ phải nói
       * đúng chuyện ấy.
       *
       * Không có nhánh này thì một bước `wlog` rơi vào `sameSolutionSet`, và vì `after`
       * **bằng** `before` nên nó luôn cho *"cùng chân lý trên 24 điểm"*. Câu ấy đúng và
       * **rỗng**: nó kiểm một phép biến đổi không xảy ra, trong khi nghĩa vụ thật của
       * bước — chứng chỉ đối xứng — thì không được nhắc. Một dòng chứng cứ luôn xanh vì
       * nó hỏi sai câu là đúng lớp lỗi `ENGINE-BACKLOG.md` §3b đi vá.
       *
       * Nhận diện bằng **cấu trúc kết quả** (`standing` có, cây không đổi), không bằng
       * tên luật: một danh sách tên thì luật thứ hai của họ này lại lọt — cùng lý lẽ với
       * chỗ bỏ qua `binding` ở phép quét ngẫu nhiên.
       *
       * Nghĩa vụ ấy đã được **luật** gác: nó từ chối khi không có chứng chỉ. Nên chỗ này
       * chỉ ghi lại cho người đọc thấy bước đã mua gì bằng cái giá nào.
       */
      const added = guardList(outcome.standing)
        .map((g) => `${toPlain(g.expr)} ${g.sign === '>=0' ? '≥' : g.sign === '<=0' ? '≤' : '≠'} 0`)
        .join(', ');
      judge({
        ok: true,
        verified: true,
        message: `biểu thức không đổi; từ đây thêm giả thiết ${added}`,
      });
    } else if (outcome.claim !== undefined) {
      // Hợp đồng thứ bảy (M59): đẳng thức bước này khẳng định. `left` đọc từ cây **sau**,
      // `right` dựng từ cây **trước**, nên một phép biến đổi hàng sai làm nó hỏng ngay.
      judge(sameValue(outcome.claim.left, outcome.claim.right, 20260731 + i, 8, guard));
    } else if (outcome.verify === 'instance') {
      // Thế một giá trị cụ thể: không phải chuyện tập nghiệm mà là chuyện "có thế đúng
      // không". Kiểm bằng **cấu trúc**, và vì thế nó có răng thật.
      const binding = outcome.binding as NonNullable<typeof outcome.binding>;
      // Nhưng trước khi tin hợp đồng, hỏi **đường dẫn**: cây con tại `at` có nằm
      // trong thân một Σ/Π đang ràng buộc chính tên này không? Luật không hỏi
      // được — nó chỉ thấy một `var` trần — và nếu bỏ qua thì "k := 3" gọi vào
      // giữa thân $\sum_k$ thay một biến ràng buộc mà hợp đồng vẫn kiểm XANH,
      // vì cả hai phía cùng mù một kiểu.
      if (boundAlong(current, at).has(binding.name)) {
        return {
          ...empty,
          rows,
          refusal: `bước ${i + 1} (${rule.label} tại "${at}"): "${binding.name}" là chỉ số bị ràng buộc quanh chỗ này — thay nó là đổi nghĩa của Σ/Π bên ngoài`,
        };
      }
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
      // Chứng cứ ghi ở đây **bằng tay** chứ không qua `judge` — nhánh này cố ý không
      // đi qua `judge` vì `verified: false` ở đây có nghĩa khác hẳn (xem dưới). Nhưng
      // phép kiểm **đã chạy** và đã bốc điểm, nên bỏ nó đi là giấu đúng thứ mục này
      // sinh ra để bày. Lỗ ấy do chốt canh `mọi đích của mọi pha` bắt được: pha hiện
      // dòng nhắm vào một chấm chứng cứ không tồn tại.
      evidence = {
        ok: verdict.ok,
        verified: verdict.verified,
        message: verdict.message,
        ...(verdict.witnesses ? { witnesses: verdict.witnesses } : {}),
      };

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
    } else if (outcome.verify === 'assumption') {
      /**
       * Bước dựa trên một **giả thiết của bài**, và hợp đồng này ép hai thứ (AL-22).
       *
       * **Một — giả thiết phải có địa chỉ.** Luật khai tên giả thiết nó tiêu thụ nhưng
       * **không thấy** `config`, nên nó không tự phê duyệt được; chỗ đối chiếu là đây.
       * Chưa khai thì **từ chối**, không phải cảnh báo: một bước dùng giả thiết chưa ai
       * khai là một bước sai, và sai theo cách người đọc không tự phát hiện được.
       *
       * **Hai — phép biến đổi phải kiểm được bằng cây.** `model` **tự bóc lại** từ dòng
       * trước rồi so, không hỏi luật. Bài học M78.3: luật và phép kiểm đi qua *một* hàm
       * thì sai cùng nhau mà vẫn khớp. Nên phép bóc dưới đây là bản thứ hai, viết riêng.
       */
      const need = outcome.assumption ?? '';
      const order = orderAssumption(need);

      if (order !== null) {
        /**
         * **Giả thiết sinh ra từ chuỗi, không từ `config`** (AL-28).
         *
         * Hai nguồn giả thiết, và chúng đối chiếu ở hai chỗ khác nhau vì chúng *là* hai
         * thứ khác nhau. `"f: đơn ánh"` là lời khai của tác giả về **bài** — nó phải nằm
         * trong `config.assume`. `"thứ tự: a >= b"` là thứ một bước `wlog` **vừa dựng
         * ra**, và nó chỉ có hiệu lực từ bước ấy trở đi — nên chỗ hỏi là `standing`.
         *
         * Hỏi nhầm chỗ thì hỏng cả hai chiều: bắt tác giả khai thứ tự vào `config.assume`
         * là bỏ mất **vị trí** của bước `wlog` (giả sử ở bước 5 mà bước 2 đã dùng), còn
         * cho `wlog` ghi vào `config` thì bước khai lấy bước dùng — đúng thứ AL-22 gỡ.
         */
        const { hi, lo } = order;
        const wanted = commutativeKey(normalize(varDiff(hi, lo)));
        const held = standing.some(
          (g) => g.sign === '>=0' && commutativeKey(normalize(g.expr)) === wanted,
        );
        if (!held) {
          return {
            ...empty,
            rows,
            refusal:
              `bước ${i + 1} (${rule.label}): bước này giả sử ${hi} ≥ ${lo}, mà chưa bước nào ` +
              'khai thứ tự ấy — thêm một bước `wlog` trước nó',
          };
        }
        /**
         * **Biên của thứ tự, và vì sao phép hỏi này phải là cấu trúc** (AL-28).
         *
         * $a \ge b$ cho $a - b \ge 0$. Nhân một bất đẳng thức **ngặt** với $0$ thì ra
         * $0 < 0$ — sai — nên ca ngặt đòi thêm $a \ne b$.
         *
         * Đo trước khi tin: bỏ mệnh đề ấy ở `rules.ts` rồi chạy lại thì `unsound` **vẫn
         * rỗng**. Biên $a = b$ có độ đo $0$, nên bộ bốc điểm thực không bao giờ rơi trúng
         * nó. Một chốt canh chỉ dựa vào bốc điểm ở đây là chốt canh luôn xanh — đúng lớp
         * lỗi mà `ENGINE-BACKLOG.md` §3b.2–§3b.5 đã gỡ bốn lần.
         *
         * Nên hỏi bằng **cấu trúc**, và hỏi ở đây chứ không ở luật: `model` dựng lại điều
         * kiện cần từ `target.op` của chính nó, độc lập với thứ luật khai. Luật và phép
         * kiểm đi qua *một* đường thì sai cùng nhau mà vẫn khớp — bài học M78.3.
         */
        const strict = target.k === 'rel' && (target.op === '<' || target.op === '>');
        const excluded = guardList(outcome.guard ?? null).some(
          (g) => g.sign === '!=0' && commutativeKey(normalize(g.expr)) === wanted,
        );
        if (strict && !excluded) {
          judge({
            ok: false,
            verified: true,
            message: `${hi} ≥ ${lo} cho phép ${hi} = ${lo}, và nhân một dấu ngặt với 0 là sai`,
          });
        } else {
          // Giả thiết chỉ cho phép **giữ chiều**; nó không chứng minh phép nhân đúng. Nên
          // cây vẫn phải kiểm, và kiểm dưới `guard` đã trộn `standing` — tức chỉ trên
          // miền bài đang xét.
          judge(impliesSolutionSet(target, outcome.after, guard, 20260731 + i));
        }
      } else {
        const declared = new Set((config.assume ?? []).map((a) => a.trim()));
        if (!declared.has(need)) {
          return {
            ...empty,
            rows,
            refusal:
              `bước ${i + 1} (${rule.label}): bài chưa khai giả thiết "${need}" — ` +
              (declared.size === 0
                ? 'thêm nó vào `assume` của scene'
                : `scene đang khai ${[...declared].map((d) => `"${d}"`).join(', ')}`),
          };
        }

        judge(
          peelsTo(target, outcome.after, need)
            ? { ok: true, verified: true, message: `bóc ${need} — hai vế cùng một lời gọi hàm` }
            : { ok: false, verified: true, message: 'kết quả không bằng phép bóc trực tiếp' },
        );
      }
    } else if (rule.id === 'substitute') {
      /**
       * Thế biến là bước **đổi hệ quy chiếu**: sau "$x := 2y$" thì $x$ và $y$ là
       * hai hệ toạ độ khác nhau, nên cả hai hợp đồng đều hỏi sai câu — sameValue
       * kết tội unsound oan (hai vế khác *biến*, dĩ nhiên khác *giá trị*), còn
       * sameSolutionSet so hai tập nghiệm sống trong hai không gian tên.
       *
       * Trước đây nhánh loại trừ chỉ che sameSolutionSet: thế tại một cây con
       * biểu thức vẫn rơi vào sameValue và engine tự nhận "lỗi của engine" cho
       * một nước đi hợp lệ; thế tại cả quan hệ thì evidence null — không kiểm mà
       * không ai nói gì. Tình trạng "không hợp đồng nào áp được" phải thành
       * **chứng cứ đọc được**; và nó ghi vào evidence chứ không vào `unchecked`,
       * cùng phân công với nhánh `implies` ngay trên: chuyện *cấu trúc* mà tác
       * giả không sửa được thì đừng dựng thành vệt vàng thường trực (M45).
       */
      evidence = {
        ok: true,
        verified: false,
        message: 'thế biến đổi hệ quy chiếu — bước khai báo, không có hợp đồng giá trị/tập nghiệm nào áp được',
      };
    } else if (isPredicate(target) && isPredicate(outcome.after)) {
      judge(sameSolutionSet(target, outcome.after, guard, 20260731 + i));
    } else if (!rule.onRelation && !isPredicate(target) && !isPredicate(outcome.after)) {
      judge(sameValue(target, outcome.after, 20260731 + i, 8, guard));
    }

    if (outcome.condition !== undefined && !conditions.some((c) => c.text === outcome.condition)) {
      // Giữ **cả `guard`** cạnh dòng chữ, không chỉ dòng chữ (M64). Chữ nói *"với
      // $x \ne 1$"*; `guard` là thứ duy nhất trả lời được *"thì sao nếu $x = 1$"* —
      // và câu thứ hai mới là câu người học hỏi. Không có nó thì chỗ chạm vào điều
      // kiện chỉ đọc lại đúng dòng chữ đang hiện trên màn hình.
      //
      // Và ở đây là **`outcome.guard`**, không phải `guard` đã trộn giả thiết đang đứng
      // (AL-28). Hai thứ đi hai đường vì chúng trả lời hai câu khác nhau: `guard` trộn
      // là thứ **bộ kiểm** dùng để biết bốc điểm ở đâu; `outcome.guard` là thứ **người
      // học** chạm vào. Trộn chúng thì `violationOf` có quyền trả lời câu *"thì sao
      // nếu"* bằng một điểm nằm **ngoài nhánh đã chọn** — đúng kiểu "$a = 0, b = 1$:
      // $a - b < 0$" — mà một điểm ngoài nhánh không phải phản ví dụ của bước nào cả.
      conditions.push({ text: outcome.condition, guard: outcome.guard ?? null });
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
      evidence,
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
    const arity = badArity(current);
    if (arity !== null) {
      return { ...empty, rows, refusal: `lỗi trong engine: bước ${i + 1} (${rule.label}) dựng ${arity}` };
    }
    const big = tooBig(current);
    if (big !== null) return { ...empty, rows, refusal: `sau bước ${i + 1} hình ${big}` };
  }

  return { config, rows, conditions, unsound, unchecked, extraneous, refusal: null };
}
