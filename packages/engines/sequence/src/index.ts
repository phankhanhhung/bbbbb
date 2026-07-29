import type {
  EngineSchemaFragment,
  Scene,
  ValidationIssue,
} from '@combviz/schema';
import type { HitTest } from '@combviz/editor';
import {
  deriveSequence,
  PITCH,
  SLOT,
  slotX,
  STONE_PITCH,
  sequenceConfig,
} from './geometry.js';
import {
  ItemElement,
  CutElement,
  SequenceConfig,
  SEQUENCE_LIMITS,
} from './schema.js';
import { resolveSequenceValidator, SEQUENCE_VALIDATOR_IDS } from './validators.js';

export * from './schema.js';
export * from './geometry.js';
export * from './commands.js';
export * from './validators.js';
export { sequenceEnvironment } from './dsl.js';
export { sequenceRenderer } from './render.js';

/**
 * Hit test: bấm vào đâu thì trúng phần tử nào.
 *
 * Ở chế độ `piles`, vùng bấm là **cả cột** từ đáy lên hết đống, không phải từng
 * viên sỏi: người học nghĩ mình đang chọn "đống thứ hai", không nghĩ mình đang
 * chọn "viên thứ bảy của đống thứ hai". Vùng bấm phải khớp với vật mà họ tin là
 * mình đang chạm.
 */
export const sequenceHitTest: HitTest = (scene, point) => {
  const derived = deriveSequence(scene);
  const hits: string[] = [];

  for (const item of derived.items) {
    const x = slotX(item.pos);
    if (point.x < x || point.x > x + SLOT) continue;

    if (derived.mode === 'piles') {
      const height = Math.max(SLOT * 0.6, Math.abs(item.value) * STONE_PITCH);
      // Đống mọc lên theo chiều âm của y; nới thêm một chút xuống dưới để chạm
      // vào con số dưới chân cũng là chạm vào đống.
      if (point.y <= SLOT * 0.9 && point.y >= -height - SLOT * 0.3) hits.push(item.id);
    } else if (point.y >= -SLOT * 0.2 && point.y <= SLOT * 1.2) {
      hits.push(item.id);
    }
  }

  for (const cut of derived.cuts) {
    if (Math.abs(point.x - slotX(cut.before)) <= PITCH * 0.15) hits.push(cut.id);
  }

  return hits;
};

export const sequenceSchemaFragment: EngineSchemaFragment = {
  id: 'sequence',
  configSchema: SequenceConfig,
  elementSchemas: { item: ItemElement, cut: CutElement },
  bounds: { engine: 'sequence', limits: SEQUENCE_LIMITS },
  resolveValidator: resolveSequenceValidator,
  validatorIds: SEQUENCE_VALIDATOR_IDS,

  /** Không có element ngầm định: mọi phần tử của dãy đều nằm trong file. */
  implicitElementIds: () => new Set<string>(),

  checkBounds(scene: Scene, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const items = scene.elements.filter((e) => e.type === 'item');

    if (items.length > SEQUENCE_LIMITS.maxItems) {
      issues.push({
        code: 'bounds/too-many-items',
        severity: 'error',
        message: `${items.length} phần tử, vượt trần ${SEQUENCE_LIMITS.maxItems}`,
        path: `${path}/elements`,
        hint: 'Minh hoạ ở n nhỏ rồi lập luận tổng quát bằng chữ — xem docs/VIZ-COVERAGE.md §6',
      });
    }

    /**
     * Hai phần tử cùng `pos` là dữ liệu hỏng, và nó hỏng **im lặng**: hình vẽ ra
     * hai ô chồng lên nhau, người soạn tưởng mình xoá nhầm, còn analyzer thì đếm
     * đủ cả hai. Bắt ở đây rẻ hơn nhiều so với đi tìm sau.
     */
    const seen = new Map<number, string>();
    for (const item of items) {
      const pos = Number(item['pos'] ?? 0);
      const previous = seen.get(pos);
      if (previous !== undefined) {
        issues.push({
          code: 'bounds/duplicate-pos',
          severity: 'error',
          message: `"${item.id}" và "${previous}" cùng ở vị trí ${pos}`,
          path: `${path}/elements`,
          hint: 'Vị trí là danh tính chỗ đứng; hai phần tử không đứng chung một chỗ được',
        });
      } else {
        seen.set(pos, item.id);
      }
    }

    const mode = sequenceConfig(scene).mode ?? 'sequence';
    if (mode === 'piles') {
      const negative = items.filter((item) => Number(item['value'] ?? 0) < 0);
      if (negative.length > 0) {
        issues.push({
          code: 'bounds/negative-pile',
          severity: 'warning',
          message: `${negative.length} đống mang số âm`,
          path: `${path}/elements`,
          hint: 'Chế độ piles vẽ số sỏi; số âm vẽ ra một cột rỗng và người xem không hiểu',
        });
      }
    }

    return issues;
  },
};
