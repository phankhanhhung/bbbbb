import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { command, createEditorState, execute } from '@combviz/editor';
import { tryEvaluate, DETERMINISTIC_BUDGET } from '@combviz/dsl';
import {
  EMPTY_ATLAS,
  createContext,
  createRenderer,
  labelWidth,
  lookupLabel,
  walk,
  type LabelAtlas,
} from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene, SceneElement } from '@combviz/schema';
import {
  derivationCommands,
  derivationEnvironment,
  derivationHitTest,
  derivationRenderer,
  derivationSchemaFragment,
  layout,
  readDerivation,
  resolveDerivationValidator,
} from '../src/index.js';

/** Atlas thật của kho — cùng bảng mà Player và CLI dùng. */
const ATLAS = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../content/labels.json', import.meta.url)),
    'utf8',
  ),
) as LabelAtlas;

const term = (
  id: string,
  row: string,
  tex: string,
  extra: Record<string, unknown> = {},
): SceneElement => ({ id, type: 'term', row, tex, ...extra }) as SceneElement;

const scene = (elements: SceneElement[], config: Record<string, unknown> = {}): Scene => ({
  engine: 'derivation',
  config: { align: 'relation', ...config },
  elements,
});

const SIMPLE = scene([
  { id: 'r1', type: 'row' } as SceneElement,
  term('a', 'r1', '\\frac{1}{k}'),
  term('eq', 'r1', '=', { role: 'relation' }),
  term('b', 'r1', '\\frac{1}{k+1}'),
]);

const evalOn = (s: Scene, expr: string): unknown =>
  tryEvaluate(expr, derivationEnvironment(s), DETERMINISTIC_BUDGET).value;

describe('đọc scene', () => {
  it('hạng tử gom về đúng dòng, theo thứ tự khai', () => {
    const model = readDerivation(SIMPLE);
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]!.terms.map((t) => t.id)).toEqual(['a', 'eq', 'b']);
  });

  it('hạng tử trỏ vào dòng không có thì thành mồ côi, **không** biến mất im lặng', () => {
    const model = readDerivation(scene([term('x', 'khong-co', '1')]));
    expect(model.orphans.map((t) => t.id)).toEqual(['x']);
    expect(
      derivationSchemaFragment.checkBounds(scene([term('x', 'khong-co', '1')]), '').map((i) => i.code),
    ).toContain('bounds/unknown-row-ref');
  });
});

describe('xếp chỗ', () => {
  it('gióng theo dấu quan hệ: hai dòng có dấu $=$ **cùng một hoành độ**', () => {
    const two = scene([
      { id: 'r1', type: 'row' } as SceneElement,
      term('a1', 'r1', '\\sum_{k=1}^{n}\\frac{1}{k(k+1)}'),
      term('e1', 'r1', '=', { role: 'relation' }),
      term('b1', 'r1', '1'),
      { id: 'r2', type: 'row' } as SceneElement,
      term('a2', 'r2', '1'),
      term('e2', 'r2', '=', { role: 'relation' }),
      term('b2', 'r2', '1'),
    ]);

    const box = layout(readDerivation(two), ATLAS);
    const relX = box.rows.map(
      (row) => row.shift + row.terms.find((t) => t.term.role === 'relation')!.x,
    );
    expect(relX[0]).toBeCloseTo(relX[1] as number, 6);
    // Dòng ngắn phải bị **đẩy sang phải**, không phải dòng dài bị kéo lại.
    expect(box.rows[1]!.shift).toBeGreaterThan(0);
    expect(box.rows[0]!.shift).toBe(0);
  });

  it('`align: left` thì không dịch dòng nào', () => {
    const box = layout(readDerivation(scene(SIMPLE.elements as SceneElement[], { align: 'left' })), ATLAS);
    expect(box.rows.every((r) => r.shift === 0)).toBe(true);
  });

  it('chiều cao dòng **đo theo nhãn**, không phải hằng số', () => {
    // Lỗi thật đã gặp: để chiều cao cố định thì một $\sum$ dạng trưng bày cao
    // gấp đôi, và dòng dưới đè lên cận dưới của dòng trên.
    const tall = scene([
      { id: 'r1', type: 'row' } as SceneElement,
      term('a', 'r1', '\\sum_{k=1}^{n}\\frac{1}{k(k+1)}'),
      { id: 'r2', type: 'row' } as SceneElement,
      term('b', 'r2', '1'),
    ]);
    const box = layout(readDerivation(tall), ATLAS);
    const [first, second] = box.rows;
    // Đáy dòng trên phải nằm **trên** đỉnh dòng dưới.
    expect(first!.y + first!.descent).toBeLessThan(second!.y - second!.ascent);
    expect(first!.ascent).toBeGreaterThan(second!.ascent);
  });

  it('không có atlas thì ước **rộng hơn** thực tế, không hẹp hơn', () => {
    // Sai theo hướng an toàn: khung thừa lề còn hơn khung cắt mất công thức.
    const wide = layout(readDerivation(SIMPLE), EMPTY_ATLAS);
    const real = layout(readDerivation(SIMPLE), ATLAS);
    expect(wide.width).toBeGreaterThan(real.width);
  });
});

