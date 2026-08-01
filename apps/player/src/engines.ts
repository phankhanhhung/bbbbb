import type { EngineRenderer, LabelAtlas } from '@combviz/render';
import type { DslEnvironment } from '@combviz/dsl';
import type { CommandRegistry, HitTest, SandboxToolsFn } from '@combviz/editor';
import type { Choreography, Scene, SceneValidator } from '@combviz/schema';

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
  /**
   * Công cụ sandbox mà engine này thật sự có (SBX-01).
   *
   * Bắt buộc, không tuỳ chọn: một engine quên khai thì Sandbox của nó chỉ còn
   * nút "Chọn" — trống trải nhưng **thành thật**. Trước đây nó mượn nguyên bộ
   * công cụ bàn cờ và bấm cái nào cũng im lặng.
   */
  readonly sandboxTools: SandboxToolsFn;
  environment(scene: Scene): DslEnvironment;
  resolveValidator(id: string): SceneValidator | null;
  /**
   * Timeline **do engine tự sinh** (AL-06), khi tác giả không viết tay.
   *
   * Chỉ engine nào mà cả hình *lẫn nhịp* đều là kết quả tính toán mới có. Với
   * `algebra` thì chuỗi biến đổi do engine tính ra, nên để tác giả gõ tay nhịp của
   * nó là mở đúng khe mà engine ấy sinh ra để bịt: hai bên lệch nhau ngay lần sửa
   * đầu. Tác giả vẫn đè được — `step.choreography` luôn thắng.
   */
  readonly choreography?: (scene: Scene, anchor: string) => Choreography | undefined;
  /**
   * Phả hệ của một hạng tử (AL-13) — *"con số này từ đâu ra?"*
   *
   * Nhận **danh tính vẽ ra** mà người dùng vừa chạm và trả về mọi danh tính cùng phả
   * hệ, ở mọi dòng. `null` nghĩa là chạm hụt (chỗ trống, nhãn luật, id lạ) — khác hẳn
   * tập rỗng, vì Player phải **xoá** vệt đang sáng chứ không thay nó bằng một vệt rỗng.
   *
   * Chỉ engine nào có khái niệm "cùng một vật qua nhiều hình" mới có. Với `algebra` thì
   * `TermId` bền qua các dòng (DAT-11/12) là chính khái niệm ấy, và `trace` đã ghi sẵn
   * mọi thứ cần từ M46 — mục này chỉ là chỗ đem nó ra dùng.
   */
  readonly lineage?: (scene: Scene, elementId: string) => ReadonlySet<string> | null;
  /** BD-06 — đếm ô theo color_class. Chỉ engine dạng lưới có. */
  colorSummary?(scene: Scene): Map<number, number>;
  /** BD-03 — độ phủ. Chỉ engine dạng lưới có. */
  coverage?(scene: Scene): { covered: number; total: number };
  /**
   * Engine này vẽ nhãn LaTeX trong canvas ⇒ cần label atlas (D-07).
   *
   * Khai ở đây chứ không kiểm tên engine ở chỗ gọi: bảng nhãn là một tệp riêng
   * và nó chỉ nên được tải khi bài thật sự cần, đúng tinh thần D-10. Bài bàn cờ
   * không phải tải bảng công thức.
   */
  readonly needsLabels?: boolean;
}

const LOADERS: Record<string, () => Promise<LoadedEngine>> = {
  board: async () => {
    const module = await import('@combviz/engine-board');
    return {
      renderer: module.boardRenderer,
      commands: module.boardCommands,
      hitTest: module.boardHitTest,
      sandboxTools: module.boardTools,
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
      sandboxTools: module.graphTools,
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
      sandboxTools: module.sequenceTools,
      environment: module.sequenceEnvironment,
      resolveValidator: module.resolveSequenceValidator,
    };
  },

  set: async () => {
    const module = await import('@combviz/engine-set');
    return {
      renderer: module.setRenderer,
      commands: module.setCommands,
      hitTest: module.setHitTest,
      sandboxTools: module.setTools,
      environment: module.setEnvironment,
      resolveValidator: module.resolveSetValidator,
    };
  },

  point: async () => {
    const module = await import('@combviz/engine-point');
    return {
      renderer: module.pointRenderer,
      commands: module.pointCommands,
      hitTest: module.pointHitTest,
      sandboxTools: module.pointTools,
      environment: module.pointEnvironment,
      resolveValidator: module.resolvePointValidator,
    };
  },

  game: async () => {
    const module = await import('@combviz/engine-game');
    return {
      renderer: module.gameRenderer,
      commands: module.gameCommands,
      hitTest: module.gameHitTest,
      sandboxTools: module.gameTools,
      environment: module.gameEnvironment,
      resolveValidator: module.resolveGameValidator,
    };
  },

  derivation: async () => {
    const module = await import('@combviz/engine-derivation');
    return {
      renderer: module.derivationRenderer,
      commands: module.derivationCommands,
      hitTest: module.derivationHitTest,
      sandboxTools: module.derivationTools,
      environment: module.derivationEnvironment,
      resolveValidator: module.resolveDerivationValidator,
      needsLabels: true,
    };
  },

  longdiv: async () => {
    const module = await import('@combviz/engine-longdiv');
    return {
      renderer: module.longDivRenderer,
      commands: {},
      hitTest: module.longDivHitTest,
      sandboxTools: module.longDivTools,
      environment: module.longDivEnvironment,
      resolveValidator: module.resolveLongDivValidator,
    };
  },

  algebra: async () => {
    const module = await import('@combviz/engine-algebra');
    return {
      renderer: module.algebraRenderer,
      commands: {},
      hitTest: module.algebraHitTest,
      sandboxTools: module.algebraTools,
      environment: module.algebraEnvironment,
      resolveValidator: module.resolveAlgebraValidator,
      choreography: (scene, anchor) => module.algebraChoreography(scene, { anchor }),
      lineage: module.algebraLineage,
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

/**
 * Nạp label atlas — **chỉ khi** có engine cần tới (D-07 + D-10).
 *
 * Bảng nhãn nặng theo số công thức trong kho, nên nó không được nằm trong bundle
 * chung. Bài nào không có công thức trong canvas thì không tải một byte nào.
 */
export async function loadLabelAtlas(
  engines: ReadonlyMap<string, LoadedEngine>,
): Promise<LabelAtlas | null> {
  if (![...engines.values()].some((e) => e.needsLabels)) return null;
  const module = await import('../../../packages/content/labels.json');
  return module.default as unknown as LabelAtlas;
}
