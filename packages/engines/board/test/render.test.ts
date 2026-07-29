import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultTheme } from '@combviz/theme';
import {
  collectKeys,
  createContext,
  createRenderer,
  diffNodes,
  interpolateNodes,
} from '@combviz/render';
import type { Problem } from '@combviz/schema';
import { boardRenderer } from '../src/render.js';
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
