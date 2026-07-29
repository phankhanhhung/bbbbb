import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createValidator, type Problem } from '@combviz/schema';
import { createChecker } from '@combviz/check';
import { ENGINE_DSL, ENGINE_FRAGMENTS } from '../src/engines.js';

const EXAMPLE_PATH = fileURLToPath(
  new URL('../../../packages/content/problems/mutilated-chessboard.json', import.meta.url),
);

/**
 * Cố ý test qua **composition root** chứ không ráp validator riêng trong test:
 * đây đúng là bộ mà CLI và CI chạy (AUT-04). Test một cấu hình khác với cấu hình
 * chạy thật là cách êm ái nhất để có CI xanh vô nghĩa.
 */
const validator = createValidator(ENGINE_FRAGMENTS);

function loadExample(): Problem {
  return JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8')) as Problem;
}

/** Lấy mã lỗi cho gọn — test khẳng định *luật nào* bị vi phạm, không phải câu chữ. */
function codes(data: unknown): string[] {
  return validator.validateProblem(data).issues.map((i) => i.code);
}

describe('bài mẫu', () => {
  it('validate sạch, không lỗi cũng không cảnh báo', () => {
    const result = validator.validateProblem(loadExample());
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('DAT-20 — brand-lock', () => {
  it('từ chối trường style tự do và giải thích vì sao', () => {
    const problem = loadExample();
    const scene = problem.solutions[0]!.steps[2]!.scene!;
    (scene.elements[0] as Record<string, unknown>)['fill'] = '#ff0000';

    const issues = validator.validateProblem(problem).issues;
    const styleIssue = issues.find((i) => i.code === 'schema/forbidden-style-field');

    expect(styleIssue).toBeDefined();
    expect(styleIssue!.hint).toContain('color_class');
  });

  it('từ chối color_class ngoài 1..8', () => {
    const problem = loadExample();
    const scene = problem.solutions[0]!.steps[2]!.scene!;
    (scene.elements[0] as Record<string, unknown>)['color_class'] = 12;

    expect(codes(problem)).toContain('schema/maximum');
  });
});

describe('ANC-02 — anchor rot', () => {
  it('bắt anchor trỏ tới element không tồn tại', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.anchors!['a1']!.ids = ['cell-99-99'];

    expect(codes(problem)).toContain('anchor/unknown-element');
  });

  it('chấp nhận anchor trỏ tới ô ngầm định sinh từ config', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.anchors!['a1']!.ids = ['cell-4-4'];

    expect(codes(problem)).not.toContain('anchor/unknown-element');
  });

  it('cho phép anchor trỏ tới ô đã bị khoét', () => {
    // "Bàn cờ khuyết hai ô góc đối nhau" — chính hai ô khuyết là thứ narrative
    // trỏ vào. Khuyết là thuộc tính của ô, không phải sự vắng mặt của nó.
    const problem = loadExample();
    const step = problem.solutions[0]!.steps[0]!;
    step.scene!.config = { rows: 8, cols: 8, holes: [[4, 4]] };
    step.anchors!['a1']!.ids = ['cell-4-4'];

    expect(codes(problem)).not.toContain('anchor/unknown-element');
  });

  it('bắt narrative dùng khoá anchor chưa khai', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.narrative!.vi = 'Còn [[a9|sáu mươi hai]] ô.';

    const result = codes(problem);
    expect(result).toContain('anchor/undeclared-key');
    expect(result).toContain('anchor/unused');
  });

  it('cảnh báo anchor khai mà narrative không dùng', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.anchors!['a7'] = { ids: ['cell-1-1'] };

    expect(codes(problem)).toContain('anchor/unused');
  });
});

