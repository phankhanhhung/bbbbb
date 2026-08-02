import { describe, expect, it } from 'vitest';
import type { Bijection, Scene } from '@combviz/schema';
import type { SvgNode } from '@combviz/render';
import { applyChoreography, createContext } from '@combviz/render';
import { graphRenderer } from '@combviz/engine-graph';
import { defaultTheme } from '@combviz/theme';
import { rollcallChoreography } from '../src/bijection-rollcall.js';

const bijection = (pairs: [string, string][]): Bijection =>
  ({ scene: { engine: 'sequence', config: {}, elements: [] }, pairs }) as Bijection;

const drawn = (prefix: string) => (id: string) => id.startsWith(prefix);
const opts = { anchor: 'a1', callMs: 100, fillMs: 100, retireMs: 100 };

describe('PRN-04 — điểm danh từng cặp', () => {
  it('mỗi cặp ba nhịp, nối đuôi nhau, không chồng lấn', () => {
    const out = rollcallChoreography(
      bijection([
        ['x1', 'b1'],
        ['x2', 'b2'],
      ]),
      drawn('x'),
      drawn('b'),
      opts,
    )!;

    expect(out.spec.phases.map((p) => `${p.kind}@${p.at}`)).toEqual([
      'focus@0',
      'show@100',
      'hide@200',
      'focus@300',
      'show@400',
      'hide@500',
    ]);
  });

  it('nhịp `hide` của cặp trước xong **trước** khi cặp sau được gọi', () => {
    // Chồng lấn là thứ đã làm hỏng phép biến hình ở chế độ bấm từng pha: `goPhase`
    // nhảy tới `at + duration`, nên pha chồng nhau dừng ở chỗ nhịp kế tiếp mới
    // chạy được nửa đường. Ở đây bốn nhịp là một câu có thứ tự, nên nối đuôi
    // không phải tuỳ chọn.
    const out = rollcallChoreography(
      bijection([
        ['x1', 'b1'],
        ['x2', 'b2'],
      ]),
      drawn('x'),
      drawn('b'),
      opts,
    )!;
    const sorted = [...out.spec.phases].sort((a, b) => a.at - b.at);

    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]!;
      expect(sorted[i]!.at).toBeGreaterThanOrEqual(prev.at + prev.duration);
    }
  });

  it('spec chiếu xuống hai pane — không pha nào của bên này lọt sang bên kia', () => {
    // Đây là bất biến quan trọng nhất của module. Áp pha bên trái lên cây bên
    // phải thì một `hide` nhắm vào `ev1v2` sẽ giấu luôn ô ma trận mang
    // `data-el = ev1v2` — cùng họ với lỗi đã làm ma trận kề vỡ vụn.
    const out = rollcallChoreography(bijection([['x1', 'b1']]), drawn('x'), drawn('b'), opts)!;

    expect(out.left.phases.map((p) => p.kind)).toEqual(['focus', 'hide']);
    expect(out.left.phases.flatMap((p) => p.targets)).toEqual(['x1', 'x1']);
    expect(out.right.phases.map((p) => p.kind)).toEqual(['show']);
    expect(out.right.phases.flatMap((p) => p.targets)).toEqual(['b1']);
  });

  it('mọi nhịp có nhãn riêng — điều kiện để bộ đếm pha đọc được (CHO-09)', () => {
    const out = rollcallChoreography(
      bijection([
        ['x1', 'b1'],
        ['x2', 'b2'],
      ]),
      drawn('x'),
      drawn('b'),
      opts,
    )!;
    const labels = out.spec.phases.map((p) => p.label?.vi);

    expect(new Set(labels).size).toBe(labels.length);
  });

  it('id nhịp có đệm số — không thì `call-10` đứng trước `call-2`', () => {
    const pairs = Array.from({ length: 11 }, (_, i): [string, string] => [`x${i}`, `b${i}`]);
    const out = rollcallChoreography(bijection(pairs), drawn('x'), drawn('b'), opts)!;
    const calls = out.left.phases.filter((p) => p.kind === 'focus').map((p) => p.id);

    expect([...calls].sort((a, b) => a.localeCompare(b))).toEqual(calls);
  });

  it('$k$ cặp cùng vế phải gộp làm **một** nhịp nhiều target', () => {
    const out = rollcallChoreography(
      bijection([
        ['x1', 'b1'],
        ['x2', 'b1'],
      ]),
      drawn('x'),
      drawn('b'),
      opts,
    )!;

    expect(out.spec.phases).toHaveLength(3);
    expect(out.spec.phases[0]!.targets).toEqual(['x1', 'x2']);
  });

  it('vẽ không được thì bỏ cặp, và bỏ quá một phần ba thì **từ chối cả lượt**', () => {
    // Một trên hai là **quá** một phần ba ⇒ từ chối. Một trên bốn thì không.
    const two: [string, string][] = [
      ['x1', 'b1'],
      ['x2', 'nope'],
    ];
    expect(rollcallChoreography(bijection(two), drawn('x'), drawn('b'), opts)).toBeNull();

    const four: [string, string][] = [
      ['x1', 'b1'],
      ['x2', 'nope'],
      ['x3', 'b3'],
      ['x4', 'b4'],
    ];
    const out = rollcallChoreography(bijection(four), drawn('x'), drawn('b'), opts)!;
    expect(out.skipped).toEqual([['x2', 'nope']]);
    expect(out.spec.phases).toHaveLength(9);
  });

  it('hai hình **trùng chỗ** vẫn được điểm danh — khác hẳn phép biến hình', () => {
    // Biến hình từ chối khi không cặp nào dịch chỗ, và đúng: không có gì để bay.
    // Ở đây câu hỏi khác — "cái này ứng với cái kia" vẫn đáng chỉ tay vào kể cả
    // khi hai hình nằm đúng một chỗ. Bài "tập con ↔ phần bù" là như thế.
    const same = (id: string): boolean => id.startsWith('x');

    expect(rollcallChoreography(bijection([['x1', 'x1']]), same, same, opts)).not.toBeNull();
  });
});

