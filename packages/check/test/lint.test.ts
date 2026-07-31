import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatProblem, type Problem, type Step } from '@combviz/schema';
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

/**
 * Biến một step của bài mẫu thành nhánh `case`.
 *
 * Bài mẫu là một lời giải thẳng, không có nhánh nào — nên mọi khẳng định mở đầu
 * bằng `find(edge_type === 'case')` rồi `return` khi không thấy đều **không chạy**.
 * Lint không đụng tới cấu trúc cây (đó là việc của `structure`), nên gắn tay ở đây
 * là đủ và an toàn.
 */
function caseStep(problem: Problem): Step {
  const step = problem.solutions[0]!.steps[1]!;
  step.edge_type = 'case';
  return step;
}

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
    // `find(edge_type === 'case')` là cách viết cũ, và bài mẫu **không có** nhánh
    // case nào — nên `if (!step) return` làm cả khẳng định này im lặng trôi qua.
    // Dựng thẳng cái cần kiểm thay vì đi tìm nó.
    const problem = loadExample();
    const step = caseStep(problem);

    step.case_label = { vi: 'nếu nó chẵn' };
    expect(codes(problem)).toContain('lint/case-label-format');

    step.case_label = { vi: 'Trường hợp 1: nó chẵn' };
    expect(codes(problem)).not.toContain('lint/case-label-format');

    step.case_label = { vi: '1a: nó chẵn' };
    expect(codes(problem)).not.toContain('lint/case-label-format');
  });

  it('bắt LaTeX trong nhãn ngắn — chỗ hiện chúng không sắp chữ', () => {
    // Player in `case_label` nguyên văn vào breadcrumb và cây, còn nhãn pha thành
    // `aria-valuetext`. Không chỗ nào chạy KaTeX, nên `$1$` hiện ra đúng bốn ký tự
    // — và trình đọc màn hình đọc thành "đô la một đô la". Bốn bài trong kho đã
    // mắc lỗi này trước khi có luật, kể cả bài viết ngay hôm trước.
    const problem = loadExample();
    const step = caseStep(problem);

    step.case_label = { vi: 'Trường hợp 1: $N$ chẵn' };
    expect(codes(problem)).toContain('lint/label-not-plain');

    step.case_label = { vi: 'Trường hợp 1: N chẵn' };
    expect(codes(problem)).not.toContain('lint/label-not-plain');

    // Giá tiền không phải LaTeX: một dấu `$` lẻ không mở cặp nào.
    step.case_label = { vi: 'Trường hợp 1: giá 5$ trở lên' };
    expect(codes(problem)).not.toContain('lint/label-not-plain');
  });

  it('CHO-11 — timeline dài mà không có mốc dừng nào thì kêu', () => {
    // Bốn thay đổi liên tiếp không một chỗ nghỉ là đúng thứ làm timeline "chạy vù vù
    // khó hiểu". Ngưỡng ở **bốn**: hai ba pha ngắn thì mạch liền vẫn đọc được.
    const problem = loadExample();
    const step = problem.solutions[0]!.steps[0]!;
    const phase = (id: string, at: number): NonNullable<Step['choreography']>['phases'][number] =>
      ({ id, kind: 'show', targets: ['cell-0-0'], at, duration: 400, anchor: 'a1', label: { vi: id } }) as never;

    const three = [phase('p1', 0), phase('p2', 500), phase('p3', 1000)];
    step.choreography = { phases: three } as Step['choreography'];
    expect(codes(problem)).not.toContain('lint/timeline-no-hold');

    three.push(phase('p4', 1500));
    expect(codes(problem)).toContain('lint/timeline-no-hold');

    three[1]!.hold = true;
    expect(codes(problem)).not.toContain('lint/timeline-no-hold');
  });

  it('CHO-11 — `hold` ở pha cuối là vô ích, và lint nói ra', () => {
    const problem = loadExample();
    const step = problem.solutions[0]!.steps[0]!;
    step.choreography = {
      phases: [
        { id: 'p1', kind: 'show', targets: ['cell-0-0'], at: 0, duration: 400, anchor: 'a1', label: { vi: 'một' } },
        { id: 'p2', kind: 'show', targets: ['cell-0-1'], at: 500, duration: 400, anchor: 'a1', label: { vi: 'hai' }, hold: true },
      ],
    } as Step['choreography'];

    expect(codes(problem)).toContain('lint/hold-at-end');
  });

  it('bắt LaTeX trong nhãn pha, không chỉ trong case_label', () => {
    const problem = loadExample();
    const step = problem.solutions[0]!.steps[0]!;
    step.choreography = {
      phases: [
        { id: 'ph1', kind: 'show', targets: ['cell-0-0'], at: 0, duration: 400, label: { vi: 'gộp $x^2$ lại' } },
      ],
    } as Step['choreography'];

    expect(codes(problem)).toContain('lint/label-not-plain');

    step.choreography!.phases[0]!.label = { vi: 'gộp hai ô lại' };
    expect(codes(problem)).not.toContain('lint/label-not-plain');
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

  it('bắt nhánh case chỉ có một anh em, im khi có đủ hai', () => {
    // Cũng thuộc họ "đi tìm rồi `return` khi không thấy": bài mẫu không có nhánh
    // nào nên bản cũ chưa từng chạy tới một khẳng định nào.
    const problem = loadExample();
    const only = caseStep(problem);
    expect(codes(problem)).toContain('lint/lone-case');

    problem.solutions[0]!.steps.push({ ...only, id: `${only.id}-b` });
    expect(codes(problem)).not.toContain('lint/lone-case');
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
