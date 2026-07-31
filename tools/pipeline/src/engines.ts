import {
  boardEnvironment,
  boardRenderer,
  boardSchemaFragment,
} from '@combviz/engine-board';
import {
  graphEnvironment,
  graphRenderer,
  graphSchemaFragment,
} from '@combviz/engine-graph';
import {
  sequenceEnvironment,
  sequenceRenderer,
  sequenceSchemaFragment,
} from '@combviz/engine-sequence';
import {
  setEnvironment,
  setRenderer,
  setSchemaFragment,
} from '@combviz/engine-set';
import {
  pointEnvironment,
  pointRenderer,
  pointSchemaFragment,
} from '@combviz/engine-point';
import {
  gameEnvironment,
  gameRenderer,
  gameSchemaFragment,
} from '@combviz/engine-game';
import {
  derivationEnvironment,
  derivationRenderer,
  derivationSchemaFragment,
} from '@combviz/engine-derivation';
import {
  longDivEnvironment,
  longDivRenderer,
  longDivSchemaFragment,
} from '@combviz/engine-longdiv';
import type { EngineSchemaFragment } from '@combviz/schema';
import type { EngineRenderer } from '@combviz/render';
import type { EngineDslModule } from '@combviz/check';

/**
 * Composition root cho phía Node.
 *
 * Đây là **nơi duy nhất** liệt kê engine cho CLI/CI. `packages/schema` không biết
 * engine nào tồn tại (D-10); Player có composition root riêng và nạp động theo
 * `engines_used[]` để giữ ngân sách bundle (NFR-P3).
 *
 * Thêm engine ở M4 (graph) chỉ là thêm một dòng ở đây.
 */
export const ENGINE_FRAGMENTS: readonly EngineSchemaFragment[] = [
  boardSchemaFragment,
  graphSchemaFragment,
  sequenceSchemaFragment,
  setSchemaFragment,
  pointSchemaFragment,
  gameSchemaFragment,
  derivationSchemaFragment,
  longDivSchemaFragment,
];

/**
 * Cùng renderer mà Player dùng — không có bản sao "dành cho Node".
 *
 * Đây là điều khiến REN-01/02/04 gần như miễn phí về kiến trúc, và cũng là điều
 * sẽ hỏng đầu tiên nếu ai đó lỡ đưa DOM vào `packages/render`. Lệnh `render`
 * chạy trong CI chính là chốt canh cửa đó.
 */
export const ENGINE_RENDERERS: readonly EngineRenderer[] = [
  boardRenderer,
  graphRenderer,
  sequenceRenderer,
  setRenderer,
  pointRenderer,
  gameRenderer,
  derivationRenderer,
  longDivRenderer,
];

/**
 * Phần "chạy được" của engine: môi trường DSL + validator, tra theo engine id.
 *
 * Tách khỏi `ENGINE_FRAGMENTS` (schema) và `ENGINE_RENDERERS` (hình) vì ba mặt
 * này có vòng đời khác nhau: schema đi vào JSON Schema công bố, renderer chạy cả
 * headless, còn phần này chỉ cần khi thực sự eval biểu thức.
 */
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
  longdiv: { fragment: longDivSchemaFragment, environment: longDivEnvironment },
};
