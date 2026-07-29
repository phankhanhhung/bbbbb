import type { Scene, SceneValidator } from '@combviz/schema';
import { readDerivation } from './model.js';

/**
 * Validator built-in của Derivation engine (BD-04).
 *
 * Ít hơn hẳn các engine khác, và đó là đúng: ràng buộc thật của một chuỗi biến
 * đổi là **đại số**, mà đại số thì engine này không kiểm được — nó xếp chỗ cho
 * công thức chứ không hiểu công thức. Thứ kiểm được là *hình thức* của chuỗi, và
 * khai ra đúng chừng đó thì thành thật hơn là dựng một validator nghe kêu mà
 * thực chất luôn đạt.
 *
 * Phần bắt lỗi đại số thật nằm ở chỗ khác và nó **có răng**: `derivation/silent-drop`
 * trong check bundle bắt hạng tử biến mất giữa hai bước mà không khai triệt tiêu.
 */
export const DERIVATION_VALIDATOR_IDS = [
  'no-empty-row',
  'every-row-has-relation',
  'cancelled:<k>',
] as const;

export function resolveDerivationValidator(id: string): SceneValidator | null {
  if (id === 'no-empty-row') {
    return {
      id,
      label: 'Không có dòng rỗng',
      check(scene: Scene) {
        const empty = readDerivation(scene)
          .rows.filter((row) => row.terms.length === 0)
          .map((row) => row.id);
        return {
          ok: empty.length === 0,
          message: empty.length === 0 ? 'Mọi dòng đều có hạng tử' : `${empty.length} dòng rỗng`,
          violations: empty,
        };
      },
    };
  }

  if (id === 'every-row-has-relation') {
    return {
      id,
      label: 'Mỗi dòng có một dấu quan hệ',
      check(scene: Scene) {
        const bad = readDerivation(scene)
          .rows.filter((row) => !row.terms.some((t) => t.role === 'relation'))
          .map((row) => row.id);
        return {
          ok: bad.length === 0,
          message:
            bad.length === 0
              ? 'Dòng nào cũng có dấu quan hệ'
              : `${bad.length} dòng không có dấu quan hệ nên không gióng cột được`,
          violations: bad,
        };
      },
    };
  }

  const cancelled = /^cancelled:(\d+)$/.exec(id);
  if (cancelled) {
    const want = Number(cancelled[1]);
    return {
      id,
      label: `Triệt tiêu đúng ${want} hạng tử`,
      check(scene: Scene) {
        const marked = readDerivation(scene)
          .rows.flatMap((row) => row.terms)
          .filter((t) => t.cancelled);
        return {
          ok: marked.length === want,
          message: `Đã triệt tiêu ${marked.length}/${want}`,
          violations: marked.length > want ? marked.map((t) => t.id) : [],
        };
      },
    };
  }

  return null;
}