describe('DAT-10 — cấu trúc cây', () => {
  it('bắt parent không tồn tại', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[1]!.parent = 'khong-co';

    expect(codes(problem)).toContain('structure/unknown-parent');
  });

  it('bắt chu trình cha–con', () => {
    const problem = loadExample();
    const steps = problem.solutions[0]!.steps;
    steps[0]!.parent = 's2';

    const result = codes(problem);
    expect(result).toContain('structure/no-root');
    expect(result).toContain('structure/parent-cycle');
  });

  it('bắt hai gốc', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[1]!.parent = null;

    expect(codes(problem)).toContain('structure/multiple-roots');
  });

  it('bắt contradiction không phải leaf', () => {
    const problem = loadExample();
    const steps = problem.solutions[0]!.steps;
    steps.push({
      id: 's3',
      parent: 's2',
      edge_type: 'seq',
      narrative: { vi: 'Đi tiếp sau mâu thuẫn.' },
      scene: steps[1]!.scene,
      verified: true,
    });

    expect(codes(problem)).toContain('structure/contradiction-not-leaf');
  });

  it('bắt case thiếu case_label', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[2]!.edge_type = 'case';

    expect(codes(problem)).toContain('structure/case-missing-label');
  });

  it('bắt step id trùng', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[1]!.id = 's0';

    expect(codes(problem)).toContain('structure/duplicate-step-id');
  });
});

describe('merge_ref', () => {
  it('bắt merge_target không tồn tại', () => {
    const problem = loadExample();
    const step = problem.solutions[0]!.steps[2]!;
    step.edge_type = 'merge_ref';
    step.merge_target = 'khong-co';
    delete step.scene;

    expect(codes(problem)).toContain('structure/merge-target-missing');
  });

  it('bắt merge_ref mang scene riêng', () => {
    const problem = loadExample();
    const step = problem.solutions[0]!.steps[2]!;
    step.edge_type = 'merge_ref';
    step.merge_target = 's0';

    expect(codes(problem)).toContain('structure/merge-ref-has-scene');
  });

  it('chấp nhận merge_ref hợp lệ', () => {
    const problem = loadExample();
    const step = problem.solutions[0]!.steps[2]!;
    step.edge_type = 'merge_ref';
    step.merge_target = 's0';
    delete step.scene;
    delete step.anchors;
    delete step.narrative;

    expect(validator.validateProblem(problem).ok).toBe(true);
  });
});

describe('AUT-09 — cổng khoá publish', () => {
  it('chặn publish khi còn step chưa verified', () => {
    const problem = loadExample();
    delete problem.solutions[0]!.steps[1]!.verified;

    const issues = validator.validateProblem(problem).issues;
    const gate = issues.find((i) => i.code === 'publish/step-not-verified');

    expect(gate).toBeDefined();
    expect(gate!.path).toBe('/solutions/0/steps/1/verified');
  });

  it('cho phép draft còn step chưa verified', () => {
    const problem = loadExample();
    problem.status = 'draft';
    delete problem.solutions[0]!.steps[1]!.verified;

    expect(codes(problem)).not.toContain('publish/step-not-verified');
  });
});

describe('DAT-11 — snapshot đầy đủ', () => {
  it('bắt step thiếu scene', () => {
    const problem = loadExample();
    delete problem.solutions[0]!.steps[1]!.scene;

    expect(codes(problem)).toContain('structure/missing-scene');
  });
});

describe('engines_used', () => {
  it('bắt scene dùng engine không khai báo', () => {
    const problem = loadExample();
    problem.engines_used = ['graph'];

    const result = codes(problem);
    // Scene dùng board nhưng engines_used chỉ khai graph: Player sẽ lazy-load
    // nhầm engine và trang trắng.
    expect(result).toContain('structure/engine-undeclared');
    expect(result).toContain('structure/engine-declared-unused');
  });

  it('bắt engine không tồn tại', () => {
    const problem = loadExample();
    problem.engines_used = ['engine-khong-co-that'];

    expect(codes(problem)).toContain('structure/unknown-engine');
  });
});

describe('REN-02 — og_step_ref', () => {
  it('bắt tham chiếu tới step không tồn tại', () => {
    const problem = loadExample();
    problem.og_step_ref = { sol_id: 'sol-mau', step_id: 'khong-co' };

    expect(codes(problem)).toContain('structure/og-step-missing');
  });
});

