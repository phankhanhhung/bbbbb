import type { Scene } from '@combviz/schema';
import {
  DslError,
  evalExpr,
  isElement,
  isList,
  parse,
  typeName,
  type Budget,
  type DslEnvironment,
  type EvalContext,
  type Expr,
  type Value,
} from '@combviz/dsl';
import type { CommandRegistry, Move, PlayPlayer } from './command.js';
import type { PlayRules } from './play.js';

/**
 * **Luật chơi do tác giả viết** — phép duyệt `moves { … }` (DSL-03, GM-01, M78.6).
 *
 * Bốn họ luật dựng sẵn của M78 (bốc đống, Chomp, geography, Hackenbush) đều nằm trong
 * engine, bằng TypeScript. Chỗ này là **đường khác**: một game thứ năm mà tác giả nghĩ
 * ra không phải đợi ai sửa mã. Đó là NFR-S1 đọc cho lớp ván — nội dung là dữ liệu, không
 * phải code — và nếu không có đường này thì "thêm một game" luôn có nghĩa là "phát hành
 * một phiên bản".
 *
 * ## Vì sao nó **không** nằm trong `@combviz/dsl`
 *
 * DSL-03 viết thẳng: *"Tách hẳn khỏi DSL thuần, không trộn."* Nhét một node `moves` vào
 * `ast.ts` là trộn — kể từ giây ấy, invariant strip, guard của luật đại số, và mọi chỗ
 * gọi `compile()` đều *có thể* sinh ra nước đi, và R-2 mất một hàng rào mà không ai
 * quyết định gỡ. Ở đây thì ngôn ngữ biểu thức không đổi một dòng: vị ngữ `where` và giá
 * trị tham số vẫn là biểu thức DSL thật, chạy qua đúng `evalExpr` với môi trường do
 * engine cấp. Cái mới chỉ là **cái khung** bao quanh chúng, và cái khung ấy sống ở đây.
 *
 * ## Một dạng, và chỉ một
 *
 * ```
 * moves { for c in cells where !covered(c) : move board/chomp-bite(at: c) }
 * ```
 *
 * Không vòng lặp lồng, không `let`, không nhánh, không đệ quy. Bốn chỗ mở rộng đều có
 * tên — `for`, `where`, `move`, tham số — nên thêm dạng thứ hai là một quyết định nhìn
 * thấy được chứ không phải một tiện ích lỡ tay thêm vào. Đó là đối sách R-2 viết thành
 * cú pháp, cùng cách `ast.ts` đã làm cho DSL thuần.
 *
 * ## Ba trường của `Move` **suy ra**, tác giả không gõ
 *
 * | trường | suy từ |
 * |---|---|
 * | `id` | tên lệnh + tham số đã chuẩn hoá |
 * | `label` | `CommandDef.label(params, scene)` — đã có sẵn cho cả 43 lệnh |
 * | `targets` | các element xuất hiện trong tham số |
 *
 * Cho gõ `id` nghĩa là hai nước trùng id là chuyện xảy ra được, mà `playMove` chọn nước
 * *theo id*; cho gõ `label` nghĩa là nhãn một nước có hai nguồn, tức hai chỗ để lệch
 * nhau. Suy ra thì cả ba luôn khớp với lệnh thật, và tác giả viết ít hơn.
 */

/**
 * Trần số nước một thế được phát ra.
 *
 * Đây là **thứ ép được thay cho trần 64MB** của NFR-S2. Trình duyệt không cho một Worker
 * đọc heap của chính nó theo chuẩn nào, nên "64MB" không có cách nào thành một phép
 * kiểm; thứ đo được là *kích thước kết quả*, và một danh sách nước dài hơn đây thì đằng
 * nào cũng không bày ra màn hình được. Ghi vào sổ rủi ro R-2 chứ không lặng lẽ bỏ.
 */
export const MOVES_LIMIT = 2_000;

