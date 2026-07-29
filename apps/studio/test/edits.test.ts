import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTree, preorder, type Problem } from '@combviz/schema';
import {
  addChild,
  branchSize,
  createAnchor,
  mapSolution,
  mapStep,
  nextStepId,
  removeBranch,
} from '../src/edits.js';

/**
 * Các phép sửa cây là chỗ Studio dễ sinh file hỏng nhất: chúng chạy trên bộ nhớ,
 * người dùng thấy kết quả ngay, và `validate` chỉ bắt được sau khi đã lưu. Nên
 * test ở đây kiểm **bất biến cấu trúc** sau mỗi phép, không chỉ kiểm giá trị trả.
 */
const EXAMPLE_PATH = fileURLToPath(
  new URL('../../../packages/content/problems/ramsey-3-3-six.json', import.meta.url),
);

function loadExample(): Problem {
  return JSON.parse(readFileSync(EXAMPLE_PATH, 'utf8')) as Problem;
}

/** Mọi parent phải tồn tại, và cây phải duyệt được — điều `buildTree` đòi hỏi. */
function expectWellFormed(problem: Problem): void {
  for (const solution of problem.solutions) {
    const ids = new Set(solution.steps.map((s) => s.id));
    expect(new Set(ids).size).toBe(solution.steps.length);
    for (const step of solution.steps) {
      if (step.parent !== null) expect(ids.has(step.parent)).toBe(true);
    }
    expect(preorder(buildTree(solution))).toHaveLength(solution.steps.length);
  }
}

describe('AUT-03 — thao tác cây lời giải', () => {
  it('mapStep chỉ đổi đúng một step và không đụng phần còn lại', () => {
    const problem = loadExample();
    const next = mapStep(problem, 'sol-dirichlet', 's1', (s) => ({
      ...s,
      alt_text: { vi: 'đã sửa' },
    }));

    expect(next.solutions[0]!.steps.find((s) => s.id === 's1')!.alt_text).toEqual({
      vi: 'đã sửa',
    });
    expect(next.solutions[0]!.steps.find((s) => s.id === 's0')).toEqual(
      problem.solutions[0]!.steps.find((s) => s.id === 's0'),
    );
    // Thuần: bản gốc không đổi.
    expect(problem.solutions[0]!.steps.find((s) => s.id === 's1')!.alt_text).not.toEqual({
      vi: 'đã sửa',
    });
  });

  it('mapSolution bỏ qua solution không khớp id', () => {
    const problem = loadExample();
    expect(mapSolution(problem, 'khong-co', (s) => ({ ...s, id: 'x' }))).toEqual(problem);
  });

  it('nextStepId không tái dùng số đã xoá (A-02)', () => {
    const problem = loadExample();
    const solution = problem.solutions[0]!;
    const before = nextStepId(solution);

    // s7 là id lớn nhất *và* là đích của hai merge_ref. Xoá nó rồi thêm bước mới
    // mà cấp lại "s7" sẽ khiến m1/m2 lặng lẽ trỏ sang một step khác — và tệ hơn,
    // validate đang kêu "merge_target treo" sẽ xanh trở lại trong khi bài đã sai.
    const pruned = removeBranch(problem, solution.id, 's7').solutions[0]!;
    expect(pruned.steps.some((s) => s.id === 's7')).toBe(false);
    expect(nextStepId(pruned)).toBe(before);
  });

  it('nextStepId không lấp chỗ trống ở giữa', () => {
    const problem = loadExample();
    const pruned = removeBranch(problem, 'sol-dirichlet', 's5').solutions[0]!;

    expect(pruned.steps.some((s) => s.id === 's5')).toBe(false);
    expect(nextStepId(pruned)).toBe('s8');
  });

  it('addChild seq nhân bản scene của cha (DAT-11)', () => {
    const problem = loadExample();
    const { problem: next, stepId } = addChild(problem, 'sol-dirichlet', 's1', 'seq');
    const child = next.solutions[0]!.steps.find((s) => s.id === stepId)!;
    const parent = problem.solutions[0]!.steps.find((s) => s.id === 's1')!;

    expect(child.parent).toBe('s1');
    expect(child.edge_type).toBe('seq');
    expect(child.verified).toBe(false);
    expect(child.scene).toEqual(parent.scene);
    // Bản sao sâu, không phải tham chiếu: sửa scene con không được đổi scene cha.
    expect(child.scene).not.toBe(parent.scene);
    expectWellFormed(next);
  });

  it('addChild chèn ngay sau cha, không nối vào cuối mảng', () => {
    const problem = loadExample();
    const { problem: next, stepId } = addChild(problem, 'sol-dirichlet', 's1', 'seq');
    const ids = next.solutions[0]!.steps.map((s) => s.id);

    expect(ids[ids.indexOf('s1') + 1]).toBe(stepId);
  });

  it('addChild case thêm case_label rỗng, merge_ref thêm merge_target thay vì scene', () => {
    const problem = loadExample();

    const caseChild = addChild(problem, 'sol-dirichlet', 's1', 'case');
    const created = caseChild.problem.solutions[0]!.steps.find(
      (s) => s.id === caseChild.stepId,
    )!;
    expect(created.case_label).toEqual({ vi: '' });

    const merge = addChild(problem, 'sol-dirichlet', 's1', 'merge_ref');
    const mergeStep = merge.problem.solutions[0]!.steps.find((s) => s.id === merge.stepId)!;
    expect(mergeStep.merge_target).toBe('s1');
    expect(mergeStep.scene).toBeUndefined();
  });

  it('addChild với solution không tồn tại trả về nguyên trạng', () => {
    const problem = loadExample();
    expect(addChild(problem, 'khong-co', 's1', 'seq').problem).toBe(problem);
  });

  it('removeBranch xoá cả con cháu, giữ cây hợp lệ', () => {
    const problem = loadExample();
    const solution = problem.solutions[0]!;
    const branchPoint = solution.steps.find((s) => s.edge_type === 'case')!;

    const size = branchSize(solution, branchPoint.id);
    const next = removeBranch(problem, solution.id, branchPoint.id);

    expect(next.solutions[0]!.steps).toHaveLength(solution.steps.length - size);
    expect(next.solutions[0]!.steps.some((s) => s.id === branchPoint.id)).toBe(false);
    expect(
      next.solutions[0]!.steps.some((s) => s.parent === branchPoint.id),
    ).toBe(false);
  });

  it('branchSize đếm đúng số bước sẽ mất — hộp xác nhận nói số thật', () => {
    const problem = loadExample();
    const solution = problem.solutions[0]!;

    expect(branchSize(solution, 's7')).toBe(1);
    expect(branchSize(solution, solution.steps[0]!.id)).toBe(solution.steps.length);
  });
});

