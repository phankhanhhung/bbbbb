import { describe, expect, it } from 'vitest';
import {
  allMoves,
  analyzeGame,
  apply,
  grundyTable,
  isLocalRule,
  losingGrid,
  losingSpectrum,
  movesFromPile,
  spectrum2dReadable,
  spectrumReadable,
  stateSpaceEstimate,
  type Move,
} from '../src/solver.js';
import type { GameRule } from '../src/schema.js';

const NIM: GameRule = { type: 'subtract', min: 1 };
const TAKE_1_3: GameRule = { type: 'subtract', min: 1, max: 3 };
const SET_123: GameRule = { type: 'subtract-set', allowed: [1, 2, 3] };
const SET_14: GameRule = { type: 'subtract-set', allowed: [1, 4] };
const HALF: GameRule = { type: 'subtract-fraction', denominator: 2 };
const THIRD: GameRule = { type: 'subtract-fraction', denominator: 3 };
const SPLIT: GameRule = { type: 'split-unequal' };

/**
 * Người sắp đi có thắng không, tính **thẳng từ định nghĩa** bằng đệ quy.
 *
 * Không dùng Grundy, không dùng XOR, không nhớ kết quả. Đây là thứ duy nhất nói
 * được rằng cả tầng lý thuyết Sprague–Grundy trong solver là đúng — một lỗi ở
 * `mex` hay ở XOR vẫn cho ra những con số trông hoàn toàn hợp lý.
 */
function bruteWin(piles: readonly number[], rule: GameRule, misere: boolean): boolean {
  const moves = allMoves(piles, rule);
  if (moves.length === 0) return misere;
  return moves.some((move) => !bruteWin(apply(piles, move), rule, misere));
}

describe('sinh nước đi', () => {
  it('bốc theo khoảng', () => {
    expect(movesFromPile(5, TAKE_1_3)).toEqual([[4], [3], [2]]);
  });

  it('bốc không giới hạn là Nim', () => {
    expect(movesFromPile(3, NIM)).toEqual([[2], [1], [0]]);
  });

  it('bốc theo tập, bỏ qua số lớn hơn đống', () => {
    expect(movesFromPile(3, SET_14)).toEqual([[2]]);
    expect(movesFromPile(5, SET_14)).toEqual([[4], [1]]);
  });

  it('bốc tối đa **một phần** của đống — cận đọc từ thế', () => {
    expect(movesFromPile(7, HALF)).toEqual([[6], [5], [4]]);
    expect(movesFromPile(6, HALF)).toEqual([[5], [4], [3]]);
    // Đống 1 viên: $\lfloor 1/2 \rfloor = 0$ ⇒ hết nước, đúng luật gốc.
    expect(movesFromPile(1, HALF)).toEqual([]);
    expect(movesFromPile(8, THIRD)).toEqual([[7], [6]]);
  });

  it('chia đống thành hai phần **khác nhau**', () => {
    // 6 = 1+5 = 2+4; 3+3 bị loại vì hai phần bằng nhau.
    expect(movesFromPile(6, SPLIT)).toEqual([[1, 5], [2, 4]]);
    // 1, 2 không chia được; 3 = 1+2.
    expect(movesFromPile(2, SPLIT)).toEqual([]);
    expect(movesFromPile(3, SPLIT)).toEqual([[1, 2]]);
  });

  it('đống rỗng thì hết nước', () => {
    expect(movesFromPile(0, NIM)).toEqual([]);
  });
});

