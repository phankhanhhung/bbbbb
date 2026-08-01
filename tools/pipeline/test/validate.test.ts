import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createValidator, type Problem, type Step } from '@combviz/schema';
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

  /**
   * ANC-05 (M66) — anchor của một step song ánh trỏ vào **cả hai** pane.
   *
   * Cặp test này phải đi cùng nhau. Nới ra mà không có cái thứ hai thì "union hai
   * pane" dễ trượt thành "thôi không kiểm nữa", và anchor rot — đúng thứ ANC-02 sinh
   * ra để bắt — lặng lẽ được cho qua ở mọi bài song ánh.
   */
  it('cho phép anchor trỏ tới element của **pane phải**', () => {
    const problem = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL('../../../packages/content/problems/pascal-two-proofs.json', import.meta.url),
        ),
        'utf8',
      ),
    ) as Problem;
    const step = problem.solutions[0]!.steps[0]!;

    // `target` là một region của scene bên phải, không có trong scene bên trái.
    expect(step.anchors!['a1']!.ids).toContain('target');
    expect(step.scene!.elements.some((e) => e.id === 'target')).toBe(false);
    expect(codes(problem)).not.toContain('anchor/unknown-element');
  });

  it('...nhưng id **không có ở pane nào** thì vẫn rớt', () => {
    const problem = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL('../../../packages/content/problems/pascal-two-proofs.json', import.meta.url),
        ),
        'utf8',
      ),
    ) as Problem;
    problem.solutions[0]!.steps[0]!.anchors!['a1']!.ids = ['khong-co-o-dau-ca'];

    expect(codes(problem)).toContain('anchor/unknown-element');
  });

  it('bắt narrative dùng khoá anchor chưa khai', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.narrative!.vi = 'Còn [[a9|sáu mươi hai]] ô.';

    const result = codes(problem);
    expect(result).toContain('anchor/undeclared-key');
    expect(result).toContain('anchor/unused');
  });

  it('bắt anchor trỏ vào element mà **view này không vẽ**', () => {
    // Lớp lỗi mà ANC-02 cũ mù hoàn toàn: id **có thật**, validate xanh, và rê
    // chuột vào thì không sáng gì. Ba bài đã xuất bản từng mắc, mỗi bài một
    // engine khác nhau. Ở đây: phổ thắng–thua vẽ **thế cờ**, không vẽ đống sỏi.
    const problem = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL('../../../packages/content/problems/subtraction-set-134.json', import.meta.url),
        ),
        'utf8',
      ),
    ) as Problem;
    const step = problem.solutions[0]!.steps[3]!;
    step.anchors!['a4']!.ids = ['p0'];

    expect(codes(problem)).toContain('anchor/undrawn-element');
  });

  it('cảnh báo anchor khai mà narrative không dùng', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.anchors!['a7'] = { ids: ['cell-1-1'] };

    expect(codes(problem)).toContain('anchor/unused');
  });
});

/**
 * Lượt rà trước freeze G-C: các lỗ đóng ở đây đều rẻ trước 1.0.0 và tốn một
 * major sau nó. Mỗi test dưới đây từng là một đường đi thật cho dữ liệu rác.
 */
