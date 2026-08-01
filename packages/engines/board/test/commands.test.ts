import { describe, expect, it } from 'vitest';
import { command, createEditorState, execute, undo } from '@combviz/editor';
import type { Scene } from '@combviz/schema';
import { tryEvaluate, DETERMINISTIC_BUDGET } from '@combviz/dsl';
import { boardCommands, colorSummary, coverage } from '../src/commands.js';
import { boardEnvironment } from '../src/dsl.js';
import { boardHitTest, pointToCell } from '../src/hit-test.js';
import { boardSchemaFragment } from '../src/index.js';
import { CELL, cellColorClass, latticeOf } from '../src/geometry.js';
import { neighbours, wrapOf } from '../src/lattice.js';
import type { BoardConfig } from '../src/schema.js';
import { resolveBoardValidator } from '../src/validators.js';

const board = (overrides: Partial<Scene> = {}): Scene => ({
  engine: 'board',
  config: { rows: 8, cols: 8 },
  elements: [],
  ...overrides,
});

const run = (scene: Scene, type: string, params: unknown): Scene | null => {
  const result = execute(createEditorState(scene), boardCommands, command(type, params));
  return result.applied ? result.state.scene : null;
};

describe('BD-01 — tô màu', () => {
  it('kéo quét nhiều ô là **một** lệnh, undo một lần là hết', () => {
    const state = execute(
      createEditorState(board()),
      boardCommands,
      command('board/paint-cells', {
        cells: ['cell-0-0', 'cell-0-1', 'cell-0-2'],
        color_class: 3,
      }),
    ).state;

    expect(colorSummary(state.scene).get(3)).toBe(3);
    // Undo từng ô một là undo vô dụng.
    expect(colorSummary(undo(state).scene).size).toBe(0);
  });

  it('không tô được ô khuyết', () => {
    const scene = board({ config: { rows: 8, cols: 8, holes: [[0, 0]] } });
    expect(run(scene, 'board/paint-cells', { cells: ['cell-0-0'], color_class: 1 })).toBeNull();
  });

  it('không tô được ô ngoài bàn', () => {
    expect(
      run(board(), 'board/paint-cells', { cells: ['cell-99-99'], color_class: 1 }),
    ).toBeNull();
  });

  it('tô lại đúng màu cũ thì không sinh bước lịch sử', () => {
    const painted = run(board(), 'board/paint-cells', {
      cells: ['cell-1-1'],
      color_class: 2,
    })!;

    expect(
      run(painted, 'board/paint-cells', { cells: ['cell-1-1'], color_class: 2 }),
    ).toBeNull();
  });

  it('xoá màu gỡ hẳn override chứ không để lại rác', () => {
    const painted = run(board(), 'board/paint-cells', {
      cells: ['cell-1-1'],
      color_class: 2,
    })!;
    const cleared = run(painted, 'board/paint-cells', {
      cells: ['cell-1-1'],
      color_class: null,
    })!;

    expect((cleared.config as { cell_overrides?: object }).cell_overrides).toEqual({});
  });

  it('preset áp cho cả bàn bằng một lệnh', () => {
    const scene = run(board(), 'board/set-preset', {
      preset: { type: 'checkerboard' },
    })!;

    const summary = colorSummary(scene);
    expect(summary.get(1)).toBe(32);
    expect(summary.get(2)).toBe(32);
  });
});

