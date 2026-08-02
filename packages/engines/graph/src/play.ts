import type { Move, PlayPlayer, PlayRules } from '@combviz/editor';
import type { PlayBlock, Scene, ValidationIssue } from '@combviz/schema';
import { buildGraph } from './graph.js';
import { graphCommands } from './index.js';

/**
 * **Hai ván trên đồ thị** (GM-01, M78.4).
 *
 * Chomp đã chứng minh lớp ván nuốt được một thế cờ không phải đa tập số. Hai họ luật ở
 * đây hỏi hai câu mà Chomp *không* hỏi được:
 *
 *   - **Geography** — thế cờ **teo đi**: mỗi nước xoá một đỉnh, nên đồ thị nhỏ dần và
 *     ván chắc chắn dừng. Nó cũng là họ luật đầu tiên mà thế có một *con trỏ* (quân
 *     đang ở đâu) chứ không chỉ một hình.
 *   - **Hackenbush xanh–đỏ** — **partizan**: hai bên có hai tập nước khác hẳn nhau. Đây
 *     là câu hỏi mà cả nim lẫn Chomp đều trả lời được bằng cách bỏ qua tham số `player`,
 *     và M78.6 vừa cho thấy một tham số trơ thì **không chốt canh nào bắt được**. Từ đây
 *     nó có răng.
 *
 * ## "Xanh–đỏ" ở đây là xanh đậm và **cam đất**
 *
 * Bảng màu của kho là Okabe–Ito, chọn để người mù màu vẫn phân biệt được, và nó **không
 * có đỏ** — đỏ với lục là cặp lẫn nhau nhiều nhất. Class 1 (xanh đậm, nét liền) và
 * class 3 (cam đất, gạch chéo trái) khác nhau cả về sắc, độ sáng, **và** hoa văn.
 *
 * Ở một trò mà màu *là* luật chứ không phải trang trí, chỗ này quan trọng hơn bình
 * thường: một người không phân biệt được hai màu thì không chơi được ván, chứ không
 * phải chỉ thấy hình xấu.
 */

export const GRAPH_PLAY_RULES = ['geography', 'hackenbush', 'script'] as const;

/** Cạnh của Left — xanh đậm. */
export const HACKENBUSH_LEFT = 1;
/** Cạnh của Right — cam đất. */
export const HACKENBUSH_RIGHT = 3;

const configOf = (scene: Scene): { token?: string; ground?: string } =>
  scene.config as { token?: string; ground?: string };

/**
 * Geography: quân đi theo cạnh, đỉnh vừa rời bị xoá.
 *
 * Impartial — hai bên cùng tập nước — nên `player` bị bỏ qua, y như Chomp. Ván **normal
 * play**: hết nước thì thua, và đó là quy ước đúng ở đây (không như Chomp, nơi ăn ô độc
 * và đi nước cuối là một câu).
 */
function geography(): PlayRules {
  return {
    /**
     * Trần rộng hơn Chomp, vì thế cờ teo nhanh hơn.
     *
     * Mỗi nước xoá đúng một đỉnh, nên độ sâu ván $\le n$ và số thế bị chặn bởi số cặp
     * (tập đỉnh còn lại, quân đang ở đâu). Đồ thị mười đỉnh trong bài thì con số ấy nhỏ;
     * đồ thị hai mươi đỉnh thì nó nổ theo hàm mũ và trần này chặn trước — geography là
     * PSPACE-đầy đủ, nên không có công thức nào cứu, chỉ có lời từ chối.
     */
    solverBound: 8_000,
    legalMoves(scene: Scene, _player: PlayPlayer): readonly Move[] {
      const from = configOf(scene).token;
      if (from === undefined) return [];
      const graph = buildGraph(scene);
      if (!graph.byId.has(from)) return [];

      const seen = new Set<string>();
      const moves: Move[] = [];
      for (const entry of graph.adjacency.get(from) ?? []) {
        // Cạnh song song cho **cùng một nước**: đi tới đỉnh ấy, không phải "đi qua cạnh
        // thứ hai". Hai dòng cùng id trong bảng nước đi thì dòng sau bấm không được.
        if (entry.to === from || seen.has(entry.to)) continue;
        seen.add(entry.to);
        const command = { type: 'graph/move-token', params: { to: entry.to } } as const;
        moves.push({
          id: `to-${entry.to}`,
          label: graphCommands[command.type]!.label(command.params, scene),
          command,
          targets: [entry.to],
        });
      }
      return moves;
    },
  };
}

