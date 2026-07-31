import type { HitTest, ScenePoint } from '@combviz/editor';
import { SELECT_TOOL, type SandboxTool } from '@combviz/editor';
import type { EngineSchemaFragment, Scene, SceneValidator, ValidationIssue } from '@combviz/schema';
import { element, type DslEnvironment } from '@combviz/dsl';
import { sameValue } from './check.js';
import { allPaths, nodeAt, totalDegree, varsOf, Minter } from './expr.js';
import { boxOf, drawnIds, layout } from './layout.js';
import { readAlgebra } from './model.js';
import { tryParse } from './parse.js';
import { applicableRules, ruleById, RULES } from './rules.js';
import { ALGEBRA_ELEMENT_SCHEMAS, ALGEBRA_LIMITS, AlgebraConfig } from './schema.js';

export * from './expr.js';
export * from './schema.js';
export { parse, tryParse, unparse, ParseError } from './parse.js';
export { readAlgebra, type AlgebraModel, type AlgebraRow } from './model.js';
export { RULES, ruleById, applicableRules, type Rule } from './rules.js';
export {
  sameValue,
  sameSolutionSet,
  impliesSolutionSet,
  evalRelation,
  definitelyNonZero,
  definitelyNonNegative,
  definiteSign,
  type Guard,
} from './check.js';
export { layout, boxOf, drawnIds, elementId } from './layout.js';
export { algebraChoreography, choreographyOf, choreographyTargets } from './choreography.js';
export { toBox, measure, place, textWidth, shrink, glyphBox, FONT, ROW } from './typeset.js';
export { algebraRenderer } from './render.js';

/**
 * Mọi danh tính neo được — và **tất cả đều ngầm định**.
 *
 * Đọc từ `layout`, không từ model. Bài học M46: hai chỗ ấy lệch nhau, và khai theo
 * model thì vừa hứa những chỗ neo không tồn tại vừa bỏ sót những chỗ có thật.
 */
function idsOf(scene: Scene): Set<string> {
  const model = readAlgebra(scene);
  if (model.refusal !== null || model.unsound.length > 0) return new Set();
  return drawnIds(layout(model));
}

export const ALGEBRA_VALIDATOR_IDS = ['each-step-sound', 'no-vanishing-divisor', 'reaches:<expr>'] as const;

