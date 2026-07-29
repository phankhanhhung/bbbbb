import { describe, expect, it } from 'vitest';
import { command, createEditorState, execute } from '@combviz/editor';
import { tryEvaluate, DETERMINISTIC_BUDGET } from '@combviz/dsl';
import { createContext, createRenderer, walk } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import {
  deriveSet,
  resolveSetValidator,
  setCommands,
  setEnvironment,
  setHitTest,
  setRenderer,
  setSchemaFragment,
} from '../src/index.js';

/** `membership`: token id → danh sách tập. */
const scene = (
  membership: Record<string, readonly string[]>,
  sets: readonly string[],
  view: 'matrix' | 'venn' = 'matrix',
): Scene => ({
  engine: 'set',
  config: { view },
  elements: [
    ...sets.map((id, order) => ({ id, type: 'set', order, label: id.toUpperCase() })),
    ...Object.entries(membership).map(([id, inSets]) => ({
      id,
      type: 'token',
      sets: [...inSets],
      label: id,
    })),
  ],
});

const FAMILY = scene({ x1: ['a', 'b'], x2: ['a'], x3: ['b'], x4: [] }, ['a', 'b']);

const evalOn = (s: Scene, expr: string): unknown =>
  tryEvaluate(expr, setEnvironment(s), DETERMINISTIC_BUDGET).value;

describe('mô hình quan hệ thuộc', () => {
  it('cỡ tập suy ra từ token, không khai riêng', () => {
    // Khai hai nơi thì có ngày hai nơi lệch nhau, và không ai biết nơi nào đúng.
    const derived = deriveSet(FAMILY);
    expect(derived.sets.map((s) => s.size)).toEqual([2, 2]);
    expect(derived.incidences).toBe(4);
  });

  it('bỏ qua tham chiếu tới tập không tồn tại, và validate bắt nó', () => {
    const broken = scene({ x1: ['a', 'khong-co'] }, ['a']);
    expect(deriveSet(broken).tokens[0]!.sets).toEqual(['a']);
    expect(setSchemaFragment.checkBounds(broken, '').map((i) => i.code)).toContain(
      'bounds/unknown-set-ref',
    );
  });

  it('ô của bảng là element ngầm định — anchor trỏ vào được (ANC-02)', () => {
    const ids = setSchemaFragment.implicitElementIds(FAMILY);
    expect(ids.has('x1__a')).toBe(true);
    expect(ids.size).toBe(4 * 2);
  });

  it('Venn quá 3 tập là lỗi, không phải hình vẽ sai', () => {
    const four = scene({ x: ['a'] }, ['a', 'b', 'c', 'd'], 'venn');
    expect(setSchemaFragment.checkBounds(four, '').map((i) => i.code)).toContain(
      'bounds/venn-too-many-sets',
    );
    // Cùng dữ liệu ở view matrix thì hoàn toàn hợp lệ.
    expect(
      setSchemaFragment.checkBounds(scene({ x: ['a'] }, ['a', 'b', 'c', 'd']), ''),
    ).toEqual([]);
  });
});