describe('NFR-P4 — bound', () => {
  it('bắt bàn vượt trần ô', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.scene!.config = { rows: 40, cols: 41 };

    expect(codes(problem)).toContain('schema/maximum');
  });

  it('bắt ô khuyết nằm ngoài bàn', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.scene!.config = {
      rows: 8,
      cols: 8,
      holes: [[0, 0], [9, 9]],
    };

    expect(codes(problem)).toContain('bounds/hole-out-of-board');
  });

  it('bắt tile đặt ngoài bàn', () => {
    const problem = loadExample();
    const scene = problem.solutions[0]!.steps[2]!.scene!;
    (scene.elements[0] as Record<string, unknown>)['pos'] = [12, 3];

    expect(codes(problem)).toContain('board/tile-out-of-board');
  });

  it('bắt file vượt 1MB', () => {
    expect(validator.checkFileSize(2_000_000)).toHaveLength(1);
    expect(validator.checkFileSize(500_000)).toHaveLength(0);
  });
});

describe('AUT-04 — lỗi phải chỉ đúng một chỗ', () => {
  it('loại element lạ cho đúng một lỗi, kèm danh sách loại hợp lệ', () => {
    const problem = loadExample();
    const scene = problem.solutions[0]!.steps[2]!.scene!;
    (scene.elements[0] as Record<string, unknown>)['type'] = 'quan-co';

    const issues = validator
      .validateProblem(problem)
      .issues.filter((i) => i.path.startsWith('/solutions/0/steps/2/scene/elements/0'));

    // Trước khi phân biệt theo `type`, union anyOf đổ ra 13 lỗi cho một element:
    // hầu hết nói về những loại element mà tác giả không hề định dùng.
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('scene/unknown-element-type');
    expect(issues[0]!.hint).toContain('piece, tile, region');
  });

  it('một trường sai trong tile chỉ báo lỗi của tile', () => {
    const problem = loadExample();
    const scene = problem.solutions[0]!.steps[2]!.scene!;
    (scene.elements[0] as Record<string, unknown>)['rot'] = 45;

    const issues = validator
      .validateProblem(problem)
      .issues.filter((i) => i.path.startsWith('/solutions/0/steps/2/scene/elements/0'));

    expect(issues.every((i) => i.path.includes('/rot'))).toBe(true);
  });
});

describe('DAT-12 — id ổn định', () => {
  it('bắt element id trùng trong cùng scene', () => {
    const problem = loadExample();
    const scene = problem.solutions[0]!.steps[2]!.scene!;
    (scene.elements[1] as Record<string, unknown>)['id'] = 't1';

    expect(codes(problem)).toContain('scene/duplicate-element-id');
  });
});

describe('PRN-04 — view song ánh', () => {
  const BIJECTION_PATH = fileURLToPath(
    new URL(
      '../../../packages/content/problems/subsets-binary-strings.json',
      import.meta.url,
    ),
  );

  const loadBijection = (): Problem =>
    JSON.parse(readFileSync(BIJECTION_PATH, 'utf8')) as Problem;

  const stepOf = (problem: Problem): NonNullable<Problem['solutions'][0]['steps'][0]> =>
    problem.solutions[0]!.steps[0]!;

  it('bài mẫu validate sạch', () => {
    expect(validator.validateProblem(loadBijection()).issues).toEqual([]);
  });

  it('bắt cặp trỏ tới element không có ở pane của nó', () => {
    const problem = loadBijection();
    stepOf(problem).bijection!.pairs[0]![1] = 'khong-ton-tai';

    expect(codes(problem)).toContain('structure/bijection-unknown-element');
  });

  it('gợi ý đúng khi tác giả đảo hai vế', () => {
    const problem = loadBijection();
    const [a, b] = stepOf(problem).bijection!.pairs[0]!;
    stepOf(problem).bijection!.pairs[0] = [b, a];

    const issues = validator
      .validateProblem(problem)
      .issues.filter((i) => i.code === 'structure/bijection-unknown-element');

    // Hai vế đảo nhau: cả hai đầu đều sai, và cả hai đều phải nói ra lý do thật.
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.hint?.includes('đảo'))).toBe(true);
  });

  it('cảnh báo — không chặn — khi ánh xạ không đơn ánh', () => {
    const problem = loadBijection();
    const bijection = stepOf(problem).bijection!;
    bijection.pairs[1] = [bijection.pairs[0]![0], bijection.pairs[1]![1]];

    const issue = validator
      .validateProblem(problem)
      .issues.find((i) => i.code === 'structure/bijection-not-injective');

    // Đếm $k$-về-$1$ dùng đúng cấu trúc này, nên đây phải là cảnh báo.
    expect(issue?.severity).toBe('warning');
  });

  it('engines_used phải tính cả engine của pane phải (D-10)', () => {
    const problem = loadBijection();
    problem.engines_used = problem.engines_used.filter((e) => e !== 'sequence');

    // Thiếu engine ở đây thì Player lazy-load hụt và nửa bên phải trắng trơn.
    expect(codes(problem)).toContain('structure/engine-undeclared');
  });

  it('bijection không có scene bên trái là lỗi', () => {
    const problem = loadBijection();
    delete stepOf(problem).scene;

    expect(codes(problem)).toContain('structure/bijection-without-scene');
  });
});

