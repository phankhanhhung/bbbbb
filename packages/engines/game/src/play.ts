import type { Move, PlayPlayer, PlayRules, SolveResult } from '@combviz/editor';
import type { PlayBlock, Scene, ValidationIssue } from '@combviz/schema';
import { readGame } from './model.js';
import { allMoves, analyzeGame, type Move as PileMove } from './solver.js';

/**
 * **Bốc đống trở thành một họ luật** (GM-01, M78.2).
 *
 * Đây là bài kiểm của lớp `play`, không phải một tính năng mới. Trước khi shell nuốt
 * Chomp hay Hackenbush, nó phải nuốt được thứ **đã chạy** — tám họ luật bốc đống, chín
 * bài đã xuất bản, một solver đã có răng — mà không đổi một byte nào của chúng.
 *
 * Nếu chỗ này phải sửa `solver.ts`, sửa lệnh, hay sửa một bài, thì hợp đồng `Move` của
 * M78.1 sai và nên biết ngay bây giờ chứ không phải sau khi đã có ba substrate đứng lên
 * nó.
 *
 * ## Nó **không** tính lại luật
 *
 * `legalMoves` gọi thẳng `allMoves` — nguồn sự thật duy nhất mà solver, lệnh sandbox,
 * thanh công cụ và validator đều gọi. Việc của tệp này chỉ là **dịch**: một `Move` của
 * `solver.ts` (chỉ số đống + thế sau) thành một `Move` của lớp play (lệnh + đích + nhãn).
 * Viết lại phép sinh nước ở đây là dựng nguồn sự thật thứ hai cho cùng một câu hỏi.
 *
 * ## Một họ, tên là `piles`
 *
 * Tám thành viên của `GameRule` **không** là tám họ luật ở tầng này. Chúng là tham số
 * của cùng một cách chơi, và tham số ấy đã nằm trong `scene.config.rule` nơi engine vốn
 * đã kiểm nó. Khai tám tên ở `play.rule` là bắt tác giả gõ cùng một thứ hai lần, ở hai
 * chỗ có thể lệch nhau.
 */

export const GAME_PLAY_RULES = ['piles'] as const;

/** Nhãn một nước, cùng cách gọi tên mà thanh công cụ dùng. */
function labelOf(counts: readonly number[], move: PileMove): string {
  const [first] = move.becomes;
  const parts = first as readonly number[];
  if (move.piles.length === 2) {
    const took = (counts[move.piles[0] as number] as number) - (parts[0] as number);
    return `Bốc ${took} ở cả hai đống`;
  }
  if (parts.length === 2) return `Chia ${parts[0]} + ${parts[1]}`;
  return `Bốc ${(counts[move.piles[0] as number] as number) - (parts[0] as number)}`;
}

/**
 * Một nước của `solver.ts` → một nước của lớp play.
 *
 * Ba hình dạng nước, ba lệnh, và không có hình dạng thứ tư: `allMoves` chỉ sinh ra
 * "bốc từ một đống", "chia một đống", "bốc ở hai đống". Thành viên luật mới nào sinh ra
 * hình dạng khác sẽ rơi vào `null` ở đây — **không** lặng lẽ thành một nước sai.
 */
function toMove(scene: Scene, counts: readonly number[], move: PileMove): Move | null {
  const ids = readGame(scene).piles.map((p) => p.id);
  const [first] = move.becomes;
  const parts = first as readonly number[];

  if (move.piles.length === 2) {
    const a = ids[move.piles[0] as number] as string;
    const b = ids[move.piles[1] as number] as string;
    const took = (counts[move.piles[0] as number] as number) - (parts[0] as number);
    return {
      id: `both-${a}-${b}-${took}`,
      label: labelOf(counts, move),
      command: { type: 'game/take-both', params: { pile_a: a, pile_b: b, count: took } },
      targets: [a, b],
    };
  }

  const pile = ids[move.piles[0] as number] as string;
  if (parts.length === 2) {
    return {
      id: `split-${pile}-${parts[0]}`,
      label: labelOf(counts, move),
      command: { type: 'game/split', params: { pile, first: parts[0] as number } },
      targets: [pile],
    };
  }
  if (parts.length === 1) {
    const took = (counts[move.piles[0] as number] as number) - (parts[0] as number);
    return {
      id: `take-${pile}-${took}`,
      label: labelOf(counts, move),
      command: { type: 'game/take', params: { pile, count: took } },
      targets: [pile],
    };
  }
  return null;
}

