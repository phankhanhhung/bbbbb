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
/**
 * Hộp bao trong hệ toạ độ scene. Bề rộng/cao **được phép bằng $0$**: một element
 * điểm có hộp bao suy biến, và ép nó dương sẽ là nói dối cho gọn kiểu.
 */
export interface SceneBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

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
  /**
   * Chỗ **mực của một element** nằm, trong toạ độ scene.
   *
   * Vì sao engine phải tự khai thay vì suy ngược từ cây đã render: suy ngược thì
   * phải đoán hộp bao từ thuộc tính SVG, và phép đoán ấy chịu thua ở đúng những
   * chỗ khó — path lệnh tương đối, cung, `scale`, `rotate`. Engine thì **tính
   * ra** những toạ độ ấy, nên nó biết chính xác.
   *
   * **Mảng, không phải một hộp.** Một element có thể được vẽ ở nhiều chỗ, và ma
   * trận kề là ví dụ sắc nhất: cạnh $v_1v_2$ hiện ở hai ô đối xứng qua đường
   * chéo — chính là chuyện mà bổ đề bắt tay nói. Hợp hai ô ấy cho một hình bắc
   * qua đường chéo, tâm rơi vào ô $(v_i,v_i)$ — một ô mang nghĩa khác hẳn. Trả
   * một hộp là ném đi thông tin mà phía gọi bắt buộc phải có.
   *
   * Rỗng nghĩa là **view này không vẽ element ấy**, và đó là câu trả lời hợp lệ:
   * phổ thắng–thua không vẽ đống sỏi. Xem `undrawnElementIds`.
   *
   * Tuỳ chọn: engine chưa cài thì phía gọi phải có đường xử lý cho `undefined`.
   * Bắt cả bảy engine cài cùng lúc là gộp bảy việc làm một, trong khi chỉ ba
   * engine đang tham gia view song ánh.
   */
  elementBoxes?(scene: Scene, id: string, ctx?: RenderContext): readonly SceneBox[];
}

export interface SceneRenderer {
  render(scene: Scene, ctx: RenderContext): SvgNode[];
  viewportOf(scene: Scene, ctx?: RenderContext): Viewport;
  toSvg(scene: Scene, ctx: RenderContext, options?: Partial<SerializeOptions>): string;
  has(engineId: string): boolean;
  /** Xem `EngineRenderer.elementBoxes`. Rỗng khi engine chưa cài hoặc không vẽ. */
  boxesOf(scene: Scene, id: string, ctx?: RenderContext): readonly SceneBox[];
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
    boxesOf: (scene, id, ctx) => byId.get(scene.engine)?.elementBoxes?.(scene, id, ctx) ?? [],
    toSvg(scene, ctx, options) {
      return toSvgString(render(scene, ctx), {
        viewport: viewportOf(scene, ctx),
        background: ctx.theme.surface.canvas,
        ...options,
      });
    },
  };
}
