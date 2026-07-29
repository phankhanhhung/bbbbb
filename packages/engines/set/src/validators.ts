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

const FIXED: readonly SceneValidator[] = [
  antichain,
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

  return null;
}

export const SET_VALIDATOR_IDS: readonly string[] = [
  ...FIXED.map((v) => v.id),
  'set-size:<k>',
  'max-degree:<k>',
];