/** Một phép duyệt đã phân tích. Parse một lần lúc mở bài, chạy lại mỗi thế. */
export interface MovesScript {
  readonly source: string;
  /** Tên biến chạy, ví dụ `c`. */
  readonly binder: string;
  /** Biểu thức cho ra tập để duyệt, ví dụ `cells`. */
  readonly over: Expr;
  /** Vị ngữ lọc; `null` khi tác giả không viết `where`. */
  readonly where: Expr | null;
  /** Tên lệnh của engine chủ, ví dụ `board/chomp-bite`. */
  readonly command: string;
  /** Tham số lệnh, **theo thứ tự tác giả viết** — id thì sắp lại, hiển thị thì không. */
  readonly args: readonly { readonly name: string; readonly value: Expr }[];
}

/* ---------------------------------------------------------------- phân tích */

/**
 * Máy quét cho **cái khung**, không cho biểu thức.
 *
 * Tokenizer của DSL không biết `{`, `}`, `:` hay `board/chomp-bite` — và dạy nó biết
 * chính là chỗ trộn hai ngôn ngữ mà DSL-03 cấm. Nên khung thì cắt bằng tay ở đây, còn
 * mỗi mảnh biểu thức thì giao nguyên cho `parse()` của DSL. Lỗi từ mảnh được dời vị trí
 * về toạ độ của cả nguồn, để con trỏ lỗi chỉ đúng chỗ tác giả gõ chứ không chỉ vào ký tự
 * thứ ba của một mảnh mà họ không biết là có tồn tại.
 */
class Frame {
  private at = 0;
  constructor(private readonly src: string) {}

  get pos(): number {
    return this.at;
  }

  private skip(): void {
    while (this.at < this.src.length && /\s/.test(this.src[this.at] as string)) this.at += 1;
  }

  /** Ăn một từ khoá; ném nếu không thấy. */
  word(expected: string): void {
    this.skip();
    if (!this.src.startsWith(expected, this.at) || /[A-Za-z0-9_]/.test(this.src[this.at + expected.length] ?? '')) {
      throw new DslError(`Chỗ này phải là \`${expected}\``, this.at);
    }
    this.at += expected.length;
  }

  /** Ăn một ký tự khung. */
  char(expected: string): void {
    this.skip();
    if (this.src[this.at] !== expected) {
      throw new DslError(`Chỗ này phải là \`${expected}\``, this.at);
    }
    this.at += 1;
  }

  /** Đọc một tên (biến, tên tham số). */
  name(what: string): string {
    this.skip();
    const start = this.at;
    while (this.at < this.src.length && /[A-Za-z0-9_]/.test(this.src[this.at] as string)) {
      this.at += 1;
    }
    if (this.at === start) throw new DslError(`Thiếu ${what}`, start);
    return this.src.slice(start, this.at);
  }

  /** Đọc tên lệnh: có `/` và `-`, nên nó không phải một tên DSL. */
  commandType(): string {
    this.skip();
    const start = this.at;
    while (this.at < this.src.length && /[A-Za-z0-9_/-]/.test(this.src[this.at] as string)) {
      this.at += 1;
    }
    if (this.at === start) throw new DslError('Thiếu tên lệnh sau `move`', start);
    return this.src.slice(start, this.at);
  }

  /**
   * Cắt một biểu thức tới dấu kết ở **độ sâu ngoặc 0**, rồi giao cho `parse()`.
   *
   * Đếm ngoặc và bỏ qua chuỗi là bắt buộc: `move take(n: min(a, b))` có dấu phẩy nằm
   * trong `min(...)`, và cắt theo dấu phẩy đầu tiên sẽ xé đôi một lời gọi hợp lệ.
   */
  expression(stops: readonly string[]): { expr: Expr; stop: string } {
    this.skip();
    const start = this.at;
    let depth = 0;
    let quoted = false;

    while (this.at < this.src.length) {
      const ch = this.src[this.at] as string;
      if (quoted) {
        if (ch === '\\') this.at += 1;
        else if (ch === '"') quoted = false;
        this.at += 1;
        continue;
      }
      if (ch === '"') {
        quoted = true;
        this.at += 1;
        continue;
      }
      // Soát dấu kết **trước** khi đếm ngoặc: `)` vừa là dấu kết của một tham số vừa là
      // dấu đóng của một lời gọi lồng bên trong, và thứ phân biệt chúng là độ sâu chứ
      // không phải ký tự. Đếm trước rồi mới soát thì `min(a, b))` không bao giờ kết
      // thúc được.
      if (depth === 0) {
        const hit = stops.find((s) =>
          /^[a-z]+$/.test(s)
            ? this.src.startsWith(s, this.at) &&
              !/[A-Za-z0-9_]/.test(this.src[this.at - 1] ?? ' ') &&
              !/[A-Za-z0-9_]/.test(this.src[this.at + s.length] ?? ' ')
            : this.src.startsWith(s, this.at),
        );
        if (hit !== undefined) {
          const text = this.src.slice(start, this.at);
          this.at += hit.length;
          return { expr: sub(text, start), stop: hit };
        }
      }

      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      this.at += 1;
    }
    throw new DslError(`Thiếu \`${stops[0] as string}\` để đóng biểu thức`, start);
  }