/**
 * Chốt canh cho **mối nối** — cây node thật từ engine, chạy đúng lối Player chạy.
 *
 * Các case trên gọi hàm thuần với vị từ giả và không cây nào. Lần trước đúng
 * khoảng trống ấy đã cho một lỗi đi lọt tới tận màn hình, nên nhóm này tồn tại.
 */
describe('PRN-04 — điểm danh trên cây thật', () => {
  const vertices = [
    { id: 'v1', type: 'vertex', label: '1', pos: [0, -12] },
    { id: 'v2', type: 'vertex', label: '2', pos: [12, 0] },
    { id: 'v3', type: 'vertex', label: '3', pos: [0, 12] },
  ];
  const edges = [
    { id: 'ev1v2', type: 'edge', u: 'v1', v: 'v2' },
    { id: 'ev2v3', type: 'edge', u: 'v2', v: 'v3' },
  ];
  const graphScene = {
    engine: 'graph',
    config: { show_labels: true },
    elements: [...vertices, ...edges],
  } as unknown as Scene;
  const matrixScene = {
    engine: 'graph',
    config: { show_labels: true, show_sums: true, view: 'matrix' },
    elements: [...vertices, ...edges],
  } as unknown as Scene;

  const bij = {
    scene: matrixScene,
    pairs: [
      ['ev1v2', 'ev1v2'],
      ['ev2v3', 'ev2v3'],
    ],
  } as unknown as Bijection;
  const ctx = createContext(defaultTheme, {});
  const drawnIn = (scene: Scene) => (id: string) =>
    graphRenderer.elementBoxes(scene, id, ctx).length > 0;

  const generated = rollcallChoreography(bij, drawnIn(graphScene), drawnIn(matrixScene), {
    anchor: 'a1',
  })!;

  const collect = (nodes: readonly SvgNode[]): SvgNode[] => {
    const out: SvgNode[] = [];
    const walk = (n: SvgNode): void => {
      out.push(n);
      for (const child of n.children ?? []) walk(child);
    };
    nodes.forEach(walk);
    return out;
  };

  const opacityOf = (nodes: readonly SvgNode[], key: string): number =>
    Number(collect(nodes).find((n) => n.key === key)?.attrs['opacity'] ?? 1);

  const last = generated.spec.phases[generated.spec.phases.length - 1]!;
  const endMs = last.at + last.duration;

  const rightAt = (ms: number): SvgNode[] =>
    applyChoreography(graphRenderer.render(matrixScene, ctx), generated.right, ms);
  const leftAt = (ms: number): SvgNode[] =>
    applyChoreography(graphRenderer.render(graphScene, ctx), generated.left, ms);

  it('ô ma trận ẩn từ khung đầu, và **cả hai** ô đối xứng cùng hiện', () => {
    // Cả bài bổ đề bắt tay nằm ở chữ "cả hai": phép dời buộc phải chọn một ô, còn
    // phép sáng lên chạm được mọi chỗ vẽ của cùng một element. Đó là thừa số $2$.
    expect(opacityOf(rightAt(0), 'mx-v1-v2')).toBe(0);
    expect(opacityOf(rightAt(0), 'mx-v2-v1')).toBe(0);

    expect(opacityOf(rightAt(endMs), 'mx-v1-v2')).toBe(1);
    expect(opacityOf(rightAt(endMs), 'mx-v2-v1')).toBe(1);
  });

  it('ô đã hiện thì **ở lại** — kể cả khi cặp sau đang được gọi', () => {
    const firstFill = generated.right.phases[0]!;
    const afterFirst = firstFill.at + firstFill.duration;

    expect(opacityOf(rightAt(afterFirst), 'mx-v1-v2')).toBe(1);
    expect(opacityOf(rightAt(endMs), 'mx-v1-v2')).toBe(1);
  });

  it('nền lưới **không** tắt theo ô — tắt một ô không để lại lỗ thủng', () => {
    // Nền không đeo `data-el`, nên không pha nào chạm tới nó. Mất bất biến này
    // thì ô chưa tới lượt là một lỗ trắng không viền.
    expect(opacityOf(rightAt(0), 'mx-v1-v2__bg')).toBe(1);
    expect(opacityOf(rightAt(endMs), 'mx-v1-v2__bg')).toBe(1);
  });

  it('cạnh bên trái sáng lên rồi rút đi, và ô $0$ bên phải không hề bị chạm', () => {
    const call = generated.left.phases[0]!;
    const lit = collect(leftAt(call.at + call.duration)).find((n) => n.key === 'ev1v2');
    expect(lit?.attrs['data-phase']).toBe(1);

    expect(opacityOf(leftAt(endMs), 'ev1v2')).toBe(0);
    // `mx-v2-v2` là ô đường chéo — không thuộc cặp nào, phải đứng nguyên.
    expect(opacityOf(rightAt(endMs), 'mx-v2-v2')).toBe(1);
  });

  it('đỉnh không nằm trong cặp nào thì không pha nào chạm — cả hai pane', () => {
    for (const ms of [0, Math.round(endMs / 2), endMs]) {
      expect(opacityOf(leftAt(ms), 'v1'), `t = ${ms}`).toBe(1);
    }
  });
});