describe('BD-03 — đặt và thao tác tile', () => {
  it('đặt tile rồi đếm được độ phủ', () => {
    const scene = run(board(), 'board/place-tile', {
      id: 't1',
      shape: 'domino',
      pos: [0, 0],
    })!;

    expect(coverage(scene)).toEqual({ covered: 2, total: 64 });
  });

  it('id trùng bị từ chối', () => {
    const scene = run(board(), 'board/place-tile', {
      id: 't1',
      shape: 'domino',
      pos: [0, 0],
    })!;

    expect(
      run(scene, 'board/place-tile', { id: 't1', shape: 'domino', pos: [4, 4] }),
    ).toBeNull();
  });

  it('xoay bốn lần về đúng tư thế ban đầu', () => {
    let scene = run(board(), 'board/place-tile', {
      id: 't1',
      shape: 'tromino-l',
      pos: [2, 2],
    })!;
    for (let i = 0; i < 4; i += 1) {
      scene = run(scene, 'board/rotate-tile', { id: 't1', delta: 90 })!;
    }

    expect(scene.elements[0]!['rot']).toBe(0);
  });

  it('cho phép kéo tới chỗ vi phạm — validator mới là nơi báo', () => {
    // Chặn ở command sẽ biến sandbox thành cái hộp không nghịch được, mà cả điểm
    // của nó là học bằng nghịch.
    let scene = run(board(), 'board/place-tile', { id: 't1', shape: 'domino', pos: [0, 0] })!;
    scene = run(scene, 'board/place-tile', { id: 't2', shape: 'domino', pos: [4, 4] })!;
    scene = run(scene, 'board/move-element', { id: 't2', pos: [0, 1] })!;

    expect(scene.elements).toHaveLength(2);
    expect(resolveBoardValidator('tiles-no-overlap')!.check(scene).ok).toBe(false);
  });

  it('element khoá không di chuyển và không xoá được', () => {
    const scene = board({
      elements: [
        { id: 't1', type: 'tile', shape: 'domino', pos: [0, 0], rot: 0, locked: true },
      ],
    });

    expect(run(scene, 'board/move-element', { id: 't1', pos: [3, 3] })).toBeNull();
    expect(run(scene, 'board/remove', { ids: ['t1'] })).toBeNull();
  });

  it('di chuyển tới đúng chỗ đang đứng thì không sinh bước lịch sử', () => {
    const scene = run(board(), 'board/place-tile', {
      id: 't1',
      shape: 'domino',
      pos: [2, 2],
    })!;
    expect(run(scene, 'board/move-element', { id: 't1', pos: [2, 2] })).toBeNull();
  });
});

describe('BD-02 — quân', () => {
  it('không đặt được quân ngoài bàn', () => {
    expect(
      run(board(), 'board/place-piece', { id: 'p1', kind: 'rook', pos: [9, 9] }),
    ).toBeNull();
  });

  it('bật/tắt vùng khống chế', () => {
    const scene = run(board(), 'board/place-piece', {
      id: 'p1',
      kind: 'rook',
      pos: [0, 0],
    })!;
    const on = run(scene, 'board/toggle-attacks', { id: 'p1' })!;

    expect(on.elements[0]!['show_attacks']).toBe(true);
  });
});

describe('hit test (A-05)', () => {
  it('điểm bên trong ô thuộc về ô đó, không làm tròn sang ô kế', () => {
    // Ô (0,0) trải từ 0 tới 10; điểm 9.9 vẫn thuộc ô 0. Làm tròn sẽ khiến nửa sau
    // của mỗi ô nhận nhầm sang ô kế tiếp.
    expect(pointToCell({ x: 9.9, y: 0.1 })).toEqual([0, 0]);
    expect(pointToCell({ x: CELL, y: 0 })).toEqual([0, 1]);
  });

  it('trả quân trước ô: chạm vào domino là chọn domino', () => {
    const scene = board({
      elements: [{ id: 't1', type: 'tile', shape: 'domino', pos: [1, 1], rot: 0 }],
    });

    const hits = boardHitTest(scene, { x: CELL * 1.5, y: CELL * 1.5 });

    expect(hits[0]).toBe('t1');
    expect(hits).toContain('cell-1-1');
  });

  it('chạm chỗ trống chỉ trả về ô', () => {
    expect(boardHitTest(board(), { x: CELL * 5.5, y: CELL * 5.5 })).toEqual(['cell-5-5']);
  });

  it('chạm ngoài bàn không trả về gì', () => {
    expect(boardHitTest(board(), { x: -5, y: -5 })).toEqual([]);
  });
});

