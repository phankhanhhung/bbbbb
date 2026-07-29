import { describe, expect, it } from 'vitest';
import { command, createEditorState, execute } from '@combviz/editor';
import { tryEvaluate, DETERMINISTIC_BUDGET } from '@combviz/dsl';
import { createContext, createRenderer, walk } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import {
  pointCommands,
  pointEnvironment,
  pointHitTest,
  pointRenderer,
  pointSchemaFragment,
  resolvePointValidator,
} from '../src/index.js';

const scene = (
  points: Record<string, readonly [number, number]>,
  segments: readonly (readonly [string, string])[] = [],
  config: Record<string, unknown> = {},
): Scene => ({
  engine: 'point',
  config,
  elements: [
    ...Object.entries(points).map(([id, pos]) => ({ id, type: 'point', pos: [...pos] })),
    ...segments.map(([a, b]) => ({ id: `s-${a}${b}`, type: 'segment', a, b })),
  ],
});

const SQUARE = scene({ a: [0, 0], b: [10, 0], c: [10, 10], d: [0, 10], m: [5, 5] });

const evalOn = (s: Scene, expr: string): unknown =>
  tryEvaluate(expr, pointEnvironment(s), DETERMINISTIC_BUDGET).value;

describe('DSL', () => {
  it('binding cơ bản', () => {
    expect(evalOn(SQUARE, 'n')).toBe(5);
    expect(evalOn(SQUARE, 'hull')).toBe(4);
    expect(evalOn(SQUARE, 'inside')).toBe(1);
    // Tâm hình vuông nằm trên **cả hai** đường chéo: (a,m,c) và (b,m,d).
    expect(evalOn(SQUARE, 'collinear')).toBe(2);
  });

  it('`dist` và `area`', () => {
    expect(evalOn(SQUARE, 'count(points, p => p.x == 0)')).toBe(2);
    const s = scene({ a: [0, 0], b: [30, 0], c: [0, 40] });
    expect(evalOn(s, 'sum(points, p => p.x)')).toBe(30);
  });

  it('`aligned` đọc đúng quan hệ thẳng hàng', () => {
    const line = scene({ a: [0, 0], b: [10, 10], c: [20, 20], d: [0, 10] });
    expect(evalOn(line, 'collinear')).toBe(1);
    expect(evalOn(line, 'exists(points, p => exists(points, q => p.x < q.x && aligned(p, q, p)))')).toBe(
      true,
    );
  });

  it('`on_hull` khớp với binding `hull`', () => {
    expect(evalOn(SQUARE, 'count(points, p => on_hull(p))')).toBe(4);
  });

  it('`intersections` đếm giao điểm thật', () => {
    const cross = scene({ a: [0, 0], b: [10, 10], c: [10, 0], d: [0, 10] }, [
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(evalOn(cross, 'intersections')).toBe(1);
  });
});

describe('validator', () => {
  const check = (id: string, s: Scene) => resolvePointValidator(id)!.check(s);

  it('general-position bắt bộ ba thẳng hàng', () => {
    // Bốn đỉnh hình vuông thôi thì ở vị trí tổng quát; thêm tâm là hỏng.
    expect(check('general-position', scene({ a: [0, 0], b: [10, 0], c: [10, 10], d: [0, 10] })).ok).toBe(
      true,
    );
    expect(check('general-position', SQUARE).ok).toBe(false);

    const line = scene({ a: [0, 0], b: [10, 10], c: [20, 20] });
    const result = check('general-position', line);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(['a', 'b', 'c']);
  });

  it('convex-position: điểm nằm trong là vi phạm', () => {
    const result = check('convex-position', SQUARE);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(['m']);
  });

  it('hull-size:<k> có tham số', () => {
    expect(check('hull-size:4', SQUARE).ok).toBe(true);
    expect(check('hull-size:5', SQUARE).ok).toBe(false);
  });

  it('lattice kiểm theo **nút lưới đã khai**, không phải toạ độ nguyên', () => {
    // Toạ độ scene là 10× toạ độ toán, nên (5,5) nguyên nhưng nằm giữa hai nút.
    // Kiểm `Number.isInteger` sẽ cho nó qua và cả lập luận chẵn lẻ sụp theo.
    const off = scene({ a: [0, 0], b: [5, 5] }, [], { grid: 10 });
    const result = check('lattice', off);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(['b']);
  });

  it('lattice bỏ qua khi scene không khai lưới', () => {
    expect(check('lattice', scene({ a: [0.5, 0.5] })).ok).toBe(true);
  });

  it('id lạ trả null thay vì im lặng cho qua', () => {
    expect(resolvePointValidator('khong-co')).toBeNull();
  });
});

describe('bound', () => {
  const codes = (s: Scene): string[] =>
    pointSchemaFragment.checkBounds(s, '').map((i) => i.code);

  it('bắt đoạn trỏ tới điểm không tồn tại', () => {
    const broken = scene({ a: [0, 0] }, [['a', 'zzz']]);
    expect(codes(broken)).toContain('bounds/unknown-point-ref');
  });

  it('bắt hai điểm trùng toạ độ', () => {
    // Hai điểm chồng nhau nhìn ra một điểm, và mọi phép đếm lệch theo.
    expect(codes(scene({ a: [0, 0], b: [0, 0] }))).toContain('bounds/duplicate-position');
  });

  it('không sinh element ngầm định nào', () => {
    // Giao điểm trông như vật thể nhưng không có danh tính ổn định: dời một
    // điểm là nó biến mất, và anchor trỏ vào đó sẽ rot im lặng.
    expect(pointSchemaFragment.implicitElementIds(SQUARE).size).toBe(0);
  });
});

describe('command và hit test', () => {
  const run = (s: Scene, type: string, params: unknown): Scene | null => {
    const r = execute(createEditorState(s), pointCommands, command(type, params));
    return r.applied ? r.state.scene : null;
  };

  it('dời điểm', () => {
    const after = run(SQUARE, 'point/move', { id: 'm', to: [40, 40] })!;
    expect(tryEvaluate('hull', pointEnvironment(after), DETERMINISTIC_BUDGET).value).toBe(4);
    // m nay nằm ngoài, nên nó phải thành đỉnh bao và một đỉnh cũ rơi vào trong.
    expect(tryEvaluate('inside', pointEnvironment(after), DETERMINISTIC_BUDGET).value).toBe(1);
  });

  it('nối rồi bỏ đoạn', () => {
    const on = run(SQUARE, 'point/toggle-segment', { a: 'a', b: 'c' })!;
    expect(on.elements.filter((e) => e.type === 'segment')).toHaveLength(1);

    const off = run(on, 'point/toggle-segment', { a: 'c', b: 'a' })!;
    expect(off.elements.filter((e) => e.type === 'segment')).toHaveLength(0);
  });

  it('từ chối nối điểm không tồn tại hoặc nối chính nó', () => {
    expect(run(SQUARE, 'point/toggle-segment', { a: 'a', b: 'a' })).toBeNull();
    expect(run(SQUARE, 'point/toggle-segment', { a: 'a', b: 'zzz' })).toBeNull();
  });

  it('chạm trúng điểm gần nhất', () => {
    expect(pointHitTest(SQUARE, { x: 0.4, y: 0.4 })).toEqual(['a']);
    expect(pointHitTest(SQUARE, { x: 50, y: 50 })).toEqual([]);
  });
});

describe('renderer', () => {
  const renderer = createRenderer([pointRenderer]);
  const ctx = createContext(defaultTheme);

  const keysOf = (s: Scene): string[] => {
    const out: string[] = [];
    walk(renderer.render(s, ctx), (node) => {
      if (node.key !== undefined) out.push(node.key);
    });
    return out;
  };

  it('mỗi điểm và mỗi đoạn là một node có key', () => {
    const s = scene({ a: [0, 0], b: [10, 0] }, [['a', 'b']]);
    expect(keysOf(s).sort()).toEqual(['a', 'b', 's-ab']);
  });

  it('key duy nhất toàn cây', () => {
    const keys = keysOf(SQUARE);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lưới quá dày thì **không vẽ** thay vì treo trình duyệt', () => {
    const dense = scene({ a: [0, 0], b: [1000, 1000] }, [], { grid: 0.5 });
    const svg = renderer.toSvg(dense, ctx);
    expect((svg.match(/<line/g) ?? []).length).toBe(0);
  });

  it('hình thuần: cùng scene cho cùng chuỗi', () => {
    expect(renderer.toSvg(SQUARE, ctx)).toBe(renderer.toSvg(SQUARE, ctx));
  });
});

describe('đường thẳng (PT-01)', () => {
  const renderer = createRenderer([pointRenderer]);
  const ctx = createContext(defaultTheme);

  const withLine: Scene = {
    engine: 'point',
    config: {},
    elements: [
      { id: 'a', type: 'point', pos: [0, 0] },
      { id: 'b', type: 'point', pos: [10, 0] },
      { id: 'c', type: 'point', pos: [5, 20] },
      { id: 'L', type: 'line', a: 'a', b: 'b' },
    ],
  };

  it('kéo dài quá khung hình, không dừng ở hai điểm', () => {
    // Cả một họ lập luận nói "đường này chia mặt phẳng làm hai nửa"; một gạch
    // ngắn nằm giữa hai chấm thì không cho người đọc thấy điều đó.
    const nodes: { key?: string; attrs: Record<string, unknown> }[] = [];
    walk(renderer.render(withLine, ctx), (node) => nodes.push(node));
    const line = nodes.find((node) => node.key === 'L');
    const viewport = renderer.viewportOf(withLine);

    expect(line).toBeDefined();
    expect(Number(line!.attrs['x1'])).toBeLessThan(viewport.x);
    expect(Number(line!.attrs['x2'])).toBeGreaterThan(viewport.x + viewport.width);
  });

  it('đường thẳng **không** tham gia đếm giao điểm', () => {
    // `intersections` đếm giao của các đoạn mà bài dựng ra; một đường kẻ phụ để
    // minh hoạ lập luận không phải một trong số đó.
    const crossed: Scene = {
      ...withLine,
      elements: [...withLine.elements, { id: 's', type: 'segment', a: 'a', b: 'c' }],
    };
    expect(evalOn(crossed, 'intersections')).toBe(0);
  });

  it('đường trỏ tới điểm không tồn tại vẫn bị bắt', () => {
    const broken: Scene = {
      ...withLine,
      elements: [
        ...withLine.elements.filter((e) => e.id !== 'L'),
        { id: 'L', type: 'line', a: 'a', b: 'zzz' },
      ],
    };
    expect(pointSchemaFragment.checkBounds(broken, '').map((i) => i.code)).toContain(
      'bounds/unknown-point-ref',
    );
  });
});