export const algebraSchemaFragment: EngineSchemaFragment = {
  id: 'algebra',
  configSchema: AlgebraConfig,
  elementSchemas: ALGEBRA_ELEMENT_SCHEMAS,
  bounds: { engine: 'algebra', limits: ALGEBRA_LIMITS },
  resolveValidator: resolveAlgebraValidator,
  validatorIds: ALGEBRA_VALIDATOR_IDS,

  implicitElementIds: idsOf,

  checkBounds(scene: Scene, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const model = readAlgebra(scene);

    if (scene.elements.length > 0) {
      issues.push({
        code: 'bounds/algebra-no-elements',
        severity: 'error',
        message: `Engine đại số không nhận element nào, đang có ${scene.elements.length}`,
        path: `${path}/elements`,
        hint: 'Cả chuỗi suy từ `start` và `steps`; khai tay là mở khe cho hình lệch phép tính',
      });
    }

    if (model.refusal !== null) {
      issues.push({
        code: 'bounds/algebra-refused',
        severity: 'error',
        message: model.refusal,
        path: `${path}/config`,
      });
      return issues;
    }

    // Bước sai là **lỗi của engine**, không của tác giả — tác giả không gõ vế sau.
    // Vẫn chặn publish: hình lúc ấy dạy một phép biến đổi sai.
    for (const bad of model.unsound) {
      issues.push({
        code: 'bounds/algebra-unsound',
        severity: 'error',
        message: `Bước không bảo toàn giá trị: ${bad}`,
        path: `${path}/config/steps`,
        hint: 'Đây là lỗi của luật trong engine, không phải của nội dung bài',
      });
    }

    // Không kiểm được **khác** đã kiểm và đúng, nên nó phải hiện ra. Cảnh báo chứ
    // không chặn: bước vẫn có thể đúng, chỉ là bộ bốc điểm ngẫu nhiên không tìm được
    // chỗ nào cả hai vế cùng xác định — thường vì miền hẹp ($x^{1/2}$ đòi $x \ge 0$).
    // Cả kho 91 bài hiện ở 0, nên nó không phải một vệt vàng thường trực (bài học M45).
    for (const u of model.unchecked) {
      issues.push({
        code: 'algebra/unchecked',
        severity: 'warning',
        message: `Bước không kiểm được: ${u}`,
        path: `${path}/config/steps`,
        hint: 'Mọi điểm ngẫu nhiên đều rơi ngoài miền xác định — hãy tự soát bước này',
      });
    }

    const vars = varsOf(model.rows[0]?.expr ?? ({ k: 'int', v: 0, id: 'x' } as never));
    if (vars.size > ALGEBRA_LIMITS.maxVars) {
      issues.push({
        code: 'bounds/algebra-vars',
        severity: 'error',
        message: `${vars.size} biến, quá trần ${ALGEBRA_LIMITS.maxVars}`,
        path: `${path}/config/start`,
      });
    }

    // **Không** cảnh báo khi có điều kiện AL-08.
    //
    // Bản đầu có, và nó bắn ngay vào bài lấy AL-08 làm nội dung — bài mà dòng điều
    // kiện *là* thứ đáng dạy. Cảnh báo nghĩa là "chắc bạn nhầm", mà nhân hai vế với
    // một biểu thức chứa biến là nước đi hợp lệ và thường xuyên. Chốt canh thật nằm
    // ở chỗ khác và nó mạnh hơn: điều kiện được **in đỏ ngay trong hình**, vĩnh
    // viễn, cho người đọc chứ không cho người soạn. Tác giả nào muốn khẳng định bài
    // mình không cần điều kiện nào thì bật validator `no-vanishing-divisor`.
    //
    // Kho đã học bài này ở M45: một vệt vàng thường trực là cách nhanh nhất để
    // người ta ngừng đọc mọi cảnh báo, kể cả cảnh báo thật.

    if ((model.config.steps ?? []).length === 0) {
      issues.push({
        code: 'algebra/no-steps',
        severity: 'warning',
        message: 'Không có bước biến đổi nào — hình chỉ có một dòng',
        path: `${path}/config`,
      });
    }

    return issues;
  },
};

/**
 * Chạm trúng nút nào.
 *
 * Nút **sâu nhất** thắng: chạm vào $x$ trong $(x+1)^2$ thì người ta muốn $x$, không
 * muốn cả luỹ thừa. Đi qua đúng `layout` mà renderer dùng, không đo lại.
 */
export const algebraHitTest: HitTest = (scene: Scene, point: ScenePoint): string[] => {
  const model = readAlgebra(scene);
  if (model.refusal !== null) return [];
  const box = layout(model);

  const hits: Array<{ id: string; area: number }> = [];
  for (const line of box.lines) {
    for (const b of [...line.boxes, line.box]) {
      if (point.x < b.x || point.x > b.x + b.width) continue;
      if (point.y < b.y || point.y > b.y + b.height) continue;
      hits.push({ id: b.id, area: b.width * b.height });
    }
  }
  return hits.sort((a, b) => a.area - b.area).map((h) => h.id);
};

/**
 * Môi trường DSL.
 *
 * Khai **cấu trúc** của chuỗi biến đổi, đủ cho invariant kiểu "bậc không tăng qua
 * mỗi bước" nói được thành biểu thức.
 */
