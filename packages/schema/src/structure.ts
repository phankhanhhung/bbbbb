import { GLOBAL_BOUNDS } from './bounds.js';
import { parseAnchorMarkup } from './anchor-markup.js';
import type { EngineRegistry } from './engine-registry.js';
import type { ValidationIssue } from './issues.js';
import type { Problem, Solution } from './problem.js';
import type { Step } from './step.js';
import type { Scene } from './scene.js';

/**
 * Kiểm ràng buộc **liên trường** mà JSON Schema không diễn đạt được: tính hợp lệ
 * của cây lời giải, anchor rot, cổng publish.
 *
 * Cố ý viết bằng TS chứ không nhồi vào JSON Schema: các luật này cần thông báo
 * lỗi giải thích được và cần JSON Pointer chính xác để Studio click-to-jump
 * (AUT-04). `if/then/else` trong JSON Schema làm được một phần, nhưng lỗi nó
 * sinh ra thì không ai đọc nổi.
 */
export function checkStructure(
  problem: Problem,
  engines: EngineRegistry,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkInvariantIds(problem, issues);
  checkEnginesUsed(problem, engines, issues);

  const solutionIds = new Set<string>();
  problem.solutions.forEach((solution, si) => {
    const path = `/solutions/${si}`;
    if (solutionIds.has(solution.id)) {
      issues.push({
        code: 'structure/duplicate-solution-id',
        severity: 'error',
        message: `Solution id "${solution.id}" bị trùng`,
        path: `${path}/id`,
      });
    }
    solutionIds.add(solution.id);
    checkSolutionTree(solution, path, engines, issues);
  });

  checkOgStepRef(problem, issues);
  checkPublishGate(problem, issues);

  return issues;
}

// ---------------------------------------------------------------------------

function checkInvariantIds(problem: Problem, issues: ValidationIssue[]): void {
  const seen = new Set<string>();
  (problem.invariants ?? []).forEach((inv, i) => {
    if (seen.has(inv.id)) {
      issues.push({
        code: 'structure/duplicate-invariant-id',
        severity: 'error',
        message: `Invariant id "${inv.id}" bị trùng`,
        path: `/invariants/${i}/id`,
      });
    }
    seen.add(inv.id);
  });
}

function checkEnginesUsed(
  problem: Problem,
  engines: EngineRegistry,
  issues: ValidationIssue[],
): void {
  const declared = new Set(problem.engines_used);
  const actual = new Set<string>();

  for (const solution of problem.solutions) {
    for (const step of solution.steps) {
      if (step.scene) actual.add(step.scene.engine);
    }
  }

  for (const [i, id] of problem.engines_used.entries()) {
    if (!engines.has(id)) {
      issues.push({
        code: 'structure/unknown-engine',
        severity: 'error',
        message: `Engine "${id}" chưa được đăng ký`,
        path: `/engines_used/${i}`,
        hint: `Engine đã có: ${[...engines.keys()].join(', ') || '(chưa có engine nào)'}`,
      });
    }
    if (!actual.has(id)) {
      issues.push({
        code: 'structure/engine-declared-unused',
        severity: 'warning',
        message: `Khai "${id}" trong engines_used nhưng không scene nào dùng`,
        path: `/engines_used/${i}`,
        hint: 'engines_used sai làm Player tải thừa engine (D-10, NFR-P3)',
      });
    }
  }

  for (const id of actual) {
    if (!declared.has(id)) {
      issues.push({
        code: 'structure/engine-undeclared',
        severity: 'error',
        message: `Scene dùng engine "${id}" nhưng không có trong engines_used`,
        path: '/engines_used',
        hint: 'Player lazy-load engine theo danh sách này; thiếu là trang trắng',
      });
    }
  }
}

