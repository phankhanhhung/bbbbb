import type { Expr, FnName } from './expr.js';

/**
 * Bảng hàm — **chỗ duy nhất** biết một hàm cụ thể làm gì.
 *
 * Nút `fn` cố ý chỉ có *một* biến thể cho cả họ (`expr.ts`). Cái giá của việc ấy là mọi
 * thứ riêng của từng hàm phải ở đâu đó, và "đâu đó" là đây: arity, cách in chữ trơn,
 * cách tính trên số nguyên và trên số thực, miền xác định. Hàm mới về sau — $\log$,
 * $\exp$, $\sin$ — là **một dòng bảng**, không phải một vòng sửa sáu tệp.
 *
 * Cách vẽ thì **không** ở đây: nó cần kiểu `Box` của `typeset.ts`, mà `typeset` đã
 * import từ `expr`, nên để cách vẽ vào bảng là dựng một vòng import. Cách vẽ sống ở
 * `typeset.ts`, và bảng ở đây là nguồn cho mọi thứ còn lại.
 */

export interface FnSpec {
  readonly arity: number;
  /** Cách viết trong cú pháp mặt — `unparse` in ra đúng cái này. */
  readonly source: string;
  /** Chữ trơn cho dòng điều kiện và lời từ chối. `n!`, `C(n,k)`. */
  readonly plain: (args: readonly string[]) => string;
  /**
   * Tính trên số nguyên. `null` = điểm này vô dụng (ngoài miền), **không** phải sai.
   *
   * Đối số đến đây đã là số thực bất kỳ, nên hàm tự kiểm tính nguyên: bộ bốc điểm bốc
   * số nguyên nhưng một biểu thức lồng có thể sinh ra $n/2$ ở giữa chừng.
   */
  readonly evalNum: (args: readonly number[]) => number | null;
}

/**
 * Giai thừa, chỉ ở chỗ nó còn **chính xác**.
 *
 * $18! \approx 6{,}4\times10^{15}$ là số cuối cùng còn nằm dưới $2^{53}$, tức số cuối
 * cùng mà `number` biểu diễn không sai một đơn vị. Quá đó thì phép so `va !== vb` của bộ
 * kiểm so hai số **đã làm tròn**, và nó sẽ báo "khớp" cho hai thứ không bằng nhau. Trả
 * `null` để điểm ấy bị bỏ, chứ không trả một con số gần đúng.
 */
const FACT_EXACT_MAX = 18;

function factorial(n: number): number | null {
  if (!Number.isInteger(n) || n < 0 || n > FACT_EXACT_MAX) return null;
  let r = 1;
  for (let i = 2; i <= n; i += 1) r *= i;
  return r;
}

/**
 * $C_n^k$ tính **nhân dần**, không qua ba giai thừa.
 *
 * $C_{20}^{10}$ chỉ là $184\,756$ trong khi $20!$ đã tràn khỏi vùng chính xác — đi qua
 * giai thừa là tự chuốc lấy `null` ở chỗ kết quả vẫn còn nhỏ. Nhân dần thì mỗi bước là
 * một số nguyên (tích $k$ số nguyên liên tiếp chia hết cho $k!$), nên không có sai số
 * nào tích luỹ.
 *
 * Quy ước ở biên: $k < 0$ hoặc $k > n$ cho $0$ — không phải "ngoài miền". Nhờ nó
 * `pascal` đúng cả ở $k = 0$: $C_n^0 = C_{n-1}^{-1} + C_{n-1}^{0} = 0 + 1$.
 */
function binomial(n: number, k: number): number | null {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0) return null;
  if (k < 0 || k > n) return 0;
  const j = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < j; i += 1) r = (r * (n - i)) / (i + 1);
  return Number.isSafeInteger(r) ? r : null;
}

/** $A_n^k = \dfrac{n!}{(n-k)!}$ — cũng nhân dần, cùng lý do. */
function permutation(n: number, k: number): number | null {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0) return null;
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i += 1) r *= n - i;
  return Number.isSafeInteger(r) ? r : null;
}

export const FUNCTIONS: Readonly<Record<FnName, FnSpec>> = {
  fact: {
    arity: 1,
    source: 'fact',
    plain: (a) => `${a[0] as string}!`,
    evalNum: (a) => factorial(a[0] as number),
  },
  binom: {
    arity: 2,
    source: 'C',
    plain: (a) => `C(${a[0] as string},${a[1] as string})`,
    evalNum: (a) => binomial(a[0] as number, a[1] as number),
  },
  perm: {
    arity: 2,
    source: 'A',
    plain: (a) => `A(${a[0] as string},${a[1] as string})`,
    evalNum: (a) => permutation(a[0] as number, a[1] as number),
  },
};

/**
 * Biểu thức có phần **chỉ sống ở số nguyên** không.
 *
 * Quyết định bộ bốc điểm nào chạy (`check.ts`). Ba hàm tổ hợp đều thế: $n!$ ở $n = 2{,}7$
 * không phải một câu khó tính, nó là một câu không có nghĩa trong phạm vi engine này.
 */
export const isIntegerOnly = (name: FnName): boolean =>
  name === 'fact' || name === 'binom' || name === 'perm';

/** Đối số của một hàm, đã kiểm arity. Trả lời từ chối khi lệch. */
export function checkArity(e: Expr & { k: 'fn' }): string | null {
  const spec = FUNCTIONS[e.name];
  return e.args.length === spec.arity
    ? null
    : `${spec.source} cần ${spec.arity} đối số, đang có ${e.args.length}`;
}
