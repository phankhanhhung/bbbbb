import type { Problem, Solution, Step } from '@combviz/schema';

/**
 * Thao tác trên cây lời giải ở mức **file** (AUT-01, AUT-03).
 *
 * Khác với command layer của `@combviz/editor` — lớp đó sửa một Scene, lớp này
 * sửa cấu trúc bài. Giữ tách bạch vì chúng có vòng đời khác nhau: undo của canvas
 * không nên hoàn tác việc thêm một nhánh, và ngược lại.
 *
 * Mọi hàm ở đây thuần và trả về Problem mới.
 */

export function mapSolution(
  problem: Problem,
  solutionId: string,
  fn: (solution: Solution) => Solution,
): Problem {
  return {
    ...problem,
    solutions: problem.solutions.map((s) => (s.id === solutionId ? fn(s) : s)),
  };
}

export function mapStep(
  problem: Problem,
  solutionId: string,
  stepId: string,
  fn: (step: Step) => Step,
): Problem {
  return mapSolution(problem, solutionId, (solution) => ({
    ...solution,
    steps: solution.steps.map((step) => (step.id === stepId ? fn(step) : step)),
  }));
}

/**
 * Id step mới: `s<n>` với n lớn hơn mọi số **đang dùng hoặc còn bị trỏ tới**.
 *
 * **Không tái dùng số đã xoá** (A-02). `merge_target` trỏ theo id; tái dùng một
 * id vừa xoá sẽ khiến một tham chiếu cũ trỏ sang một step hoàn toàn khác mà
 * không có gì báo — tệ hơn: trước khi tái dùng, validate còn kêu "merge_target
 * trỏ vào step không tồn tại"; sau khi tái dùng, nó xanh trở lại và **sai**.
 *
 * Vì vậy quét cả `merge_target`, kể cả những cái đang treo. Xoá step cuối rồi
 * thêm step mới là thao tác đời thường nhất trong Studio, và nó là đúng thao tác
 * chạm vào cạm bẫy này.
 */
export function nextStepId(solution: Solution, prefix = 's'): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let max = -1;

  const consider = (id: string | undefined): void => {
    if (id === undefined) return;
    const match = pattern.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  };

  for (const step of solution.steps) {
    consider(step.id);
    consider(step.merge_target);
  }
  return `${prefix}${max + 1}`;
}

/**
 * AUT-01 — bước soạn nhanh nhất: nhân bản scene của step hiện tại rồi sửa.
 *
 * Đây là cả mô hình soạn bài của DAT-11/12 gói vào một thao tác: tác giả không
 * mô tả *thay đổi*, họ mô tả *trạng thái mới*, và chuyển động là phần được tặng.
 */
export function addChild(
  problem: Problem,
  solutionId: string,
  parentId: string,
  edgeType: Step['edge_type'],
): { problem: Problem; stepId: string } {
  const solution = problem.solutions.find((s) => s.id === solutionId);
  if (!solution) return { problem, stepId: parentId };

  const parent = solution.steps.find((s) => s.id === parentId);
  const id = nextStepId(solution);

  const step: Step = {
    id,
    parent: parentId,
    edge_type: edgeType,
    narrative: { vi: '' },
    ...(edgeType === 'case' ? { case_label: { vi: '' } } : {}),
    ...(edgeType === 'merge_ref'
      ? { merge_target: parentId }
      : parent?.scene
        ? { scene: structuredClone(parent.scene) }
        : {}),
    verified: false,
  };

  // Chèn ngay sau cha thay vì cuối mảng: thứ tự trong file nên giống thứ tự đọc,
  // vì file là thứ đi vào PR (DAT-03).
  const index = solution.steps.findIndex((s) => s.id === parentId);
  const steps = [...solution.steps];
  steps.splice(index + 1, 0, step);

  return { problem: mapSolution(problem, solutionId, (s) => ({ ...s, steps })), stepId: id };
}

/**
 * Xoá một step **và cả nhánh dưới nó**.
 *
 * Xoá một mình node cha sẽ để lại các con trỏ tới cha đã biến mất — hợp lệ về
 * JSON, vô nghĩa về cây, và validate mới bắt được sau đó. Xoá cả nhánh là thứ
 * người dùng thực sự muốn, và là thứ duy nhất giữ cây luôn hợp lệ.
 */
export function removeBranch(
  problem: Problem,
  solutionId: string,
  stepId: string,
): Problem {
  const solution = problem.solutions.find((s) => s.id === solutionId);
  if (!solution) return problem;

  const doomed = new Set<string>([stepId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const step of solution.steps) {
      if (step.parent && doomed.has(step.parent) && !doomed.has(step.id)) {
        doomed.add(step.id);
        grew = true;
      }
    }
  }

  return mapSolution(problem, solutionId, (s) => ({
    ...s,
    steps: s.steps.filter((step) => !doomed.has(step.id)),
  }));
}

/** Số step sẽ mất khi xoá một nhánh — để hộp xác nhận nói con số thật. */
export function branchSize(solution: Solution, stepId: string): number {
  const doomed = new Set<string>([stepId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const step of solution.steps) {
      if (step.parent && doomed.has(step.parent) && !doomed.has(step.id)) {
        doomed.add(step.id);
        grew = true;
      }
    }
  }
  return doomed.size;
}

/**
 * AUT-02 — tạo anchor từ đoạn văn đang bôi đen.
 *
 * Chèn markup `[[aN|…]]` vào đúng chỗ và thêm mục vào bảng `anchors`. Hai việc
 * này phải đi cùng nhau; làm rời sẽ sinh ra đúng loại lệch mà ANC-02 tồn tại để
 * bắt, chỉ là bắt muộn hơn.
 */
export function createAnchor(
  step: Step,
  selectionStart: number,
  selectionEnd: number,
  elementIds: readonly string[],
): Step {
  if (!step.narrative || selectionStart >= selectionEnd || elementIds.length === 0) {
    return step;
  }

  const key = nextAnchorKey(step);
  const text = step.narrative.vi;

  // Co vùng chọn về đúng phần chữ. Nhấp đúp chọn một từ trong trình duyệt thường
  // ăn luôn khoảng trắng phía sau, và `[[a1|ba cạnh ]]` sẽ hiện ra vùng highlight
  // thừa một khoảng trắng — lỗi nhỏ nhưng lộ trên mọi anchor tác giả tạo.
  const raw = text.slice(selectionStart, selectionEnd);
  const lead = raw.length - raw.trimStart().length;
  const label = raw.trim();
  if (label === '') return step;

  const start = selectionStart + lead;
  const end = start + label.length;

  return {
    ...step,
    narrative: {
      ...step.narrative,
      vi: `${text.slice(0, start)}[[${key}|${label}]]${text.slice(end)}`,
    },
    anchors: { ...(step.anchors ?? {}), [key]: { ids: [...elementIds] } },
  };
}

function nextAnchorKey(step: Step): string {
  let max = 0;
  for (const key of Object.keys(step.anchors ?? {})) {
    const match = /^a(\d+)$/.exec(key);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `a${max + 1}`;
}
