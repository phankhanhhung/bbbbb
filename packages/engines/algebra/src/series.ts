import { intExp, varsOf, type Expr } from './expr.js';
import { evalReal, type SoundnessResult } from './check.js';

/**
 * **Sân kiểm thứ tư: chuỗi luỹ thừa hình thức** (AL-16).
 *
 * Ba sân cũ đều bốc điểm: $\mathbb{F}_p$, thực, nguyên. Chúng trả lời câu *"hai biểu
 * thức có bằng nhau tại điểm này không"*, và câu ấy **không có nghĩa** với
 * $\sum_{k=0}^{\infty} x^k$: chuỗi ấy không hội tụ ở mọi $x$, và ngay ở chỗ nó hội tụ
 * thì bốc một điểm cũng chỉ nói về một điểm.
 *
 * Câu đúng phải hỏi là *"hai chuỗi có **cùng hệ số** không"* — và câu ấy trả lời được
 * **chính xác tuyệt đối**, không xác suất. Đó là chỗ sân này khác hẳn ba sân kia: nó
 * không có $d/p$, không có sai số $10^{-9}$, không có "không bốc trúng điểm nào". Nó
 * hoặc trả lời, hoặc nói thẳng là không tính được chuỗi.
 *
 * ## Vì sao `bigint`
 *
 * Hệ số của $\dfrac{1}{(1-x)^3}$ mọc theo $\binom{k+2}{2}$; của $\dfrac{1}{1-2x}$ mọc
 * theo $2^k$. Ở $k = 12$ thì $2^{12}$ còn nhỏ, nhưng phép chia chuỗi cộng dồn tích của
 * các hệ số trước, và một `number` sẽ mất chính xác **im lặng** — đúng loại sai mà cả
 * sân này sinh ra để tránh. Hữu tỉ chính xác trên `bigint` thì không có chỗ cho im lặng.
 *
 * ## Không mở thành đại số máy tính
 *
 * `fn`, `root`, `abs` → `null`. Khai triển chuỗi của $\exp$ và $\log$ là **một mục
 * khác** (ghi ở §16): chúng cần giai thừa trong mẫu và một câu chuyện hội tụ riêng, và
 * mở chúng ở đây là bắt đầu viết một CAS.
 */

/** Hữu tỉ chính xác. Luôn ở dạng tối giản với mẫu dương. */
export interface Frac {
  readonly n: bigint;
  readonly d: bigint;
}

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));

export function frac(n: bigint, d: bigint = 1n): Frac {
  if (d === 0n) throw new Error('mẫu số 0');
  const sign = d < 0n ? -1n : 1n;
  const g = gcd(n, d) || 1n;
  return { n: (sign * n) / g, d: (sign * d) / g };
}

export const ZERO: Frac = { n: 0n, d: 1n };
export const ONE: Frac = { n: 1n, d: 1n };

