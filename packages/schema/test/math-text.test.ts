import { describe, expect, it } from 'vitest';
import { stripBoldMarkup, toReadableMath, toSearchableText } from '../src/math-text.js';

/**
 * Hai chế độ phải **khác nhau đúng chỗ**: một cái dành cho mắt người, một cái
 * dành cho so khớp chuỗi. Trộn chúng làm một thì hoặc OG card hiện `\times`,
 * hoặc gõ "time" ra mọi bài có phép nhân — dự án này đã dính cả hai.
 */
describe('toReadableMath — chỗ có người đọc', () => {
  it('đổi ký hiệu quen thuộc sang Unicode', () => {
    expect(toReadableMath('bàn $8\\times8$')).toBe('bàn 8×8');
    expect(toReadableMath('$m \\leq 6$')).toBe('m ≤ 6');
    expect(toReadableMath('$a \\neq b$')).toBe('a ≠ b');
  });

  it('giữ nguyên phần văn xuôi ngoài `$…$`', () => {
    expect(toReadableMath('Chứng minh $n$ chia hết cho $3$.')).toBe(
      'Chứng minh n chia hết cho 3.',
    );
  });

  it('đổi chỉ số và số mũ khi có ký tự Unicode tương ứng', () => {
    expect(toReadableMath('$v_1$')).toBe('v₁');
    expect(toReadableMath('$2^n$')).toBe('2ⁿ');
    expect(toReadableMath('$x_{12}$')).toBe('x₁₂');
  });

  it('giữ dấu `_` khi không đổi trọn vẹn được, nhưng bỏ ngoặc nhóm', () => {
    // `v_{max}` mà thành "vmax" thì mất ranh giới giữa tên và chỉ số; để nguyên
    // ngoặc nhọn thì lộ cú pháp LaTeX ra mặt người đọc. `v_max` là chỗ đứng giữa.
    expect(toReadableMath('$v_{max}$')).toBe('v_max');
  });

  it('bỏ lệnh chỉ chỉnh khoảng cách', () => {
    expect(toReadableMath('$1\\!-\\!2$')).toBe('1-2');
    expect(toReadableMath('$a \\quad b$')).toBe('a  b');
  });

  it('không để sót tên lệnh lạ trong kết quả', () => {
    // Lệnh không có trong bảng thì bỏ hẳn, không in ra chữ "frac".
    expect(toReadableMath('$\\frac{1}{2}$')).not.toContain('frac');
  });

  it('văn bản không có toán thì đi qua nguyên vẹn', () => {
    const plain = 'Bàn cờ khuyết hai ô góc đối nhau.';
    expect(toReadableMath(plain)).toBe(plain);
  });
});

describe('toSearchableText — chỗ máy so khớp', () => {
  it('tước cả tên lệnh, không chỉ dấu backslash', () => {
    const out = toSearchableText('Bàn cờ $8\\times8$ và $31$ domino $1\\times2$.');

    expect(out).not.toContain('times');
    expect(out).not.toContain('\\');
    expect(out).not.toContain('$');
    expect(out).toBe('Bàn cờ 8 8 và 31 domino 1 2.');
  });

  it('giữ chữ thường để gõ tiếng Việt vẫn tìm ra', () => {
    expect(toSearchableText('Trong $6$ người bất kỳ')).toContain('người bất kỳ');
  });

  it('gộp khoảng trắng thừa do việc tước sinh ra', () => {
    expect(toSearchableText('$a$   $b$')).toBe('a b');
  });
});

/**
 * M69 — hai lỗ lộ ra ở **lượt nhìn OG card**, không ở test nào.
 *
 * Card là thứ duy nhất người ta thấy khi ai đó chia sẻ link (§11 gọi nó là kênh
 * growth chính), và nó vẽ bằng resvg — không KaTeX, không thẻ `<strong>`. Mọi
 * markup mà Player biết đổi thì ở đây phải được đổi **trước** khi thành chữ.
 */
describe('stripBoldMarkup — chữ đậm ở nơi không có chữ đậm', () => {
  it('bỏ dấu, giữ chữ', () => {
    expect(stripBoldMarkup('bằng **hai** con đường')).toBe('bằng hai con đường');
  });

  it('không đụng `**` nằm trong công thức — ở đó nó là phép nhân', () => {
    expect(stripBoldMarkup('tính $a ** b$ rồi **so** sánh')).toBe('tính $a ** b$ rồi so sánh');
  });

  it('số dấu **lẻ** thì để nguyên tất — tác giả đang viết phép nhân', () => {
    expect(stripBoldMarkup('2 ** 3 và 4')).toBe('2 ** 3 và 4');
  });

  it('không có dấu nào thì trả về đúng chuỗi cũ', () => {
    expect(stripBoldMarkup('không có gì')).toBe('không có gì');
  });
});

describe('toReadableMath — ngoặc thoát là ngoặc thật', () => {
  it('`\\{…\\}` giữ được ngoặc của tập hợp', () => {
    // Trước lượt này ra `\1,2,…,n\`: hai dấu gạch chéo lạc giữa tiêu đề, trên
    // card của đúng những bài nói về tập hợp.
    expect(toReadableMath('tập $\\{1,2,\\dots,n\\}$ có')).toBe('tập {1,2,…,n} có');
  });

  it('ngoặc **nhóm** vẫn bị bỏ như cũ', () => {
    expect(toReadableMath('$x^{12}$')).toBe('x¹²');
    expect(toReadableMath('$a_{max}$')).toBe('a_max');
  });
});
