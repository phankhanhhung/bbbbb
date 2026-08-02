import { describe, expect, it } from 'vitest';
import { renderMath } from '../src/math.js';

/**
 * Phép biến hình **không** còn tồn tại, và khung hợp đi theo nó.
 *
 * M37 dựng biến hình tại chỗ trong file này; các tầng dưới lần lượt nhận lại
 * từng phần, rồi cả chế độ ấy bị thay bằng **điểm danh từng cặp** — hai pane
 * đứng nguyên chỗ, không gộp toạ độ, nên không còn khung hợp nào để tính. Timeline
 * mới có sổ riêng ở `bijection-rollcall.test.ts`.
 */

describe('renderMath — chữ đậm ngoài công thức', () => {
  it('đổi `**…**` thành <strong>', () => {
    expect(renderMath('phủ **hai lần**')).toContain('<strong>hai lần</strong>');
  });

  it('vẫn thoát HTML — nội dung bài là dữ liệu (NFR-S1)', () => {
    // Escape chạy **trước**, nên regex đậm chỉ còn gặp văn bản trơ.
    const out = renderMath('**<img src=x onerror=alert(1)>**');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('không đụng `**` nằm trong công thức', () => {
    expect(renderMath('$a ** b$')).not.toContain('<strong>');
  });

  it('dấu sao lẻ để nguyên, không nuốt phần còn lại', () => {
    expect(renderMath('2 ** 3 và 4')).toContain('2 ** 3 và 4');
  });
});

describe('renderMath — chữ đậm bao quanh công thức', () => {
  it('mở ở đoạn này, đóng ở đoạn kia', () => {
    // Hai dấu sao rơi vào hai đoạn văn khác nhau vì có công thức chen giữa. Đây
    // là dạng phổ biến nhất trong kho, và bản đầu tiên bỏ sót đúng nó.
    const out = renderMath('sao cho **mỗi bạn nhận ít nhất $1$ chiếc**.');

    expect(out).toContain('<strong>');
    expect(out).toContain('</strong>');
    expect(out).not.toContain('**');
  });

  it('thẻ mở và thẻ đóng cân nhau', () => {
    const out = renderMath('**a** rồi $x$ rồi **b $y$ c**');
    expect((out.match(/<strong>/g) ?? []).length).toBe(2);
    expect((out.match(/<\/strong>/g) ?? []).length).toBe(2);
  });
});
