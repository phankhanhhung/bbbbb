import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatProblem, type Problem } from '@combviz/schema';
import { lintProblem } from '../src/lint.js';

/**
 * Lint biên tập chỉ có giá trị nếu nó im lặng trên bài đúng.
 *
 * Một linter kêu trên chính kho của mình sẽ bị bỏ qua trong tuần đầu, và từ đó
 * mọi cảnh báo thật cũng chìm theo. Vì vậy test đầu tiên là "bài mẫu sạch", và
 * các test còn lại đều bắt đầu từ bài mẫu rồi phá đúng một thứ.
 */
const EXAMPLE_PATH = fileURLToPath(
  new URL('../../content/problems/mutilated-chessboard.json', import.meta.url),
);

function loadExample(): Problem {
  return JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8')) as Problem;
}

const codes = (problem: Problem, raw?: string): string[] =>
  lintProblem(problem, raw).map((i) => i.code);

describe('AUT-10 — lint biên tập', () => {
  it('bài mẫu không sinh cảnh báo nào', () => {
    const problem = loadExample();
    expect(lintProblem(problem, formatProblem(problem))).toEqual([]);
  });

  it('bắt file chưa fmt', () => {
    const problem = loadExample();
    expect(codes(problem, '{}')).toContain('lint/not-formatted');
  });

  it('không kêu fmt khi không được đưa nội dung thô', () => {
    // Studio giữ bài trong bộ nhớ, không có "file gốc" để so — cảnh báo fmt ở đó
    // sẽ luôn sai.
    expect(codes(loadExample())).not.toContain('lint/not-formatted');
  });

  it('bắt thuật ngữ lệch glossary trong đề bài lẫn narrative', () => {
    const problem = loadExample();
    problem.statement.vi = `${problem.statement.vi} Dùng nguyên lý chuồng bồ câu.`;
    problem.solutions[0]!.steps[0]!.narrative!.vi += ' Mỗi hình vuông đơn vị.';

    const found = lintProblem(problem).filter((i) => i.code === 'lint/glossary');
    expect(found).toHaveLength(2);
    expect(found[0]!.message).toContain('nguyên lý Dirichlet');
    expect(found[1]!.message).toContain('"ô"');
  });

  it('glossary quét lại từ đầu mỗi lần — regex /g giữ lastIndex', () => {
    // Regex có cờ /g nhớ vị trí giữa các lần exec. Nếu quên reset, bài thứ hai
    // dùng cùng một từ sai sẽ lọt.
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.narrative!.vi += ' đồ thị lưỡng phân';
    problem.solutions[0]!.steps[1]!.narrative!.vi += ' đồ thị lưỡng phân';

    expect(codes(problem).filter((c) => c === 'lint/glossary')).toHaveLength(2);
  });

  it('bắt case_label sai mẫu và bỏ qua case_label đúng mẫu', () => {
    const problem = loadExample();
    const step = problem.solutions[0]!.steps.find((s) => s.edge_type === 'case');
    if (!step) return;

    step.case_label = { vi: 'nếu nó chẵn' };
    expect(codes(problem)).toContain('lint/case-label-format');

    step.case_label = { vi: 'Trường hợp 1: nó chẵn' };
    expect(codes(problem)).not.toContain('lint/case-label-format');

    step.case_label = { vi: '1a: nó chẵn' };
    expect(codes(problem)).not.toContain('lint/case-label-format');
  });

  it('bắt step có hình mà narrative không neo vào gì', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.narrative = { vi: 'Không neo vào đâu cả.' };

    expect(codes(problem)).toContain('lint/no-anchor');
  });

  it('bắt khoảng trắng thừa', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.narrative!.vi += '  thừa. ';

    expect(codes(problem)).toContain('lint/whitespace');
  });

  it('bắt step quá nhiều câu', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.narrative = {
      vi: 'Một. Hai. Ba. Bốn. Năm.',
    };

    expect(codes(problem)).toContain('lint/too-many-sentences');
  });

  it('bắt thiếu alt_text — nhưng chỉ khi đã published', () => {
    const problem = loadExample();
    delete problem.solutions[0]!.steps[0]!.alt_text;

    expect(codes(problem)).toContain('lint/missing-alt-text');

    problem.status = 'draft';
    expect(codes(problem)).not.toContain('lint/missing-alt-text');
  });

  it('bắt nhánh case chỉ có một anh em', () => {
    const problem = loadExample();
    const cases = problem.solutions[0]!.steps.filter((s) => s.edge_type === 'case');
    if (cases.length < 2) return;

    problem.solutions[0]!.steps = problem.solutions[0]!.steps.filter(
      (s) => s.id !== cases[1]!.id,
    );

    expect(codes(problem)).toContain('lint/lone-case');
  });

  it('cổng publish: thiếu og_step_ref và sandbox chỉ tính khi published', () => {
    const problem = loadExample();
    delete problem.og_step_ref;
    delete problem.sandbox;

    expect(codes(problem)).toEqual(
      expect.arrayContaining(['lint/no-og-step', 'lint/no-sandbox']),
    );

    problem.status = 'draft';
    const draft = codes(problem);
    expect(draft).not.toContain('lint/no-og-step');
    expect(draft).not.toContain('lint/no-sandbox');
  });

  it('mọi vấn đề đều là cảnh báo — lint không chặn', () => {
    const problem = loadExample();
    problem.statement.vi += ' pigeonhole';
    problem.solutions[0]!.steps[0]!.narrative = { vi: 'Một. Hai. Ba. Bốn. Năm.' };

    const issues = lintProblem(problem, '{}');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
  });
});