describe('G-11 — lật một hàng/cột', () => {
  /** Bảng 4×4 toàn lớp 2, đúng một ô lớp 1 — dạng bài "lật dấu". */
  const signBoard = (): Scene =>
    board({
      config: {
        rows: 4,
        cols: 4,
        cell_overrides: Object.fromEntries(
          Array.from({ length: 16 }, (_, i) => [
            `cell-${Math.floor(i / 4)}-${i % 4}`,
            { color_class: i === 6 ? 1 : 2 },
          ]),
        ),
      },
    });

  const minusCount = (scene: Scene): number => colorSummary(scene).get(1) ?? 0;

  it('lật cả hàng trong **một** lệnh, không phải bốn', () => {
    const scene = run(signBoard(), 'board/flip-line', { axis: 'row', index: 1 })!;

    // Hàng 1 có 1 ô lớp 1 ⇒ sau khi lật còn 3. Chính vì thao tác đụng cả hàng
    // cùng lúc mà tính chẵn lẻ mới là bất biến.
    expect(minusCount(scene)).toBe(3);
  });

  it('giữ **tính chẵn lẻ** của số ô lớp 1 qua mọi lần lật — chính là bài toán', () => {
    let scene = signBoard();
    const parity = minusCount(scene) % 2;

    for (const step of [
      { axis: 'row', index: 0 },
      { axis: 'col', index: 2 },
      { axis: 'row', index: 3 },
      { axis: 'col', index: 0 },
      { axis: 'row', index: 1 },
    ] as const) {
      scene = run(scene, 'board/flip-line', step)!;
      expect(minusCount(scene) % 2).toBe(parity);
    }
  });

  it('lật một cột của bàn cờ tô sẵn cũng đổi màu — đọc màu hiệu dụng, không chỉ override', () => {
    const checker = board({
      config: { rows: 4, cols: 4, coloring_preset: { type: 'checkerboard' } },
    });
    const before = colorSummary(checker);
    const after = colorSummary(run(checker, 'board/flip-line', { axis: 'col', index: 0 })!);

    // Cột 0 của bàn 4×4 xen kẽ có 2 ô mỗi lớp ⇒ tổng không đổi, nhưng từng ô thì đổi.
    expect(after.get(1)).toBe(before.get(1));
    expect(cellColorClass(
      (run(checker, 'board/flip-line', { axis: 'col', index: 0 })!.config) as never,
      0,
      0,
    )).not.toBe(cellColorClass(checker.config as never, 0, 0));
  });

  it('bỏ qua ô khuyết và ô chưa mang màu', () => {
    const holed = board({ config: { rows: 2, cols: 2, holes: [[0, 0]] } });
    // Không ô nào có màu ⇒ không có gì để lật ⇒ lệnh không áp dụng.
    expect(run(holed, 'board/flip-line', { axis: 'row', index: 0 })).toBeNull();
  });

  it('từ chối chỉ số ngoài bàn', () => {
    expect(run(signBoard(), 'board/flip-line', { axis: 'row', index: 9 })).toBeNull();
    expect(run(signBoard(), 'board/flip-line', { axis: 'col', index: -1 })).toBeNull();
  });

  it('undo trả về đúng bảng trước đó — một lần lật là một mục lịch sử', () => {
    const start = signBoard();
    const state = execute(
      createEditorState(start),
      boardCommands,
      command('board/flip-line', { axis: 'row', index: 1 }),
    ).state;

    expect(minusCount(state.scene)).toBe(3);
    expect(minusCount(undo(state).scene)).toBe(1);
  });
});

