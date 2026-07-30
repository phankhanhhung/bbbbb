import { describe, expect, it } from 'vitest';
import { command, createEditorState, execute } from '@combviz/editor';
import { tryEvaluate, DETERMINISTIC_BUDGET } from '@combviz/dsl';
import { createContext, createRenderer, walk } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import { boardCommands } from '../src/commands.js';
import { boardEnvironment } from '../src/dsl.js';
import { boardHitTest } from '../src/hit-test.js';
import { boardSchemaFragment } from '../src/index.js';
import { resolveBoardValidator } from '../src/validators.js';
import { boardRenderer } from '../src/render.js';
import { boardTools } from '../src/tools.js';
import { CELL, cellColorClass, outlinePath, tileOffsets, type Offset } from '../src/geometry.js';
import {
  cellAt,
  cellCount,
  cellPolygon,
  cellsInRow,
  centreOf,
  directionCount,
  inBoard,
  latticeExtent,
  latticeTileCells,
  neighbours,
  oppositeDirection,
  outlineOfCells,
  step,
  type Lattice,
} from '../src/lattice.js';
import type { BoardConfig } from '../src/schema.js';

/**
 * Lưới tam giác và lục giác (BD-07).
 *
 * Phần lớn test ở đây là **bất biến hình học**, không phải giá trị tra bảng: ô
 * phải lát kín mặt phẳng, chạm vào tâm ô phải trúng chính ô ấy, quan hệ kề phải
 * đối xứng. Lý do chọn kiểu test này: hình sai trên lưới mới không nổ ở đâu cả —
 * nó chỉ vẽ ra một hình trông lạ, mà "trông lạ" thì người viết code là người cuối
 * cùng nhận ra.
 */
/** Mọi ô của một bàn. */
function allCells(lattice: Lattice, rows: number, cols: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cellsInRow(lattice, cols, r); c += 1) out.push([r, c]);
  }
  return out;
}

describe('đếm ô', () => {
  it('vuông và lục giác: mọi hàng bằng nhau; tam giác: hàng $r$ có $2r+1$ ô', () => {
    expect(cellsInRow('square', 6, 3)).toBe(6);
    expect(cellsInRow('hex', 6, 3)).toBe(6);
    expect([0, 1, 2, 3].map((r) => cellsInRow('triangle', 5, r))).toEqual([1, 3, 5, 7]);
  });

  it('tam giác cạnh $n$ có đúng $n^2$ ô — nên `rows × cols` vẫn đếm đúng', () => {
    for (const n of [1, 2, 5, 9, 20]) {
      expect({ n, cells: allCells('triangle', n, n).length }).toEqual({ n, cells: n * n });
      expect(cellCount('triangle', n, n)).toBe(n * n);
    }
  });

  it('`inBoard` chặn đúng mép của từng lưới', () => {
    expect(inBoard('triangle', 5, 5, 2, 4)).toBe(true);
    expect(inBoard('triangle', 5, 5, 2, 5)).toBe(false);
    expect(inBoard('hex', 5, 6, 4, 5)).toBe(true);
    expect(inBoard('hex', 5, 6, 5, 0)).toBe(false);
    expect(inBoard('square', 5, 6, -1, 0)).toBe(false);
  });
});

