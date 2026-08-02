import { GLOBAL_BOUNDS } from './bounds.js';
import { parseAnchorMarkup } from './anchor-markup.js';
import { langValues } from './common.js';
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
      // Pane phải của view song ánh cũng là một scene, và rất hay dùng engine
      // **khác** pane trái — tập con bên này, xâu nhị phân bên kia là đúng cặp
      // mà PRN-04 sinh ra để phục vụ. Bỏ sót nó thì `engines_used` thiếu một
      // engine, Player lazy-load theo danh sách đó (D-10) và nửa bên phải trắng
      // trơn trong khi validate vẫn báo xanh.
      if (step.bijection) actual.add(step.bijection.scene.engine);
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
    // `checkAnchors` chạy cho **mọi** step, kể cả step không scene: một merge_ref
    // mang bảng anchors là lời hứa highlight không bao giờ thực hiện được, và
    // trước đây nó thoát kiểm chỉ vì đứng nhầm trong nhánh `if (step.scene)`.
    checkAnchors(step, step.scene, path, engines, issues);
    if (step.scene) {
      checkSceneBounds(step.scene, `${path}/scene`, engines, issues);
    }
    checkBijection(step, path, engines, issues);
    checkPlay(step, path, issues);
    checkChoreography(step, path, engines, issues);
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

/** Tập id tra cứu được của một scene: element khai tường minh + element ngầm định. */
function knownIds(scene: Scene, engines: EngineRegistry): Set<string> {
  const known = new Set(scene.elements.map((element) => element.id));
  const fragment = engines.get(scene.engine);
  if (fragment) {
    for (const id of fragment.implicitElementIds(scene)) known.add(id);
  }
  return known;
}

/**
 * GM-01/02 — một step chơi được phải có **thế** để chơi.
 *
 * Hai chuyện kiểm ở đây, và chỉ hai. Tên họ luật thì **không**: danh sách họ luật là
 * chuyện của engine chủ, nên nó kiểm ở `checkBounds` của engine ấy — cùng lý do mà
 * `structure.ts` không biết engine nào có element gì.
 *
 * Chuyện thứ hai là lối `apply: "script"`. Nó **không sai** và không bị chặn; nó chỉ
 * đắt hơn lối mặc định đúng ba bảo đảm (tất định, đúng engine, ghi ván theo id), và
 * phiên chơi phải dựng cổng để bù. Cảnh báo ở đây để chỗ đánh đổi ấy có mặt trong bản
 * duyệt — nếu không thì nó nằm im trong một tệp script và không ai đọc lại.
 */
function checkPlay(step: Step, path: string, issues: ValidationIssue[]): void {
  const play = step.play;
  if (!play) return;

  if (!step.scene) {
    issues.push({
      code: 'structure/play-without-scene',
      severity: 'error',
      message: 'Step khai `play` nhưng không có `scene`: không có thế nào để chơi',
      path: `${path}/play`,
    });
    return;
  }

  if (play.apply === 'script') {
    issues.push({
      code: 'play/script-apply',
      severity: 'warning',
      message: 'Ván áp nước bằng script: mất bảo đảm tất định của lớp lệnh',
      path: `${path}/play/apply`,
      hint: 'Phiên chơi chạy script hai lần và so byte; script không tất định sẽ bị từ chối ngay ở nước ấy',
    });
  }
}

/**
 * PRN-04 — ánh xạ song ánh phải trỏ tới thứ có thật ở **đúng bên của nó**.
 *
 * Cùng một họ với anchor rot (ANC-02) và nguy hiểm hơn một bậc: một cặp trỏ sai
 * bên vẫn "chạy" — pane kia đơn giản là không sáng lên khi rê chuột. Không có
 * thông báo nào, và người đọc kết luận rằng phần tử đó không có ảnh, tức là
 * **kết luận sai đúng cái điều bài toán đang chứng minh**.
 */