describe('G-C — schema đóng kín trước freeze', () => {
  it('khoá anchors lệch pattern bị chặn ở cửa schema, không nổ ở tầng structure', () => {
    const problem = loadExample();
    (problem.solutions[0]!.steps[0]!.anchors as Record<string, unknown>)['BAD-KEY'] = 42;

    // Trước fix: JSON Schema chỉ kiểm khoá *khớp* pattern nên cặp này đậu
    // validate, rồi `anchor.ids.forEach` nổ TypeError ở checkAnchors — một
    // crash thay vì một lỗi có địa chỉ.
    expect(codes(problem)).toContain('schema/unknown-field');
  });

  it('cell_overrides với khoá không phải id ô cũng bị chặn', () => {
    const problem = loadExample();
    problem.solutions[0]!.steps[0]!.scene!.config = {
      rows: 8,
      cols: 8,
      cell_overrides: { 'cell-1-x': { color_class: 1 } },
    };

    expect(codes(problem)).toContain('schema/unknown-field');
  });

  it('face_colors của graph: khoá lệch pattern bị chặn', () => {
    const problem = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL('../../../packages/content/problems/ramsey-3-3-six.json', import.meta.url),
        ),
        'utf8',
      ),
    ) as Problem;
    const scene = problem.solutions[0]!.steps[0]!.scene!;
    (scene.config as Record<string, unknown>)['face_colors'] = { 'Face-1': 2 };

    expect(codes(problem)).toContain('schema/unknown-field');
  });

  it('widget_state đã gỡ — 0 người dùng, thêm lại là một minor rẻ', () => {
    const problem = loadExample();
    (problem.solutions[0]!.steps[0]! as unknown as Record<string, unknown>)['widget_state'] = {
      foo: 1,
    };

    expect(codes(problem)).toContain('schema/unknown-field');
  });

  it('assets đã gỡ — 0 người dùng, và NFR-S1 không có chỗ cho file ngoài', () => {
    const problem = loadExample();
    (problem as unknown as Record<string, unknown>)['assets'] = [{ id: 'x', path: 'a.png' }];

    expect(codes(problem)).toContain('schema/unknown-field');
  });

  it('sandbox không khai validators vẫn hợp lệ — Optional thật thay cho default chết', () => {
    const problem = loadExample();
    // Ajv của kho không bật useDefaults, nên `default: []` cũ chưa từng chạy:
    // trường "có mặc định" mà vắng mặt là lỗi. Đó là một lời hứa sai trong schema.
    problem.sandbox = {} as Problem['sandbox'];

    expect(validator.validateProblem(problem).issues).toEqual([]);
  });
});

