import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Problem } from '@combviz/schema';

/**
 * **Đối chiếu độc lập cho loạt bài hàm sinh** (loạt 3/4).
 *
 * Mọi con số mà năm bài khẳng định đều được kiểm lại ở đây bằng một phép **duyệt vét
 * cạn viết riêng** — không gọi engine đại số, không gọi validator, không dùng lại một
 * dòng nào của mã đang được kiểm.
 *
 * Vì sao phải thế: luật viết lại và bộ kiểm chuỗi của engine đi qua **cùng** một cây
 * biểu thức. Nếu tao đối chiếu narrative với engine thì hai bên sai cùng nhau mà vẫn
 * khớp, và cổng vẫn xanh — đúng bài học M78.3. Phép đếm dưới đây liệt kê từng vật một
 * và đếm bằng tay máy, nên nó sai theo một cách *khác* nếu nó sai.
 */

const ROOT = 'packages/content/problems';
const load = async (id: string): Promise<Problem> =>
  JSON.parse(await readFile(join(ROOT, `${id}.json`), 'utf8')) as Problem;

/** Mọi phân hoạch của `n` với phần ≤ `cap`, liệt kê thật. */
function partitions(n: number, cap = n): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  for (let part = Math.min(n, cap); part >= 1; part -= 1) {
    for (const rest of partitions(n - part, part)) out.push([part, ...rest]);
  }
  return out;
}

/** Liên hợp của một phân hoạch: cột thứ $i$ của biểu đồ Ferrers dài bao nhiêu. */
const conjugate = (lam: number[]): number[] =>
  Array.from({ length: lam[0] ?? 0 }, (_, i) => lam.filter((p) => p > i).length);

/** Mọi hợp thành của `n` — có kể thứ tự. */
function compositions(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  for (let first = 1; first <= n; first += 1) {
    for (const rest of compositions(n - first)) out.push([first, ...rest]);
  }
  return out;
}

/** Mọi đường Dyck độ dài $2n$, liệt kê bằng cách đi từng bước. */
function dyckPaths(n: number): string[] {
  const out: string[] = [];
  const walk = (path: string, up: number, height: number): void => {
    if (path.length === 2 * n) {
      if (height === 0) out.push(path);
      return;
    }
    if (up < n) walk(`${path}U`, up + 1, height + 1);
    if (height > 0) walk(`${path}D`, up, height - 1);
  };
  walk('', 0, 0);
  return out;
}

