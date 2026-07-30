import type { Scene, SceneElement } from '@combviz/schema';
import { SEQUENCE_LIMITS, type SequenceConfig } from './schema.js';
import { UNITS_PER_CELL } from '@combviz/render';

/**
 * Bề rộng một ô, tính bằng **đơn vị scene**.
 *
 * Quy ước bắt buộc với mọi engine (G-10): một ô bàn cờ / một khoảng cách đỉnh
 * chuẩn = 10 đơn vị scene. Một phần tử của dãy là "một ô", nên nó cũng bằng 10 —
 * nhờ vậy nét vẽ của theme cho ra độ dày như nhau ở cả ba engine mà không engine
 * nào phải tự chỉnh.
 */
/**
 * Đơn vị gốc, lấy từ **một** chỗ (G-10).
 *
 * Trước đây bảy engine mỗi cái tự khai `= 10`. Bảy bản sao của một quy ước là bảy
 * chỗ có thể lệch, và quy ước này lệch một cái là cả hình đổi cỡ — đúng thứ vừa
 * phải sửa ở M20. Nay nó là một hằng số, và engine thứ tám không có cách nào chọn
 * số khác mà vẫn trông như đang theo quy ước.
 */
export const SLOT = UNITS_PER_CELL;

/** Khe giữa hai ô. Có khe vì hai số cạnh nhau là **hai** vật, không phải một dải. */
export const GAP = 2.4;

export const PITCH = SLOT + GAP;

export const PADDING = 4;

/** Bán kính một viên sỏi ở chế độ `piles`. */
export const STONE_R = 1.5;

/** Khoảng cách tâm hai viên sỏi chồng lên nhau. */
export const STONE_PITCH = 3.6;

export interface DerivedItem {
  readonly id: string;
  readonly value: number;
  readonly pos: number;
  readonly label: string | undefined;
  readonly colorClass: number | undefined;
  readonly emphasis: string | undefined;
  /**
   * Độ dài dãy con **tăng ngặt** dài nhất *kết thúc* tại phần tử này (SQ-01).
   *
   * Cặp $(inc, dec)$ không phải số liệu phụ — nó **là** lời giải Erdős–Szekeres:
   * với $i < j$ thì hoặc $a_i < a_j$ (nên $inc_j > inc_i$) hoặc $a_i > a_j$ (nên
   * $dec_j > dec_i$), vậy hai phần tử khác nhau không bao giờ mang cùng một cặp.
   * Ánh xạ đơn ánh ấy biến định lý thành một phép đếm ô.
   */
  readonly inc: number;
  /** Độ dài dãy con **giảm ngặt** dài nhất kết thúc tại phần tử này. */
  readonly dec: number;
}

export interface DerivedCut {
  readonly id: string;
  readonly before: number;
  readonly label: string | undefined;
}

export interface SequenceDerived {
  readonly mode: 'sequence' | 'piles';
  readonly items: readonly DerivedItem[];
  readonly cuts: readonly DerivedCut[];
  readonly total: number;
  /** Dãy con tăng ngặt dài nhất của cả dãy. */
  readonly longestIncreasing: number;
  /** Dãy con giảm ngặt dài nhất của cả dãy. */
  readonly longestDecreasing: number;
  /** Chiều cao đống cao nhất, tính bằng số viên — quyết định khung nhìn. */
  readonly tallest: number;
}

export function sequenceConfig(scene: Scene): SequenceConfig {
  return (scene.config ?? { mode: 'sequence' }) as SequenceConfig;
}

/**
 * Trạng thái dẫn xuất của một scene (A-04).
 *
 * Sắp theo `pos`, **không** theo thứ tự trong `elements[]`: thứ tự mảng là chuyện
 * của file, vị trí là chuyện của bài toán. Hai phần tử cùng `pos` là dữ liệu hỏng
 * và validate bắt riêng — ở đây chỉ giữ thứ tự ổn định để render không nhảy.
 */
