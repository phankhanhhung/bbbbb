import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultTheme } from '@combviz/theme';
import {
  applyChoreography,
  collectKeys,
  createContext,
  createRenderer,
  diffNodes,
  interpolateNodes,
} from '@combviz/render';
import type { Problem } from '@combviz/schema';
import { boardRenderer } from '../src/render.js';
import { boardSchemaFragment } from '../src/index.js';
import { cellColorClass, tileOffsets } from '../src/geometry.js';

const renderer = createRenderer([boardRenderer]);
const ctx = createContext(defaultTheme);

const problem = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../content/problems/mutilated-chessboard.json', import.meta.url),
    ),
    'utf8',
  ),
) as Problem;

const steps = problem.solutions[0]!.steps;

/**
 * Golden snapshot ở mức **chuỗi SVG**, không phải pixel.
 *
 * Renderer là hàm thuần nên so sánh chuỗi là so sánh chính xác và rẻ; so pixel
 * thì phụ thuộc rasterizer và phông, mà hai thứ đó khác nhau giữa browser và
 * Node (G-08). Chuỗi khác đi phải có nghĩa là *hình đã đổi* — đó là lý do
 * `serialize` sắp thuộc tính theo tên và làm tròn số cố định.
 */
describe('golden SVG', () => {
  it.each(steps.map((s, i) => [i, s.id] as const))(
    'step %i (%s) giữ nguyên hình',
    async (index) => {
      const scene = steps[index]!.scene!;
      await expect(renderer.toSvg(scene, ctx)).toMatchFileSnapshot(
        `./__golden__/mutilated-chessboard-${steps[index]!.id}.svg`,
      );
    },
  );

  it('chế độ pattern (NFR-A1) cho hình khác và có defs', async () => {
    const svg = renderer.toSvg(steps[1]!.scene!, createContext(defaultTheme, { patterns: true }));

    expect(svg).toContain('<pattern');
    await expect(svg).toMatchFileSnapshot(
      './__golden__/mutilated-chessboard-s1-patterns.svg',
    );
  });
});

describe('hình vẽ nói đúng thứ lời giải nói', () => {
  it('bàn khuyết hai góc cho 30 ô màu 1 và 32 ô màu 2', () => {
    // Đây là toàn bộ lập luận của bài. Nếu renderer tô ra 31–31 thì hình đang
    // phản chứng lại chính lời giải nó minh hoạ — loại sai mà schema và bound
    // không thể bắt, và người đọc thì tin vào hình.
    const cells = renderer.render(steps[1]!.scene!, ctx)[0]!.children!;
    const count = (fill: string): number =>
      cells.filter((n) => n.attrs['fill'] === fill).length;

    expect(count(defaultTheme.colorClasses[0]!.fill)).toBe(30);
    expect(count(defaultTheme.colorClasses[1]!.fill)).toBe(32);
    expect(count(defaultTheme.surface.void)).toBe(2);
  });

  it('mỗi domino phủ đúng một ô mỗi màu', () => {
    const config = steps[2]!.scene!.config as { coloring_preset?: unknown };
    expect(config.coloring_preset).toBeDefined();

    for (const tile of steps[2]!.scene!.elements) {
      const [row, col] = tile['pos'] as [number, number];
      const offsets = tileOffsets(String(tile['shape']), Number(tile['rot']), false);
      const classes = offsets.map(([dr, dc]) =>
        cellColorClass(steps[2]!.scene!.config as never, row + dr, col + dc),
      );

      expect(new Set(classes).size).toBe(2);
    }
  });
});