describe('quy ước G-10 giữ nguyên ở cả ba lưới', () => {
  it('hai ô kề ngang cách nhau đúng một `CELL`', () => {
    // Đây là điều kiện để lớp `scale.ts` không phải biết engine đang vẽ lưới gì:
    // một bàn vuông 8×8 và một bàn ong 8×8 phải ra cùng cỡ trên màn hình.
    for (const lattice of ['square', 'hex'] as const) {
      const a = centreOf(lattice, 8, 8, 3, 2);
      const b = centreOf(lattice, 8, 8, 3, 3);
      expect({ lattice, dx: b.x - a.x }).toEqual({ lattice, dx: CELL });
    }
    // Lưới tam giác: **cạnh** ô bằng `CELL`, nên hai ô cùng chiều cách nhau `CELL`.
    const up0 = centreOf('triangle', 6, 6, 4, 0);
    const up1 = centreOf('triangle', 6, 6, 4, 2);
    expect(up1.x - up0.x).toBeCloseTo(CELL, 10);
  });

  it('cạnh ô đúng bằng `CELL` ở lưới vuông và tam giác, bề ngang ô ở lưới lục giác', () => {
    const side = (poly: readonly { x: number; y: number }[], i: number): number => {
      const a = poly[i] as { x: number; y: number };
      const b = poly[(i + 1) % poly.length] as { x: number; y: number };
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    expect(side(cellPolygon('square', 4, 4, 1, 1), 0)).toBeCloseTo(CELL, 10);
    expect(side(cellPolygon('triangle', 4, 4, 2, 0), 0)).toBeCloseTo(CELL, 10);

    const hex = cellPolygon('hex', 4, 4, 1, 1);
    const xs = hex.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(CELL, 10);
  });

  it('`latticeExtent` khớp hộp bao thật của mọi ô', () => {
    for (const [lattice, rows, cols] of [
      ['square', 5, 7],
      ['hex', 5, 7],
      ['triangle', 6, 6],
    ] as const) {
      const points = allCells(lattice, rows, cols).flatMap(([r, c]) =>
        cellPolygon(lattice, rows, cols, r, c),
      );
      const width = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
      const height = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
      const extent = latticeExtent(lattice, rows, cols);
      expect({ lattice, w: extent.width - width, h: extent.height - height }).toEqual({
        lattice,
        w: expect.closeTo(0, 6) as unknown as number,
        h: expect.closeTo(0, 6) as unknown as number,
      });
    }
  });
});

describe('chạm', () => {
  it('chạm vào tâm ô thì trúng đúng ô ấy, ở cả ba lưới', () => {
    for (const [lattice, rows, cols] of [
      ['square', 5, 7],
      ['hex', 5, 7],
      ['triangle', 6, 6],
    ] as const) {
      for (const [r, c] of allCells(lattice, rows, cols)) {
        const centre = centreOf(lattice, rows, cols, r, c);
        expect({ lattice, r, c, hit: cellAt(lattice, rows, cols, centre) }).toEqual({
          lattice,
          r,
          c,
          hit: [r, c],
        });
      }
    }
  });

  it('chạm gần một đỉnh vẫn trúng **một** ô có thật', () => {
    // Không đòi trúng ô nào cụ thể — ba ô gặp nhau ở đó — chỉ đòi không trả ô
    // ngoài bàn và không trả `null` cho một điểm rõ ràng nằm trong hình.
    for (const [lattice, rows, cols] of [
      ['hex', 5, 7],
      ['triangle', 6, 6],
    ] as const) {
      for (const [r, c] of allCells(lattice, rows, cols)) {
        const centre = centreOf(lattice, rows, cols, r, c);
        for (const vertex of cellPolygon(lattice, rows, cols, r, c)) {
          const point = {
            x: centre.x + (vertex.x - centre.x) * 0.7,
            y: centre.y + (vertex.y - centre.y) * 0.7,
          };
          const hit = cellAt(lattice, rows, cols, point);
          expect({ lattice, r, c, ok: hit !== null && inBoard(lattice, rows, cols, hit[0], hit[1]) })
            .toEqual({ lattice, r, c, ok: true });
        }
      }
    }
  });

  it('chạm ngoài bàn trả `null`, không trả ô mép gần nhất', () => {
    expect(cellAt('hex', 4, 4, { x: -50, y: -50 })).toBeNull();
    expect(cellAt('hex', 4, 4, { x: 500, y: 5 })).toBeNull();
    expect(cellAt('triangle', 4, 4, { x: 0.5, y: 0.5 })).toBeNull();
    expect(cellAt('triangle', 4, 4, { x: 20, y: -5 })).toBeNull();
    expect(cellAt('square', 4, 4, { x: 45, y: 5 })).toBeNull();
  });
});

describe('quan hệ kề', () => {
  it('đối xứng: $b$ kề $a$ thì $a$ kề $b$', () => {
    for (const [lattice, rows, cols] of [
      ['square', 5, 6],
      ['hex', 5, 6],
      ['triangle', 6, 6],
    ] as const) {
      for (const [r, c] of allCells(lattice, rows, cols)) {
        for (const [nr, nc] of neighbours(lattice, rows, cols, r, c)) {
          const back = neighbours(lattice, rows, cols, nr, nc);
          expect({ lattice, from: [r, c], to: [nr, nc], symmetric: back.some(([a, b]) => a === r && b === c) })
            .toEqual({ lattice, from: [r, c], to: [nr, nc], symmetric: true });
        }
      }
    }
  });

  it('số láng giềng trong lòng bàn: vuông 4, lục giác 6, tam giác **3**', () => {
    expect(neighbours('square', 6, 6, 2, 2)).toHaveLength(4);
    expect(neighbours('hex', 6, 6, 2, 2)).toHaveLength(6);
    expect(neighbours('triangle', 8, 8, 5, 4)).toHaveLength(3);
    expect(neighbours('triangle', 8, 8, 5, 5)).toHaveLength(3);
  });

  it('ô kề nhau thì **dùng chung một cạnh** — không chỉ chạm đỉnh', () => {
    for (const [lattice, rows, cols] of [
      ['square', 5, 6],
      ['hex', 5, 6],
      ['triangle', 6, 6],
    ] as const) {
      for (const [r, c] of allCells(lattice, rows, cols)) {
        const mine = edgeSet(cellPolygon(lattice, rows, cols, r, c));
        for (const [nr, nc] of neighbours(lattice, rows, cols, r, c)) {
          const theirs = edgeSet(cellPolygon(lattice, rows, cols, nr, nc));
          const shared = [...mine].filter((e) => theirs.has(e));
          expect({ lattice, a: [r, c], b: [nr, nc], shared: shared.length }).toEqual({
            lattice,
            a: [r, c],
            b: [nr, nc],
            shared: 1,
          });
        }
      }
    }
  });
});

/**
 * Hướng đi (BD-09).
 *
 * Đây là tầng mà quân ghép trên lưới phi vuông đứng lên, nên test ở đây là **bất
 * biến đại số**, không phải giá trị tra bảng: bước theo một hướng rồi bước ngược
 * lại phải về chỗ cũ, và mọi hướng phải trỏ tới một ô **kề** thật sự. Hai điều đó
 * đúng thì hình thoi không thể rời khỏi lưới, dù đặt ở đâu.
 */
describe('hướng đi', () => {
  const LATTICES = [
    ['square', 6, 6],
    ['hex', 6, 6],
    ['triangle', 7, 7],
  ] as const;

  it('đi rồi quay lại thì về đúng chỗ cũ — ở mọi ô, mọi hướng, cả ba lưới', () => {
    for (const [lattice, rows, cols] of LATTICES) {
      for (const [r, c] of allCells(lattice, rows, cols)) {
        for (let d = 0; d < directionCount(lattice); d += 1) {
          const [nr, nc] = step(lattice, r, c, d);
          const back = step(lattice, nr, nc, oppositeDirection(lattice, d));
          expect({ lattice, from: [r, c], d, back }).toEqual({
            lattice,
            from: [r, c],
            d,
            back: [r, c],
          });
        }
      }
    }
  });

  it('mọi hướng trỏ tới một ô **kề** — `step` và `neighbours` cùng một quan hệ', () => {
    for (const [lattice, rows, cols] of LATTICES) {
      for (const [r, c] of allCells(lattice, rows, cols)) {
        const near = neighbours(lattice, rows, cols, r, c);
        const stepped: string[] = [];
        for (let d = 0; d < directionCount(lattice); d += 1) {
          const [nr, nc] = step(lattice, r, c, d);
          if (inBoard(lattice, rows, cols, nr, nc)) stepped.push(`${nr},${nc}`);
        }
        // Cùng **tập** ô: `neighbours` lọc biên còn `step` không, nên chỉ so được
        // sau khi lọc. Số lượng bằng nhau thì không có hướng nào trùng hướng nào.
        expect({ lattice, at: [r, c], set: [...stepped].sort() }).toEqual({
          lattice,
          at: [r, c],
          set: near.map(([a, b]) => `${a},${b}`).sort(),
        });
      }
    }
  });

  it('trên lưới tam giác, hướng qua cạnh ngang **tự nghịch đảo**', () => {
    // Không phải trường hợp đặc biệt phải nhớ: lưới tam giác có hai loại ô, và
    // hướng 2 đưa loại này sang loại kia rồi ngược lại.
    expect(oppositeDirection('triangle', 2)).toBe(2);
    expect(step('triangle', 3, 4, 2)).toEqual([4, 5]);
    expect(step('triangle', 4, 5, 2)).toEqual([3, 4]);
  });

  it('chỉ số hướng cuộn vòng, kể cả số âm', () => {
    for (const [lattice] of LATTICES) {
      const n = directionCount(lattice);
      expect(step(lattice, 3, 3, n)).toEqual(step(lattice, 3, 3, 0));
      expect(step(lattice, 3, 3, -1)).toEqual(step(lattice, 3, 3, n - 1));
    }
  });
});

/**
 * Quân ghép trên lưới phi vuông (BD-09).
 *
 * Điểm cần chứng minh không phải "hình thoi gồm hai ô" — mà là **tịnh tiến không
 * bảo toàn hình** trên lưới tam giác, tức là lý do cả mô hình offset của polyomino
 * không dùng lại được. Có test nói ra điều đó thì ai định "đơn giản hoá" bằng cách
 * gộp hai họ hình sẽ thấy ngay vì sao không gộp được.
 */
describe('quân ghép trên lưới phi vuông', () => {
  it('hình thoi gồm đúng hai ô kề nhau, ở cả ba hướng', () => {
    for (let dir = 0; dir < 3; dir += 1) {
      const cells = latticeTileCells('triangle', 'lozenge', dir, 3, 2);
      expect({ dir, size: cells.length }).toEqual({ dir, size: 2 });
      const [a, b] = cells as [Offset, Offset];
      expect({
        dir,
        adjacent: neighbours('triangle', 8, 8, a[0], a[1]).some(
          ([r, c]) => r === b[0] && c === b[1],
        ),
      }).toEqual({ dir, adjacent: true });
    }
  });

  it('ba hướng cho **ba** hình thoi khác nhau, và đó là tất cả hình thoi chứa ô ấy', () => {
    const sets = new Set<string>();
    for (let dir = 0; dir < 3; dir += 1) {
      sets.add(
        latticeTileCells('triangle', 'lozenge', dir, 4, 3)
          .map(([r, c]) => `${r},${c}`)
          .sort()
          .join('|'),
      );
    }
    // Một tam giác có đúng ba cạnh ⇒ đúng ba hình thoi chứa nó. Không thiếu tư
    // thế nào, không thừa tư thế nào.
    expect(sets.size).toBe(3);
    expect(neighbours('triangle', 8, 8, 4, 3)).toHaveLength(3);
  });

  it('**tịnh tiến không bảo toàn hình** — lý do mô hình offset không dùng lại được', () => {
    // Cùng `dir`, hai ô neo khác tính chẵn lẻ ⇒ hai hình khác nhau. Với polyomino
    // trên lưới vuông thì điều này không bao giờ xảy ra.
    const fromUp = latticeTileCells('triangle', 'lozenge', 2, 3, 2);
    const fromDown = latticeTileCells('triangle', 'lozenge', 2, 3, 3);

    const shape = (cells: readonly Offset[]): string => {
      const [a, b] = cells as [Offset, Offset];
      return `${b[0] - a[0]},${b[1] - a[1]}`;
    };
    expect(shape(fromUp)).not.toBe(shape(fromDown));

    // Còn trên lưới vuông thì hình **giữ nguyên**: đó là điều làm cho `translate`
    // của renderer hợp lệ ở đó và không hợp lệ ở đây.
    const sq = (r: number, c: number): string =>
      tileOffsets('domino', 0, false)
        .map(([dr, dc]) => `${r + dr},${c + dc}`)
        .join('|');
    expect(sq(0, 0)).toBe('0,0|0,1');
    expect(sq(1, 1)).toBe('1,1|1,2');
  });

  it('hình đặt sai lưới trả về **rỗng**, không trả về hình méo', () => {
    expect(latticeTileCells('square', 'lozenge', 0, 1, 1)).toEqual([]);
    expect(latticeTileCells('hex', 'lozenge', 0, 1, 1)).toEqual([]);
    expect(latticeTileCells('triangle', 'khong-co-hinh-nay', 0, 1, 1)).toEqual([]);
    // Tra qua prototype cũng không lọt.
    expect(latticeTileCells('triangle', 'toString', 0, 1, 1)).toEqual([]);
  });

  it('phủ kín một tam giác cạnh 2 bằng hai hình thoi là **không** làm được', () => {
    // Tam giác cạnh $n$ có $n(n+1)/2$ ô ngửa và $n(n-1)/2$ ô úp; mỗi hình thoi phủ
    // đúng một ô mỗi loại. Hai số ấy chỉ bằng nhau khi $n = 0$ — chính là bài
    // `triangle-lozenge-parity`. Ở đây kiểm bằng cách đếm, trên lưới thật.
    for (const n of [2, 3, 4, 5]) {
      let up = 0;
      let down = 0;
      for (const [, c] of allCells('triangle', n, n)) {
        if (c % 2 === 0) up += 1;
        else down += 1;
      }
      expect({ n, up, down }).toEqual({ n, up: (n * (n + 1)) / 2, down: (n * (n - 1)) / 2 });
    }
  });
});

function edgeSet(poly: readonly { x: number; y: number }[]): Set<string> {
  const out = new Set<string>();
  poly.forEach((from, i) => {
    const to = poly[(i + 1) % poly.length] as { x: number; y: number };
    const a = `${round(from.x)},${round(from.y)}`;
    const b = `${round(to.x)},${round(to.y)}`;
    out.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  });
  return out;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}

describe('đường bao một tập ô', () => {
  const segments = (path: string): Set<string> =>
    new Set(
      [...path.matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)].map((m) => {
        const a = `${Number(m[1])},${Number(m[2])}`;
        const b = `${Number(m[3])},${Number(m[4])}`;
        return a < b ? `${a}|${b}` : `${b}|${a}`;
      }),
    );

  it('trên lưới vuông, khớp **từng đoạn** với `outlinePath` của polyomino', () => {
    // Hai hàm cùng tồn tại là có chủ ý — một chạy trên offset của quân chưa đặt,
    // một chạy trên ô của bàn cụ thể. Test này là thứ giữ chúng khỏi trôi khỏi
    // nhau: "hai bản cài đặt của một ý tưởng" chỉ chấp nhận được khi có ràng buộc
    // ép chúng bằng nhau.
    for (const cells of [
      [[0, 0]],
      [[0, 0], [0, 1]],
      [[0, 0], [0, 1], [1, 0]],
      [[0, 0], [0, 1], [0, 2], [1, 1]],
      [[0, 0], [1, 1]],
    ] as [number, number][][]) {
      expect(segments(outlineOfCells('square', 6, 6, cells))).toEqual(
        segments(outlinePath(cells)),
      );
    }
  });

  it('lozenge trên lưới tam giác là **bốn** cạnh, không phải sáu', () => {
    // Hai tam giác kề nhau ghép thành hình thoi: cạnh chung bị loại, còn đúng 4.
    expect(segments(outlineOfCells('triangle', 5, 5, [[3, 2], [3, 3]])).size).toBe(4);
    // Rời nhau thì không có cạnh chung nào để loại.
    expect(segments(outlineOfCells('triangle', 5, 5, [[3, 0], [3, 4]])).size).toBe(6);
  });

  it('ba ô lục giác kề nhau: bỏ đúng ba cạnh chung', () => {
    expect(segments(outlineOfCells('hex', 5, 5, [[1, 1], [1, 2], [2, 2]])).size).toBe(
      6 * 3 - 2 * 3,
    );
  });

  it('ô ngoài bàn bị bỏ qua, không sinh cạnh ma', () => {
    expect(outlineOfCells('triangle', 3, 3, [[2, 99]])).toBe('');
  });
});