export function deriveSequence(scene: Scene): SequenceDerived {
  const items: (Omit<DerivedItem, 'inc' | 'dec'> & { inc: number; dec: number })[] = [];
  const cuts: DerivedCut[] = [];

  for (const element of scene.elements) {
    if (element.type === 'item') {
      items.push({
        id: element.id,
        value: Number(element['value'] ?? 0),
        pos: Number(element['pos'] ?? 0),
        label: element['label'] as string | undefined,
        colorClass: element.color_class,
        emphasis: element.emphasis,
        inc: 1,
        dec: 1,
      });
    } else if (element.type === 'cut') {
      cuts.push({
        id: element.id,
        before: Number(element['before'] ?? 0),
        label: element['label'] as string | undefined,
      });
    }
  }

  items.sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));
  cuts.sort((a, b) => a.before - b.before);

  // Quy hoạch động $O(n^2)$, cùng lý do với `inversions`: trần `maxItems` là 60
  // nên tối đa 1770 cặp — rẻ hơn nhiều so với chi phí đọc hiểu một cấu trúc khéo
  // hơn trong một kho một người nuôi.
  items.forEach((item, i) => {
    let inc = 1;
    let dec = 1;
    for (let j = 0; j < i; j += 1) {
      const before = items[j] as DerivedItem;
      // **Ngặt**: hai phần tử bằng nhau không nối dài dãy nào. Erdős–Szekeres phát
      // biểu trên số phân biệt, và "không giảm" là một định lý khác.
      if (before.value < item.value) inc = Math.max(inc, before.inc + 1);
      if (before.value > item.value) dec = Math.max(dec, before.dec + 1);
    }
    item.inc = inc;
    item.dec = dec;
  });

  return {
    mode: sequenceConfig(scene).mode ?? 'sequence',
    items,
    cuts,
    total: items.reduce((sum, item) => sum + item.value, 0),
    longestIncreasing: items.reduce((max, item) => Math.max(max, item.inc), 0),
    longestDecreasing: items.reduce((max, item) => Math.max(max, item.dec), 0),
    tallest: items.reduce((max, item) => Math.max(max, Math.abs(item.value)), 0),
  };
}

/**
 * Một dãy con đơn điệu **dài nhất**, trả về id theo thứ tự vị trí (SQ-01).
 *
 * Validator cần nó để chỉ đúng những phần tử làm hỏng mục tiêu, thay vì tô đỏ cả
 * dãy: người học đang xếp lại dãy thì thứ họ cần thấy là *chuỗi nào* đang quá dài.
 */
export function longestMonotone(
  derived: SequenceDerived,
  direction: 'increasing' | 'decreasing',
): readonly string[] {
  const items = derived.items;
  const key = direction === 'increasing' ? 'inc' : 'dec';
  let end = -1;
  items.forEach((item, i) => {
    if (end === -1 || item[key] > (items[end] as DerivedItem)[key]) end = i;
  });
  if (end === -1) return [];

  const chain: string[] = [];
  let want = (items[end] as DerivedItem)[key];
  for (let i = end; i >= 0 && want > 0; i -= 1) {
    const item = items[i] as DerivedItem;
    if (item[key] !== want) continue;
    // Nối lùi: phần tử kế tiếp trong chuỗi phải **đứng trước** và so sánh đúng chiều.
    if (chain.length > 0) {
      const next = items.find((x) => x.id === chain[0]) as DerivedItem;
      const ok = direction === 'increasing' ? item.value < next.value : item.value > next.value;
      if (!ok) continue;
    }
    chain.unshift(item.id);
    want -= 1;
  }
  return chain;
}

/** Toạ độ x của mép trái ô ở vị trí `pos`. */
export function slotX(pos: number): number {
  return pos * PITCH;
}

/** Số viên sỏi thật sự vẽ ra; trên ngưỡng thì chuyển sang hiện số. */
export function drawnStones(value: number): number {
  return Math.min(Math.max(0, Math.round(value)), SEQUENCE_LIMITS.maxDotsPerPile);
}

export function isPileTooTall(value: number): boolean {
  return Math.round(value) > SEQUENCE_LIMITS.maxDotsPerPile;
}

/** Vị trí trống nhỏ nhất — dùng khi thêm phần tử mới. */
export function nextFreePos(elements: readonly SceneElement[]): number {
  const taken = new Set(
    elements.filter((e) => e.type === 'item').map((e) => Number(e['pos'] ?? 0)),
  );
  let pos = 0;
  while (taken.has(pos)) pos += 1;
  return pos;
}
