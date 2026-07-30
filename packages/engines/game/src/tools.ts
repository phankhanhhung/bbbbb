import { SELECT_TOOL, type SandboxTool } from '@combviz/editor';
import type { Scene } from '@combviz/schema';
import { readGame } from './model.js';
import { allMoves } from './solver.js';

/**
 * Công cụ sandbox của Game engine — **mỗi nước đi hợp lệ là một nút**.
 *
 * Đây là chỗ thanh công cụ làm được việc mà một hộp thoại nhập số không làm
 * được: nó *là* luật chơi. Bốc $1..3$ thì có đúng ba nút; bốc theo tập
 * $\\{1,3,4\\}$ thì có ba nút mang đúng ba số ấy; "bốc tối đa nửa đống" thì số
 * nút **đổi theo thế**; trò Euclid thì số nút đổi theo **đống bên kia**. Người
 * học đọc luật bằng mắt trước khi đọc bằng chữ.
 *
 * Danh sách sinh từ `allMoves` — cùng hàm mà solver, lệnh và validator gọi. Không
 * có đường nào để thanh công cụ bày ra một nước mà engine coi là phạm luật, và
 * cũng không có đường nào để một thành viên luật mới có nước mà không có nút.
 */
export function gameTools(scene: Scene): readonly SandboxTool[] {
  const model = readGame(scene);
  const tools: SandboxTool[] = [SELECT_TOOL];

  // Hai view phổ không vẽ đống nào, và không lệnh nào tác động lên một ô phổ.
  // Bày nút "Bốc 3" ở đó là bày một nút không có đích — đúng cái bệnh mà lớp
  // `SandboxTool` sinh ra để dẹp.
  if (model.config.view !== undefined && model.config.view !== 'piles') return tools;

  const counts = model.piles.map((p) => p.count);
  // Cận của luật đọc lịch sử nằm ở `last_take`, nên thanh công cụ phải mang nó
  // theo: số nút **đổi sau mỗi nước**, đúng như luật.
  const moves = allMoves(counts, model.config.rule, model.config.last_take);

  const takes = new Set<number>();
  const pairs = new Set<number>();
  /** Chia: nhãn cần **cả hai** phần, nên nhớ theo cặp. */
  const splits = new Map<number, readonly [number, number]>();
  const largest = Math.max(0, ...counts);

  for (const move of moves) {
    const [first] = move.becomes;
    if (move.piles.length === 2) {
      pairs.add((counts[move.piles[0] as number] as number) - ((first as readonly number[])[0] as number));
      continue;
    }
    const parts = first as readonly number[];
    if (parts.length === 1) {
      takes.add((counts[move.piles[0] as number] as number) - (parts[0] as number));
      continue;
    }
    // Nhãn lấy từ đống **lớn nhất**: hai đống khác cỡ cho hai cặp phần khác nhau,
    // mà một con số trên nút thì chỉ nói được một cặp. Bấm nhầm đống thì lệnh từ
    // chối, không âm thầm đi một nước lạ.
    if (counts[move.piles[0] as number] === largest) {
      splits.set(parts[0] as number, [parts[0] as number, parts[1] as number]);
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

  for (const [first, [a, b]] of [...splits].sort((x, y) => x[0] - y[0])) {
    tools.push({
      id: `split-${first}`,
      label: `Chia ${a} + ${b}`,
      action: {
        type: 'count',
        command: 'game/split',
        idParam: 'pile',
        countParam: 'first',
        count: first,
      },
    });
  }

  // Nước chéo của Wythoff: **hai** đống một nước, nên công cụ đòi hai lần bấm.
  for (const count of [...pairs].sort((a, b) => a - b)) {
    tools.push({
      id: `take-both-${count}`,
      label: `Bốc ${count} ở cả hai đống`,
      action: {
        type: 'two',
        command: 'game/take-both',
        params: ['pile_a', 'pile_b'],
        extra: { count },
      },
    });
  }

  return tools;
}
