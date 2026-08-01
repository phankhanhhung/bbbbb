import { hasInfinity, intExp, needsRealEval, totalDegree, varsOf, walk, type Expr } from './expr.js';
import { sameValueSeries } from './series.js';
import { FUNCTIONS, isIntegerOnly } from './functions.js';

/**
 * Kiểm một bước biến đổi có **đúng** không, bằng đánh giá ngẫu nhiên trên
 * $\mathbb{F}_p$ (`ENGINE-ALGEBRA.md` §6).
 *
 * **Phép kiểm này canh engine, không canh tác giả.** Tác giả không gõ vế sau — engine
 * tính ra nó — nên tác giả không thể làm ra một bước sai. Thứ có thể sai là **luật
 * viết lỗi**, và đây là chốt canh cho đúng chuyện đó. Cùng vai với phép quét
 * $A = BQ + R$ của `longdiv` và bảng Grundy vét cạn của engine game.
 *
 * Theo Schwartz–Zippel, một đa thức khác không bậc tổng $d$ triệt tiêu tại điểm ngẫu
 * nhiên với xác suất $\le d/p$. Với $d \le 64$ và $p = 2^{31}-1$ thì một lần thử đã
 * cho $\approx 3\times10^{-8}$; chạy tám lần là thừa an toàn.
 *
 * Dùng `bigint` vì tích hai số cỡ $p$ vượt `Number.MAX_SAFE_INTEGER`.
 */

export const P = 2147483647n; // 2^31 − 1, nguyên tố Mersenne

