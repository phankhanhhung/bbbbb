import type { EngineRenderer } from '@combviz/render';
import type { DslEnvironment } from '@combviz/dsl';
import type { CommandRegistry, HitTest } from '@combviz/editor';
import type { Scene, SceneValidator } from '@combviz/schema';

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
  readonly commands: CommandRegistry;
  readonly hitTest: HitTest;
  environment(scene: Scene): DslEnvironment;
  resolveValidator(id: string): SceneValidator | null;
  /** BD-06 — đếm ô theo color_class. Chỉ engine dạng lưới có. */
  colorSummary?(scene: Scene): Map<number, number>;
  /** BD-03 — độ phủ. Chỉ engine dạng lưới có. */
  coverage?(scene: Scene): { covered: number; total: number };
}

const LOADERS: Record<string, () => Promise<LoadedEngine>> = {
  board: async () => {
    const module = await import('@combviz/engine-board');
    return {
      renderer: module.boardRenderer,
      commands: module.boardCommands,
      hitTest: module.boardHitTest,
      environment: module.boardEnvironment,
      resolveValidator: module.resolveBoardValidator,
      colorSummary: module.colorSummary,
      coverage: module.coverage,
    };
  },

  graph: async () => {
    const module = await import('@combviz/engine-graph');
    return {
      renderer: module.graphRenderer,
      commands: module.graphCommands,
      hitTest: module.graphHitTest,
      environment: module.graphEnvironment,
      resolveValidator: module.resolveGraphValidator,
    };
  },

  sequence: async () => {
    const module = await import('@combviz/engine-sequence');
    return {
      renderer: module.sequenceRenderer,
      commands: module.sequenceCommands,
      hitTest: module.sequenceHitTest,
      environment: module.sequenceEnvironment,
      resolveValidator: module.resolveSequenceValidator,
    };
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