  end(): void {
    this.skip();
    if (this.at !== this.src.length) {
      throw new DslError('Thừa ký tự sau `}`', this.at);
    }
  }
}

/** Parse một mảnh, và **dời** vị trí lỗi về toạ độ của cả nguồn. */
function sub(text: string, offset: number): Expr {
  if (text.trim() === '') throw new DslError('Biểu thức rỗng', offset);
  try {
    return parse(text);
  } catch (error) {
    if (error instanceof DslError) throw new DslError(error.message, offset + error.pos);
    throw error;
  }
}

export function parseMoves(source: string): MovesScript {
  const frame = new Frame(source);
  frame.word('moves');
  frame.char('{');
  frame.word('for');
  const binder = frame.name('tên biến chạy sau `for`');
  frame.word('in');

  const first = frame.expression(['where', ':']);
  const over = first.expr;
  let where: Expr | null = null;
  if (first.stop === 'where') {
    where = frame.expression([':']).expr;
  }

  frame.word('move');
  const command = frame.commandType();
  frame.char('(');

  const args: { name: string; value: Expr }[] = [];
  // Lệnh không tham số là chuyện có thật, nên `()` rỗng phải đi lọt chứ không phải báo
  // "thiếu tên tham số" ở một chỗ tác giả cố ý để trống.
  if (!/^\s*\)/.test(source.slice(frame.pos))) {
    for (;;) {
      const name = frame.name('tên tham số');
      frame.char(':');
      const arg = frame.expression([',', ')']);
      if (args.some((a) => a.name === name)) {
        throw new DslError(`Tham số \`${name}\` khai hai lần`, frame.pos);
      }
      args.push({ name, value: arg.expr });
      if (arg.stop === ')') break;
    }
  } else {
    frame.char(')');
  }

  frame.char('}');
  frame.end();

  return { source, binder, over, where, command, args };
}

/* ------------------------------------------------------------------- chạy */

/** Kết quả một lượt duyệt: nước đi, hoặc **lời** nói vì sao không có. */
export interface MovesOutcome {
  readonly moves: readonly Move[];
  readonly refusal: string | null;
}

/**
 * Tham số lệnh chỉ nhận **giá trị vô hướng**.
 *
 * Element hoá thành `id` của nó, vì lệnh nhận id chứ không nhận element — và vì
 * `Command.params` phải tuần tự hoá được: nó đi vào lịch sử undo, vào draft step, vào
 * golden. Một tập hợp hay một hàm lọt vào đây thì `id` của nước không còn viết ra được
 * và replay hỏng ở một chỗ cách xa nguyên nhân.
 */
function toParam(value: Value, name: string): number | boolean | string {
  if (isElement(value)) return value.id;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  throw new DslError(`Tham số \`${name}\` là ${typeName(value)}, mà lệnh chỉ nhận số, chuỗi, đúng/sai, hoặc element`, 0);
}