/** Sinh số giả ngẫu nhiên **tất định**: cùng scene phải cho cùng kết quả kiểm. */
function lcg(seed: number): () => bigint {
  let s = BigInt(seed >>> 0) || 1n;
  return () => {
    s = (s * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    return (s >> 16n) % P;
  };
}

const modPow = (base: bigint, e: number): bigint | null => {
  if (e < 0) {
    const inv = modInverse(base);
    return inv === null ? null : modPow(inv, -e);
  }
  let r = 1n;
  let b = base % P;
  let n = e;
  while (n > 0) {
    if (n & 1) r = (r * b) % P;
    b = (b * b) % P;
    n >>= 1;
  }
  return r;
};

/** Nghịch đảo modulo $p$; `null` khi giá trị $\equiv 0$ (chia cho không). */
function modInverse(a: bigint): bigint | null {
  const v = ((a % P) + P) % P;
  if (v === 0n) return null;
  return modPow(v, Number(P - 2n)) as bigint;
}

/** `null` nghĩa là gặp chia cho $0$ tại điểm này — bốc lại điểm khác. */
export function evalAt(e: Expr, env: ReadonlyMap<string, bigint>): bigint | null {
  switch (e.k) {
    case 'int':
      return ((BigInt(e.v) % P) + P) % P;
    case 'rat': {
      const inv = modInverse(BigInt(e.q));
      return inv === null ? null : (((BigInt(e.p) % P) + P) % P) * inv % P;
    }
    case 'var':
      return env.get(e.name) ?? null;
    case 'inf':
      // $\infty$ không phải phần tử của $\mathbb{F}_p$ — cũng không phải của
      // $\mathbb{R}$. Trả `null` là nói "điểm này vô dụng", và vì nút này **luôn**
      // trả `null`, mọi biểu thức chứa nó rơi vào `verified: false` ở cả ba sân cũ.
      return null;
    case 'add': {
      let s = 0n;
      for (const a of e.args) {
        const v = evalAt(a, env);
        if (v === null) return null;
        s = (s + v) % P;
      }
      return s;
    }
    case 'mul': {
      let s = 1n;
      for (const a of e.args) {
        const v = evalAt(a, env);
        if (v === null) return null;
        s = (s * v) % P;
      }
      return s;
    }
    case 'pow': {
      const n = intExp(e);
      // Số mũ không nguyên không có mặt ở đây — `needsRealEval` đã lái cây ấy sang
      // `sameValueReal` trước khi tới dòng này. Giữ nhánh `null` để nếu ngày nào đó
      // lối lái ấy hỏng thì kết quả là "không kiểm được", không phải một số bịa ra.
      if (n === null) return null;
      const b = evalAt(e.base, env);
      if (b === null) return null;
      return modPow(b, n);
    }
    case 'div': {
      const n = evalAt(e.num, env);
      const d = evalAt(e.den, env);
      if (n === null || d === null) return null;
      const inv = modInverse(d);
      return inv === null ? null : (n * inv) % P;
    }
    case 'abs':
      return null;
    case 'fn':
    case 'big':
      // $n!$ trên $\mathbb{F}_p$ với $n$ là một thặng dư ngẫu nhiên cỡ $10^9$ là câu
      // vô nghĩa, không phải câu khó tính. $\sum_{k=1}^{n}$ với cận như thế cũng vậy.
      // Biểu thức có hàm hoặc tổng đi đường **số nguyên**.
      return null;
    case 'root':
      // Căn không sống trên $\mathbb{F}_p$: $\sqrt a$ chỉ tồn tại khi $a$ là thặng dư
      // bậc hai, và khi tồn tại thì có **hai** nghiệm không có nhánh chính tắc. Biểu
      // thức có căn đi đường `sameValueReal` thay vì đường này.
      return null;
    case 'rel':
    case 'sys':
      // Quan hệ không có "giá trị" — nhóm ★ kiểm bằng cấu trúc, không bằng số.
      return null;
  }
}

/**
 * Đánh giá trên $\mathbb{R}$, cho biểu thức **có căn**.
 *
 * `null` nghĩa là điểm này vô dụng: chia cho $0$, hoặc căn bậc chẵn của số âm. Không
 * phải bằng chứng sai — bốc điểm khác.
 */
export function evalReal(e: Expr, env: ReadonlyMap<string, number>): number | null {
  const ok = (v: number): number | null => (Number.isFinite(v) ? v : null);
  switch (e.k) {
    case 'int':
      return e.v;
    case 'rat':
      return e.p / e.q;
    case 'var':
      return env.get(e.name) ?? null;
    case 'inf':
      return null;
    case 'add': {
      let s = 0;
      for (const a of e.args) {
        const v = evalReal(a, env);
        if (v === null) return null;
        s += v;
      }
      return ok(s);
    }
    case 'mul': {
      let s = 1;
      for (const a of e.args) {
        const v = evalReal(a, env);
        if (v === null) return null;
        s *= v;
      }
      return ok(s);
    }
    case 'pow': {
      const b = evalReal(e.base, env);
      if (b === null) return null;
      const n = evalReal(e.exp, env);
      if (n === null) return null;
      if (b === 0 && n <= 0) return null;
      // Cơ số **âm** với số mũ không nguyên: $(-8)^{1/3}$ không xác định trên
      // $\mathbb{R}$ theo định nghĩa luỹ thừa thực (`Math.pow` trả `NaN`). Điểm này vô
      // dụng chứ không phải bằng chứng sai — cùng lối với căn bậc chẵn của số âm.
      if (b < 0 && !Number.isInteger(n)) return null;
      return ok(Math.pow(b, n));
    }
    case 'div': {
      const n = evalReal(e.num, env);
      const d = evalReal(e.den, env);
      if (n === null || d === null || Math.abs(d) < 1e-9) return null;
      return ok(n / d);
    }
    case 'abs': {
      const a = evalReal(e.arg, env);
      return a === null ? null : Math.abs(a);
    }
    case 'root': {
      const a = evalReal(e.arg, env);
      if (a === null) return null;
      if (a < 0) return e.index % 2 === 0 ? null : ok(-Math.pow(-a, 1 / e.index));
      return ok(Math.pow(a, 1 / e.index));
    }
    case 'fn': {
      const spec = FUNCTIONS[e.name];
      if (e.args.length !== spec.arity) return null;
      const vs: number[] = [];
      for (const a of e.args) {
        const v = evalReal(a, env);
        if (v === null) return null;
        vs.push(v);
      }
      // `null` từ bảng nghĩa là **điểm này vô dụng** — đối số không nguyên, âm, hoặc
      // kết quả đã ra khỏi vùng số nguyên chính xác. Cùng lối với căn bậc chẵn của số
      // âm: bỏ điểm, không kết tội.
      const v = spec.evalNum(vs);
      return v === null ? null : ok(v);
    }
    case 'big': {
      const from = evalReal(e.from, env);
      const to = evalReal(e.to, env);
      if (from === null || to === null) return null;
      // Cận phải là **số nguyên**: $\sum_{k=1}^{2{,}7}$ không có nghĩa. Điểm ấy vô dụng
      // chứ không phải bằng chứng sai — cùng lối với căn bậc chẵn của số âm.
      if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
      // Trần khai: cùng con số với `maxDegree`, và cùng lý lẽ — quá đó thì phép kiểm
      // tốn hơn thứ nó mua, và trả `null` (không kiểm được) thì trung thực hơn là chạy.
      if (to - from > BIG_SPAN_MAX) return null;

      let acc = e.op === 'sum' ? 0 : 1;
      // Khoảng rỗng ($to < from$) cho $0$ với tổng và $1$ với tích — quy ước chuẩn, và
      // nó **có việc**: `sum_split` tại $m = b$ sinh ra đúng một khoảng rỗng.
      for (let i = from; i <= to; i += 1) {
        const inner = new Map(env);
        inner.set(e.v, i);
        const v = evalReal(e.body, inner);
        if (v === null) return null;
        acc = e.op === 'sum' ? acc + v : acc * v;
      }
      return ok(acc);
    }
    case 'rel':
    case 'sys':
      return null;
  }
}

/** Số hạng tối đa khai được khi kiểm — cùng con số và cùng lý lẽ với `maxDegree`. */
const BIG_SPAN_MAX = 64;

/**
 * Điều kiện một bước tự khai: điểm vi phạm nó bị **bỏ qua** khi kiểm.
 *
 * Trước M50 chỗ này là một mẹo: `model` dựng guard bằng cách **parse lại `step.arg`**,
 * đúng tình cờ cho `mul_both_sides` (arg *là* thừa số) và sai với mọi luật khác. Luật
 * phải tự khai điều kiện của nó, vì chỉ nó biết điều kiện ấy là gì — `abs_case` cần
 * "$A \ge 0$", một thứ không đọc ra được từ chuỗi tác giả gõ.
 */
export interface Guard {
  readonly expr: Expr;
  readonly sign: '!=0' | '>=0' | '<=0';
}

/**
 * Một điều kiện, hoặc **nhiều** — và số nhiều không phải chuyện thẩm mỹ.
 *
 * Bản đầu cho đúng một `Guard`, và chỗ ấy vỡ ở `sum_split`: tách $\sum_a^b$ tại $m$ chỉ
 * đúng khi $a-1 \le m \le b$, tức **hai** bất đẳng thức. Gói hai thứ ấy vào một biểu
 * thức — chẳng hạn $(b-m)(m-a+1) \ge 0$ — thì đúng tình cờ và sai khi cả hai cùng âm.
 * Mã hoá hai điều kiện thành một là đúng loại mẹo mà engine này tránh ở mọi chỗ khác.
 */
export type Guards = Guard | readonly Guard[];

/** Điểm này có dùng được không: `false` khi nó vi phạm **bất kỳ** điều kiện nào. */
function guardHolds(guard: Guards | null, env: ReadonlyMap<string, number>): boolean {
  if (guard === null) return true;
  for (const g of Array.isArray(guard) ? guard : [guard as Guard]) {
    const v = evalReal(g.expr, env);
    if (v === null) return false;
    if (g.sign === '!=0') {
      if (Math.abs(v) <= 1e-6) return false;
    } else if (g.sign === '>=0' ? v < 0 : v > 0) {
      return false;
    }
  }
  return true;
}

/** Danh sách điều kiện, dạng chuẩn — để chỗ khác khỏi phải nghĩ về hai kiểu. */
export const guardList = (g: Guards | null): readonly Guard[] =>
  g === null ? [] : Array.isArray(g) ? g : [g as Guard];

/**
 * Một **điểm đã bốc**, giữ lại thay vì vứt đi (AL-14).
 *
 * Bộ kiểm bốc hàng chục điểm cho mỗi bước rồi tóm tắt tất cả vào một câu chữ:
 * *"khớp trên 8 điểm ngẫu nhiên"*. Con số $8$ ấy là **toàn bộ** những gì sống sót — bản
 * thân các điểm, thứ đắt nhất trong cả phép kiểm, biến mất ngay khi vòng lặp kết thúc.
 *
 * Giữ chúng lại không tốn thêm một phép tính nào: env đã nằm sẵn trong tay tại chỗ so.
 * Và nó biến một câu khẳng định thành một thứ **đếm được và chỉ ra được** — dải chấm
 * dưới nhãn luật là tám điểm này, không phải một hình trang trí có tám ô.
 *
 * `values` chỉ có ở sân so **giá trị**; sân so tập nghiệm thì hai bên là đúng/sai, và
 * nhét chúng vào một cặp số là bịa ra một phép đo không tồn tại.
 *
 * **Cảnh báo về sân $\mathbb{F}_p$:** ở đó `env` là phần tử của một trường hữu hạn cỡ
 * $2^{31}$, nên `x = 1483920571` là một chứng cứ **thật** mà **vô nghĩa với người đọc**.
 * Dải chấm chỉ đếm chúng; đừng in giá trị của sân ấy ra màn hình.
 */
export interface Witness {
  readonly env: Readonly<Record<string, number>>;
  readonly verdict: 'agree' | 'refute';
  /** Hai vế ra bao nhiêu tại điểm ấy. Vắng ở sân so tập nghiệm. */
  readonly values?: readonly [number, number];
}

/** Trần số điểm giữ lại — dải chấm rộng hơn tám thì đọc thành một vệt, không thành số. */
export const WITNESS_MAX = 8;

/**
 * Sổ ghi điểm dùng chung cho cả bốn vòng bốc.
 *
 * Bốn bản chép tay thì bản thứ tư sẽ khác ba bản kia ở đúng chỗ không ai nhìn — cùng lý
 * do `sampleCompare` được tách ra ở M56.
 */
function witnessLog(): {
  agree: (env: ReadonlyMap<string, number | bigint>, values?: readonly [number, number]) => void;
  refute: (
    env: ReadonlyMap<string, number | bigint>,
    values?: readonly [number, number],
  ) => readonly Witness[];
  kept: () => readonly Witness[];
} {
  const kept: Witness[] = [];
  const plain = (env: ReadonlyMap<string, number | bigint>): Record<string, number> =>
    Object.fromEntries([...env].map(([k, v]) => [k, Number(v)]));
  return {
    agree: (env, values) => {
      if (kept.length < WITNESS_MAX) {
        kept.push({ env: plain(env), verdict: 'agree', ...(values ? { values } : {}) });
      }
    },
    // Điểm phản chứng đứng **cuối** và không bị trần chặn: nó là điểm duy nhất trong cả
    // danh sách thật sự nói lên điều gì khi bước sai.
    refute: (env, values) => [
      ...kept,
      { env: plain(env), verdict: 'refute' as const, ...(values ? { values } : {}) },
    ],
    kept: () => kept,
  };
}

export interface SoundnessResult {
  readonly ok: boolean;
  readonly message: string;
  /** Các điểm đã bốc (AL-14). Vắng khi phép kiểm không bốc điểm nào — bậc quá lớn... */
  readonly witnesses?: readonly Witness[];
  /**
   * Đã thật sự kiểm được chưa.
   *
   * `ok: true` một mình là câu trả lời **nhập nhằng**: nó vừa nghĩa là "đã thử và
   * khớp", vừa nghĩa là "không tìm được điểm nào để thử". Hai thứ ấy khác nhau như
   * đêm với ngày, và trước khi có số mũ hữu tỉ thì nhánh thứ hai gần như không với
   * tới nên nhập nhằng ấy không hại ai. Nay $x^{1/2}$ đòi cơ số $\ge 0$ mà bộ bốc
   * điểm bốc cả hai dấu, nên **quá nửa số điểm bị bỏ** — nhánh ấy thành với tới được.
   *
   * `model` gom mọi bước `verified: false` vào `unchecked` và engine nói ra. Một bước
   * không kiểm được mà đi qua **im lặng như bước đã kiểm** là đúng cái bẫy đã cắn
   * engine này hai lần (M47b, M47c).
   */
  readonly verified: boolean;
}

/**
 * Hai biểu thức có **đồng nhất bằng nhau như hàm hữu tỉ** không.
 *
 * Bậc vượt trần thì trả `ok` kèm lời khai — cận Schwartz–Zippel không còn ý nghĩa,
 * và im lặng coi như đúng thì tệ hơn nói ra rằng không kiểm được.
 */
export function sameValue(
  a: Expr,
  b: Expr,
  seed = 20260731,
  trials = 8,
  guard: Guards | null = null,
): SoundnessResult {
  // **Bốn** sân, và thứ tự hỏi quan trọng.
  //
  // $\infty$ hỏi trước hết: nó làm mọi phép bốc điểm vô nghĩa (`evalAt`/`evalReal` trả
  // `null` ở nút ấy, nên ba sân kia chỉ có thể trả "không tìm được điểm nào"). Sân chuỗi
  // thì trả lời **chính xác tuyệt đối** bằng hệ số — không xác suất, không sai số.
  if (hasInfinity(a) || hasInfinity(b)) return sameValueSeries(a, b);

  //
  // Giai thừa và tổ hợp hỏi trước hết: $C_n^k$ *có* tính được trên $\mathbb{F}_p$ khi
  // $n$ là hằng, nhưng đường ấy im lặng đúng ở chỗ nguy hiểm nhất — $n$ ký hiệu — nên
  // lái sang bộ nguyên trước rồi mới xét tới hai sân kia.
  if (needsIntegerEval(a) || needsIntegerEval(b)) {
    return sameValueInteger(a, b, seed, trials, guard);
  }
  // Có căn thì đổi sân: $\mathbb{F}_p$ không có khái niệm "căn bậc hai của $2$".
  // Điều kiện có **dấu** cũng buộc đổi sân: trường hữu hạn không có thứ tự, nên
  // "$A \ge 0$" ở đó là một câu vô nghĩa chứ không phải một câu khó kiểm.
  if (needsRealEval(a) || needsRealEval(b) || guardList(guard).some((g) => g.sign !== '!=0')) {
    return sameValueReal(a, b, seed, trials, guard);
  }

  const d = Math.max(totalDegree(a), totalDegree(b));
  if (d > 4096) {
    return {
      ok: true,
      verified: false,
      message: `bậc ${d} quá lớn — không kiểm được bằng điểm ngẫu nhiên`,
    };
  }

  const names = [...new Set([...varsOf(a), ...varsOf(b)])].sort();
  const rand = lcg(seed);
  const log = witnessLog();
  let done = 0;

  for (let attempt = 0; attempt < trials * 8 && done < trials; attempt += 1) {
    const env = new Map<string, bigint>();
    for (const n of names) env.set(n, rand());

    // Điều kiện "$\ne 0$" kiểm được ngay trên $\mathbb{F}_p$; loại dấu đã bị lái sang
    // đường thực ở trên.
    let skip = false;
    for (const g of guardList(guard)) {
      const v = evalAt(g.expr, env);
      if (v === null || v === 0n) skip = true;
    }
    if (skip) continue;

    const va = evalAt(a, env);
    const vb = evalAt(b, env);
    // Mẫu triệt tiêu tại điểm này ⇒ điểm vô dụng, không phải bằng chứng sai.
    if (va === null || vb === null) continue;
    done += 1;
    if (va !== vb) {
      const at = names.map((n) => `${n}=${env.get(n)}`).join(', ');
      return {
        ok: false,
        verified: true,
        message: `khác nhau tại ${at || 'điểm hằng'}: ${va} ≠ ${vb}`,
        witnesses: log.refute(env, [Number(va), Number(vb)]),
      };
    }
    log.agree(env, [Number(va), Number(vb)]);
  }

  if (done === 0) {
    return { ok: true, verified: false, message: 'không tìm được điểm nào mẫu khác 0' };
  }
  return {
    ok: true,
    verified: true,
    message: `khớp trên ${done} điểm ngẫu nhiên`,
    witnesses: log.kept(),
  };
}

/**
 * Bản thực của `sameValue`, cho biểu thức có căn.
 *
 * Đổi lại tính chính xác tuyệt đối lấy khả năng nói về $\sqrt 2$: so bằng sai số
 * tương đối $10^{-9}$.
 *
 * **Bốc cả số âm**, và đó không phải chi tiết. Bản đầu chỉ bốc trong $[0{,}3, 4)$ cho
 * căn bậc chẵn luôn xác định — nhưng thế thì $\sqrt{x^2} = x$ **qua được**, dù nó sai
 * với mọi $x < 0$ (đúng phải là $|x|$). Một bộ kiểm chỉ nhìn nửa trục số là bộ kiểm
 * mù đúng chỗ nguy hiểm nhất của căn thức. Điểm rơi vào miền không xác định thì bị bỏ
 * qua, không bị kết tội — nên trần số lần thử phải rộng.
 */
export function sameValueReal(
  a: Expr,
  b: Expr,
  seed: number,
  trials: number,
  guard: Guards | null = null,
): SoundnessResult {
  return sampleCompare(a, b, seed, trials, guard, realSampler(seed), 40, 'điểm thực');
}

/**
 * Biểu thức có phần **chỉ sống ở số nguyên** không — quyết định bộ bốc điểm nào chạy.
 *
 * Ba hàm tổ hợp đều thế. $n!$ tại $n = 2{,}7$ không phải một câu khó tính, nó là một câu
 * không có nghĩa trong phạm vi engine này.
 */
export function needsIntegerEval(e: Expr): boolean {
  let found = false;
  walk(e, (n) => {
    if (n.k === 'fn' && isIntegerOnly(n.name)) found = true;
    // $\sum$ chỉ khai được ở cận **nguyên**, nên nó dùng chung bộ bốc điểm với hàm tổ
    // hợp. Đây chính là chỗ M56 trả cổ tức: không phải dựng thêm bộ nào.
    if (n.k === 'big') found = true;
  });
  return found;
}

/**
 * Bản **số nguyên** của `sameValueReal` — bộ bốc điểm thứ ba, và lý do nó phải có.
 *
 * `sameValueReal` bốc trong $[-4,-0{,}3] \cup [0{,}3,4]$, toàn số **không nguyên**. Với
 * một biểu thức có $n!$ thì mọi điểm ấy trả `null`, nên `done` không bao giờ tăng, nên
 * mọi bước rơi vào `verified: false` ⇒ `unchecked` ⇒ **vàng thường trực trên mọi bài tổ
 * hợp**. Đó đúng thất bại M45: một vệt vàng không bao giờ tắt là cách nhanh nhất để
 * người ta ngừng đọc mọi cảnh báo, kể cả cảnh báo thật.
 *
 * Nên bộ kiểm phải **kiểm được**, không chỉ phải trung thực. Bốc số nguyên trong
 * $[0, 12]$: đủ nhỏ để $12!$ còn chính xác từng đơn vị, đủ rộng để hai đa thức khác nhau
 * bậc $\le 12$ không thể trùng nhau ở mọi điểm.
 *
 * Vẫn tính bằng `evalReal` chứ không bằng một bộ đánh giá riêng: điểm thì nguyên, nhưng
 * biểu thức quanh nó vẫn có thể có căn và phân số, và hai bộ đánh giá song song là hai
 * chỗ để lệch nhau.
 */
export function sameValueInteger(
  a: Expr,
  b: Expr,
  seed: number,
  trials: number,
  guard: Guards | null = null,
): SoundnessResult {
  return sampleCompare(a, b, seed, trials, guard, integerSampler(seed), 40, 'điểm nguyên');
}

/** Bộ sinh điểm: một hàm không đối số, gọi một lần cho mỗi biến. */
type Sampler = () => number;

/** Trong $[-4,-0{,}3] \cup [0{,}3,4]$ — né lân cận $0$ để mẫu số không nổ. */
function realSampler(seed: number): Sampler {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const u = s / 0x7fffffff;
    return u < 0.5 ? -(0.3 + u * 7.4) : 0.3 + (u - 0.5) * 7.4;
  };
}

