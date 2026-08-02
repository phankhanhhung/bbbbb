import type { HitTest, ScenePoint } from '@combviz/editor';
import { SELECT_TOOL, type SandboxTool } from '@combviz/editor';
import type { EngineSchemaFragment, Scene, SceneValidator, ValidationIssue } from '@combviz/schema';
import { DslError, element, type DslEnvironment } from '@combviz/dsl';
import { sameValue } from './check.js';
import { allPaths, nodeAt, normalize, same, totalDegree, varsOf, Minter } from './expr.js';
import { boxOf, drawnIds, layout } from './layout.js';
import { readAlgebra, type AlgebraModel } from './model.js';
import { tryParse } from './parse.js';
import { applicableRules, ruleById } from './rules.js';
import { ALGEBRA_ELEMENT_SCHEMAS, ALGEBRA_LIMITS, AlgebraConfig } from './schema.js';

export * from './expr.js';
export * from './schema.js';
export { FUNCTIONS, checkArity, isIntegerOnly, type FnSpec } from './functions.js';
export { parse, tryParse, unparse, ParseError } from './parse.js';
export { readAlgebra, peelsTo, type AlgebraModel, type AlgebraRow, type Condition } from './model.js';
export { RULES, ruleById, applicableRules, ARG_RULE_PREDICATES, type Rule } from './rules.js';
export {
  sameValue,
  sameValueReal,
  sameValueInteger,
  needsIntegerEval,
  sameSolutionSet,
  impliesSolutionSet,
  evalRelation,
  definitelyNonZero,
  definitelyNonNegative,
  definiteSign,
  guardList,
  WITNESS_MAX,
  type Guard,
  type SoundnessResult,
  type Witness,
} from './check.js';
export { layout, boxOf, drawnIds, explainIds, elementId, parseElementId, setId } from './layout.js';
export { algebraChoreography, choreographyOf, choreographyTargets } from './choreography.js';
export { algebraLineage, lineageOf } from './provenance.js';
export { algebraIncident, violationOf } from './incident.js';
export { solutionSetOf, boundsOf, contains, type SolutionSet, type Piece } from './solutionset.js';
export {
  algebraCommands,
  APPLY_RULE,
  applyRule,
  moveRefusal,
  movesAtElement,
  pathOfElement,
  type ApplyRuleParams,
  type Move,
} from './commands.js';
export { toBox, measure, place, textWidth, shrink, glyphBox, FONT, ROW } from './typeset.js';
export type { Box } from './typeset.js';
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

/**
 * Một bước **không bảo toàn giá trị** — cổng cuối trước khi toán sai lên trang.
 *
 * Tách thành hàm có tên vì lượt bẻ răng hàng loạt lộ ra rằng nó **không có răng nào**:
 * đổi `bounds/algebra-unsound` thành một mã khác mà toàn bộ 3798 test vẫn xanh. Ba anh
 * em của nó (`algebra-no-elements`, `algebra-refused`, `algebra-vars`) đều có test
 * khẳng định đúng mã; riêng cái này thì không.
 *
 * Vì sao nó thoát: nhánh này chỉ chạy khi **một luật của engine sai**, mà mọi luật đều
 * đúng — không đầu vào nào dựng ra được `unsound` không rỗng, nên không test nào đi qua
 * đây được bằng đường thường. Đó là phòng thủ cho ngày một luật hỏng, và phòng thủ
 * không ai kiểm là phòng thủ có thể đã mục từ lâu.
 *
 * Tách ra thì hợp đồng gọi được thẳng: **mã nào, mức nào, nói gì**. `severity` là phần
 * quan trọng hơn cả mã — hạ nó xuống `warning` thì toán sai vẫn publish được, và cổng
 * vẫn xanh.
 */
