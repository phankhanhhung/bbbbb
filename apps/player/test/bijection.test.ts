import { describe, expect, it } from 'vitest';
import { matchScale, morphFrame, unionBox } from '../src/BijectionPanes.jsx';
import { el, keyed, nodeBox } from '@combviz/render';
import { renderMath } from '../src/math.js';

describe('PRN-04 — cân tỉ lệ hai pane', () => {
  const tall = { x: -20, y: -13, width: 34, height: 57 };
  const wide = { x: -6, y: -9, width: 52, height: 24 };

  it('hai khung ra cùng kích thước', () => {
    const [a, b] = matchScale(tall, wide);

    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
  });

  it('mỗi khung nới quanh tâm của chính nó', () => {
    const centre = (box: { x: number; width: number }): number => box.x + box.width / 2;
    const [a, b] = matchScale(tall, wide);

    // Nới lệch tâm thì hình trôi trong khung, và hai pane lệch nhau theo chiều
    // dọc đúng lúc người đọc đang so hàng này với hàng kia.
    expect(centre(a)).toBeCloseTo(centre(tall), 6);
    expect(centre(b)).toBeCloseTo(centre(wide), 6);
  });

  it('không thu nhỏ khung nào — chỉ nới ra', () => {
    const [a, b] = matchScale(tall, wide);

    expect(a.width).toBeGreaterThanOrEqual(tall.width);
    expect(a.height).toBeGreaterThanOrEqual(tall.height);
    expect(b.width).toBeGreaterThanOrEqual(wide.width);
    expect(b.height).toBeGreaterThanOrEqual(wide.height);
  });

  it('hai khung sẵn bằng nhau thì giữ nguyên', () => {
    const [a, b] = matchScale(tall, tall);

    expect(a).toEqual(tall);
    expect(b).toEqual(tall);
  });
});

describe('PRN-04 — animation biến hình', () => {
  it('khung hợp chứa trọn cả hai', () => {
    const box = unionBox({ x: 0, y: 0, width: 10, height: 4 }, { x: -6, y: 2, width: 5, height: 9 });

    expect(box).toEqual({ x: -6, y: 0, width: 16, height: 11 });
  });

  /**
   * Hai pane dựng **hai dáng cây khác nhau** — đó là lý do phép biến hình phải
   * nói bằng toạ độ chứ không bằng key. Bên trái là `<rect>` nằm ngay dưới nhóm
   * gốc; bên phải là `<g>` chứa một rect và một nhãn, sâu hơn một tầng. Đúng
   * hình dạng mà `subsets-binary-strings` render ra thật.
   */
  const left = [el('g', {}, [keyed('x1', 'rect', { x: 0, y: 0, width: 4, height: 4 })])];
  const right = [
    el('g', {}, [
      el('g', {}, [
        keyed('b1', 'g', {}, [
          el('rect', { x: 20, y: 10, width: 4, height: 4 }),
          el('text', { x: 22, y: 12 }),
        ]),
      ]),
    ]),
  ];
  const pairs = [['x1', 'b1']] as const;

  it('phần tử bên trái trượt tới tâm ảnh của nó', () => {
    // Tâm trái (2,2) → tâm phải (22,12): lệch (20,10). Ở nửa đường thì đúng nửa.
    const frame = morphFrame(left, right, pairs, 0.5);
    const moved = frame[0]!.children![0]!;

    expect(moved.attrs['transform']).toBe('translate(10 5)');
  });

  it('$t = 0$ là đúng hình bên trái, $t = 1$ là đúng hình bên phải', () => {
    expect(morphFrame(left, right, pairs, 0)).toEqual(left);

    const end = morphFrame(left, right, pairs, 1);
    // Chỉ còn pane phải, và key của nó đeo tiền tố để không đụng key bên trái.
    expect(end).toHaveLength(1);
    expect(end[0]!.children![0]!.children![0]!.key).toBe('r:b1');
  });

  it('bay xong mới đổi vai — giữa đường chưa có gì của pane phải', () => {
    // Hai thứ nửa trong suốt chồng lên nhau suốt quãng đường đọc thành một đống
    // nhoè, nên đoạn đổi vai bị đẩy về cuối.
    expect(morphFrame(left, right, pairs, 0.4)).toHaveLength(1);
    expect(morphFrame(left, right, pairs, 0.9).length).toBeGreaterThan(1);
  });

  it('đo được hộp bao qua nhiều tầng và cộng dồn translate', () => {
    const node = el('g', { transform: 'translate(5 5)' }, [
      el('rect', { x: 0, y: 0, width: 2, height: 2 }),
      el('circle', { cx: 10, cy: 0, r: 1 }),
    ]);

    expect(nodeBox(node)).toEqual({ x: 5, y: 4, width: 11, height: 3 });
  });

  it('đọc được path lệnh tuyệt đối — cạnh đồ thị vẽ bằng nó', () => {
    expect(nodeBox(el('path', { d: 'M0 -12L12 0' }))).toEqual({
      x: 0,
      y: -12,
      width: 12,
      height: 12,
    });
  });

  it('từ chối path mà nó không đọc đúng được, thay vì đoán', () => {
    // Lệnh tương đối mang **độ lệch** chứ không phải toạ độ, và cung `A` có bảy
    // tham số mà chỉ hai là toạ độ. Đọc bừa sẽ cho một hộp trông hợp lý mà sai —
    // và một hộp sai ném element ra chỗ vô lý, tệ hơn hẳn không có hộp nào.
    expect(nodeBox(el('path', { d: 'M0 0l10 10' }))).toBeNull();
    expect(nodeBox(el('path', { d: 'M0 0A5 5 0 0 1 10 10' }))).toBeNull();
  });
});

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
