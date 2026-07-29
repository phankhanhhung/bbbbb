import {
  labelAscent,
  labelDescent,
  labelWidth,
  lookupLabel,
  type LabelAtlas,
} from '@combviz/render';
import type { DerivationModel, Row, Term } from './model.js';

/** Quy ước đơn vị G-10: một dòng công thức *thường* cao chừng một "ô". */
export const ROW = 10;
export const FONT = 5;
/** Khoảng hở giữa hai dòng, tính thêm ngoài phần cao–sâu thật của chúng. */
const LEADING = FONT * 0.5;

/**
 * Khoảng cách **trước** một hạng tử, theo vai trò của nó.
 *
 * Đây là khoảng cách của sách toán chứ không phải số tôi tự nghĩ: dấu quan hệ
 * thoáng nhất, phép toán hai ngôi hẹp hơn, hai hạng tử kề nhau (như $2 \cdot x$)
 * hẹp nhất — vì ở đó khoảng trắng đang thay cho một dấu nhân.
 */
const GAP: Record<Term['role'], number> = {
  relation: 1.8,
  op: 1.2,
  term: 0.8,
};

/** Kích thước dự phòng khi nhãn không có trong atlas — đủ rộng để thấy chỗ hỏng. */
const MISSING = { width: 14, ascent: FONT * 0.8, descent: FONT * 0.25 };

export interface PlacedTerm {
  readonly term: Term;
  /** Mép trái, tương đối so với đầu dòng. */
  readonly x: number;
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly missing: boolean;
}

export interface PlacedRow {
  readonly row: Row;
  readonly terms: readonly PlacedTerm[];
  /** Dịch ngang để gióng dấu quan hệ; $0$ khi `align: 'left'`. */
  readonly shift: number;
  readonly width: number;
  /** Đường chân của dòng. */
  readonly y: number;
  readonly ascent: number;
  readonly descent: number;
}

export interface Layout {
  readonly rows: readonly PlacedRow[];
  readonly width: number;
  readonly height: number;
}

/**
 * Xếp chỗ cho cả chuỗi biến đổi.
 *
 * Hai chỗ **bắt buộc phải đo chứ không được đoán**, và cả hai đều lộ ra ngay lần
 * render đầu tiên:
 *
 *   - **Chiều cao dòng.** Lúc đầu tôi để hằng số $10$. Một $\sum$ dạng trưng bày
 *     cao gấp đôi thế, nên dòng dưới đè lên cận dưới của dòng trên. Chiều cao
 *     phải là cao–sâu **thật** của các nhãn trong dòng.
 *   - **Chỗ gióng dấu quan hệ.** Phải hai lượt: lượt một đo, lượt hai dịch — vì
 *     chỗ gióng phụ thuộc dòng rộng nhất *phía trước dấu*, mà dòng ấy có thể là
 *     dòng cuối.
 */
export function layout(model: DerivationModel, atlas: LabelAtlas): Layout {
  const measured = model.rows.map((row) => measure(row, atlas));

  // `align: 'left'` phải cho dịch **đúng bằng 0**, không phải "gióng về mốc 0":
  // gióng về 0 thì dòng nào có dấu quan hệ đứng sau sẽ bị dịch **âm**, tức lòi
  // sang trái ra ngoài khung. Đó là lỗi thật, và test bắt được ngay lần chạy đầu.
  const aligning = model.config.align !== 'left';
  const alignAt = aligning ? Math.max(0, ...measured.map((m) => m.relationX ?? 0)) : 0;

  const rows: PlacedRow[] = [];
  let cursor = 0;

  measured.forEach((m) => {
    const shift = aligning && m.relationX !== null ? alignAt - m.relationX : 0;
    const y = cursor + m.ascent;
    rows.push({
      row: m.row,
      terms: m.terms,
      shift,
      width: m.width + shift,
      y: round(y),
      ascent: m.ascent,
      descent: m.descent,
    });
    cursor = y + m.descent + LEADING;
  });

  return {
    rows,
    width: Math.max(ROW, ...rows.map((r) => r.width)),
    height: round(Math.max(ROW, cursor - LEADING)),
  };
}

interface Measured {
  readonly row: Row;
  readonly terms: readonly PlacedTerm[];
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  /** Mép trái của dấu quan hệ **đầu tiên**; `null` khi dòng không có dấu nào. */
  readonly relationX: number | null;
}

function measure(row: Row, atlas: LabelAtlas): Measured {
  const terms: PlacedTerm[] = [];
  let cursor = 0;
  let relationX: number | null = null;

  row.terms.forEach((term, index) => {
    if (index > 0) cursor += GAP[term.role];
    const entry = lookupLabel(atlas, term.tex);
    const size =
      entry === null
        ? MISSING
        : {
            width: labelWidth(entry, FONT),
            ascent: labelAscent(entry, FONT),
            descent: labelDescent(entry, FONT),
          };
    // Mốc gióng lấy từ hoành độ **đã làm tròn**, đúng con số renderer sẽ vẽ.
    // Lấy từ `cursor` thô thì hai dòng lệch nhau chừng $10^{-3}$ — mắt không
    // thấy, nhưng đó là hai nguồn sự thật cho cùng một con số, và kho này đã
    // trả giá cho kiểu ấy vài lần rồi.
    if (relationX === null && term.role === 'relation') relationX = round(cursor);
    terms.push({
      term,
      x: round(cursor),
      width: round(size.width),
      ascent: round(size.ascent),
      descent: round(size.descent),
      missing: entry === null,
    });
    cursor += size.width;
  });

  return {
    row,
    terms,
    width: round(cursor),
    // Dòng rỗng vẫn chiếm một dòng: bỏ hẳn thì validator `no-empty-row` báo một
    // chỗ mà mắt không tìm ra.
    ascent: Math.max(FONT * 0.5, ...terms.map((t) => t.ascent)),
    descent: Math.max(FONT * 0.15, ...terms.map((t) => t.descent)),
    relationX,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}
