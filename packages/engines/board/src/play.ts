import type { Move, PlayPlayer, PlayRules } from '@combviz/editor';
import type { PlayBlock, Scene, ValidationIssue } from '@combviz/schema';
import { cellId } from './ids.js';
import type { BoardConfig } from './schema.js';
import { latticeOf } from './geometry.js';

/**
 * **Chomp** — họ luật đầu tiên mà thế cờ *không* phải một đa tập số (GM-01, M78.3).
 *
 * Đây là chỗ lớp ván bị thử thật. Tám họ luật bốc đống đều có thế là vài con số, và
 * `schema.ts` của engine game ghi thẳng rằng ngoài đó là ngoài tầm: *"Chomp, Hackenbush,
 * lật đồng xu, cờ trên đồ thị, game bàn cờ, game tô màu — thế không phải đa tập số, chấm
 * hết."* Ở đây thế là **một bàn cờ**, nước là **một ô**, và nếu hợp đồng `Move` của M78.1
 * đúng thì không cần thêm gì cả.
 *
 * ## Thế nằm ở `holes`, không ở một trường mới
 *
 * Ô đã ăn *là* ô không còn thuộc bàn, và board đã có đúng khái niệm ấy từ P1. Thêm một
 * trường `eaten` song song với `holes` là hai cách nói cùng một chuyện, tức hai chỗ để
 * lệch nhau — và `validate`, renderer, hit-test sẽ phải học cả hai.
 *
 * ## Chomp là ván **misère**, và đó không phải một tuỳ chọn
 *
 * Ăn ô $(0,0)$ thì cả bàn biến mất, nên người ăn ô độc *là* người đi nước cuối cùng.
 * "Ai ăn ô độc thì thua" và "ai đi nước cuối thì thua" là **một câu**. Nhờ vậy Chomp
 * dùng lại nguyên quy ước misère mà `play.ts` đã có, thay vì đòi một hàm `terminal`
 * riêng — đúng như M78.1 đặt cược.
 */

export const BOARD_PLAY_RULES = ['chomp'] as const;

const boardConfig = (scene: Scene): BoardConfig => scene.config as BoardConfig;

/** Ô còn lại trên bàn, theo thứ tự đọc. */
function remaining(config: BoardConfig): { row: number; col: number }[] {
  const holes = new Set((config.holes ?? []).map(([r, c]) => `${r},${c}`));
  const out: { row: number; col: number }[] = [];
  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.cols; col += 1) {
      if (!holes.has(`${row},${col}`)) out.push({ row, col });
    }
  }
  return out;
}

export function boardPlayRules(rule: string): PlayRules | null {
  if (rule !== 'chomp') return null;
  return {
    /**
     * Mọi ô còn lại là một nước — kể cả ô độc.
     *
     * Cấm ăn ô độc thì cũng ra một trò tương đương (hết nước ⇒ thua, normal play), nhưng
     * nó **kể sai câu chuyện**: luật Chomp là *bắt buộc phải ăn*, và cái đau là bị dồn
     * tới chỗ chỉ còn ô độc. Bày ra nước ấy để người học thấy mình bị dồn.
     *
     * `player` bị bỏ qua: Chomp impartial, hai bên cùng tập nước. Hackenbush ở M78.4 mới
     * là chỗ tham số ấy có việc.
     */
    legalMoves(scene: Scene, _player: PlayPlayer): readonly Move[] {
      const config = boardConfig(scene);
      if (latticeOf(config) !== 'square') return [];
      return remaining(config).map(({ row, col }) => {
        const id = cellId(row, col);
        return {
          id: `bite-${row}-${col}`,
          label: row === 0 && col === 0 ? 'Ăn ô độc' : `Ăn từ (${row}, ${col})`,
          command: { type: 'board/chomp-bite', params: { at: id } },
          // **Chỉ ô được chạm**, không phải cả góc phần tư bị ăn. `targets` trả lời
          // câu "chạm vào đâu thì được nước này", không phải câu "nước này ăn những
          // gì" — trộn hai câu thì chạm một ô sẽ ra mọi nước có góc phủ nó.
          targets: [id],
        };
      });
    },
  };
}

/**
 * Bàn phải chơi Chomp được, và quy ước phải là misère.
 *
 * Cả hai đều là **lỗi**, không phải cảnh báo, vì cả hai đều cho ra một ván sai chứ không
 * phải một ván xấu: lưới tam giác thì không nước nào hợp lệ và bài mở ra đã kết thúc;
 * normal play thì người thắng bị đảo, và bài dạy ngược lời giải của chính nó.
 */
export function checkBoardPlay(
  scene: Scene,
  play: PlayBlock,
  path: string,
): ValidationIssue[] {
  if (play.rule !== 'chomp') return [];
  const issues: ValidationIssue[] = [];
  const config = boardConfig(scene);

  if (latticeOf(config) !== 'square') {
    issues.push({
      code: 'play/chomp-needs-square',
      severity: 'error',
      message: `Chomp cần lưới vuông, bàn này là lưới "${latticeOf(config)}"`,
      path: `${path}/rule`,
      hint: '"Mọi ô hàng ≥ r và cột ≥ c" không phải một hình trên lưới tam giác hay lục giác',
    });
  }

  if (play.misere !== true) {
    issues.push({
      code: 'play/chomp-is-misere',
      severity: 'error',
      message: 'Chomp phải khai `misere: true` — ai ăn ô độc thì thua',
      path: `${path}/misere`,
      hint: 'Ăn ô (0,0) xoá cả bàn, nên "ăn ô độc" và "đi nước cuối" là một; normal play đảo ngược người thắng',
    });
  }

  return issues;
}
