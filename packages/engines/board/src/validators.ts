import {
  parseValidatorId,
  type Scene,
  type SceneValidator,
  type ValidatorOutcome,
} from '@combviz/schema';
import { deriveBoard, piecesAttack, tileCells } from './dsl.js';
import { cellId } from './ids.js';
import type { BoardConfig } from './schema.js';

/**
 * Validator built-in của Grid/Board (BD-04).
 *
 * Viết bằng code chứ không bằng DSL vì chúng cần chỉ ra **đúng phần tử nào** vi
 * phạm, còn DSL chỉ trả về một giá trị. Điều kiện riêng của từng bài thì khai
 * bằng DSL — đó là cửa thoát, không phải đường chính.
 */

const OK: ValidatorOutcome = { ok: true, violations: [] };

const tilesNoOverlap: SceneValidator = {
  id: 'tiles-no-overlap',
  label: 'Các quân không chồng lên nhau',
  check(scene: Scene): ValidatorOutcome {
    const owner = new Map<string, string>();
    const violations = new Set<string>();

    for (const item of scene.elements) {
      if (item.type !== 'tile') continue;
      for (const [r, c] of tileCells(item)) {
        const key = `${r},${c}`;
        const previous = owner.get(key);
        if (previous) {
          violations.add(previous);
          violations.add(item.id);
        } else {
          owner.set(key, item.id);
        }
      }
    }

    if (violations.size === 0) return OK;
    return {
      ok: false,
      violations: [...violations],
      message: `${violations.size} quân chồng lên nhau`,
    };
  },
};

const tilesInBounds: SceneValidator = {
  id: 'tiles-in-bounds',
  label: 'Các quân nằm trong bàn và không đè ô khuyết',
  check(scene: Scene): ValidatorOutcome {
    const config = scene.config as BoardConfig;
    const holes = new Set((config?.holes ?? []).map(([r, c]) => `${r},${c}`));
    const violations: string[] = [];

    for (const item of scene.elements) {
      if (item.type !== 'tile') continue;
      const cells = tileCells(item);
      const bad = cells.some(
        ([r, c]) =>
          r < 0 ||
          c < 0 ||
          r >= config.rows ||
          c >= config.cols ||
          // Ô khuyết không phải là ô: phủ lên nó cũng là tràn biên, chỉ là kiểu
          // tràn mà mắt khó thấy hơn.
          holes.has(`${r},${c}`),
      );
      if (bad) violations.push(item.id);
    }

    if (violations.length === 0) return OK;
    return {
      ok: false,
      violations,
      message: `${violations.length} quân nằm ngoài bàn hoặc đè lên ô khuyết`,
    };
  },
};

const fullCover: SceneValidator = {
  id: 'full-cover',
  label: 'Phủ kín mọi ô',
  check(scene: Scene): ValidatorOutcome {
    const derived = deriveBoard(scene);
    const uncovered = derived.cells.filter(
      (cell) => !cell.props['hole'] && !cell.props['covered'],
    );

    if (uncovered.length === 0) return OK;
    return {
      ok: false,
      violations: uncovered.map((cell) => cell.id),
      message: `Còn ${uncovered.length} ô chưa phủ`,
    };
  },
};

const noAttacks: SceneValidator = {
  id: 'no-attacks',
  label: 'Không quân nào ăn nhau',
  check(scene: Scene): ValidatorOutcome {
    const derived = deriveBoard(scene);
    const violations = new Set<string>();

    // O(n²) là đủ: NFR-P4 chặn ở 200 quân, tức 40 000 cặp — rẻ hơn nhiều so với
    // một chỉ mục theo hàng/cột/chéo mà lại còn phải xử lý chặn tầm.
    for (const a of derived.pieces) {
      for (const b of derived.pieces) {
        if (a.id === b.id) continue;
        if (piecesAttack(scene, a.id, b.id)) {
          violations.add(a.id);
          violations.add(b.id);
        }
      }
    }

    if (violations.size === 0) return OK;
    return {
      ok: false,
      violations: [...violations],
      message: `${violations.size} quân đang ăn được nhau`,
    };
  },
};


function piecesPerLine(axis: 'row' | 'col', expected: number): SceneValidator {
  const label =
    axis === 'row' ? `Mỗi hàng đúng ${expected} quân` : `Mỗi cột đúng ${expected} quân`;

  return {
    id: `pieces-per-${axis}:${expected}`,
    label,
    check(scene: Scene): ValidatorOutcome {
      const derived = deriveBoard(scene);
      const total = axis === 'row' ? derived.rows : derived.cols;
      const counts = new Array<number>(total).fill(0);

      for (const piece of derived.pieces) {
        const index = Number(piece.props[axis]);
        if (index >= 0 && index < total) counts[index] = (counts[index] ?? 0) + 1;
      }

      const badLines = counts
        .map((count, index) => ({ count, index }))
        .filter(({ count }) => count !== expected);

      if (badLines.length === 0) return OK;

      // Vi phạm ở đây là cả một *hàng*, không phải một quân — nên chỉ ra ô đầu
      // hàng để sandbox có chỗ tô đỏ.
      const violations = badLines.map(({ index }) =>
        axis === 'row' ? cellId(index, 0) : cellId(0, index),
      );

      return {
        ok: false,
        violations,
        message: `${badLines.length} ${axis === 'row' ? 'hàng' : 'cột'} không có đúng ${expected} quân`,
      };
    },
  };
}

const FIXED: readonly SceneValidator[] = [
  tilesNoOverlap,
  tilesInBounds,
  fullCover,
  noAttacks,
];

export const BOARD_VALIDATORS: Readonly<Record<string, SceneValidator>> =
  Object.fromEntries(FIXED.map((validator) => [validator.id, validator]));

/** Tra validator theo id, kể cả dạng có tham số `pieces-per-row:2`. */
export function resolveBoardValidator(id: string): SceneValidator | null {
  const fixed = BOARD_VALIDATORS[id];
  if (fixed) return fixed;

  const { name, arg } = parseValidatorId(id);
  if ((name === 'pieces-per-row' || name === 'pieces-per-col') && arg !== undefined) {
    return piecesPerLine(name === 'pieces-per-row' ? 'row' : 'col', arg);
  }

  return null;
}

export const BOARD_VALIDATOR_IDS: readonly string[] = [
  ...FIXED.map((v) => v.id),
  'pieces-per-row:<k>',
  'pieces-per-col:<k>',
];