describe('DAT-02 — cửa sổ phiên bản có người gác', () => {
  it('con dấu ngoài cửa sổ đọc được là lỗi ở cửa validate, kèm lời khuyên', () => {
    const problem = loadExample();
    problem.schema_version = '9.9.9';

    // Trước fix, `isReadableVersion` tồn tại mà không ai gọi: SEMVER_PATTERN chỉ
    // kiểm *hình dạng* con dấu, nên file "từ tương lai" đậu validate rồi mới vỡ
    // ở Player.
    const issue = validator
      .validateProblem(problem)
      .issues.find((i) => i.code === 'version/unreadable');

    expect(issue).toBeDefined();
    expect(issue!.hint).toContain('migrate');
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

  it('merge_ref mang bảng anchors là lỗi — lời hứa highlight không thực hiện được', () => {
    const problem = loadExample();
    const step = problem.solutions[0]!.steps[2]!;
    step.edge_type = 'merge_ref';
    step.merge_target = 's0';
    delete step.scene;
    // Giữ nguyên anchors: trước fix, checkAnchors đứng trong nhánh `if (step.scene)`
    // nên bảng này thoát kiểm hoàn toàn — kho hiện 0 bài mắc, siết khi còn rẻ.

    expect(codes(problem)).toContain('anchor/without-scene');
  });

  it('narrative của merge_ref dùng [[key]] không khai vẫn bị bắt', () => {
    const problem = loadExample();
    const step = problem.solutions[0]!.steps[2]!;
    step.edge_type = 'merge_ref';
    step.merge_target = 's0';
    delete step.scene;
    delete step.anchors;
    step.narrative = { vi: 'Xem [[k1|bước đầu]].' };

    // Chiều narrative → bảng không cần scene, nên nó không được phép nấp sau
    // early-return của bước "không scene thì thôi".
    expect(codes(problem)).toContain('anchor/undeclared-key');
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

  /**
   * CHO-01..09 — dàn dựng phải neo được, trỏ được, đọc được khi tắt chuyển động.
   *
   * Dùng chính bài song ánh làm nền vì `morph` (CHO-05) sống đúng ở đây: một phần
   * tử biến thành ảnh của nó ở pane bên kia, và đích nằm ở **scene bên phải**.
   */
  describe('CHO — choreography', () => {
    const withPhases = (
      ...phases: Record<string, unknown>[]
    ): Problem => {
      const problem = loadBijection();
      stepOf(problem).choreography = { phases } as Step['choreography'];
      return problem;
    };

    const morph = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
      id: 'ph1',
      kind: 'morph',
      targets: ['x1'],
      to: 'b1',
      at: 0,
      duration: 600,
      anchor: 'a1',
      ...over,
    });

    it('pha morph sang pane bên phải là hợp lệ', () => {
      expect(validator.validateProblem(withPhases(morph())).issues).toEqual([]);
    });

    it('bắt pha trỏ tới element không tồn tại', () => {
      // Im lặng hoàn toàn lúc chạy: pha vẫn chạy đủ thời lượng, chỉ là không có
      // gì nhúc nhích.
      expect(codes(withPhases(morph({ targets: ['khong-ton-tai'] })))).toContain(
        'structure/phase-unknown-element',
      );
      expect(codes(withPhases(morph({ to: 'khong-ton-tai' })))).toContain(
        'structure/phase-unknown-element',
      );
    });

    it('CHO-07 — bắt pha neo vào anchor không khai', () => {
      expect(codes(withPhases(morph({ anchor: 'a9' })))).toContain(
        'structure/phase-unknown-anchor',
      );
    });

    it('move/morph thiếu `to` là lỗi; kiểu khác thừa `to` là cảnh báo', () => {
      const missing = morph();
      delete missing['to'];
      expect(codes(withPhases(missing))).toContain('structure/phase-missing-to');

      const stray = validator
        .validateProblem(withPhases(morph({ kind: 'focus' })))
        .issues.find((i) => i.code === 'structure/phase-stray-to');
      expect(stray?.severity).toBe('warning');
    });

    /**
     * CHO-12 — `from` được kiểm **cùng bốn đường** với `to`.
     *
     * Trước lượt này `to` có bốn lớp kiểm còn `from` có đúng không lớp nào —
     * trường sinh sau chưa từng được lớp kiểm sinh trước nhìn thấy, cùng căn
     * bệnh công dân hạng hai mà M66 chữa cho pane phải.
     */
    it('CHO-12 — morph chỉ có `from` là hợp lệ: renderer đọc `from` thay `to`', () => {
      const fromOnly = morph({ from: 'b1' });
      delete fromOnly['to'];

      expect(validator.validateProblem(withPhases(fromOnly)).issues).toEqual([]);
    });

    it('`from` trỏ id ma là lỗi — render sẽ thành no-op im lặng', () => {
      const ghost = morph({ from: 'khong-ton-tai' });
      delete ghost['to'];

      expect(codes(withPhases(ghost))).toContain('structure/phase-unknown-element');
    });

    it('khai cả `to` lẫn `from` là cảnh báo: renderer lờ `to`, nó thành dữ liệu chết', () => {
      const both = validator
        .validateProblem(withPhases(morph({ from: 'b1' })))
        .issues.find((i) => i.code === 'structure/phase-dead-to');

      expect(both?.severity).toBe('warning');
    });

    it('kiểu không dùng `from` mà khai là cảnh báo lạc chỗ', () => {
      const stray = validator
        .validateProblem(withPhases(morph({ kind: 'focus', from: 'b1' })))
        .issues.find((i) => i.code === 'structure/phase-stray-from');

      expect(stray?.severity).toBe('warning');
    });

    it('`from` là chính target — không có gì bay, thời gian chết', () => {
      const self = morph({ from: 'x1' });
      delete self['to'];

      expect(codes(withPhases(self))).toContain('structure/phase-self-target');
    });

    it('bắt id pha trùng nhau', () => {
      expect(codes(withPhases(morph(), morph({ at: 600 })))).toContain(
        'structure/duplicate-phase-id',
      );
    });

    it('CHO-09 — cảnh báo khi hai pha chung anchor mà không có nhãn phân biệt', () => {
      const shared = withPhases(morph(), morph({ id: 'ph2', at: 600 }));
      expect(codes(shared)).toContain('structure/phases-share-anchor');

      // Có nhãn riêng thì bộ đếm pha vẫn phân biệt được — không cảnh báo nữa.
      const labelled = withPhases(
        morph({ label: { vi: 'gộp lại' } }),
        morph({ id: 'ph2', at: 600, label: { vi: 'tách ra' } }),
      );
      expect(codes(labelled)).not.toContain('structure/phases-share-anchor');
    });

    it('choreography không có scene là lỗi', () => {
      const problem = withPhases(morph());
      delete stepOf(problem).scene;

      expect(codes(problem)).toContain('structure/choreography-without-scene');
    });
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
