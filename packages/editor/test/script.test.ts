import { describe, expect, it } from 'vitest';
import { DslError, DEFAULT_BUDGET, type Budget } from '@combviz/dsl';
import { boardCommands, boardEnvironment, boardPlayRules } from '@combviz/engine-board';
import type { Scene } from '@combviz/schema';
import { createPlay, playMove, parseMoves, runMoves, scriptPlayRules, MOVES_LIMIT } from '../src/index.js';

/**
 * Ngữ pháp `moves { … }` (DSL-03, M78.6).
 *
 * Chốt canh nặng nhất ở mục "hai đường, một trò": cùng một luật Chomp viết hai lần —
 * một lần bằng TypeScript trong engine, một lần bằng script của tác giả — phải cho ra
 * **cùng một trò chơi**. Đó là bài kiểm mạnh nhất có được mà không phải viết lại nội
 * dung đã ship.
 */

const board = (rows: number, cols: number, holes: [number, number][] = []): Scene =>
  ({
    engine: 'board',
    config: { rows, cols, ...(holes.length > 0 ? { holes } : {}) },
    elements: [],
  }) as never;

const CHOMP = 'moves { for c in cells where !hole(c) : move board/chomp-bite(at: c) }';

const run = (src: string, scene: Scene, budget: Budget = DEFAULT_BUDGET) =>
  runMoves(parseMoves(src), scene, 'left', boardEnvironment(scene), boardCommands, budget);

describe('cái khung đọc được, và đọc **sai** thì nói ở đúng chỗ', () => {
  it('phân tích ra đúng bốn phần', () => {
    const script = parseMoves(CHOMP);
    expect(script.binder).toBe('c');
    expect(script.command).toBe('board/chomp-bite');
    expect(script.args.map((a) => a.name)).toEqual(['at']);
    expect(script.where).not.toBeNull();
  });

  it('`where` bỏ được — nó là bộ lọc, không phải phần bắt buộc', () => {
    const script = parseMoves('moves { for c in cells : move board/chomp-bite(at: c) }');
    expect(script.where).toBeNull();
  });

  it('dấu phẩy **trong** biểu thức không xé đôi tham số', () => {
    // `min(a, b)` có dấu phẩy nằm trong ngoặc. Cắt theo dấu phẩy đầu tiên là cách hỏng
    // kinh điển của một máy quét đếm thiếu ngoặc, và nó hỏng lặng lẽ: script vẫn parse,
    // chỉ là ra một cây khác.
    const script = parseMoves(
      'moves { for c in cells : move board/chomp-bite(at: c, n: min(rows, cols)) }',
    );
    expect(script.args.map((a) => a.name)).toEqual(['at', 'n']);
  });

  it('vị trí lỗi trỏ vào **nguồn**, không vào mảnh mà tác giả không biết là có', () => {
    // Biểu thức con được cắt ra rồi giao cho parser của DSL, nên `pos` từ đó là toạ độ
    // *trong mảnh*. Không dời lại thì con trỏ lỗi chỉ vào ký tự thứ ba của một chuỗi mà
    // tác giả chưa từng nhìn thấy.
    const src = 'moves { for c in cells where c.row === 1 : move board/chomp-bite(at: c) }';
    let caught: DslError | null = null;
    try {
      parseMoves(src);
    } catch (error) {
      caught = error as DslError;
    }
    expect(caught).toBeInstanceOf(DslError);
    // `===` bắt đầu ở chỗ nào trong cả nguồn thì lỗi phải nằm quanh đó.
    expect(caught!.pos).toBeGreaterThan(src.indexOf('c.row'));
    expect(caught!.pos).toBeLessThan(src.indexOf(': move'));
  });

  it('khung sai thì từ chối, không đoán', () => {
    for (const bad of [
      'for c in cells : move board/chomp-bite(at: c)', // thiếu `moves {`
      'moves { for c cells : move board/chomp-bite(at: c) }', // thiếu `in`
      'moves { for c in cells : board/chomp-bite(at: c) }', // thiếu `move`
      'moves { for c in cells : move (at: c) }', // thiếu tên lệnh
      'moves { for c in cells : move board/chomp-bite(at: c) } thừa', // rác đuôi
      'moves { for c in cells : move board/chomp-bite(at: c, at: c) }', // trùng tham số
    ]) {
      expect(() => parseMoves(bad), bad).toThrow(DslError);
    }
  });

  it('ngôn ngữ **không có** `fetch` hay `document` — và chặn ở lúc parse', () => {
    // Đây là nửa NFR-S2 mà Worker *không* làm: `call.callee` phải là một builtin có tên,
    // nên không có cửa nào gọi ra ngoài. Chốt canh này ghi công cho **ngữ pháp**, không
    // cho hộp cách ly — ghi nhầm chỗ thì ngày ai đó nới ngữ pháp sẽ tưởng Worker đỡ.
    const script = parseMoves('moves { for c in cells where fetch(c) : move board/chomp-bite(at: c) }');
    const out = runMoves(script, board(2, 2), 'left', boardEnvironment(board(2, 2)), boardCommands, DEFAULT_BUDGET);
    expect(out.moves).toEqual([]);
    expect(out.refusal).toContain('fetch');
  });
});

