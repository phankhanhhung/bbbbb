import type { Scene } from '@combviz/schema';
import { element, type DslEnvironment, type Value } from '@combviz/dsl';
import { readDerivation } from './model.js';

/**
 * Môi trường DSL của Derivation engine.
 *
 * Ít binding, và cố ý ít. Engine này **không hiểu công thức** — nó xếp chỗ cho
 * LaTeX chứ không phân tích cú pháp toán học, nên mọi binding kiểu `value` hay
 * `equals` sẽ là lời hứa nó không giữ nổi. Thứ nó biết chắc là cấu trúc: bao
 * nhiêu dòng, bao nhiêu hạng tử, cái nào đã triệt tiêu.
 */
export function derivationEnvironment(scene: Scene): DslEnvironment {
  const model = readDerivation(scene);
  const all = model.rows.flatMap((row) => row.terms);

  const terms: Value[] = all.map((term) =>
    element(term.id, {
      row: term.row,
      tex: term.tex,
      role: term.role,
      cancelled: term.cancelled,
      color_class: term.colorClass,
    }),
  );

  const rows: Value[] = model.rows.map((row) =>
    element(row.id, {
      terms: row.terms.length,
      note: row.note ?? '',
    }),
  );

  return {
    bindings: {
      rows,
      terms,
      n_rows: model.rows.length,
      n_terms: all.length,
      cancelled: all.filter((t) => t.cancelled).length,
    },
    builtins: {},
  };
}