/**
 * Bộ bốc cho **quan hệ** — rộng hơn bộ giá trị ($[-4{,}75, 4{,}75]$ né lân cận $0$).
 *
 * Câu hỏi ở đây là "hai bên có cùng đúng/sai không", nên cần trải qua nhiều miền dấu
 * hơn; còn câu hỏi giá trị chỉ cần điểm nào cũng được miễn xác định.
 *
 * Có `fn` chỉ sống ở số nguyên thì đổi sang bộ nguyên — cùng lý lẽ với `sameValue`.
 */
function relationSampler(seed: number, integer: boolean): Sampler {
  if (integer) return integerSampler(seed);
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const u = s / 0x7fffffff;
    return u < 0.5 ? -(0.25 + u * 9) : 0.25 + (u - 0.5) * 9;
  };
}

/** Số nguyên trong $[0, 12]$ — trần chọn để $12!$ còn nằm trong vùng chính xác. */
function integerSampler(seed: number): Sampler {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s >>> 8) % 13;
  };
}

/**
 * Vòng bốc điểm dùng chung cho cả hai bộ.
 *
 * Tách ra vì hai bộ chỉ khác nhau ở **cách bốc một con số** — mọi thứ còn lại (bỏ điểm
 * vi phạm `guard`, bỏ điểm ngoài miền, phân biệt "khớp" với "không kiểm được") là một.
 * Hai bản chép tay thì bản thứ hai sẽ khác bản thứ nhất ở đúng chỗ không ai nhìn.
 */
