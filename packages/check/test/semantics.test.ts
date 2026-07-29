import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { boardSchemaFragment, boardEnvironment } from '@combviz/engine-board';
import type { Problem, ValidationIssue } from '@combviz/schema';
import { checkSemantics, type EngineDslModule } from '../src/semantics.js';

const ENGINES: Record<string, EngineDslModule> = {
  board: { fragment: boardSchemaFragment, environment: boardEnvironment },
};

const EXAMPLE_PATH = fileURLToPath(
  new URL('../../content/problems/mutilated-chessboard.json', import.meta.url),
);

function loadExample(): Problem {
  return JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8')) as Problem;
}

const run = (problem: Problem): ValidationIssue[] => checkSemantics(problem, ENGINES);
const codes = (problem: Problem): string[] => run(problem).map((i) => i.code);

describe('AUT-04 — eval invariant/validator mọi step', () => {
  it('bài mẫu không sinh vấn đề nào', () => {
    expect(run(loadExample())).toEqual([]);
  });

  it('bắt biểu thức invariant sai cú pháp', () => {
    const problem = loadExample();
    problem.invariants![0]!.expr = 'count(cells, c => ';

    expect(codes(problem)).toContain('dsl/parse-error');
  });

  it('bắt invariant tham chiếu tên không tồn tại', () => {
    const problem = loadExample();
    problem.invariants![0]!.expr = 'count(o_vuong, c => true)';

    expect(codes(problem)).toContain('dsl/eval-error');
  });

  it('bắt invariant tham chiếu thuộc tính không tồn tại', () => {
    const problem = loadExample();
    problem.invariants![0]!.expr = 'count(cells, c => c.mau == 1)';

    expect(codes(problem)).toContain('dsl/eval-error');
  });

  it('bắt invariant trả về giá trị không phải số', () => {
    const problem = loadExample();
    problem.invariants![0]!.expr = 'exists(cells, c => covered(c))';

    // Sparkline của PLY-06 vẽ số; một invariant trả true/false sẽ hiện ra ô trống
    // và không ai biết vì sao.
    expect(codes(problem)).toContain('dsl/invariant-not-number');
  });

  it('bắt biểu thức chỉ hỏng ở một step cụ thể', () => {
    const problem = loadExample();
    // `tiles` rỗng ở step 0 và 1, chỉ step 2 mới có quân — `min` trên tập rỗng
    // là lỗi, và nó chỉ lộ ra nếu validate chạy trên **mọi** step.
    problem.invariants![0]!.expr = 'min(tiles, t => t.row)';

    const issues = run(problem).filter((i) => i.code === 'dsl/eval-error');

    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.message).toContain('s0');
  });

  it('bắt validator khai trong sandbox mà engine không có', () => {
    const problem = loadExample();
    problem.sandbox!.validators = ['tiles-no-overlap', 'khong-co-cai-nay'];

    const issues = run(problem);
    const unknown = issues.find((i) => i.code === 'sandbox/unknown-validator');

    expect(unknown).toBeDefined();
    expect(unknown!.hint).toContain('tiles-no-overlap');
  });

  it('bắt goal_expr sai cú pháp', () => {
    const problem = loadExample();
    problem.sandbox!.goal_expr = 'count(cells, c => !covered(c) == 0';

    expect(codes(problem)).toContain('dsl/parse-error');
  });

  it('cảnh báo — không phải lỗi — khi một step vi phạm validator', () => {
    const problem = loadExample();
    const scene = problem.solutions[0]!.steps[2]!.scene!;
    // Đặt hai domino chồng nhau.
    scene.elements = [
      { id: 't1', type: 'tile', shape: 'domino', pos: [3, 3], rot: 0 },
      { id: 't2', type: 'tile', shape: 'domino', pos: [3, 4], rot: 0 },
    ];
    problem.solutions[0]!.steps[2]!.anchors = { a3: { ids: ['t1', 't2'] } };

    const issue = run(problem).find(
      (i) => i.code === 'validator/violated-in-step',
    );

    // Một step hoàn toàn có thể cố tình bày cấu hình sai để chỉ ra chỗ sai; chặn
    // cứng ở đây sẽ cấm mất một kiểu lập luận hợp lệ.
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });
});
