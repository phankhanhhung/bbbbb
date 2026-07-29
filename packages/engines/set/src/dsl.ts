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