export function algebraEnvironment(scene: Scene): DslEnvironment {
  const model = readAlgebra(scene);
  const last = model.rows.at(-1);

  return {
    bindings: {
      rows: model.rows.length,
      steps: (model.config.steps ?? []).length,
      conditions: model.conditions.length,
      deg: last === undefined ? 0 : totalDegree(last.expr),
      expr_nodes:
        last === undefined
          ? []
          : [...allPaths(last.expr)].map(([path, node]) =>
              element(node.id, { kind: node.k, path, degree: totalDegree(node) }),
            ),
    },
    builtins: {},
  };
}

/**
 * Sandbox (AL-07) — và đây là chỗ engine này khác `longdiv`.
 *
 * `longdiv` trả về đúng `SELECT_TOOL`: phép chia dọc không có nước đi để chọn. Ở đây
 * người học chạm một cây con rồi chọn luật, và bảng luật **đã lọc còn những luật áp
 * được tại nút ấy** — chính chỗ lọc đó là phần dạy học, vì nó cho thấy tập nước đi
 * hợp lệ. Vì mọi nước đi đều do engine áp, người học không **viết** ra được một dòng
 * sai; họ chỉ có thể đi đường vòng.
 *
 * Không có nút "gợi ý bước tiếp theo": engine không có bộ giải, và đó là quyết định.
 */
export function algebraTools(scene: Scene): readonly SandboxTool[] {
  const model = readAlgebra(scene);
  if (model.refusal !== null) return [SELECT_TOOL];
  return [SELECT_TOOL];
}

/** Nước đi hợp lệ tại một nút — dùng cho bảng luật của sandbox. */
export function movesAt(scene: Scene, path: string): readonly { id: string; label: string }[] {
  const model = readAlgebra(scene);
  const last = model.rows.at(-1);
  if (last === undefined) return [];
  const node = nodeAt(last.expr, path);
  if (node === null) return [];
  return applicableRules(node).map((r) => ({ id: r.id, label: r.label }));
}

export function resolveAlgebraValidator(id: string): SceneValidator | null {
  if (id === 'each-step-sound') {
    return {
      id,
      label: 'Mọi bước bảo toàn giá trị',
      check(scene: Scene) {
        const model = readAlgebra(scene);
        if (model.refusal !== null) return { ok: false, violations: [], message: model.refusal };
        return {
          ok: model.unsound.length === 0,
          violations: [],
          message:
            model.unsound.length === 0
              ? `${model.rows.length - 1} bước đều khớp trên điểm ngẫu nhiên`
              : (model.unsound[0] as string),
        };
      },
    };
  }

  if (id === 'no-vanishing-divisor') {
    return {
      id,
      label: 'Không nhân/chia bởi thứ có thể bằng 0',
      check(scene: Scene) {
        const model = readAlgebra(scene);
        return {
          ok: model.conditions.length === 0,
          violations: [],
          message:
            model.conditions.length === 0
              ? 'Không bước nào cần điều kiện'
              : `Cần điều kiện: ${model.conditions.join(', ')}`,
        };
      },
    };
  }

  const reaches = /^reaches:(.+)$/.exec(id);
  if (reaches) {
    const wanted = reaches[1] as string;
    return {
      id,
      label: `Tới được ${wanted}`,
      check(scene: Scene) {
        const model = readAlgebra(scene);
        const last = model.rows.at(-1);
        if (last === undefined) return { ok: false, violations: [], message: 'chưa có dòng nào' };
        const target = tryParse(wanted, new Minter());
        if ('error' in target) {
          return { ok: false, violations: [], message: `đích không đọc được: ${target.error}` };
        }
        const verdict = sameValue(last.expr, target.expr);
        return {
          ok: verdict.ok,
          violations: verdict.ok ? [] : [last.id],
          message: verdict.ok ? `dòng cuối bằng ${wanted}` : `chưa tới: ${verdict.message}`,
        };
      },
    };
  }

  return null;
}

/** Bảng luật, để tài liệu và giao diện đọc chung một nguồn. */
export const ALGEBRA_RULE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  RULES.map((r) => [r.id, r.label]),
);

export { ruleById as resolveAlgebraRule };
export { boxOf as algebraBoxOf };
