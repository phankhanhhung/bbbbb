import { el, text, type SvgNode } from './svg-node.js';

/**
 * Label atlas (D-07, GR-08) — nhãn LaTeX **trong canvas**.
 *
 * Vì sao phải có atlas thay vì gọi thẳng KaTeX như narrative pane:
 *
 *   - KaTeX/MathJax bản browser dựng ra **HTML**. Nhét HTML vào SVG phải qua
 *     `<foreignObject>`, mà resvg — thứ dựng OG card và video ở REN-01/02 — không
 *     hỗ trợ `foreignObject`. Nhãn sẽ hiện trong Player và **biến mất** khỏi ảnh
 *     xuất ra. Đó đúng là loại lệch mà D-03 (một renderer, một nguồn sự thật)
 *     sinh ra để chặn, và G-02 trong sổ rủi ro đã ghi tên nó từ đầu.
 *   - Chạy MathJax trong Player thì kéo thêm cả megabyte vào ngân sách NFR-P2,
 *     cho một thứ mà nội dung là **tĩnh**: chuỗi LaTeX nằm trong file bài, không
 *     đổi lúc chạy.
 *
 * Nên: dựng path một lần lúc build (`combviz labels --write`), khoá theo chính
 * chuỗi LaTeX, rồi Player, CLI và test golden đọc cùng một bảng.
 *
 * Tầng này **không** biết MathJax — nó chỉ biết đọc bảng và đặt path vào chỗ.
 * Phần sinh bảng sống ở `tools/pipeline`, cùng lý do LLM chỉ sống ở đó: thứ gì
 * nặng và chỉ chạy lúc build thì không được nằm trên đường đi của người học.
 */

/** Một node hình học đã dựng sẵn: `g`, `path`, hoặc `rect`. */
export interface LabelNode {
  readonly t: 'g' | 'path' | 'rect';
  readonly a: Readonly<Record<string, string | number>>;
  readonly c?: readonly LabelNode[];
}

export interface LabelEntry {
  /** viewBox của MathJax: `[x, y, w, h]`, đơn vị nội bộ. */
  readonly vb: readonly [number, number, number, number];
  readonly c: readonly LabelNode[];
}

export interface LabelAtlas {
  /** Hash của toàn bộ tập chuỗi — CI so cái này để biết atlas có cũ không. */
  readonly version: string;
  readonly entries: Readonly<Record<string, LabelEntry>>;
}

export const EMPTY_ATLAS: LabelAtlas = { version: '0', entries: {} };

/**
 * Đơn vị nội bộ của MathJax trên một `ex`.
 *
 * Con số này là của MathJax chứ không phải ta chọn; nó hiện ra khi đối chiếu
 * thuộc tính `width` (đơn vị `ex`) với bề ngang viewBox trên cùng một công thức.
 * Có test ép nó ở `packages/render/test/labels.test.ts`, để hôm nào MathJax đổi
 * hằng số thì vỡ ở đó chứ không vỡ thành chữ lệch nửa dòng trong hình.
 */
export const UNITS_PER_EX = 441.3;

/** Quy ước: một `em` bằng hai `ex` — đủ đúng cho phông toán. */
export function labelScale(fontSize: number): number {
  return fontSize / 2 / UNITS_PER_EX;
}

export function lookupLabel(atlas: LabelAtlas, tex: string): LabelEntry | null {
  return Object.hasOwn(atlas.entries, tex) ? (atlas.entries[tex] as LabelEntry) : null;
}

/** Bề ngang nhãn, đơn vị scene, ở cỡ chữ cho trước. */
export function labelWidth(entry: LabelEntry, fontSize: number): number {
  return entry.vb[2] * labelScale(fontSize);
}

/** Chiều cao **trên** đường chân. */
export function labelAscent(entry: LabelEntry, fontSize: number): number {
  return -entry.vb[1] * labelScale(fontSize);
}

/** Chiều sâu **dưới** đường chân. */
export function labelDescent(entry: LabelEntry, fontSize: number): number {
  return (entry.vb[3] + entry.vb[1]) * labelScale(fontSize);
}

export interface PlaceOptions {
  /** Toạ độ **đường chân, mép trái**, đơn vị scene. */
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly fill: string;
  /** Màu dùng khi nhãn **không có** trong atlas. */
  readonly missingFill?: string;
}

/**
 * Đặt một nhãn đã dựng sẵn vào cây SVG.
 *
 * MathJax trả path trong hệ toạ độ **lật đứng** (gốc ở đường chân, $y$ hướng
 * lên), nên phép biến đổi là `scale(s, -s)` chứ không phải `scale(s)`.
 */
export function placeLabel(
  atlas: LabelAtlas,
  tex: string,
  options: PlaceOptions,
): SvgNode {
  const entry = lookupLabel(atlas, tex);
  if (entry === null) return missingLabel(tex, options);

  const s = labelScale(options.fontSize);
  return el(
    'g',
    {
      transform: `translate(${r(options.x)} ${r(options.y)}) scale(${r(s)} ${r(-s)})`,
      fill: options.fill,
      stroke: 'none',
    },
    entry.c.map(toSvg),
  );
}

/**
 * Nhãn không có trong atlas: vẽ **ra mặt**, kèm nguyên chuỗi LaTeX.
 *
 * Không lặng lẽ bỏ qua, cũng không lặng lẽ hạ xuống text thuần. Bài học lặp đi
 * lặp lại trong kho này là: trường nào validate xanh mà renderer im lặng lờ đi
 * thì lỗi sống rất lâu. Ở đây tình huống ngược lại — atlas cũ so với nội dung
 * mới — nên nó phải **nhìn là thấy**, và check bundle bắt thêm ở CI.
 */
export function missingLabel(tex: string, options: PlaceOptions): SvgNode {
  return text(
    'text',
    {
      x: r(options.x),
      y: r(options.y),
      'font-family': 'monospace',
      'font-size': r(options.fontSize * 0.8),
      fill: options.missingFill ?? options.fill,
    },
    `⟨thiếu atlas: ${tex}⟩`,
  );
}

function toSvg(node: LabelNode): SvgNode {
  return node.c ? el(node.t, node.a, node.c.map(toSvg)) : el(node.t, node.a);
}

function r(value: number): number {
  return Math.round(value * 10000) / 10000 + 0;
}