/** Id chuẩn hoá: **sắp theo tên tham số**, để hai cách viết cùng một nước cho cùng một id. */
function moveId(command: string, params: Readonly<Record<string, number | boolean | string>>): string {
  const parts = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`);
  return parts.length === 0 ? command : `${command}:${parts.join(',')}`;
}

/**
 * Chạy phép duyệt trên một thế.
 *
 * **Một** ngân sách cho cả lượt, không phải một ngân sách cho mỗi biểu thức con: vị ngữ
 * chạy một lần cho mỗi phần tử, và "mỗi lần 50ms" thì trần 100ms của NFR-S2 không nói
 * lên điều gì. Nhờ `evalExpr` nhận `EvalContext` có sẵn, cả lượt dùng chung một bộ đếm
 * bước và một hạn giờ.
 */
export function runMoves(
  script: MovesScript,
  scene: Scene,
  player: PlayPlayer,
  env: DslEnvironment,
  registry: CommandRegistry,
  budget: Budget,
): MovesOutcome {
  const def = Object.hasOwn(registry, script.command) ? registry[script.command] : undefined;
  if (!def) {
    return { moves: [], refusal: `engine không có lệnh "${script.command}"` };
  }

  // `player` bind sẵn để một game partizan viết được bằng script: `where c.color == player`.
  // Không có nó thì hai bên buộc phải cùng tập nước, và `legalMoves(scene, player)` ở
  // đường script chỉ là trang trí.
  const ctx: EvalContext = {
    env: { ...env, bindings: { ...env.bindings, player } },
    budget,
    steps: 0,
    deadline: (typeof performance === 'object' ? performance.now() : Date.now()) + budget.maxMs,
    scope: new Map(),
  };

  try {
    const source = evalExpr(script.over, ctx);
    if (!isList(source)) {
      return {
        moves: [],
        refusal: `\`for ${script.binder} in …\` cần một tập hợp, mà chỗ ấy là ${typeName(source)}`,
      };
    }

    const moves: Move[] = [];
    const seen = new Set<string>();

    for (const item of source) {
      ctx.scope = new Map([[script.binder, item]]);

      if (script.where !== null) {
        const keep = evalExpr(script.where, ctx);
        if (typeof keep !== 'boolean') {
          return { moves: [], refusal: `\`where\` phải cho đúng/sai, mà nó cho ${typeName(keep)}` };
        }
        if (!keep) continue;
      }

      const params: Record<string, number | boolean | string> = {};
      const targets: string[] = [];
      for (const arg of script.args) {
        const value = evalExpr(arg.value, ctx);
        // Element trong tham số **là** câu trả lời cho "chạm đâu thì được nước này".
        if (isElement(value) && !targets.includes(value.id)) targets.push(value.id);
        params[arg.name] = toParam(value, arg.name);
      }

      const id = moveId(script.command, params);
      // Hai phần tử khác nhau cho cùng một nước là chuyện xảy ra được (hai ô cùng ăn về
      // một thế). Giữ cái đầu: danh sách nước là một **tập**, và `playMove` tra theo id.
      if (seen.has(id)) continue;
      seen.add(id);

      if (moves.length >= MOVES_LIMIT) {
        return {
          moves: [],
          refusal: `thế này phát ra hơn ${MOVES_LIMIT} nước — nhiều hơn số nước bày ra được`,
        };
      }

      moves.push({ id, label: def.label(params, scene), command: { type: script.command, params }, targets });
    }

    return { moves, refusal: null };
  } catch (error) {
    if (error instanceof DslError) return { moves: [], refusal: error.message };
    throw error;
  }
}

/**
 * Bọc một phép duyệt thành `PlayRules`.
 *
 * `environment` là hàm vì môi trường phụ thuộc **thế**: `cells` của một bàn đã bị ăn
 * khác `cells` của bàn đầy. Engine chủ cấp nó (`boardEnvironment`, `graphEnvironment`),
 * và đó là chỗ script mượn được builtin của engine mà không phải biết engine nào.
 *
 * Lời từ chối đi đâu? Vào `onRefusal`. Nuốt nó thì một script hỏng hiện ra y hệt một thế
 * đã hết nước — người học thấy "ván kết thúc" và không ai nói cho họ biết là luật gãy.
 */
export function scriptPlayRules(
  script: MovesScript,
  environment: (scene: Scene) => DslEnvironment,
  registry: CommandRegistry,
  options: { budget: Budget; solverBound?: number; onRefusal?: (message: string) => void } ,
): PlayRules {
  return {
    ...(options.solverBound === undefined ? {} : { solverBound: options.solverBound }),
    legalMoves(scene: Scene, player: PlayPlayer): readonly Move[] {
      const out = runMoves(script, scene, player, environment(scene), registry, options.budget);
      if (out.refusal !== null) options.onRefusal?.(out.refusal);
      return out.moves;
    },
  };
}
