import { defineCommand, type CommandRegistry } from '@combviz/editor';
import type { Scene } from '@combviz/schema';
import { allPaths } from './expr.js';
import { parseElementId } from './layout.js';
import { readAlgebra } from './model.js';
import { applicableRules, ruleById } from './rules.js';
import type { AlgebraConfig, AlgebraStep } from './schema.js';

/**
 * Sandbox của engine đại số (SBX-01, AL-07) — và **món nợ nó trả**.
 *
 * `index.ts` mô tả sandbox này từ M46 như thể nó đã có: *"người học chạm một cây con
 * rồi chọn luật, và bảng luật **đã lọc còn những luật áp được tại nút ấy** — chính chỗ
 * lọc đó là phần dạy học"*. Chưa có. `movesAt` được viết ra cùng câu ấy và **không có
 * một call site nào** suốt sáu mốc; engine khai `commands: {}`. Một chú thích hứa một
 * UX không tồn tại là một khoản nợ có tên, và đây là chỗ trả.
 *
 * ## Một lệnh, không phải mười
 *
 * Bàn cờ có `paint-cells`, `place-tile`, `remove`… vì thao tác *là* nội dung của nó.
 * Ở đây nội dung là **tập luật**, và tập luật đã có sẵn 72 phần tử được kiểm từng cái.
 * Nên sandbox này chỉ cần một lệnh: *áp luật `R` tại nút `at`*. Thêm một lệnh thứ hai
 * (chẳng hạn "sửa dòng cuối") là mở đúng cái khe mà engine sinh ra để bịt — người học
 * sẽ **viết** được một dòng sai, thay vì chỉ đi được đường vòng.
 *
 * ## Lời từ chối **là nội dung**
 *
 * `CommandDef.apply` trả `null` khi lệnh không áp được, và `null` không mang chữ. Với
 * bàn cờ thế là đủ: kéo quân ra ngoài bàn thì không có gì để nói. Ở đây thì ngược lại —
 * *"cần luỹ thừa bậc 2"*, *"`x + 1` không phải thừa số chung của tử và mẫu"* chính là
 * thứ dạy học nhiều nhất trong cả sandbox.
 *
 * Nên có hai cửa vào cùng **một** hàm thuần `applyRule`: lệnh (đường duy nhất được sửa
 * scene, ENG-01) trả `Scene | null`, và `moveRefusal` trả chữ để giao diện hiện lên.
 * Hai cửa không thể lệch nhau vì chúng gọi cùng một hàm.
 */

export interface ApplyRuleParams {
  /** Đường dẫn tới cây con trong **dòng cuối**. `""` là cả dòng. */
  readonly at: string;
  readonly rule: string;
  readonly arg?: string;
}

/**
 * Áp một luật lên dòng cuối. Trả scene mới, hoặc lời từ chối **nguyên văn**.
 *
 * Không tự kiểm gì: nối thêm một bước vào `config.steps` rồi để `readAlgebra` chạy lại
 * cả chuỗi. Nhờ thế mọi hàng rào của model — trần `maxSteps`, trần số nút, phép kiểm
 * từng bước — canh luôn đường vào mới này mà không phải khai lại một dòng nào. Đó đúng
 * là lý do M55 ép `maxSteps` xuống tầng model thay vì để nó ở schema.
 */
export function applyRule(scene: Scene, params: ApplyRuleParams): Scene | { refusal: string } {
  if (ruleById(params.rule) === null) return { refusal: `không có luật tên "${params.rule}"` };

  const config = scene.config as AlgebraConfig;
  const step: AlgebraStep = {
    rule: params.rule,
    at: params.at,
    ...(params.arg !== undefined && params.arg !== '' ? { arg: params.arg } : {}),
  };
  const next: Scene = {
    ...scene,
    config: { ...config, steps: [...(config.steps ?? []), step] },
  };

  const model = readAlgebra(next);
  return model.refusal === null ? next : { refusal: model.refusal };
}

/** Lời từ chối nếu áp nước đi này, `null` nếu áp được. Giao diện dùng để in ra. */
export function moveRefusal(scene: Scene, params: ApplyRuleParams): string | null {
  const out = applyRule(scene, params);
  return 'refusal' in out ? out.refusal : null;
}

/**
 * Nước đi tại một **danh tính vẽ ra** — thứ hit-test trả về.
 *
 * `movesAt` nhận đường dẫn theo vị trí; sandbox thì chỉ có id dưới ngón tay. Cầu nối là
 * `allPaths` trên dòng cuối: tìm đường dẫn nào trỏ tới nút mang đúng `TermId` ấy.
 *
 * Chỉ **dòng cuối** đi tiếp được: một chuỗi biến đổi lớn lên ở đáy, và cho áp luật vào
 * giữa chuỗi là viết lại lịch sử — mọi bước sau đó nói về một cây không còn tồn tại.
 * Chạm dòng trên thì bảng nước đi rỗng, và đó là câu trả lời đúng.
 */
export function pathOfElement(scene: Scene, elementId: string): string | null {
  const at = parseElementId(elementId);
  if (at === null) return null;

  const model = readAlgebra(scene);
  if (model.refusal !== null) return null;
  if (at.row !== model.rows.length - 1) return null;

  const last = model.rows[at.row];
  if (last === undefined) return null;
  for (const [path, node] of allPaths(last.expr)) {
    if (node.id === at.term) return path;
  }
  return null;
}

export interface Move {
  readonly id: string;
  readonly label: string;
  /** Luật đòi tham số ⇒ giao diện phải mở một ô nhập trước khi chạy. */
  readonly needsArg: boolean;
}

/** Bảng nước đi cho một danh tính vẽ ra. Rỗng khi chạm hụt hoặc chạm dòng cũ. */
export function movesAtElement(scene: Scene, elementId: string): readonly Move[] {
  const path = pathOfElement(scene, elementId);
  if (path === null) return [];

  const model = readAlgebra(scene);
  const last = model.rows.at(-1);
  if (last === undefined) return [];
  const node = allPaths(last.expr).get(path);
  if (node === undefined) return [];

  return applicableRules(node).map((r) => ({
    id: r.id,
    label: r.label,
    needsArg: r.needsArg === true,
  }));
}

/** Tên lệnh, export ra để giao diện khỏi phải **đoán** nó — tiền lệ `removeCommand`. */
export const APPLY_RULE = 'algebra/apply-rule';

export const algebraCommands: CommandRegistry = {
  [APPLY_RULE]: defineCommand<ApplyRuleParams>({
    type: APPLY_RULE,
    label(params) {
      const rule = ruleById(params.rule);
      return rule === null ? params.rule : rule.label;
    },
    apply(scene, params) {
      const out = applyRule(scene, params);
      return 'refusal' in out ? null : out;
    },
  }),
};
