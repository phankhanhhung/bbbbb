import { describe, expect, it } from 'vitest';
import type { Problem, Scene, SceneElement, Step } from '@combviz/schema';
import { checkDerivation } from '../src/derivation.js';

const term = (id: string, tex: string, extra: Record<string, unknown> = {}): SceneElement =>
  ({ id, type: 'term', row: 'r1', tex, ...extra }) as SceneElement;

const scene = (terms: SceneElement[]): Scene => ({
  engine: 'derivation',
  config: { align: 'left' },
  elements: [{ id: 'r1', type: 'row' } as SceneElement, ...terms],
});

const step = (id: string, parent: string | null, s: Scene | undefined): Step =>
  ({
    id,
    parent,
    edge_type: 'seq',
    narrative: { vi: 'x' },
    ...(s ? { scene: s } : {}),
    verified: true,
  }) as Step;

const problem = (steps: Step[]): Problem =>
  ({ id: 'p', solutions: [{ id: 'sol', label: { vi: 'l' }, steps }] }) as Problem;

const codes = (p: Problem): string[] => checkDerivation(p).map((i) => i.code);

describe('derivation/silent-drop', () => {
  it('hạng tử biến mất mà không khai triệt tiêu ⇒ **lỗi**', () => {
    const issues = checkDerivation(
      problem([
        step('s0', null, scene([term('a', 'x'), term('b', 'y')])),
        step('s1', 's0', scene([term('a', 'x')])),
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('derivation/silent-drop');
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.message).toContain('"b"');
  });

  it('khai `cancelled` rồi thì được phép biến mất', () => {
    expect(
      codes(
        problem([
          step('s0', null, scene([term('a', 'x'), term('b', 'y', { cancelled: true })])),
          step('s1', 's0', scene([term('a', 'x')])),
        ]),
      ),
    ).toEqual([]);
  });

  it('dấu phép toán được miễn — nó đi theo hạng tử mà nó nối', () => {
    expect(
      codes(
        problem([
          step(
            's0',
            null,
            scene([
              term('a', 'x'),
              term('op', '+', { role: 'op' }),
              term('b', 'y', { cancelled: true }),
            ]),
          ),
          step('s1', 's0', scene([term('a', 'x')])),
        ]),
      ),
    ).toEqual([]);
  });

  it('đổi hẳn cách trình bày (không id nào đi tiếp) thì **không** so', () => {
    expect(
      codes(
        problem([
          step('s0', null, scene([term('a', 'x'), term('b', 'y')])),
          step('s1', 's0', scene([term('c', 'z')])),
        ]),
      ),
    ).toEqual([]);
  });

  it('so theo `parent`, không theo thứ tự mảng — cây có nhánh', () => {
    // s2 là **anh em** của s1, không phải bước sau nó. So theo thứ tự mảng sẽ
    // đối chiếu hai nhánh khác nhau với nhau và báo lỗi giả.
    const issues = checkDerivation(
      problem([
        step('s0', null, scene([term('a', 'x'), term('b', 'y')])),
        step('s1', 's0', scene([term('a', 'x'), term('b', 'y')])),
        step('s2', 's0', scene([term('a', 'x'), term('b', 'y')])),
      ]),
    );
    expect(issues).toEqual([]);
  });

  it('dấu quan hệ cũng được miễn, cùng lý do với dấu phép toán', () => {
    expect(
      codes(
        problem([
          step(
            's0',
            null,
            scene([term('a', 'x'), term('eq', '=', { role: 'relation' }), term('b', 'y')]),
          ),
          step('s1', 's0', scene([term('a', 'x'), term('b', 'y')])),
        ]),
      ),
    ).toEqual([]);
  });

  it('khai `becomes` trỏ đúng chỗ thì được phép biến mất', () => {
    expect(
      codes(
        problem([
          step('s0', null, scene([term('a', 'x'), term('b', 'y', { becomes: 'c' })])),
          step('s1', 's0', scene([term('a', 'x'), term('c', 'z')])),
        ]),
      ),
    ).toEqual([]);
  });

  it('khai `becomes` trỏ vào hư không thì **vẫn đỏ** — lời khai phải kiểm được', () => {
    const issues = checkDerivation(
      problem([
        step('s0', null, scene([term('a', 'x'), term('b', 'y', { becomes: 'khong-co' })])),
        step('s1', 's0', scene([term('a', 'x')])),
      ]),
    );
    expect(issues.map((i) => i.code)).toEqual(['derivation/becomes-missing']);
    expect(issues[0]!.severity).toBe('error');
  });

  it('bước sau đổi engine thì bỏ qua', () => {
    expect(
      codes(
        problem([
          step('s0', null, scene([term('a', 'x'), term('b', 'y')])),
          step('s1', 's0', { engine: 'board', config: { rows: 2, cols: 2 }, elements: [] }),
        ]),
      ),
    ).toEqual([]);
  });

  it('bước không có scene thì bỏ qua', () => {
    expect(
      codes(
        problem([
          step('s0', null, scene([term('a', 'x')])),
          step('s1', 's0', undefined),
        ]),
      ),
    ).toEqual([]);
  });
});
