import {
  parseValidatorId,
  type Scene,
  type SceneValidator,
  type ValidatorOutcome,
} from '@combviz/schema';
import { deriveSet } from './derive.js';

const OK: ValidatorOutcome = { ok: true, violations: [] };

/**
 * Phản xích: không tập nào chứa tập nào (ST + Sperner).
 *
 * Đây là ràng buộc trung tâm của cả cụm bài extremal set theory, và nó là lý do
 * engine này lưu quan hệ thuộc dưới dạng dữ liệu thay vì hình vẽ: "A ⊆ B" phải
 * kiểm được bằng máy, không phải bằng cách nhìn hai hình tròn.
 */
const antichain: SceneValidator = {
  id: 'antichain',
  label: 'Không tập nào chứa tập nào',
  check(scene: Scene): ValidatorOutcome {
    const derived = deriveSet(scene);
    const members = new Map(
      derived.sets.map((s) => [
        s.id,
        new Set(derived.tokens.filter((t) => t.sets.includes(s.id)).map((t) => t.id)),
      ]),
    );

    for (const a of derived.sets) {
      for (const b of derived.sets) {
        if (a.id === b.id) continue;
        const ma = members.get(a.id) as Set<string>;
        const mb = members.get(b.id) as Set<string>;
        if (ma.size <= mb.size && [...ma].every((x) => mb.has(x))) {
          return {
            ok: false,
            violations: [a.id, b.id],
            message: `"${a.label}" nằm trong "${b.label}"`,
          };
        }
      }
    }
    return OK;
  },
};

const pairwiseDisjoint: SceneValidator = {
  id: 'pairwise-disjoint',
  label: 'Các tập đôi một rời nhau',
  check(scene: Scene): ValidatorOutcome {
    const violations = deriveSet(scene)
      .tokens.filter((t) => t.sets.length > 1)
      .map((t) => t.id);
    return violations.length === 0
      ? OK
      : { ok: false, violations, message: `${violations.length} phần tử thuộc nhiều tập` };
  },
};

const coversUniverse: SceneValidator = {
  id: 'covers-universe',
  label: 'Mọi phần tử thuộc ít nhất một tập',
  check(scene: Scene): ValidatorOutcome {
    const violations = deriveSet(scene)
      .tokens.filter((t) => t.sets.length === 0)
      .map((t) => t.id);
    return violations.length === 0
      ? OK
      : { ok: false, violations, message: `${violations.length} phần tử không thuộc tập nào` };
  },
};

const distinctSets: SceneValidator = {
  id: 'sets-distinct',
  label: 'Không hai tập nào trùng nhau',
  check(scene: Scene): ValidatorOutcome {
    const derived = deriveSet(scene);
    const seen = new Map<string, string>();

    for (const set of derived.sets) {
      const key = derived.tokens
        .filter((t) => t.sets.includes(set.id))
        .map((t) => t.id)
        .sort()
        .join('|');
      const previous = seen.get(key);
      if (previous !== undefined) {
        return { ok: false, violations: [previous, set.id], message: 'Hai tập trùng nhau' };
      }
      seen.set(key, set.id);
    }
    return OK;
  },
};

/**
 * Gia đình **giao nhau**: hai tập bất kỳ có chung ít nhất một phần tử.
 *
 * Điều kiện của Erdős–Ko–Rado, và là ràng buộc extremal hay gặp thứ hai sau phản
 * xích. Chỉ ra **cặp** rời nhau chứ không tô đỏ cả gia đình: người học đang thêm
 * bớt tập thì thứ họ cần thấy là hai tập nào đang không chịu nhau.
 *
 * Gia đình rỗng hoặc một tập thì **đạt** — không có cặp nào để vi phạm. Đó không
 * phải kẽ hở: mệnh đề "mọi cặp đều …" đúng một cách trống rỗng, và trả về sai ở
 * đây sẽ dạy người học một logic hỏng.
 */
const intersecting: SceneValidator = {
  id: 'intersecting',
  label: 'Hai tập bất kỳ đều có phần tử chung',
  check(scene: Scene): ValidatorOutcome {
    const derived = deriveSet(scene);

    for (let i = 0; i < derived.sets.length; i += 1) {
      for (let j = i + 1; j < derived.sets.length; j += 1) {
        const a = derived.sets[i] as { id: string; label: string };
        const b = derived.sets[j] as { id: string; label: string };
        const shared = derived.tokens.filter(
          (t) => t.sets.includes(a.id) && t.sets.includes(b.id),
        );
        if (shared.length === 0) {
          return {
            ok: false,
            violations: [a.id, b.id],
            message: `"${a.label}" và "${b.label}" rời nhau`,
          };
        }
      }
    }
    return OK;
  },
};

