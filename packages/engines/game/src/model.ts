import type { Scene, SceneElement } from '@combviz/schema';
import type { GameConfig, GameRule } from './schema.js';

export interface Pile {
  readonly id: string;
  readonly count: number;
  readonly label: string | undefined;
  readonly colorClass: number;
  readonly emphasis: string | undefined;
}

export interface GameModel {
  readonly piles: readonly Pile[];
  readonly config: GameConfig;
}

const DEFAULT_RULE: GameRule = { type: 'subtract', min: 1 };

/**
 * Đọc scene thành thế cờ.
 *
 * `rule` phải có mặt trong config — nhưng đọc thiếu thì **không** ném: renderer
 * và DSL còn chạy trên scene đang soạn dở trong Studio. Mặc định là Nim, và
 * validate mới là chỗ bắt scene thiếu luật.
 */
export function readGame(scene: Scene): GameModel {
  const config = (scene.config as GameConfig) ?? ({} as GameConfig);
  const piles: Pile[] = [];

  for (const element of scene.elements) {
    if (element.type !== 'pile') continue;
    piles.push(toPile(element));
  }

  return { piles, config: { ...config, rule: config.rule ?? DEFAULT_RULE } };
}

function toPile(element: SceneElement): Pile {
  const count = element['count'];
  const label = element['label'];
  const colorClass = element['color_class'];
  const emphasis = element['emphasis'];

  return {
    id: element.id,
    count: typeof count === 'number' && Number.isFinite(count) ? Math.trunc(count) : 0,
    label: typeof label === 'string' ? label : undefined,
    colorClass: typeof colorClass === 'number' ? colorClass : 0,
    emphasis: typeof emphasis === 'string' ? emphasis : undefined,
  };
}