/**
 * Luật chơi cho một scene bốc đống.
 *
 * `player` bị **bỏ qua**, và đó là một sự thật về họ luật này chứ không phải một thiếu
 * sót: cả tám thành viên đều impartial — hai bên cùng tập nước. Tham số vẫn có trong
 * chữ ký vì Hackenbush sẽ cần nó, và thêm một tham số về sau nghĩa là sửa mọi chỗ gọi.
 */
export function gamePlayRules(): PlayRules {
  return {
    legalMoves(scene: Scene, _player: PlayPlayer): readonly Move[] {
      const model = readGame(scene);
      const counts = model.piles.map((p) => p.count);
      return allMoves(counts, model.config.rule, model.config.last_take)
        .map((m) => toMove(scene, counts, m))
        .filter((m): m is Move => m !== null);
    },

    /**
     * Đường tắt Grundy — solver chung **không** duyệt thế nào cả (M78.5).
     *
     * Với bốc đống, lý thuyết Sprague–Grundy trả lời trong vài phép XOR; duyệt lùi thì
     * ra cùng một câu sau hàng trăm nghìn thế. `analyzeGame` đã làm việc ấy từ lâu và
     * đã có răng — chỗ này chỉ dịch câu trả lời của nó sang hợp đồng chung.
     *
     * Nó **cũng biết nói không**: `analyzeGame` từ chối khi không gian thế quá lớn, và
     * lời từ chối ấy đi thẳng ra ngoài chứ không bị nuốt để solver chung thử lại — thử
     * lại là đúng cái sẽ treo máy.
     */
    solve(scene: Scene, _toMove: PlayPlayer, misere: boolean): SolveResult | null {
      const model = readGame(scene);
      const counts = model.piles.map((p) => p.count);
      const analysis = analyzeGame(counts, model.config.rule, misere, model.config.last_take);

      if (analysis.refused !== undefined) {
        return { winner: null, winningMoves: [], states: 0, refused: analysis.refused };
      }

      const ids = analysis.winningMoves
        .map((m) => toMove(scene, counts, m))
        .filter((m): m is Move => m !== null)
        .map((m) => m.id);

      return {
        winner: analysis.winning ? _toMove : _toMove === 'left' ? 'right' : 'left',
        winningMoves: ids,
        // Không duyệt thế nào cả — và con số $0$ nói đúng chuyện ấy.
        states: 0,
        refused: null,
      };
    },
  };
}

/**
 * Quy ước ván và quy ước phân tích phải **khớp nhau**.
 *
 * `config.misere` có từ trước và nó lái phần phân tích Grundy — phổ thắng–thua mà bài
 * vẽ ra. `play.misere` lái **người thắng** của ván. Hai trường, hai việc, nên không
 * phải một bản sao; nhưng để chúng lệch nhau thì bài vẽ phổ của một trò trong khi cho
 * chơi một trò khác, và người học đọc quy luật ở nửa trên rồi thấy nó sai ở nửa dưới.
 *
 * Lỗi chứ không cảnh báo: không có ca nào lệch mà đúng.
 */
export function checkGamePlay(scene: Scene, play: PlayBlock, path: string): ValidationIssue[] {
  const analysis = (readGame(scene).config.misere ?? false) === true;
  const ván = play.misere === true;
  if (analysis === ván) return [];
  return [
    {
      code: 'play/misere-mismatch',
      severity: 'error',
      message: `Ván chơi ${ván ? 'misère' : 'thường'} nhưng phân tích khai ${analysis ? 'misère' : 'thường'}`,
      path: `${path}/misere`,
      hint: 'Phổ thắng–thua vẽ theo `config.misere`; để lệch thì hình dạy một trò còn ván chơi một trò khác',
    },
  ];
}