function sampleCompare(
  a: Expr,
  b: Expr,
  _seed: number,
  trials: number,
  guard: Guards | null,
  rand: Sampler,
  attemptsPerTrial: number,
  label: string,
): SoundnessResult {
  const names = [...new Set([...varsOf(a), ...varsOf(b)])].sort();
  const log = witnessLog();
  let done = 0;

  for (let attempt = 0; attempt < trials * attemptsPerTrial && done < trials; attempt += 1) {
    const env = new Map<string, number>();
    for (const n of names) env.set(n, rand());
    if (!guardHolds(guard, env)) continue;

    const va = evalReal(a, env);
    const vb = evalReal(b, env);
    if (va === null || vb === null) continue;
    done += 1;
    const scale = Math.max(1, Math.abs(va), Math.abs(vb));
    if (Math.abs(va - vb) > 1e-9 * scale) {
      const at = names.map((n) => `${n}=${(env.get(n) as number).toFixed(4)}`).join(', ');
      return {
        ok: false,
        verified: true,
        message: `khác nhau tại ${at || 'điểm hằng'}: ${va} ≠ ${vb}`,
        witnesses: log.refute(env, [va, vb]),
      };
    }
    log.agree(env, [va, vb]);
  }

  if (done === 0) {
    return { ok: true, verified: false, message: 'không tìm được điểm nào xác định' };
  }
  return { ok: true, verified: true, message: `khớp trên ${done} ${label}`, witnesses: log.kept() };
}