const add = (a: Frac, b: Frac): Frac => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const mul = (a: Frac, b: Frac): Frac => frac(a.n * b.n, a.d * b.d);
const isZero = (a: Frac): boolean => a.n === 0n;
export const fracText = (a: Frac): string => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`);

/** Chuỗi cắt tại bậc `N`: hệ số $0..N$. */
type Series = Frac[];

const zeros = (n: number): Series => Array.from({ length: n + 1 }, () => ZERO);

function sAdd(a: Series, b: Series): Series {
  return a.map((x, i) => add(x, b[i] as Frac));
}

function sMul(a: Series, b: Series, N: number): Series {
  const out = zeros(N);
  for (let i = 0; i <= N; i += 1) {
    if (isZero(a[i] as Frac)) continue;
    for (let j = 0; i + j <= N; j += 1) {
      if (isZero(b[j] as Frac)) continue;
      out[i + j] = add(out[i + j] as Frac, mul(a[i] as Frac, b[j] as Frac));
    }
  }
  return out;
}

/**
 * Chia chuỗi. `null` khi mẫu có hệ số tự do $0$ — chuỗi ấy **không tồn tại**.
 *
 * $\dfrac{1}{x}$ không phải một chuỗi luỹ thừa, và trả về một xấp xỉ nào đó ở chỗ này
 * là bịa. Từ chối là câu trả lời đúng.
 */
function sDiv(a: Series, b: Series, N: number): Series | null {
  if (isZero(b[0] as Frac)) return null;
  const out = zeros(N);
  for (let i = 0; i <= N; i += 1) {
    let acc = a[i] as Frac;
    for (let j = 1; j <= i; j += 1) {
      acc = add(acc, mul(frac(-(b[j] as Frac).n, (b[j] as Frac).d), out[i - j] as Frac));
    }
    out[i] = mul(acc, frac((b[0] as Frac).d, (b[0] as Frac).n));
  }
  return out;
}

/**
 * Hệ số $0..N$ của `e` xem như chuỗi luỹ thừa theo `name`. `null` khi không tính được.
 *
 * "Không tính được" là một câu trả lời **hạng nhất** ở đây, không phải một thất bại: nó
 * đi thẳng vào `verified: false` và engine nói ra, đúng máy móc `unchecked` của M49.
 */
export function seriesOf(e: Expr, name: string, N: number): Series | null {
  switch (e.k) {
    case 'int': {
      const out = zeros(N);
      out[0] = frac(BigInt(e.v));
      return out;
    }
    case 'rat': {
      const out = zeros(N);
      out[0] = frac(BigInt(e.p), BigInt(e.q));
      return out;
    }
    case 'var': {
      if (e.name !== name) return null;
      if (N < 1) return zeros(N);
      const out = zeros(N);
      out[1] = ONE;
      return out;
    }
    case 'add': {
      let acc = zeros(N);
      for (const a of e.args) {
        const s = seriesOf(a, name, N);
        if (s === null) return null;
        acc = sAdd(acc, s);
      }
      return acc;
    }
    case 'mul': {
      let acc = zeros(N);
      acc[0] = ONE;
      for (const a of e.args) {
        const s = seriesOf(a, name, N);
        if (s === null) return null;
        acc = sMul(acc, s, N);
      }
      return acc;
    }
    case 'pow': {
      // `intExp` chỉ nhận số mũ là **chữ số**. Sau khi thay chỉ số, số mũ thường là một
      // biểu thức hằng ($1 + (-1)$), nên hỏi `constInt` khi `intExp` chịu thua — cùng lý
      // do đã ghi ở `constInt`.
      const k = intExp(e) ?? constInt(e.exp);
      if (k === null || k < 0) return null;
      const base = seriesOf(e.base, name, N);
      if (base === null) return null;
      let acc = zeros(N);
      acc[0] = ONE;
      for (let i = 0; i < k; i += 1) acc = sMul(acc, base, N);
      return acc;
    }
    case 'div': {
      const num = seriesOf(e.num, name, N);
      const den = seriesOf(e.den, name, N);
      if (num === null || den === null) return null;
      return sDiv(num, den, N);
    }
    case 'big':
      return bigSeries(e, name, N);
    default:
      // `fn`, `root`, `abs`, `rel`, `sys`, `inf` trần — xem chú thích đầu tệp.
      return null;
  }
}

/** Bậc nhỏ nhất mang hệ số khác $0$; `Infinity` cho chuỗi $0$ (không chạm bậc nào). */
function minDeg(s: Series): number {
  const at = s.findIndex((c) => !isZero(c));
  return at === -1 ? Infinity : at;
}

/**
 * $\sum$ và $\prod$ — cả cận hữu hạn lẫn cận vô hạn.
 *
 * Cận hữu hạn thì khai ra rồi cộng: đó là **định nghĩa**, không phải một mẹo.
 *
 * Cận vô hạn thì cần một **chứng cứ cắt được**, và chứng cứ ấy phải nằm trong thân
 * hàm chứ không trong lời hứa — phiên bản đầu của chú thích này hứa "chặn cứng ở
 * $N$ vòng, bậc chưa vượt thì từ chối" trong khi thân chỉ cộng $N{+}1$ hạng tử
 * không kiểm gì, nên $\sum_{k=0}^{\infty} x$ trả về $13x$ và `sum_shift` trên nó
 * được kiểm **xanh**. Bất biến thật sự cần là: *hạng tử thứ $k$ không chạm bậc
 * nào dưới $k - a$* (`minDeg ≥ k − a`; hạng tử $0$ có `minDeg = ∞` nên qua).
 * Khi đó $N{+}1$ hạng tử đầu là toàn bộ những gì với tới các bậc $0..N$.
 *
 * Kiểm trên **hai cửa sổ**: cửa sổ cộng $[a, a{+}N]$ đòi `minDeg ≥ k − a` từng
 * hạng tử, và cửa sổ đuôi $(a{+}N, a{+}2N{+}2]$ đòi hạng tử **không chạm** bậc
 * $\le N$. Đuôi xa hơn nữa là ngoại suy từ nhịp tăng bậc đã đo — một thân cố tình
 * quay đầu bậc sau $2N{+}2$ hạng tử cần một đa thức số mũ bậc rất cao được dựng
 * chủ ý, ngoài mô hình đe doạ của một kho nội dung có duyệt; còn mọi nhầm lẫn
 * thật (thân có phần không phụ thuộc $k$, số mũ giảm dần…) chết ngay trong hai
 * cửa sổ này.
 */
function bigSeries(e: Expr & { k: 'big' }, name: string, N: number): Series | null {
  if (e.op !== 'sum') return null;

  const from = constInt(e.from);
  if (from === null) return null;

  if (e.to.k === 'inf') {
    let acc = zeros(N);
    for (let k = from; k <= from + N; k += 1) {
      const term = seriesOf(substituteIndex(e.body, e.v, k), name, N);
      if (term === null) return null;
      if (minDeg(term) < k - from) return null;
      acc = sAdd(acc, term);
    }
    for (let k = from + N + 1; k <= from + 2 * N + 2; k += 1) {
      const term = seriesOf(substituteIndex(e.body, e.v, k), name, N);
      if (term === null || minDeg(term) <= N) return null;
    }
    return acc;
  }

  const to = constInt(e.to);
  if (to === null) return null;
  let acc = zeros(N);
  for (let k = from; k <= to; k += 1) {
    const term = seriesOf(substituteIndex(e.body, e.v, k), name, N);
    if (term === null) return null;
    acc = sAdd(acc, term);
  }
  return acc;
}

/**
 * Cận phải là một **số nguyên**, nhưng không nhất thiết là một *chữ số*.
 *
 * `sum_shift` dịch cận $0$ đi $1$ và để lại nút $0 + 1$ — `normalize` không gộp hằng
 * (gộp là việc của `eval_int`, một luật **có tên** hiện trên hình). Đòi `e.k === 'int'`
 * ở đây thì mọi tổng vừa dịch chỉ số đều rơi vào "không khai được thành chuỗi", và
 * engine nói *"chưa kiểm được"* cho một bước nó thừa sức kiểm.
 *
 * Tính bằng `evalReal` chứ không viết một bộ đánh giá hằng thứ hai: hai bộ song song là
 * hai chỗ để lệch nhau.
 */
function constInt(e: Expr): number | null {
  const v = evalReal(e, new Map());
  return v !== null && Number.isInteger(v) ? v : null;
}

/** Thay chỉ số bằng một số nguyên cụ thể. Không mint id: cây này chỉ để tính. */
function substituteIndex(e: Expr, name: string, value: number): Expr {
  if (e.k === 'var' && e.name === name) return { k: 'int', v: value, id: e.id };
  if (e.k === 'big' && e.v === name) return e; // chỉ số bị che
  switch (e.k) {
    case 'add':
    case 'mul':
    case 'fn':
      return { ...e, args: e.args.map((a) => substituteIndex(a, name, value)) };
    case 'pow':
      return {
        ...e,
        base: substituteIndex(e.base, name, value),
        exp: substituteIndex(e.exp, name, value),
      };
    case 'div':
      return {
        ...e,
        num: substituteIndex(e.num, name, value),
        den: substituteIndex(e.den, name, value),
      };
    case 'root':
    case 'abs':
      return { ...e, arg: substituteIndex(e.arg, name, value) };
    case 'big':
      return {
        ...e,
        from: substituteIndex(e.from, name, value),
        to: substituteIndex(e.to, name, value),
        body: substituteIndex(e.body, name, value),
      };
    case 'rel':
      return {
        ...e,
        lhs: substituteIndex(e.lhs, name, value),
        rhs: substituteIndex(e.rhs, name, value),
      };
    case 'sys':
      return { ...e, rels: e.rels.map((r) => substituteIndex(r, name, value)) };
    default:
      return e;
  }
}

/**
 * Biến của chuỗi: biến **tự do** duy nhất của hai vế.
 *
 * `null` khi không có, hoặc có nhiều hơn một — chuỗi hai biến là một mục khác, và đoán
 * bừa biến nào là biến chuỗi thì kết quả đúng một nửa số lần.
 */
export function seriesVariable(a: Expr, b: Expr): string | null {
  const names = [...new Set([...varsOf(a), ...varsOf(b)])];
  return names.length === 1 ? (names[0] as string) : null;
}

export const SERIES_TERMS = 12;

/**
 * Hai biểu thức có **cùng chuỗi** không — chính xác tuyệt đối tới bậc `N`.
 *
 * Lời nhắn khi lệch nói **hệ số của $x^k$ nào** lệch và hai giá trị là bao nhiêu. Đó là
 * chỗ sân này dạy được nhiều nhất: *"$\frac{1}{1-2x}$ không phải $\sum x^k$ — hệ số của
 * $x^1$ là $2$ chứ không phải $1$"* là một câu người học kiểm lại được bằng tay.
 */
export function sameValueSeries(a: Expr, b: Expr, N: number = SERIES_TERMS): SoundnessResult {
  const name = seriesVariable(a, b);
  if (name === null) {
    return {
      ok: true,
      verified: false,
      message: 'không có biến chuỗi duy nhất — chưa kiểm được trên sân chuỗi',
    };
  }

  const sa = seriesOf(a, name, N);
  const sb = seriesOf(b, name, N);
  if (sa === null || sb === null) {
    return { ok: true, verified: false, message: 'không khai được thành chuỗi luỹ thừa' };
  }

  for (let k = 0; k <= N; k += 1) {
    const x = sa[k] as Frac;
    const y = sb[k] as Frac;
    if (x.n !== y.n || x.d !== y.d) {
      return {
        ok: false,
        verified: true,
        message: `hệ số của ${name}^${k} lệch: ${fracText(x)} ≠ ${fracText(y)}`,
      };
    }
  }
  return { ok: true, verified: true, message: `khớp ${N + 1} hệ số đầu, chính xác tuyệt đối` };
}

/* ---------- quan hệ trên sân chuỗi (M69) ---------- */

/**
 * Chân lý của **một quan hệ** đọc bằng hệ số.
 *
 * `null` nghĩa là câu hỏi không đặt được ở đây, và ba lý do đều thật: không phải
 * `rel`; toán tử có **thứ tự** ($<$, $\ge$) — chuỗi luỹ thừa hình thức không có
 * thứ tự, nên "$\sum x^k < 1/(1-x)$" là câu vô nghĩa chứ không phải câu khó; hoặc
 * một vế không khai được thành chuỗi.
 */
interface SeriesVerdict {
  readonly holds: boolean;
  /** Bậc đầu tiên hai vế lệch nhau; `-1` khi khớp hết tới `N`. */
  readonly at: number;
  readonly lhs: Frac;
  readonly rhs: Frac;
}

function relationVerdict(e: Expr, name: string, N: number): SeriesVerdict | null {
  if (e.k !== 'rel') return null;
  if (e.op !== '=' && e.op !== '!=') return null;

  const sl = seriesOf(e.lhs, name, N);
  const sr = seriesOf(e.rhs, name, N);
  if (sl === null || sr === null) return null;

  for (let k = 0; k <= N; k += 1) {
    const x = sl[k] as Frac;
    const y = sr[k] as Frac;
    if (x.n !== y.n || x.d !== y.d) {
      return { holds: e.op === '!=', at: k, lhs: x, rhs: y };
    }
  }
  return { holds: e.op === '=', at: -1, lhs: ZERO, rhs: ZERO };
}

const lechAt = (name: string, v: SeriesVerdict): string =>
  `hệ số của ${name}^${v.at} lệch: ${fracText(v.lhs)} ≠ ${fracText(v.rhs)}`;

/** Lý do chung khi sân chuỗi không nhận câu hỏi — nói ra thay vì trả bừa. */
function seriesRefusal(name: string | null): SoundnessResult {
  return {
    ok: true,
    verified: false,
    message:
      name === null
        ? 'không có biến chuỗi duy nhất — chưa kiểm được trên sân chuỗi'
        : 'quan hệ này không đọc được bằng hệ số (cần dạng "=" hoặc "≠", hai vế khai được thành chuỗi)',
  };
}

/**
 * Hai quan hệ có **cùng chân lý** không, đọc bằng hệ số (AL-16, M69).
 *
 * Đây là bản của `sameSolutionSet` cho sân chuỗi, và nó tồn tại vì chỗ trống nó lấp
 * đo được: mọi thao tác nhóm ★ trên một đẳng thức hàm sinh — đúng thể loại bài mà
 * sân chuỗi sinh ra để phục vụ — trước đây mang vệt vàng *"không tìm được điểm nào
 * xác định"* **vĩnh viễn**, vì `evalRelation` trả `null` tại mọi nút `inf` nên
 * `done` luôn bằng $0$. Trung thực, nhưng đúng là thất bại M45: một vệt vàng
 * thường trực mà tác giả không sửa được thì không còn là cảnh báo.
 *
 * "Tập nghiệm" đổi nghĩa ở đây, và đổi có lý do: $x$ trong $\sum_k x^k = 1/(1-x)$
 * **không phải ẩn cần tìm** mà là biến hình thức, nên câu hỏi đúng không phải "hai
 * tập nghiệm có trùng không" mà "hai câu này có cùng đúng/cùng sai không" — chính
 * là điều `sameSolutionSet` đo trên từng điểm, chỉ khác là ở đây trả lời được
 * **chính xác tuyệt đối** thay vì trên $24$ điểm bốc được.
 *
 * Cả hai cùng **sai** thì vẫn xanh, đúng như bản bốc điểm xử lý hai quan hệ cùng
 * sai ở mọi điểm — nhưng lời nhắn nói thẳng ra là cả hai đều sai, vì "xanh" ở ca
 * ấy dễ đọc nhầm thành "bước này chứng minh được điều gì đó".
 */
export function sameRelationSeries(a: Expr, b: Expr, N: number = SERIES_TERMS): SoundnessResult {
  const name = seriesVariable(a, b);
  if (name === null) return seriesRefusal(null);

  const va = relationVerdict(a, name, N);
  const vb = relationVerdict(b, name, N);
  if (va === null || vb === null) return seriesRefusal(name);

  if (va.holds && vb.holds) {
    return {
      ok: true,
      verified: true,
      message: `hai dòng cùng đúng trên ${N + 1} hệ số đầu, chính xác tuyệt đối`,
    };
  }
  if (!va.holds && !vb.holds) {
    return {
      ok: true,
      verified: true,
      message: `cả hai dòng đều **sai** như nhau — dòng trước ${lechAt(name, va)}, dòng sau ${lechAt(name, vb)}`,
    };
  }
  // Chân lý đổi giữa hai dòng: đúng một trong hai là dòng hỏng, và nói được **dòng
  // nào** cùng hệ số nào — thứ mà một lời than chung chung không nói được.
  const broke = va.holds ? vb : va;
  return {
    ok: false,
    verified: true,
    message: va.holds
      ? `dòng trước đúng nhưng dòng sau sai: ${lechAt(name, broke)}`
      : `dòng trước sai (${lechAt(name, broke)}) mà dòng sau lại đúng — bước này không bảo toàn chân lý`,
  };
}

/**
 * Chiều **kéo theo** trên sân chuỗi — bản `impliesSolutionSet` cho hàm sinh.
 *
 * Cùng ba ô của bảng chân lý mà bản bốc điểm dùng, chỉ khác là ở đây "mọi điểm" thu
 * về đúng **một** câu hỏi: chuỗi hiệu hai vế có bằng $0$ không.
 */
export function impliesRelationSeries(
  before: Expr,
  after: Expr,
  N: number = SERIES_TERMS,
): SoundnessResult & { readonly widened: boolean } {
  const name = seriesVariable(before, after);
  if (name === null) return { ...seriesRefusal(null), widened: false };

  const vb = relationVerdict(before, name, N);
  const va = relationVerdict(after, name, N);
  if (vb === null || va === null) return { ...seriesRefusal(name), widened: false };

  if (vb.holds && !va.holds) {
    return {
      ok: false,
      verified: true,
      widened: false,
      message: `kéo theo sai: dòng trước đúng mà dòng sau ${lechAt(name, va)}`,
    };
  }
  return {
    ok: true,
    verified: true,
    // `after` đúng trong khi `before` sai: bước **nới rộng** — đúng cái mà bình
    // phương hai vế làm, và là lý do `implies` tồn tại tách khỏi `same`.
    widened: va.holds && !vb.holds,
    message: vb.holds
      ? `kéo theo đúng trên ${N + 1} hệ số đầu, chính xác tuyệt đối`
      : 'dòng trước sai như một đẳng thức chuỗi — chiều kéo theo không nói được gì',
  };
}
