import { SELECT_TOOL, type SandboxTool } from '@combviz/editor';
import type { Scene } from '@combviz/schema';
import { readGame } from './model.js';
import { movesFromPile } from './solver.js';

/**
 * Công cụ sandbox của Game engine — **mỗi nước đi hợp lệ là một nút**.
 *
 * Đây là chỗ thanh công cụ làm được việc mà một hộp thoại nhập số không làm
 * được: nó *là* luật chơi. Bốc $1..3$ thì có đúng ba nút; bốc theo tập
 * $\\{1,3,4\\}$ thì có ba nút mang đúng ba số ấy; "bốc tối đa nửa đống" thì số
 * nút **đổi theo thế**. Người học đọc luật bằng mắt trước khi đọc bằng chữ.
 *
 * Danh sách sinh từ `movesFromPile` — cùng hàm mà solver và validator gọi. Không
 * có đường nào để thanh công cụ bày ra một nước mà engine coi là phạm luật.
 */
export function gameTools(scene: Scene): readonly SandboxTool[] {
  const model = readGame(scene);
  const tools: SandboxTool[] = [SELECT_TOOL];

  if (model.config.rule.type === 'split-unequal') {
    // Chia đống: con số là **phần thứ nhất**. Lấy đống lớn nhất làm chuẩn cho
    // danh sách nút; nước không hợp lệ với đống được bấm sẽ bị lệnh từ chối.
    const largest = Math.max(0, ...model.piles.map((p) => p.count));
    for (const [first] of movesFromPile(largest, model.config.rule)) {
      tools.push({
        id: `split-${first}`,
        label: `Chia ${first} + ${largest - (first as number)}`,
        action: {
          type: 'count',
          command: 'game/split',
          idParam: 'pile',
          countParam: 'first',
          count: first as number,
        },
      });
    }
    return tools;
  }

  // Bốc: tập số bốc được **hợp** trên mọi đống, nên nút nào cũng có ích với ít
  // nhất một đống. Bấm nhầm đống thì lệnh từ chối, không âm thầm đi một nước lạ.
  const takes = new Set<number>();
  for (const pile of model.piles) {
    for (const after of movesFromPile(pile.count, model.config.rule)) {
      takes.add(pile.count - (after[0] as number));
    }
  }

  for (const count of [...takes].sort((a, b) => a - b)) {
    tools.push({
      id: `take-${count}`,
      label: `Bốc ${count}`,
      action: {
        type: 'count',
        command: 'game/take',
        idParam: 'pile',
        countParam: 'count',
        count,
      },
    });
  }

  return tools;
}
