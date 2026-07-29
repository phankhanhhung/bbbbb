import { describe, expect, it } from 'vitest';
import { command, createEditorState, execute, undo } from '@combviz/editor';
import { tryEvaluate, DETERMINISTIC_BUDGET } from '@combviz/dsl';
import { createContext, createRenderer } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import {
  deriveSequence,
  resolveSequenceValidator,
  sequenceCommands,
  sequenceEnvironment,
  sequenceHitTest,
  sequenceRenderer,
  sequenceSchemaFragment,
  sequenceSummary,
  SEQUENCE_LIMITS,
} from '../src/index.js';

const scene = (
  values: readonly number[],
  mode: 'sequence' | 'piles' = 'sequence',
  extra: Record<string, unknown> = {},
): Scene => ({
  engine: 'sequence',
  config: { mode, ...extra },
  elements: values.map((value, i) => ({ id: `i${i}`, type: 'item', value, pos: i })),
});

const run = (current: Scene, type: string, params: unknown): Scene | null => {
  const result = execute(createEditorState(current), sequenceCommands, command(type, params));
  return result.applied ? result.state.scene : null;
};

const evalOn = (current: Scene, expr: string): unknown =>
  tryEvaluate(expr, sequenceEnvironment(current), DETERMINISTIC_BUDGET).value;