describe('BD-05 — khoét ô và khoanh vùng', () => {
  it('khoét rồi khoét lại thì ô trở về bàn', () => {
    const once = run(board({ config: { rows: 4, cols: 4 } }), 'board/toggle-holes', {
      cells: ['cell-1-1'],
    })!;
    expect((once.config as { holes?: unknown }).holes).toEqual([[1, 1]]);

    const twice = run(once, 'board/toggle-holes', { cells: ['cell-1-1'] })!;
    // Bàn không còn ô khuyết nào ⇒ **bỏ hẳn** trường, không để lại mảng rỗng: hai
    // cách viết một trạng thái là hai diff git khác nhau (DAT-03).
    expect((twice.config as { holes?: unknown }).holes).toBeUndefined();
  });

  it('một nét quét là **một** lệnh, và danh sách ô khuyết luôn sắp thứ tự', () => {
    const state = execute(
      createEditorState(board({ config: { rows: 5, cols: 5 } })),
      boardCommands,
      command('board/toggle-holes', { cells: ['cell-3-1', 'cell-0-4', 'cell-3-0'] }),
    ).state;

    expect((state.scene.config as { holes: unknown }).holes).toEqual([
      [0, 4],
      [3, 0],
      [3, 1],
    ]);
    // Undo một lần là hết cả nét, không phải ba lần.
    expect((undo(state).scene.config as { holes?: unknown }).holes).toBeUndefined();
  });

  it('khoét được trên cả ba lưới, và không khoét được ô không tồn tại', () => {
    for (const [config, cell] of [
      [{ rows: 4, cols: 4 }, 'cell-1-1'],
      [{ lattice: 'hex', rows: 4, cols: 4 }, 'cell-1-1'],
      [{ lattice: 'triangle', rows: 4, cols: 4 }, 'cell-3-6'],
    ] as const) {
      expect({ config, ok: run(board({ config }), 'board/toggle-holes', { cells: [cell] }) !== null })
        .toEqual({ config, ok: true });
    }
    // Hàng 0 của lưới tam giác chỉ có một ô.
    expect(
      run(board({ config: { lattice: 'triangle', rows: 4, cols: 4 } }), 'board/toggle-holes', {
        cells: ['cell-0-2'],
      }),
    ).toBeNull();
  });

  it('khoanh vùng gộp ô trùng — quét qua lại một ô không đếm hai lần', () => {
    const scene = run(board({ config: { rows: 4, cols: 4 } }), 'board/draw-region', {
      id: 'rg1',
      cells: ['cell-0-0', 'cell-0-1', 'cell-0-0', 'cell-9-9'],
    })!;
    const region = scene.elements[0] as Record<string, unknown>;
    expect(region['cells']).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it('khoanh vùng không nuốt id đang có, và vùng rỗng thì không tạo gì', () => {
    const one = run(board({ config: { rows: 3, cols: 3 } }), 'board/draw-region', {
      id: 'rg1',
      cells: ['cell-0-0'],
    })!;
    expect(run(one, 'board/draw-region', { id: 'rg1', cells: ['cell-1-1'] })).toBeNull();
    expect(
      run(board({ config: { rows: 3, cols: 3 } }), 'board/draw-region', {
        id: 'rg1',
        cells: ['cell-8-8'],
      }),
    ).toBeNull();
  });
});

describe('BD-05 — bàn dán mép', () => {
  const wrapped = (wrap: string, rows = 4, cols = 4): Scene =>
    board({ config: { rows, cols, wrap } });

  it('trên hình xuyến **mọi ô đều có 4 láng giềng** — không còn ô góc', () => {
    // Đây là toàn bộ nội dung toán của `torus`, và là lý do lập luận "xét ô ở góc"
    // hỏng trên bàn ấy.
    const config = wrapped('torus', 5, 5).config as BoardConfig;
    for (let r = 0; r < 5; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        expect({ r, c, deg: neighboursOf(config, r, c).length }).toEqual({ r, c, deg: 4 });
      }
    }
    // Còn bàn thường thì ô góc chỉ có 2.
    expect(neighboursOf(board({ config: { rows: 5, cols: 5 } }).config as BoardConfig, 0, 0))
      .toHaveLength(2);
  });

  it('ống dán trái–phải nhưng **không** dán trên–dưới', () => {
    const config = wrapped('cylinder', 5, 5).config as BoardConfig;
    expect(neighboursOf(config, 2, 0)).toHaveLength(4);
    // Hàng đầu vẫn là mép: chỉ 3 láng giềng.
    expect(neighboursOf(config, 0, 0)).toHaveLength(3);
  });

  it('bàn hẹp: hai hướng ngược nhau vòng về **cùng một ô**, và ô ấy chỉ kể một lần', () => {
    const two = wrapped('cylinder', 3, 2).config as BoardConfig;
    // Cột 0 và cột 1: đông và tây của (1,0) đều là (1,1).
    const near = neighboursOf(two, 1, 0);
    expect(near.filter(([, c]) => c === 1)).toHaveLength(1);

    // Một cột: đông và tây đều vòng về chính nó ⇒ không kề chính nó.
    const one = wrapped('cylinder', 3, 1).config as BoardConfig;
    expect(neighboursOf(one, 1, 0).some(([r, c]) => r === 1 && c === 0)).toBe(false);
  });

  it('`adjacent()` của DSL và validator `proper-colouring` cùng đọc mép dán', () => {
    const degreeSum = (scene: Scene): unknown =>
      tryEvaluate(
        'sum(cells, a => count(cells, b => adjacent(a, b)))',
        boardEnvironment(scene),
        DETERMINISTIC_BUDGET,
      ).value;

    // Bàn 4×4 thường: $2 \times (2 \cdot 4 \cdot 3) = 48$. Trên hình xuyến mọi ô
    // có bậc 4, nên tổng là $16 \times 4 = 64$ — `adjacent()` đọc đúng mép dán.
    expect(degreeSum(board({ config: { rows: 4, cols: 4 } }))).toBe(48);
    expect(degreeSum(wrapped('torus', 4, 4))).toBe(64);
    // Ống thì chỉ dán một chiều: $48 + 2 \times 4 = 56$.
    expect(degreeSum(wrapped('cylinder', 4, 4))).toBe(56);

    // Bàn cờ xen kẽ 5×5 **hợp lệ** trên bàn thường nhưng **hỏng** trên hình xuyến:
    // cột 0 và cột 4 cùng màu mà lại kề nhau. Số lẻ là chỗ nó hỏng, và đó chính là
    // "hình xuyến có chu trình lẻ".
    const preset = { type: 'checkerboard' } as const;
    const plain = board({ config: { rows: 5, cols: 5, coloring_preset: preset } });
    const torus = board({ config: { rows: 5, cols: 5, coloring_preset: preset, wrap: 'torus' } });
    expect(resolveBoardValidator('proper-colouring')!.check(plain).ok).toBe(true);
    expect(resolveBoardValidator('proper-colouring')!.check(torus).ok).toBe(false);
    // Còn 4×4 thì chẵn, nên vẫn tô được hai màu ngay cả trên hình xuyến.
    const even = board({ config: { rows: 4, cols: 4, coloring_preset: preset, wrap: 'torus' } });
    expect(resolveBoardValidator('proper-colouring')!.check(even).ok).toBe(true);
  });

  it('quân thò qua mép **vòng về**, nên không còn là tràn biên', () => {
    const tile = { id: 't', type: 'tile', shape: 'domino', pos: [1, 3], rot: 0 };
    const plain = board({ config: { rows: 4, cols: 4 }, elements: [tile] as never });
    const torus = board({ config: { rows: 4, cols: 4, wrap: 'torus' }, elements: [tile] as never });

    expect(resolveBoardValidator('tiles-in-bounds')!.check(plain).ok).toBe(false);
    expect(resolveBoardValidator('tiles-in-bounds')!.check(torus).ok).toBe(true);
  });

  it('bound chặn dán mép ở chỗ nó không có nghĩa', () => {
    const codes = (s: Scene): string[] => boardSchemaFragment.checkBounds(s, '').map((i) => i.code);
    expect(codes(board({ config: { lattice: 'hex', rows: 4, cols: 4, wrap: 'torus' } }))).toContain(
      'bounds/wrap-needs-square',
    );
    expect(
      codes(
        board({
          config: { rows: 4, cols: 4, wrap: 'torus' },
          elements: [{ id: 'k', type: 'piece', kind: 'rook', pos: [1, 1], show_attacks: true }] as never,
        }),
      ),
    ).toContain('bounds/attacks-with-wrap');
    // Bàn xuyến vuông không quân khống chế thì sạch.
    expect(codes(board({ config: { rows: 4, cols: 4, wrap: 'torus' } }))).toEqual([]);
  });
});

/** Láng giềng của một ô, đọc đúng đường mà engine đọc. */
function neighboursOf(config: BoardConfig, row: number, col: number): readonly (readonly [number, number])[] {
  return neighbours(latticeOf(config), config.rows, config.cols, row, col, wrapOf(config));
}

describe('BD-08 — lật chùm ô (lights-out)', () => {
  /** Bàn $n \times n$ **sáng hết**: mọi ô lớp 2. */
  const lit = (n: number): Scene =>
    board({
      config: {
        rows: n,
        cols: n,
        cell_overrides: Object.fromEntries(
          Array.from({ length: n * n }, (_, i) => [
            `cell-${Math.floor(i / n)}-${i % n}`,
            { color_class: 2 },
          ]),
        ),
      },
    });

  const press = (scene: Scene, row: number, col: number): Scene =>
    run(scene, 'board/toggle-cross', { cell: `cell-${row}-${col}` })!;

  const onCount = (scene: Scene): number => colorSummary(scene).get(2) ?? 0;

  it('bấm giữa bàn vuông đổi đúng 5 ô, bấm góc đổi đúng 3', () => {
    expect(onCount(press(lit(3), 1, 1))).toBe(9 - 5);
    expect(onCount(press(lit(3), 0, 0))).toBe(9 - 3);
  });

  it('bấm hai lần là không bấm — nhờ vậy lời giải là một **tập** ô', () => {
    const twice = press(press(lit(3), 1, 2), 1, 2);
    expect(colorSummary(twice)).toEqual(colorSummary(lit(3)));
  });

  it('hai lần bấm **giao hoán** — nhờ vậy thứ tự bấm không phải một chiều tìm kiếm', () => {
    const ab = press(press(lit(4), 0, 1), 2, 3);
    const ba = press(press(lit(4), 2, 3), 0, 1);
    expect(ab.config).toEqual(ba.config);
  });

  it('ô chưa tô tính là lớp 1 — bàn trống nghĩa là tắt hết đèn', () => {
    const blank = board({ config: { rows: 3, cols: 3 } });
    const after = press(blank, 1, 1);
    // Năm ô bật lên, bốn ô còn lại vẫn "chưa tô" nên chưa có màu hiệu dụng.
    expect(colorSummary(after).get(2)).toBe(5);
  });

  it('bỏ qua ô khuyết; bấm ra ngoài bàn thì lệnh không áp dụng', () => {
    const holed = board({
      config: {
        rows: 3,
        cols: 3,
        holes: [[0, 1]],
        cell_overrides: { 'cell-0-1': { color_class: 2 } },
      },
    });
    const after = press(holed, 1, 1)!;
    expect(cellColorClass(after.config as never, 0, 1)).toBe(2);

    expect(run(lit(3), 'board/toggle-cross', { cell: 'cell-9-9' })).toBeNull();
    expect(run(lit(3), 'board/toggle-cross', { cell: 'không-phải-ô' })).toBeNull();
  });

  it('luật `neighbours` **không** đổi ô được bấm', () => {
    const after = run(lit(3), 'board/toggle-cross', {
      cell: 'cell-1-1',
      rule: 'neighbours',
    })!;
    expect(cellColorClass(after.config as never, 1, 1)).toBe(2);
    expect(onCount(after)).toBe(9 - 4);
  });

  it('luật lạ bị từ chối, không im lặng chạy như `cross`', () => {
    expect(run(lit(3), 'board/toggle-cross', { cell: 'cell-1-1', rule: 'toString' })).toBeNull();
  });

  /**
   * Kiểm chứng bằng **vét cạn**, không bằng ví dụ chọn tay.
   *
   * Trên bàn $3 \times 3$, ma trận lật trên $GF(2)$ khả nghịch: $512$ tập ô bấm
   * cho ra $512$ trạng thái đôi một khác nhau, nên **mọi** cấu hình đèn giải được
   * và giải được đúng một cách. Đây là lý do bài $3 \times 3$ là bài mở đầu tốt —
   * không có "hoa văn câm" nào để bàn về, chuyện đó để dành cho $5 \times 5$.
   */
  it('mọi cấu hình đèn 3×3 giải được, và đúng một cách', () => {
    const reached = new Map<string, number>();

    for (let mask = 0; mask < 512; mask += 1) {
      let scene = board({ config: { rows: 3, cols: 3 } });
      for (let i = 0; i < 9; i += 1) {
        if ((mask >> i) & 1) scene = press(scene, Math.floor(i / 3), i % 3);
      }
      const key = Array.from({ length: 9 }, (_, i) =>
        cellColorClass(scene.config as never, Math.floor(i / 3), i % 3) ?? 1,
      ).join('');
      reached.set(key, (reached.get(key) ?? 0) + 1);
    }

    expect(reached.size).toBe(512);
  });

  it('bốn góc cộng ô giữa tắt hết đèn bàn 3×3 — và validator công nhận', () => {
    let scene = lit(3);
    for (const [r, c] of [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]] as const) {
      scene = press(scene, r, c);
    }

    const validator = resolveBoardValidator('all-cells:1')!;
    expect(validator.check(scene).ok).toBe(true);
    // Còn thiếu một cú bấm thì chưa xong — validator không cho qua non.
    expect(validator.check(press(scene, 0, 0)).ok).toBe(false);
  });

  it('validator `all-cells` bỏ qua ô khuyết', () => {
    const holed = board({ config: { rows: 2, cols: 2, holes: [[0, 0]] } });
    // Ba ô còn lại chưa tô ⇒ tính là lớp 1 ⇒ đã "tắt hết".
    expect(resolveBoardValidator('all-cells:1')!.check(holed).ok).toBe(true);
  });
});

