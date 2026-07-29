import { describe, expect, it } from 'vitest';
import { command, createEditorState, execute } from '@combviz/editor';
import { tryEvaluate, DETERMINISTIC_BUDGET } from '@combviz/dsl';
import { createContext, createRenderer, walk } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import {
  gameCommands,
  gameEnvironment,
  gameHitTest,
  gameRenderer,
  gameSchemaFragment,
  resolveGameValidator,
  type GameRule,
} from '../src/index.js';

const NIM: GameRule = { type: 'subtract', min: 1 };
const TAKE_1_3: GameRule = { type: 'subtract', min: 1, max: 3 };

const scene = (counts: readonly number[], config: Record<string, unknown> = {}): Scene => ({
  engine: 'game',
  config: { rule: NIM, ...config },
  elements: counts.map((count, i) => ({ id: `p${i}`, type: 'pile', count })),
});

const evalOn = (s: Scene, expr: string): unknown =>
  tryEvaluate(expr, gameEnvironment(s), DETERMINISTIC_BUDGET).value;

describe('DSL', () => {
  it('binding cơ bản', () => {
    const s = scene([1, 2, 3]);
    expect(evalOn(s, 'n')).toBe(3);
    expect(evalOn(s, 'total')).toBe(6);
    expect(evalOn(s, 'xor')).toBe(0);
    expect(evalOn(s, 'winning')).toBe(false);
  });

  it('`winning` là boolean **tính bằng máy**, không phải khẳng định gõ tay', () => {
    expect(evalOn(scene([1, 2, 4]), 'winning')).toBe(true);
    expect(evalOn(scene([12], { rule: TAKE_1_3 }), 'winning')).toBe(false);
  });

  it('`winning_moves` khớp với `winning`', () => {
    const s = scene([1, 2, 4]);
    expect(evalOn(s, 'winning_moves')).toBe(1);
    expect(evalOn(scene([1, 2, 3]), 'winning_moves')).toBe(0);
  });

  it('giá trị Grundy đọc được trên từng đống', () => {
    expect(evalOn(scene([5, 3], { rule: TAKE_1_3 }), 'sum(piles, p => p.grundy)')).toBe(
      1 + 3,
    );
  });

  it('misère cho kết quả khác luật thường', () => {
    expect(evalOn(scene([1]), 'winning')).toBe(true);
    expect(evalOn(scene([1], { misere: true }), 'winning')).toBe(false);
  });
});

describe('validator', () => {
  const check = (id: string, s: Scene) => resolveGameValidator(id)!.check(s);

  it('hand-opponent-a-loss đạt đúng khi thế là thế thua', () => {
    expect(check('hand-opponent-a-loss', scene([1, 2, 3])).ok).toBe(true);
    expect(check('hand-opponent-a-loss', scene([1, 2, 4])).ok).toBe(false);
  });

  it('no-empty-pile chỉ ra đúng đống rỗng', () => {
    const result = check('no-empty-pile', scene([3, 0, 2]));
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(['p1']);
  });

  it('total:<k> có tham số', () => {
    expect(check('total:6', scene([1, 2, 3])).ok).toBe(true);
    expect(check('total:7', scene([1, 2, 3])).ok).toBe(false);
  });

  it('id lạ trả null thay vì im lặng cho qua', () => {
    expect(resolveGameValidator('khong-co')).toBeNull();
  });
});

describe('lệnh đi — tự kiểm luật', () => {
  const run = (s: Scene, type: string, params: unknown): Scene | null => {
    const r = execute(createEditorState(s), gameCommands, command(type, params));
    return r.applied ? r.state.scene : null;
  };

  it('bốc hợp lệ thì đi được', () => {
    const after = run(scene([5], { rule: TAKE_1_3 }), 'game/take', {
      pile: 'p0',
      count: 3,
    })!;
    expect(evalOn(after, 'total')).toBe(2);
  });

  it('**từ chối** nước vượt luật', () => {
    // Nếu lệnh cho sửa số viên tuỳ ý thì người học "thắng" bằng một nước không
    // tồn tại, và sandbox mất hết ý nghĩa.
    expect(run(scene([5], { rule: TAKE_1_3 }), 'game/take', { pile: 'p0', count: 4 })).toBeNull();
    expect(run(scene([5], { rule: TAKE_1_3 }), 'game/take', { pile: 'p0', count: 0 })).toBeNull();
    expect(run(scene([2], { rule: TAKE_1_3 }), 'game/take', { pile: 'p0', count: 3 })).toBeNull();
  });

  it('chia đống chỉ nhận hai phần khác nhau', () => {
    const SPLIT = { rule: { type: 'split-unequal' } as GameRule };
    const after = run(scene([6], SPLIT), 'game/split', { pile: 'p0', first: 2 })!;
    expect(after.elements.filter((e) => e.type === 'pile')).toHaveLength(2);
    expect(evalOn(after, 'total')).toBe(6);

    // 3+3 không hợp lệ.
    expect(run(scene([6], SPLIT), 'game/split', { pile: 'p0', first: 3 })).toBeNull();
  });

  it('chạm trúng cột đống theo toạ độ', () => {
    expect(gameHitTest(scene([3, 4, 5]), { x: 15, y: 5 })).toEqual(['p1']);
    expect(gameHitTest(scene([3]), { x: 95, y: 5 })).toEqual([]);
  });
});

