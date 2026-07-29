import {
  boardCommands,
  boardEnvironment,
  boardHitTest,
  boardTools,
  boardRenderer,
  boardSchemaFragment,
} from '@combviz/engine-board';
import {
  graphCommands,
  graphEnvironment,
  graphHitTest,
  graphTools,
  graphRenderer,
  graphSchemaFragment,
} from '@combviz/engine-graph';
import {
  sequenceCommands,
  sequenceEnvironment,
  sequenceHitTest,
  sequenceTools,
  sequenceRenderer,
  sequenceSchemaFragment,
} from '@combviz/engine-sequence';
import {
  setCommands,
  setEnvironment,
  setHitTest,
  setTools,
  setRenderer,
  setSchemaFragment,
} from '@combviz/engine-set';
import {
  pointCommands,
  pointEnvironment,
  pointHitTest,
  pointTools,
  pointRenderer,
  pointSchemaFragment,
} from '@combviz/engine-point';
import {
  gameCommands,
  gameEnvironment,
  gameHitTest,
  gameTools,
  gameRenderer,
  gameSchemaFragment,
} from '@combviz/engine-game';
import {
  derivationCommands,
  derivationEnvironment,
  derivationHitTest,
  derivationTools,
  derivationRenderer,
  derivationSchemaFragment,
} from '@combviz/engine-derivation';
import type { EngineDslModule } from '@combviz/check';
import type { EngineRenderer } from '@combviz/render';
import type { CommandRegistry, HitTest, SandboxToolsFn } from '@combviz/editor';
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
  sequenceSchemaFragment,
  setSchemaFragment,
  pointSchemaFragment,
  gameSchemaFragment,
  derivationSchemaFragment,
];

export const ENGINE_DSL: Readonly<Record<string, EngineDslModule>> = {
  board: { fragment: boardSchemaFragment, environment: boardEnvironment },
  graph: { fragment: graphSchemaFragment, environment: graphEnvironment },
  sequence: { fragment: sequenceSchemaFragment, environment: sequenceEnvironment },
  set: { fragment: setSchemaFragment, environment: setEnvironment },
  point: { fragment: pointSchemaFragment, environment: pointEnvironment },
  game: { fragment: gameSchemaFragment, environment: gameEnvironment },
  derivation: {
    fragment: derivationSchemaFragment,
    environment: derivationEnvironment,
  },
};

export const ENGINE_RENDERERS: readonly EngineRenderer[] = [
  boardRenderer,
  graphRenderer,
  sequenceRenderer,
  setRenderer,
  pointRenderer,
  gameRenderer,
  derivationRenderer,
];

export const ENGINE_COMMANDS: Readonly<Record<string, CommandRegistry>> = {
  board: boardCommands,
  graph: graphCommands,
  sequence: sequenceCommands,
  set: setCommands,
  point: pointCommands,
  game: gameCommands,
  derivation: derivationCommands,
};

export const ENGINE_HIT_TEST: Readonly<Record<string, HitTest>> = {
  board: boardHitTest,
  graph: graphHitTest,
  sequence: sequenceHitTest,
  set: setHitTest,
  point: pointHitTest,
  game: gameHitTest,
  derivation: derivationHitTest,
};

/**
 * Công cụ sandbox theo engine (SBX-01).
 *
 * Studio dùng đúng bảng này để bày thanh công cụ, cùng nguồn với Player — hai
 * bảng công cụ khác nhau thì tác giả sẽ thử được thao tác mà người học không có.
 */
export const ENGINE_TOOLS: Readonly<Record<string, SandboxToolsFn>> = {
  board: boardTools,
  graph: graphTools,
  sequence: sequenceTools,
  set: setTools,
  point: pointTools,
  game: gameTools,
  derivation: derivationTools,
};