describe('AUT-02 — tạo anchor từ đoạn bôi đen', () => {
  const step = {
    id: 's1',
    parent: null,
    edge_type: 'seq' as const,
    narrative: { vi: 'Ba cạnh cùng màu tạo thành tam giác.' },
  };

  it('chèn markup và thêm mục anchors cùng một lúc (ANC-02)', () => {
    const next = createAnchor(step, 0, 7, ['edge-1', 'edge-2']);

    expect(next.narrative!.vi).toBe('[[a1|Ba cạnh]] cùng màu tạo thành tam giác.');
    expect(next.anchors).toEqual({ a1: { ids: ['edge-1', 'edge-2'] } });
  });

  it('co vùng chọn về đúng phần chữ — nhấp đúp hay ăn thêm khoảng trắng', () => {
    expect(createAnchor(step, 0, 8, ['edge-1']).narrative!.vi).toBe(
      '[[a1|Ba cạnh]] cùng màu tạo thành tam giác.',
    );
  });

  it('cấp key kế tiếp thay vì ghi đè anchor đang có', () => {
    const first = createAnchor(step, 0, 7, ['edge-1']);
    const second = createAnchor(first, 15, 23, ['edge-2']);

    expect(Object.keys(second.anchors!)).toEqual(['a1', 'a2']);
    expect(second.narrative!.vi).toBe('[[a1|Ba cạnh]] [[a2|cùng màu]] tạo thành tam giác.');
  });

  it('không làm gì khi chưa bôi đen, bôi trúng khoảng trắng, hay chưa chọn element', () => {
    expect(createAnchor(step, 4, 4, ['edge-1'])).toBe(step);
    expect(createAnchor(step, 8, 0, ['edge-1'])).toBe(step);
    expect(createAnchor(step, 7, 8, ['edge-1'])).toBe(step);
    expect(createAnchor(step, 0, 7, [])).toBe(step);
  });
});
