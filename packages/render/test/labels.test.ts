import { describe, expect, it } from 'vitest';
import {
  EMPTY_ATLAS,
  UNITS_PER_EX,
  labelAscent,
  labelDescent,
  labelScale,
  labelWidth,
  lookupLabel,
  placeLabel,
  type LabelAtlas,
} from '../src/labels.js';
import { toSvgString } from '../src/serialize.js';

/**
 * Một entry dựng tay, số lấy đúng từ đầu ra MathJax cho `n^2`.
 *
 * Không gọi MathJax ở đây: gói này không biết MathJax, và test cũng không nên
 * biết. Thứ cần khoá là **hợp đồng** — viewBox vào, toạ độ scene ra.
 */
const ATLAS: LabelAtlas = {
  version: 'test',
  entries: {
    'n^2': {
      vb: [0, -833.9, 1036.6, 844.9],
      c: [{ t: 'path', a: { d: 'M0 0 L10 10' } }],
    },
  },
};

describe('tra bảng', () => {
  it('có thì trả entry, không có thì trả null', () => {
    expect(lookupLabel(ATLAS, 'n^2')).not.toBeNull();
    expect(lookupLabel(ATLAS, 'n^3')).toBeNull();
  });

  it('không lấy nhầm thuộc tính của Object.prototype', () => {
    // `entries` là object thường; tra `toString` mà không chặn sẽ trả về một hàm,
    // rồi renderer đi đặt một hàm vào cây SVG.
    expect(lookupLabel(ATLAS, 'toString')).toBeNull();
    expect(lookupLabel(ATLAS, 'constructor')).toBeNull();
    expect(lookupLabel(EMPTY_ATLAS, '__proto__')).toBeNull();
  });
});

describe('đơn vị', () => {
  it('tỉ lệ tuyến tính theo cỡ chữ', () => {
    expect(labelScale(10)).toBeCloseTo(labelScale(5) * 2, 12);
  });

  it('hằng số `ex` nằm trong khoảng MathJax thật sự dùng', () => {
    // Chốt canh thật cho hằng số này nằm ở phía sinh bảng
    // (`tools/pipeline/test/labels.test.ts`): ở đó có MathJax nên đối chiếu được
    // với thuộc tính `width` mà chính nó khai. Ở đây chỉ giữ một hàng rào thô để
    // không ai sửa nhầm thành một con số vô lý.
    expect(UNITS_PER_EX).toBeGreaterThan(400);
    expect(UNITS_PER_EX).toBeLessThan(500);
  });

  it('cao + sâu = chiều cao viewBox, quy về đơn vị scene', () => {
    const entry = lookupLabel(ATLAS, 'n^2')!;
    const total = labelAscent(entry, 5) + labelDescent(entry, 5);
    expect(total).toBeCloseTo(844.9 * labelScale(5), 9);
    expect(labelWidth(entry, 5)).toBeCloseTo(1036.6 * labelScale(5), 9);
  });
});

describe('đặt nhãn', () => {
  const svg = (node: ReturnType<typeof placeLabel>): string =>
    toSvgString([node], { viewport: { x: 0, y: 0, width: 10, height: 10 } });

  it('lật đứng: `scale(s, -s)`, vì MathJax dựng path với $y$ hướng lên', () => {
    const out = svg(
      placeLabel(ATLAS, 'n^2', { x: 2, y: 8, fontSize: 5, fill: '#111' }),
    );
    const s = labelScale(5);
    expect(out).toContain(`translate(2 8) scale(${round(s)} ${round(-s)})`);
    expect(out).toContain('M0 0 L10 10');
  });

  it('nhãn thiếu bảng vẽ **ra mặt**, kèm nguyên chuỗi LaTeX', () => {
    const out = svg(
      placeLabel(ATLAS, '\\zeta(3)', {
        x: 0,
        y: 0,
        fontSize: 5,
        fill: '#111',
        missingFill: '#f00',
      }),
    );
    expect(out).toContain('thiếu atlas');
    expect(out).toContain('\\zeta(3)');
    expect(out).toContain('#f00');
  });

  it('bảng rỗng thì mọi nhãn đều là nhãn thiếu — không có nhánh im lặng nào', () => {
    const out = svg(placeLabel(EMPTY_ATLAS, 'n^2', { x: 0, y: 0, fontSize: 5, fill: '#111' }));
    expect(out).toContain('thiếu atlas');
  });
});

function round(value: number): number {
  return Math.round(value * 10000) / 10000 + 0;
}
