import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatProblem } from '../src/format.js';

const load = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../content/problems/${name}.json`, import.meta.url)),
      'utf8',
    ),
  );

describe('DAT-04 — round-trip không mất dữ liệu', () => {
  it.each(['mutilated-chessboard', 'ramsey-3-3-six'])('%s', (name) => {
    const problem = load(name);
    const once = formatProblem(problem);
    const twice = formatProblem(JSON.parse(once));

    expect(twice).toBe(once);
    expect(JSON.parse(once)).toEqual(problem);
  });
});

describe('DAT-03 — thứ tự khoá ổn định', () => {
  it('xáo thứ tự khoá đầu vào không đổi kết quả', () => {
    const problem = load('mutilated-chessboard') as Record<string, unknown>;
    const shuffled = Object.fromEntries(Object.entries(problem).reverse());

    // Không có tính chất này thì Studio ghi lại một bài đã sửa một chữ cũng có thể
    // xáo trộn cả file, và diff git — công cụ review chính (§4.1) — thành vô dụng.
    expect(formatProblem(shuffled)).toBe(formatProblem(problem));
  });

  it('đặt đề bài trước siêu dữ liệu', () => {
    const lines = formatProblem(load('mutilated-chessboard')).split('\n');
    const at = (key: string) => lines.findIndex((l) => l.includes(`"${key}"`));

    expect(at('statement')).toBeLessThan(at('authors'));
    expect(at('statement')).toBeLessThan(at('solutions'));
  });

  it('toạ độ ngắn nằm trên một dòng', () => {
    // `"pos": [3, 4]` xuống bốn dòng thì diff của một nước đi không đọc được.
    expect(formatProblem(load('mutilated-chessboard'))).toContain('"pos": [3, 3]');
  });

  it('khoá lạ vẫn được giữ, xếp sau khoá đã biết', () => {
    const out = formatProblem({ id: 'x', schema_version: '0.1.0', zz_custom: 1 });

    expect(out).toContain('zz_custom');
    expect(out.indexOf('schema_version')).toBeLessThan(out.indexOf('zz_custom'));
  });
});