/**
 * Hackenbush xanh–đỏ: mỗi bên chỉ gỡ cạnh **màu mình**.
 *
 * Đây là chỗ `player` có việc, và cả lớp ván đứng hay đổ ở chỗ này: `createPlay`,
 * `playMove`, `settle` và `solveGame` đều truyền `player` xuống, nhưng cho tới lúc này
 * chưa có họ luật nào đọc nó. Một tham số đi hết bốn tầng mà không ai đọc thì nó *có
 * thể* đã bị nối sai từ tầng đầu, và mọi chốt canh vẫn xanh.
 */
function hackenbush(): PlayRules {
  return {
    solverBound: 8_000,
    legalMoves(scene: Scene, player: PlayPlayer): readonly Move[] {
      if (configOf(scene).ground === undefined) return [];
      const mine = player === 'left' ? HACKENBUSH_LEFT : HACKENBUSH_RIGHT;

      return buildGraph(scene)
        .edges.filter((edge) => edge.colorClass === mine)
        .map((edge) => {
          const command = { type: 'graph/remove-edge-prune', params: { edge: edge.id } } as const;
          return {
            id: `cut-${edge.id}`,
            label: graphCommands[command.type]!.label(command.params, scene),
            command,
            targets: [edge.id],
          };
        });
    },
  };
}

export function graphPlayRules(rule: string): PlayRules | null {
  if (rule === 'geography') return geography();
  if (rule === 'hackenbush') return hackenbush();
  return null;
}

/**
 * Thế mở màn phải **chơi được**, và cả hai phép kiểm đều là lỗi.
 *
 * Cùng lý lẽ với Chomp: một bài mở ra đã kết thúc không phải một bài xấu mà là một bài
 * *sai* — người học bấm vào và không có gì xảy ra, mà không ai nói vì sao. Ở đây triệu
 * chứng còn im lặng hơn, vì `legalMoves` trả danh sách rỗng và giao diện đọc nó thành
 * "hết nước" — tức là **một câu trả lời**, chỉ là câu sai.
 */
export function checkGraphPlay(scene: Scene, play: PlayBlock, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const config = configOf(scene);
  const graph = buildGraph(scene);

  if (play.rule === 'geography') {
    if (config.token === undefined) {
      issues.push({
        code: 'play/geography-needs-token',
        severity: 'error',
        message: 'Geography cần `config.token` — quân đang đứng ở đỉnh nào?',
        path: `${path}/rule`,
        hint: 'Không có quân thì không nước nào hợp lệ, và bài mở ra đã kết thúc',
      });
    } else if (!graph.byId.has(config.token)) {
      issues.push({
        code: 'play/geography-token-missing',
        severity: 'error',
        message: `\`config.token\` trỏ tới "${config.token}" mà đồ thị không có đỉnh ấy`,
        path: `${path}/rule`,
      });
    }
    if (play.misere === true) {
      issues.push({
        code: 'play/geography-is-normal',
        severity: 'error',
        message: 'Geography là ván thường: ai hết nước thì thua',
        path: `${path}/misere`,
        hint: 'Misère đảo người thắng, nên bài sẽ dạy ngược lời giải của chính nó',
      });
    }
  }

  if (play.rule === 'hackenbush') {
    if (config.ground === undefined) {
      issues.push({
        code: 'play/hackenbush-needs-ground',
        severity: 'error',
        message: 'Hackenbush cần `config.ground` — mặt đất là đỉnh nào?',
        path: `${path}/rule`,
        hint: 'Không có đất thì "phần rời mặt đất rụng" không định nghĩa được',
      });
    } else if (!graph.byId.has(config.ground)) {
      issues.push({
        code: 'play/hackenbush-ground-missing',
        severity: 'error',
        message: `\`config.ground\` trỏ tới "${config.ground}" mà đồ thị không có đỉnh ấy`,
        path: `${path}/rule`,
      });
    }

    // Cạnh không mang màu của bên nào là cạnh **không ai gỡ được** — nó đứng đó mãi, và
    // nếu nó là cầu thì cả một nhánh không bao giờ rụng. Đó không phải Hackenbush nữa,
    // nên nói ra chứ không để tác giả tự phát hiện qua một ván kỳ quái.
    const orphan = graph.edges.filter(
      (e) => e.colorClass !== HACKENBUSH_LEFT && e.colorClass !== HACKENBUSH_RIGHT,
    );
    if (orphan.length > 0) {
      issues.push({
        code: 'play/hackenbush-colourless-edge',
        severity: 'error',
        message: `${orphan.length} cạnh không thuộc bên nào (cần color_class ${HACKENBUSH_LEFT} hoặc ${HACKENBUSH_RIGHT})`,
        path: `${path}/rule`,
        hint: `Cạnh đầu tiên như vậy: "${orphan[0]!.id}" — không bên nào gỡ được nó, nên nhánh treo trên nó không bao giờ rụng`,
      });
    }
  }

  return issues;
}