/**
 * Lớp lỗi mà M13 tìm ra bằng tay: lời kể ghi một con số, hình cho con số khác.
 *
 * `sorting-adjacent-swaps` viết "có $4$ cặp" trong khi `inversions` bằng $3$ —
 * hai số mâu thuẫn nhau trên cùng một màn hình, qua nhiều commit, và không thứ
 * gì kêu. Hai cơ chế dưới đây đóng lại lớp đó: `{{expr}}` bỏ hẳn bản sao, còn
 * `claims` bắt những khẳng định suy ra mà nội suy không với tới.
 */
describe('chống lệch chữ–hình', () => {
  // Kiểm ngữ nghĩa sống ở `packages/check`, không ở lớp schema — nên phải đi qua
  // bộ đầy đủ, đúng bộ mà CLI và CI chạy (AUT-04).
  const checker = createChecker({ fragments: ENGINE_FRAGMENTS, dsl: ENGINE_DSL });
  const check = (problem: Problem): string[] =>
    checker.check(problem, JSON.stringify(problem)).map((i) => i.code);

  const withStep = (patch: Record<string, unknown>): Problem => {
    const problem = loadExample();
    Object.assign(problem.solutions[0]!.steps[0]!, patch);
    return problem;
  };

  it('claim đúng thì qua', () => {
    expect(check(withStep({ claims: ['rows == 8'] }))).not.toContain('semantics/claim-false');
  });

  it('claim sai là **lỗi**, không phải cảnh báo', () => {
    const issue = checker
      .check(withStep({ claims: ['rows == 7'] }), '')
      .find((i) => i.code === 'semantics/claim-false');

    // Một khẳng định sai trong lời giải toán không có phiên bản "cố ý".
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toContain('false');
  });

  it('claim không chạy được cũng đỏ', () => {
    expect(check(withStep({ claims: ['khong_co_binding == 1'] }))).toContain('dsl/eval-error');
  });

  it('`{{expr}}` trong narrative phải tính được', () => {
    const problem = withStep({});
    const step = problem.solutions[0]!.steps[0]!;
    step.narrative!.vi = `Bàn có {{khong_co_binding}} hàng. ${step.narrative!.vi}`;

    expect(check(problem)).toContain('dsl/eval-error');
  });

  it('`{{expr}}` hợp lệ thì im lặng', () => {
    const problem = withStep({});
    const step = problem.solutions[0]!.steps[0]!;
    step.narrative!.vi = `Bàn có {{rows}} hàng. ${step.narrative!.vi}`;

    expect(check(problem)).not.toContain('dsl/eval-error');
  });
});

describe('chống lệch chữ–hình — các lỗ hổng', () => {
  const checker = createChecker({ fragments: ENGINE_FRAGMENTS, dsl: ENGINE_DSL });

  it('`{{expr}}` ở step không có scene là lỗi', () => {
    const problem = loadExample();
    const steps = problem.solutions[0]!.steps;
    // Một step con trỏ, không có hình — không có gì để tính giá trị ra.
    steps.push({
      id: 'm-test',
      parent: steps[0]!.id,
      edge_type: 'merge_ref',
      merge_target: steps[0]!.id,
      narrative: { vi: 'Bàn có {{rows}} hàng.' },
      verified: true,
    });

    expect(checker.check(problem, '').map((i) => i.code)).toContain(
      'semantics/value-without-scene',
    );
  });

  it('`{{expr}}` trong alt_text cũng được kiểm', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.alt_text = { vi: 'Bàn {{khong_co_binding}} hàng' };

    expect(checker.check(problem, '').map((i) => i.code)).toContain('dsl/eval-error');
  });
});
