import { defineCommand, type CommandRegistry } from '@combviz/editor';
import type { Scene, SceneElement } from '@combviz/schema';
import { deriveSequence, nextFreePos, sequenceConfig } from './geometry.js';

/**
 * Command của Sequence/Multiset engine (ENG-01).
 *
 * Tập lệnh **chia theo `mode`**, và đó là điểm quan trọng nhất của engine này.
 * Ở `sequence`, đổi chỗ hai phần tử là phép toán hợp lệ và gộp thì vô nghĩa; ở
 * `piles` thì ngược lại. Cho phép cả hai ở cả hai chế độ nghe có vẻ rộng rãi,
 * nhưng nó phá đúng thứ làm nên bài toán: bất biến của "gộp đống" chỉ là bất biến
 * **vì** người chơi không được phép đổi chỗ tuỳ ý.
 *
 * Đây là cùng một bài học với `board/flip-line` (G-11): ràng buộc của bài phải
 * nằm trong tập thao tác, không nằm trong lời dặn.
 */

function withElements(scene: Scene, elements: SceneElement[]): Scene {
  return { ...scene, elements };
}

function mapItem(
  scene: Scene,
  id: string,
  fn: (element: SceneElement) => SceneElement | null,
): Scene | null {
  const index = scene.elements.findIndex((e) => e.id === id && e.type === 'item');
  if (index === -1) return null;

  const next = fn(scene.elements[index] as SceneElement);
  if (!next) return null;

  const elements = [...scene.elements];
  elements[index] = next;
  return withElements(scene, elements);
}

/** Quy tắc gộp hai số — tập **đóng**, đúng tinh thần DSL-01. */
const COMBINE_RULES = {
  sum: (a: number, b: number) => a + b,
  'abs-diff': (a: number, b: number) => Math.abs(a - b),
  product: (a: number, b: number) => a * b,
  max: (a: number, b: number) => Math.max(a, b),
  min: (a: number, b: number) => Math.min(a, b),
} as const;

export type CombineRule = keyof typeof COMBINE_RULES;

export const COMBINE_RULE_IDS = Object.keys(COMBINE_RULES) as readonly CombineRule[];

/** Nhãn của luật gộp — **một** bảng, dùng cho cả lịch sử undo lẫn thanh công cụ. */
export function combineRuleLabel(rule: string): string {
  return Object.hasOwn(RULE_LABELS, rule) ? (RULE_LABELS[rule as CombineRule] as string) : rule;
}

const RULE_LABELS: Readonly<Record<CombineRule, string>> = {
  sum: 'a + b',
  'abs-diff': '|a − b|',
  product: 'a × b',
  max: 'max(a, b)',
  min: 'min(a, b)',
};

const setValue = defineCommand<{ id: string; value: number }>({
  type: 'sequence/set-value',
  label: (params) => `Đặt giá trị ${params.value}`,
  apply(scene, params) {
    return mapItem(scene, params.id, (element) =>
      element['value'] === params.value ? null : { ...element, value: params.value },
    );
  },
});

const addValue = defineCommand<{ ids: readonly string[]; delta: number }>({
  type: 'sequence/add',
  label: (params) =>
    `${params.delta >= 0 ? 'Cộng' : 'Trừ'} ${Math.abs(params.delta)} vào ${params.ids.length} phần tử`,
  apply(scene, params) {
    if (params.delta === 0 || params.ids.length === 0) return null;
    const targets = new Set(params.ids);
    let changed = false;

    const elements = scene.elements.map((element) => {
      if (element.type !== 'item' || !targets.has(element.id)) return element;
      changed = true;
      return { ...element, value: Number(element['value'] ?? 0) + params.delta };
    });

    return changed ? withElements(scene, elements) : null;
  },
});

/**
 * Đổi chỗ hai phần tử — **chỉ** ở chế độ `sequence`.
 *
 * Đổi `pos` chứ không đổi vị trí trong mảng: id giữ nguyên nên diff nhận ra "vẫn
 * là hai phần tử đó, chỉ đổi chỗ" và animation trượt chúng qua nhau (DAT-12).
 * Hoán vị mảng sẽ cho ra "xoá hai, thêm hai" — một cú nháy thay vì một chuyển
 * động, và mất luôn cái mà bài toán đang nói tới.
 */
const swap = defineCommand<{ a: string; b: string }>({
  type: 'sequence/swap',
  label: () => 'Đổi chỗ hai phần tử',
  apply(scene, params) {
    if (sequenceConfig(scene).mode === 'piles') return null;
    if (params.a === params.b) return null;

    const a = scene.elements.find((e) => e.id === params.a && e.type === 'item');
    const b = scene.elements.find((e) => e.id === params.b && e.type === 'item');
    if (!a || !b) return null;

    const posA = a['pos'];
    const posB = b['pos'];

    return withElements(
      scene,
      scene.elements.map((element) => {
        if (element.id === params.a) return { ...element, pos: posB };
        if (element.id === params.b) return { ...element, pos: posA };
        return element;
      }),
    );
  },
});

/**
 * Gộp hai đống thành một theo một quy tắc trong tập đóng — **chỉ** ở `piles`.
 *
 * Đây là thao tác trung tâm của cả họ bài: "xoá hai số $a, b$ rồi viết $|a-b|$",
 * "gộp hai đống sỏi", "thay hai số bằng tổng". Quy tắc là enum chứ không phải
 * biểu thức người dùng nhập: cho nhập biểu thức là mở cửa cho DSL-03 (rule
 * script, P3) đi vào bằng cửa sau, và tập năm quy tắc này phủ gần hết bài thật.
 */
