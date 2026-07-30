import type { Scene } from '@combviz/schema';
import { hashScene } from '@combviz/render';
import { DslError, element, isElement, type DslEnvironment, type Value } from '@combviz/dsl';
import { deriveSet, type SetDerived } from './derive.js';

const cache = new Map<string, SetDerived>();

function derived(scene: Scene): SetDerived {
  const key = hashScene(scene);
  const hit = cache.get(key);
  if (hit) return hit;
  const value = deriveSet(scene);
  if (cache.size > 64) cache.clear();
  cache.set(key, value);
  return value;
}

/**
 * Môi trường DSL của Set engine.
 *
 * `incidences` là binding quan trọng nhất: nó **là** vế trái lẫn vế phải của mọi
 * lập luận đếm hai chiều ($\sum_x |\{S \ni x\}| = \sum_S |S|$), nên nó phải là
 * một con số bài toán đọc được chứ không phải thứ tác giả tự cộng rồi viết vào
 * narrative.
 */
export function setEnvironment(scene: Scene): DslEnvironment {
  const state = derived(scene);
  const byId = new Map(state.sets.map((s) => [s.id, s]));

  const tokens: Value[] = state.tokens.map((t) =>
    element(t.id, {
      label: t.label,
      degree: t.sets.length,
      color_class: t.colorClass ?? 0,
    }),
  );

  const sets: Value[] = state.sets.map((s) =>
    element(s.id, {
      label: s.label,
      size: s.size,
      order: s.order,
      color_class: s.colorClass ?? 0,
    }),
  );

  const memberOf = new Map(state.tokens.map((t) => [t.id, new Set(t.sets)]));

  return {
    bindings: {
      tokens,
      sets,
      n: state.tokens.length,
      k: state.sets.length,
      incidences: state.incidences,

      /**
       * Cỡ hợp — số phần tử thuộc **ít nhất một** tập.
       *
       * Khác `n`: tập nền có thể chứa phần tử không thuộc tập nào, và trong bài
       * bao hàm–loại trừ thì đúng chỗ khác nhau ấy là câu trả lời ("bao nhiêu học
       * sinh không tham gia câu lạc bộ nào").
       */
      union_size: state.tokens.filter((t) => t.sets.length > 0).length,

      /**
       * Cỡ giao **nhỏ nhất** trên mọi cặp tập, và cỡ tập lớn nhất / nhỏ nhất.
       *
       * Ba con số của họ bài cực trị: Erdős–Ko–Rado hỏi "gia đình giao nhau lớn
       * nhất", và điều kiện "giao nhau" đọc thẳng là `min_common >= 1`. Dưới hai
       * tập thì `min_common` **vắng mặt** — không có cặp nào, nên mọi con số ở đây
       * đều là bịa; cùng luật với `prufer_code` của engine đồ thị.
       */
      ...(state.sets.length >= 2 ? { min_common: minCommon(state) } : {}),
      max_size: state.sets.reduce((max, s) => Math.max(max, s.size), 0),
      min_size: state.sets.reduce(
        (min, s) => Math.min(min, s.size),
        state.sets.length === 0 ? 0 : Infinity,
      ),
    },

    builtins: {
      /** `member(x, S)` — phần tử `x` có thuộc tập `S` không. */
      member: (args, pos) => {
        const [token, set] = expectTwo(args, pos, 'member');
        return memberOf.get(token.id)?.has(set.id) ?? false;
      },

      /** `subset(A, B)` — mọi phần tử của A đều thuộc B. Nền của bài phản xích. */
      subset: (args, pos) => {
        const [a, b] = expectTwo(args, pos, 'subset');
        if (!byId.has(a.id) || !byId.has(b.id)) return false;
        return state.tokens.every(
          (t) => !t.sets.includes(a.id) || t.sets.includes(b.id),
        );
      },

      /** `common(A, B)` — số phần tử thuộc cả hai tập. */
      common: (args, pos) => {
        const [a, b] = expectTwo(args, pos, 'common');
        return state.tokens.filter((t) => t.sets.includes(a.id) && t.sets.includes(b.id))
          .length;
      },
    },
  };
}

/** Cỡ giao nhỏ nhất trên mọi cặp tập. Gọi khi đã chắc có ít nhất hai tập. */
function minCommon(state: SetDerived): number {
  let best = Infinity;
  for (let i = 0; i < state.sets.length; i += 1) {
    for (let j = i + 1; j < state.sets.length; j += 1) {
      const a = state.sets[i] as { id: string };
      const b = state.sets[j] as { id: string };
      best = Math.min(
        best,
        state.tokens.filter((t) => t.sets.includes(a.id) && t.sets.includes(b.id)).length,
      );
    }
  }
  return best;
}

function expectTwo(
  args: readonly Value[],
  pos: number,
  fn: string,
): [ReturnType<typeof element>, ReturnType<typeof element>] {
  const [a, b] = args;
  if (args.length !== 2 || !a || !b || !isElement(a) || !isElement(b)) {
    throw new DslError(`${fn}() cần đúng hai element`, pos);
  }
  return [a, b];
}
