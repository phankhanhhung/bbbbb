import type { Scene, SceneElement } from '@combviz/schema';
import { SEQUENCE_LIMITS, type SequenceConfig } from './schema.js';

/**
 * Bề rộng một ô, tính bằng **đơn vị scene**.
 *
 * Quy ước bắt buộc với mọi engine (G-10): một ô bàn cờ / một khoảng cách đỉnh
 * chuẩn = 10 đơn vị scene. Một phần tử của dãy là "một ô", nên nó cũng bằng 10 —
 * nhờ vậy nét vẽ của theme cho ra độ dày như nhau ở cả ba engine mà không engine
 * nào phải tự chỉnh.
 */
export const SLOT = 10;

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
  const items: DerivedItem[] = [];
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

  return {
    mode: sequenceConfig(scene).mode ?? 'sequence',
    items,
    cuts,
    total: items.reduce((sum, item) => sum + item.value, 0),
    tallest: items.reduce((max, item) => Math.max(max, Math.abs(item.value)), 0),
  };
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
