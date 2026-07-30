import type { Scene } from '@combviz/schema';
import { hashScene } from '@combviz/render';
import { DslError, element, isElement, type DslEnvironment, type Value } from '@combviz/dsl';
import { deriveSequence, type SequenceDerived } from './geometry.js';

/**
 * Môi trường DSL của Sequence engine.
 *
 * Bộ binding chọn theo **thứ mà lời giải của họ bài này thật sự nói tới**:
 * tổng, số phần tử, tính chẵn lẻ, số nghịch thế. Không thêm gì ngoài đó — mỗi
 * binding thừa là một thứ tác giả phải học và một thứ ta phải giữ tương thích.
 */
const cache = new Map<string, SequenceDerived>();

function derived(scene: Scene): SequenceDerived {
  const key = hashScene(scene);
  const hit = cache.get(key);
  if (hit) return hit;

  const value = deriveSequence(scene);
  // Cache nhỏ và thô như ở board engine: invariant strip eval cùng một scene cho
  // mỗi biểu thức, nên hit rate cao mà không cần chiến lược gì phức tạp.
  if (cache.size > 64) cache.clear();
  cache.set(key, value);
  return value;
}

export function sequenceEnvironment(scene: Scene): DslEnvironment {
  const state = derived(scene);

  const items: Value[] = state.items.map((item) =>
    element(item.id, {
      value: item.value,
      pos: item.pos,
      color_class: item.colorClass ?? 0,
      label: item.label ?? '',
      even: item.value % 2 === 0,
      /** SQ-01: dãy con tăng / giảm ngặt dài nhất **kết thúc** tại phần tử này. */
      inc: item.inc,
      dec: item.dec,
    }),
  );

  return {
    bindings: {
      items,
      n: state.items.length,
      total: state.total,
      /**
       * Số nghịch thế — bất biến của cả họ bài hoán vị và bài đổi chỗ.
       *
       * Có sẵn ở đây thay vì bắt tác giả viết bằng `count` lồng nhau: biểu thức
       * đó là $O(n^2)$ viết tay, dễ sai, và xuất hiện ở gần như mọi bài dùng
       * tính chẵn lẻ của hoán vị (15-puzzle, sắp xếp bằng đổi chỗ).
       */
      inversions: inversions(state),
      /**
       * SQ-01 — dãy con đơn điệu dài nhất của cả dãy.
       *
       * Có sẵn vì cả họ Erdős–Szekeres hỏi đúng hai con số này, và viết chúng bằng
       * `count` lồng nhau thì không viết nổi: quy hoạch động không diễn đạt được
       * trong một grammar không có biến (DSL-01).
       */
      longest_increasing: state.longestIncreasing,
      longest_decreasing: state.longestDecreasing,
      cuts: state.cuts.map((cut) => element(cut.id, { before: cut.before })),
    },

    builtins: {
      /** Hai phần tử đứng cạnh nhau. Vô nghĩa ở chế độ `piles` — và đó là chủ ý. */
      adjacent: (args, pos) => {
        const [a, b] = expectTwo(args, pos, 'adjacent');
        return Math.abs(Number(a.props['pos']) - Number(b.props['pos'])) === 1;
      },

      /** Giá trị tuyệt đối của hiệu — phép toán trung tâm của họ bài "xoá hai số". */
      gap: (args, pos) => {
        const [a, b] = expectTwo(args, pos, 'gap');
        return Math.abs(Number(a.props['value']) - Number(b.props['value']));
      },
    },
  };
}

/**
 * Đếm cặp $(i, j)$ với $i < j$ mà $a_i > a_j$.
 *
 * $O(n^2)$ có chủ đích: bound `maxItems` là 60, nên tối đa 1770 cặp — nhanh hơn
 * nhiều so với chi phí đọc hiểu một cây Fenwick trong một codebase một người nuôi.
 */
function inversions(state: SequenceDerived): number {
  const values = state.items.map((item) => item.value);
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      if ((values[i] as number) > (values[j] as number)) count += 1;
    }
  }
  return count;
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
