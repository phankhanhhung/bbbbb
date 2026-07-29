import type { Viewport } from '@combviz/schema';
import type { Theme } from '@combviz/theme';
import { el, text, type SvgNode } from './svg-node.js';

/**
 * Brand mark góc dưới phải (REN-03).
 *
 * Đóng vào **mọi** export từ Sandbox và người học không tắt được — hình xuất ra
 * là thứ đi xa nhất khỏi trang web (dán vào vở, slide, bài nộp), nên nó là kênh
 * nhận diện có giá trị nhất mà lại rẻ nhất.
 *
 * Hàm thuần, nằm ở tầng render để export trong browser (SBX-05) và render
 * headless (REN-01/02) dùng chung một mã — nếu không, hai đường sẽ đóng dấu ở
 * hai chỗ khác nhau.
 */
export function watermarkNodes(theme: Theme, viewport: Viewport): SvgNode[] {
  const size = Math.max(viewport.width, viewport.height) * 0.035;
  const margin = size * 0.6;

  return [
    el('g', { class: 'cv-watermark', opacity: theme.brand.watermarkOpacity }, [
      text(
        'text',
        {
          x: viewport.x + viewport.width - margin,
          y: viewport.y + viewport.height - margin,
          'text-anchor': 'end',
          'font-family': theme.type.uiFamily,
          'font-size': size,
          'font-weight': 600,
          fill: theme.emphasis.focusHalo,
        },
        theme.brand.wordmark,
      ),
    ]),
  ];
}
