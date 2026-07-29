import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compile, tryEvaluate } from '@combviz/dsl';
import type { Problem, Scene } from '@combviz/schema';
import { boardEnvironment, piecesAttack } from '../src/dsl.js';
import { resolveBoardValidator } from '../src/validators.js';

const problem = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../content/problems/mutilated-chessboard.json', import.meta.url),
    ),
    'utf8',
  ),
) as Problem;

const steps = problem.solutions[0]!.steps;
const evalOn = (source: string, scene: Scene): unknown =>
  compile(source).run(boardEnvironment(scene));

describe('invariant của bài mẫu thật sự bất biến', () => {
  const invariant = problem.invariants![0]!.expr;

  it('sau khi tô màu, giá trị là −2 và không đổi qua bước đặt quân', () => {
    // Đây là toàn bộ lời giải, viết bằng DSL: hiệu số ô đen chưa phủ và ô trắng
    // chưa phủ đứng yên khi ta đặt domino, mà nó bằng −2 ≠ 0 — nên không thể phủ
    // kín. Nếu con số này không đứng yên, hoặc engine sai, hoặc bài sai.
    const afterColoring = evalOn(invariant, steps[1]!.scene!);
    const afterTiles = evalOn(invariant, steps[2]!.scene!);

    expect(afterColoring).toBe(-2);
    expect(afterTiles).toBe(-2);
  });

  it('mỗi domino phủ đúng một ô mỗi màu — lý do nó bất biến', () => {
    const scene = steps[2]!.scene!;

    expect(evalOn('count(cells, c => c.color_class == 1 && covered(c))', scene)).toBe(3);
    expect(evalOn('count(cells, c => c.color_class == 2 && covered(c))', scene)).toBe(3);
  });

  it('trước khi tô màu, invariant chưa có nghĩa', () => {
    // Không có preset thì mọi ô mang color_class 0, nên hiệu bằng 0. Đó là câu
    // trả lời đúng: bất biến chỉ tồn tại sau khi lập luận đưa màu vào.
    expect(evalOn(invariant, steps[0]!.scene!)).toBe(0);
  });
});

describe('trạng thái dẫn xuất', () => {
  const scene = steps[1]!.scene!;

  it('ô khuyết không mang color_class của preset', () => {
    expect(evalOn('count(cells, c => hole(c))', scene)).toBe(2);
    expect(evalOn('count(cells, c => hole(c) && c.color_class != 0)', scene)).toBe(0);
  });

  it('tổng số ô đúng, kể cả ô khuyết', () => {
    expect(evalOn('count(cells)', scene)).toBe(64);
    expect(evalOn('rows * cols', scene)).toBe(64);
  });

  it('covered() suy ra từ tile, không cần khai tay', () => {
    expect(evalOn('count(cells, c => covered(c))', steps[1]!.scene!)).toBe(0);
    expect(evalOn('count(cells, c => covered(c))', steps[2]!.scene!)).toBe(6);
  });

  it('adjacent() đúng với ô kề cạnh, sai với ô kề chéo', () => {
    expect(
      evalOn('count(cells, c => adjacent(c, c))', scene),
    ).toBe(0);
    expect(
      evalOn(
        'count(cells, a => count(cells, b => adjacent(a, b)) == 2)',
        scene,
      ),
    ).toBe(4); // đúng bốn góc bàn có 2 ô kề
  });
});

