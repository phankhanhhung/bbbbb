import type { Scene } from '@combviz/schema';
import { other, type CommandRegistry, type PlayPlayer } from './command.js';
import { applyMoveTo, terminalWinner, type PlayRules } from './play.js';
import { positionKey } from './trail.js';

/**
 * **Ai thắng thế này** — solver tổng quát cho lớp ván (GM-03, M78.5).
 *
 * Engine game đã có một solver, và nó **ở lại**: với bốc đống, lý thuyết Sprague–Grundy
 * trả lời trong vài phép XOR, còn duyệt lùi thì duyệt hàng trăm nghìn thế để ra cùng
 * một câu. Chỗ này không thay nó; chỗ này trả lời cho những thế mà **không** có công
 * thức nào — bàn Chomp, quân trên đồ thị, và mọi họ luật sau đó. Họ luật nào tự trả lời
 * được thì khai `solve` và solver chung đứng ngoài.
 *
 * ## Ước lượng không dùng được nữa
 *
 * `analyzeGame` ước lượng không gian thế bằng một tích các số đống, rồi từ chối *trước
 * khi* duyệt. Ước lượng ấy đúng cho đa tập số và **sai cho bàn cờ**: số thế của Chomp
 * $m\times n$ không phải $2^{mn}$ mà là số iđêan thứ tự — $3\times3$ có $20$ thế chứ
 * không phải $512$. Ước dôi thì từ chối những bài giải được ngon lành; ước hụt thì treo
 * máy. Nên ở đây **đo thật**: duyệt và đếm, chạm trần thì dừng và nói ra.
 *
 * ## Trần là **số thế**, không phải thời gian
 *
 * Đây là chỗ đi khác kế hoạch, và cố ý. Trần thời gian làm solver **không tất định**:
 * cùng một bài cho hai câu trả lời khác nhau tuỳ máy đang bận hay rảnh, và thế thì
 * chốt canh, golden, và cả lời hứa CHO-08 đều mất nghĩa. Trần đếm được thì cùng vào ra
 * cùng ra — kể cả khi nó dừng giữa chừng.
 *
 * Đếm **hai** thứ, vì một thứ không chặn nổi thời gian: số thế, và số cạnh. Một thế có
 * mười nghìn nước vẫn là *một* thế, nên trần thế thôi thì không nói gì về công phải làm.
 *
 * Đổi lại, trần đếm được **không tự biết** nó là bao nhiêu giây — nên tỉ giá phải đo và
 * ghi ra: ở kho này một cạnh tốn chừng $30\,\mu s$, và mọi con số dưới đây chọn từ tỉ
 * giá ấy chứ không từ cảm giác. Ngày máy nhanh gấp mười thì tỉ giá đổi và các trần nên
 * đo lại — nhưng câu trả lời của solver thì không đổi một byte, và đó là điểm.
 *
 * ## Duyệt lùi, không phải đệ quy có nhớ
 *
 * Đệ quy có nhớ chỉ đúng khi đồ thị thế **không có chu trình**. Bốn họ luật của M78 đều
 * giảm thế nghiêm ngặt, nên đệ quy sẽ chạy đúng — hôm nay. Duyệt lùi thì đúng cả khi có
 * chu trình, và nó nói được câu thứ ba mà đệ quy không nói được: *"thế này không ai
 * thắng được, hai bên đi vòng mãi"*. Câu ấy là chẩn đoán cho một họ luật hỏng, và nó
 * đáng có tên chứ không đáng thành một vòng lặp treo.
 */

/**
 * Trần mặc định cho họ luật **không khai** trần riêng.
 *
 * Con số này đến từ số đo, không từ một con số đẹp: một cạnh tốn khoảng $30\,\mu s$
 * (áp nước + băm thế + tra bảng), và nhánh trung bình của bốn họ luật M78 là chừng mười.
 * $5000$ thế $\times$ $10$ cạnh $\times$ $30\,\mu s \approx 1{,}5$ giây — đủ để một thế
 * thật giải xong, đủ gần để một thế quá lớn từ chối trước khi ai kịp nghĩ là app treo.
 *
 * Bản trước để $200\,000$, chép từ `analyzeGame`. Ở đó một "thế" là vài số nguyên và
 * $200\,000$ thế là chớp mắt; ở đây một thế là **một scene** phải băm, và $200\,000$
 * thế là hàng phút. Cùng một con số, hai đơn vị khác nhau — chép sang là chép cả cái sai.
 */
export const SOLVER_STATES = 5_000;

