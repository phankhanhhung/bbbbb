import { SELECT_TOOL, type SandboxTool } from '@combviz/editor';
import { MAX_COLOR_CLASS } from '@combviz/theme';
import type { Scene } from '@combviz/schema';

/**
 * Công cụ sandbox của Graph engine.
 *
 * Trước lớp `SandboxTool`, engine này có **sáu lệnh và không một cái nút nào**:
 * sandbox đồ thị chỉ bày ra bộ công cụ bàn cờ, và bấm cái nào cũng không có gì
 * xảy ra. Sáu lệnh ấy đã tồn tại từ M4.
 *
 * Bốn thao tác dưới đây phủ đúng thứ mà một bài đồ thị bắt người học làm: tô màu
 * đỉnh/cạnh (bài tô màu, bài Ramsey), nối thêm cạnh (dựng phản ví dụ), xoá, và
 * sắp lại hình khi các đỉnh chồng lên nhau. Không có "thêm đỉnh": một đỉnh mới
 * cần toạ độ, mà chọn toạ độ bằng cách bấm vào chỗ trống là thao tác duy nhất
 * trong cả kho cần biết điểm chạm ở đâu *khi không trúng element nào* — để dành.
 */
export function graphTools(scene: Scene): readonly SandboxTool[] {
  const tools: SandboxTool[] = [SELECT_TOOL];

  for (let index = 1; index <= MAX_COLOR_CLASS; index += 1) {
    tools.push({
      id: `color-${index}`,
      label: `Tô màu ${index}`,
      swatch: index,
      action: {
        type: 'paint',
        command: 'graph/set-color',
        idsParam: 'ids',
        params: { color_class: index },
      },
    });
  }

  tools.push({
    id: 'color-none',
    label: 'Xoá màu',
    action: {
      type: 'paint',
      command: 'graph/set-color',
      idsParam: 'ids',
      params: { color_class: null },
    },
  });

  tools.push({
    id: 'add-edge',
    label: '+ Nối cạnh',
    action: {
      type: 'two',
      command: 'graph/add-edge',
      params: ['u', 'v'],
      idParam: 'id',
      idPrefix: 'e',
    },
  });

  tools.push({
    id: 'remove',
    label: 'Xoá',
    action: { type: 'one', command: 'graph/remove', idParam: 'ids', asList: true },
  });

  // Sắp lại chỉ có nghĩa khi có đỉnh để sắp.
  if (scene.elements.some((e) => e.type === 'vertex')) {
    tools.push({
      id: 'layout-circle',
      label: '↻ Sắp vòng tròn',
      action: { type: 'run', command: 'graph/apply-layout', params: { layout: 'circle' } },
    });
  }

  return tools;
}