describe('validator built-in (BD-04)', () => {
  const scene = steps[2]!.scene!;

  it('bài mẫu không có quân nào chồng nhau', () => {
    expect(resolveBoardValidator('tiles-no-overlap')!.check(scene).ok).toBe(true);
    expect(resolveBoardValidator('tiles-in-bounds')!.check(scene).ok).toBe(true);
  });

  it('chỉ ra đúng cặp quân chồng nhau', () => {
    const overlapping: Scene = {
      ...scene,
      elements: [
        { id: 'a', type: 'tile', shape: 'domino', pos: [0, 1], rot: 0 },
        { id: 'b', type: 'tile', shape: 'domino', pos: [0, 2], rot: 0 },
        { id: 'c', type: 'tile', shape: 'domino', pos: [4, 4], rot: 0 },
      ],
    };

    const outcome = resolveBoardValidator('tiles-no-overlap')!.check(overlapping);

    expect(outcome.ok).toBe(false);
    // Chỉ ra *phần tử nào* mới là giá trị: "cách phủ này sai" thì vô dụng.
    expect([...outcome.violations].sort()).toEqual(['a', 'b']);
  });

  it('coi việc đè lên ô khuyết là tràn biên', () => {
    const onHole: Scene = {
      ...scene,
      elements: [{ id: 'a', type: 'tile', shape: 'domino', pos: [0, 0], rot: 0 }],
    };

    expect(resolveBoardValidator('tiles-in-bounds')!.check(onHole).ok).toBe(false);
  });

  it('full-cover đếm đúng số ô còn thiếu', () => {
    const outcome = resolveBoardValidator('full-cover')!.check(scene);

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('56'); // 62 ô hợp lệ − 6 ô đã phủ
  });

  it('validator có tham số tra được', () => {
    expect(resolveBoardValidator('pieces-per-row:2')?.id).toBe('pieces-per-row:2');
    expect(resolveBoardValidator('pieces-per-row')).toBeNull();
    expect(resolveBoardValidator('khong-co-cai-nay')).toBeNull();
  });
});

describe('luật ăn quân dùng chung một cách hiểu', () => {
  const board = (elements: Scene['elements']): Scene => ({
    engine: 'board',
    config: { rows: 8, cols: 8 },
    elements,
  });

  it('mã ăn theo hình chữ L', () => {
    const scene = board([
      { id: 'n1', type: 'piece', kind: 'knight', pos: [0, 0] },
      { id: 'p1', type: 'piece', kind: 'knight', pos: [1, 2] },
    ]);

    expect(evalOn('exists(pieces, a => exists(pieces, b => attacks(a, b)))', scene)).toBe(
      true,
    );
    expect(resolveBoardValidator('no-attacks')!.check(scene).ok).toBe(false);
  });

  it('xe bị chặn tầm bởi quân đứng giữa', () => {
    const clear = board([
      { id: 'r1', type: 'piece', kind: 'rook', pos: [0, 0] },
      { id: 'r2', type: 'piece', kind: 'rook', pos: [0, 7] },
    ]);
    const blocked = board([
      { id: 'r1', type: 'piece', kind: 'rook', pos: [0, 0] },
      { id: 'k1', type: 'piece', kind: 'knight', pos: [0, 3] },
      { id: 'r2', type: 'piece', kind: 'rook', pos: [0, 7] },
    ]);

    expect(piecesAttack(clear, 'r1', 'r2')).toBe(true);
    expect(piecesAttack(blocked, 'r1', 'r2')).toBe(false);

    // Nhưng xe vẫn ăn được chính con mã đang chặn nó — nên `no-attacks` vẫn đỏ.
    // Chặn tầm nói về *một cặp*, không nói về cả thế cờ.
    expect(piecesAttack(blocked, 'r1', 'k1')).toBe(true);
    expect(resolveBoardValidator('no-attacks')!.check(blocked).ok).toBe(false);
  });

  it('quân không đi qua chính mình', () => {
    const scene = board([{ id: 'q1', type: 'piece', kind: 'queen', pos: [3, 3] }]);

    expect(piecesAttack(scene, 'q1', 'q1')).toBe(false);
    expect(resolveBoardValidator('no-attacks')!.check(scene).ok).toBe(true);
  });

  it('validator và builtin attacks() cho cùng kết luận', () => {
    const scene = board([
      { id: 'q1', type: 'piece', kind: 'queen', pos: [0, 0] },
      { id: 'q2', type: 'piece', kind: 'queen', pos: [3, 3] },
    ]);

    const viaDsl = evalOn(
      'exists(pieces, a => exists(pieces, b => attacks(a, b)))',
      scene,
    );
    const viaValidator = !resolveBoardValidator('no-attacks')!.check(scene).ok;

    expect(viaDsl).toBe(viaValidator);
  });
});

describe('biểu thức của tác giả không làm sập Player', () => {
  it('biểu thức hỏng trả về outcome, không ném', () => {
    const outcome = tryEvaluate('count(khong_co, c => 1)', boardEnvironment(steps[0]!.scene!));

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/Không có tên/);
  });
});
