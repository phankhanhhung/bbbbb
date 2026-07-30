import type { SvgNode } from './svg-node.js';

/**
 * Hộp bao của một element trong cây đã render, tính từ **hình học thật**.
 *
 * Vì sao cần nó: nội suy theo key (`interpolateNodes`) chỉ chạy khi hai cây có
 * cùng dáng. Giữa hai engine thì không — một bên vẽ ô bằng `<rect>` nằm ngay
 * dưới nhóm gốc, bên kia vẽ mỗi phần tử thành `<g>` chứa một rect và hai text,
 * sâu hơn một tầng. Nội suy hai cây ấy theo key cho ra một cú lật ở $t = 0.5$
 * chứ không phải chuyển động. Cái **chung** duy nhất giữa mọi engine là toạ độ
 * scene (G-10), nên phép biến hình xuyên engine phải nói bằng toạ độ.
 *
 * Bao phủ `rect`/`text` (x, y, width, height), `circle` (cx, cy, r) và cộng dồn
 * `translate(...)` của tổ tiên. **Không** đọc `d`, `points`, `scale` hay `rotate`:
 * hộp bao của một path đòi phân tích cả cú pháp path, và đoán sai một hộp bao thì
 * element bay tới chỗ vô lý — tệ hơn là không bay. Không tính được thì trả `null`,
 * và phía gọi phải có đường xử lý cho `null`.
 */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function nodeBox(node: SvgNode): Box | null {
  return collect(node, 0, 0);
}

/** Tâm hộp bao, hoặc `null` khi không đo được. */
export function nodeCentre(node: SvgNode): { x: number; y: number } | null {
  const box = nodeBox(node);
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
}

function collect(node: SvgNode, dx: number, dy: number): Box | null {
  const shift = translateOf(node.attrs['transform']);
  const ox = dx + shift.x;
  const oy = dy + shift.y;

  let box = ownBox(node, ox, oy);
  for (const child of node.children ?? []) {
    box = union(box, collect(child, ox, oy));
  }
  return box;
}

function ownBox(node: SvgNode, dx: number, dy: number): Box | null {
  const num = (name: string): number | null => {
    const value = node.attrs[name];
    return typeof value === 'number' ? value : null;
  };

  const cx = num('cx');
  const cy = num('cy');
  const r = num('r');
  if (cx !== null && cy !== null && r !== null) {
    return { x: cx - r + dx, y: cy - r + dy, width: 2 * r, height: 2 * r };
  }

  // Đoạn thẳng: cạnh đồ thị vẽ bằng `<line>`, và cạnh là thứ song ánh hay ghép
  // cặp nhất trong nhóm GR. Không đọc được nó thì `nodeBox` vô dụng ở đúng chỗ
  // cần nhất.
  const x1 = num('x1');
  const y1 = num('y1');
  const x2 = num('x2');
  const y2 = num('y2');
  if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
    return {
      x: Math.min(x1, x2) + dx,
      y: Math.min(y1, y2) + dy,
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }

  const path = node.attrs['d'];
  if (typeof path === 'string') return pathBox(path, dx, dy);

  const x = num('x');
  const y = num('y');
  if (x === null || y === null) return null;
  return { x: x + dx, y: y + dy, width: num('width') ?? 0, height: num('height') ?? 0 };
}

/**
 * Hộp bao của một `<path>` — **bao lồi của các điểm điều khiển**, không phải hộp
 * bao chính xác.
 *
 * Với `M`/`L` hai thứ trùng nhau. Với `C`/`Q` thì đây là một hộp **rộng hơn hoặc
 * bằng** hộp thật, vì đường Bézier luôn nằm trong bao lồi các điểm điều khiển
 * của nó. Rộng hơn thì chấp nhận được — tâm vẫn nằm đúng chỗ với đường cong đối
 * xứng, mà cạnh đồ thị thì gần như luôn đối xứng.
 *
 * Hai loại bị **từ chối** thay vì đoán: lệnh tương đối (`m`, `l`, `c`…) vì số
 * trong đó là độ lệch chứ không phải toạ độ, và cung `A` vì bảy tham số của nó
 * chỉ có hai là toạ độ. Đọc bừa cả hai sẽ cho ra một hộp trông hợp lý mà sai, và
 * một hộp sai thì tệ hơn hẳn không có hộp nào.
 */
function pathBox(d: string, dx: number, dy: number): Box | null {
  // Lệnh tương đối (chữ thường), cung `A`, và `H`/`V` — cái sau vì chúng mang
  // **một** số chứ không phải một cặp, nên chúng làm lệch pha toàn bộ phép ghép
  // toạ độ theo cặp bên dưới.
  if (/[mlhvcsqtaz]/.test(d) || /[AHV]/.test(d)) return null;

  const numbers = d.match(/-?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length < 2) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    const x = Number(numbers[i]);
    const y = Number(numbers[i + 1]);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX + dx, y: minY + dy, width: maxX - minX, height: maxY - minY };
}

function union(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

const TRANSLATE = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/;

function translateOf(transform: string | number | undefined): { x: number; y: number } {
  if (typeof transform !== 'string') return ZERO;
  const match = TRANSLATE.exec(transform);
  if (!match) return ZERO;
  return { x: Number(match[1]), y: Number(match[2]) };
}

const ZERO = { x: 0, y: 0 } as const;