/**
 * Giá trị chân lý của một quan hệ tại một điểm. `null` = không xác định ở đây.
 */
export function evalRelation(e: Expr, env: ReadonlyMap<string, number>): boolean | null {
  if (e.k === 'sys') {
    // Hội thì mọi nhánh phải đúng; tuyển thì một nhánh là đủ. `null` ở một nhánh làm
    // hỏng cả câu trả lời — điểm ấy vô dụng, không phải bằng chứng sai.
    let out = e.join === 'and';
    for (const r of e.rels) {
      const v = evalRelation(r, env);
      if (v === null) return null;
      out = e.join === 'and' ? out && v : out || v;
    }
    return out;
  }
  if (e.k !== 'rel') return null;
  const l = evalReal(e.lhs, env);
  const r = evalReal(e.rhs, env);
  if (l === null || r === null) return null;
  const eps = 1e-9 * Math.max(1, Math.abs(l), Math.abs(r));
  switch (e.op) {
    case '=':
      return Math.abs(l - r) <= eps;
    case '!=':
      return Math.abs(l - r) > eps;
    case '<':
      return l < r - eps;
    case '<=':
      return l <= r + eps;
    case '>':
      return l > r + eps;
    case '>=':
      return l >= r - eps;
  }
}

/**
 * Hai quan hệ có **cùng tập nghiệm** không.
 *
 * Đây là chốt canh mà nhóm ★ thiếu suốt từ lúc dựng. Đặc tả §6 nói nhóm ★ "bảo toàn
 * tập nghiệm **do cấu trúc**" nên không cần kiểm — và câu ấy sai: nhân hai vế một
 * **bất đẳng thức** với số âm phải đổi chiều, mà `mul_both_sides` bản đầu không đổi.
 * Engine cho ra $x<3 \Rightarrow -x<-3$, sai trắng trợn, và không có gì kêu vì
 * `model` bỏ qua hẳn nút `rel`. "Đúng do cấu trúc" là thứ phải chứng minh, không
 * phải thứ để khai.
 *
 * `guard` là điều kiện bước ấy tự khai (AL-08): điểm làm `guard` triệt tiêu bị bỏ
 * qua, vì bước chỉ hứa đúng ở ngoài đó. Nhờ vậy điều kiện in ra hình có **nghĩa vận
 * hành** chứ không chỉ là một dòng chữ.
 */