describe('tô màu theo lưới', () => {
  const colorOf = (config: BoardConfig, r: number, c: number): number | undefined =>
    cellColorClass(config, r, c);

  it('lưới tam giác: `checkerboard` là **hướng lên / hướng xuống**', () => {
    const config = {
      lattice: 'triangle',
      rows: 4,
      cols: 4,
      coloring_preset: { type: 'checkerboard' },
    } as unknown as BoardConfig;
    for (const [r, c] of allCells('triangle', 4, 4)) {
      expect({ r, c, color: colorOf(config, r, c) }).toEqual({
        r,
        c,
        color: c % 2 === 0 ? 1 : 2,
      });
    }
  });

  it('lưới lục giác: `diag-left` với $k=3$ là phép tô **ba màu thật**', () => {
    // Hai ô kề nhau không bao giờ cùng màu. Đây là lý do chỉ số phải đọc theo toạ
    // độ trục: với chỉ số cột thô, $r + c$ cho hai ô kề nhau **cùng** màu — một
    // hình trông hệt phép tô ba màu kinh điển và sai.
    const config = {
      lattice: 'hex',
      rows: 7,
      cols: 7,
      coloring_preset: { type: 'stripes', orientation: 'diag-left', k: 3 },
    } as unknown as BoardConfig;

    for (const [r, c] of allCells('hex', 7, 7)) {
      for (const [nr, nc] of neighbours('hex', 7, 7, r, c)) {
        expect({ a: [r, c], b: [nr, nc], same: colorOf(config, r, c) === colorOf(config, nr, nc) })
          .toEqual({ a: [r, c], b: [nr, nc], same: false });
      }
    }
  });

  it('chỉ số cột thô **không** tô được ba màu — đó là lỗi đã tránh', () => {
    // Giữ lại bằng chứng: nếu ai đó bỏ toạ độ trục đi, test trên sẽ đỏ, và test
    // này giải thích vì sao.
    let clash = 0;
    for (const [r, c] of allCells('hex', 7, 7)) {
      for (const [nr, nc] of neighbours('hex', 7, 7, r, c)) {
        if ((r + c) % 3 === (nr + nc) % 3) clash += 1;
      }
    }
    expect(clash).toBeGreaterThan(0);
  });
});

