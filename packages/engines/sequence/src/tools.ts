import { SELECT_TOOL, type SandboxTool } from '@combviz/editor';
import { MAX_COLOR_CLASS } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import {
  COMBINE_RULE_IDS,
  combineRuleLabel,
  STEP_RULE_IDS,
  stepRuleLabel,
} from './commands.js';

/**
 * Công cụ sandbox của Sequence engine.
 *
 * `mode` quyết định thao tác nào hợp lệ, và đó không phải chuyện giao diện: ở
 * **đa tập** thì thứ tự vô nghĩa nên gộp hai phần tử là phép hợp lệ; ở **dãy có
 * thứ tự** thì đổi chỗ mới là phép hợp lệ còn gộp thì phá mất chính thứ đang xét.
 * Thanh công cụ là chỗ người học đọc ra điều đó.
 *
 * Danh sách luật gộp đọc từ `COMBINE_RULE_IDS` của engine. Bản gõ tay trước đây
 * ở `apps/player` chỉ liệt kê ba trong năm luật, và nhãn cũng viết khác — đúng
 * kiểu lệch mà một danh sách chép tay luôn dẫn tới.
 */
export function sequenceTools(scene: Scene): readonly SandboxTool[] {
  const tools: SandboxTool[] = [SELECT_TOOL];
  const piles = (scene.config as { mode?: string } | undefined)?.mode === 'piles';

  if (piles) {
    for (const rule of COMBINE_RULE_IDS) {
      tools.push({
        id: `combine-${rule}`,
        label: `Gộp ${combineRuleLabel(rule)}`,
        action: {
          type: 'two',
          command: 'sequence/combine',
          params: ['a', 'b'],
          extra: { rule },
        },
      });
    }
  } else {
    tools.push({
      id: 'swap',
      label: '⇄ Đổi chỗ hai phần tử',
      action: { type: 'two', command: 'sequence/swap', params: ['a', 'b'] },
    });

    // Lan truyền (SQ-02) chỉ có nghĩa khi thứ tự có nghĩa: luật đọc phần tử kế
    // tiếp, mà ở đa tập thì "kế tiếp" không tồn tại.
    for (const rule of STEP_RULE_IDS) {
      tools.push({
        id: `step-${rule}`,
        label: `Một bước: ${stepRuleLabel(rule)}`,
        action: { type: 'run', command: 'sequence/step', params: { rule } },
      });
    }

    tools.push({
      id: 'fire',
      label: 'Đổ hạt sang hai bên',
      action: { type: 'one', command: 'sequence/fire', idParam: 'id' },
    });
  }

  for (let index = 1; index <= MAX_COLOR_CLASS; index += 1) {
    tools.push({
      id: `paint-${index}`,
      label: `Tô màu ${index}`,
      swatch: index,
      action: {
        type: 'paint',
        command: 'sequence/paint',
        idsParam: 'ids',
        params: { color_class: index },
      },
    });
  }

  tools.push({
    id: 'remove',
    label: 'Xoá',
    action: { type: 'one', command: 'sequence/remove', idParam: 'ids', asList: true },
  });

  return tools;
}
