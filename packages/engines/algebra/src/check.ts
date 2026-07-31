import { needsRealEval, totalDegree, varsOf, type Expr } from './expr.js';

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
      const b = evalAt(e.base, env);
      if (b === null) return null;
      return modPow(b, e.exp);
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
    case 'root':
      // Căn không sống trên $\mathbb{F}_p$: $\sqrt a$ chỉ tồn tại khi $a$ là thặng dư
      // bậc hai, và khi tồn tại thì có **hai** nghiệm không có nhánh chính tắc. Biểu
      // thức có căn đi đường `sameValueReal` thay vì đường này.
      return null;
    case 'rel':
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
      if (b === 0 && e.exp < 0) return null;
      return ok(Math.pow(b, e.exp));
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
    case 'rel':
      return null;
  }
}

export interface SoundnessResult {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * Hai biểu thức có **đồng nhất bằng nhau như hàm hữu tỉ** không.
 *
 * Bậc vượt trần thì trả `ok` kèm lời khai — cận Schwartz–Zippel không còn ý nghĩa,
 * và im lặng coi như đúng thì tệ hơn nói ra rằng không kiểm được.
 */
export function sameValue(a: Expr, b: Expr, seed = 20260731, trials = 8): SoundnessResult {
  // Có căn thì đổi sân: $\mathbb{F}_p$ không có khái niệm "căn bậc hai của $2$".
  if (needsRealEval(a) || needsRealEval(b)) return sameValueReal(a, b, seed, trials);

  const d = Math.max(totalDegree(a), totalDegree(b));
  if (d > 4096) {
    return { ok: true, message: `bậc ${d} quá lớn — không kiểm được bằng điểm ngẫu nhiên` };
  }

  const names = [...new Set([...varsOf(a), ...varsOf(b)])].sort();
  const rand = lcg(seed);
  let done = 0;

  for (let attempt = 0; attempt < trials * 4 && done < trials; attempt += 1) {
    const env = new Map<string, bigint>();
    for (const n of names) env.set(n, rand());

    const va = evalAt(a, env);
    const vb = evalAt(b, env);
    // Mẫu triệt tiêu tại điểm này ⇒ điểm vô dụng, không phải bằng chứng sai.
    if (va === null || vb === null) continue;
    done += 1;
    if (va !== vb) {
      const at = names.map((n) => `${n}=${env.get(n)}`).join(', ');
      return { ok: false, message: `khác nhau tại ${at || 'điểm hằng'}: ${va} ≠ ${vb}` };
    }
  }

  if (done === 0) return { ok: true, message: 'không tìm được điểm nào mẫu khác 0' };
  return { ok: true, message: `khớp trên ${done} điểm ngẫu nhiên` };
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
export function sameValueReal(a: Expr, b: Expr, seed: number, trials: number): SoundnessResult {
  const names = [...new Set([...varsOf(a), ...varsOf(b)])].sort();
  let s = (seed >>> 0) || 1;
  const rand = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const u = s / 0x7fffffff;
    // Trong $[-4, -0{,}3] \cup [0{,}3, 4]$: né lân cận $0$ để mẫu số không nổ.
    return u < 0.5 ? -(0.3 + u * 7.4) : 0.3 + (u - 0.5) * 7.4;
  };
  let done = 0;

  for (let attempt = 0; attempt < trials * 40 && done < trials; attempt += 1) {
    const env = new Map<string, number>();
    for (const n of names) env.set(n, rand());

    const va = evalReal(a, env);
    const vb = evalReal(b, env);
    if (va === null || vb === null) continue;
    done += 1;
    const scale = Math.max(1, Math.abs(va), Math.abs(vb));
    if (Math.abs(va - vb) > 1e-9 * scale) {
      const at = names.map((n) => `${n}=${(env.get(n) as number).toFixed(4)}`).join(', ');
      return { ok: false, message: `khác nhau tại ${at || 'điểm hằng'}: ${va} ≠ ${vb}` };
    }
  }

  if (done === 0) return { ok: true, message: 'không tìm được điểm nào xác định' };
  return { ok: true, message: `khớp trên ${done} điểm thực` };
}

/**
 * Giá trị chân lý của một quan hệ tại một điểm. `null` = không xác định ở đây.
 */
export function evalRelation(e: Expr, env: ReadonlyMap<string, number>): boolean | null {
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
  guard: Expr | null,
  seed: number,
  trials = 24,
): SoundnessResult {
  const names = [...new Set([...varsOf(a), ...varsOf(b)])].sort();
  let s = (seed >>> 0) || 1;
  const rand = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const u = s / 0x7fffffff;
    return u < 0.5 ? -(0.25 + u * 9) : 0.25 + (u - 0.5) * 9;
  };
  let done = 0;
  let agree = 0;

  for (let attempt = 0; attempt < trials * 20 && done < trials; attempt += 1) {
    const env = new Map<string, number>();
    for (const n of names) env.set(n, rand());
    if (guard !== null) {
      const g = evalReal(guard, env);
      if (g === null || Math.abs(g) < 1e-6) continue;
    }
    const va = evalRelation(a, env);
    const vb = evalRelation(b, env);
    if (va === null || vb === null) continue;
    done += 1;
    if (va === vb) agree += 1;
    else {
      const at = names.map((n) => `${n}=${(env.get(n) as number).toFixed(4)}`).join(', ');
      return { ok: false, message: `tập nghiệm khác nhau tại ${at || 'điểm hằng'}` };
    }
  }

  if (done === 0) return { ok: true, message: 'không tìm được điểm nào xác định' };
  return { ok: true, message: `cùng chân lý trên ${agree} điểm` };
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

export function definitelyNonNegative(e: Expr): boolean {
  if (varsOf(e).size > 0) return false;
  const v = evalReal(e, new Map());
  return v !== null && v >= 0;
}