/**
 * Nối lưới mới vào phần còn lại của engine.
 *
 * Ba tính năng của board chỉ có nghĩa trên lưới vuông, và cả ba **hỏng lặng lẽ**
 * chứ không nổ: quân domino vẫn vẽ ra một hình chữ nhật nằm chồng lên mấy ô méo,
 * bảng vẫn kẻ hàng cột thẳng lên bàn ong, dấu khống chế vẫn rải theo luật cờ vua.
 * Nên chúng bị chặn ở **hai** chỗ: `checkBounds` lúc soạn, và chính lệnh lúc chạy.
 */
describe('nối lưới vào engine', () => {
  const renderer = createRenderer([boardRenderer]);
  const ctx = createContext(defaultTheme);

  const scene = (config: Record<string, unknown>, elements: unknown[] = []): Scene => ({
    engine: 'board',
    config,
    elements: elements as Scene['elements'],
  });

  const codes = (s: Scene): string[] =>
    boardSchemaFragment.checkBounds(s, '').map((i) => i.code);

  it('tam giác đòi `cols` bằng `rows`', () => {
    expect(codes(scene({ lattice: 'triangle', rows: 5, cols: 5 }))).toEqual([]);
    expect(codes(scene({ lattice: 'triangle', rows: 5, cols: 9 }))).toContain(
      'bounds/triangle-cols-mismatch',
    );
  });

  it('lưới lục giác **không** tô được hai màu, và bound nói ra', () => {
    expect(
      codes(scene({ lattice: 'hex', rows: 4, cols: 4, coloring_preset: { type: 'checkerboard' } })),
    ).toContain('bounds/checkerboard-on-hex');
    // Trên lưới tam giác thì tô được — đó là phép tô hướng lên / hướng xuống.
    expect(
      codes(scene({ lattice: 'triangle', rows: 4, cols: 4, coloring_preset: { type: 'checkerboard' } })),
    ).toEqual([]);
  });

  it('polyomino, bảng và luật đi quân bị chặn trên lưới phi vuông', () => {
    const tile = { id: 't1', type: 'tile', shape: 'domino', pos: [1, 1], rot: 0 };
    const knight = { id: 'k', type: 'piece', kind: 'knight', pos: [1, 1], show_attacks: true };

    expect(codes(scene({ lattice: 'hex', rows: 4, cols: 4 }, [tile]))).toContain(
      'bounds/tile-needs-square',
    );
    expect(codes(scene({ lattice: 'hex', rows: 4, cols: 4 }, [knight]))).toContain(
      'bounds/attacks-need-square',
    );
    expect(
      codes(scene({ lattice: 'hex', rows: 4, cols: 4, table: { show_sums: true } })),
    ).toContain('bounds/table-needs-square');

    // Cùng ba thứ ấy trên lưới vuông thì không sao.
    expect(codes(scene({ rows: 4, cols: 4 }, [tile, knight]))).toEqual([]);
  });

  it('lệnh cũng từ chối, không chỉ bound', () => {
    // Bound bắt lúc soạn; sandbox thì người học tự bấm, và ở đó không có ai đọc
    // danh sách lỗi. Hai lớp cho một luật.
    const hex = scene({ lattice: 'hex', rows: 4, cols: 4 });
    const run = (s: Scene, type: string, params: unknown): Scene | null => {
      const r = execute(createEditorState(s), boardCommands, command(type, params));
      return r.applied ? r.state.scene : null;
    };
    expect(run(hex, 'board/place-tile', { id: 't', shape: 'domino', pos: [0, 0] })).toBeNull();
    expect(run(hex, 'board/flip-line', { axis: 'row', index: 0 })).toBeNull();
    // Tô màu thì vẫn được — nó không giả định hình ô.
    expect(run(hex, 'board/paint-cells', { cells: ['cell-1-1'], color_class: 3 })).not.toBeNull();
  });

  it('thanh công cụ bỏ nút polyomino và nút lật trên lưới phi vuông', () => {
    const ids = (s: Scene): string[] => boardTools(s).map((t) => t.id);
    expect(ids(scene({ rows: 4, cols: 4 }))).toContain('tile-domino');
    expect(ids(scene({ lattice: 'hex', rows: 4, cols: 4 }))).not.toContain('tile-domino');
    expect(ids(scene({ lattice: 'triangle', rows: 4, cols: 4 }))).not.toContain('flip-row');
    // Nhưng vẫn có tô màu và xoá — hai thứ không giả định hình ô.
    expect(ids(scene({ lattice: 'hex', rows: 4, cols: 4 }))).toContain('paint-1');
    expect(ids(scene({ lattice: 'hex', rows: 4, cols: 4 }))).toContain('erase');
    // BD-08: nút lật chùm thì **có** ở mọi lưới — chùm ô kề là khái niệm lưới nào
    // cũng có, khác hẳn "hàng thứ 2" hay quân domino.
    for (const config of [
      { rows: 4, cols: 4 },
      { lattice: 'hex', rows: 4, cols: 4 },
      { lattice: 'triangle', rows: 4, cols: 4 },
    ]) {
      expect({ config, ids: ids(scene(config)).includes('spread-cross') }).toEqual({
        config,
        ids: true,
      });
    }
  });

  /**
   * BD-08 trên ba lưới — lãi trực tiếp của BD-07.
   *
   * Lệnh lật chùm không biết mình đang chạy trên lưới nào; nó hỏi `neighbours()`.
   * Vì thế "bấm một ô đổi bao nhiêu ô" là câu hỏi của **hình học**, và test này
   * kiểm đúng điều đó thay vì kiểm ba con số gõ tay: số ô đổi phải bằng
   * $1 + \deg$, với $\deg$ đọc từ chính module lưới.
   */
  it('lật chùm chạy đúng trên cả ba lưới mà không viết ba lần', () => {
    const run = (s: Scene, params: unknown): Scene | null => {
      const r = execute(createEditorState(s), boardCommands, command('board/toggle-cross', params));
      return r.applied ? r.state.scene : null;
    };

    for (const [lattice, rows, cols, row, col] of [
      ['square', 4, 4, 1, 1],
      ['hex', 5, 5, 2, 2],
      ['triangle', 4, 4, 2, 2],
    ] as const) {
      const config = { ...(lattice === 'square' ? {} : { lattice }), rows, cols };
      const after = run(scene(config), { cell: `cell-${row}-${col}` })!;
      const changed = allCells(lattice, rows, cols).filter(
        ([r, c]) => cellColorClass(after.config as BoardConfig, r, c) === 2,
      ).length;

      expect({ lattice, changed }).toEqual({
        lattice,
        changed: 1 + neighbours(lattice, rows, cols, row, col).length,
      });
    }
  });

  it('BD-09 — hình thoi đặt được trên lưới tam giác, polyomino thì không, và ngược lại', () => {
    const run = (s: Scene, type: string, params: unknown): Scene | null => {
      const r = execute(createEditorState(s), boardCommands, command(type, params));
      return r.applied ? r.state.scene : null;
    };
    const tri = scene({ lattice: 'triangle', rows: 4, cols: 4 });
    const sq = scene({ rows: 4, cols: 4 });

    expect(run(tri, 'board/place-tile', { id: 't', shape: 'lozenge', pos: [2, 2] })).not.toBeNull();
    expect(run(tri, 'board/place-tile', { id: 't', shape: 'domino', pos: [2, 2] })).toBeNull();
    // Chiều ngược lại cũng bị chặn: hình thoi trên bàn vuông vô nghĩa y như vậy.
    expect(run(sq, 'board/place-tile', { id: 't', shape: 'lozenge', pos: [1, 1] })).toBeNull();
  });

  it('BD-09 — quân lưới mang `dir`, **không** mang `rot`; xoay là đổi nấc hướng', () => {
    const run = (s: Scene, type: string, params: unknown): Scene | null => {
      const r = execute(createEditorState(s), boardCommands, command(type, params));
      return r.applied ? r.state.scene : null;
    };
    const tri = scene({ lattice: 'triangle', rows: 5, cols: 5 });

    const placed = run(tri, 'board/place-tile', {
      id: 't',
      shape: 'lozenge',
      pos: [3, 2],
      rot: 90,
    })!;
    const tile = placed.elements[0] as Record<string, unknown>;
    expect(tile['dir']).toBe(0);
    // `rot: 90` truyền vào bị **bỏ**, không được ghi im lặng: một quân mang cả hai
    // là một quân không có tư thế xác định.
    expect(tile['rot']).toBeUndefined();

    // Ba nấc rồi về chỗ cũ — nhóm quay của lưới tam giác, không phải của lưới vuông.
    let cursor = placed;
    const seen: unknown[] = [];
    for (let i = 0; i < 3; i += 1) {
      cursor = run(cursor, 'board/rotate-tile', { id: 't', delta: 90 })!;
      seen.push((cursor.elements[0] as Record<string, unknown>)['dir']);
    }
    expect(seen).toEqual([1, 2, 0]);

    // Lật thì bị từ chối hẳn: hình thoi đối xứng tâm nên lật ra chính nó.
    expect(run(placed, 'board/flip-tile', { id: 't' })).toBeNull();
  });

  it('BD-09 — validator chồng lấn và tràn biên hiểu đúng hình thoi', () => {
    const overlap = scene({ lattice: 'triangle', rows: 4, cols: 4 }, [
      { id: 'a', type: 'tile', shape: 'lozenge', pos: [3, 2], dir: 1 },
      { id: 'b', type: 'tile', shape: 'lozenge', pos: [3, 3], dir: 0 },
    ]);
    // Cả hai cùng chứa ô (3,3) ⇒ chồng nhau, dù `pos` khác nhau.
    expect(resolveBoardValidator('tiles-no-overlap')!.check(overlap).ok).toBe(false);

    // Thò ra khỏi **cạnh xiên**: cột 7 không tồn tại ở hàng 3 (chỉ có 7 ô, 0..6),
    // nhưng vẫn nhỏ hơn `cols` = 4 × ... — so bằng chữ nhật là bỏ sót.
    const spill = scene({ lattice: 'triangle', rows: 4, cols: 4 }, [
      { id: 'a', type: 'tile', shape: 'lozenge', pos: [3, 6], dir: 1 },
    ]);
    expect(resolveBoardValidator('tiles-in-bounds')!.check(spill).ok).toBe(false);
  });

  it('BD-09 — bound bắt lẫn `rot`/`dir` và hình đặt sai lưới', () => {
    expect(
      codes(
        scene({ lattice: 'triangle', rows: 4, cols: 4 }, [
          { id: 'a', type: 'tile', shape: 'lozenge', pos: [2, 2], rot: 90 },
        ]),
      ),
    ).toContain('bounds/rot-on-lattice-shape');

    expect(
      codes(scene({ rows: 4, cols: 4 }, [{ id: 'a', type: 'tile', shape: 'domino', pos: [1, 1], rot: 0, dir: 2 }])),
    ).toContain('bounds/dir-on-polyomino');

    expect(
      codes(scene({ lattice: 'hex', rows: 4, cols: 4 }, [{ id: 'a', type: 'tile', shape: 'lozenge', pos: [1, 1] }])),
    ).toContain('bounds/shape-wrong-lattice');

    expect(
      codes(
        scene({ lattice: 'triangle', rows: 4, cols: 4 }, [
          { id: 'a', type: 'tile', shape: 'lozenge', pos: [2, 2], dir: 4 },
        ]),
      ),
    ).toContain('bounds/dir-out-of-range');

    // Và một hình thoi khai đúng thì sạch — bound không bắt oan.
    expect(
      codes(
        scene({ lattice: 'triangle', rows: 4, cols: 4 }, [
          { id: 'a', type: 'tile', shape: 'lozenge', pos: [2, 2], dir: 1 },
        ]),
      ),
    ).toEqual([]);
  });

  it('BD-09 — thanh công cụ bày quân của **đúng lưới đang dùng**', () => {
    const ids = (s: Scene): string[] => boardTools(s).map((t) => t.id);
    expect(ids(scene({ lattice: 'triangle', rows: 4, cols: 4 }))).toContain('tile-lozenge');
    expect(ids(scene({ lattice: 'hex', rows: 4, cols: 4 }))).not.toContain('tile-lozenge');
    expect(ids(scene({ rows: 4, cols: 4 }))).not.toContain('tile-lozenge');
  });

  it('BD-09 — chạm vào hình thoi thì chọn được nó, không chỉ chọn ô dưới nó', () => {
    const s = scene({ lattice: 'triangle', rows: 5, cols: 5 }, [
      { id: 'q', type: 'tile', shape: 'lozenge', pos: [3, 2], dir: 2 },
    ]);
    // Ô thứ hai của hình thoi — chạm vào đó phải trúng quân, đó là điều kiện để
    // kéo thả được. Trước BD-09, hình thoi chỉ là một `region` nên không kéo được.
    const [, second] = latticeTileCells('triangle', 'lozenge', 2, 3, 2) as [Offset, Offset];
    const centre = centreOf('triangle', 5, 5, second[0], second[1]);
    expect(boardHitTest(s, centre)).toContain('q');
  });

  it('lật chùm trên bàn ong không đụng ô ngoài hàng của lưới tam giác', () => {
    const run = (s: Scene, params: unknown): Scene | null => {
      const r = execute(createEditorState(s), boardCommands, command('board/toggle-cross', params));
      return r.applied ? r.state.scene : null;
    };
    // `cell-0-1` không tồn tại trên lưới tam giác (hàng 0 chỉ có một ô).
    expect(run(scene({ lattice: 'triangle', rows: 4, cols: 4 }), { cell: 'cell-0-1' })).toBeNull();
  });

  it('id ô ngầm định đếm theo hàng của lưới', () => {
    const ids = boardSchemaFragment.implicitElementIds(
      scene({ lattice: 'triangle', rows: 4, cols: 4 }),
    );
    expect(ids.size).toBe(16);
    expect(ids.has('cell-3-6')).toBe(true);
    expect(ids.has('cell-0-1')).toBe(false);

    // Ô khuyết ngoài hàng bị bắt, dù chỉ số cột nhỏ hơn `cols`.
    expect(codes(scene({ lattice: 'triangle', rows: 4, cols: 4, holes: [[0, 2]] }))).toContain(
      'bounds/hole-out-of-board',
    );
  });

  it('chạm trên bàn ong đọc **cùng** hình học mà renderer vẽ', () => {
    // Bản trước chia đều theo `CELL`; trên bàn ong hàng lẻ lệch nửa ô nên chạm
    // trượt dần theo hàng — người dùng chỉ mô tả được thành "canvas lệch".
    const s = scene({ lattice: 'hex', rows: 5, cols: 5 });
    for (const [r, c] of allCells('hex', 5, 5)) {
      const centre = centreOf('hex', 5, 5, r, c);
      expect({ r, c, hit: boardHitTest(s, centre) }).toEqual({ r, c, hit: [`cell-${r}-${c}`] });
    }
  });

  it('`adjacent()` của DSL đọc quan hệ kề của **lưới đang dùng**', () => {
    const run = (s: Scene, expr: string): unknown =>
      tryEvaluate(expr, boardEnvironment(s), DETERMINISTIC_BUDGET).value;

    // Tổng bậc = hai lần số cạnh trong. Đối chiếu với `neighbours` — module đã có
    // test đối xứng và test "kề thì chung một cạnh" — nên con số này không phải
    // giá trị gõ tay.
    const degrees = (lattice: Lattice, rows: number, cols: number): number =>
      allCells(lattice, rows, cols).reduce(
        (n, [r, c]) => n + neighbours(lattice, rows, cols, r, c).length,
        0,
      );

    for (const [lattice, rows, cols] of [
      ['square', 4, 4],
      ['hex', 5, 5],
      ['triangle', 4, 4],
    ] as const) {
      const s = scene({ ...(lattice === 'square' ? {} : { lattice }), rows, cols });
      expect({ lattice, total: run(s, 'sum(cells, a => count(cells, b => adjacent(a, b)))') })
        .toEqual({ lattice, total: degrees(lattice, rows, cols) });
    }

    // Và công thức cũ `|Δr| + |Δc| == 1` **không** cho ra con số ấy trên hai lưới
    // mới — nếu ai đó trả nó về, hai dòng trên đỏ.
    const naive = (lattice: Lattice, rows: number, cols: number): number => {
      const cells = allCells(lattice, rows, cols);
      return cells.reduce(
        (n, [r, c]) =>
          n +
          cells.filter(([r2, c2]) => Math.abs(r - r2) + Math.abs(c - c2) === 1).length,
        0,
      );
    };
    expect(naive('hex', 5, 5)).not.toBe(degrees('hex', 5, 5));
    expect(naive('triangle', 4, 4)).not.toBe(degrees('triangle', 4, 4));
  });

  it('hình: mỗi ô một node có key, và lưới phi vuông vẽ bằng `<polygon>`', () => {
    const keys: string[] = [];
    const s = scene({ lattice: 'triangle', rows: 3, cols: 3 });
    walk(renderer.render(s, ctx), (node) => {
      if (node.key !== undefined) keys.push(node.key);
    });
    expect(keys).toEqual(['cell-0-0', 'cell-1-0', 'cell-1-1', 'cell-1-2', 'cell-2-0',
      'cell-2-1', 'cell-2-2', 'cell-2-3', 'cell-2-4']);

    const svg = renderer.toSvg(s, ctx);
    expect((svg.match(/<polygon/g) ?? []).length).toBe(9);
    // Lưới vuông vẫn là `<rect>`: đổi thẻ sẽ làm lệch golden của hai mươi bài
    // đang publish mà không đổi một pixel nào.
    expect(renderer.toSvg(scene({ rows: 3, cols: 3 }), ctx)).not.toContain('<polygon');
  });
});

