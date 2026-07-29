import { SPACING } from './graph.js';

/**
 * Layout dựng sẵn (GR-02).
 *
 * Đây là **công cụ nháp**: chúng sinh ra toạ độ, rồi toạ độ đó được ghi thẳng
 * vào file. Player không chạy layout — vị trí đỉnh là nội dung sư phạm (hai
 * hàng để thấy đồ thị hai phía, vòng tròn để thấy đối xứng), và nội dung thì
 * không được đổi mỗi lần mở trang.
 */
export type LayoutId = 'circle' | 'grid' | 'bipartite' | 'line' | 'cycles' | 'hasse';

export interface LayoutOptions {
  /**
   * Với `cycles`: các nhóm đỉnh, mỗi nhóm xếp thành một vòng tròn riêng.
   *
   * Dùng cho hoán vị: một hoán vị vẽ trên **một** hàng thì các mũi tên chồng lên
   * nhau và chu trình — thứ duy nhất bài toán nói tới — biến mất khỏi hình. Mỗi
   * chu trình một vòng riêng thì nhìn là thấy.
   */
  readonly cycles?: readonly (readonly string[])[];
  /**
   * Với `hasse`: các tầng, từ **dưới lên** — `levels[0]` là phần tử tối tiểu.
   *
   * Sơ đồ Hasse đọc từ dưới lên: lớn hơn thì cao hơn. Trục $y$ của SVG hướng
   * xuống, nên tầng $k$ đi xuống $-k$; ghi ra đây vì đó là chỗ dễ đảo ngược mà
   * hình vẫn "trông có lý", chỉ là nói ngược quan hệ.
   */
  readonly levels?: readonly (readonly string[])[];
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
    case 'cycles':
      return cycles(options.cycles ?? [ids]);
    case 'hasse':
      return hasse(options.levels ?? [ids]);
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

/** Mỗi tầng một hàng, căn giữa theo tầng rộng nhất. */
function hasse(levels: readonly (readonly string[])[]): Map<string, [number, number]> {
  const positions = new Map<string, [number, number]>();
  const width = Math.max(1, ...levels.map((l) => l.length)) - 1;

  levels.forEach((level, k) => {
    const offset = (width - (level.length - 1)) / 2;
    level.forEach((id, i) => {
      positions.set(id, [round((i + offset) * SPACING), round(-k * SPACING * 1.2)]);
    });
  });

  return positions;
}

function line(ids: readonly string[]): Map<string, [number, number]> {
  const positions = new Map<string, [number, number]>();
  ids.forEach((id, i) => positions.set(id, [i * SPACING, 0]));
  return positions;
}

function round(value: number): number {
  // `+ 0` biến `-0` thành `0`. Không phải chuyện thẩm mỹ: toạ độ đi thẳng vào
  // file JSON, và một dấu trừ nhấp nháy theo hướng quay của vòng tròn sẽ làm
  // diff git kêu ở những dòng chẳng có gì đổi.
  return Math.round(value * 100) / 100 + 0;
}

/**
 * Mỗi nhóm một vòng tròn, các vòng xếp ngang.
 *
 * Bán kính vòng theo số đỉnh của chính nó, nên chu trình dài không bị nén còn
 * điểm bất động không phình ra thành một vòng tròn rỗng.
 */
function cycles(groups: readonly (readonly string[])[]): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const gap = SPACING * 1.6;

  // Dùng lại `circle` cho từng nhóm thay vì viết công thức bán kính thứ hai.
  // Hai công thức song song là hai thứ để lệch nhau: bản nháp đầu tiên tính bán
  // kính theo chu vi, và chu trình 2 phần tử ra hai đỉnh cách nhau 6.4 thay vì
  // 10 — gần chạm nhau, trong khi `circle` cùng số đỉnh thì không.
  const rings = groups.map((group) => circle(group));
  const widths = rings.map((ring) => {
    const xs = [...ring.values()].map(([x]) => x);
    return Math.max(SPACING, Math.max(...xs) - Math.min(...xs));
  });
  const total = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, groups.length - 1);

  let cursor = -total / 2;
  rings.forEach((ring, gi) => {
    const width = widths[gi] as number;
    const centre = cursor + width / 2;
    for (const [id, [x, y]] of ring) {
      out.set(id, [round(centre + x), y]);
    }
    cursor += width + gap;
  });

  return out;
}