/**
 * Trần cứng: không họ luật nào nâng quá đây.
 *
 * **Đi khác SRS GM-03, và ghi ra đây chứ không giấu.** SRS viết $10^6$ thế. Số đo nói
 * một thế tốn khoảng $0{,}3$ ms công thật, nên $10^6$ thế là **năm phút** đứng hình —
 * một trần cho phép treo năm phút thì không phải là trần. $100\,000$ giữ đúng tinh thần
 * điều khoản ("đủ nhỏ thì giải, quá lớn thì từ chối có lời") ở một con số mà đơn vị của
 * nó là giây. Sửa lại SRS ở M78.8.
 */
export const SOLVER_STATES_MAX = 100_000;

/**
 * Trần cạnh, suy từ trần thế.
 *
 * Có **hai** trần vì một trần không chặn nổi công phải làm: một thế có nghìn nước vẫn là
 * *một* thế. Đây là hàng rào cho nhánh bệnh hoạn, không phải chỗ điều chỉnh thường ngày
 * — họ luật nhánh rộng thì hạ **trần thế** của mình xuống, vì đó mới là con số tác giả
 * ước được ("bàn $6\times6$ có chừng hai nghìn thế").
 */
export const SOLVER_EDGES_PER_STATE = 32;

export interface SolveResult {
  /** Bên **thắng** nếu cả hai chơi tối ưu; `null` khi không giải được. */
  readonly winner: PlayPlayer | null;
  /** Id các nước đưa đối thủ vào thế thua. Rỗng khi thế đang thua, hoặc không giải được. */
  readonly winningMoves: readonly string[];
  /** Số thế đã duyệt — con số này là **phép đo**, không phải ước lượng. */
  readonly states: number;
  /** `null` khi giải được; ngược lại là **chữ**, để giao diện nói ra thay vì im. */
  readonly refused: string | null;
}

export interface SolveOptions {
  readonly misere?: boolean;
  /** Hạ trần xuống. Nâng lên thì vẫn bị kẹp — thứ treo máy là số thế thật. */
  readonly bound?: number;
}

const REFUSED = (states: number, refused: string): SolveResult => ({
  winner: null,
  winningMoves: [],
  states,
  refused,
});

/**
 * Giải một thế.
 *
 * Đi qua đúng ba thứ **là luật** — `rules.legalMoves`, `applyMoveTo`, và quy ước
 * `terminalWinner` — chứ không dựng một bộ sinh nước thứ hai: solver và ván phải đồng ý
 * về luật, và cách rẻ nhất để chúng đồng ý là chúng chỉ có một đường.
 *
 * Nó **không** đi qua `PlaySession`, và chỗ ấy là cố ý. Phiên chơi mang theo lịch sử,
 * vết chân, undo — thứ giao diện cần và solver không đọc một chữ. Dựng nguyên một phiên
 * cho mỗi *cạnh* đắt gấp bốn lần một phép áp nước trần, và ở bàn $8\times8$ thì $95\%$
 * số cạnh dẫn về thế đã biết, tức là trả giá ấy để vứt đi. Đo được: $40\,\mu s$ một
 * cạnh xuống còn $10\,\mu s$.
 *
 * Cái mất là một bảo đảm miễn phí: trước đây solver và phiên chơi khớp nhau vì chúng là
 * *một mã*. Giờ chúng là hai lối trên cùng ba hàm, nên phép "đi theo nước solver chỉ thì
 * thắng thật, chơi hết ván" trong chốt canh không còn là phép so cái gương với chính nó
 * — nó thành một khẳng định thật, và nó phải ở lại.
 */