describe('hai đường, **một trò**', () => {
  const rules = boardPlayRules('chomp')!;

  it('cùng tập nước với họ luật TypeScript, trên mọi bàn thử', () => {
    // Id thì khác nhau — một bên `bite-1-2`, một bên `board/chomp-bite:at=cell-1-2` — và
    // đó không phải bất đồng: id là **tay cầm nội bộ**, còn thứ định nghĩa trò chơi là
    // lệnh nào chạy với tham số nào. So đúng chỗ ấy.
    for (const [rows, cols, holes] of [
      [3, 3, []],
      [2, 4, []],
      [1, 1, []],
      [3, 3, [[1, 1], [1, 2], [2, 1], [2, 2]]],
    ] as [number, number, [number, number][]][]) {
      const scene = board(rows, cols, holes);
      const mine = run(CHOMP, scene).moves;
      const theirs = rules.legalMoves(scene, 'left');
      const key = (m: { command?: { type: string; params: unknown }; label: string; targets: readonly string[] }) =>
        `${m.command?.type}|${JSON.stringify(m.command?.params)}|${m.label}|${m.targets.join(',')}`;
      expect(mine.map(key), `${rows}×${cols}`).toEqual(theirs.map(key));
    }
  });

  it('chơi hết một ván bằng script ⇒ **cùng người thắng** với ván chơi bằng engine', () => {
    // Cùng tập nước ở một thế chưa đủ: nó phải đúng ở *mọi* thế mà ván đi qua. Chơi thật
    // là cách rẻ nhất để hỏi câu ấy.
    const scripted = scriptPlayRules(parseMoves(CHOMP), boardEnvironment, boardCommands, {
      budget: DEFAULT_BUDGET,
    });
    const start = board(2, 3);
    const play = (rules: Parameters<typeof createPlay>[1], pick: (ids: readonly string[]) => string) => {
      let s = createPlay(start, rules, { misere: true });
      while (!s.over) {
        s = playMove(s, pick(s.moves.map((m) => m.id)), rules, boardCommands).session;
      }
      return s.winner;
    };
    // Cùng chiến lược "ăn ô cuối danh sách" trên hai bộ luật: hai bên phát ra nước theo
    // cùng thứ tự thì cùng chiến lược cho cùng ván.
    expect(play(scripted, (ids) => ids.at(-1) as string)).toBe(
      play(rules, (ids) => ids.at(-1) as string),
    );
  });

  it('nhãn nước lấy từ **`CommandDef.label`**, không phải một bản sao', () => {
    const first = run(CHOMP, board(2, 2)).moves[0];
    expect(first?.label).toBe(boardCommands['board/chomp-bite']!.label({ at: 'cell-0-0' }, board(2, 2)));
  });
});

describe('`targets` và `id` suy ra, tác giả không gõ', () => {
  it('`targets` là các element **trong tham số**', () => {
    const out = run(CHOMP, board(2, 2)).moves;
    expect(out.map((m) => m.targets)).toEqual([
      ['cell-0-0'],
      ['cell-0-1'],
      ['cell-1-0'],
      ['cell-1-1'],
    ]);
  });

  it('id chuẩn hoá theo **tên tham số đã sắp**, nên hai cách viết cho một id', () => {
    // Nếu id theo thứ tự tác giả gõ thì đổi chỗ hai tham số là đổi id của cùng một nước,
    // và một ván ghi ra draft hôm nay replay không được ngày mai.
    const a = run('moves { for c in cells : move board/chomp-bite(at: c, n: rows) }', board(1, 1));
    const b = run('moves { for c in cells : move board/chomp-bite(n: rows, at: c) }', board(1, 1));
    expect(a.moves[0]?.id).toBe(b.moves[0]?.id);
    expect(a.moves[0]?.id).toBe('board/chomp-bite:at=cell-0-0,n=1');
  });

  it('hai phần tử cho **cùng một nước** thì gộp, không phát hai lần', () => {
    // `playMove` tra theo id; hai nước cùng id nghĩa là cái thứ hai không bao giờ chọn
    // được, và bảng nước đi bày ra một dòng chết.
    const out = run('moves { for c in cells : move board/chomp-bite(at: cells) }', board(2, 2));
    // `cells` là tập hợp, không phải element ⇒ từ chối chứ không im.
    expect(out.refusal).toContain('tập hợp');

    const dup = run('moves { for c in cells : move board/chomp-bite(n: rows) }', board(2, 2));
    expect(dup.moves).toHaveLength(1);
  });
});