describe('§14.2 — ba món nợ triangle-lattice, trả một lượt', () => {
  /** Tam giác cạnh 3: hàng $r$ có $2r+1$ ô — hàng 0 chỉ có `cell-0-0`. */
  const tri = (extra: Partial<BoardConfig> = {}): Scene =>
    board({ config: { rows: 3, cols: 3, lattice: 'triangle', ...extra } });

  it('`colorSummary` đếm theo hình lưới: sọc theo hàng ra 1/3/5, không phải 3/3/3', () => {
    // Đúng con số mà §14.2 dùng làm triệu chứng — nay nó là chốt canh.
    const summary = colorSummary(tri({ coloring_preset: { type: 'stripes', orientation: 'row', k: 3 } }));
    expect([summary.get(1), summary.get(2), summary.get(3)]).toEqual([1, 3, 5]);
    // Và tổng phải bằng số ô thật của tam giác: $3^2$, không phải $3 \times 3$... hai
    // số này trùng nhau ở cạnh 3, nên kiểm thêm cạnh 4 cho khỏi trùng tình cờ.
    const four = colorSummary(
      board({ config: { rows: 4, cols: 4, lattice: 'triangle', coloring_preset: { type: 'stripes', orientation: 'row', k: 2 } } }),
    );
    expect([...four.values()].reduce((a, b) => a + b, 0)).toBe(16);
  });

  it('`paint-cells` từ chối ô ma — trong khung chữ nhật mà ngoài hình lưới', () => {
    // `cell-0-2` nằm trong khung 3×3 nhưng hàng 0 của tam giác chỉ có một ô.
    expect(run(tri(), 'board/paint-cells', { cells: ['cell-0-2'], color_class: 1 })).toBeNull();
    // Ô có thật thì vẫn tô được — sửa không được siết quá tay.
    expect(run(tri(), 'board/paint-cells', { cells: ['cell-2-4'], color_class: 1 })).not.toBeNull();
  });

  it('`place-piece` cũng vậy', () => {
    expect(
      run(tri(), 'board/place-piece', { id: 'p1', kind: 'custom', glyph: '★', pos: [0, 2] }),
    ).toBeNull();
    expect(
      run(tri(), 'board/place-piece', { id: 'p1', kind: 'custom', glyph: '★', pos: [1, 2] }),
    ).not.toBeNull();
  });
});
