import { describe, expect, it } from 'vitest';
import {
  activePhases,
  applyChoreography,
  phaseProgress,
  timelineLength,
  type Choreography,
  type Phase,
} from '../src/choreography.js';
import { el, keyed, type SvgNode } from '../src/svg-node.js';

const phase = (over: Partial<Phase> & Pick<Phase, 'id' | 'kind'>): Phase => ({
  targets: ['a'],
  at: 0,
  duration: 1000,
  anchor: 'a1',
  ...over,
});

const spec = (...phases: Phase[]): Choreography => ({ phases });

describe('timeline', () => {
  it('độ dài là mốc kết thúc muộn nhất, không phải tổng', () => {
    // Hai pha chạy chồng lên nhau là chuyện thường: "làm mờ phần còn lại" và
    // "nhấn ô này" thường diễn ra cùng lúc. Cộng dồn sẽ cho một timeline dài gấp
    // đôi thứ người xem thấy.
    expect(
      timelineLength(
        spec(
          phase({ id: 'p1', kind: 'dim', at: 0, duration: 800 }),
          phase({ id: 'p2', kind: 'focus', at: 200, duration: 400 }),
        ),
      ),
    ).toBe(800);
  });

  it('pha `duration: 0` là cú lật tức thì, không phải NaN', () => {
    // Chia cho 0 ra NaN, và NaN trong SVG không báo lỗi — nó chỉ làm hình biến
    // mất. Đây là lý do nhánh này tồn tại.
    const flip = phase({ id: 'p', kind: 'show', at: 500, duration: 0 });

    expect(phaseProgress(flip, 499)).toBe(0);
    expect(phaseProgress(flip, 500)).toBe(1);
    expect(phaseProgress(flip, 900)).toBe(1);
  });

  it('easing mặc định là ease-in-out, `linear` thì tuyến tính', () => {
    const p = phase({ id: 'p', kind: 'show', at: 0, duration: 1000 });

    expect(phaseProgress(p, 500)).toBe(0.5);
    expect(phaseProgress(p, 250)).toBeLessThan(0.25);
    expect(phaseProgress({ ...p, easing: 'linear' }, 250)).toBe(0.25);
  });

  it('pha đã bắt đầu xếp theo thời gian — Player đọc pha cuối để biết đang nói câu nào', () => {
    const list = activePhases(
      spec(
        phase({ id: 'sau', kind: 'focus', at: 600, anchor: 'a2' }),
        phase({ id: 'truoc', kind: 'dim', at: 100, anchor: 'a1' }),
      ),
      700,
    );

    expect(list.map((p) => p.id)).toEqual(['truoc', 'sau']);
    expect(list.at(-1)!.anchor).toBe('a2');
  });
});

describe('xác định (CHO-08)', () => {
  it('cùng ms cho ra cây giống hệt nhau', () => {
    // Player gọi mỗi rAF, render headless gọi theo timestep cố định. Hai bên phải
    // ra byte giống nhau, nên hàm không được đọc giờ, random hay giữ trạng thái.
    const nodes = [keyed('a', 'rect', { x: 0, opacity: 1 })];
    const s = spec(phase({ id: 'p', kind: 'dim', at: 0, duration: 900 }));

    expect(applyChoreography(nodes, s, 371)).toEqual(applyChoreography(nodes, s, 371));
  });

  it('không sửa cây đầu vào', () => {
    const nodes: SvgNode[] = [keyed('a', 'rect', { x: 0 })];
    applyChoreography(nodes, spec(phase({ id: 'p', kind: 'hide' })), 500);

    expect(nodes[0]!.attrs).toEqual({ x: 0 });
  });
});