function checkSolutionTree(
  solution: Solution,
  basePath: string,
  engines: EngineRegistry,
  issues: ValidationIssue[],
): void {
  const byId = new Map<string, { step: Step; index: number }>();

  solution.steps.forEach((step, i) => {
    if (byId.has(step.id)) {
      issues.push({
        code: 'structure/duplicate-step-id',
        severity: 'error',
        message: `Step id "${step.id}" bị trùng trong solution "${solution.id}"`,
        path: `${basePath}/steps/${i}/id`,
      });
      return;
    }
    byId.set(step.id, { step, index: i });
  });

  const roots = solution.steps.filter((s) => s.parent === null);
  if (roots.length === 0) {
    issues.push({
      code: 'structure/no-root',
      severity: 'error',
      message: 'Không có step gốc (parent: null)',
      path: `${basePath}/steps`,
      hint: 'Root là trạng thái xuất phát từ đề bài (§4.3)',
    });
  } else if (roots.length > 1) {
    issues.push({
      code: 'structure/multiple-roots',
      severity: 'error',
      message: `Có ${roots.length} step gốc; lời giải phải là **một** cây`,
      path: `${basePath}/steps`,
      hint: 'Nhiều lời giải song song thì tách thành nhiều solution, không phải nhiều root',
    });
  }

  const childCount = new Map<string, number>();
  for (const step of solution.steps) {
    if (step.parent !== null) {
      childCount.set(step.parent, (childCount.get(step.parent) ?? 0) + 1);
    }
  }

  solution.steps.forEach((step, i) => {
    const path = `${basePath}/steps/${i}`;
    checkParentLink(step, path, byId, issues);
    checkEdgeTypeRules(step, path, byId, childCount, issues);
    checkNarrative(step, path, issues);
    if (step.scene) {
      checkAnchors(step, step.scene, path, engines, issues);
      checkSceneBounds(step.scene, `${path}/scene`, engines, issues);
    }
  });

  checkDepth(solution, basePath, byId, issues);
}

function checkParentLink(
  step: Step,
  path: string,
  byId: Map<string, { step: Step; index: number }>,
  issues: ValidationIssue[],
): void {
  if (step.parent === null) return;

  if (!byId.has(step.parent)) {
    issues.push({
      code: 'structure/unknown-parent',
      severity: 'error',
      message: `Step "${step.id}" trỏ tới cha "${step.parent}" không tồn tại`,
      path: `${path}/parent`,
    });
    return;
  }

  // Chu trình: đi ngược lên gốc, gặp lại chính mình là hỏng.
  const seen = new Set<string>([step.id]);
  let cursor: string | null = step.parent;
  while (cursor !== null) {
    if (seen.has(cursor)) {
      issues.push({
        code: 'structure/parent-cycle',
        severity: 'error',
        message: `Step "${step.id}" nằm trong một chu trình quan hệ cha–con`,
        path: `${path}/parent`,
        hint: 'Lời giải là cây; muốn quay về step trước thì dùng edge_type "merge_ref"',
      });
      return;
    }
    seen.add(cursor);
    cursor = byId.get(cursor)?.step.parent ?? null;
  }
}