const combine = defineCommand<{ a: string; b: string; rule: CombineRule; into?: string }>({
  type: 'sequence/combine',
  label: (params) => `Gộp hai phần tử thành ${RULE_LABELS[params.rule] ?? params.rule}`,
  apply(scene, params) {
    if (sequenceConfig(scene).mode !== 'piles') return null;
    if (params.a === params.b) return null;

    const rule = COMBINE_RULES[params.rule];
    if (!rule) return null;

    const a = scene.elements.find((e) => e.id === params.a && e.type === 'item');
    const b = scene.elements.find((e) => e.id === params.b && e.type === 'item');
    if (!a || !b) return null;

    const value = rule(Number(a['value'] ?? 0), Number(b['value'] ?? 0));
    // Kết quả **giữ id của `a`**: người học thấy một đống lớn lên và một đống
    // biến mất, chứ không thấy hai đống biến mất rồi một đống lạ hiện ra.
    const keep = params.into ?? params.a;
    const drop = keep === params.a ? params.b : params.a;

    return withElements(
      scene,
      scene.elements
        .filter((element) => element.id !== drop)
        .map((element) => (element.id === keep ? { ...element, value } : element)),
    );
  },
});

/** Tách một đống làm hai — phép ngược của `combine`, cũng chỉ ở `piles`. */
const split = defineCommand<{ id: string; take: number; newId: string }>({
  type: 'sequence/split',
  label: (params) => `Tách ${params.take} khỏi một đống`,
  apply(scene, params) {
    if (sequenceConfig(scene).mode !== 'piles') return null;

    const source = scene.elements.find((e) => e.id === params.id && e.type === 'item');
    if (!source) return null;

    const value = Number(source['value'] ?? 0);
    if (params.take <= 0 || params.take >= value) return null;

    const created: SceneElement = {
      id: params.newId,
      type: 'item',
      value: params.take,
      pos: nextFreePos(scene.elements),
    };

    return withElements(scene, [
      ...scene.elements.map((element) =>
        element.id === params.id ? { ...element, value: value - params.take } : element,
      ),
      created,
    ]);
  },
});

/** Chuyển bớt sang đống khác. Tổng không đổi — và đó thường là cả bài toán. */
const move = defineCommand<{ from: string; to: string; amount: number }>({
  type: 'sequence/move',
  label: (params) => `Chuyển ${params.amount}`,
  apply(scene, params) {
    if (params.from === params.to || params.amount === 0) return null;

    const from = scene.elements.find((e) => e.id === params.from && e.type === 'item');
    const to = scene.elements.find((e) => e.id === params.to && e.type === 'item');
    if (!from || !to) return null;
    if (Number(from['value'] ?? 0) < params.amount) return null;

    return withElements(
      scene,
      scene.elements.map((element) => {
        if (element.id === params.from) {
          return { ...element, value: Number(element['value'] ?? 0) - params.amount };
        }
        if (element.id === params.to) {
          return { ...element, value: Number(element['value'] ?? 0) + params.amount };
        }
        return element;
      }),
    );
  },
});

const paint = defineCommand<{ ids: readonly string[]; color_class: number | null }>({
  type: 'sequence/paint',
  label: (params) =>
    params.color_class === null
      ? `Xoá màu ${params.ids.length} phần tử`
      : `Tô ${params.ids.length} phần tử thành màu ${params.color_class}`,
  apply(scene, params) {
    const targets = new Set(params.ids);
    let changed = false;

    const elements = scene.elements.map((element) => {
      if (!targets.has(element.id)) return element;
      if (params.color_class === null) {
        if (element.color_class === undefined) return element;
        changed = true;
        const { color_class: _dropped, ...rest } = element;
        return rest as SceneElement;
      }
      if (element.color_class === params.color_class) return element;
      changed = true;
      return { ...element, color_class: params.color_class };
    });

    return changed ? withElements(scene, elements) : null;
  },
});

const append = defineCommand<{ id: string; value: number }>({
  type: 'sequence/append',
  label: (params) => `Thêm phần tử ${params.value}`,
  apply(scene, params) {
    if (scene.elements.some((e) => e.id === params.id)) return null;
    return withElements(scene, [
      ...scene.elements,
      { id: params.id, type: 'item', value: params.value, pos: nextFreePos(scene.elements) },
    ]);
  },
});

const remove = defineCommand<{ ids: readonly string[] }>({
  type: 'sequence/remove',
  label: (params) => `Xoá ${params.ids.length} phần tử`,
  apply(scene, params) {
    const doomed = new Set(params.ids);
    const elements = scene.elements.filter((element) => !doomed.has(element.id));
    return elements.length === scene.elements.length ? null : withElements(scene, elements);
  },
});

export const sequenceCommands: CommandRegistry = {
  [setValue.type]: setValue,
  [addValue.type]: addValue,
  [swap.type]: swap,
  [combine.type]: combine,
  [split.type]: split,
  [move.type]: move,
  [paint.type]: paint,
  [append.type]: append,
  [remove.type]: remove,
};

/** Tóm tắt để hiện cạnh canvas (tương đương BD-06 của board). */
export function sequenceSummary(scene: Scene): {
  count: number;
  total: number;
  odd: number;
} {
  const derived = deriveSequence(scene);
  return {
    count: derived.items.length,
    total: derived.total,
    odd: derived.items.filter((item) => Math.abs(item.value % 2) === 1).length,
  };
}