function checkBijection(
  step: Step,
  path: string,
  engines: EngineRegistry,
  issues: ValidationIssue[],
): void {
  const bijection = step.bijection;
  if (!bijection) return;

  if (!step.scene) {
    issues.push({
      code: 'structure/bijection-without-scene',
      severity: 'error',
      message: 'Step khai `bijection` nhưng không có `scene`: thiếu hẳn pane bên trái',
      path: `${path}/bijection`,
    });
    return;
  }

  checkSceneBounds(bijection.scene, `${path}/bijection/scene`, engines, issues);

  const left = knownIds(step.scene, engines);
  const right = knownIds(bijection.scene, engines);

  bijection.pairs.forEach(([a, b], i) => {
    if (!left.has(a)) {
      issues.push({
        code: 'structure/bijection-unknown-element',
        severity: 'error',
        message: `Cặp ${i} trỏ tới "${a}", không có trong scene bên trái`,
        path: `${path}/bijection/pairs/${i}/0`,
        hint: right.has(a) ? '"' + a + '" có ở scene bên phải — có thể hai vế bị đảo' : undefined,
      });
    }
    if (!right.has(b)) {
      issues.push({
        code: 'structure/bijection-unknown-element',
        severity: 'error',
        message: `Cặp ${i} trỏ tới "${b}", không có trong scene bên phải`,
        path: `${path}/bijection/pairs/${i}/1`,
        hint: left.has(b) ? '"' + b + '" có ở scene bên trái — có thể hai vế bị đảo' : undefined,
      });
    }
  });

  // Không đơn ánh là **cảnh báo**, không phải lỗi: đếm $k$-về-$1$ dùng đúng cấu
  // trúc này. Nhưng nói ra thì tác giả biết mình đang khai một quan hệ mạnh hơn
  // cái tên "song ánh", thay vì phát hiện ra khi hình vẽ sáng lên hai chỗ.
  for (const [side, index, label] of [
    ['trái', 0, 'left'],
    ['phải', 1, 'right'],
  ] as const) {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const pair of bijection.pairs) {
      const id = pair[index];
      if (seen.has(id)) repeated.add(id);
      seen.add(id);
    }
    if (repeated.size > 0) {
      issues.push({
        code: 'structure/bijection-not-injective',
        severity: 'warning',
        message: `Ánh xạ không đơn ánh phía bên ${side}: ${[...repeated].sort().join(', ')} xuất hiện nhiều lần`,
        path: `${path}/bijection/pairs`,
        hint: `Cố ý thì bỏ qua — đếm $k$-về-$1$ dùng đúng dạng này (phía ${label})`,
      });
    }
  }
}

/**
 * CHO-07/08/09 — choreography phải neo được, trỏ được, và **đọc được khi tắt
 * chuyển động**.
 *
 * Ba loại lỗi ở đây im lặng hoàn toàn lúc chạy, đó là lý do chúng phải bị bắt ở
 * đây: pha trỏ tới element không tồn tại thì đơn giản là không có gì nhúc nhích;
 * pha neo vào anchor không khai thì Player không sáng được câu nào; và hai pha
 * dùng chung một anchor thì bộ đếm pha ở chế độ giảm chuyển động in ra đúng một
 * câu hai lần — người tắt animation mất hẳn một bước lập luận (NFR-A4).
 */
