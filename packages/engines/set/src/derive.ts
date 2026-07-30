import type { Scene, SceneElement } from '@combviz/schema';
import { SET_LIMITS, type SetConfig } from './schema.js';
import { UNITS_PER_CELL } from '@combviz/render';

/** Bề rộng một ô của bảng incidence, theo quy ước 10 đơn vị scene (G-10). */
/**
 * Đơn vị gốc, lấy từ **một** chỗ (G-10).
 *
 * Trước đây bảy engine mỗi cái tự khai `= 10`. Bảy bản sao của một quy ước là bảy
 * chỗ có thể lệch, và quy ước này lệch một cái là cả hình đổi cỡ — đúng thứ vừa
 * phải sửa ở M20. Nay nó là một hằng số, và engine thứ tám không có cách nào chọn
 * số khác mà vẫn trông như đang theo quy ước.
 */
export const CELL = UNITS_PER_CELL;
export const PADDING = 4;
/** Bán kính một hình tròn Venn. */
export const VENN_R = 13;

export interface DerivedToken {
  readonly id: string;
  readonly label: string;
  readonly sets: readonly string[];
  readonly colorClass: number | undefined;
  readonly emphasis: string | undefined;
}

export interface DerivedSet {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly colorClass: number | undefined;
  readonly emphasis: string | undefined;
  readonly size: number;
}

export interface SetDerived {
  readonly view: 'matrix' | 'venn';
  readonly tokens: readonly DerivedToken[];
  readonly sets: readonly DerivedSet[];
  /** Tổng số cặp (phần tử, tập chứa nó) — con số của đếm hai chiều. */
  readonly incidences: number;
}

/**
 * Id của một ô bảng incidence — danh tính của **quan hệ thuộc**, không phải của
 * phần tử hay tập.
 *
 * Dấu nối là `__` vì `EntityId` chỉ nhận `[A-Za-z0-9_-]`. Để `__` không nhập
 * nhằng (id `a__b` có thể là `a` + `_b` hay `a_` + `b`), `checkBounds` cấm luôn
 * `__` bên trong id token và set — rẻ hơn nhiều so với một anchor trỏ nhầm ô mà
 * không ai phát hiện.
 */
export const INCIDENCE_SEP = '__';

export function incidenceId(tokenId: string, setId: string): string {
  return `${tokenId}${INCIDENCE_SEP}${setId}`;
}

export function setConfig(scene: Scene): SetConfig {
  return (scene.config ?? { view: 'matrix' }) as SetConfig;
}

export function deriveSet(scene: Scene): SetDerived {
  const tokens: DerivedToken[] = [];
  const sets: DerivedSet[] = [];

  const known = new Set(
    scene.elements.filter((e) => e.type === 'set').map((e: SceneElement) => e.id),
  );

  for (const element of scene.elements) {
    if (element.type === 'token') {
      // Bỏ id tập không tồn tại ngay tại đây thay vì để nó chảy xuống renderer:
      // validate đã báo lỗi rồi, và một hình vẽ thêm cột ma sẽ khiến tác giả đi
      // tìm nhầm chỗ.
      const declared = (element['sets'] as string[] | undefined) ?? [];
      tokens.push({
        id: element.id,
        label: (element['label'] as string | undefined) ?? element.id,
        sets: declared.filter((id) => known.has(id)),
        colorClass: element.color_class,
        emphasis: element.emphasis,
      });
    } else if (element.type === 'set') {
      sets.push({
        id: element.id,
        label: (element['label'] as string | undefined) ?? element.id,
        order: Number(element['order'] ?? 0),
        colorClass: element.color_class,
        emphasis: element.emphasis,
        size: 0,
      });
    }
  }

  sets.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const sized = sets.map((set) => ({
    ...set,
    size: tokens.filter((t) => t.sets.includes(set.id)).length,
  }));

  return {
    view: setConfig(scene).view ?? 'matrix',
    tokens,
    sets: sized,
    incidences: tokens.reduce((sum, t) => sum + t.sets.length, 0),
  };
}

/**
 * Tâm của **vùng** ứng với một tập membership, trong sơ đồ Venn.
 *
 * Không lấy trung bình tâm các hình tròn chứa nó: cách đó đặt "chỉ thuộc A" và
 * "thuộc A ∩ B" vào gần như cùng một chỗ, và mọi chấm dồn thành một đống ở giữa.
 * Vùng phải tách nhau **theo đúng cách hình vẽ tách chúng**, nên toạ độ suy từ
 * hình học thật: vào trong theo hướng các tập có mặt, và **ra xa** theo hướng
 * các tập vắng mặt.
 *
 * Vị trí vẫn là hàm thuần của quan hệ thuộc — tác giả không đặt tay được, nên
 * hình không thể nói khác dữ liệu.
 */
export function vennRegionCentre(
  memberOf: readonly string[],
  sets: readonly DerivedSet[],
): { x: number; y: number } {
  const centres = vennCentres(sets.length);
  const inside: { x: number; y: number }[] = [];
  const outside: { x: number; y: number }[] = [];

  sets.forEach((set, i) => {
    (memberOf.includes(set.id) ? inside : outside).push(
      centres[i] as { x: number; y: number },
    );
  });

  // Ngoài mọi tập: góc dưới phải, vùng duy nhất chắc chắn trống.
  if (inside.length === 0) return { x: VENN_R * 1.75, y: VENN_R * 1.6 };

  const mean = (points: readonly { x: number; y: number }[]) =>
    points.reduce((a, p) => ({ x: a.x + p.x / points.length, y: a.y + p.y / points.length }), {
      x: 0,
      y: 0,
    });

  const target = mean(inside);
  if (outside.length === 0) return target;

  // Đẩy ra xa trọng tâm các tập **vắng mặt**, đủ để vùng "chỉ A" không đè lên
  // vùng "A ∩ B".
  const away = mean(outside);
  const dx = target.x - away.x;
  const dy = target.y - away.y;
  const length = Math.hypot(dx, dy) || 1;
  const push = VENN_R * (inside.length === 1 ? 0.62 : 0.34);

  return {
    x: target.x + (dx / length) * push,
    y: target.y + (dy / length) * push,
  };
}

/** Tâm các hình tròn Venn cho 1..3 tập. */
export function vennCentres(count: number): readonly { x: number; y: number }[] {
  if (count <= 1) return [{ x: 0, y: 0 }];
  if (count === 2) {
    return [
      { x: -VENN_R * 0.55, y: 0 },
      { x: VENN_R * 0.55, y: 0 },
    ];
  }
  return [
    { x: 0, y: -VENN_R * 0.62 },
    { x: -VENN_R * 0.54, y: VENN_R * 0.36 },
    { x: VENN_R * 0.54, y: VENN_R * 0.36 },
  ];
}

export function vennTooManySets(derived: SetDerived): boolean {
  return derived.sets.length > SET_LIMITS.maxVennSets;
}
