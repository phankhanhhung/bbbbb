import { SELECT_TOOL, type SandboxTool } from '@combviz/editor';

/**
 * Công cụ sandbox của Derivation engine — đúng **một** thao tác.
 *
 * Và nó là thao tác đúng: cả họ bài (tổng telescoping, tích rút gọn, đổi chỉ số)
 * quy về một câu hỏi duy nhất — hạng tử nào khử hạng tử nào. Người học tự chỉ
 * ra các cặp, validator `cancelled:<k>` nói đã đủ chưa.
 *
 * Cho sửa LaTeX thì lại là mở cửa hậu cho DSL-03, cùng lý do với `COMBINE_RULES`
 * của engine dãy và với tập luật đóng của engine game.
 */
export function derivationTools(): readonly SandboxTool[] {
  return [
    SELECT_TOOL,
    {
      id: 'toggle-cancel',
      label: '⊘ Đánh dấu triệt tiêu',
      action: { type: 'one', command: 'derivation/toggle-cancel', idParam: 'term' },
    },
  ];
}
