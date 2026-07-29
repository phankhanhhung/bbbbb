import type { Scene } from '@combviz/schema';
import { hashScene } from '@combviz/render';
import { element, type DslEnvironment, type Value } from '@combviz/dsl';
import { readGame, type GameModel } from './model.js';
import { analyzeGame } from './solver.js';

const cache = new Map<string, GameModel>();

function model(scene: Scene): GameModel {
  const key = hashScene(scene);
  const hit = cache.get(key);
  if (hit) return hit;
  const value = readGame(scene);
  if (cache.size > 64) cache.clear();
  cache.set(key, value);
  return value;
}

/**
 * Môi trường DSL của Game engine.
 *
 * `winning` là binding quan trọng nhất, và nó là một **boolean tính bằng máy**
 * chứ không phải một khẳng định tác giả gõ vào. Cả họ bài này kết luận bằng
 * "người đi trước thắng" hay "người đi sau thắng", và đó đúng là loại câu mà
 * M13 tìm ra sáu chỗ sai khi đọc tay.
 */
export function gameEnvironment(scene: Scene): DslEnvironment {
  const state = model(scene);
  const counts = state.piles.map((p) => p.count);
  const analysis = analyzeGame(counts, state.config.rule, state.config.misere === true);

  const piles: Value[] = state.piles.map((p, i) =>
    element(p.id, {
      count: p.count,
      label: p.label ?? '',
      color_class: p.colorClass,
      grundy: analysis.grundy[i] ?? 0,
    }),
  );

  return {
    bindings: {
      piles,
      n: state.piles.length,
      total: counts.reduce((a, b) => a + b, 0),
      /** XOR các giá trị Grundy. Bằng $0$ đúng khi người sắp đi thua (luật thường). */
      xor: analysis.xor,
      /** Người **sắp đi** có thắng không, nếu cả hai chơi tối ưu. */
      winning: analysis.refused === undefined && analysis.winning,
      /** Số nước hợp lệ từ thế này. */
      moves: analysis.totalMoves,
      /** Số nước đưa đối thủ vào thế thua. */
      winning_moves: analysis.winningMoves.length,
    },
    builtins: {},
  };
}
