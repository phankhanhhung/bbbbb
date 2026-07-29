import { SELECT_TOOL, type SandboxTool } from '@combviz/editor';
import type { Scene } from '@combviz/schema';
import { deriveSet, vennTooManySets } from './derive.js';

/**
 * Công cụ sandbox của Set engine.
 *
 * Thao tác **duy nhất** có nghĩa ở đây là bật/tắt quan hệ thuộc, và nó khác nhau
 * theo view:
 *
 *   - `matrix` — bấm một **ô** của bảng incidence. Ô đã mang sẵn cả hai vế của
 *     quan hệ (`token__set`), nên một cú bấm là đủ.
 *   - `venn` — bấm một phần tử rồi bấm một tập. Hai bước, vì hình Venn không có
 *     ô nào đại diện cho cặp.
 *
 * Cả họ bài extremal set theory là "chọn họ tập con thoả điều kiện gì đó", nên
 * giữ tập lệnh hẹp đúng bằng bài toán là chủ đích, không phải thiếu sót.
 */
export function setTools(scene: Scene): readonly SandboxTool[] {
  const derived = deriveSet(scene);
  const venn = derived.view === 'venn' && !vennTooManySets(derived);

  return [
    SELECT_TOOL,
    venn
      ? {
          id: 'toggle-venn',
          label: 'Đổi quan hệ thuộc',
          action: {
            type: 'two',
            command: 'set/toggle-membership',
            params: ['token', 'set'],
          },
        }
      : {
          id: 'toggle-cell',
          label: 'Đổi quan hệ thuộc',
          action: { type: 'one', command: 'set/toggle-cell', idParam: 'cell' },
        },
    {
      id: 'remove',
      label: 'Xoá phần tử',
      action: { type: 'one', command: 'set/remove', idParam: 'ids', asList: true },
    },
  ];
}