describe('nhãn', () => {
  it('atlas của kho có đủ công thức của bài telescoping', () => {
    for (const tex of ['\\frac{1}{k}', '\\frac{1}{k+1}', '\\sum_{k=1}^{n}\\frac{1}{k(k+1)}']) {
      expect(lookupLabel(ATLAS, tex)).not.toBeNull();
    }
  });

  it('bề ngang tỉ lệ **tuyến tính** với cỡ chữ', () => {
    const entry = lookupLabel(ATLAS, '\\frac{1}{k}')!;
    expect(labelWidth(entry, 10)).toBeCloseTo(labelWidth(entry, 5) * 2, 6);
  });

  it('nhãn thiếu atlas vẽ **ra mặt**, không im lặng biến mất', () => {
    const renderer = createRenderer([derivationRenderer]);
    const svg = renderer.toSvg(
      scene([{ id: 'r1', type: 'row' } as SceneElement, term('a', 'r1', '\\zeta(3)')]),
      createContext(defaultTheme, { labels: ATLAS }),
    );
    expect(svg).toContain('thiếu atlas');
    expect(svg).toContain(defaultTheme.stroke.invalid);
  });
});

describe('DSL', () => {
  it('binding cơ bản', () => {
    expect(evalOn(SIMPLE, 'n_rows')).toBe(1);
    expect(evalOn(SIMPLE, 'n_terms')).toBe(3);
    expect(evalOn(SIMPLE, 'cancelled')).toBe(0);
  });

  it('`cancelled` đếm đúng hạng tử đã gạch', () => {
    const s = scene([
      { id: 'r1', type: 'row' } as SceneElement,
      term('a', 'r1', '1', { cancelled: true }),
      term('b', 'r1', '1'),
    ]);
    expect(evalOn(s, 'cancelled')).toBe(1);
  });
});

describe('validator', () => {
  const check = (id: string, s: Scene) => resolveDerivationValidator(id)!.check(s);

  it('no-empty-row chỉ ra đúng dòng rỗng', () => {
    const s = scene([
      { id: 'r1', type: 'row' } as SceneElement,
      term('a', 'r1', '1'),
      { id: 'r2', type: 'row' } as SceneElement,
    ]);
    expect(check('no-empty-row', s).violations).toEqual(['r2']);
  });

  it('every-row-has-relation', () => {
    expect(check('every-row-has-relation', SIMPLE).ok).toBe(true);
    const noRel = scene([{ id: 'r1', type: 'row' } as SceneElement, term('a', 'r1', '1')]);
    expect(check('every-row-has-relation', noRel).ok).toBe(false);
  });

  it('cancelled:<k> có tham số', () => {
    expect(check('cancelled:0', SIMPLE).ok).toBe(true);
    expect(check('cancelled:2', SIMPLE).ok).toBe(false);
  });

  it('id lạ trả null thay vì im lặng cho qua', () => {
    expect(resolveDerivationValidator('khong-co')).toBeNull();
  });
});