export function unsoundIssue(bad: string, path: string): ValidationIssue {
  return {
    // Bước sai là **lỗi của engine**, không của tác giả — tác giả không gõ vế sau.
    // Vẫn chặn publish: hình lúc ấy dạy một phép biến đổi sai.
    code: 'bounds/algebra-unsound',
    severity: 'error',
    message: `Bước không bảo toàn giá trị: ${bad}`,
    path: `${path}/config/steps`,
    hint: 'Đây là lỗi của luật trong engine, không phải của nội dung bài',
  };
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

    for (const bad of model.unsound) {
      issues.push(unsoundIssue(bad, path));
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
 *
 * **Hộp cả dòng chỉ là lưới hứng, không tranh với hạng tử nào** (M76b). Bản trước
 * đổ chung hộp dòng vào cùng danh sách rồi xếp theo diện tích, và ở một biểu thức
 * mà hạng tử ngoài cùng chiếm trọn dòng — $(x-3)(x+3)$ chẳng hạn — hai hộp **trùng
 * bề ngang**, nên ai thắng chỉ do chênh nhau một sợi chiều cao. Đổi cách vẽ dấu
 * ngoặc làm ngoặc cao thêm $0{,}3$ đơn vị, sợi ấy lật, và cả cái tích hoá **không
 * chọn được** — bảng nước đi của sandbox rỗng ở đúng nút duy nhất có nước đi.
 *
 * Một phép so diện tích không nói được "sâu hơn"; chỗ này thì nói được, vì hai tập
 * hộp vốn đã là hai tầng khác nhau. Hộp dòng chỉ trả lời khi **không hạng tử nào**
 * hứng điểm ấy — chạm vào khoảng trống bên phải một dòng ngắn thì vẫn chọn cả dòng.
 */
export const algebraHitTest: HitTest = (scene: Scene, point: ScenePoint): string[] => {
  const model = readAlgebra(scene);
  if (model.refusal !== null) return [];
  const box = layout(model);

  const inside = (b: { x: number; y: number; width: number; height: number }): boolean =>
    point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height;

  const terms: Array<{ id: string; area: number }> = [];
  const rows: string[] = [];
  for (const line of box.lines) {
    for (const b of line.boxes) if (inside(b)) terms.push({ id: b.id, area: b.width * b.height });
    if (inside(line.box)) rows.push(line.box.id);
  }
  return [...terms.sort((a, b) => a.area - b.area).map((h) => h.id), ...rows];
};

/**
 * Môi trường DSL.
 *
 * Khai **cấu trúc** của chuỗi biến đổi, đủ cho invariant kiểu "bậc không tăng qua
 * mỗi bước" nói được thành biểu thức.
 *
 * ## `reaches("x = 3")` — và vì sao thiếu nó thì challenge đại số không có đích
 *
 * Huy hiệu *"✓ Đạt mục tiêu"* của Sandbox chạy bằng `sandbox.goal_expr`, tức một biểu
 * thức DSL đánh giá trong môi trường này. Năm ràng buộc ở trên nói được *"còn bao nhiêu
 * dòng"* và *"bậc là mấy"* — và **không cái nào** nói được đích thật của một bài đại số:
 * *"dòng cuối bằng $x = 3$"*. Nên trước lượt này, một bài đại số challenge hoặc treo
 * một mục tiêu yếu (`deg == 1`), hoặc không có huy hiệu nào.
 *
 * Phép so ấy **đã có** — validator `reaches:<expr>` dùng nó từ AL-07. Nên builtin này
 * không dựng thêm phép kiểm nào; nó chỉ mở cùng phép kiểm ấy ra cho DSL, qua đúng một
 * hàm (`reachesTarget`) mà cả hai cửa gọi. Hai bản chép tay cho một câu hỏi là chuyện
 * kho vừa phải gỡ ở cổng đếm sandbox (`ENGINE-BACKLOG.md` §3b.1).
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
    builtins: {
      reaches: (args, pos) => {
        const [target] = args;
        if (args.length !== 1 || typeof target !== 'string') {
          throw new DslError('reaches() cần đúng một chuỗi, ví dụ reaches("x = 3")', pos);
        }
        return reachesTarget(model, target).ok;
      },
    },
  };
}

/**
 * Dòng cuối có **đúng dạng** `wanted` không — một phép so, hai cửa gọi.
 *
 * Cửa thứ nhất là validator `reaches:<expr>` (AL-07); cửa thứ hai là builtin `reaches()`
 * của DSL, tức huy hiệu *"✓ Đạt mục tiêu"*. Chúng phải nói cùng một câu, và cách duy
 * nhất chắc chắn là cùng một hàm.
 *
 * ## Vì sao **cấu trúc**, không phải bốc điểm — và một chốt canh luôn xanh đã sống ở đây
 *
 * Bản gốc hỏi `sameValue(dòng cuối, đích)`. Với biểu thức thì đúng; với **phương trình**
 * thì nó luôn nói "tới rồi". Đo được: `sameValue(x = 3, x = 4)` trả `ok`, và
 * `sameSolutionSet` cũng thế — thậm chí còn khai `verified: true`.
 *
 * Không phải bộ kiểm hỏng: tập nghiệm của một phương trình có **độ đo $0$**, nên hai
 * phương trình khác hẳn nhau vẫn cùng **sai** ở gần như mọi điểm bốc trúng, hai bên
 * "đồng ý", và phép so xanh mà không chứng minh gì. Đúng cái bẫy mà hợp đồng `claim`
 * (M59) đã gọi tên cho hệ phương trình — chỉ là ở đây không ai gọi tên nó, vì **chưa bài
 * nào dùng validator này** kể từ AL-07. Một năng lực chưa nội dung nào đi qua là một
 * năng lực chưa ai kiểm; loạt sandbox đại số vừa đi qua và nó lộ ra ngay.
 *
 * Nên `reaches` so **cấu trúc**, và đó cũng là ngữ nghĩa đúng: đích là một **dạng** tác
 * giả đặt ra, còn người học tới đó bằng cách áp luật. `x = 1 + 2` chưa phải `x = 3` —
 * và nói thế là dạy đúng, không phải khó tính.
 *
 * Khi giá trị khớp mà dạng chưa khớp thì **nói ra**, vì đó là lúc người học gần nhất và
 * dễ nản nhất.
 */
export function reachesTarget(
  model: AlgebraModel,
  wanted: string,
): { ok: boolean; message: string; violations: readonly string[] } {
  const last = model.rows.at(-1);
  if (last === undefined) return { ok: false, message: 'chưa có dòng nào', violations: [] };

  const target = tryParse(wanted, new Minter());
  if ('error' in target) {
    return { ok: false, message: `đích không đọc được: ${target.error}`, violations: [] };
  }

  if (same(normalize(last.expr), normalize(target.expr))) {
    return { ok: true, message: `dòng cuối đúng dạng ${wanted}`, violations: [] };
  }

  const close = sameValue(last.expr, target.expr).ok;
  return {
    ok: false,
    message: close ? `bằng ${wanted} rồi, nhưng chưa đúng dạng` : `chưa tới ${wanted}`,
    violations: [last.id],
  };
}

/**
 * Sandbox (AL-07) — và đây là chỗ engine này khác `longdiv`.
 *
 * `longdiv` trả về đúng `SELECT_TOOL`: phép chia dọc không có nước đi để chọn. Ở đây
 * cũng chỉ có `SELECT_TOOL` — nhưng vì lý do ngược lại, và chỗ khác biệt ấy đáng ghi.
 *
 * **Thanh công cụ không phải chỗ nước đi sống.** `SandboxTool` là một danh sách *cố
 * định theo scene*: bàn cờ có "tô màu", "đặt tile", và chúng đúng ở mọi ô. Nước đi đại
 * số thì phụ thuộc **nút đang chọn** — $(x+1)^2$ khai triển được, $x + 1$ thì không —
 * nên nhét 79 luật vào thanh công cụ là bày ra 77 nút bấm vào không làm gì.
 *
 * Nên chúng sống ở `movesAtElement` (`commands.ts`) và hiện thành một bảng **cạnh chỗ
 * chạm**: chạm một cây con thì thấy đúng những luật áp được tại đó. Chính chỗ lọc ấy là
 * phần dạy học, vì nó cho thấy tập nước đi hợp lệ. Và vì mọi nước đi đều do engine áp,
 * người học không **viết** ra được một dòng sai; họ chỉ có thể đi đường vòng.
 *
 * Không có nút "gợi ý bước tiếp theo": engine không có bộ giải, và đó là quyết định.
 */
export function algebraTools(scene: Scene): readonly SandboxTool[] {
  const model = readAlgebra(scene);
  if (model.refusal !== null) return [SELECT_TOOL];
  return [SELECT_TOOL];
}

/**
 * Nước đi hợp lệ tại một **đường dẫn**.
 *
 * Bản theo đường dẫn; sandbox dùng `movesAtElement` (theo danh tính vẽ ra) vì hit-test
 * chỉ có id dưới ngón tay. Giữ cả hai vì hai câu hỏi khác nhau — soạn bài thì nghĩ bằng
 * đường dẫn, người học thì chỉ tay.
 */
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
              : `Cần điều kiện: ${model.conditions.map((c) => c.text).join(', ')}`,
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
      // Cùng hàm với builtin `reaches()` của DSL — xem `reachesTarget`.
      check: (scene: Scene) => reachesTarget(readAlgebra(scene), wanted),
    };
  }

  return null;
}


export { ruleById as resolveAlgebraRule };
export { boxOf as algebraBoxOf };