describe('bound', () => {
  const codes = (s: Scene): string[] =>
    gameSchemaFragment.checkBounds(s, '').map((i) => i.code);

  it('thiếu `rule` là lỗi, không phải mặc định êm', () => {
    const noRule: Scene = { engine: 'game', config: {}, elements: [] };
    expect(codes(noRule)).toContain('bounds/missing-rule');
  });

  it('đống quá lớn bị chặn trước khi solver chạy', () => {
    expect(codes(scene([500]))).toContain('bounds/pile-too-large');
  });

  it('`spectrum` không dùng được với luật chia đống', () => {
    const bad = scene([6], { view: 'spectrum', rule: { type: 'split-unequal' } });
    expect(codes(bad)).toContain('bounds/spectrum-needs-subtract-rule');
  });

  it('`spectrum` sinh element ngầm định cho từng thế', () => {
    const ids = gameSchemaFragment.implicitElementIds(
      scene([8], { view: 'spectrum', spectrum_to: 12 }),
    );
    expect(ids.has('pos-0')).toBe(true);
    expect(ids.size).toBe(13);
  });

  it('view `piles` không sinh element ngầm định nào', () => {
    expect(gameSchemaFragment.implicitElementIds(scene([3, 4])).size).toBe(0);
  });
});

describe('renderer', () => {
  const renderer = createRenderer([gameRenderer]);
  const ctx = createContext(defaultTheme);

  const keysOf = (s: Scene): string[] => {
    const out: string[] = [];
    walk(renderer.render(s, ctx), (node) => {
      if (node.key !== undefined) out.push(node.key);
    });
    return out;
  };

  it('mỗi đống là một node có key', () => {
    expect(keysOf(scene([3, 4]))).toEqual(['p0', 'p1']);
  });

  it('key duy nhất toàn cây ở cả hai view', () => {
    for (const s of [scene([3, 4]), scene([8], { view: 'spectrum', spectrum_to: 20 })]) {
      const keys = keysOf(s);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('`spectrum` tô đúng những thế thua', () => {
    // Bốc 1..3: thua ở bội của 4. Ô thua tô màu, ô thắng để nền trung tính.
    const svg = renderer.toSvg(
      scene([12], { view: 'spectrum', spectrum_to: 12, rule: TAKE_1_3 }),
      ctx,
    );
    const neutral = defaultTheme.surface.neutral;
    const cells = [...svg.matchAll(/<rect[^>]*fill="([^"]+)"[^>]*>/g)].map((m) => m[1]);

    // 13 ô (0..12), trong đó 0,4,8,12 tô màu ⇒ 9 ô nền trung tính. Cộng nền canvas.
    expect(cells.filter((c) => c === neutral)).toHaveLength(9);
  });

  it('đống quá cao hiện số thay vì vẽ từng viên — và **không vẽ viên nào**', () => {
    // Ngưỡng cũ vẽ 24 chấm rồi dán nhãn "40" lên dưới. Test cũ (`<= 24`) xanh,
    // hình thì nói dối: ai đếm sẽ ra 24. Ba viên trên + ba chấm ⋮ + một viên đáy = 7 hình tròn, không bao giờ là 24
    // hay 40; ký hiệu lược thì không mời ai đếm.
    const svg = renderer.toSvg(scene([40]), ctx);
    expect((svg.match(/<circle/g) ?? []).length).toBe(7);
    expect(svg).toContain('>40<');
  });

  it('dưới ngưỡng thì vẽ **đủ** số viên, đếm được', () => {
    for (const n of [1, 7, 13, 24]) {
      expect((renderer.toSvg(scene([n]), ctx).match(/<circle/g) ?? []).length).toBe(n);
    }
  });

  it('viewport ôm sát hình, không chừa khoảng trống to hơn lề', () => {
    // Lỗi cũ: viewport dựng đứng gấp đôi hình, sỏi nằm lọt thỏm dưới đáy. Không
    // test nào bắt được vì chẳng có gì *sai* — chỉ nhìn mới thấy.
    for (const s of [scene([3, 5, 7]), scene([40]), scene([1])]) {
      const view = gameRenderer.defaultViewport(s);
      const svg = renderer.toSvg(s, ctx);
      const ys = [...svg.matchAll(/\b(?:cy|y)="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
      const top = Math.min(...ys);
      const bottom = Math.max(...ys);
      // Lề trên và lề dưới đều không quá 8 đơn vị scene (PADDING = 4 cộng nét).
      expect(top - view.y).toBeLessThan(8);
      expect(view.y + view.height - bottom).toBeLessThan(8);
    }
  });

  it('hình thuần: cùng scene cho cùng chuỗi', () => {
    const s = scene([3, 4, 5]);
    expect(renderer.toSvg(s, ctx)).toBe(renderer.toSvg(s, ctx));
  });
});
