import {
  boardCommands,
  boardEnvironment,
  boardHitTest,
  boardRenderer,
  boardSchemaFragment,
} from '@combviz/engine-board';
import {
  graphCommands,
  graphEnvironment,
  graphHitTest,
  graphRenderer,
  graphSchemaFragment,
} from '@combviz/engine-graph';
import type { EngineDslModule } from '@combviz/check';
import type { EngineRenderer } from '@combviz/render';
import type { CommandRegistry, HitTest } from '@combviz/editor';
import type { EngineSchemaFragment } from '@combviz/schema';

/**
 * Composition root của Studio — nạp **cả bộ**, không lazy-load.
 *
 * Ngược với Player (D-10): Player tải theo `engines_used[]` vì nó phải giữ ngân
 * sách NFR-P3 cho người học trên 4G. Studio chạy local cho một người, và ở đó
 * điều quan trọng là mọi engine luôn sẵn sàng — tác giả không nên phải chờ tải
 * khi đổi engine giữa lúc soạn.
 */
export const ENGINE_FRAGMENTS: readonly EngineSchemaFragment[] = [
  boardSchemaFragment,
  graphSchemaFragment,
];

export const ENGINE_DSL: Readonly<Record<string, EngineDslModule>> = {
  board: { fragment: boardSchemaFragment, environment: boardEnvironment },
  graph: { fragment: graphSchemaFragment, environment: graphEnvironment },
};

export const ENGINE_RENDERERS: readonly EngineRenderer[] = [boardRenderer, graphRenderer];

export const ENGINE_COMMANDS: Readonly<Record<string, CommandRegistry>> = {
  board: boardCommands,
  graph: graphCommands,
};

export const ENGINE_HIT_TEST: Readonly<Record<string, HitTest>> = {
  board: boardHitTest,
  graph: graphHitTest,
};
