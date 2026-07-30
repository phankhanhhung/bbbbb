import type { Scene, SceneValidator } from '@combviz/schema';
import { readGame } from './model.js';
import { analyzeGame } from './solver.js';

/**
 * `hand-opponent-a-loss` — thế hiện tại là thế **thua** của người sắp đi.
 *
 * Đây là mục tiêu sandbox đúng của cả họ bài: người học đi một nước, và nước ấy
 * phải đẩy đối thủ vào thế thua. Ràng buộc phát biểu trên **thế sau khi đi**, nên
 * "đạt" nghĩa là "vừa đi một nước thắng" — chấm được, và chấm đúng thứ bài toán
 * hỏi thay vì một tiêu chí thay thế.
 */
const handOpponentALoss: SceneValidator = {
  id: 'hand-opponent-a-loss',
  label: 'Đối thủ đang ở thế thua',
  check(scene: Scene) {
    const model = readGame(scene);
    const analysis = analyzeGame(
      model.piles.map((p) => p.count),
      model.config.rule,
      model.config.misere === true,
      model.config.last_take,
    );
    if (analysis.refused !== undefined) {
      return { ok: true, violations: [], message: `Bỏ qua: ${analysis.refused}` };
    }
    return analysis.winning
      ? {
          ok: false,
          violations: model.piles.map((p) => p.id),
          message: 'Người sắp đi vẫn đang thắng — chưa phải thế thua',
        }
      : { ok: true, violations: [] };
  },
};

/** `no-empty-pile` — không đống nào rỗng. Giữ hình sạch khi soạn. */
const noEmptyPile: SceneValidator = {
  id: 'no-empty-pile',
  label: 'Không có đống rỗng',
  check(scene: Scene) {
    const empty = readGame(scene)
      .piles.filter((p) => p.count === 0)
      .map((p) => p.id);
    return empty.length === 0
      ? { ok: true, violations: [] }
      : { ok: false, violations: empty, message: `${empty.length} đống rỗng` };
  },
};

const FIXED: readonly SceneValidator[] = [handOpponentALoss, noEmptyPile];

export function resolveGameValidator(id: string): SceneValidator | null {
  const found = FIXED.find((v) => v.id === id);
  if (found) return found;

  // `total:<k>` — tổng số viên bằng đúng $k$. Dùng khi bài cố định tổng.
  const match = /^total:(\d+)$/.exec(id);
  if (match) {
    const want = Number(match[1]);
    return {
      id,
      label: `Tổng số viên bằng ${want}`,
      check(scene: Scene) {
        const model = readGame(scene);
        const total = model.piles.reduce((a, p) => a + p.count, 0);
        return total === want
          ? { ok: true, violations: [] }
          : {
              ok: false,
              violations: model.piles.map((p) => p.id),
              message: `Tổng ${total}, cần ${want}`,
            };
      },
    };
  }

  return null;
}

export const GAME_VALIDATOR_IDS: readonly string[] = [
  ...FIXED.map((v) => v.id),
  'total:<k>',
];