function checkEdgeTypeRules(
  step: Step,
  path: string,
  byId: Map<string, { step: Step; index: number }>,
  childCount: Map<string, number>,
  issues: ValidationIssue[],
): void {
  const children = childCount.get(step.id) ?? 0;
  const isRoot = step.parent === null;

  if (isRoot && step.edge_type !== 'seq') {
    issues.push({
      code: 'structure/root-edge-type',
      severity: 'error',
      message: `Step gốc phải có edge_type "seq", đang là "${step.edge_type}"`,
      path: `${path}/edge_type`,
    });
  }

  switch (step.edge_type) {
    case 'case': {
      if (!step.case_label) {
        issues.push({
          code: 'structure/case-missing-label',
          severity: 'error',
          message: 'Nhánh case phải có case_label',
          path,
          hint: 'Breadcrumb của Player đọc nhãn này (PLY-02)',
        });
      }
      break;
    }

    case 'contradiction': {
      if (children > 0) {
        issues.push({
          code: 'structure/contradiction-not-leaf',
          severity: 'error',
          message: `Nhánh contradiction phải là leaf, nhưng có ${children} step con`,
          path,
          hint: 'Đã mâu thuẫn thì nhánh đóng; muốn đi tiếp thì dùng "seq"',
        });
      }
      break;
    }

    case 'merge_ref': {
      if (children > 0) {
        issues.push({
          code: 'structure/merge-ref-not-leaf',
          severity: 'error',
          message: `merge_ref phải là leaf, nhưng có ${children} step con`,
          path,
        });
      }
      if (!step.merge_target) {
        issues.push({
          code: 'structure/merge-ref-missing-target',
          severity: 'error',
          message: 'merge_ref phải có merge_target',
          path,
        });
      } else if (!byId.has(step.merge_target)) {
        issues.push({
          code: 'structure/merge-target-missing',
          severity: 'error',
          message: `merge_target "${step.merge_target}" không tồn tại trong solution này`,
          path: `${path}/merge_target`,
        });
      } else if (step.merge_target === step.id) {
        issues.push({
          code: 'structure/merge-target-self',
          severity: 'error',
          message: 'merge_target trỏ vào chính nó',
          path: `${path}/merge_target`,
        });
      }
      if (step.scene) {
        issues.push({
          code: 'structure/merge-ref-has-scene',
          severity: 'error',
          message: 'merge_ref là node con trỏ, không có scene riêng',
          path: `${path}/scene`,
          hint: 'Hình của nó chính là hình của merge_target',
        });
      }
      break;
    }

    case 'seq':
      break;
  }

  if (step.edge_type !== 'merge_ref' && !step.scene) {
    issues.push({
      code: 'structure/missing-scene',
      severity: 'error',
      message: `Step "${step.id}" thiếu scene`,
      path,
      hint: 'Mỗi step lưu snapshot Scene đầy đủ (DAT-11); chỉ merge_ref được vắng',
    });
  }
}

function checkNarrative(step: Step, path: string, issues: ValidationIssue[]): void {
  if (step.edge_type === 'merge_ref') return;

  if (!step.narrative) {
    issues.push({
      code: 'structure/missing-narrative',
      severity: 'error',
      message: `Step "${step.id}" thiếu narrative`,
      path,
    });
    return;
  }

  const length = step.narrative.vi.length;
  if (length > GLOBAL_BOUNDS.softMaxNarrativeChars) {
    issues.push({
      code: 'lint/narrative-too-long',
      severity: 'warning',
      message: `Narrative dài ${length} ký tự (ngưỡng mềm ${GLOBAL_BOUNDS.softMaxNarrativeChars})`,
      path: `${path}/narrative/vi`,
      hint: 'Style Guide: một ý một step — cân nhắc tách đôi',
    });
  }
}

/**
 * ANC-02 — chống anchor rot, kiểm **cả hai chiều**.
 *
 * Chiều thiếu (anchor khai mà narrative không dùng) cũng phải bắt: nó là dấu vết
 * của việc sửa narrative mà quên bảng anchors, và nó im lặng hoàn toàn lúc chạy.
 */
function checkAnchors(
  step: Step,
  scene: Scene,
  path: string,
  engines: EngineRegistry,
  issues: ValidationIssue[],
): void {
  const anchors = step.anchors ?? {};
  const spans = step.narrative ? parseAnchorMarkup(step.narrative.vi) : [];
  const usedKeys = new Set(spans.map((s) => s.key));

  const known = new Set<string>();
  for (const element of scene.elements) {
    known.add(element.id);
  }
  const fragment = engines.get(scene.engine);
  if (fragment) {
    for (const id of fragment.implicitElementIds(scene)) known.add(id);
  }

  for (const span of spans) {
    if (!(span.key in anchors)) {
      issues.push({
        code: 'anchor/undeclared-key',
        severity: 'error',
        message: `Narrative dùng [[${span.key}|…]] nhưng bảng anchors không có khoá này`,
        path: `${path}/anchors`,
      });
    }
  }

  for (const [key, anchor] of Object.entries(anchors)) {
    if (!usedKeys.has(key)) {
      issues.push({
        code: 'anchor/unused',
        severity: 'warning',
        message: `Anchor "${key}" khai nhưng narrative không dùng`,
        path: `${path}/anchors/${key}`,
        hint: 'Sửa narrative mà quên bảng anchors thì lỗi này là dấu vết duy nhất',
      });
    }
    anchor.ids.forEach((id, i) => {
      if (!known.has(id)) {
        issues.push({
          code: 'anchor/unknown-element',
          severity: 'error',
          message: `Anchor "${key}" trỏ tới element "${id}" không có trong scene của step này`,
          path: `${path}/anchors/${key}/ids/${i}`,
          hint: 'Anchor rot: element bị xoá hoặc đổi id sau khi anchor được tạo (ANC-02)',
        });
      }
    });
  }
}

