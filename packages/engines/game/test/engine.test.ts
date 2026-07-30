import { describe, expect, it } from 'vitest';
import { command, createEditorState, execute } from '@combviz/editor';
import { tryEvaluate, DETERMINISTIC_BUDGET } from '@combviz/dsl';
import { createContext, createRenderer, estimateTextWidth, walk } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import {
  gameCommands,
  gameEnvironment,
  gameHitTest,
  gameRenderer,
  gameSchemaFragment,
  gameTools,
  losingGrid,
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

/**
 * Ba họ luật mới ở mức engine: lệnh, thanh công cụ, bound, hình.
 *
 * `solver.test.ts` đã khoá phần toán. Ở đây kiểm phần mà người học chạm vào — và
 * đúng những chỗ M19/M20 dạy là hay lệch âm thầm: một nút không có lệnh, một lệnh
 * không có nút, một hình vẽ ra con số nó không có cơ sở để biết.
 */
const WYTHOFF: GameRule = {
  type: 'union',
  of: [{ type: 'subtract', min: 1 }, { type: 'subtract-equal-pair' }],
};
const EUCLID: GameRule = { type: 'subtract-multiple-of-other' };
const LASKER: GameRule = {
  type: 'union',
  of: [{ type: 'subtract', min: 1 }, { type: 'split-any' }],
};

describe('thanh công cụ khớp luật', () => {
  const ids = (s: Scene): string[] => gameTools(s).map((t) => t.id);

  it('Wythoff có **cả hai** kiểu nút, và nút chéo đòi hai lần bấm', () => {
    const tools = gameTools(scene([3, 5], { rule: WYTHOFF }));
    expect(ids(scene([3, 5], { rule: WYTHOFF }))).toEqual([
      'select',
      'take-1',
      'take-2',
      'take-3',
      'take-4',
      'take-5',
      'take-both-1',
      'take-both-2',
      'take-both-3',
    ]);
    const diagonal = tools.find((t) => t.id === 'take-both-2');
    expect(diagonal?.action).toEqual({
      type: 'two',
      command: 'game/take-both',
      params: ['pile_a', 'pile_b'],
      extra: { count: 2 },
    });
  });

  it('trò Euclid: số nút đọc **đống kia**, không đọc đống mình', () => {
    // $(25,7)$ bốc được $7, 14, 21$ — ba nút, và cả ba là bội của $7$.
    expect(ids(scene([25, 7], { rule: EUCLID }))).toEqual([
      'select',
      'take-7',
      'take-14',
      'take-21',
    ]);
    // Đổi đống bên kia thì danh sách nút đổi theo, dù đống bị bốc không đổi.
    expect(ids(scene([25, 4], { rule: EUCLID }))).toEqual([
      'select',
      'take-4',
      'take-8',
      'take-12',
      'take-16',
      'take-20',
      'take-24',
    ]);
  });

  it('Nim Lasker có nút bốc **và** nút chia trong cùng một thanh', () => {
    // Bản trước `return` ngay ở nhánh chia, nên hợp "bốc hoặc chia" sẽ mất hẳn
    // một nửa số nút mà không ai báo gì.
    expect(ids(scene([4], { rule: LASKER }))).toEqual([
      'select',
      'take-1',
      'take-2',
      'take-3',
      'take-4',
      'split-1',
      'split-2',
    ]);
    expect(gameTools(scene([4], { rule: LASKER })).map((t) => t.label)).toContain('Chia 2 + 2');
  });

  it('view `spectrum` **không** bày nút nào — ở đó không vẽ đống nào', () => {
    expect(ids(scene([12], { view: 'spectrum', rule: TAKE_1_3 }))).toEqual(['select']);
  });

  it('mọi nút đều gọi một lệnh **có trong registry**', () => {
    for (const rule of [NIM, TAKE_1_3, WYTHOFF, EUCLID, LASKER, { type: 'split-unequal' }]) {
      for (const tool of gameTools(scene([6, 4], { rule }))) {
        if (tool.action.type === 'select') continue;
        expect({ rule, command: (tool.action as { command: string }).command }).toEqual({
          rule,
          command: expect.stringMatching(/^game\//) as unknown as string,
        });
        expect(gameCommands[(tool.action as { command: string }).command]).toBeDefined();
      }
    }
  });
});

describe('lệnh bốc hai đống (GM-05)', () => {
  const run = (s: Scene, type: string, params: unknown): Scene | null => {
    const r = execute(createEditorState(s), gameCommands, command(type, params));
    return r.applied ? r.state.scene : null;
  };
  const counts = (s: Scene): number[] =>
    s.elements
      .filter((e) => e.type === 'pile')
      .map((e) => (e as unknown as { count: number }).count);

  it('bốc bằng nhau ở hai đống thì đi được', () => {
    const after = run(scene([10, 15], { rule: WYTHOFF }), 'game/take-both', {
      pile_a: 'p0',
      pile_b: 'p1',
      count: 2,
    })!;
    expect(counts(after)).toEqual([8, 13]);
  });

  it('thứ tự hai id **không** quan trọng', () => {
    const after = run(scene([10, 15], { rule: WYTHOFF }), 'game/take-both', {
      pile_a: 'p1',
      pile_b: 'p0',
      count: 2,
    })!;
    expect(counts(after)).toEqual([8, 13]);
  });

  it('từ chối khi vượt đống nhỏ, khi trùng id, và khi luật không cho', () => {
    const w = scene([3, 5], { rule: WYTHOFF });
    expect(run(w, 'game/take-both', { pile_a: 'p0', pile_b: 'p1', count: 4 })).toBeNull();
    expect(run(w, 'game/take-both', { pile_a: 'p0', pile_b: 'p0', count: 1 })).toBeNull();
    // Nim thường không có nước chéo, nên lệnh phải từ chối chứ không im lặng đi.
    expect(
      run(scene([3, 5]), 'game/take-both', { pile_a: 'p0', pile_b: 'p1', count: 1 }),
    ).toBeNull();
  });

  it('trò Euclid: `game/take` chỉ nhận bội của đống kia', () => {
    const e = scene([25, 7], { rule: EUCLID });
    expect(counts(run(e, 'game/take', { pile: 'p0', count: 14 })!)).toEqual([11, 7]);
    expect(run(e, 'game/take', { pile: 'p0', count: 13 })).toBeNull();
    expect(run(e, 'game/take', { pile: 'p1', count: 1 })).toBeNull();
  });

  it('Nim Lasker: chia thành hai phần **bằng nhau** được', () => {
    const after = run(scene([4], { rule: LASKER }), 'game/split', { pile: 'p0', first: 2 })!;
    expect(counts(after)).toEqual([2, 2]);
    // Trò Grundy thì không — cùng một scene, khác luật, khác đáp.
    expect(
      run(scene([4], { rule: { type: 'split-unequal' } }), 'game/split', {
        pile: 'p0',
        first: 2,
      }),
    ).toBeNull();
  });
});

describe('bound của luật mới', () => {
  const codes = (s: Scene): string[] =>
    gameSchemaFragment.checkBounds(s, '').map((i) => i.code);

  it('`show_grundy` bị chặn khi Sprague–Grundy không áp dụng', () => {
    expect(codes(scene([3, 5], { rule: WYTHOFF, show_grundy: true }))).toContain(
      'bounds/grundy-not-applicable',
    );
    expect(codes(scene([3, 5], { misere: true, show_grundy: true }))).toContain(
      'bounds/grundy-not-applicable',
    );
    // Luật hợp vẫn cục bộ ⇒ vẫn có Grundy ⇒ không chặn.
    expect(codes(scene([3, 5], { rule: LASKER, show_grundy: true }))).not.toContain(
      'bounds/grundy-not-applicable',
    );
  });

  it('`spectrum` bị chặn cho **mọi** luật phổ không đọc được', () => {
    for (const rule of [WYTHOFF, EUCLID, LASKER, { type: 'split-any' }]) {
      expect(codes(scene([6, 4], { view: 'spectrum', rule }))).toContain(
        'bounds/spectrum-needs-subtract-rule',
      );
    }
  });

  it('luật toàn cục trên thế quá lớn bị chặn **lúc soạn**', () => {
    expect(codes(scene([120, 120, 120], { rule: WYTHOFF }))).toContain(
      'bounds/state-space-too-large',
    );
    // Cùng thế ấy với luật cục bộ thì không sao: bảng Grundy là $O(n)$.
    expect(codes(scene([120, 120, 120]))).toEqual([]);
  });
});

describe('hình của luật mới', () => {
  const renderer = createRenderer([gameRenderer]);
  const ctx = createContext(defaultTheme);

  it('phổ của luật toàn cục **nói ra** là không vẽ được, thay vì tô sạch một màu', () => {
    const svg = renderer.toSvg(scene([3, 5], { view: 'spectrum', rule: WYTHOFF }), ctx);
    expect(svg).toContain('Phổ một chiều không mô tả được luật này');
    // Đúng một `<rect>`: nền canvas. Không có ô phổ nào — không có ô nào để tô.
    expect((svg.match(/<rect/g) ?? []).length).toBe(1);
  });

  it('`g=` không hiện khi không có cơ sở để biết', () => {
    expect(renderer.toSvg(scene([3, 5], { show_grundy: true }), ctx)).toContain('g=');
    expect(
      renderer.toSvg(scene([3, 5], { rule: WYTHOFF, show_grundy: true }), ctx),
    ).not.toContain('g=');
  });

  it('chạm khớp **dải thật** của từng cột, kể cả cột nhiều dãy', () => {
    // Cột 20 viên xếp thành bốn dãy nên rộng hơn `SLOT`. Bản trước chia đều theo
    // 10 đơn vị, nên từ cột thứ hai trở đi chạm lệch dần — vô hình cho tới khi có
    // một công cụ cần **hai** đống.
    //
    // Test không gõ cứng toạ độ biên: nó đọc **chỗ sỏi thật sự được vẽ** rồi chạm
    // vào đó. Gõ cứng thì mỗi lần chỉnh khoảng cách lại phải sửa test, và một test
    // phải sửa theo code thì không còn kiểm được code.
    for (const s of [
      scene([20, 20, 3], { rule: WYTHOFF }),
      scene([1, 25, 4], { rule: WYTHOFF }),
      scene([7]),
    ]) {
      for (const el of s.elements) {
        const xs: number[] = [];
        walk(renderer.render(s, ctx), (node) => {
          if (node.key !== el.id) return;
          walk([node], (inner) => {
            if (inner.tag === 'circle') xs.push(Number(inner.attrs?.['cx']));
          });
        });
        expect({ id: el.id, drawn: xs.length > 0 }).toEqual({ id: el.id, drawn: true });
        const centre = xs.reduce((a, b) => a + b, 0) / xs.length;
        expect({ id: el.id, hit: gameHitTest(s, { x: centre, y: 5 }) }).toEqual({
          id: el.id,
          hit: [el.id],
        });
      }
    }

    // Ngoài mọi dải thì không trúng gì, chứ không trúng đống gần nhất.
    const s = scene([20, 20, 3], { rule: WYTHOFF });
    expect(gameHitTest(s, { x: 200, y: 5 })).toEqual([]);
    expect(gameHitTest(s, { x: -1, y: 5 })).toEqual([]);
  });

  it('view `spectrum` không trả id đống nào khi chạm', () => {
    expect(gameHitTest(scene([12], { view: 'spectrum' }), { x: 5, y: 5 })).toEqual([]);
  });
});

describe('DSL và luật toàn cục', () => {
  it('`xor` **vắng mặt** khi Grundy không áp dụng, thay vì trả một số $0$ vô nghĩa', () => {
    const s = scene([3, 5], { rule: WYTHOFF });
    expect(evalOn(s, 'winning')).toBe(false);
    // Biểu thức chạm vào `xor` phải **lỗi** — nếu nó trả `0` thì một claim
    // `xor == 0` sẽ đạt, bài trông như đã kiểm, mà con số ấy không có nghĩa gì.
    expect(tryEvaluate('xor', gameEnvironment(s), DETERMINISTIC_BUDGET).value).toBeUndefined();
    expect(
      tryEvaluate('sum(piles, p => p.grundy)', gameEnvironment(s), DETERMINISTIC_BUDGET).value,
    ).toBeUndefined();
  });

  it('luật hợp vẫn có `xor`, và nó đọc bảng Grundy của Nim Lasker', () => {
    expect(evalOn(scene([1, 2, 3], { rule: LASKER }), 'xor')).toBe(1 ^ 2 ^ 4);
    expect(evalOn(scene([1, 2, 3], { rule: LASKER }), 'winning')).toBe(true);
    // Cùng thế ấy ở Nim thường thì thua — nhánh chia đổi hẳn đáp số.
    expect(evalOn(scene([1, 2, 3]), 'winning')).toBe(false);
  });
});

describe('view `spectrum-2d` (GM-08)', () => {
  const renderer = createRenderer([gameRenderer]);
  const ctx = createContext(defaultTheme);
  const codes = (s: Scene): string[] =>
    gameSchemaFragment.checkBounds(s, '').map((i) => i.code);

  const grid = (config: Record<string, unknown> = {}): Scene =>
    scene([8, 13], { view: 'spectrum-2d', rule: WYTHOFF, spectrum_to: 20, ...config });

  it('vẽ đủ lưới, mỗi ô một key duy nhất', () => {
    const keys: string[] = [];
    walk(renderer.render(grid(), ctx), (node) => {
      if (node.key !== undefined) keys.push(node.key);
    });
    expect(keys).toHaveLength(21 * 21);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('pos-8-13');
  });

  it('ô tô đậm đúng bằng số thế thua trong lưới', () => {
    const cold = losingGrid(20, WYTHOFF).flat().filter(Boolean).length;
    const svg = renderer.toSvg(grid(), ctx);
    const fills = [...svg.matchAll(/<rect[^>]*fill="([^"]+)"[^>]*>/g)].map((m) => m[1]);
    // Trừ nền canvas; ô còn lại chỉ có hai màu.
    expect(fills.filter((f) => f === defaultTheme.surface.neutral)).toHaveLength(
      21 * 21 - cold,
    );
  });

  it('thế hiện tại được khoanh **đúng ô** — và đó là chỗ trục $b$ lật', () => {
    // Không có khoanh thì lưới là một biểu đồ rời khỏi bài. Và khoanh sai ô thì
    // tệ hơn không khoanh: trục $b$ đi **lên** trong khi $y$ của SVG đi xuống,
    // nên quên lật là hình ra ảnh gương mà vẫn trông hoàn toàn hợp lý.
    const svg = renderer.toSvg(grid(), ctx);
    const rects = svg.match(/<rect[^>]*\/>/g) ?? [];
    const marker = rects.find((r) => r.includes('fill="none"')) as string;
    const at = (r: string, k: string): string =>
      new RegExp(`\\b${k}="(-?[\\d.]+)"`).exec(r)?.[1] ?? '';

    // $(8,13)$ với lưới $0..20$: $x = 8 \cdot 10$, $y = (20-13) \cdot 10$.
    expect([at(marker, 'x'), at(marker, 'y')]).toEqual(['80', '70']);

    // Và ô nằm dưới khoanh phải là ô thua — $(8,13)$ là cặp Beatty thứ năm.
    const cell = rects.find(
      (r) => r !== marker && at(r, 'x') === '80' && at(r, 'y') === '70',
    ) as string;
    expect(cell).not.toContain(defaultTheme.surface.neutral);
    expect((losingGrid(20, WYTHOFF)[8] as boolean[])[13]).toBe(true);
  });

  it('anchor trỏ được vào **một ô**, không phải cả hình', () => {
    const ids = gameSchemaFragment.implicitElementIds(grid());
    expect(ids.size).toBe(21 * 21);
    expect(ids.has('pos-8-13')).toBe(true);
    expect(ids.has('pos-21-0')).toBe(false);
    // View `piles` thì không sinh ô nào — hai view không giẫm lên nhau.
    expect(gameSchemaFragment.implicitElementIds(scene([3, 4])).size).toBe(0);
  });

  it('luật chia đống bị chặn, và hình **nói ra** thay vì vẽ lưới sai', () => {
    const bad = scene([4, 4], { view: 'spectrum-2d', rule: LASKER });
    expect(codes(bad)).toContain('bounds/spectrum-2d-needs-two-pile-rule');
    const svg = renderer.toSvg(bad, ctx);
    expect(svg).toContain('Luật chia đống không vẽ được trên lưới hai chiều');
    expect((svg.match(/<rect/g) ?? []).length).toBe(1);
  });

  it('đòi đúng hai đống, và trần lưới nhỏ hơn trần phổ một chiều', () => {
    expect(codes(scene([3, 4, 5], { view: 'spectrum-2d', rule: WYTHOFF }))).toContain(
      'bounds/spectrum-2d-needs-two-piles',
    );
    expect(codes(grid({ spectrum_to: 40 }))).toContain('bounds/spectrum-2d-too-large');
    // Cùng con số ấy thì phổ một chiều nhận được.
    expect(codes(scene([12], { view: 'spectrum', spectrum_to: 40 }))).toEqual([]);
    expect(codes(grid())).toEqual([]);
  });

  it('không bày công cụ nào, và chạm không trả id đống nào', () => {
    expect(gameTools(grid()).map((t) => t.id)).toEqual(['select']);
    expect(gameHitTest(grid(), { x: 5, y: 5 })).toEqual([]);
  });
});

describe('chú giải của hai view phổ nằm trong khung', () => {
  const renderer = createRenderer([gameRenderer]);
  const ctx = createContext(defaultTheme);

  /**
   * Cùng lỗi với caption, ở chỗ mà test caption **không** với tới: dòng chú giải
   * là chữ do renderer tự sinh, không phải trường của bài. Lưới nhỏ thì chữ dài
   * hơn hình, và nó cụt ở mép phải mà không có gì báo.
   */
  const fits = (s: Scene): boolean => {
    const viewport = renderer.viewportOf(s, ctx);
    const svg = renderer.toSvg(s, ctx);
    return [...svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)].every(([, attrs, body]) => {
      const size = Number(/font-size="([\d.]+)"/.exec(attrs ?? '')?.[1] ?? '0');
      const x = Number(/\bx="(-?[\d.]+)"/.exec(attrs ?? '')?.[1] ?? '0');
      const anchor = /text-anchor="middle"/.test(attrs ?? '');
      const width = estimateTextWidth(body ?? '', size);
      const right = anchor ? x + width / 2 : x + width;
      return right <= viewport.x + viewport.width + 1e-6;
    });
  };

  it('phổ một chiều: lưới nhỏ vẫn chứa hết dòng chú giải', () => {
    for (const to of [1, 3, 5, 12, 40]) {
      expect({ to, fits: fits(scene([to], { view: 'spectrum', spectrum_to: to })) }).toEqual({
        to,
        fits: true,
      });
    }
  });

  it('lưới hai chiều: kể cả lưới nhỏ nhất và kèm caption dài nhất', () => {
    for (const to of [1, 4, 8, 20, 24]) {
      const s = scene([1, 1], {
        view: 'spectrum-2d',
        rule: WYTHOFF,
        spectrum_to: to,
        caption: 'Bốc một đống, hoặc bốc bằng nhau ở cả hai đống',
      });
      expect({ to, fits: fits(s) }).toEqual({ to, fits: true });
    }
  });
});
