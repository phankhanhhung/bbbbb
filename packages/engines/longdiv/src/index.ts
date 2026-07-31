import type { HitTest, ScenePoint } from '@combviz/editor';
import { SELECT_TOOL, type SandboxTool } from '@combviz/editor';
import type { EngineSchemaFragment, Scene, SceneValidator, ValidationIssue } from '@combviz/schema';
import { element, type DslEnvironment } from '@combviz/dsl';
import { LongDivConfig, LONGDIV_ELEMENT_SCHEMAS, LONGDIV_LIMITS } from './schema.js';
import { readLongDiv, rowsOf } from './model.js';
import { boxOf, layout } from './layout.js';

export * from './schema.js';
export * from './model.js';
export { FONT, ROW, layout, boxOf } from './layout.js';
export { longDivRenderer } from './render.js';

/**
 * Mọi danh tính neo được — và **tất cả đều ngầm định**.
 *
 * Engine này không có loại element nào: tác giả khai hai đa thức, engine dựng cả
 * bảng. Nên tập id ở đây chính là hợp đồng "cái gì trong hình neo được", và nó
 * phải khai **đúng** những thứ có mực: chốt canh `ANC-01` đòi mỗi id khai ra phải
 * có ít nhất một node đổi khi được nhấn.
 *
 * Vì thế danh sách đọc từ **`layout`**, không từ model. Hai chỗ ấy không trùng
 * nhau: hạng tử hệ số $0$ có trong dãy hệ số mà không được vẽ, còn số $0$ của một
 * dòng dư rỗng thì ngược lại — được vẽ mà không có trong model. Đọc từ model là
 * hứa những chỗ neo không tồn tại và bỏ sót những chỗ có thật.
 */
function idsOf(scene: Scene): Set<string> {
  const ids = new Set<string>();
  const model = readLongDiv(scene);
  if (model.refusal !== null) return ids;

  const box = layout(model);
  for (const row of box.rows) {
    if (row.row.kind === 'divisor' && model.divisor.terms.length === 0) continue;
    ids.add(row.row.id);
    for (const term of row.terms) ids.add(term.id);
  }
  box.rules.forEach((r) => ids.add(r.id));
  if (model.config.show_arrows !== false) {
    box.arrows.forEach((a) => ids.add(a.id));
  }
  return ids;
}

export const LONGDIV_VALIDATOR_IDS = ['remainder-degree-drops'] as const;

export const longDivSchemaFragment: EngineSchemaFragment = {
  id: 'longdiv',
  configSchema: LongDivConfig,
  elementSchemas: LONGDIV_ELEMENT_SCHEMAS,
  bounds: { engine: 'longdiv', limits: LONGDIV_LIMITS },
  resolveValidator: resolveLongDivValidator,
  validatorIds: LONGDIV_VALIDATOR_IDS,

  implicitElementIds: idsOf,

  checkBounds(scene: Scene, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const model = readLongDiv(scene);

    if (scene.elements.length > 0) {
      issues.push({
        code: 'bounds/longdiv-no-elements',
        severity: 'error',
        message: `Engine chia dọc không nhận element nào, đang có ${scene.elements.length}`,
        path: `${path}/elements`,
        hint: 'Cả bảng suy từ `dividend` và `divisor`; khai tay là mở khe cho hình lệch phép tính',
      });
    }

    // Từ chối là **lỗi**, không phải cảnh báo: scene ấy vẽ ra một dòng chữ đỏ chứ
    // không vẽ phép chia nào, nên để nó publish được là để một bài hỏng lọt ra.
    if (model.refusal !== null) {
      issues.push({
        code: 'bounds/longdiv-cannot-divide',
        severity: 'error',
        message: `Không chia được: ${model.refusal}`,
        path: `${path}/config`,
        hint: 'Engine chỉ dựng phép chia có thương hệ số nguyên',
      });
      return issues;
    }

    if (model.degA > LONGDIV_LIMITS.maxDegree || model.degB > LONGDIV_LIMITS.maxDegree) {
      issues.push({
        code: 'bounds/longdiv-degree',
        severity: 'error',
        message: `Bậc ${Math.max(model.degA, model.degB)} vượt trần ${LONGDIV_LIMITS.maxDegree}`,
        path: `${path}/config`,
      });
    }

    // Bậc số chia lớn hơn bậc số bị chia thì thuật toán **không chạy nhịp nào**:
    // thương bằng 0, dư bằng chính A. Hợp lệ về toán, nhưng vẽ ra một cái ngoặc
    // rỗng chẳng minh hoạ gì — nên cảnh báo chứ không chặn.
    if (model.beats.length === 0) {
      issues.push({
        code: 'longdiv/no-beats',
        severity: 'warning',
        message: 'Bậc số chia lớn hơn bậc số bị chia — thuật toán không chạy nhịp nào',
        path: `${path}/config`,
        hint: 'Thương bằng 0 và dư bằng chính A; hình sẽ không có dòng trung gian nào',
      });
    }

    return issues;
  },
};

