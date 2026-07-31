import { totalDegree, varsOf, type Expr } from './expr.js';

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
    case 'rel':
      // Quan hệ không có "giá trị" — nhóm ★ kiểm bằng cấu trúc, không bằng số.
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
 * Biểu thức này có **chắc chắn khác $0$** không (AL-08).
 *
 * Chỉ trả `true` khi nó là hằng khác $0$. Có biến ⇒ `false`, kể cả $x^2+1$ vốn không
 * có nghiệm thực — vì trên $\mathbb{C}$ thì có, và vì engine không có cách nào biết
 * miền của biến. Thà cảnh báo thừa còn hơn để lọt đúng cái bẫy mà luật này sinh ra
 * để bắt.
 */
export function definitelyNonZero(e: Expr): boolean {
  if (varsOf(e).size > 0) return false;
  const v = evalAt(e, new Map());
  return v !== null && v !== 0n;
}