export function sameSolutionSet(
  a: Expr,
  b: Expr,
  guard: Guards | null,
  seed: number,
  trials = 24,
): SoundnessResult {
  const names = [...new Set([...varsOf(a), ...varsOf(b)])].sort();
  const rand = relationSampler(seed, needsIntegerEval(a) || needsIntegerEval(b));
  const log = witnessLog();
  let done = 0;
  let agree = 0;

  for (let attempt = 0; attempt < trials * 20 && done < trials; attempt += 1) {
    const env = new Map<string, number>();
    for (const n of names) env.set(n, rand());
    if (!guardHolds(guard, env)) continue;
    const va = evalRelation(a, env);
    const vb = evalRelation(b, env);
    if (va === null || vb === null) continue;
    done += 1;
    if (va === vb) {
      agree += 1;
      log.agree(env);
    } else {
      const at = names.map((n) => `${n}=${(env.get(n) as number).toFixed(4)}`).join(', ');
      return {
        ok: false,
        verified: true,
        message: `tập nghiệm khác nhau tại ${at || 'điểm hằng'}`,
        witnesses: log.refute(env),
      };
    }
  }

  if (done === 0) {
    return { ok: true, verified: false, message: 'không tìm được điểm nào xác định' };
  }
  return {
    ok: true,
    verified: true,
    message: `cùng chân lý trên ${agree} điểm`,
    witnesses: log.kept(),
  };
}