describe('validator `proper-colouring`', () => {
  const scene = (config: Record<string, unknown>): Scene => ({
    engine: 'board',
    config,
    elements: [],
  });
  const check = (id: string, s: Scene) => resolveBoardValidator(id)!.check(s);

  it('bàn ong tô ba màu theo trục thì **đạt**', () => {
    const s = scene({
      lattice: 'hex',
      rows: 5,
      cols: 6,
      coloring_preset: { type: 'stripes', orientation: 'diag-left', k: 3 },
    });
    expect(check('proper-colouring', s).ok).toBe(true);
    expect(check('proper-colouring:3', s).ok).toBe(true);
    // Cùng phép tô ấy nhưng chỉ cho hai màu thì hỏng ở chỗ đếm màu.
    expect(check('proper-colouring:2', s).message).toMatch(/quá 2/);
  });

  it('hai màu trên bàn ong **không bao giờ** đạt, mọi hướng mọi pha', () => {
    // Đây là nội dung của bài `hex-board-three-colours`, kiểm bằng máy chứ không
    // bằng lời: không một preset hai màu nào qua được.
    for (const orientation of ['row', 'col', 'diag-right', 'diag-left'] as const) {
      for (const phase of [0, 1]) {
        const s = scene({
          lattice: 'hex',
          rows: 5,
          cols: 6,
          coloring_preset: { type: 'stripes', orientation, k: 2, phase },
        });
        expect({ orientation, phase, ok: check('proper-colouring', s).ok }).toEqual({
          orientation,
          phase,
          ok: false,
        });
      }
    }
  });

  it('ô chưa tô cũng là chưa xong, và nói ra bằng thông điệp khác', () => {
    const s = scene({ lattice: 'hex', rows: 3, cols: 3 });
    const result = check('proper-colouring', s);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/chưa tô màu/);
    expect(result.violations).toHaveLength(9);
  });

  it('chỉ ra **đúng những ô** đụng nhau, không đổ lỗi cả bàn', () => {
    const s = scene({
      lattice: 'triangle',
      rows: 3,
      cols: 3,
      coloring_preset: { type: 'checkerboard' },
      cell_overrides: { 'cell-2-1': { color_class: 1 } },
    });
    // Ô (2,1) hướng xuống, vốn màu 2; đổi sang 1 thì nó đụng hai ô lên kề bên.
    const result = check('proper-colouring', s);
    expect(result.ok).toBe(false);
    expect(new Set(result.violations)).toEqual(
      new Set(['cell-2-1', 'cell-2-0', 'cell-2-2', 'cell-1-0']),
    );
  });

  it('ô khuyết không tính — không phải "chưa tô", cũng không đụng ai', () => {
    const s = scene({
      lattice: 'square',
      rows: 2,
      cols: 2,
      holes: [[0, 0]],
      coloring_preset: { type: 'checkerboard' },
    });
    expect(check('proper-colouring', s).ok).toBe(true);
  });
});

