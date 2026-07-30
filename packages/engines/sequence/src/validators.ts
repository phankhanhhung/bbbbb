import {
  parseValidatorId,
  type Scene,
  type SceneValidator,
  type ValidatorOutcome,
} from '@combviz/schema';
import { deriveSequence, longestMonotone } from './geometry.js';

/**
 * Validator built-in của Sequence engine.
 *
 * Chúng trả lời câu hỏi "trạng thái này có hợp lệ không", **không** trả lời "phép
 * biến đổi vừa rồi có hợp lệ không" — validator chỉ nhìn thấy một scene. Ràng
 * buộc về *phép biến đổi* nằm trong tập lệnh (xem `commands.ts`), và đó là chỗ
 * đúng của nó: người học không lách được một thao tác không tồn tại.
 */

const OK: ValidatorOutcome = { ok: true, violations: [] };

const nonNegative: SceneValidator = {
  id: 'values-non-negative',
  label: 'Mọi giá trị không âm',
  check(scene: Scene): ValidatorOutcome {
    const violations = deriveSequence(scene)
      .items.filter((item) => item.value < 0)
      .map((item) => item.id);

    return violations.length === 0
      ? OK
      : { ok: false, violations, message: `${violations.length} phần tử mang giá trị âm` };
  },
};

const integers: SceneValidator = {
  id: 'values-integer',
  label: 'Mọi giá trị là số nguyên',
  check(scene: Scene): ValidatorOutcome {
    const violations = deriveSequence(scene)
      .items.filter((item) => !Number.isInteger(item.value))
      .map((item) => item.id);

    return violations.length === 0
      ? OK
      : { ok: false, violations, message: `${violations.length} phần tử không nguyên` };
  },
};

const distinct: SceneValidator = {
  id: 'values-distinct',
  label: 'Các giá trị đôi một khác nhau',
  check(scene: Scene): ValidatorOutcome {
    const seen = new Map<number, string>();
    const violations = new Set<string>();

    for (const item of deriveSequence(scene).items) {
      const previous = seen.get(item.value);
      if (previous !== undefined) {
        violations.add(previous);
        violations.add(item.id);
      } else {
        seen.set(item.value, item.id);
      }
    }

    return violations.size === 0
      ? OK
      : { ok: false, violations: [...violations], message: 'Có giá trị lặp lại' };
  },
};

/**
 * Dãy không giảm.
 *
 * Chỉ ra **cặp** vi phạm chứ không chỉ ra cả dãy: mục tiêu của người học trong
 * sandbox sắp xếp là tìm chỗ còn sai, và tô đỏ cả dãy thì không nói được gì.
 */
const sorted: SceneValidator = {
  id: 'sorted',
  label: 'Dãy không giảm',
  check(scene: Scene): ValidatorOutcome {
    const items = deriveSequence(scene).items;
    const violations = new Set<string>();

    for (let i = 1; i < items.length; i += 1) {
      const previous = items[i - 1]!;
      const current = items[i]!;
      if (previous.value > current.value) {
        violations.add(previous.id);
        violations.add(current.id);
      }
    }

    return violations.size === 0
      ? OK
      : {
          ok: false,
          violations: [...violations],
          message: `${violations.size / 2 < 1 ? 1 : Math.ceil(violations.size / 2)} chỗ nghịch thứ tự`,
        };
  },
};

const FIXED: readonly SceneValidator[] = [nonNegative, integers, distinct, sorted];

export function resolveSequenceValidator(id: string): SceneValidator | null {
  const found = FIXED.find((v) => v.id === id);
  if (found) return found;

  const { name, arg } = parseValidatorId(id);

  if (name === 'total' && arg !== undefined) {
    return {
      id,
      label: `Tổng bằng ${arg}`,
      check(scene) {
        const derived = deriveSequence(scene);
        return derived.total === arg
          ? OK
          : {
              ok: false,
              violations: derived.items.map((item) => item.id),
              message: `Tổng là ${derived.total}, cần ${arg}`,
            };
      },
    };
  }

  if (name === 'count' && arg !== undefined) {
    return {
      id,
      label: `Có đúng ${arg} phần tử`,
      check(scene) {
        const derived = deriveSequence(scene);
        return derived.items.length === arg
          ? OK
          : {
              ok: false,
              violations: derived.items.map((item) => item.id),
              message: `Đang có ${derived.items.length} phần tử, cần ${arg}`,
            };
      },
    };
  }

  /**
   * `no-monotone:<k>` — không có dãy con đơn điệu nào dài quá $k$ (SQ-01).
   *
   * Mục tiêu sandbox đúng của họ Erdős–Szekeres, và nó có một tính chất hiếm: với
   * $k^2$ phần tử thì **đạt được** (xếp thành $k$ khối giảm dần), còn với
   * $k^2 + 1$ thì **không thể** — người học xếp bao lâu cũng không xanh, và đó
   * chính là điều định lý nói. Một mục tiêu bất khả thi có chủ đích.
   */
  if (name === 'no-monotone' && arg !== undefined) {
    return {
      id,
      label: `Không có dãy con đơn điệu dài quá ${arg}`,
      check(scene) {
        const derived = deriveSequence(scene);
        const worst =
          derived.longestIncreasing >= derived.longestDecreasing ? 'increasing' : 'decreasing';
        const length = Math.max(derived.longestIncreasing, derived.longestDecreasing);
        if (length <= arg) return OK;
        return {
          ok: false,
          // Chỉ ra **chuỗi** quá dài, không tô đỏ cả dãy: người học đang xếp lại
          // thì thứ họ cần thấy là chuỗi nào đang hỏng.
          violations: [...longestMonotone(derived, worst)],
          message: `Có dãy con ${worst === 'increasing' ? 'tăng' : 'giảm'} dài ${length}, quá ${arg}`,
        };
      },
    };
  }

  if (name === 'max-value' && arg !== undefined) {
    return {
      id,
      label: `Mọi giá trị ≤ ${arg}`,
      check(scene) {
        const violations = deriveSequence(scene)
          .items.filter((item) => item.value > arg)
          .map((item) => item.id);
        return violations.length === 0
          ? OK
          : { ok: false, violations, message: `${violations.length} phần tử vượt ${arg}` };
      },
    };
  }

  return null;
}

export const SEQUENCE_VALIDATOR_IDS: readonly string[] = [
  ...FIXED.map((v) => v.id),
  'total:<k>',
  'count:<k>',
  'max-value:<k>',
  'no-monotone:<k>',
];
