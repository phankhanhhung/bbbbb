import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Problem } from '@combviz/schema';

/**
 * **Đối chiếu độc lập cho loạt bài "bài thi thật"** (loạt 4/4).
 *
 * Cùng kỷ luật ba mạch trước: mọi con số trong narrative kiểm lại bằng một phép duyệt
 * vét cạn viết riêng, không gọi engine và không gọi validator.
 *
 * Ở mạch này có thêm một chiều kiểm **không** phải về toán: R-5 đòi bài thi thật ghi
 * nguồn đầy đủ, và "đầy đủ" là thứ đo được — có `year`, có `slot`, và `contest` không
 * phải `folklore`. Một bài khai nguồn nửa vời trôi qua thì cả điểm của mạch mất.
 */

const ROOT = 'packages/content/problems';
const load = async (id: string): Promise<Problem> =>
  JSON.parse(await readFile(join(ROOT, `${id}.json`), 'utf8')) as Problem;

const CONTEST_IDS = [
  'imo-1964-p4-seventeen-people',
  'imo-1972-p1-ten-two-digit',
  'imo-1987-p1-fixed-points',
] as const;

/** Mọi hoán vị của `[1..n]`, liệt kê thật. */
function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  for (const rest of permutations(n - 1)) {
    for (let i = 0; i <= rest.length; i += 1) {
      out.push([...rest.slice(0, i), n, ...rest.slice(i)]);
    }
  }
  return out;
}

