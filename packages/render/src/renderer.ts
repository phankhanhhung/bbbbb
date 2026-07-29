import type { Scene, Viewport } from '@combviz/schema';
import { patternDefs, type RenderContext } from './context.js';
import { toSvgString, type SerializeOptions } from './serialize.js';
import type { SvgNode } from './svg-node.js';

/**
 * Phần renderer mà mỗi engine cung cấp.
 *
 * `packages/render` **không** import engine nào (eslint enforce): engine nạp vào
 * từ bên ngoài, đúng như cách `packages/schema` nhận `EngineSchemaFragment`. Nhờ
 * vậy Player chỉ tải engine mà bài đang dùng (D-10, NFR-P3), còn CLI nạp cả bộ
 * trong Node mà không kéo theo DOM.
 */
export interface EngineRenderer {
  readonly id: string;
  render(scene: Scene, ctx: RenderContext): SvgNode[];
  /**
   * Khung nhìn mặc định khi scene không tự khai (DAT-21).
   *
   * `ctx` là **tuỳ chọn** vì phần lớn engine đo được khung nhìn chỉ từ scene —
   * bàn cờ biết mình mấy hàng mấy cột mà không cần biết theme. Engine nào bề
   * rộng phụ thuộc thứ chỉ có trong ngữ cảnh (derivation cần label atlas mới
   * biết một công thức rộng bao nhiêu) thì đọc thêm; gọi thiếu thì nó ước rộng
   * hơn thực tế, tức hình có thể thừa lề chứ không bao giờ bị **cắt**.
   */
  defaultViewport(scene: Scene, ctx?: RenderContext): Viewport;
}

export interface SceneRenderer {
  render(scene: Scene, ctx: RenderContext): SvgNode[];
  viewportOf(scene: Scene, ctx?: RenderContext): Viewport;
  toSvg(scene: Scene, ctx: RenderContext, options?: Partial<SerializeOptions>): string;
  has(engineId: string): boolean;
}

const FALLBACK_VIEWPORT: Viewport = { x: 0, y: 0, width: 100, height: 100 };

export function createRenderer(engines: readonly EngineRenderer[]): SceneRenderer {
  const byId = new Map(engines.map((e) => [e.id, e]));

  function render(scene: Scene, ctx: RenderContext): SvgNode[] {
    const engine = byId.get(scene.engine);
    if (!engine) return [];

    const nodes = engine.render(scene, ctx);
    // Pattern defs chỉ chèn khi thực sự bật, để SVG xuất ra ở chế độ thường
    // không mang theo 8 định nghĩa không ai dùng.
    return ctx.patterns ? [patternDefs(ctx.theme), ...nodes] : nodes;
  }

  function viewportOf(scene: Scene, ctx?: RenderContext): Viewport {
    if (scene.viewport) return scene.viewport;
    return byId.get(scene.engine)?.defaultViewport(scene, ctx) ?? FALLBACK_VIEWPORT;
  }

  return {
    render,
    viewportOf,
    has: (engineId) => byId.has(engineId),
    toSvg(scene, ctx, options) {
      return toSvgString(render(scene, ctx), {
        viewport: viewportOf(scene, ctx),
        background: ctx.theme.surface.canvas,
        ...options,
      });
    },
  };
}