describe('loạt bài hàm sinh — đối chiếu độc lập với phép duyệt vét cạn', () => {
  it('`partitions-ferrers-conjugate`: lật là **song ánh**, và nó đổi số phần ↔ phần lớn nhất', () => {
    const lam = [4, 2, 1];
    expect(lam.reduce((a, b) => a + b, 0)).toBe(7);
    // Con số bài khẳng định trong narrative s1.
    expect(conjugate(lam)).toEqual([3, 2, 1, 1]);
    expect(conjugate(lam).reduce((a, b) => a + b, 0)).toBe(7);

    // Lật hai lần về chỗ cũ — chỗ này *là* lý do nó là song ánh, nên phải kiểm trên
    // **mọi** phân hoạch, không chỉ trên ca của bài.
    for (const p of partitions(9)) expect(conjugate(conjugate(p))).toEqual(p);

    // Và khẳng định trung tâm của s2: số phân hoạch có đúng $k$ phần bằng số phân
    // hoạch có phần lớn nhất bằng $k$.
    for (let n = 1; n <= 9; n += 1) {
      const all = partitions(n);
      for (let k = 1; k <= n; k += 1) {
        expect(all.filter((p) => p.length === k).length).toBe(
          all.filter((p) => p[0] === k).length,
        );
      }
    }
  });

  it('`partitions-bounded-parts-gf`: $6$ thành phần $\\le 3$ có đúng **bảy** cách', () => {
    const seven = partitions(6, 3);
    expect(seven.length).toBe(7);
    // Bảy cách ấy được liệt kê nguyên văn trong narrative s2 — nên liệt kê lại ở đây,
    // không chỉ đếm. Một con số đúng với một danh sách sai vẫn là một bài sai.
    expect(seven.map((p) => p.join('+')).sort()).toEqual(
      [
        '1+1+1+1+1+1',
        '2+1+1+1+1',
        '2+2+1+1',
        '2+2+2',
        '3+1+1+1',
        '3+2+1',
        '3+3',
      ].sort(),
    );
    // λ = 3+2+1 là hình vẽ ở pane phải: nó phải thật sự nằm trong danh sách ấy.
    expect(seven.some((p) => p.join('+') === '3+2+1')).toBe(true);
  });

  it('`compositions-two-power-gf`: hợp thành của $n$ đúng bằng $2^{n-1}$', () => {
    for (let n = 1; n <= 12; n += 1) {
      expect(compositions(n).length, `n = ${n}`).toBe(2 ** (n - 1));
    }
    // Hình s0 vẽ thanh $5$ ô với vạch **trước** vị trí $1$ và trước vị trí $3$
    // (`cut.before`, không phải `pos`) ⇒ hợp thành $1+2+2$. Đây đúng là chỗ tao đọc sai
    // một lần: nhìn hình mới thấy nó không phải $2+2+1$.
    expect(compositions(5).some((c) => c.join('+') === '1+2+2')).toBe(true);
  });

  it('`catalan-first-return-gf`: truy hồi tích chập, và nhát cắt **là** lần chạm đầu', () => {
    const counts = Array.from({ length: 8 }, (_, n) => dyckPaths(n).length);
    expect(counts).toEqual([1, 1, 2, 5, 14, 42, 132, 429]);

    // Khẳng định của s2, viết đúng chỉ số mà hình in ra:
    // $C_n = \sum_{k=0}^{n-1} C_k C_{n-1-k}$ — cùng một hệ thức, đánh chỉ số lệch một.
    for (let n = 0; n + 1 < counts.length; n += 1) {
      let sum = 0;
      for (let k = 0; k <= n; k += 1) sum += (counts[k] as number) * (counts[n - k] as number);
      expect(counts[n + 1], `n = ${n}`).toBe(sum);
    }

    // Đường vẽ ở s0/s1 là UDUUDD, và bài nói lần chạm trục đầu tiên ở sau **hai** bước
    // — đó là chỗ `split: 2` của hình. Kiểm bằng cách đi lại đường ấy.
    const path = 'UDUUDD';
    expect(dyckPaths(3)).toContain(path);
    let height = 0;
    let firstReturn = -1;
    for (const [i, ch] of [...path].entries()) {
      height += ch === 'U' ? 1 : -1;
      if (height === 0) {
        firstReturn = i + 1;
        break;
      }
    }
    expect(firstReturn).toBe(2);
  });

  it('`bounded-parts-inclusion-exclusion`: $\\binom{n+1}{1} - 2\\binom{n-4}{1} + \\binom{n-9}{1}$', () => {
    // Đếm thật: hai bạn, mỗi bạn 0..4 cái.
    const brute = (n: number): number => {
      let count = 0;
      for (let a = 0; a <= 4; a += 1) {
        const b = n - a;
        if (b >= 0 && b <= 4) count += 1;
      }
      return count;
    };
    // Công thức mà engine dựng ra, kèm **đúng** hai điều kiện nó tự sinh: chỉ trừ khi
    // có gì để trừ. Bỏ điều kiện đi thì công thức sai, và đó là nội dung của bài.
    const formula = (n: number): number =>
      n + 1 - (n >= 5 ? 2 * (n - 4) : 0) + (n >= 10 ? n - 9 : 0);
    for (let n = 0; n <= 14; n += 1) {
      expect(formula(n), `n = ${n}`).toBe(brute(n));
    }
  });

  it('năm bài có mặt, đều `published`, và đều khai kỹ thuật hàm sinh hoặc song ánh', async () => {
    const ids = [
      'partitions-ferrers-conjugate',
      'partitions-bounded-parts-gf',
      'compositions-two-power-gf',
      'catalan-first-return-gf',
      'bounded-parts-inclusion-exclusion',
    ];
    for (const id of ids) {
      const problem = await load(id);
      expect(problem.status, id).toBe('published');
      expect(
        problem.techniques.some((t) => t === 'generating-function' || t === 'bijection'),
        id,
      ).toBe(true);
    }
  });
});