/**
 * **Hoa hướng dương**: mọi cặp tập giao nhau đúng ở **cùng một** lõi.
 *
 * Khác `intersecting` ở chỗ nó đòi các giao **bằng nhau**, không chỉ khác rỗng —
 * và khác biệt ấy là toàn bộ nội dung của bổ đề hoa hướng dương. Một gia đình đôi
 * một giao nhau mà giao ở những chỗ khác nhau thì **không** phải hoa: cánh hoa
 * phải chỉ chạm nhau ở tâm.
 *
 * Gia đình đôi một **rời nhau** cũng là hoa, với lõi rỗng. Đó là quy ước chuẩn và
 * nó không phải chuyện vặt: chính trường hợp lõi rỗng làm bổ đề dùng được, vì thứ
 * người ta trích ra từ một gia đình lớn thường là một hoa rời nhau.
 */
const sunflower: SceneValidator = {
  id: 'sunflower',
  label: 'Các tập giao nhau đúng ở một lõi chung',
  check(scene: Scene): ValidatorOutcome {
    const derived = deriveSet(scene);
    if (derived.sets.length < 2) return OK;

    const coreOf = (a: string, b: string): string =>
      derived.tokens
        .filter((t) => t.sets.includes(a) && t.sets.includes(b))
        .map((t) => t.id)
        .sort()
        .join('|');

    const first = coreOf(
      (derived.sets[0] as { id: string }).id,
      (derived.sets[1] as { id: string }).id,
    );

    for (let i = 0; i < derived.sets.length; i += 1) {
      for (let j = i + 1; j < derived.sets.length; j += 1) {
        const a = derived.sets[i] as { id: string; label: string };
        const b = derived.sets[j] as { id: string; label: string };
        if (coreOf(a.id, b.id) !== first) {
          return {
            ok: false,
            violations: [a.id, b.id],
            message: `"${a.label}" ∩ "${b.label}" khác lõi của các cặp kia`,
          };
        }
      }
    }
    return OK;
  },
};

const FIXED: readonly SceneValidator[] = [
  antichain,
  intersecting,
  sunflower,
  pairwiseDisjoint,
  coversUniverse,
  distinctSets,
];

export function resolveSetValidator(id: string): SceneValidator | null {
  const found = FIXED.find((v) => v.id === id);
  if (found) return found;

  const { name, arg } = parseValidatorId(id);

  if (name === 'set-size' && arg !== undefined) {
    return {
      id,
      label: `Mọi tập có đúng ${arg} phần tử`,
      check(scene) {
        const violations = deriveSet(scene)
          .sets.filter((s) => s.size !== arg)
          .map((s) => s.id);
        return violations.length === 0
          ? OK
          : { ok: false, violations, message: `${violations.length} tập sai cỡ` };
      },
    };
  }

  if (name === 'max-degree' && arg !== undefined) {
    return {
      id,
      label: `Mỗi phần tử thuộc nhiều nhất ${arg} tập`,
      check(scene) {
        const violations = deriveSet(scene)
          .tokens.filter((t) => t.sets.length > arg)
          .map((t) => t.id);
        return violations.length === 0
          ? OK
          : { ok: false, violations, message: `${violations.length} phần tử vượt ngưỡng` };
      },
    };
  }

  /**
   * `min-common:<k>` — hai tập bất kỳ chung **ít nhất** $k$ phần tử.
   *
   * `min-common:1` chính là `intersecting`; giá trị lớn hơn là điều kiện của họ
   * bài thiết kế khối (mỗi cặp gặp nhau đúng $\lambda$ lần). Hai validator cùng
   * tồn tại vì `intersecting` là tên mà bài toán gọi nó, và một mục tiêu sandbox
   * đọc được thành lời là một mục tiêu người học hiểu ngay.
   */
  if (name === 'min-common' && arg !== undefined) {
    return {
      id,
      label: `Hai tập bất kỳ chung ít nhất ${arg} phần tử`,
      check(scene) {
        const derived = deriveSet(scene);
        for (let i = 0; i < derived.sets.length; i += 1) {
          for (let j = i + 1; j < derived.sets.length; j += 1) {
            const a = derived.sets[i] as { id: string; label: string };
            const b = derived.sets[j] as { id: string; label: string };
            const shared = derived.tokens.filter(
              (t) => t.sets.includes(a.id) && t.sets.includes(b.id),
            ).length;
            if (shared < arg) {
              return {
                ok: false,
                violations: [a.id, b.id],
                message: `"${a.label}" và "${b.label}" chỉ chung ${shared} phần tử`,
              };
            }
          }
        }
        return OK;
      },
    };
  }

  return null;
}

export const SET_VALIDATOR_IDS: readonly string[] = [
  ...FIXED.map((v) => v.id),
  'set-size:<k>',
  'max-degree:<k>',
  'min-common:<k>',
];