describe('lệnh', () => {
  it('bật/tắt gạch triệt tiêu', () => {
    const result = execute(
      createEditorState(SIMPLE),
      derivationCommands,
      command('derivation/toggle-cancel', { term: 'a' }),
    );
    expect(result.applied).toBe(true);
    expect(readDerivation(result.state.scene).rows[0]!.terms[0]!.cancelled).toBe(true);
  });

  it('từ chối hạng tử không tồn tại', () => {
    const result = execute(
      createEditorState(SIMPLE),
      derivationCommands,
      command('derivation/toggle-cancel', { term: 'khong-co' }),
    );
    expect(result.applied).toBe(false);
  });

  it('chạm trúng hạng tử theo toạ độ', () => {
    const box = layout(readDerivation(SIMPLE), EMPTY_ATLAS);
    const row = box.rows[0]!;
    const item = row.terms[2]!;
    expect(derivationHitTest(SIMPLE, { x: item.x + item.width / 2, y: row.y })).toEqual(['b']);
    expect(derivationHitTest(SIMPLE, { x: -50, y: row.y })).toEqual([]);
  });
});

describe('renderer', () => {
  const renderer = createRenderer([derivationRenderer]);
  const ctx = createContext(defaultTheme, { labels: ATLAS });

  it('mỗi hạng tử là một node có key — điều kiện để nó **chuyển động** giữa hai bước', () => {
    const keys: string[] = [];
    walk(renderer.render(SIMPLE, ctx), (node) => {
      if (node.key !== undefined) keys.push(node.key);
    });
    // Dòng cũng có key kể từ khi nó neo được: `row` là một trong hai loại element
    // của engine này, và trước đó nó không sinh ra node nào mang danh tính —
    // `[[a1|dòng thứ hai]]` validate xanh mà không làm sáng gì.
    expect(keys).toEqual(['a', 'eq', 'b', 'r1']);
  });

  it('dòng có tay cầm vô hình để neo được', () => {
    const handles: string[] = [];
    walk(renderer.render(SIMPLE, ctx), (node) => {
      if (node.attrs['fill'] === 'none' && node.key !== undefined) handles.push(node.key);
    });
    expect(handles).toContain('r1');
  });

  it('hạng tử triệt tiêu có gạch chéo, hạng tử thường thì không', () => {
    const plain = renderer.toSvg(SIMPLE, ctx);
    const struck = renderer.toSvg(
      scene([
        { id: 'r1', type: 'row' } as SceneElement,
        term('a', 'r1', '\\frac{1}{k}', { cancelled: true }),
      ]),
      ctx,
    );
    expect(plain).not.toContain('<line');
    expect(struck).toContain('<line');
  });

  it('hình thuần: cùng scene cho cùng chuỗi', () => {
    expect(renderer.toSvg(SIMPLE, ctx)).toBe(renderer.toSvg(SIMPLE, ctx));
  });

  it('khung nhìn tính **cùng ngữ cảnh** với lúc vẽ', () => {
    // Lỗi thật đã gặp: CLI gọi `viewportOf(scene)` không truyền ctx nên khung
    // tính bằng bảng rỗng còn hình vẽ bằng bảng thật. Tỉ lệ lệch ⇒ trình duyệt
    // letterbox ⇒ công thức dạt sang một bên giữa hai mảng trắng.
    const withAtlas = renderer.viewportOf(SIMPLE, ctx);
    const without = renderer.viewportOf(SIMPLE);
    expect(withAtlas.width).not.toBeCloseTo(without.width, 3);
  });
});
