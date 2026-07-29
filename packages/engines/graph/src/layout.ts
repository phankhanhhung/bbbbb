import { SPACING } from './graph.js';

/**
 * Layout dựng sẵn (GR-02).
 *
 * Đây là **công cụ nháp**: chúng sinh ra toạ độ, rồi toạ độ đó được ghi thẳng
 * vào file. Player không chạy layout — vị trí đỉnh là nội dung sư phạm (hai
 * hàng để thấy đồ thị hai phía, vòng tròn để thấy đối xứng), và nội dung thì
 * không được đổi mỗi lần mở trang.
 */
export type LayoutId = 'circle' | 'grid' | 'bipartite' | 'line';

export interface LayoutOptions {
  /** Với `bipartite`: id các đỉnh thuộc phía trên. Còn lại xuống phía dưới. */
  readonly topSide?: readonly string[];
  /** Với `grid`: số cột. Vắng thì lấy xấp xỉ căn bậc hai. */
  readonly columns?: number;
}

export function layoutPositions(
  ids: readonly string[],
  layout: LayoutId,
  options: LayoutOptions = {},
): Map<string, [number, number]> {
  switch (layout) {
    case 'circle':
      return circle(ids);
    case 'grid':
      return grid(ids, options.columns);
    case 'bipartite':
      return bipartite(ids, options.topSide ?? []);
    case 'line':
      return line(ids);
  }
}

function circle(ids: readonly string[]): Map<string, [number, number]> {
  const n = ids.length;
  // Bán kính đủ để hai đỉnh kề nhau cách nhau đúng một khoảng chuẩn — vòng tròn
  // 3 đỉnh và vòng tròn 12 đỉnh phải trông cùng một "mật độ".
  const radius = n <= 1 ? 0 : SPACING / (2 * Math.sin(Math.PI / n));
  const positions = new Map<string, [number, number]>();

  ids.forEach((id, i) => {
    // Bắt đầu từ đỉnh trên cùng và đi thuận chiều kim đồng hồ: đó là thứ tự mà
    // người đọc mong đợi khi tác giả đánh số $v_1, v_2, \dots$
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    positions.set(id, [
      round(radius * Math.cos(angle)),
      round(radius * Math.sin(angle)),
    ]);
  });

  return positions;
}

function grid(ids: readonly string[], columns?: number): Map<string, [number, number]> {
  const cols = columns ?? Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  const positions = new Map<string, [number, number]>();

  ids.forEach((id, i) => {
    positions.set(id, [(i % cols) * SPACING, Math.floor(i / cols) * SPACING]);
  });

  return positions;
}

function bipartite(
  ids: readonly string[],
  topSide: readonly string[],
): Map<string, [number, number]> {
  const top = new Set(topSide);
  const upper = ids.filter((id) => top.has(id));
  const lower = ids.filter((id) => !top.has(id));
  const positions = new Map<string, [number, number]>();

  // Căn giữa hai hàng theo nhau: hàng 3 đỉnh và hàng 5 đỉnh lệch nhau sẽ làm mắt
  // đọc nhầm rằng có một tương ứng vị trí nào đó giữa hai phía.
  const width = Math.max(upper.length, lower.length) - 1;
  const place = (row: readonly string[], y: number): void => {
    const offset = (width - (row.length - 1)) / 2;
    row.forEach((id, i) => {
      positions.set(id, [round((i + offset) * SPACING), y]);
    });
  };

  place(upper, 0);
  place(lower, SPACING * 2);

  return positions;
}

function line(ids: readonly string[]): Map<string, [number, number]> {
  const positions = new Map<string, [number, number]>();
  ids.forEach((id, i) => positions.set(id, [i * SPACING, 0]));
  return positions;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
