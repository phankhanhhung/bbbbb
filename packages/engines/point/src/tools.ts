import { SELECT_TOOL, type SandboxTool } from '@combviz/editor';

/**
 * Công cụ sandbox của Point engine.
 *
 * Nối/bỏ đoạn là thao tác duy nhất bày ra. `point/move` có trong registry nhưng
 * **không** có nút: nó là thao tác kéo–thả, mà lớp công cụ chung ở đây chỉ biết
 * bấm. Khai một nút "di chuyển" rồi bấm không thấy gì xảy ra thì đúng bằng lỗi
 * mà cả lớp này sinh ra để dẹp.
 */
export function pointTools(): readonly SandboxTool[] {
  return [
    SELECT_TOOL,
    {
      id: 'toggle-segment',
      label: '／ Nối / bỏ đoạn',
      action: {
        type: 'two',
        command: 'point/toggle-segment',
        params: ['a', 'b'],
      },
    },
  ];
}
