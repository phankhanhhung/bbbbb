import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Problem, Solution } from '../src/problem.js';
import {
  branchPointAbove,
  breadcrumb,
  buildTree,
  childrenOf,
  isBranchPoint,
  isClosedBranch,
  isMergeTarget,
  nextStep,
  pathTo,
  preorder,
} from '../src/tree.js';

const ramsey = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../content/problems/ramsey-3-3-six.json', import.meta.url),
    ),
    'utf8',
  ),
) as Problem;

const tree = buildTree(ramsey.solutions[0] as Solution);

describe('cây thật của bài $R(3,3)=6$', () => {
  it('gốc là s0 và duyệt trước phủ hết mọi step', () => {
    expect(tree.root?.id).toBe('s0');
    expect(preorder(tree)).toHaveLength(ramsey.solutions[0]!.steps.length);
  });

  it('s1 là điểm rẽ nhánh với đúng hai trường hợp', () => {
    expect(isBranchPoint(tree, 's1')).toBe(true);
    expect(childrenOf(tree, 's1').map((s) => s.id)).toEqual(['s2', 's5']);
  });

  it('auto-play dừng ở điểm rẽ nhánh', () => {
    // `nextStep` trả null ở đó, nên vòng lặp auto-play tự dừng — không cần luật
    // riêng cho auto-play, và không có đường nào lỡ chọn hộ người học.
    expect(nextStep(tree, 's1')).toBeNull();
    expect(nextStep(tree, 's0')?.id).toBe('s1');
  });

  it('merge_ref đưa tới step tổng hợp', () => {
    expect(nextStep(tree, 'm1')?.id).toBe('s7');
    expect(nextStep(tree, 'm2')?.id).toBe('s7');
  });
});

describe('breadcrumb', () => {
  it('gộp nhãn các trường hợp trên đường đi', () => {
    expect(breadcrumb(tree, 's3')).toEqual([
      'Trường hợp 1: ba cạnh đó màu 1',
      '1a: có một cạnh màu 1 giữa chúng',
    ]);
  });

  it('nhánh chính không có nhãn nào', () => {
    expect(breadcrumb(tree, 's1')).toEqual([]);
  });

  it('điểm hợp nhánh **không** nêu tên nhánh nào', () => {
    // s7 về cấu trúc là con của nhánh trường hợp 2, nhưng người học có thể vừa đi
    // từ trường hợp 1 sang. Bảo họ đang ở "Trường hợp 2" là nói sai.
    expect(isMergeTarget(tree, 's7')).toBe(true);
    expect(breadcrumb(tree, 's7')).toEqual([]);
  });
});

describe('đường đi', () => {
  it('bỏ merge_ref khỏi đường đi (G-04)', () => {
    // merge_ref là con trỏ quay lại, không phải một bước tiến.
    expect(pathTo(tree, 'm1').map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3']);
  });

  it('về điểm rẽ nhánh từ trong một nhánh sâu', () => {
    expect(branchPointAbove(tree, 's3')?.id).toBe('s2');
    expect(branchPointAbove(tree, 's7')?.id).toBe('s1');
  });

  it('ở gốc thì không có điểm rẽ nhánh nào phía trên', () => {
    expect(branchPointAbove(tree, 's0')).toBeNull();
  });
});

describe('nhánh đóng', () => {
  it('nhánh kết thúc bằng merge_ref chưa phải là đóng', () => {
    // "Đóng" dành cho nhánh chết vì mâu thuẫn; nhánh hợp về kết luận thì vẫn sống.
    expect(isClosedBranch(tree, 's3')).toBe(false);
  });

  it('lá mâu thuẫn là nhánh đóng', () => {
    const chessboard = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL('../../content/problems/mutilated-chessboard.json', import.meta.url),
        ),
        'utf8',
      ),
    ) as Problem;
    const other = buildTree(chessboard.solutions[0] as Solution);

    expect(isClosedBranch(other, 's2')).toBe(true);
    expect(isClosedBranch(other, 's0')).toBe(true);
  });
});

describe('cây suy biến', () => {
  const empty = buildTree({ id: 'x', steps: [] } as unknown as Solution);

  it('solution rỗng không làm sập hàm nào', () => {
    expect(empty.root).toBeUndefined();
    expect(preorder(empty)).toEqual([]);
    expect(breadcrumb(empty, 'khong-co')).toEqual([]);
    expect(nextStep(empty, 'khong-co')).toBeNull();
    expect(branchPointAbove(empty, 'khong-co')).toBeNull();
  });
});
