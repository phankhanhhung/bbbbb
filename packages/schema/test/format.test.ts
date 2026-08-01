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

/**
 * Hai chỗ `nestedShape` từng bỏ quên — cùng căn bệnh công dân hạng hai mà M66
 * chữa ở lớp kiểm, lần này ở bộ định dạng: cấu trúc lồng không có tên trong bảng
 * thì toàn bộ ruột của nó rơi về alphabet, và diff của đúng phần đó thành khó đọc.
 */
describe('DAT-03 — shape lồng không rơi về alphabet', () => {
  interface LooseStep {
    bijection?: { scene: { elements: Record<string, unknown>[] } & Record<string, unknown> };
    choreography?: { phases: Record<string, unknown>[] };
  }
  const stepsOf = (formatted: string): LooseStep[] =>
    (JSON.parse(formatted) as { solutions: { steps: LooseStep[] }[] }).solutions[0]!.steps;

  it('ruột pane phải của bijection xếp theo shape scene, không theo alphabet', () => {
    const step = stepsOf(formatProblem(load('rooks-permutation-bijection'))).find(
      (s) => s.bijection,
    )!;
    const keys = Object.keys(step.bijection!.scene);

    // Alphabet sẽ cho config < elements < engine; shape scene đòi engine đứng đầu.
    expect(keys.indexOf('engine')).toBeLessThan(keys.indexOf('config'));
    expect(keys.indexOf('config')).toBeLessThan(keys.indexOf('elements'));
    expect(Object.keys(step.bijection!.scene.elements[0]!)[0]).toBe('id');
  });

  it('phase xếp id/kind/targets trước — không phải anchor đứng đầu theo alphabet', () => {
    const phase = stepsOf(formatProblem(load('erase-residue-classes-game'))).flatMap(
      (s) => s.choreography?.phases ?? [],
    )[0]!;
    const keys = Object.keys(phase);

    expect(keys.indexOf('id')).toBeLessThan(keys.indexOf('anchor'));
    expect(keys.indexOf('kind')).toBeLessThan(keys.indexOf('at'));
  });

  it('round-trip vẫn đứng vững trên bài có bijection lẫn choreography', () => {
    for (const name of ['rooks-permutation-bijection', 'erase-residue-classes-game']) {
      const problem = load(name);
      const once = formatProblem(problem);

      expect(formatProblem(JSON.parse(once))).toBe(once);
      expect(JSON.parse(once)).toEqual(problem);
    }
  });
});
