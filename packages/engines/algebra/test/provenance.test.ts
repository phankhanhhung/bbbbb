import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import {
  algebraLineage,
  lineageOf,
  parseElementId,
  readAlgebra,
  unparse,
  type AlgebraStep,
} from '../src/index.js';

/**
 * Tiểu sử hạng tử (M63, AL-13).
 *
 * Chuỗi dùng suốt tệp này là `2*(x + 3) + 4*x`, phân phối rồi gom hạng tử — chọn nó vì
 * nó chứa **cả ba** hình dạng mà `trace` biết nói, trong ba dòng:
 *
 * | dòng | biểu thức | `trace` |
 * |---|---|---|
 * | 0 | $2(x+3) + 4x$ | — |
 * | 1 | $2x + 2\cdot3 + 4x$ | `e1→[e1,e11]` (**tách**), `e5→[]`, `e4→[]` (**mất**) |
 * | 2 | $6x + 2\cdot3$ | `e10→[e15]`, `e8→[e15]` (**nhập**), bốn nút mất |
 *
 * Và hình dạng thứ tư — nút **đi tiếp nguyên vẹn** — không có mặt trong bảng nào, vì
 * `trace` chỉ ghi chỗ đổi. Đó là hình dạng đông nhất và là chỗ phép nối phải tự suy.
 */
const scene = (start: string, steps: AlgebraStep[] = []): Scene =>
  ({ engine: 'algebra', config: { start, steps }, elements: [] }) as never;

const CHAIN = scene('2*(x + 3) + 4*x', [
  { rule: 'distribute', at: '0' },
  { rule: 'collect_like', at: '' },
]);

const model = readAlgebra(CHAIN);

const rowsOf = (l: ReadonlyMap<number, ReadonlySet<string>>): Record<number, string[]> =>
  Object.fromEntries([...l].map(([row, ids]) => [row, [...ids].sort()]));

describe('chuỗi dùng làm giá đỡ đúng như mô tả', () => {
  it('ba dòng, không từ chối, và `trace` có đủ ba hình dạng', () => {
    expect(model.refusal).toBeNull();
    expect(model.rows.map((r) => unparse(r.expr))).toEqual([
      '((2 * (x + 3)) + (4 * x))',
      '((2 * x) + (2 * 3) + (4 * x))',
      '((6 * x) + (2 * 3))',
    ]);
    // tách, mất, nhập — nếu một luật đổi cách ghi thì các test dưới mất nghĩa chứ
    // không đỏ, nên khoá lại ở đây.
    expect(model.rows[1]!.trace.get('e1')).toEqual(['e1', 'e11']);
    expect(model.rows[1]!.trace.get('e5')).toEqual([]);
    expect(model.rows[2]!.trace.get('e10')).toEqual(['e15']);
    expect(model.rows[2]!.trace.get('e8')).toEqual(['e15']);
  });
});

describe('phả hệ xuôi chiều', () => {
  it('nút **tách hai** thì phả hệ rẽ nhánh, rồi một nhánh chết', () => {
    // Hệ số $2$ của $2(x+3)$: phân phối nhân nó thành hai bản, rồi `collect_like`
    // nuốt bản đứng trước $x$ vào hệ số $6$ và để bản kia lại trong $2\cdot3$.
    expect(rowsOf(lineageOf(model, 0, 'e1'))).toEqual({
      0: ['e1'],
      1: ['e1', 'e11'],
      2: ['e11'],
    });
  });

  it('nút **không ai chạm tới** vẫn tự nối qua cả ba dòng', () => {
    // Đây là nhánh gánh việc: `e3` không xuất hiện trong bảng `trace` nào cả. Bỏ
    // nhánh "còn sống thì tự nối" thì phả hệ này còn đúng một dòng.
    expect(rowsOf(lineageOf(model, 0, 'e3'))).toEqual({ 0: ['e3'], 1: ['e3'], 2: ['e3'] });
  });

  it('nút **biến mất** thì dừng ở dòng cuối cùng nó còn sống', () => {
    // `e5` là cái ngoặc $(x+3)$: phân phối xoá nó. Dòng 1 **không có mặt** trong map,
    // chứ không phải có mặt với tập rỗng.
    expect(rowsOf(lineageOf(model, 0, 'e5'))).toEqual({ 0: ['e5'] });
  });
});

describe('phả hệ ngược chiều', () => {
  it('nút **nhập từ hai** thì đi lên ra hai tổ tiên', () => {
    // "Số $6$ này từ đâu ra?" — từ $2$ và $4$; và lên nữa thì $2$ ấy chưa tồn tại ở
    // dòng đầu (phân phối mới sinh ra nó), nên chỉ còn $4$.
    expect(rowsOf(lineageOf(model, 2, 'e15'))).toEqual({ 0: ['e8'], 1: ['e10', 'e8'], 2: ['e15'] });
  });

  it('chạm giữa chuỗi thì thấy **cả hai chiều**', () => {
    expect(rowsOf(lineageOf(model, 1, 'e11'))).toEqual({ 0: ['e1'], 1: ['e11'], 2: ['e11'] });
  });

  it('nút **mới sinh** không bịa ra tổ tiên', () => {
    expect(rowsOf(lineageOf(model, 2, 'e14'))).toEqual({ 2: ['e14'] });
  });

  it('nút tách hai đi lên đúng một tổ tiên, không nhân đôi', () => {
    // `e1` vừa là **khoá** của `trace` (bản dòng trên đã nhân đôi) vừa còn sống ở
    // dòng dưới với chính tên ấy — hai đường đều dẫn về `e1` ở dòng 0, và `Set` gộp
    // chúng. Xem chú thích trong `provenance.ts` về lớp canh đã gỡ ở đây.
    expect(rowsOf(lineageOf(model, 1, 'e1'))).toEqual({ 0: ['e1'], 1: ['e1'] });
  });
});

describe('từ chối', () => {
  it('id không phải hạng tử → `null`, không phải tập rỗng', () => {
    for (const id of ['row0', 'note1', 'nope', 'cell-0-0', '']) {
      expect(algebraLineage(CHAIN, id)).toBeNull();
    }
  });

  it('hạng tử **không có ở dòng ấy** → `null`', () => {
    // `e1` chết ở dòng 2, `e10` sinh ở dòng 1: hai chiều hụt.
    expect(algebraLineage(CHAIN, 'r2-e1')).toBeNull();
    expect(algebraLineage(CHAIN, 'r0-e10')).toBeNull();
  });

  it('scene engine từ chối → `null`, không nổ', () => {
    expect(algebraLineage(scene('x + 1', [{ rule: 'expand_square', at: '' }]), 'r0-e1')).toBeNull();
  });

  it('`parseElementId` là chiều ngược đúng của `elementId`', () => {
    expect(parseElementId('r12-e34')).toEqual({ row: 12, term: 'e34' });
    expect(parseElementId('row3')).toBeNull();
    expect(parseElementId('rx-e1')).toBeNull();
  });
});

describe('danh tính vẽ ra', () => {
  it('trả về id có mực, dùng thẳng được cho `highlight`', () => {
    expect([...algebraLineage(CHAIN, 'r0-e1')!].sort()).toEqual([
      'r0-e1',
      'r1-e1',
      'r1-e11',
      'r2-e11',
    ]);
  });

  it('phả hệ chạm **nhiều hơn một dòng** — đó là cả điểm của tính năng', () => {
    const rows = new Set([...algebraLineage(CHAIN, 'r2-e15')!].map((id) => id.slice(0, 2)));
    expect(rows.size).toBeGreaterThanOrEqual(2);
  });
});
