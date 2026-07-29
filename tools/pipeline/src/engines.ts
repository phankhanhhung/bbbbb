import { boardRenderer, boardSchemaFragment } from '@combviz/engine-board';
import type { EngineSchemaFragment } from '@combviz/schema';
import type { EngineRenderer } from '@combviz/render';

/**
 * Composition root cho phía Node.
 *
 * Đây là **nơi duy nhất** liệt kê engine cho CLI/CI. `packages/schema` không biết
 * engine nào tồn tại (D-10); Player có composition root riêng và nạp động theo
 * `engines_used[]` để giữ ngân sách bundle (NFR-P3).
 *
 * Thêm engine ở M4 (graph) chỉ là thêm một dòng ở đây.
 */
export const ENGINE_FRAGMENTS: readonly EngineSchemaFragment[] = [boardSchemaFragment];

/**
 * Cùng renderer mà Player dùng — không có bản sao "dành cho Node".
 *
 * Đây là điều khiến REN-01/02/04 gần như miễn phí về kiến trúc, và cũng là điều
 * sẽ hỏng đầu tiên nếu ai đó lỡ đưa DOM vào `packages/render`. Lệnh `render`
 * chạy trong CI chính là chốt canh cửa đó.
 */
export const ENGINE_RENDERERS: readonly EngineRenderer[] = [boardRenderer];
