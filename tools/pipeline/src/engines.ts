import { boardSchemaFragment } from '@combviz/engine-board';
import type { EngineSchemaFragment } from '@combviz/schema';

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