function checkSceneBounds(
  scene: Scene,
  path: string,
  engines: EngineRegistry,
  issues: ValidationIssue[],
): void {
  const fragment = engines.get(scene.engine);
  if (!fragment) return;
  issues.push(...fragment.checkBounds(scene, path));
}

function checkDepth(
  solution: Solution,
  basePath: string,
  byId: Map<string, { step: Step; index: number }>,
  issues: ValidationIssue[],
): void {
  const depthOf = (step: Step): number => {
    let depth = 0;
    let cursor = step.parent;
    const guard = new Set<string>([step.id]);
    while (cursor !== null && !guard.has(cursor)) {
      guard.add(cursor);
      depth += 1;
      cursor = byId.get(cursor)?.step.parent ?? null;
    }
    return depth;
  };

  let deepest = 0;
  let deepestIndex = 0;
  solution.steps.forEach((step, i) => {
    const d = depthOf(step);
    if (d > deepest) {
      deepest = d;
      deepestIndex = i;
    }
  });

  if (deepest > GLOBAL_BOUNDS.softMaxTreeDepth) {
    issues.push({
      code: 'lint/tree-too-deep',
      severity: 'warning',
      message: `Cây lời giải sâu ${deepest} mức (ngưỡng mềm ${GLOBAL_BOUNDS.softMaxTreeDepth})`,
      path: `${basePath}/steps/${deepestIndex}`,
      hint: 'R-6: tree navigator rối khi sâu quá mức này — cân nhắc gộp bước hoặc tách bài',
    });
  }
}

function checkOgStepRef(problem: Problem, issues: ValidationIssue[]): void {
  const ref = problem.og_step_ref;
  if (!ref) return;

  const solution = problem.solutions.find((s) => s.id === ref.sol_id);
  if (!solution) {
    issues.push({
      code: 'structure/og-solution-missing',
      severity: 'error',
      message: `og_step_ref trỏ tới solution "${ref.sol_id}" không tồn tại`,
      path: '/og_step_ref/sol_id',
    });
    return;
  }
  const step = solution.steps.find((s) => s.id === ref.step_id);
  if (!step) {
    issues.push({
      code: 'structure/og-step-missing',
      severity: 'error',
      message: `og_step_ref trỏ tới step "${ref.step_id}" không tồn tại`,
      path: '/og_step_ref/step_id',
    });
  } else if (!step.scene) {
    issues.push({
      code: 'structure/og-step-no-scene',
      severity: 'error',
      message: 'Step được chọn làm OG card không có scene để render',
      path: '/og_step_ref/step_id',
    });
  }
}

/**
 * AUT-09 — cổng khoá publish.
 *
 * Áp cho **mọi** bài published, không phân biệt soạn tay hay draft máy: một luật,
 * không đường tắt. Bài soạn tay thì Studio bật cờ này khi tác giả đi qua từng
 * step, nên chi phí gần bằng không; đổi lại `verified` trở thành thứ đọc được
 * trong git diff — ai duyệt cái gì ở commit nào.
 */
function checkPublishGate(problem: Problem, issues: ValidationIssue[]): void {
  if (problem.status !== 'published') return;

  problem.solutions.forEach((solution, si) => {
    solution.steps.forEach((step, i) => {
      if (step.verified !== true) {
        issues.push({
          code: 'publish/step-not-verified',
          severity: 'error',
          message: `Step "${step.id}" chưa được duyệt nhưng bài đang ở status "published"`,
          path: `/solutions/${si}/steps/${i}/verified`,
          hint: 'AUT-09: publish bị khoá khi còn step chưa verified (đối sách R-8)',
        });
      }
    });
  });
}