/**
 * Chạm trúng hạng tử nào.
 *
 * Đi qua đúng `layout` mà renderer dùng, không đo lại — hai phép đo song song là
 * cách chắc chắn để một ngày nào đó chạm vào $x^2$ lại chọn trúng $x^3$.
 */
export const longDivHitTest: HitTest = (scene: Scene, point: ScenePoint): string[] => {
  const model = readLongDiv(scene);
  if (model.refusal !== null) return [];
  const box = layout(model);
  const hits: string[] = [];

  for (const row of box.rows) {
    for (const term of row.terms) {
      const b = boxOf(box, term.id);
      if (b && inside(b, point)) hits.push(term.id);
    }
  }
  // Dòng đứng **sau** hạng tử: chạm vào một hạng tử thì người dùng muốn hạng tử,
  // nhưng chạm vào khoảng trống trong dòng thì họ muốn cả dòng.
  for (const row of box.rows) {
    const b = boxOf(box, row.row.id);
    if (b && inside(b, point)) hits.push(row.row.id);
  }
  return hits;
};

const inside = (
  b: { x: number; y: number; width: number; height: number },
  p: ScenePoint,
): boolean => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

/**
 * Môi trường DSL — ít binding, và cố ý ít.
 *
 * Engine không nhận thao tác nào (xem `longDivTools`), nên không có trạng thái
 * người học đổi được để mà theo dõi. Thứ khai ra là **cấu trúc của phép chia**,
 * đủ cho một invariant kiểu "bậc dư nhỏ hơn bậc số chia" nói được thành biểu thức.
 */
export function longDivEnvironment(scene: Scene): DslEnvironment {
  const model = readLongDiv(scene);
  const degreeOf = (terms: readonly { degree: number }[]): number =>
    terms.length === 0 ? -1 : Math.max(...terms.map((t) => t.degree));

  return {
    bindings: {
      beats: model.beats.length,
      deg_a: model.degA,
      deg_b: model.degB,
      deg_q: degreeOf(model.quotient.terms),
      deg_r: degreeOf(model.remainder.terms),
      rows: rowsOf(model).map((row) =>
        element(row.id, { kind: row.kind, terms: row.terms.length }),
      ),
    },
    builtins: {},
  };
}

/**
 * Sandbox: **không có thao tác nào**, và đó là lời khai.
 *
 * Phép chia dọc không có nước đi để người học chọn — nó là một thuật toán tất
 * định, chạy xong là xong. Bày một nút "chia đi" chỉ để có nút là đúng cái bệnh
 * mà lớp `SandboxTool` sinh ra để dẹp. Thứ người học làm ở đây là **đọc**, và
 * choreography lo phần ấy.
 */
export function longDivTools(): readonly SandboxTool[] {
  return [SELECT_TOOL];
}

export function resolveLongDivValidator(id: string): SceneValidator | null {
  if (id !== 'remainder-degree-drops') return null;
  return {
    id,
    label: 'Bậc dư nhỏ hơn bậc số chia',
    check(scene: Scene) {
      const model = readLongDiv(scene);
      if (model.refusal !== null) {
        return { ok: false, violations: [], message: model.refusal };
      }
      const degR =
        model.remainder.terms.length === 0
          ? -1
          : Math.max(...model.remainder.terms.map((t) => t.degree));
      const ok = degR < model.degB;
      return {
        ok,
        violations: ok ? [] : [model.remainder.id],
        message: ok
          ? `deg R = ${degR < 0 ? '−∞' : degR} < ${model.degB} = deg B`
          : `deg R = ${degR} không nhỏ hơn deg B = ${model.degB}`,
      };
    },
  };
}