describe('ngân sách là **một** cho cả lượt, không phải một cho mỗi biểu thức', () => {
  it('vị ngữ chạy nhiều lần vẫn chia chung bộ đếm bước', () => {
    // Đây là lý do tệp này gọi `evalExpr` với `EvalContext` có sẵn thay vì gọi
    // `evaluate` mỗi lần: `evaluate` dựng ngân sách mới mỗi lượt, nên "trần 100ms" hoá
    // thành "100ms **mỗi ô**", và trên bàn 40×40 thì đó là một phút.
    const tiny: Budget = { maxSteps: 30, maxMs: Number.POSITIVE_INFINITY };
    const out = run(CHOMP, board(6, 6), tiny);
    expect(out.moves).toEqual([]);
    expect(out.refusal).toContain('30 bước');
  });

  it('bàn nhỏ vẫn lọt qua cùng ngân sách ấy — trần chặn cái to, không chặn tất', () => {
    const tiny: Budget = { maxSteps: 30, maxMs: Number.POSITIVE_INFINITY };
    expect(run(CHOMP, board(1, 2), tiny).refusal).toBeNull();
  });

  it(`trần ${MOVES_LIMIT} nước: thay cho trần 64MB mà trình duyệt không cho đo`, () => {
    const many: Scene = {
      engine: 'board',
      config: { rows: 60, cols: 60 },
      elements: [],
    } as never;
    const out = run(CHOMP, many);
    expect(out.moves).toEqual([]);
    expect(out.refusal).toContain(`hơn ${MOVES_LIMIT} nước`);
  });
});

describe('script hỏng thì **nói**, không giả vờ hết nước', () => {
  it('lệnh không có thật ⇒ từ chối có tên lệnh', () => {
    const out = run('moves { for c in cells : move board/khong-co(at: c) }', board(2, 2));
    expect(out.refusal).toContain('board/khong-co');
  });

  it('`for … in` một thứ không phải tập hợp ⇒ nói ra', () => {
    expect(run('moves { for c in rows : move board/chomp-bite(at: c) }', board(2, 2)).refusal).toContain(
      'cần một tập hợp',
    );
  });

  it('`where` cho ra số thay vì đúng/sai ⇒ nói ra', () => {
    expect(
      run('moves { for c in cells where c.row : move board/chomp-bite(at: c) }', board(2, 2)).refusal,
    ).toContain('đúng/sai');
  });

  it('`PlayRules` bọc ra ngoài **chuyển tiếp** lời từ chối, không nuốt', () => {
    // Nuốt thì một script gãy hiện ra y hệt một thế đã hết nước: người học thấy "ván kết
    // thúc" và không ai nói cho họ biết là luật hỏng.
    const said: string[] = [];
    const rules = scriptPlayRules(
      parseMoves('moves { for c in rows : move board/chomp-bite(at: c) }'),
      boardEnvironment,
      boardCommands,
      { budget: DEFAULT_BUDGET, onRefusal: (m) => said.push(m) },
    );
    expect(rules.legalMoves(board(2, 2), 'left')).toEqual([]);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('cần một tập hợp');
  });
});

describe('`player` bind được — nếu không thì partizan viết bằng script là bất khả', () => {
  it('hai bên cho hai tập nước khác nhau', () => {
    // Chomp impartial nên chính nó không cần chỗ này. Nhưng nếu `player` không tới được
    // vị ngữ thì mọi game partizan buộc phải viết bằng TypeScript, và cửa thoát cho tác
    // giả chỉ mở một nửa — mà nửa ấy không ai đo được cho tới lúc có người cần.
    const src = 'moves { for c in cells where (player == "left") == (c.col == 0) : move board/chomp-bite(at: c) }';
    const script = parseMoves(src);
    const scene = board(2, 2);
    const left = runMoves(script, scene, 'left', boardEnvironment(scene), boardCommands, DEFAULT_BUDGET);
    const right = runMoves(script, scene, 'right', boardEnvironment(scene), boardCommands, DEFAULT_BUDGET);

    expect(left.moves.map((m) => m.targets[0])).toEqual(['cell-0-0', 'cell-1-0']);
    expect(right.moves.map((m) => m.targets[0])).toEqual(['cell-0-1', 'cell-1-1']);
  });
});

describe('tất định', () => {
  it('cùng thế ⇒ cùng danh sách nước, tới từng byte, hai lần chạy', () => {
    const a = run(CHOMP, board(3, 4));
    const b = run(CHOMP, board(3, 4));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