function checkChoreography(
  step: Step,
  path: string,
  engines: EngineRegistry,
  issues: ValidationIssue[],
): void {
  const choreography = step.choreography;
  if (!choreography) return;

  if (!step.scene) {
    issues.push({
      code: 'structure/choreography-without-scene',
      severity: 'error',
      message: 'Step khai `choreography` nhưng không có `scene`: không có gì để dàn dựng',
      path: `${path}/choreography`,
    });
    return;
  }

  // Id tra được gồm **cả hai pane**: CHO-05 morph một element sang ảnh của nó ở
  // song ánh, và ảnh ấy nằm ở scene bên phải theo đúng định nghĩa.
  const known = knownIds(step.scene, engines);
  if (step.bijection) {
    for (const id of knownIds(step.bijection.scene, engines)) known.add(id);
  }

  const anchors = step.anchors ?? {};
  const seenIds = new Set<string>();
  const anchorUse = new Map<string, string[]>();
  let end = 0;

  choreography.phases.forEach((phase, i) => {
    const at = `${path}/choreography/phases/${i}`;
    end = Math.max(end, phase.at + phase.duration);

    if (seenIds.has(phase.id)) {
      issues.push({
        code: 'structure/duplicate-phase-id',
        severity: 'error',
        message: `Phase id "${phase.id}" bị trùng trong step "${step.id}"`,
        path: `${at}/id`,
        hint: 'Hai pha cùng id thì scrub bar không phân biệt được chúng',
      });
    }
    seenIds.add(phase.id);

    if (!Object.hasOwn(anchors, phase.anchor)) {
      issues.push({
        code: 'structure/phase-unknown-anchor',
        severity: 'error',
        message: `Phase "${phase.id}" neo vào anchor "${phase.anchor}" mà bảng anchors không có`,
        path: `${at}/anchor`,
        hint: 'CHO-07: pha không nói được nó giải thích câu nào là animation trang trí (NG-07)',
      });
    }
    // Gom nhãn chứ không chỉ đếm: hai pha chung anchor **có nhãn riêng** thì bộ
    // đếm pha vẫn phân biệt được chúng, và đó là cách đúng để dàn dựng nhiều
    // nhịp cho cùng một câu.
    anchorUse.set(phase.anchor, [...(anchorUse.get(phase.anchor) ?? []), phase.label?.vi ?? '']);

    phase.targets.forEach((id, j) => {
      if (!known.has(id)) {
        issues.push({
          code: 'structure/phase-unknown-element',
          severity: 'error',
          message: `Phase "${phase.id}" tác động lên element "${id}" không có trong scene`,
          path: `${at}/targets/${j}`,
          hint: 'Cùng họ anchor rot (ANC-02): pha vẫn chạy, chỉ là không có gì nhúc nhích',
        });
      }
    });

    /**
     * Hợp đồng đích của `move`/`morph` — chép từ tầng render, không phỏng đoán:
     * renderer đọc `from` **thay** `to` khi cả hai có mặt (`comesFrom` thắng,
     * `towards` bị lờ). Nên "có đích" nghĩa là *ít nhất một trong hai*, và khai
     * cả hai là một trường chết trỏ lạc hướng người đọc file.
     *
     * `from` trước đây không được kiểm **một đường nào** trong khi `to` được kiểm
     * bốn đường — cùng một chỗ lệch nội bộ như anchor hai pane (M66): trường sinh
     * sau (CHO-12) chưa từng được lớp kiểm sinh trước nhìn thấy. `from` trỏ id ma
     * thì render thành no-op im lặng — đúng họ anchor rot.
     */
    const needsTarget = phase.kind === 'move' || phase.kind === 'morph';
    if (needsTarget && phase.to === undefined && phase.from === undefined) {
      issues.push({
        code: 'structure/phase-missing-to',
        severity: 'error',
        message: `Phase "${phase.id}" kiểu "${phase.kind}" không khai \`to\` lẫn \`from\`: không biết đi đâu hay tới từ đâu`,
        path: `${at}/to`,
      });
    } else if (!needsTarget && phase.to !== undefined) {
      issues.push({
        code: 'structure/phase-stray-to',
        severity: 'warning',
        message: `Phase "${phase.id}" kiểu "${phase.kind}" khai \`to\` nhưng kiểu này không dùng tới`,
        path: `${at}/to`,
        hint: 'Có lẽ định dùng "move" hoặc "morph"',
      });
    }

    if (!needsTarget && phase.from !== undefined) {
      issues.push({
        code: 'structure/phase-stray-from',
        severity: 'warning',
        message: `Phase "${phase.id}" kiểu "${phase.kind}" khai \`from\` nhưng kiểu này không dùng tới`,
        path: `${at}/from`,
        hint: 'Có lẽ định dùng "move" hoặc "morph"',
      });
    } else if (needsTarget && phase.to !== undefined && phase.from !== undefined) {
      issues.push({
        code: 'structure/phase-dead-to',
        severity: 'warning',
        message: `Phase "${phase.id}" khai cả \`to\` lẫn \`from\` — renderer dùng \`from\`, \`to\` là dữ liệu chết`,
        path: `${at}/to`,
        hint: 'CHO-12: `to` là "vật này rời chỗ", `from` là "vật này đến" — chọn đúng một câu chuyện',
      });
    }

    if (phase.to !== undefined) {
      if (!known.has(phase.to)) {
        issues.push({
          code: 'structure/phase-unknown-element',
          severity: 'error',
          message: `Phase "${phase.id}" đi tới element "${phase.to}" không có trong scene`,
          path: `${at}/to`,
        });
      } else if (phase.targets.includes(phase.to)) {
        issues.push({
          code: 'structure/phase-self-target',
          severity: 'warning',
          message: `Phase "${phase.id}" đưa "${phase.to}" về chính chỗ nó đang đứng`,
          path: `${at}/to`,
          hint: 'Pha chạy đủ thời lượng mà không có gì chuyển động — thời gian chết',
        });
      }
    }

    if (phase.from !== undefined) {
      if (!known.has(phase.from)) {
        issues.push({
          code: 'structure/phase-unknown-element',
          severity: 'error',
          message: `Phase "${phase.id}" bay tới từ element "${phase.from}" không có trong scene`,
          path: `${at}/from`,
          hint: 'Render sẽ thành no-op im lặng: không có hộp xuất phát thì không có gì bay',
        });
      } else if (phase.targets.includes(phase.from)) {
        issues.push({
          code: 'structure/phase-self-target',
          severity: 'warning',
          message: `Phase "${phase.id}" cho "${phase.from}" bay tới từ chính chỗ nó đang đứng`,
          path: `${at}/from`,
          hint: 'Pha chạy đủ thời lượng mà không có gì chuyển động — thời gian chết',
        });
      }
    }
  });

  for (const [key, labels] of anchorUse) {
    if (labels.length > 1 && new Set(labels).size < labels.length) {
      issues.push({
        code: 'structure/phases-share-anchor',
        severity: 'warning',
        message: `${labels.length} pha cùng neo vào anchor "${key}" mà không có nhãn phân biệt`,
        path: `${path}/choreography/phases`,
        hint: 'CHO-09: bộ đếm pha ở chế độ giảm chuyển động sẽ in một câu nhiều lần — đặt `label` cho từng pha',
      });
    }
  }

  if (end > GLOBAL_BOUNDS.softMaxTimelineMs) {
    issues.push({
      code: 'structure/timeline-too-long',
      severity: 'warning',
      message: `Timeline dài ${(end / 1000).toFixed(1)}s (ngưỡng mềm ${GLOBAL_BOUNDS.softMaxTimelineMs / 1000}s)`,
      path: `${path}/choreography/phases`,
      hint: 'Một step là một ý — cân nhắc tách đôi',
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
  scene: Scene | undefined,
  path: string,
  engines: EngineRegistry,
  issues: ValidationIssue[],
): void {
  const anchors = step.anchors ?? {};

  /**
   * Đọc markup của **mọi** bản ngôn ngữ, không riêng `vi` (M69).
   *
   * Bản dịch cũng là narrative: một `[[a3|…]]` sót lại trong `en` sau khi tác giả
   * đổi tên khoá ở `vi` là đúng cái anchor rot mà ANC-02 sinh ra để bắt, chỉ khác
   * là nó rot ở thứ tiếng mà không lớp kiểm nào nhìn.
   *
   * Chiều "khoá khai mà không ai dùng" thì tính trên **hợp** các thứ tiếng: một
   * anchor chỉ được dùng trong bản dịch vẫn là một anchor đang làm việc.
   */
  const usedKeys = new Set<string>();

  // Chiều narrative → bảng không cần scene: [[key]] trỏ vào bảng anchors, không
  // trỏ vào element. Nó phải chạy trước early-return bên dưới, không thì một
  // merge_ref có markup lạc trong narrative thoát kiểm.
  for (const [lang, textOf] of langValues(step.narrative)) {
    for (const span of parseAnchorMarkup(textOf)) {
      usedKeys.add(span.key);
      if (!(span.key in anchors)) {
        issues.push({
          code: 'anchor/undeclared-key',
          severity: 'error',
          message: `Narrative (${lang}) dùng [[${span.key}|…]] nhưng bảng anchors không có khoá này`,
          path: `${path}/narrative/${lang}`,
        });
      }
    }
  }

  /**
   * Step không scene (merge_ref) mà khai anchors: không có element nào để trỏ
   * tới, mọi id trong bảng đều là lời hứa suông. Báo **một** lỗi cho cả bảng
   * thay vì một lỗi mỗi id — chẩn đoán đúng là "bảng này không được phép ở
   * đây", không phải "id này gõ sai".
   */
  if (!scene) {
    if (Object.keys(anchors).length > 0) {
      issues.push({
        code: 'anchor/without-scene',
        severity: 'error',
        message: `Step "${step.id}" không có scene nhưng khai ${Object.keys(anchors).length} anchor`,
        path: `${path}/anchors`,
        hint: 'merge_ref là con trỏ thuần — narrative của nó không neo được vào hình nào',
      });
    }
    return;
  }

  /**
   * Id tra được gồm **cả hai pane** (ANC-05, M66).
   *
   * Bản trước chỉ soi `step.scene`, nên một anchor trỏ vào element của pane phải bị
   * báo `anchor/unknown-element` — sai, vì element ấy **có thật và đang ở trên màn
   * hình**. Hậu quả: bài song ánh không neo được vào nửa bên phải, tức là mất đúng
   * nửa mà song ánh sinh ra để nói.
   *
   * `checkChoreography` ngay trên đã union hai pane từ M37 với đúng lý lẽ ấy. Hai lớp
   * kiểm cạnh nhau nhìn hai thứ khác nhau về cùng một step là một chỗ lệch nội bộ,
   * không phải một quyết định.
   */
  const known = knownIds(scene, engines);
  if (step.bijection) {
    for (const id of knownIds(step.bijection.scene, engines)) known.add(id);
  }

  // Element mà view hiện tại **cố ý** không vẽ. Id có thật nên `known` chứa nó và
  // ANC-02 cho qua — nhưng rê chuột vào thì không sáng gì, và người đọc kết luận
  // rằng thứ ấy không tồn tại. Đây là biến thể của anchor rot mà lớp kiểm cũ mù.
  //
  // Tính **theo từng scene**, không union: "pane trái không vẽ thứ này" vẫn là một
  // lỗi thật kể cả khi pane phải có vẽ một element trùng tên. Nên chỉ bỏ qua khi id
  // ấy thuộc về pane kia.
  const undrawn = engines.get(scene.engine)?.undrawnElementIds?.(scene) ?? new Set<string>();
  const otherPane = step.bijection ? knownIds(step.bijection.scene, engines) : new Set<string>();

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
        return;
      }
      if (undrawn.has(id) && !otherPane.has(id)) {
        issues.push({
          code: 'anchor/undrawn-element',
          severity: 'error',
          message: `Anchor "${key}" trỏ tới "${id}", element mà view này không vẽ`,
          path: `${path}/anchors/${key}/ids/${i}`,
          hint:
            'Id có thật nên ANC-02 cho qua, nhưng rê chuột vào sẽ **không sáng gì**. ' +
            'Đổi view, hoặc neo vào thứ mà view này thật sự vẽ.',
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