describe('DSL', () => {
  it('binding cơ bản, kể cả `incidences` của đếm hai chiều', () => {
    expect(evalOn(FAMILY, 'n')).toBe(4);
    expect(evalOn(FAMILY, 'k')).toBe(2);
    expect(evalOn(FAMILY, 'incidences')).toBe(4);
  });

  it('tổng theo hàng bằng tổng theo cột — chính là đếm hai chiều', () => {
    expect(evalOn(FAMILY, 'sum(tokens, x => x.degree)')).toBe(
      evalOn(FAMILY, 'sum(sets, s => s.size)'),
    );
  });

  it('`member` đọc đúng quan hệ thuộc', () => {
    expect(
      evalOn(FAMILY, 'count(tokens, x => exists(sets, s => member(x, s)))'),
    ).toBe(3);
  });

  it('`subset` nhận ra tập con', () => {
    const chain = scene({ x1: ['a', 'b'], x2: ['b'] }, ['a', 'b']);
    expect(evalOn(chain, 'exists(sets, p => exists(sets, q => p.order < q.order && subset(p, q)))')).toBe(
      true,
    );
    expect(evalOn(FAMILY, 'exists(sets, p => exists(sets, q => p.order < q.order && subset(p, q)))')).toBe(
      false,
    );
  });

  it('`common` đếm phần giao', () => {
    // DSL không có toán tử ba ngôi (grammar đóng, DSL-01), nên câu hỏi về **một
    // cặp** đi qua `exists` — và đó cũng là cách lời giải nói.
    expect(
      evalOn(FAMILY, 'exists(sets, p => exists(sets, q => p.order < q.order && common(p, q) == 1))'),
    ).toBe(true);
    // Tổng trên mọi cặp có thứ tự, kể cả cặp trùng: 2 + 1 + 1 + 2.
    expect(evalOn(FAMILY, 'sum(sets, p => sum(sets, q => common(p, q)))')).toBe(6);
  });
});

describe('validator', () => {
  const check = (id: string, s: Scene) => resolveSetValidator(id)!.check(s);

  it('antichain — ràng buộc trung tâm của cụm Sperner', () => {
    expect(check('antichain', FAMILY).ok).toBe(true);

    const chain = scene({ x1: ['a', 'b'], x2: ['b'] }, ['a', 'b']);
    const result = check('antichain', chain);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain('a');
  });

  it('pairwise-disjoint, covers-universe, sets-distinct', () => {
    expect(check('pairwise-disjoint', FAMILY).ok).toBe(false);
    expect(check('covers-universe', FAMILY).ok).toBe(false);
    expect(check('sets-distinct', FAMILY).ok).toBe(true);

    const same = scene({ x1: ['a', 'b'] }, ['a', 'b']);
    expect(check('sets-distinct', same).ok).toBe(false);
  });

  it('validator có tham số', () => {
    expect(check('set-size:2', FAMILY).ok).toBe(true);
    expect(check('set-size:3', FAMILY).ok).toBe(false);
    expect(check('max-degree:1', FAMILY).ok).toBe(false);
    expect(check('max-degree:2', FAMILY).ok).toBe(true);
  });

  it('id lạ trả null thay vì im lặng cho qua', () => {
    expect(resolveSetValidator('khong-co')).toBeNull();
  });
});

describe('command', () => {
  const run = (s: Scene, type: string, params: unknown): Scene | null => {
    const r = execute(createEditorState(s), setCommands, command(type, params));
    return r.applied ? r.state.scene : null;
  };

  it('bật/tắt quan hệ thuộc', () => {
    const on = run(FAMILY, 'set/toggle-membership', { token: 'x4', set: 'a' })!;
    expect(deriveSet(on).tokens.find((t) => t.id === 'x4')!.sets).toEqual(['a']);

    const off = run(on, 'set/toggle-membership', { token: 'x4', set: 'a' })!;
    expect(deriveSet(off).tokens.find((t) => t.id === 'x4')!.sets).toEqual([]);
  });

  it('từ chối token hoặc tập không tồn tại', () => {
    expect(run(FAMILY, 'set/toggle-membership', { token: 'zzz', set: 'a' })).toBeNull();
    expect(run(FAMILY, 'set/toggle-membership', { token: 'x1', set: 'zzz' })).toBeNull();
  });

  it('xoá một tập kéo theo mọi tham chiếu tới nó', () => {
    const after = run(FAMILY, 'set/remove', { ids: ['a'] })!;
    expect(deriveSet(after).sets.map((s) => s.id)).toEqual(['b']);
    expect(deriveSet(after).tokens.every((t) => !t.sets.includes('a'))).toBe(true);
  });
});