describe('morph xuyên engine — đường hộp bao', () => {
  /**
   * Đúng hình dạng thật của `subsets-binary-strings`: bên trái là `<rect>` nằm
   * ngay dưới nhóm gốc, bên phải là `<g>` **rỗng thuộc tính** chứa rect và nhãn,
   * sâu hơn một tầng.
   */
  const left = [el('g', {}, [keyed('x1', 'rect', { x: 0, y: 0, width: 4, height: 4 })])];
  const boxes = (id: string) =>
    id === 'x1'
      ? [{ x: 0, y: 0, width: 4, height: 4 }]
      : id === 'b1'
        ? [{ x: 20, y: 10, width: 4, height: 4 }]
        : undefined;
  const spec: Choreography = {
    phases: [
      phase({ id: 'p', kind: 'morph', targets: ['x1'], to: 'b1', at: 0, duration: 100, easing: 'linear' }),
    ],
  };

  it('không có `boxOf` thì **không gì chuyển động** — và đó là lý do nó tồn tại', () => {
    // Đường sao chép thuộc tính chỉ chạy khi hai element cùng bộ thuộc tính, tức
    // là cùng engine. Đích là `<g>` rỗng nên vòng lặp bỏ qua sạch: chạy đủ thời
    // lượng, màn hình đứng im, không lỗi không cảnh báo. Test này khoá lại **sự
    // thật** ấy để không ai tưởng đường cũ đủ dùng.
    const frame = applyChoreography(left, spec, 50);
    expect(frame[0]!.children![0]!.attrs['transform']).toBeUndefined();
  });

  it('có `boxOf` thì trượt theo hiệu hai tâm', () => {
    // Tâm trái $(2,2)$ → tâm phải $(22,12)$: lệch $(20,10)$; nửa đường là nửa.
    const frame = applyChoreography(left, spec, 50, { boxOf: boxes });
    expect(frame[0]!.children![0]!.attrs['transform']).toBe('translate(10 5)');
  });

  it('$t = 0$ trả về cây y nguyên, không kèm `translate(0 0)`', () => {
    expect(applyChoreography(left, spec, 0, { boxOf: boxes })).toEqual(left);
  });

  it('tra chủ sở hữu theo `data-el` trước `key`', () => {
    // Node mang mực đeo key riêng của renderer (`x1__S`) còn `data-el` mới nói
    // nó thuộc về `x1`. Chỉ nhìn `key` thì pha `morph` không tìm thấy nó.
    const ink = [
      el('g', {}, [keyed('x1__S', 'rect', { x: 0, y: 0, 'data-el': 'x1' })]),
    ];
    const frame = applyChoreography(ink, spec, 50, { boxOf: boxes });
    expect(frame[0]!.children![0]!.attrs['transform']).toBe('translate(10 5)');
  });

  it('bay tới bản sao **gần nhất** khi đích được vẽ ở nhiều chỗ', () => {
    // Ma trận kề: cạnh hiện ở hai ô đối xứng. Lấy tâm cả cụm sẽ ném nó vào ô nằm
    // trên đường chéo — một ô mang nghĩa ngược hẳn.
    const twoCells = (id: string) =>
      id === 'x1'
        ? [{ x: 0, y: 0, width: 4, height: 4 }]
        : [
            { x: 100, y: 0, width: 4, height: 4 },
            { x: 0, y: 100, width: 4, height: 4 },
          ];
    const frame = applyChoreography(left, spec, 100, { boxOf: twoCells });
    // Ô gần nhất theo khoảng cách là ô nào cũng được — điều phải đúng là nó đáp
    // xuống **một** trong hai, không phải điểm giữa $(50,50)$.
    const t = String(frame[0]!.children![0]!.attrs['transform']);
    expect(['translate(100 0)', 'translate(0 100)']).toContain(t);
  });
});

