import { SELECT_TOOL, type SandboxTool } from '@combviz/editor';
import type { Scene } from '@combviz/schema';
import { MAX_COLOR_CLASS } from '@combviz/theme';
import { latticeOf, TILE_SHAPES } from './geometry.js';
import { LATTICE_SHAPES } from './lattice.js';
import { spreadRuleLabel, SPREAD_RULE_IDS } from './commands.js';
import type { BoardConfig } from './schema.js';

/** Hình tile bày ra thanh công cụ — tập con dễ dùng của `TILE_SHAPES`. */
const OFFERED = ['domino', 'tromino-l', 'tetromino-o', 'tetromino-t'] as const;

/**
 * Công cụ sandbox của Board engine.
 *
 * Đây là bộ công cụ mà **cả bảy engine** từng dùng chung, và đó chính là lỗi:
 * `board/paint-cells`, `board/place-tile`, `board/flip-line` không tồn tại ở
 * engine nào khác, nên ở đồ thị hay game thì mọi nút đều im lặng không làm gì.
 * Giờ chúng ở đúng chỗ của chúng.
 */
export function boardTools(scene?: Scene): readonly SandboxTool[] {
  const tools: SandboxTool[] = [SELECT_TOOL];
  const lattice = latticeOf(scene?.config as BoardConfig | undefined);
  const square = lattice === 'square';

  for (let index = 1; index <= MAX_COLOR_CLASS; index += 1) {
    tools.push({
      id: `paint-${index}`,
      label: `Tô màu ${index}`,
      swatch: index,
      action: {
        type: 'paint',
        command: 'board/paint-cells',
        idsParam: 'cells',
        params: { color_class: index },
        prefix: 'cell-',
      },
    });
  }

  tools.push({
    id: 'paint-none',
    label: 'Xoá màu',
    action: {
      type: 'paint',
      command: 'board/paint-cells',
      idsParam: 'cells',
      params: { color_class: null },
      prefix: 'cell-',
    },
  });

  // BD-08 — nút lật chùm có ở **cả ba lưới**, khác hẳn hai nhóm dưới. Chùm ô kề
  // là khái niệm mọi lưới đều có; ô vuông ba mảnh và "hàng thứ 2" thì không.
  for (const rule of SPREAD_RULE_IDS) {
    tools.push({
      id: `spread-${rule}`,
      label: `✳ ${spreadRuleLabel(rule)}`,
      action: {
        type: 'one',
        command: 'board/toggle-cross',
        idParam: 'cell',
        params: { rule },
        prefix: 'cell-',
      },
    });
  }

  // BD-09 — quân của **chính lưới đang dùng**, đọc từ `LATTICE_SHAPES`. Trước hạng
  // mục này, lưới phi vuông không có quân nào kéo thả được, nên bài lát hình thoi
  // phải khai từng hình thoi bằng một `region` và vì thế chỉ là `illustration`.
  for (const [shape, spec] of Object.entries(LATTICE_SHAPES)) {
    if (spec.lattice !== lattice) continue;
    tools.push({
      id: `tile-${shape}`,
      label: spec.label,
      action: {
        type: 'stamp',
        command: 'board/place-tile',
        idParam: 'id',
        idPrefix: 't',
        posParam: 'pos',
        params: { shape },
        prefix: 'cell-',
      },
    });
  }

  // Quân polyomino và phép lật hàng/cột chỉ có nghĩa trên lưới vuông — lệnh cũng
  // từ chối chúng ở đó. Bày nút mà lệnh từ chối là đúng cái bệnh mà lớp
  // `SandboxTool` sinh ra để dẹp, chỉ là ở dạng tinh vi hơn: nút **có** engine
  // đúng, chỉ sai lưới.
  if (!square) {
    tools.push({
      id: 'erase',
      label: 'Xoá quân',
      action: { type: 'one', command: 'board/remove', idParam: 'ids', asList: true },
    });
    return tools;
  }

  for (const shape of OFFERED) {
    // Đọc từ `TILE_SHAPES` chứ không gõ lại tên: danh sách gõ tay ở `apps/player`
    // đã từng lệch khỏi thứ engine thật sự đặt được.
    if (!Object.hasOwn(TILE_SHAPES, shape)) continue;
    tools.push({
      id: `tile-${shape}`,
      label: shape,
      action: {
        type: 'stamp',
        command: 'board/place-tile',
        idParam: 'id',
        idPrefix: 't',
        posParam: 'pos',
        params: { shape },
        prefix: 'cell-',
      },
    });
  }

  tools.push({
    id: 'erase',
    label: 'Xoá quân',
    action: { type: 'one', command: 'board/remove', idParam: 'ids', asList: true },
  });

  for (const axis of ['row', 'col'] as const) {
    tools.push({
      id: `flip-${axis}`,
      label: `⇄ Lật ${axis === 'row' ? 'hàng' : 'cột'}`,
      action: { type: 'line', command: 'board/flip-line', axis },
    });
  }

  return tools;
}
