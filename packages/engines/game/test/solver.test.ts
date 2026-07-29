import { describe, expect, it } from 'vitest';
import {
  allMoves,
  analyzeGame,
  apply,
  grundyTable,
  losingSpectrum,
  movesFromPile,
} from '../src/solver.js';
import type { GameRule } from '../src/schema.js';

const NIM: GameRule = { type: 'subtract', min: 1 };
const TAKE_1_3: GameRule = { type: 'subtract', min: 1, max: 3 };
const SET_123: GameRule = { type: 'subtract-set', allowed: [1, 2, 3] };
const SET_14: GameRule = { type: 'subtract-set', allowed: [1, 4] };
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

  it('phổ khớp phân tích thế một đống', () => {
    const lose = losingSpectrum(15, SET_14);
    for (let n = 1; n <= 15; n += 1) {
      expect({ n, lose: lose[n] }).toEqual({ n, lose: !analyzeGame([n], SET_14).winning });
    }
  });
});
