import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EMPTY_ATLAS, type LabelAtlas } from '@combviz/render';
import { ATLAS_FILE } from './commands/labels.js';

/**
 * Đọc label atlas từ kho (D-07).
 *
 * Thiếu file thì trả bảng rỗng thay vì ném: một kho chưa có bài nào dùng nhãn
 * LaTeX trong canvas là chuyện hợp lệ. Hậu quả của bảng rỗng cũng không im lặng
 * — `placeLabel` vẽ hẳn "⟨thiếu atlas: …⟩" ra hình, và `combviz labels` báo đỏ.
 */
export async function loadAtlas(root: string): Promise<LabelAtlas> {
  try {
    return JSON.parse(await readFile(join(root, ATLAS_FILE), 'utf8')) as LabelAtlas;
  } catch {
    return EMPTY_ATLAS;
  }
}