describe('các loại pha', () => {
  const cell = (attrs: Record<string, string | number>): SvgNode[] => [
    keyed('a', 'rect', attrs),
  ];

  it('`show` giữ element **ẩn** trước mốc của nó', () => {
    // Nếu pha chưa bắt đầu bị bỏ qua hẳn, element hiện sẵn từ khung đầu và pha
    // "hiện ra" chẳng hiện ra cái gì.
    const s = spec(phase({ id: 'p', kind: 'show', at: 400, duration: 200 }));

    expect(applyChoreography(cell({}), s, 0)[0]!.attrs['opacity']).toBe(0);
    expect(applyChoreography(cell({}), s, 600)[0]!.attrs['opacity']).toBe(1);
  });

  it('độ mờ **nhân** vào giá trị sẵn có chứ không đè', () => {
    // Nền mặt phẳng của GR-05 vốn ở 0.5. Đè thành 1 sẽ khiến một pha `dim` làm
    // mặt ấy *đậm lên* — ngược hẳn ý tác giả.
    const faded = applyChoreography(
      cell({ opacity: 0.5 }),
      spec(phase({ id: 'p', kind: 'dim', at: 0, duration: 0 })),
      10,
    );

    expect(faded[0]!.attrs['opacity']).toBe(0.125);
  });

  it('`focus` gắn cờ chứ không tự chọn màu', () => {
    // Lớp này không biết theme. Nó nói "được nhấn", CSS quyết định trông thế nào.
    const out = applyChoreography(
      cell({ fill: '#123456' }),
      spec(phase({ id: 'p', kind: 'focus', at: 0, duration: 0 })),
      10,
    );

    expect(out[0]!.attrs['data-phase']).toBe(1);
    expect(out[0]!.attrs['fill']).toBe('#123456');
  });

  it('`move` dời tới chỗ element đích, đọc vị trí từ chính cây đã render', () => {
    const nodes = [keyed('a', 'rect', { x: 0, y: 0 }), keyed('b', 'rect', { x: 40, y: 20 })];
    const out = applyChoreography(
      nodes,
      spec(
        phase({ id: 'p', kind: 'move', to: 'b', at: 0, duration: 100, easing: 'linear' }),
      ),
      50,
    );

    expect(out[0]!.attrs).toMatchObject({ x: 20, y: 10 });
  });

  it('`move` **không** biến hình, `morph` thì có', () => {
    // Nội suy `d` giữa hai path khác số đoạn cho ra hình rác, nên tác giả phải
    // chủ động nói "hai hình này morph được".
    const nodes = [keyed('a', 'path', { d: 'M0 0L10 0' }), keyed('b', 'path', { d: 'M0 0L30 0' })];
    const opts = { at: 0, duration: 100, easing: 'linear' as const, to: 'b' };

    expect(
      applyChoreography(nodes, spec(phase({ id: 'p', kind: 'move', ...opts })), 50)[0]!.attrs['d'],
    ).toBe('M0 0L10 0');
    expect(
      applyChoreography(nodes, spec(phase({ id: 'p', kind: 'morph', ...opts })), 50)[0]!.attrs['d'],
    ).toBe('M0 0L20 0');
  });

  it('pha muộn hơn ghi đè pha sớm hơn khi cùng chạm một element', () => {
    // Thứ tự áp là thứ tự **thời gian**, không phải thứ tự khai trong file.
    const s = spec(
      phase({ id: 'sau', kind: 'show', at: 100, duration: 0 }),
      phase({ id: 'truoc', kind: 'hide', at: 0, duration: 0 }),
    );

    expect(applyChoreography(cell({}), s, 200)[0]!.attrs['opacity']).toBe(1);
  });

  it('chạm tới element nằm sâu trong cây, và bỏ qua node không key', () => {
    const nodes = [el('g', {}, [keyed('a', 'rect', {}), el('rect', {})])];
    const out = applyChoreography(
      nodes,
      spec(phase({ id: 'p', kind: 'hide', at: 0, duration: 0 })),
      10,
    );

    expect(out[0]!.children![0]!.attrs['opacity']).toBe(0);
    expect(out[0]!.children![1]!.attrs).toEqual({});
  });
});
