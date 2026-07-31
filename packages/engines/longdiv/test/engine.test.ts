import { describe, expect, it } from 'vitest';
import { createContext, createRenderer } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import {
  longDivHitTest,
  longDivRenderer,
  longDivSchemaFragment,
  readLongDiv,
  resolveLongDivValidator,
  layout,
} from '../src/index.js';

const renderer = createRenderer([longDivRenderer]);
const ctx = createContext(defaultTheme);

const scene = (dividend: number[], divisor: number[], extra: object = {}): Scene =>
  ({ engine: 'longdiv', config: { dividend, divisor, ...extra }, elements: [] }) as never;

/** Đúng phép chia trong ảnh chụp mà chính chủ đưa. */
const PHOTO = scene([1, 2, -1, 6, -2], [1, 0, -3]);

const show = (terms: readonly { degree: number; coefficient: number }[]): string =>
  terms.length === 0
    ? '0'
    : terms
        .map((t, i) => {
          const sign = t.coefficient < 0 ? ' − ' : i === 0 ? '' : ' + ';
          const a = Math.abs(t.coefficient);
          const body =
            t.degree === 0 ? String(a) : `${a === 1 ? '' : a}x${t.degree === 1 ? '' : `^${t.degree}`}`;
          return sign + body;
        })
        .join('');