describe('key ổn định giữa các step (DAT-12)', () => {
  it('mọi ô giữ nguyên key qua cả ba step', () => {
    const keys = steps.map((s) => collectKeys(renderer.render(s.scene!, ctx)));

    expect(keys[0]).toEqual(new Set([...keys[0]!]));
    for (const cellKey of keys[0]!) {
      expect(keys[1]!.has(cellKey)).toBe(true);
      expect(keys[2]!.has(cellKey)).toBe(true);
    }
  });

  it('bước tô màu chỉ đổi ô, không thêm bớt element nào', () => {
    const diff = diffNodes(
      renderer.render(steps[0]!.scene!, ctx),
      renderer.render(steps[1]!.scene!, ctx),
    );

    // Đây là kiểm tra thật sự của DAT-11/12: tác giả chỉ lưu hai snapshot, và
    // hệ thống tự suy ra "62 ô đổi màu" chứ không phải "xoá cả bàn, vẽ bàn mới".
    expect(diff.entered).toEqual([]);
    expect(diff.exited).toEqual([]);
    expect(diff.changed).toHaveLength(62);
  });

  it('bước đặt domino chỉ thêm ba tile', () => {
    const diff = diffNodes(
      renderer.render(steps[1]!.scene!, ctx),
      renderer.render(steps[2]!.scene!, ctx),
    );

    expect(diff.entered).toEqual(['t1', 't2', 't3']);
    expect(diff.exited).toEqual([]);
    expect(diff.changed).toEqual([]);
  });
});

describe('animation suy ra từ snapshot', () => {
  it('khung giữa của bước tô màu có màu nằm giữa hai đầu', () => {
    const before = renderer.render(steps[0]!.scene!, ctx);
    const after = renderer.render(steps[1]!.scene!, ctx);

    const cellOf = (nodes: ReturnType<typeof renderer.render>): string => {
      const cells = nodes[0]!.children!;
      return String(cells.find((n) => n.key === 'cell-0-1')!.attrs['fill']);
    };

    const mid = cellOf(interpolateNodes(before, after, 0.5));

    expect(mid).not.toBe(cellOf(before));
    expect(mid).not.toBe(cellOf(after));
  });

  it('khung cuối bằng đúng render của step đích', () => {
    const before = renderer.render(steps[1]!.scene!, ctx);
    const after = renderer.render(steps[2]!.scene!, ctx);

    expect(interpolateNodes(before, after, 1)).toEqual(after);
  });
});

/**
 * BD-10 — nét gạch.
 *
 * Bốn khẳng định, và cả bốn nói về **một** điều: gạch phải khác tô ở đúng chỗ làm
 * nên một cái sàng — ô bị gạch vẫn đọc được, và nét gạch là một thứ **riêng** mà
 * timeline chạm được mà không chạm vào ô.
 */
describe('BD-10 — gạch ô', () => {
  const struck = (overrides: Record<string, unknown>) => ({
    engine: 'board',
    config: { rows: 2, cols: 2, cell_overrides: overrides },
    elements: [],
  }) as never;

  it('nét gạch mang màu của lớp khai, không phải mực chung', () => {
    const cells = renderer.render(
      struck({ 'cell-0-0': { glyph: '4', strike: 3 } }),
      ctx,
    )[0]!.children!;
    const line = cells.find((n) => n.key === 'strike-0-0')!;

    expect(line.tag).toBe('line');
    expect(line.attrs['stroke']).toBe(defaultTheme.colorClasses[2]!.stroke);
  });

  it('ô **vẫn đọc được**: glyph còn nguyên và nét nằm trên nó', () => {
    // Cả điểm của việc gạch thay vì tô: tô đè lên $12$ thì mất luôn con số, mà
    // "số nào bị loại" là một nửa nội dung của cái sàng.
    const cells = renderer.render(
      struck({ 'cell-0-0': { glyph: '12', strike: 1 } }),
      ctx,
    )[0]!.children!;

    const glyphAt = cells.findIndex((n) => n.text === '12');
    const strikeAt = cells.findIndex((n) => n.key === 'strike-0-0');
    expect(glyphAt).toBeGreaterThanOrEqual(0);
    expect(strikeAt).toBeGreaterThan(glyphAt);
  });

  it('nét gạch có **danh tính riêng**, không dùng chung với ô', () => {
    // Chung id thì `applyChoreography` tra `data-el ?? key` và chạm cả hai, nên
    // một pha "hiện dần nét gạch" sẽ làm cả ô nhoà vào rồi hiện ra. Đây là ràng
    // buộc khiến tính năng này chạy được, không phải một chi tiết đặt tên.
    const scene = struck({ 'cell-0-0': { glyph: '4', strike: 1 } });
    const ids = boardSchemaFragment.implicitElementIds(scene);

    expect(ids.has('strike-0-0')).toBe(true);
    // Ô không khai `strike` thì **không** sinh id: khai cả 1600 nét không tồn tại
    // sẽ bắt chốt canh ANC-01 đòi mực cho từng cái.
    expect(ids.has('strike-0-1')).toBe(false);
    expect(boardRenderer.elementBoxes!(scene, 'strike-0-0')).toEqual(
      boardRenderer.elementBoxes!(scene, 'cell-0-0'),
    );
  });

  it('ô khuyết không gạch được — nó không phải một ô', () => {
    const scene = {
      engine: 'board',
      config: { rows: 2, cols: 2, holes: [[0, 0]], cell_overrides: { 'cell-0-0': { strike: 1 } } },
      elements: [],
    } as never;

    expect(collectKeys(renderer.render(scene, ctx)).has('strike-0-0')).toBe(false);
    expect(boardSchemaFragment.implicitElementIds(scene).has('strike-0-0')).toBe(false);
  });
});

