import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import {
  createTrail,
  moveTrail,
  positionKey,
  stepTrail,
  trailFull,
  trailRows,
  TRAIL_LIMIT,
} from '../src/trail.js';

/**
 * Vết chân người học (SBX-06, M75).
 *
 * `history.ts` giữ một **dòng**; mục này giữ cái **cây** mà dòng ấy vứt đi. Mọi
 * khẳng định dưới đây đo đúng chỗ hai thứ khác nhau.
 */

const board = (...ids: string[]): Scene =>
  ({
    engine: 'board',
    config: { rows: 2, cols: 2 },
    elements: ids.map((id) => ({ id, type: 'piece', kind: 'king', pos: [0, 0] })),
  }) as never;

describe('khoá vị trí', () => {
  it('bỏ **thứ tự** trong `elements`: thêm A rồi B là cùng một thế với B rồi A', () => {
    // Không có chỗ này thì bản đồ không bao giờ nói được "đây là chỗ cũ" — mà đó
    // là thứ đáng tiền duy nhất ở đây.
    expect(positionKey(board('a', 'b'))).toBe(positionKey(board('b', 'a')));
  });

  it('nhưng **nội dung** khác thì khoá khác', () => {
    expect(positionKey(board('a'))).not.toBe(positionKey(board('a', 'b')));
    expect(positionKey(board('a'))).not.toBe(positionKey(board('b')));
  });
});

describe('đi và ghi vết', () => {
  it('mỗi bước một nút, một cạnh, mang nhãn của lệnh', () => {
    let t = createTrail(board());
    t = stepTrail(t, board('a'), 'đặt vua');
    expect(t.nodes.size).toBe(2);
    expect(t.at).toBe(positionKey(board('a')));
    expect([...t.nodes.values()][0]!.out).toEqual([
      { label: 'đặt vua', to: positionKey(board('a')) },
    ]);
  });

  it('lệnh không đổi gì thì **không** để lại vết', () => {
    // Một cạnh tự trỏ vào mình vẽ ra một vòng tròn không nói gì.
    const t = createTrail(board('a'));
    expect(stepTrail(t, board('a'), 'đặt lại y hệt')).toBe(t);
  });

  it('hai lối tới cùng một thế gộp thành **một** nút, `visits` tăng', () => {
    const start = createTrail(board());
    // Lối 1: a rồi b.
    let t = stepTrail(start, board('a'), 'đặt a');
    t = stepTrail(t, board('a', 'b'), 'đặt b');
    // Lùi về gốc rồi đi lối 2: b rồi a.
    t = moveTrail(t, t.root);
    t = stepTrail(t, board('b'), 'đặt b');
    t = stepTrail(t, board('a', 'b'), 'đặt a');

    const joined = t.nodes.get(positionKey(board('a', 'b')))!;
    expect(joined.visits).toBe(2);
    // Bốn thế: rỗng, {a}, {b}, {a,b}. Không phải năm.
    expect(t.nodes.size).toBe(4);
  });

  it('nhánh bỏ dở **còn lại** — đây là chỗ nó khác `history.ts`', () => {
    // `execute` đặt `future: []` khi làm việc mới, và chú thích của chính nó nói
    // rằng giữ lại sẽ biến lịch sử thành cây "mà không ai hỏi". Đây là lúc có hỏi.
    let t = createTrail(board());
    t = stepTrail(t, board('a'), 'đặt a');
    t = moveTrail(t, t.root);
    t = stepTrail(t, board('b'), 'đặt b');

    expect(t.nodes.has(positionKey(board('a')))).toBe(true);
    expect(t.nodes.get(t.root)!.out).toHaveLength(2);
  });

  it('quay về một thế cũ bằng nước đi tạo **cạnh**, không tạo cây vô hạn', () => {
    let t = createTrail(board('a'));
    t = stepTrail(t, board('a', 'b'), 'đặt b');
    t = stepTrail(t, board('a'), 'xoá b');
    t = stepTrail(t, board('a', 'b'), 'đặt b');

    expect(t.nodes.size).toBe(2);
    expect(t.nodes.get(positionKey(board('a')))!.out).toHaveLength(1);
    expect(t.nodes.get(positionKey(board('a', 'b')))!.visits).toBe(2);
  });

  it('độ sâu lấy đường **ngắn nhất đã biết**, không tụt xuống khi quay lại lối dài', () => {
    let t = createTrail(board());
    t = stepTrail(t, board('a'), 'đặt a');
    const target = positionKey(board('a'));
    expect(t.nodes.get(target)!.depth).toBe(1);

    // Tới lại chính nó bằng một lối vòng ba bước.
    t = stepTrail(t, board('a', 'b'), 'đặt b');
    t = stepTrail(t, board('a', 'b', 'c'), 'đặt c');
    t = stepTrail(t, board('a'), 'xoá hai quân');
    expect(t.nodes.get(target)!.depth).toBe(1);
  });
});

describe('đứng sang chỗ khác', () => {
  it('undo/redo/nhảy **không** đếm là một lần đặt chân', () => {
    // Đếm nó vào thì "đã tới đây mấy lần" nói dối ngay ở lần undo đầu tiên.
    let t = createTrail(board());
    t = stepTrail(t, board('a'), 'đặt a');
    t = moveTrail(t, t.root);
    t = moveTrail(t, positionKey(board('a')));

    expect(t.nodes.get(positionKey(board('a')))!.visits).toBe(1);
    expect(t.at).toBe(positionKey(board('a')));
  });

  it('nhảy tới một chỗ **chưa từng tới** thì không đi đâu cả', () => {
    // Bản đồ chỉ chứa những chỗ người học đã đặt chân — không có cửa nào đi tới
    // một thế mà họ chưa dựng ra. Đây là chỗ NG-03 được giữ bằng kiểu dữ liệu.
    const t = createTrail(board());
    expect(moveTrail(t, positionKey(board('z')))).toBe(t);
  });
});

describe('trần và bố cục', () => {
  it('chạm trần thì **vẫn đi**, chỉ không ghi thêm — và nói ra', () => {
    let t = createTrail(board());
    for (let i = 0; i < TRAIL_LIMIT + 5; i += 1) {
      t = stepTrail(t, board(...Array.from({ length: i + 1 }, (_, k) => `p${k}`)), `bước ${i}`);
    }
    expect(t.nodes.size).toBe(TRAIL_LIMIT);
    expect(trailFull(t)).toBe(true);
    // Chỗ đang đứng vẫn theo kịp người học, dù nó không còn trên bản đồ.
    expect(t.nodes.has(t.at)).toBe(false);
  });

  it('xếp hàng theo độ sâu, hàng nào cũng có mặt', () => {
    let t = createTrail(board());
    t = stepTrail(t, board('a'), 'đặt a');
    t = moveTrail(t, t.root);
    t = stepTrail(t, board('b'), 'đặt b');

    const rows = trailRows(t);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(1);
    expect(rows[1]).toHaveLength(2);
  });
});