describe('Grundy', () => {
  it('Nim: giá trị Grundy bằng chính cỡ đống', () => {
    expect(grundyTable(6, NIM)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('bốc $1..3$: giá trị Grundy tuần hoàn chu kỳ $4$', () => {
    expect(grundyTable(9, TAKE_1_3)).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
  });

  it('trò Grundy (chia đống): giá trị đã biết', () => {
    // Dãy kinh điển của trò chia đống không đều.
    expect(grundyTable(8, SPLIT)).toEqual([0, 0, 0, 1, 0, 2, 1, 0, 2]);
  });
});

describe('phân tích thế cờ', () => {
  it('Nim: thua đúng khi XOR bằng 0', () => {
    expect(analyzeGame([1, 2, 3], NIM).winning).toBe(false);
    expect(analyzeGame([1, 2, 4], NIM).winning).toBe(true);
  });

  it('nước thắng đưa XOR về 0', () => {
    const result = analyzeGame([1, 2, 4], NIM);
    expect(result.winningMoves).toHaveLength(1);
    // Bốc 1 từ đống 4 còn {1,2,3}, XOR = 0.
    expect(apply([1, 2, 4], result.winningMoves[0]!).sort()).toEqual([1, 2, 3]);
  });

  it('thế thua thì không có nước thắng nào', () => {
    expect(analyzeGame([1, 2, 3], NIM).winningMoves).toEqual([]);
  });

  it('bốc $1..3$ từ $12$ viên: thua, vì $12$ chia hết cho $4$', () => {
    expect(analyzeGame([12], TAKE_1_3).winning).toBe(false);
    expect(analyzeGame([13], TAKE_1_3).winning).toBe(true);
  });

  it('misère khác luật thường, và khác đúng ở chỗ quan trọng', () => {
    // Nim misère một đống: ai bốc viên cuối thì thua, nên để lại đúng 1 viên là
    // thắng — thế 1 viên là thế **thua** của người sắp đi.
    expect(analyzeGame([1], NIM, true).winning).toBe(false);
    expect(analyzeGame([1], NIM, false).winning).toBe(true);
  });

  it('từ chối khi vượt trần thay vì treo', () => {
    const result = analyzeGame([500], NIM);
    expect(result.refused).toMatch(/vượt trần/);
  });
});

/**
 * Đối chiếu vét cạn.
 *
 * Các test trên kiểm những giá trị tôi tra được hoặc nhẩm được. Chúng không nói
 * được gì về những thế tôi **không** nghĩ tới — mà cả lý thuyết Sprague–Grundy
 * là một tầng gián tiếp: Grundy → XOR → thắng/thua. Định nghĩa gốc thì không có
 * tầng nào.
 */
describe('đối chiếu vét cạn', () => {
  const RULES: readonly [string, GameRule][] = [
    ['nim', NIM],
    ['take 1..3', TAKE_1_3],
    ['set {1,2,3}', SET_123],
    ['set {1,4}', SET_14],
    ['half', HALF],
    ['third', THIRD],
    ['split', SPLIT],
  ];

  it('luật chơi thường: mọi thế tới 3 đống, mỗi đống tới 7 viên', () => {
    let checked = 0;
    for (const [name, rule] of RULES) {
      for (let a = 0; a <= 7; a += 1) {
        for (let b = 0; b <= a; b += 1) {
          for (let c = 0; c <= b; c += 1) {
            const piles = [a, b, c].filter((n) => n > 0);
            if (piles.length === 0) continue;
            expect({ name, piles, win: analyzeGame(piles, rule).winning }).toEqual({
              name,
              piles,
              win: bruteWin(piles, rule, false),
            });
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('misère: mọi thế tới 2 đống, mỗi đống tới 7 viên', () => {
    let checked = 0;
    for (const [name, rule] of RULES) {
      for (let a = 1; a <= 7; a += 1) {
        for (let b = 0; b <= a; b += 1) {
          const piles = [a, b].filter((n) => n > 0);
          expect({ name, piles, win: analyzeGame(piles, rule, true).winning }).toEqual({
            name,
            piles,
            win: bruteWin(piles, rule, true),
          });
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('mọi nước được báo là thắng **thật sự** đưa đối thủ vào thế thua', () => {
    for (const [name, rule] of RULES) {
      for (let a = 1; a <= 7; a += 1) {
        for (let b = 0; b <= a; b += 1) {
          const piles = [a, b].filter((n) => n > 0);
          const result = analyzeGame(piles, rule);
          for (const move of result.winningMoves) {
            expect({ name, piles, move }).toEqual({
              name,
              piles,
              move,
            });
            expect(bruteWin(apply(piles, move), rule, false)).toBe(false);
          }
          // Và nếu thế đang thắng thì phải **có** ít nhất một nước thắng.
          expect(result.winning).toBe(result.winningMoves.length > 0);
        }
      }
    }
  });
});

describe('phổ thế thua (view spectrum)', () => {
  it('bốc $1..3$: thua đúng ở bội của $4$', () => {
    const lose = losingSpectrum(12, TAKE_1_3);
    expect(lose.map((v, n) => (v ? n : -1)).filter((n) => n >= 0)).toEqual([0, 4, 8, 12]);
  });

  it('misère bốc $1..3$: vệt sọc **lệch đi một**', () => {
    // Ai bốc viên cuối thì thua, nên thế thua là $n \equiv 1 \pmod 4$.
    const lose = losingSpectrum(13, TAKE_1_3, true);
    expect(lose.map((v, n) => (v ? n : -1)).filter((n) => n >= 0)).toEqual([1, 5, 9, 13]);
  });

  it('bốc tối đa nửa đống: thua đúng ở $2^m - 1$, **không** phải cấp số cộng', () => {
    const lose = losingSpectrum(40, HALF);
    expect(lose.map((v, n) => (v ? n : -1)).filter((n) => n > 0)).toEqual([1, 3, 7, 15, 31]);

    // Đây là lý do luật này phải là một thành viên riêng: không `max` cố định nào
    // dựng lại được dãy trên, vì `subtract` luôn cho thế thua cách đều nhau.
    for (let max = 1; max <= 20; max += 1) {
      const fixed = losingSpectrum(40, { type: 'subtract', min: 1, max })
        .map((v, n) => (v ? n : -1))
        .filter((n) => n > 0);
      expect(fixed).not.toEqual([1, 3, 7, 15, 31]);
    }
  });

  it('phổ khớp phân tích thế một đống', () => {
    const lose = losingSpectrum(15, SET_14);
    for (let n = 1; n <= 15; n += 1) {
      expect({ n, lose: lose[n] }).toEqual({ n, lose: !analyzeGame([n], SET_14).winning });
    }
  });
});

/**
 * Ba họ luật mới: GM-05, GM-06, GM-07.
 *
 * Chỗ này **không** dùng `bruteWin` được như các luật cục bộ. Với Wythoff và trò
 * Euclid, `analyzeGame` đã đi đường duyệt lùi, mà một `bruteWin` có nhớ cũng chính
 * là phép duyệt lùi ấy — so hai bản cùng một thuật toán thì không kiểm được gì
 * ngoài chính nó. Nên đối chứng ở đây là **dạng đóng đã biết của toán học**: dãy
 * Beatty của Wythoff, tỉ số vàng của trò Euclid, công thức Grundy của Nim Lasker.
 * Ba thứ ấy độc lập với mọi dòng code trong kho.
 */
const WYTHOFF: GameRule = {
  type: 'union',
  of: [{ type: 'subtract', min: 1 }, { type: 'subtract-equal-pair' }],
};
const EUCLID: GameRule = { type: 'subtract-multiple-of-other' };
const LASKER: GameRule = {
  type: 'union',
  of: [{ type: 'subtract', min: 1 }, { type: 'split-any' }],
};
const SPLIT_ANY: GameRule = { type: 'split-any' };

const PHI = (1 + Math.sqrt(5)) / 2;

describe('GM-05 — Wythoff: nước đụng **hai** đống', () => {
  it('luật là **toàn cục**, nên không có bảng Grundy', () => {
    expect(isLocalRule(WYTHOFF)).toBe(false);
    expect(isLocalRule(LASKER)).toBe(true);
    // Và solver nói ra điều đó thay vì trả một mảng số trông hợp lý.
    expect(analyzeGame([3, 5], WYTHOFF).grundy).toEqual([]);
  });

  it('thế thua đúng là các cặp Beatty $(\\lfloor n\\varphi \\rfloor, \\lfloor n\\varphi^2 \\rfloor)$', () => {
    const cold = new Set<string>();
    for (let n = 1; n <= 9; n += 1) {
      const a = Math.floor(n * PHI);
      const b = Math.floor(n * PHI * PHI);
      cold.add(`${a},${b}`);
      expect({ n, a, b, win: analyzeGame([a, b], WYTHOFF).winning }).toEqual({
        n,
        a,
        b,
        win: false,
      });
    }
    // $(1,2), (3,5), (4,7), (6,10), \dots$ — và **chỉ** những cặp ấy.
    expect([...cold]).toEqual(['1,2', '3,5', '4,7', '6,10', '8,13', '9,15', '11,18', '12,20', '14,23']);

    for (let a = 1; a <= 14; a += 1) {
      for (let b = a; b <= 23; b += 1) {
        expect({ a, b, win: analyzeGame([a, b], WYTHOFF).winning }).toEqual({
          a,
          b,
          win: !cold.has(`${a},${b}`),
        });
      }
    }
  });

  it('nước chéo **cần thiết**: bỏ nó đi thì bài thành Nim và đáp số đổi', () => {
    // $(3,5)$ thua trong Wythoff, nhưng trong Nim thì $3 \oplus 5 \ne 0$ nên thắng.
    expect(analyzeGame([3, 5], WYTHOFF).winning).toBe(false);
    expect(analyzeGame([3, 5], NIM).winning).toBe(true);
  });

  it('nước thắng gồm **cả hai** kiểu, và mỗi kiểu đụng số đống khác nhau', () => {
    // Từ $(10,15)$ có ba nước thắng: về $(6,10)$, về $(9,15)$ — hai nước một đống
    // — và bốc $2$ ở **cả hai** đống về $(8,13)$.
    const result = analyzeGame([10, 15], WYTHOFF);
    expect(result.winning).toBe(true);
    expect(result.winningMoves.map((m) => m.piles.length).sort()).toEqual([1, 1, 2]);
    for (const move of result.winningMoves) {
      expect(analyzeGame(apply([10, 15], move), WYTHOFF).winning).toBe(false);
    }
  });
});

describe('GM-06 — trò Euclid: nước đọc **đống kia**', () => {
  it('sinh nước theo bội của đống còn lại', () => {
    // $(25,7)$: khỏi đống $25$ bốc được $7, 14, 21$; khỏi đống $7$ thì không có
    // bội nào của $25$ vừa.
    const moves = allMoves([25, 7], EUCLID).map((m) => apply([25, 7], m));
    expect(moves.map((after) => [...after].sort((x, y) => x - y))).toEqual([
      [7, 18],
      [7, 11],
      [4, 7],
    ]);
  });

  it('thắng đúng khi hai đống bằng nhau hoặc tỉ số vượt $\\varphi$', () => {
    // Cole–Davie 1969. Đây là dạng đóng, hoàn toàn độc lập với solver.
    for (let a = 1; a <= 16; a += 1) {
      for (let b = a; b <= 16; b += 1) {
        const expected = a === b || b / a > PHI;
        expect({ a, b, win: analyzeGame([a, b], EUCLID).winning }).toEqual({
          a,
          b,
          win: expected,
        });
      }
    }
  });

  it('cặp Fibonacci **cách một** là thế thua — tỉ số của chúng dưới $\\varphi$', () => {
    // Tỉ số $F_{n+1}/F_n$ nhảy qua nhảy lại quanh $\varphi$, nên chỉ **một nửa**
    // các cặp Fibonacci kề nhau là thế thua: $2/1 > \varphi$, $3/2 < \varphi$,
    // $5/3 > \varphi$, $8/5 < \varphi$, … Đúng chỗ dễ nói vống thành "mọi cặp
    // Fibonacci đều thua".
    for (const [a, b] of [[2, 3], [5, 8], [13, 21], [34, 55]] as const) {
      expect({ a, b, win: analyzeGame([a, b], EUCLID).winning }).toEqual({ a, b, win: false });
    }
  });

  it('một đống thì hết nước — người sắp đi thua', () => {
    expect(allMoves([9], EUCLID)).toEqual([]);
    expect(analyzeGame([9], EUCLID).winning).toBe(false);
  });
});

describe('GM-07 — hợp hai thành viên: Nim Lasker', () => {
  it('`split-any` khác `split-unequal` đúng ở nước chia đôi bằng nhau', () => {
    expect(movesFromPile(4, SPLIT_ANY)).toEqual([[1, 3], [2, 2]]);
    expect(movesFromPile(4, SPLIT)).toEqual([[1, 3]]);
  });

  it('hợp gộp nước của cả hai thành viên, **không** đếm trùng', () => {
    const parts = movesFromPile(4, LASKER);
    expect(parts).toEqual([[3], [2], [1], [0], [1, 3], [2, 2]]);

    // Hợp hai thành viên chồng nhau thì nước trùng bị gộp, nên `moves` không phồng.
    const overlap: GameRule = {
      type: 'union',
      of: [{ type: 'subtract', min: 1, max: 3 }, { type: 'subtract-set', allowed: [2, 5] }],
    };
    expect(movesFromPile(6, overlap)).toEqual([[5], [4], [3], [1]]);
  });

  it('bảng Grundy khớp dạng đóng của Nim Lasker', () => {
    // $g(n) = n$ khi $n \equiv 1, 2$; $n+1$ khi $n \equiv 3$; $n-1$ khi $n \equiv 0 \pmod 4$.
    const closed = (n: number): number =>
      n === 0 ? 0 : n % 4 === 3 ? n + 1 : n % 4 === 0 ? n - 1 : n;
    expect(grundyTable(24, LASKER)).toEqual(
      Array.from({ length: 25 }, (_, n) => closed(n)),
    );
  });

  it('nhánh chia đổi hẳn đáp số: $(1,2,3)$ thua ở Nim mà **thắng** ở Nim Lasker', () => {
    expect(analyzeGame([1, 2, 3], NIM).winning).toBe(false);

    const result = analyzeGame([1, 2, 3], LASKER);
    expect(result.xor).toBe(1 ^ 2 ^ 4);
    expect(result.winning).toBe(true);
    // Và nước thắng **duy nhất** là chia đống $3$ thành $1 + 2$.
    expect(result.winningMoves).toHaveLength(1);
    expect(apply([1, 2, 3], result.winningMoves[0] as Move).sort()).toEqual([1, 1, 2, 2]);
  });
});

describe('đối chiếu vét cạn — luật hợp', () => {
  it('Nim Lasker: mọi thế tới 2 đống, mỗi đống tới 5 viên', () => {
    // Luật hợp vẫn **cục bộ**, nên `analyzeGame` đi đường Grundy → XOR. Đối chứng
    // bằng định nghĩa gốc là thứ duy nhất nói được rằng tầng ấy đúng cho hợp.
    //
    // Trần $5$ chứ không phải $7$ như các luật khác, và đó là con số đo được chứ
    // không phải chọn cho tròn: `bruteWin` không nhớ gì, còn nhánh chia **không**
    // làm tổng số viên giảm, nên số đường đi phình rất nhanh — $7$ viên chạy quá
    // một phút, $5$ viên xong trong chớp mắt.
    for (let a = 1; a <= 5; a += 1) {
      for (let b = 0; b <= a; b += 1) {
        const piles = [a, b].filter((n) => n > 0);
        expect({ piles, win: analyzeGame(piles, LASKER).winning }).toEqual({
          piles,
          win: bruteWin(piles, LASKER, false),
        });
      }
    }
  });
});

describe('phổ và luật toàn cục', () => {
  it('phổ chỉ đọc được cho luật bốc từ **một** đống', () => {
    expect(spectrumReadable(TAKE_1_3)).toBe(true);
    expect(spectrumReadable(HALF)).toBe(true);
    expect(spectrumReadable(SPLIT)).toBe(false);
    expect(spectrumReadable(WYTHOFF)).toBe(false);
    expect(spectrumReadable(EUCLID)).toBe(false);
    expect(spectrumReadable(LASKER)).toBe(false);
  });

  it('`movesFromPile` **không** biết luật toàn cục, và đó là lý do phổ bị chặn', () => {
    // Trả rỗng, không trả sai. Nếu ai đó vẽ phổ cho Wythoff thì mọi thế sẽ trông
    // như thế cuối — hình sẽ tô sạch một màu và rất thuyết phục.
    expect(movesFromPile(9, EUCLID)).toEqual([]);
    expect(movesFromPile(9, WYTHOFF)).toEqual([[8], [7], [6], [5], [4], [3], [2], [1], [0]]);
  });
});

describe('trần không gian thế', () => {
  it('ước lượng là trần **trên**, và nó chặn trước khi solver chạy', () => {
    expect(stateSpaceEstimate([12, 20])).toBe(13 * 21);
    expect(stateSpaceEstimate([200, 200, 200])).toBeGreaterThan(200_000);
  });

  it('luật toàn cục trên thế quá lớn thì **từ chối**, không treo', () => {
    const huge = [200, 200, 200, 200, 200, 200];
    expect(analyzeGame(huge, WYTHOFF).refused).toMatch(/vượt trần/);
  });
});

/**
 * GM-08 — bảng thắng/thua của **mọi** thế hai đống.
 *
 * Đây là phần tính của view `spectrum-2d`, và nó đáng có test riêng vì nó đi
 * đường **khác** `analyzeGame`: quy hoạch động xuôi trên lưới, thay vì duyệt lùi
 * có nhớ. Hai đường cho ra cùng một bảng là một đối chứng thật, không phải một
 * phép so chính mình.
 */
describe('GM-08 — phổ hai chiều', () => {
  const coldCells = (grid: readonly (readonly boolean[])[]): string[] => {
    const out: string[] = [];
    grid.forEach((row, a) => row.forEach((cold, b) => cold && out.push(`${a},${b}`)));
    return out;
  };

  it('luật chia đống **không** vẽ được: từ hai đống nó đi tới ba', () => {
    expect(spectrum2dReadable(WYTHOFF)).toBe(true);
    expect(spectrum2dReadable(EUCLID)).toBe(true);
    expect(spectrum2dReadable(NIM)).toBe(true);
    expect(spectrum2dReadable(LASKER)).toBe(false);
    expect(spectrum2dReadable(SPLIT)).toBe(false);
  });

  it('Nim hai đống: thế thua đúng là **đường chéo**', () => {
    const grid = losingGrid(9, NIM);
    expect(coldCells(grid)).toEqual(
      Array.from({ length: 10 }, (_, n) => `${n},${n}`),
    );
  });

  it('Wythoff: thế thua là **hai tia** — đúng các cặp Beatty, cả hai chiều', () => {
    const grid = losingGrid(20, WYTHOFF);
    const want = new Set(['0,0']);
    for (let n = 1; n <= 12; n += 1) {
      const a = Math.floor(n * PHI);
      const b = Math.floor(n * PHI * PHI);
      if (a <= 20 && b <= 20) {
        want.add(`${a},${b}`);
        want.add(`${b},${a}`);
      }
    }
    expect(new Set(coldCells(grid))).toEqual(want);
  });

  it('trò Euclid: nêm quanh đường chéo, cộng hai trục', () => {
    const grid = losingGrid(16, EUCLID);
    const want: string[] = [];
    for (let a = 0; a <= 16; a += 1) {
      for (let b = 0; b <= 16; b += 1) {
        // Đống rỗng ⇒ hết nước ⇒ người sắp đi thua. Đó là lý do hai trục tô đậm,
        // và cũng là lý do "ai làm một đống về 0 thì thắng".
        const cold =
          a === 0 || b === 0
            ? true
            : a !== b && Math.max(a, b) / Math.min(a, b) < PHI;
        if (cold) want.push(`${a},${b}`);
      }
    }
    expect(coldCells(grid)).toEqual(want);
  });

  it('khớp `analyzeGame` từng ô — hai thuật toán, một bảng', () => {
    for (const [name, rule] of [
      ['nim', NIM],
      ['take 1..3', TAKE_1_3],
      ['wythoff', WYTHOFF],
      ['euclid', EUCLID],
    ] as const) {
      const grid = losingGrid(10, rule);
      for (let a = 0; a <= 10; a += 1) {
        for (let b = 0; b <= 10; b += 1) {
          const piles = [a, b].filter((n) => n > 0);
          const win = piles.length === 0 ? false : analyzeGame(piles, rule).winning;
          expect({ name, a, b, cold: (grid[a] as boolean[])[b] }).toEqual({
            name,
            a,
            b,
            cold: !win,
          });
        }
      }
    }
  });

  it('misère Nim: khớp tiêu chuẩn Bouton, và nó **không** phải "lật đường chéo"', () => {
    // Tiêu chuẩn misère: thế thua khi *hoặc* có đống $\ge 2$ và XOR $= 0$, *hoặc*
    // mọi đống $\le 1$ và số đống cỡ $1$ là **lẻ**. Chỗ dễ đoán sai là nghĩ misère
    // chỉ đảo mọi ô — không: $(3,3)$ thua ở cả hai quy ước, chỉ vùng "toàn đống
    // một viên" mới đổi.
    const grid = losingGrid(8, NIM, true);
    for (let a = 0; a <= 8; a += 1) {
      for (let b = 0; b <= 8; b += 1) {
        const ones = [a, b].filter((n) => n === 1).length;
        const cold =
          Math.max(a, b) >= 2 ? (a ^ b) === 0 : ones % 2 === 1;
        expect({ a, b, cold: (grid[a] as boolean[])[b] }).toEqual({ a, b, cold });
      }
    }
    // Và luật thường thì $(0,0)$ thua, misère thì thắng — thế cuối là chỗ **duy
    // nhất** hai quy ước khác nhau về định nghĩa.
    expect((losingGrid(6, NIM)[0] as boolean[])[0]).toBe(true);
    expect((losingGrid(6, NIM, true)[0] as boolean[])[0]).toBe(false);
  });
});