describe('sandbox của bài bàn ong **thật sự** chơi được', () => {
  /**
   * Nối đủ ba mắt xích: chạm → lệnh tô → validator chấm.
   *
   * Một bài `challenge` mà sandbox không đi được từ đầu tới cuối thì nhãn
   * `challenge` chỉ là một chữ trong file. Ở đây kiểm bằng đúng đường mà người học
   * đi: lấy toạ độ tâm ô, hỏi `boardHitTest` xem chạm trúng ô nào, đưa id ấy cho
   * lệnh `board/paint-cells`, rồi hỏi validator.
   */
  it('tô tay bốn ô của bàn ong $2\\times2$ cho tới khi validator xanh', () => {
    let scene: Scene = {
      engine: 'board',
      config: { lattice: 'hex', rows: 2, cols: 2 },
      elements: [],
    };
    const validator = resolveBoardValidator('proper-colouring:3')!;

    // Chưa tô gì: chưa đạt, và lý do là "chưa tô", không phải "đụng màu".
    expect(validator.check(scene).message).toMatch(/chưa tô màu/);

    // Bốn ô, ba màu. Ba ô đầu đôi một kề nhau nên buộc phải khác nhau cả ba.
    for (const [row, col, colour] of [[0, 0, 1], [0, 1, 2], [1, 0, 3], [1, 1, 1]] as const) {
      const target = boardHitTest(scene, centreOf('hex', 2, 2, row, col));
      expect(target).toEqual([`cell-${row}-${col}`]);

      const result = execute(
        createEditorState(scene),
        boardCommands,
        command('board/paint-cells', { cells: target, color_class: colour }),
      );
      expect(result.applied).toBe(true);
      scene = result.state.scene;
    }

    expect(validator.check(scene)).toEqual({ ok: true, violations: [] });

    // Và đổi một ô cho sai thì nó đỏ lại, chỉ đúng vào cặp đụng nhau.
    const broken = execute(
      createEditorState(scene),
      boardCommands,
      command('board/paint-cells', { cells: ['cell-1-0'], color_class: 1 }),
    ).state.scene;
    const failed = validator.check(broken);
    expect(failed.ok).toBe(false);
    expect(new Set(failed.violations)).toEqual(new Set(['cell-0-0', 'cell-1-0', 'cell-1-1']));
  });
});
