import { describe, expect, it } from 'vitest';
import { createContext, createRenderer, estimateTextWidth } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import { ENGINE_FRAGMENTS, ENGINE_RENDERERS } from '../src/engines.js';
import { starterScene } from '../src/commands/new-problem.js';

/**
 * Caption phải **nằm trong khung**, ở mọi engine có caption.
 *
 * Lỗi này tìm ra bằng cách render một bài mới ra PNG rồi nhìn: caption "Bốc một
 * đống, hoặc bốc bằng nhau ở cả hai" hiện ra thành "Bốc một đống, hoặ". Bốn engine
 * có `caption`, và cả bốn đều chừa chỗ **theo chiều cao** rồi quên chiều ngang.
 * Không có gì sai theo nghĩa kỹ thuật: chữ vẫn được vẽ, `viewBox` vẫn hợp lệ,
 * validate vẫn xanh — chỉ có người đọc là mất đuôi câu.
 *
 * Nên test này không kiểm một engine cụ thể. Nó **đi tìm** engine nào có `caption`
 * trong config schema rồi ép từng cái, để engine thứ tám không lặng lẽ thừa hưởng
 * lại lỗi này. Đó là hình thức duy nhất có tác dụng với lớp lỗi "một luật viết ra
 * rồi để đó" mà kho đã gặp ở G-10, ở thanh công cụ Sandbox, và ở macro LaTeX.
 */
const renderer = createRenderer(ENGINE_RENDERERS);
const ctx = createContext(defaultTheme);

/** Đúng trần `maxLength` của caption trong schema — trường hợp xấu nhất hợp lệ. */
const LONG = 'Bốc một đống, hoặc bốc bằng nhau ở cả hai đống';

function enginesWithCaption(): string[] {
  return ENGINE_FRAGMENTS.filter((fragment) => {
    const schema = fragment.configSchema as { properties?: Record<string, unknown> };
    return schema.properties !== undefined && Object.hasOwn(schema.properties, 'caption');
  }).map((fragment) => fragment.id);
}

describe('caption nằm trong khung', () => {
  it('bảy engine có caption, và danh sách ấy đọc từ schema chứ không gõ tay', () => {
    // Nếu engine thứ tám thêm `caption`, dòng này đỏ trước khi hình bị cắt chữ —
    // và nó đã đỏ đúng như thế lúc `longdiv` rồi `algebra` ra đời.
    expect(enginesWithCaption().sort()).toEqual([
      'algebra',
      'derivation',
      'game',
      'longdiv',
      'point',
      'sequence',
      'set',
    ]);
  });

  for (const engine of enginesWithCaption()) {
    it(`${engine}: caption dài nhất vẫn nằm trong viewport`, () => {
      const starter = starterScene(engine) as Scene | null;
      expect(starter).not.toBeNull();
      const base = starter as Scene;

      const scene: Scene = {
        ...base,
        config: { ...(base.config as Record<string, unknown>), caption: LONG },
      };

      const viewport = renderer.viewportOf(scene, ctx);
      const svg = renderer.toSvg(scene, ctx);

      // Chữ có được vẽ không — không vẽ thì test dưới thành vô nghĩa.
      expect(svg).toContain(LONG);

      // Mép phải của chữ, ước theo **cùng** hàm mà renderer dùng để nới khung.
      const attrs = new RegExp(`<text([^>]*)>${LONG}</text>`).exec(svg)?.[1] ?? '';
      const size = Number(/font-size="([\d.]+)"/.exec(attrs)?.[1] ?? '0');
      const x = Number(/\bx="(-?[\d.]+)"/.exec(attrs)?.[1] ?? 'NaN');
      expect(size).toBeGreaterThan(0);
      expect(Number.isFinite(x)).toBe(true);

      const right = x + estimateTextWidth(LONG, size);
      expect({ engine, fits: right <= viewport.x + viewport.width }).toEqual({
        engine,
        fits: true,
      });

      // Và cả trục dọc. Engine derivation đặt caption **dưới** khối biến đổi mà
      // không nới chiều cao, nên chữ nằm gần như trọn bên ngoài mép đáy — cùng
      // lỗi, khác trục, và cũng không có gì báo.
      const y = Number(/\by="(-?[\d.]+)"/.exec(attrs)?.[1] ?? 'NaN');
      const ascent = size * 0.75;
      const descent = size * 0.25;
      expect({
        engine,
        top: y - ascent >= viewport.y,
        bottom: y + descent <= viewport.y + viewport.height,
      }).toEqual({ engine, top: true, bottom: true });
    });
  }
});