export interface ImplicationResult extends SoundnessResult {
  /** Tìm được điểm mà `after` đúng còn `before` sai ⇒ bước này **sinh nghiệm ngoại lai**. */
  readonly widened: boolean;
}

/**
 * `before` có **kéo theo** `after` không — hợp đồng kiểm **một chiều**.
 *
 * Có vì bình phương hai vế không bảo toàn tập nghiệm, nó **nới rộng**. Viết luật ấy
 * dưới hợp đồng `sameSolutionSet` thì engine báo `unsound` — và báo đúng. Nên thứ phải
 * thêm không phải một luật mà là một **câu hỏi khác**: "mọi nghiệm cũ còn là nghiệm
 * mới chứ?" thay vì "hai tập nghiệm trùng nhau chứ?".
 *
 * Ba thứ đọc ra từ cùng một lượt bốc điểm:
 *
 * | thấy ở một điểm | kết luận |
 * |---|---|
 * | `before` đúng, `after` **sai** | kéo theo **sai** — lỗi engine thật |
 * | `after` đúng, `before` sai | có **nghiệm ngoại lai** ⇒ `widened` |
 * | không điểm nào `before` đúng | `verified: false` ⇒ vào `unchecked` |
 *
 * **Răng của nó nằm ở bất đẳng thức**, và có thật: $x<3 \to x^2<9$ sai tại $x=-5$, mà
 * bộ bốc điểm trúng nửa trục âm một nửa số lần. Với **phương trình** thì "`before`
 * đúng" có độ đo $0$ nên hầu như không bao giờ chạm tới — và ở đó nó trả `verified:
 * false` chứ **không** giả vờ xanh. Đó đúng là chỗ máy móc `unchecked` của M49 sinh ra
 * để đứng.
 */