describe('mô hình dữ liệu', () => {
  it('sắp theo `pos`, không theo thứ tự trong mảng', () => {
    // Thứ tự mảng là chuyện của file (DAT-03); vị trí là chuyện của bài toán.
    const shuffled: Scene = {
      engine: 'sequence',
      config: { mode: 'sequence' },
      elements: [
        { id: 'c', type: 'item', value: 3, pos: 2 },
        { id: 'a', type: 'item', value: 1, pos: 0 },
        { id: 'b', type: 'item', value: 2, pos: 1 },
      ],
    };

    expect(deriveSequence(shuffled).items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('bắt hai phần tử đứng chung một vị trí', () => {
    const broken: Scene = {
      engine: 'sequence',
      config: { mode: 'sequence' },
      elements: [
        { id: 'a', type: 'item', value: 1, pos: 0 },
        { id: 'b', type: 'item', value: 2, pos: 0 },
      ],
    };

    const codes = sequenceSchemaFragment.checkBounds(broken, '').map((i) => i.code);
    expect(codes).toContain('bounds/duplicate-pos');
  });

  it('cảnh báo đống sỏi mang số âm', () => {
    const codes = sequenceSchemaFragment
      .checkBounds(scene([3, -2], 'piles'), '')
      .map((i) => i.code);
    expect(codes).toContain('bounds/negative-pile');
  });

  it('chặn dãy dài quá trần', () => {
    const long = scene(Array.from({ length: SEQUENCE_LIMITS.maxItems + 1 }, (_, i) => i));
    const codes = sequenceSchemaFragment.checkBounds(long, '').map((i) => i.code);
    expect(codes).toContain('bounds/too-many-items');
  });
});

describe('tập lệnh chia theo mode — ràng buộc nằm trong thao tác', () => {
  it('đổi chỗ chạy ở `sequence` và **không** chạy ở `piles`', () => {
    const ordered = scene([5, 9]);
    const swapped = run(ordered, 'sequence/swap', { a: 'i0', b: 'i1' })!;

    expect(deriveSequence(swapped).items.map((i) => i.value)).toEqual([9, 5]);
    // Ở đa tập, "đổi chỗ" không có nghĩa gì cả — và cho phép nó sẽ khiến người
    // học tin rằng thứ tự đống sỏi là một thông tin.
    expect(run(scene([5, 9], 'piles'), 'sequence/swap', { a: 'i0', b: 'i1' })).toBeNull();
  });

  it('gộp chạy ở `piles` và **không** chạy ở `sequence`', () => {
    expect(run(scene([5, 9]), 'sequence/combine', { a: 'i0', b: 'i1', rule: 'sum' })).toBeNull();

    const merged = run(scene([5, 9], 'piles'), 'sequence/combine', {
      a: 'i0',
      b: 'i1',
      rule: 'sum',
    })!;
    expect(deriveSequence(merged).items.map((i) => i.value)).toEqual([14]);
  });

  it('đổi chỗ giữ id và chỉ đổi `pos` — để diff nhận ra chuyển động', () => {
    const swapped = run(scene([5, 9]), 'sequence/swap', { a: 'i0', b: 'i1' })!;
    const byId = new Map(swapped.elements.map((e) => [e.id, e]));

    expect(byId.get('i0')!['pos']).toBe(1);
    expect(byId.get('i1')!['pos']).toBe(0);
    expect(swapped.elements).toHaveLength(2);
  });

  it('gộp giữ id của phần tử đầu — một đống lớn lên, một đống biến mất', () => {
    const merged = run(scene([5, 9], 'piles'), 'sequence/combine', {
      a: 'i0',
      b: 'i1',
      rule: 'abs-diff',
    })!;

    expect(merged.elements.map((e) => e.id)).toEqual(['i0']);
    expect(merged.elements[0]!['value']).toBe(4);
  });

  it('mọi quy tắc gộp đều là quy tắc trong tập đóng', () => {
    const rules = { sum: 14, 'abs-diff': 4, product: 45, max: 9, min: 5 };
    for (const [rule, expected] of Object.entries(rules)) {
      const merged = run(scene([5, 9], 'piles'), 'sequence/combine', {
        a: 'i0',
        b: 'i1',
        rule,
      })!;
      expect(merged.elements[0]!['value'], rule).toBe(expected);
    }

    expect(
      run(scene([5, 9], 'piles'), 'sequence/combine', { a: 'i0', b: 'i1', rule: 'eval' }),
    ).toBeNull();
  });

  it('tách là phép ngược của gộp, và không tách được quá số đang có', () => {
    const source = scene([7], 'piles');

    expect(run(source, 'sequence/split', { id: 'i0', take: 7, newId: 'x' })).toBeNull();
    expect(run(source, 'sequence/split', { id: 'i0', take: 0, newId: 'x' })).toBeNull();

    const split = run(source, 'sequence/split', { id: 'i0', take: 3, newId: 'x' })!;
    expect(deriveSequence(split).items.map((i) => i.value)).toEqual([4, 3]);
  });

  it('chuyển sỏi giữ nguyên tổng, và từ chối chuyển nhiều hơn số đang có', () => {
    const start = scene([4, 1], 'piles');
    const moved = run(start, 'sequence/move', { from: 'i0', to: 'i1', amount: 3 })!;

    expect(deriveSequence(moved).items.map((i) => i.value)).toEqual([1, 4]);
    expect(deriveSequence(moved).total).toBe(deriveSequence(start).total);
    expect(run(start, 'sequence/move', { from: 'i0', to: 'i1', amount: 9 })).toBeNull();
  });

  it('cộng vào nhiều phần tử là **một** mục lịch sử', () => {
    const state = execute(
      createEditorState(scene([1, 2, 3])),
      sequenceCommands,
      command('sequence/add', { ids: ['i0', 'i1', 'i2'], delta: 10 }),
    ).state;

    expect(deriveSequence(state.scene).items.map((i) => i.value)).toEqual([11, 12, 13]);
    expect(deriveSequence(undo(state).scene).items.map((i) => i.value)).toEqual([1, 2, 3]);
  });

  it('lệnh không đổi gì thì không áp dụng — lịch sử không nhận mục rỗng', () => {
    expect(run(scene([1, 2]), 'sequence/add', { ids: ['i0'], delta: 0 })).toBeNull();
    expect(run(scene([1, 2]), 'sequence/set-value', { id: 'i0', value: 1 })).toBeNull();
    expect(run(scene([1, 2]), 'sequence/remove', { ids: ['khong-co'] })).toBeNull();
  });
});

describe('môi trường DSL', () => {
  it('binding cơ bản', () => {
    const current = scene([3, 1, 4, 1, 5]);

    expect(evalOn(current, 'n')).toBe(5);
    expect(evalOn(current, 'total')).toBe(14);
    expect(evalOn(current, 'count(items, x => x.value % 2 == 1)')).toBe(4);
  });

  it('`inversions` đếm đúng số cặp nghịch thế', () => {
    expect(evalOn(scene([1, 2, 3]), 'inversions')).toBe(0);
    expect(evalOn(scene([3, 2, 1]), 'inversions')).toBe(3);
    expect(evalOn(scene([2, 1, 3]), 'inversions')).toBe(1);
  });

  it('một lần đổi chỗ hai phần tử **cạnh nhau** đổi tính chẵn lẻ của nghịch thế', () => {
    // Đây là bất biến của cả họ bài hoán vị (15-puzzle, sắp xếp bằng đổi chỗ).
    const before = scene([1, 3, 2, 4]);
    const after = run(before, 'sequence/swap', { a: 'i0', b: 'i1' })!;

    const p = (s: Scene): number => (evalOn(s, 'inversions') as number) % 2;
    expect(p(after)).not.toBe(p(before));
  });

  it('`gap` cho hiệu tuyệt đối — phép toán của họ bài "xoá hai số"', () => {
    // DSL không có phép lấy chỉ số (grammar đóng, DSL-01), nên cách hỏi về một
    // **cặp** luôn đi qua `exists`/`forall` — và đó cũng là cách lời giải nói.
    const current = scene([9, 4, 4], 'piles');

    expect(
      evalOn(current, 'exists(items, a => exists(items, b => a.pos < b.pos && gap(a, b) == 0))'),
    ).toBe(true);
    expect(
      evalOn(current, 'exists(items, a => exists(items, b => a.pos < b.pos && gap(a, b) == 5))'),
    ).toBe(true);
    expect(
      evalOn(current, 'exists(items, a => exists(items, b => gap(a, b) == 100))'),
    ).toBe(false);
  });

  it('`adjacent` đúng theo vị trí', () => {
    const current = scene([1, 2, 3]);

    expect(
      evalOn(current, 'count(items, a => count(items, b => adjacent(a, b)) == 1)'),
    ).toBe(2); // hai đầu mút có đúng một hàng xóm
    expect(
      evalOn(current, 'count(items, a => count(items, b => adjacent(a, b)) == 2)'),
    ).toBe(1); // phần tử giữa có hai
  });

  it('không rò rỉ thuộc tính không khai báo', () => {
    const outcome = tryEvaluate(
      'count(items, x => x.constructor == 1)',
      sequenceEnvironment(scene([1])),
      DETERMINISTIC_BUDGET,
    );
    expect(outcome.ok).toBe(false);
  });
});

describe('validator', () => {
  const check = (id: string, current: Scene) => resolveSequenceValidator(id)!.check(current);

  it('values-non-negative chỉ ra đúng phần tử âm', () => {
    const result = check('values-non-negative', scene([3, -1, 2]));
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(['i1']);
  });

  it('values-distinct chỉ ra cả cặp trùng', () => {
    const result = check('values-distinct', scene([1, 2, 1]));
    expect(result.ok).toBe(false);
    expect(new Set(result.violations)).toEqual(new Set(['i0', 'i2']));
  });

  it('sorted chỉ ra cặp nghịch thứ tự, không tô đỏ cả dãy', () => {
    const result = check('sorted', scene([1, 5, 3, 7]));
    expect(result.ok).toBe(false);
    expect(new Set(result.violations)).toEqual(new Set(['i1', 'i2']));
    expect(check('sorted', scene([1, 3, 5, 7])).ok).toBe(true);
  });

  it('validator có tham số', () => {
    expect(check('total:10', scene([4, 6])).ok).toBe(true);
    expect(check('total:10', scene([4, 7])).ok).toBe(false);
    expect(check('count:2', scene([4, 6])).ok).toBe(true);
    expect(check('max-value:5', scene([4, 6])).ok).toBe(false);
  });

  it('id lạ trả null thay vì im lặng cho qua', () => {
    expect(resolveSequenceValidator('khong-co-cai-nay')).toBeNull();
    expect(resolveSequenceValidator('total')).toBeNull();
  });
});

describe('renderer', () => {
  const renderer = createRenderer([sequenceRenderer]);
  const ctx = createContext(defaultTheme);

  it('chế độ `sequence` vẽ ô vuông có số', () => {
    const svg = renderer.toSvg(scene([7, 8]), ctx);
    expect(svg).toContain('<rect');
    expect(svg).toContain('>7<');
    expect(svg).toContain('>8<');
  });

  it('chế độ `piles` vẽ đúng số viên sỏi', () => {
    const svg = renderer.toSvg(scene([3], 'piles'), ctx);
    expect(svg.match(/<circle/g)).toHaveLength(3);
  });

  it('đống quá cao thì chuyển sang hiện số, không vẽ hàng trăm chấm', () => {
    const svg = renderer.toSvg(scene([500], 'piles'), ctx);
    expect(svg).not.toContain('<circle');
    expect(svg).toContain('>500<');
  });

  it('đống rỗng vẫn chiếm chỗ — "còn 0" khác với "đã biến mất"', () => {
    const svg = renderer.toSvg(scene([0, 4], 'piles'), ctx);
    expect(svg).toContain('>0<');
  });

  it('khung nhìn rộng theo số phần tử, nhưng có sàn tối thiểu', () => {
    const five = renderer.viewportOf(scene([1, 2, 3, 4, 5]));
    const nine = renderer.viewportOf(scene([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(nine.width).toBeGreaterThan(five.width);

    // Sàn: scene một phần tử **không** được khít, nếu không trình duyệt scale nó
    // lên hết cỡ và một đống sỏi đơn lẻ hiện ra to bằng cả màn hình.
    expect(renderer.viewportOf(scene([1])).width).toBe(five.width);
  });

  it('khung nhìn chừa chỗ cho con số dưới chân cột và cho nhãn tổng', () => {
    const many = [3, 5, 2, 4, 6, 1];
    const piles = renderer.viewportOf(scene(many, 'piles', { show_total: true }));

    // Con số nằm dưới đường đáy y = 0 ⇒ mép dưới phải qua khỏi nó.
    expect(piles.y + piles.height).toBeGreaterThan(5.5);
    // Nhãn "Σ = …" nằm ngoài phần tử cuối ⇒ phải được cộng vào bề rộng. Dùng dãy
    // đủ dài để sàn tối thiểu không che mất khác biệt.
    expect(piles.width).toBeGreaterThan(renderer.viewportOf(scene(many, 'piles')).width);
  });

  it('`show_total` hiện tổng', () => {
    expect(renderer.toSvg(scene([2, 3], 'sequence', { show_total: true }), ctx)).toContain('Σ = 5');
  });

  it('hình thuần: cùng scene cho cùng chuỗi', () => {
    const a = renderer.toSvg(scene([1, 2, 3], 'piles'), ctx);
    const b = renderer.toSvg(scene([1, 2, 3], 'piles'), ctx);
    expect(a).toBe(b);
  });
});

describe('hit test', () => {
  it('chạm vào ô trong chế độ `sequence`', () => {
    expect(sequenceHitTest(scene([1, 2, 3]), { x: 5, y: 5 })).toEqual(['i0']);
    expect(sequenceHitTest(scene([1, 2, 3]), { x: 17, y: 5 })).toEqual(['i1']);
  });

  it('chạm vào **cả cột** sỏi, không phải từng viên', () => {
    const piles = scene([5], 'piles');
    // Gần đỉnh đống và gần chân đống đều phải trúng cùng một đống.
    expect(sequenceHitTest(piles, { x: 5, y: -1 })).toEqual(['i0']);
    expect(sequenceHitTest(piles, { x: 5, y: -15 })).toEqual(['i0']);
  });

  it('chạm ra ngoài không trúng gì', () => {
    expect(sequenceHitTest(scene([1]), { x: 40, y: 5 })).toEqual([]);
  });
});

describe('tóm tắt', () => {
  it('đếm phần tử, tổng, và số phần tử lẻ', () => {
    expect(sequenceSummary(scene([1, 2, 3, 4]))).toEqual({ count: 4, total: 10, odd: 2 });
  });
});
