import type { EngineRenderer } from '@combviz/render';
import type { DslEnvironment } from '@combviz/dsl';
import type { Scene } from '@combviz/schema';

/**
 * Composition root phía Player — **nạp động** theo `engines_used[]` (D-10).
 *
 * Khác với `tools/pipeline` nạp cả bộ trong Node, Player chỉ tải engine mà bài
 * đang mở thực sự dùng. Đây là cách duy nhất giữ ngân sách NFR-P3 (≤300KB gzip)
 * khi P2/P3 thêm ba engine nữa: bài đồ thị không kéo theo code bàn cờ.
 *
 * Renderer và môi trường DSL đi cùng **một** lần import: chúng luôn được dùng
 * cùng nhau, tách ra chỉ tạo thêm một round-trip mạng mà không tiết kiệm gì.
 */
export interface LoadedEngine {
  readonly renderer: EngineRenderer;
  environment(scene: Scene): DslEnvironment;
}

const LOADERS: Record<string, () => Promise<LoadedEngine>> = {
  board: async () => {
    const module = await import('@combviz/engine-board');
    return { renderer: module.boardRenderer, environment: module.boardEnvironment };
  },
};

const cache = new Map<string, LoadedEngine>();

export async function loadEngines(
  ids: readonly string[],
): Promise<ReadonlyMap<string, LoadedEngine>> {
  await Promise.all(
    ids.map(async (id) => {
      if (cache.has(id)) return;
      const loader = LOADERS[id];
      if (!loader) return;
      cache.set(id, await loader());
    }),
  );

  return new Map(ids.filter((id) => cache.has(id)).map((id) => [id, cache.get(id)!]));
}