/**
 * Chữ trong ô phải **đi cùng ô** khi timeline chạm vào nó.
 *
 * Node `<rect>` mang `key`, node `<text>` thì không mang gì — và
 * `applyChoreography` tra chủ sở hữu theo `data-el ?? key`, nên trước khi có
 * `data-el` thì một pha `dim`/`show`/`hide` nhắm vào một ô chỉ chạm cái ô, con số
 * bên trong đứng nguyên.
 *
 * Đây không phải lỗi giả định: bài `sum-odd-numbers-gnomon` xây hình vuông theo
 * từng lớp gnomon bằng năm pha `show`, và ở khung đầu cả lưới $5\times5$ con số đã
 * hiện sẵn trong khi mọi ô còn ẩn — hình lộ đáp án trước khi lập luận bắt đầu, mà
 * golden vẫn xanh vì golden chụp scene chứ không chụp timeline.
 */
describe('glyph mang danh tính của ô', () => {
  const scene = {
    engine: 'board',
    config: { rows: 1, cols: 2, cell_overrides: { 'cell-0-0': { glyph: '7' } } },
    elements: [],
  } as never;

  const textNodes = (nodes: ReturnType<typeof renderer.render>) => {
    const out: { attrs: Record<string, unknown>; text?: string }[] = [];
    const walk = (list: readonly { tag: string; attrs: Record<string, unknown>; text?: string; children?: never[] }[]): void => {
      for (const n of list) {
        if (n.tag === 'text') out.push(n);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes as never);
    return out;
  };

  it('node chữ khai `data-el` trỏ về ô chứa nó', () => {
    const [glyph] = textNodes(renderer.render(scene, ctx));

    expect(glyph?.text).toBe('7');
    expect(glyph?.attrs['data-el']).toBe('cell-0-0');
  });

  it('pha `dim` nhắm vào ô làm mờ **cả** ô lẫn chữ', () => {
    const nodes = renderer.render(scene, ctx);
    const after = applyChoreography(
      nodes,
      { phases: [{ id: 'p', kind: 'dim', targets: ['cell-0-0'], at: 0, duration: 0, anchor: 'a1' }] } as never,
      100,
    );

    const rect = (after[0]!.children ?? []).find((n) => n.key === 'cell-0-0')!;
    const [glyph] = textNodes(after);

    // Một con số mờ đi cùng ô của nó, chứ không nổi lên trên một ô đã mờ.
    expect(rect.attrs['opacity']).toBe(glyph!.attrs['opacity']);
    expect(Number(glyph!.attrs['opacity'])).toBeLessThan(1);
  });
});

describe('viewport', () => {
  it('mặc định bao trọn bàn kèm lề', () => {
    expect(renderer.viewportOf(steps[0]!.scene!)).toEqual({
      x: -4,
      y: -4,
      width: 88,
      height: 88,
    });
  });

  it('scene khai viewport thì tôn trọng khai báo (DAT-21)', () => {
    const scene = { ...steps[0]!.scene!, viewport: { x: 0, y: 0, width: 40, height: 40 } };

    expect(renderer.viewportOf(scene).width).toBe(40);
  });
});
