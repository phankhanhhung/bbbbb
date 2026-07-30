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

/**
 * Luật **lan truyền một bước** — tập đóng, cùng khuôn với `COMBINE_RULES` (SQ-02).
 *
 * Khác `combine` ở chỗ nó đụng **cả dãy** cùng lúc, không phải hai phần tử: cả họ
 * bài "mỗi bước, thay $a_i$ bằng …" là loại thao tác này. Nhận cả dãy và trả cả
 * dãy, nên một luật viết ra được cả phần "vòng quanh" — thứ mà một hàm hai biến
 * không diễn đạt nổi.
 *
 * Vẫn là enum, không phải biểu thức người dùng nhập, vì đúng lý do đã ghi ở
 * `COMBINE_RULES`: cho nhập biểu thức là mở cửa hậu cho DSL-03.
 */
const STEP_RULES = {
  /**
   * Ducci: $a_i \leftarrow |a_i - a_{i+1}|$, **vòng quanh**.
   *
   * Bài kinh điển: viết bốn số trên vòng tròn, mỗi bước thay mỗi số bằng hiệu
   * tuyệt đối của nó với số kế tiếp; chứng minh sau hữu hạn bước tất cả về $0$.
   */
  'abs-diff-cycle': (values: readonly number[]): number[] =>
    values.map((v, i) => Math.abs(v - (values[(i + 1) % values.length] as number))),

  /**
   * Hiệu tuyệt đối **không** vòng: phần tử cuối giữ nguyên.
   *
   * Cùng phép toán, khác biên, và khác biên là khác bài: dãy thẳng thì tổng không
   * còn bất biến theo cách của vòng tròn.
   */
  'abs-diff-line': (values: readonly number[]): number[] =>
    values.map((v, i) =>
      i + 1 < values.length ? Math.abs(v - (values[i + 1] as number)) : v,
    ),

  /** Mỗi số cộng thêm hai số kề (vòng quanh) — họ bài "tam giác Pascal trên vòng". */
  'add-neighbours-cycle': (values: readonly number[]): number[] =>
    values.map(
      (v, i) =>
        v +
        (values[(i + values.length - 1) % values.length] as number) +
        (values[(i + 1) % values.length] as number),
    ),
} as const;

export type StepRule = keyof typeof STEP_RULES;
export const STEP_RULE_IDS = Object.keys(STEP_RULES) as readonly StepRule[];

const STEP_LABELS: Readonly<Record<StepRule, string>> = {
  'abs-diff-cycle': '|aᵢ − aᵢ₊₁| vòng quanh',
  'abs-diff-line': '|aᵢ − aᵢ₊₁| (cuối giữ nguyên)',
  'add-neighbours-cycle': 'aᵢ + hai số kề',
};

export function stepRuleLabel(rule: string): string {
  return Object.hasOwn(STEP_LABELS, rule) ? (STEP_LABELS[rule as StepRule] as string) : rule;
}

/**
 * Một bước lan truyền trên **cả dãy** (SQ-02).
 *
 * Chỉ ở `mode: "sequence"`: luật đọc phần tử **kế tiếp**, mà ở `piles` thì thứ tự
 * không mang nghĩa. Cho chạy ở đó là để người học rút ra một quy luật từ một thứ
 * tự mà bài toán không nói tới.
 */
const step = defineCommand<{ rule: StepRule }>({
  type: 'sequence/step',
  label: (params) => `Một bước: ${stepRuleLabel(params.rule)}`,
  apply(scene, params) {
    if (sequenceConfig(scene).mode === 'piles') return null;
    const rule = STEP_RULES[params.rule];
    if (!rule) return null;

    const items = deriveSequence(scene).items;
    if (items.length === 0) return null;

    const next = rule(items.map((item) => item.value));
    const byId = new Map(items.map((item, i) => [item.id, next[i] as number]));
    let changed = false;

    const elements = scene.elements.map((element) => {
      if (element.type !== 'item' || !byId.has(element.id)) return element;
      const value = byId.get(element.id) as number;
      if (value === Number(element['value'] ?? 0)) return element;
      changed = true;
      return { ...element, value };
    });

    return changed ? withElements(scene, elements) : null;
  },
});

/**
 * Đổ hạt từ **một** ô sang hai ô kề (SQ-02) — chip-firing.
 *
 * Khác `step` ở chỗ nó là thao tác **cục bộ và do người học chọn**, và đó chính
 * là nội dung của họ bài: kết quả cuối **không phụ thuộc thứ tự đổ**. Một lệnh
 * "chạy hết" sẽ giấu mất điều đó.
 *
 * Điều kiện đổ: ô phải có ít nhất $2$ hạt — bằng số láng giềng của nó trên vòng.
 * Không đủ thì **từ chối**, không đổ một phần: một nước không tồn tại mà đi được
 * thì người học "chứng minh" được thứ không đúng.
 */
const fire = defineCommand<{ id: string }>({
  type: 'sequence/fire',
  label: () => 'Đổ hạt sang hai bên',
  apply(scene, params) {
    if (sequenceConfig(scene).mode === 'piles') return null;

    const items = deriveSequence(scene).items;
    const index = items.findIndex((item) => item.id === params.id);
    if (index === -1 || items.length < 3) return null;
    if ((items[index] as { value: number }).value < 2) return null;

    const left = items[(index + items.length - 1) % items.length] as { id: string };
    const right = items[(index + 1) % items.length] as { id: string };
    const delta = new Map<string, number>([[params.id, -2]]);
    for (const neighbour of [left.id, right.id]) {
      delta.set(neighbour, (delta.get(neighbour) ?? 0) + 1);
    }

    return withElements(
      scene,
      scene.elements.map((element) =>
        element.type === 'item' && delta.has(element.id)
          ? { ...element, value: Number(element['value'] ?? 0) + (delta.get(element.id) as number) }
          : element,
      ),
    );
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
  [step.type]: step,
  [fire.type]: fire,
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