export function impliesSolutionSet(
  before: Expr,
  after: Expr,
  guard: Guards | null,
  seed: number,
  trials = 40,
): ImplicationResult {
  const names = [...new Set([...varsOf(before), ...varsOf(after)])].sort();
  const rand = relationSampler(seed, needsIntegerEval(before) || needsIntegerEval(after));
  const log = witnessLog();
  let held = 0;
  let widened = false;

  for (let attempt = 0; attempt < trials * 20; attempt += 1) {
    const env = new Map<string, number>();
    for (const n of names) env.set(n, rand());
    if (!guardHolds(guard, env)) continue;

    const vb = evalRelation(before, env);
    const va = evalRelation(after, env);
    if (vb === null || va === null) continue;

    if (vb && !va) {
      const at = names.map((n) => `${n}=${(env.get(n) as number).toFixed(4)}`).join(', ');
      return {
        ok: false,
        verified: true,
        widened,
        message: `kéo theo sai tại ${at || 'điểm hằng'}: vế trước đúng mà vế sau sai`,
        witnesses: log.refute(env),
      };
    }
    // Chỉ điểm **thoả quan hệ trước** mới là chứng cứ: điểm mà `before` sai không nói
    // gì về một mệnh đề kéo theo, và đếm nó vào là thổi phồng số chứng cứ bằng những
    // điểm chưa từng được hỏi.
    if (vb) {
      held += 1;
      log.agree(env);
    }
    if (va && !vb) widened = true;
  }

  if (held === 0) {
    return {
      ok: true,
      verified: false,
      widened,
      message: 'không bốc trúng điểm nào thoả quan hệ trước — chưa kiểm được chiều kéo theo',
    };
  }
  return {
    ok: true,
    verified: true,
    widened,
    message: `kéo theo đúng trên ${held} điểm`,
    witnesses: log.kept(),
  };
}

/**
 * Biểu thức này có **chắc chắn khác $0$** không (AL-08).
 *
 * Chỉ trả `true` khi nó là hằng khác $0$. Có biến ⇒ `false`, kể cả $x^2+1$ vốn không
 * có nghiệm thực — vì trên $\mathbb{C}$ thì có, và vì engine không có cách nào biết
 * miền của biến. Thà cảnh báo thừa còn hơn để lọt đúng cái bẫy mà luật này sinh ra
 * để bắt.
 */
export function definitelyNonZero(e: Expr): boolean {
  if (varsOf(e).size > 0) return false;
  if (needsRealEval(e)) {
    const v = evalReal(e, new Map());
    return v !== null && Math.abs(v) > 1e-12;
  }
  const v = evalAt(e, new Map());
  return v !== null && v !== 0n;
}

/**
 * Biểu thức này có **chắc chắn không âm** không — điều kiện tồn tại của căn bậc chẵn.
 *
 * Cùng tinh thần thận trọng với `definitelyNonZero`: chỉ trả `true` khi tính ra được
 * một số không âm. Có biến ⇒ `false`, kể cả $x^2$ vốn luôn $\ge 0$ trên $\mathbb{R}$ —
 * vì engine không biết miền của biến, và thà ghi điều kiện thừa còn hơn để lọt.
 */
/** Dấu chắc chắn của một biểu thức hằng: `1`, `-1`, hoặc `0` khi không biết. */
export function definiteSign(e: Expr): 1 | -1 | 0 {
  if (varsOf(e).size > 0) return 0;
  const v = evalReal(e, new Map());
  if (v === null || Math.abs(v) < 1e-12) return 0;
  return v > 0 ? 1 : -1;
}

/**
 * Biểu thức này có **chắc chắn dương** không — điều kiện lấy logarit.
 *
 * Cùng tinh thần thận trọng với `definitelyNonZero`: có biến ⇒ `false`, kể cả $x^2+1$.
 */
export function definitelyPositive(e: Expr): boolean {
  if (varsOf(e).size > 0) return false;
  const v = evalReal(e, new Map());
  return v !== null && v > 0;
}

export function definitelyNonNegative(e: Expr): boolean {
  if (varsOf(e).size > 0) return false;
  const v = evalReal(e, new Map());
  return v !== null && v >= 0;
}