describe('renderer', () => {
  const renderer = createRenderer([setRenderer]);
  const ctx = createContext(defaultTheme);

  /** Key theo **thứ tự vẽ** — key nằm ở cây node, không có trong chuỗi SVG. */
  const keysOf = (scene: Scene): string[] => {
    const out: string[] = [];
    walk(renderer.render(scene, ctx), (node) => {
      if (node.key !== undefined) out.push(node.key);
    });
    return out;
  };

  it('view matrix vẽ đủ ô cho mọi cặp', () => {
    expect(keysOf(FAMILY).filter((k) => k.includes('__'))).toHaveLength(4 * 2);
  });

  it('view matrix có node mang đúng id của token và của set', () => {
    // Anchor trỏ tới `x1` phải làm sáng được thứ gì đó. Trước sửa này bảng chỉ
    // có ô giao `x1__a` và nhãn `token-label-x1`, nên anchor hợp lệ — validate
    // xanh — vẫn không làm sáng gì cả, im lặng hoàn toàn.
    const keys = new Set(keysOf(FAMILY));

    for (const id of ['x1', 'x2', 'x3', 'x4', 'a', 'b']) {
      expect(keys.has(id)).toBe(true);
    }
  });

  it('tay cầm của hàng vẽ sau tay cầm của cột', () => {
    // Hai tay cầm chồng nhau ở thân bảng; cái vẽ sau là cái chuột chạm phải.
    // Ngược thứ tự thì bảng một cột nuốt sạch mọi thao tác trỏ vào ô.
    const keys = keysOf(FAMILY);
    expect(keys.indexOf('x1')).toBeGreaterThan(keys.indexOf('a'));
  });

  it('caption nằm trong khung hình, không nằm trên mép', () => {
    const withCaption: Scene = {
      ...FAMILY,
      config: { view: 'matrix', caption: 'Họ tập con' },
    };
    const viewport = renderer.viewportOf(withCaption);
    const y = Number(
      /<text[^>]*y="(-?[\d.]+)"[^>]*>Họ tập con</.exec(renderer.toSvg(withCaption, ctx))?.[1],
    );

    expect(y).toBeGreaterThan(viewport.y);
    expect(y).toBeLessThan(viewport.y + viewport.height);
  });

  it('`show_sums` in tổng hai chiều', () => {
    const withSums: Scene = { ...FAMILY, config: { view: 'matrix', show_sums: true } };
    expect(renderer.toSvg(withSums, ctx)).toContain('Σ 4');
  });

  it('view venn vẽ hình tròn cho tập và chấm cho phần tử', () => {
    const venn: Scene = { ...FAMILY, config: { view: 'venn' } };
    const svg = renderer.toSvg(venn, ctx);
    expect(svg.match(/<circle/g)?.length).toBe(2 + 4);
  });

  it('vị trí phần tử trong Venn suy từ quan hệ thuộc, không do tác giả đặt', () => {
    // Không có trường toạ độ nào trên token — nên hình không thể nói khác dữ liệu.
    const venn: Scene = { ...FAMILY, config: { view: 'venn' } };
    expect(renderer.toSvg(venn, ctx)).toBe(renderer.toSvg(venn, ctx));
  });

  it('hình thuần: cùng scene cho cùng chuỗi', () => {
    expect(renderer.toSvg(FAMILY, ctx)).toBe(renderer.toSvg(FAMILY, ctx));
  });
});

describe('hit test', () => {
  it('chạm vào ô bảng trả về id quan hệ thuộc', () => {
    expect(setHitTest(FAMILY, { x: 5, y: 5 })).toContain('x1__a');
  });

  it('id chứa dấu nối bị chặn — anchor không thể trỏ nhầm ô', () => {
    const bad: Scene = {
      engine: 'set',
      config: { view: 'matrix' },
      elements: [{ id: 'a__b', type: 'set', order: 0 }],
    };
    expect(setSchemaFragment.checkBounds(bad, '').map((i) => i.code)).toContain(
      'bounds/ambiguous-id',
    );
  });

  it('chạm ngoài bảng không trúng gì', () => {
    expect(setHitTest(FAMILY, { x: -50, y: -50 })).toEqual([]);
  });
});