describe('thuật toán chia dọc', () => {
  it('dựng lại **từng dòng** của bản viết tay trong ảnh', () => {
    // Không chỉ kiểm thương và dư: cả các dòng trung gian, vì hình **là** các
    // dòng ấy. Thương đúng mà dòng giữa sai thì bài vẫn dạy sai.
    const m = readLongDiv(PHOTO);

    expect(m.refusal).toBeNull();
    expect(show(m.quotient.terms)).toBe('x^2 + 2x + 2');
    expect(show(m.beats[0]!.sub.terms)).toBe('x^4 − 3x^2');
    expect(show(m.beats[0]!.rest.terms)).toBe('2x^3 + 2x^2 + 6x');
    expect(show(m.beats[1]!.rest.terms)).toBe('2x^2 + 12x − 2');
    expect(show(m.remainder.terms)).toBe('12x + 4');
  });

  it('mỗi nhịp **hạ đúng một hạng tử** — đó là chỗ khác bảng hệ số', () => {
    const m = readLongDiv(PHOTO);

    expect(m.beats.map((b) => b.broughtDown)).toEqual([1, 0, null]);
  });

  it('$A = B \\cdot Q + R$ với mọi phép chia thử', () => {
    // Vét một dải: bất biến này là toàn bộ nghĩa của "chia có dư", nên nó phải
    // đúng cho mọi cấu hình chứ không riêng ví dụ đẹp.
    const mul = (u: number[], v: number[]): number[] => {
      const out = new Array<number>(u.length + v.length - 1).fill(0);
      u.forEach((a, i) => v.forEach((b, j) => { out[i + j] = (out[i + j] as number) + a * b; }));
      return out;
    };
    const bad: string[] = [];

    for (const A of [[1, 5, 6], [1, 3, 5], [1, 0, 0, -1], [1, 2, -1, 6, -2], [2, -4, 0, 6]]) {
      for (const B of [[1, 2], [1, -1], [1, 0, -3], [2, 0]]) {
        const m = readLongDiv(scene(A, B));
        if (m.refusal !== null) continue;
        const toArray = (terms: readonly { degree: number; coefficient: number }[], top: number): number[] => {
          const out = new Array<number>(top + 1).fill(0);
          for (const t of terms) out[top - t.degree] = t.coefficient;
          return out;
        };
        const degQ = m.quotient.terms.length === 0 ? 0 : Math.max(...m.quotient.terms.map((t) => t.degree));
        const product = mul(B, toArray(m.quotient.terms, degQ));
        const rebuilt = product.map(
          (c, i) => c + (toArray(m.remainder.terms, m.degA)[i + m.degA + 1 - product.length] ?? 0),
        );
        if (rebuilt.join(',') !== A.join(',')) bad.push(`${A} ÷ ${B} → ${rebuilt}`);
      }
    }

    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('bậc dư luôn nhỏ hơn bậc số chia, và validator nói ra', () => {
    const check = resolveLongDivValidator('remainder-degree-drops')!.check(PHOTO);

    expect(check.ok).toBe(true);
    expect(check.message).toContain('1 < 2');
  });

  it('thương không nguyên thì **từ chối**, không vẽ bảng nửa vời', () => {
    const m = readLongDiv(scene([1, 1], [2, 0]));

    expect(m.refusal).toContain('không chia hết');
    expect(longDivRenderer.elementBoxes!(scene([1, 1], [2, 0]), 'dividend')).toEqual([]);
  });
});

describe('hình nói đúng thứ thuật toán nói', () => {
  it('số chia đứng **ngoài** ngoặc, không đè lên số bị chia', () => {
    // Bản đầu đặt số chia vào cùng hệ cột với số bị chia, nên hai đa thức vẽ
    // chồng lên nhau — hình vẫn "có gì đó", chỉ là đọc ra một đa thức thứ ba.
    const box = layout(readLongDiv(PHOTO));
    const divisor = box.rows.find((r) => r.row.id === 'divisor')!;
    const dividend = box.rows.find((r) => r.row.id === 'dividend')!;

    expect(divisor.x).toBe(0);
    expect(divisor.x + divisor.width).toBeLessThan(dividend.x);
    expect(box.bracket!.x).toBeGreaterThan(divisor.x + divisor.width);
  });

  it('hạng tử cùng bậc thẳng cột ở mọi dòng', () => {
    // Đây là điều kiện để phép trừ đọc được bằng mắt.
    const box = layout(readLongDiv(PHOTO));
    const byDegree = new Map<number, Set<number>>();
    for (const row of box.rows) {
      if (row.row.id === 'divisor') continue;
      for (const term of row.terms) {
        if (!byDegree.has(term.term.degree)) byDegree.set(term.term.degree, new Set());
        byDegree.get(term.term.degree)!.add(term.x);
      }
    }

    for (const [degree, xs] of byDegree) {
      expect(xs.size, `bậc ${degree} nằm ở ${xs.size} hoành độ khác nhau`).toBe(1);
    }
  });

  it('vạch ngang là một danh tính neo được, nên pha mở được nó', () => {
    // Không neo được thì vạch nằm ngoài mọi pha: choreography mở bảng dần dần mà
    // các vạch đã kẻ sẵn từ khung $0$ — mấy đoạn gạch lơ lửng giữa chỗ trống, đúng
    // thứ nhìn thấy trong Player rồi mới sửa.
    const ids = [...longDivSchemaFragment.implicitElementIds(PHOTO)];
    expect(ids.filter((id) => id.startsWith('rule'))).toEqual(['rule1', 'rule2', 'rule3']);
  });

  it('dòng bị trừ toàn $0$ thì **không** kẻ vạch, và số hiệu vạch giữ theo nhịp', () => {
    // $x^4+1$ chia $x^2+1$: nhịp giữa cho hạng tử thương $0$, nên dòng bị trừ rỗng.
    // Vẫn kẻ thì được một gạch dài đúng một đơn vị, không thuộc về cái gì.
    const m = readLongDiv(scene([1, 0, 0, 0, 1], [1, 0, 1]));

    expect(m.beats.map((b) => b.sub.terms.length)).toEqual([2, 0, 2]);
    expect(layout(m).rules.map((r) => r.id)).toEqual(['rule1', 'rule3']);
  });

  it('dư bằng $0$ thì **viết số $0$**, và neo được vào nó', () => {
    // Bỏ trắng thì hình kết thúc bằng một vạch ngang không có gì bên dưới, và câu
    // "dư $0$" trong lời kể chẳng trỏ vào đâu cả.
    const exact = scene([1, 0, 0, -1], [1, -1]);
    const m = readLongDiv(exact);

    expect(m.remainder.terms).toEqual([]);
    const row = layout(m).rows.find((r) => r.row.id === 'remainder')!;
    expect(row.terms.map((t) => t.head)).toEqual(['0']);
    expect([...longDivSchemaFragment.implicitElementIds(exact)]).toContain('remainder-0');
    expect(renderer.toSvg(exact, ctx)).not.toBe(
      renderer.toSvg(exact, createContext(defaultTheme, { highlight: new Set(['remainder-0']) })),
    );
  });

  it('mọi id khai ra đều có mực, và mực **đổi** khi được nhấn (ANC-01)', () => {
    // Bản rút gọn của chốt canh toàn kho, chạy ngay tại engine để hỏng thì biết
    // sớm chứ không đợi tới lúc có bài dùng nó.
    const ids = [...longDivSchemaFragment.implicitElementIds(PHOTO)];
    expect(ids.length).toBeGreaterThan(10);

    const plain = renderer.toSvg(PHOTO, ctx);
    const dead = ids.filter(
      (id) => renderer.toSvg(PHOTO, createContext(defaultTheme, { highlight: new Set([id]) })) === plain,
    );

    expect(dead, `id không phản ứng khi nhấn: ${dead.join(', ')}`).toEqual([]);
  });

  it('tâm hộp khai ra rơi vào đúng hạng tử, và chạm vào đó chọn trúng nó', () => {
    const box = longDivRenderer.elementBoxes!(PHOTO, 'remainder-1')[0]!;
    const hits = longDivHitTest(PHOTO, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });

    expect(hits[0]).toBe('remainder-1');
  });

  it('tắt mũi tên thì không còn id mũi tên nào được khai', () => {
    const off = scene([1, 2, -1, 6, -2], [1, 0, -3], { show_arrows: false });
    const ids = [...longDivSchemaFragment.implicitElementIds(off)];

    expect(ids.some((id) => id.startsWith('arrow'))).toBe(false);
    expect(renderer.toSvg(off, ctx)).not.toContain('arrow');
  });
});

describe('bound', () => {
  it('scene khai element là lỗi — cả bảng phải suy từ config', () => {
    const dirty = { ...PHOTO, elements: [{ id: 'x', type: 'row' }] } as never as Scene;
    const codes = longDivSchemaFragment.checkBounds(dirty, '').map((i) => i.code);

    expect(codes).toContain('bounds/longdiv-no-elements');
  });

  it('bậc số chia lớn hơn bậc số bị chia thì **cảnh báo**, không chặn', () => {
    const issues = longDivSchemaFragment.checkBounds(scene([1, 1], [1, 0, -3]), '');

    expect(issues.map((i) => i.code)).toContain('longdiv/no-beats');
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
  });
});
