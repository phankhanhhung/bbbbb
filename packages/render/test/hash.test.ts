import { describe, expect, it } from 'vitest';
import { canonicalStringify, hashScene, hashString } from '../src/hash.js';

describe('canonicalStringify', () => {
  it('không phụ thuộc thứ tự khoá', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe(canonicalStringify({ a: 2, b: 1 }));
  });

  it('vẫn phụ thuộc thứ tự phần tử mảng', () => {
    expect(canonicalStringify([1, 2])).not.toBe(canonicalStringify([2, 1]));
  });

  it('bỏ qua khoá có giá trị undefined', () => {
    expect(canonicalStringify({ a: 1, b: undefined })).toBe(canonicalStringify({ a: 1 }));
  });
});

describe('hashScene', () => {
  it('hai scene cùng nội dung khác thứ tự khoá cho cùng hash', () => {
    const a = { engine: 'board', config: { rows: 8, cols: 8 }, elements: [] };
    const b = { elements: [], config: { cols: 8, rows: 8 }, engine: 'board' };

    // Nếu hash phụ thuộc thứ tự khoá thì cache analyzer (ENG-04) trượt sạch mỗi
    // lần Studio ghi lại file, và ta sẽ tưởng là analyzer chậm.
    expect(hashScene(a)).toBe(hashScene(b));
  });

  it('đổi một giá trị thì hash đổi', () => {
    expect(hashScene({ rows: 8 })).not.toBe(hashScene({ rows: 9 }));
  });

  it('ổn định giữa các lần chạy', () => {
    expect(hashString('mutilated-chessboard')).toBe(
      hashString('mutilated-chessboard'),
    );
  });
});
