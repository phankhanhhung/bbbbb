import { defineCommand, type CommandRegistry, type HitTest } from '@combviz/editor';
import type { EngineSchemaFragment, Scene, ValidationIssue } from '@combviz/schema';
import { EMPTY_ATLAS } from '@combviz/render';
import {
  DerivationConfig,
  RowElement,
  TermElement,
  DERIVATION_LIMITS,
} from './schema.js';
import { readDerivation } from './model.js';
import { FONT, layout } from './layout.js';
import {
  resolveDerivationValidator,
  DERIVATION_VALIDATOR_IDS,
} from './validators.js';

export * from './schema.js';
export * from './model.js';
export * from './validators.js';
export { derivationEnvironment } from './dsl.js';
export { derivationRenderer } from './render.js';
export { FONT, ROW, layout } from './layout.js';

/**
 * Bật/tắt gạch triệt tiêu — thao tác **duy nhất** của sandbox chuỗi biến đổi.
 *
 * Và nó là thao tác đúng: cả một họ bài (tổng telescoping, tích rút gọn, đổi
 * chỉ số) quy về đúng câu hỏi "hạng tử nào khử hạng tử nào". Người học tự chỉ ra
 * các cặp, còn validator `cancelled:<k>` nói đã đủ chưa. Cho sửa LaTeX thì lại
 * là mở cửa hậu cho DSL-03, cùng lý do với `COMBINE_RULES` của engine dãy.
 */
const toggleCancel = defineCommand<{ term: string }>({
  type: 'derivation/toggle-cancel',
  label: () => 'Đánh dấu triệt tiêu',
  apply(scene, params) {
    const index = scene.elements.findIndex(
      (e) => e.id === params.term && e.type === 'term',
    );
    if (index === -1) return null;

    const term = scene.elements[index];
    if (!term) return null;
    const elements = [...scene.elements];
    elements[index] = { ...term, cancelled: term['cancelled'] !== true };
    return { ...scene, elements };
  },
});

export const derivationCommands: CommandRegistry = {
  [toggleCancel.type]: toggleCancel,
};

/**
 * Chạm trúng hạng tử nào.
 *
 * Dùng đúng hàm `layout` của renderer, không đo lại — hai phép đo song song là
 * cách chắc chắn để một ngày nào đó chạm vào $x$ lại chọn trúng $y$.
 */
export function derivationHitTest(
  scene: Scene,
  point: { x: number; y: number },
): string[] {
  const box = layout(readDerivation(scene), EMPTY_ATLAS);
  for (const row of box.rows) {
    if (point.y < row.y - row.ascent || point.y > row.y + row.descent) continue;
    for (const item of row.terms) {
      const x = item.x + row.shift;
      if (point.x >= x && point.x <= x + item.width) return [item.term.id];
    }
  }
  return [];
}

export const derivationHit: HitTest = derivationHitTest;

export const derivationSchemaFragment: EngineSchemaFragment = {
  id: 'derivation',
  configSchema: DerivationConfig,
  elementSchemas: { row: RowElement, term: TermElement },
  bounds: { engine: 'derivation', limits: DERIVATION_LIMITS },
  resolveValidator: resolveDerivationValidator,
  validatorIds: DERIVATION_VALIDATOR_IDS,

  /** Không có element ngầm định: mọi thứ vẽ ra đều do tác giả khai. */
  implicitElementIds(): Set<string> {
    return new Set();
  },

  checkBounds(scene: Scene, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const model = readDerivation(scene);
    const all = model.rows.flatMap((row) => row.terms);

    if (model.rows.length > DERIVATION_LIMITS.maxRows) {
      issues.push({
        code: 'bounds/too-many-rows',
        severity: 'error',
        message: `${model.rows.length} dòng, vượt trần ${DERIVATION_LIMITS.maxRows}`,
        path: `${path}/elements`,
        hint: 'Chuỗi dài hơn thì tách thành nhiều step — cây lời giải là chỗ để làm việc đó',
      });
    }

    if (all.length > DERIVATION_LIMITS.maxTerms) {
      issues.push({
        code: 'bounds/too-many-terms',
        severity: 'error',
        message: `${all.length} hạng tử, vượt trần ${DERIVATION_LIMITS.maxTerms}`,
        path: `${path}/elements`,
      });
    }

    // Hạng tử trỏ vào dòng không có: nó **không được vẽ**, và hình vẫn trông
    // hoàn toàn bình thường — đúng loại lỗi im lặng mà kho này đã gặp nhiều lần.
    for (const orphan of model.orphans) {
      issues.push({
        code: 'bounds/unknown-row-ref',
        severity: 'error',
        message: `Hạng tử "${orphan.id}" thuộc dòng "${orphan.row}" không tồn tại`,
        path: `${path}/elements`,
        hint: 'Hạng tử ấy sẽ không được vẽ, mà hình thì vẫn trông bình thường',
      });
    }

    if (model.rows.length === 0 && all.length > 0) {
      issues.push({
        code: 'bounds/no-rows',
        severity: 'error',
        message: 'Có hạng tử nhưng không có dòng nào',
        path: `${path}/elements`,
      });
    }

    return issues;
  },
};

/** Cỡ chữ mặc định, dùng chung cho phần sinh atlas. */
export const DERIVATION_FONT = FONT;