export function solveGame(
  scene: Scene,
  toMove: PlayPlayer,
  rules: PlayRules,
  registry: CommandRegistry,
  options: SolveOptions = {},
): SolveResult {
  const misere = options.misere === true;
  const bound = Math.min(
    rules.solverBound ?? SOLVER_STATES,
    options.bound ?? Number.POSITIVE_INFINITY,
    SOLVER_STATES_MAX,
  );

  const shortcut = rules.solve?.(scene, toMove, misere);
  if (shortcut) return shortcut;

  const maxEdges = bound * SOLVER_EDGES_PER_STATE;

  /* ---------- 1. Liệt kê: BFS xuôi, **đo** thay vì ước ---------- */

  const index = new Map<string, number>();
  const scenes: Scene[] = [];
  /** Bên sắp đi ở từng thế. Nó là **một nửa của khoá**, không phải suy được từ scene. */
  const movers: PlayPlayer[] = [];
  const succ: number[][] = [];
  const moveIds: string[][] = [];
  let edges = 0;

  const idOf = (at: Scene, player: PlayPlayer): number => {
    const key = `${positionKey(at)}|${player}`;
    const hit = index.get(key);
    if (hit !== undefined) return hit;
    const next = scenes.length;
    index.set(key, next);
    scenes.push(at);
    movers.push(player);
    succ.push([]);
    moveIds.push([]);
    return next;
  };

  const start = idOf(scene, toMove);
  for (let at = 0; at < scenes.length; at += 1) {
    if (scenes.length > bound) {
      return REFUSED(scenes.length, `không gian thế vượt trần ${bound} thế nên không giải được`);
    }
    const from = scenes[at] as Scene;
    const player = movers[at] as PlayPlayer;
    const next = other(player);
    // Một lần cho mỗi **thế**. Hỏi lại ở mỗi cạnh vào là hỏi cùng một câu hai chục lần.
    for (const move of rules.legalMoves(from, player)) {
      edges += 1;
      if (edges > maxEdges) {
        return REFUSED(scenes.length, `quá ${maxEdges} nước phải duyệt nên không giải được`);
      }
      const applied = applyMoveTo(from, move, rules, registry);
      // Nước phát ra mà không đi được là lỗi của họ luật, không phải của thế. Nói ra
      // chứ không lặng lẽ bỏ qua — bỏ qua thì solver trả lời đúng cho một trò khác.
      if ('refusal' in applied) {
        return REFUSED(
          scenes.length,
          `nước "${move.id}" phát ra nhưng không đi được: ${applied.refusal}`,
        );
      }
      (succ[at] as number[]).push(idOf(applied.scene, next));
      (moveIds[at] as string[]).push(move.id);
    }
  }

  /* ---------- 2. Duyệt lùi từ các thế cụt ---------- */

  const WIN = 1;
  const LOSS = 0;
  const value = new Array<number | undefined>(scenes.length).fill(undefined);
  const remaining = succ.map((s) => s.length);
  const pred: number[][] = scenes.map(() => []);
  succ.forEach((list, from) => {
    for (const to of list) (pred[to] as number[]).push(from);
  });

  const queue: number[] = [];
  scenes.forEach((_, i) => {
    if ((succ[i] as number[]).length === 0) {
      // Hết nước: quy ước normal/misère. **Hỏi `play.ts`** thay vì viết lại `misere ?
      // WIN : LOSS` — hai câu ấy nói cùng một chuyện, và hai chỗ nói cùng một chuyện là
      // hai chỗ để lệch nhau. Chỉ giá trị ở thế cụt lật; luật lan truyền bên dưới y hệt.
      //
      // **Một răng ở đây không cắn, và nói ra chứ không để nó giả vờ.** Thay `movers[i]`
      // bằng bên mở màn thì chốt canh vẫn xanh hết: `terminalWinner(p, misere) === p` ra
      // cùng một số với mọi `p`, vì quy ước hiện tại đối xứng giữa hai bên. Giữ dạng
      // tổng quát vì nó đúng và không tốn gì, nhưng nó là *đúng chưa được kiểm*, không
      // phải *đúng đã chốt* — ngày có một họ luật partizan kết thúc khác nhau cho hai
      // bên thì chỗ này mới có răng, và ngày ấy phải nhớ là nó chưa từng bị bẻ.
      const player = movers[i] as PlayPlayer;
      value[i] = terminalWinner(player, misere) === player ? WIN : LOSS;
      queue.push(i);
    }
  });

  for (let head = 0; head < queue.length; head += 1) {
    const at = queue[head] as number;
    for (const from of pred[at] as number[]) {
      if (value[from] !== undefined) continue;
      if (value[at] === LOSS) {
        // Có một nước đẩy đối thủ vào thế thua ⇒ thế này thắng.
        value[from] = WIN;
        queue.push(from);
      } else {
        remaining[from] = (remaining[from] as number) - 1;
        if (remaining[from] === 0) {
          // Mọi nước đều đẩy đối thủ vào thế thắng ⇒ thế này thua.
          value[from] = LOSS;
          queue.push(from);
        }
      }
    }
  }

  if (value[start] === undefined) {
    return REFUSED(
      scenes.length,
      'thế này không phân định được: luật cho phép hai bên đi vòng mãi mà không ai cạn nước',
    );
  }

  const winner = value[start] === WIN ? toMove : other(toMove);
  const winningMoves =
    value[start] === WIN
      ? (succ[start] as number[])
          .map((to, i) => (value[to] === LOSS ? ((moveIds[start] as string[])[i] as string) : null))
          .filter((id): id is string => id !== null)
      : [];

  return { winner, winningMoves, states: scenes.length, refused: null };
}