describe('loạt bài thi thật — đối chiếu độc lập', () => {
  it('`imo-1964-p4`: chuồng bồ câu cho $\\ge 6$, và $16$ là ngưỡng **sát**', () => {
    // $16$ lá thư, $3$ màu ⇒ một màu dùng $\ge \lceil 16/3 \rceil = 6$ lần.
    expect(Math.ceil(16 / 3)).toBe(6);
    // Và $15$ thì **không** đủ: $5+5+5$ chia đều, không màu nào tới $6$. Đó là chỗ con
    // số $17$ của đề đến từ đâu — $3 \cdot 5 + 1$ láng giềng, cộng chính người ấy.
    expect(Math.ceil(15 / 3)).toBe(5);
    expect(3 * 5 + 1 + 1).toBe(17);

    // Hình s2 tô $15$ cạnh của $K_6$ bằng hai màu theo chẵn lẻ $(i+j)$. Bài khẳng định
    // nó **phải** có tam giác đơn sắc — kiểm bằng cách duyệt thật, không hỏi validator.
    const colour = (i: number, j: number): number => ((i + j) % 2 === 0 ? 3 : 4);
    let mono = 0;
    for (let i = 0; i < 6; i += 1) {
      for (let j = i + 1; j < 6; j += 1) {
        for (let k = j + 1; k < 6; k += 1) {
          if (colour(i, j) === colour(j, k) && colour(j, k) === colour(i, k)) mono += 1;
        }
      }
    }
    expect(mono).toBeGreaterThan(0);

    // Và khẳng định mạnh hơn, chính là $R(3,3) = 6$: **mọi** cách tô $2$ màu đều thế.
    // $2^{15} = 32768$ cách, duyệt hết được.
    const pairs: [number, number][] = [];
    for (let i = 0; i < 6; i += 1) for (let j = i + 1; j < 6; j += 1) pairs.push([i, j]);
    expect(pairs.length).toBe(15);
    let cleanColourings = 0;
    for (let mask = 0; mask < 1 << 15; mask += 1) {
      const c = new Map<string, number>();
      pairs.forEach(([i, j], t) => c.set(`${i}~${j}`, (mask >> t) & 1));
      let found = false;
      outer: for (let i = 0; i < 6; i += 1) {
        for (let j = i + 1; j < 6; j += 1) {
          for (let k = j + 1; k < 6; k += 1) {
            const a = c.get(`${i}~${j}`);
            if (a === c.get(`${j}~${k}`) && a === c.get(`${i}~${k}`)) {
              found = true;
              break outer;
            }
          }
        }
      }
      if (!found) cleanColourings += 1;
    }
    expect(cleanColourings).toBe(0);
  });

  it('`imo-1972-p1`: $1024 > 946$, và hai tập con của hình **rời nhau, cùng tổng**', () => {
    // Đếm chuồng và đếm bồ câu.
    expect(2 ** 10).toBe(1024);
    // Tổng lớn nhất có thể của mười số hai chữ số phân biệt: $90 + \dots + 99$.
    let maxSum = 0;
    for (let v = 90; v <= 99; v += 1) maxSum += v;
    expect(maxSum).toBe(945);
    expect(maxSum + 1).toBe(946); // các giá trị $0..945$
    expect(2 ** 10).toBeGreaterThan(maxSum + 1);

    // Hai tập con vẽ trên hình s1/s2.
    const ten = [21, 25, 32, 40, 47, 53, 61, 78, 84, 96];
    expect(new Set(ten).size).toBe(10);
    expect(ten.every((v) => v >= 10 && v <= 99)).toBe(true);
    const sum = (ix: number[]): number => ix.reduce((a, i) => a + (ten[i] as number), 0);

    // s1 vẽ hai tập con **giao nhau** cùng tổng — đó mới là thứ chuồng bồ câu hứa.
    const over1 = [0, 2, 6]; // {21, 32, 61}
    const over2 = [0, 3, 5]; // {21, 40, 53}
    expect(sum(over1)).toBe(sum(over2));
    expect(sum(over1)).toBe(114);
    expect(over1.filter((i) => over2.includes(i))).toEqual([0]); // chung đúng số 21

    // s2 bỏ phần chung: $114 - 21 = 93$ ở **cả hai** bên. Hai khẳng định phải kiểm
    // riêng — vẫn cùng tổng, và **rời nhau**.
    const s1 = over1.filter((i) => !over2.includes(i));
    const s2 = over2.filter((i) => !over1.includes(i));
    expect(s1).toEqual([2, 6]);
    expect(s2).toEqual([3, 5]);
    expect(sum(s1)).toBe(sum(s2));
    expect(sum(s1)).toBe(93);
    expect(s1.some((i) => s2.includes(i))).toBe(false);
    // Khác rỗng — lập luận của s2 dựa vào mọi số đều dương.
    expect(s1.length).toBeGreaterThan(0);
    expect(s2.length).toBeGreaterThan(0);
    expect(ten.every((v) => v > 0)).toBe(true);
  });

  it('`imo-1987-p1`: $\\sum_k k\\,p_n(k) = n!$, và cột nào cũng $(n-1)!$ ô', () => {
    for (let n = 1; n <= 7; n += 1) {
      const perms = permutations(n);
      expect(perms.length).toBe([1, 1, 2, 6, 24, 120, 720, 5040][n]);

      // Đếm theo **hàng**: tổng số điểm bất động trên mọi hoán vị.
      const byRow = perms.reduce(
        (acc, p) => acc + p.filter((v, i) => v === i + 1).length,
        0,
      );
      // Đếm theo **cột**: mỗi vị trí $i$ bị giữ nguyên bởi đúng bao nhiêu hoán vị.
      const byCol = Array.from({ length: n }, (_, i) =>
        perms.filter((p) => p[i] === i + 1).length,
      );
      // Khẳng định "không phụ thuộc $i$" của s2 — kiểm từng cột, không chỉ tổng.
      expect(new Set(byCol).size, `n = ${n}`).toBe(1);
      expect(byCol[0], `n = ${n}`).toBe(perms.length / n);

      expect(byRow, `n = ${n}`).toBe(byCol.reduce((a, b) => a + b, 0));
      expect(byRow, `n = ${n}`).toBe(perms.length); // $= n!$
    }

    // Bảng vẽ ở hình là ca $n = 3$: sáu hàng, ba cột, sáu ô tô đậm, mỗi cột hai ô.
    const three = permutations(3);
    expect(three.length).toBe(6);
    expect(
      three.reduce((acc, p) => acc + p.filter((v, i) => v === i + 1).length, 0),
    ).toBe(6);
  });

  it('R-5: ba bài đều ghi nguồn **đầy đủ**, không bài nào là `folklore`', async () => {
    for (const id of CONTEST_IDS) {
      const problem = await load(id);
      expect(problem.source.contest, id).toBe('IMO');
      // `year` và `slot` không phải trang trí: thiếu chúng thì trích dẫn không tra được,
      // và một trích dẫn không tra được thì bằng không có.
      expect(problem.source.year, id).toBeGreaterThan(1900);
      expect(problem.source.slot, id).toBeTruthy();
      expect(problem.source.note?.vi, id).toBeTruthy();
      expect(problem.status, id).toBe('published');
    }
  });

  it('mạch này nâng P3 thật, và kho hết cảnh "gần như bài nào cũng folklore"', async () => {
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir(ROOT)).filter((f) => f.endsWith('.json'));
    const problems = await Promise.all(
      files.map(async (f) => JSON.parse(await readFile(join(ROOT, f), 'utf8')) as Problem),
    );
    const sourced = problems.filter((p) => p.source.contest !== 'folklore');
    // Trước mạch này: đúng **hai** bài trên 134 có nguồn thật.
    expect(sourced.length).toBeGreaterThanOrEqual(5);
    expect(problems.filter((p) => p.difficulty.slot_proxy === 'P3').length).toBeGreaterThanOrEqual(
      11,
    );
  });
});
