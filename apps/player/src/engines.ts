import type { EngineRenderer } from '@combviz/render';

/**
 * Composition root phía Player — **nạp động** theo `engines_used[]` (D-10).
 *
 * Khác với `tools/pipeline` nạp cả bộ trong Node, Player chỉ tải engine mà bài
 * đang mở thực sự dùng. Đây là cách duy nhất giữ ngân sách NFR-P3 (≤300KB gzip)
 * khi P2/P3 thêm ba engine nữa: bài đồ thị không kéo theo code bàn cờ.
 */
const LOADERS: Record<string, () => Promise<EngineRenderer>> = {
  board: async () => (await import('@combviz/engine-board')).boardRenderer,
};

const cache = new Map<string, EngineRenderer>();

export async function loadEngines(ids: readonly string[]): Promise<EngineRenderer[]> {
  const loaded = await Promise.all(
    ids.map(async (id) => {
      const cached = cache.get(id);
      if (cached) return cached;

      const loader = LOADERS[id];
      if (!loader) return null;

      const renderer = await loader();
      cache.set(id, renderer);
      return renderer;
    }),
  );

  return loaded.filter((r): r is EngineRenderer => r !== null);
}

export function knownEngines(): string[] {
  return Object.keys(LOADERS);
}
