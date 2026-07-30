import { describe, expect, it } from 'vitest';
import { createContext, createRenderer, walk, type SvgNode } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Scene } from '@combviz/schema';
import { command, createEditorState, execute } from '@combviz/editor';
import {
  graphCommands,
  graphHitTest,
  graphRenderer,
  graphSchemaFragment,
} from '../src/index.js';
import { graphTools } from '../src/tools.js';
import { MATRIX_CELL, matrixCellId } from '../src/matrix.js';

const renderer = createRenderer([graphRenderer]);
const ctx = createContext(defaultTheme);

const EDGES: [string, string][] = [
  ['v1', 'v2'],
  ['v2', 'v3'],
  ['v3', 'v4'],
  ['v4', 'v1'],
  ['v1', 'v3'],
];

const scene = (config: Record<string, unknown>): Scene => ({
  engine: 'graph',
  config,
  elements: [
    ...['v1', 'v2', 'v3', 'v4'].map((id, i) => ({
      id,
      type: 'vertex',
      pos: [i * 10, 0],
      label: String(i + 1),
    })),
    ...EDGES.map(([u, v]) => ({ id: `e${u}${v}`, type: 'edge', u, v })),
  ],
});

const MATRIX = scene({ view: 'matrix', show_sums: true });

const nodes = (s: Scene): SvgNode[] => {
  const out: SvgNode[] = [];
  walk(renderer.render(s, ctx), (node) => out.push(node));
  return out;
};

describe('GR-07 — ma trận kề', () => {
  it('mỗi cạnh vẽ thành **hai** ô đối xứng', () => {
    const cells = nodes(MATRIX).filter((n) => n.attrs['data-el'] !== undefined);
    expect(cells).toHaveLength(EDGES.length * 2);
  });

  it('key duy nhất toàn cây, kể cả khi hai ô cùng một cạnh', () => {
    // Diff và nội suy gộp theo key trên **cả cây** (DAT-12), nên hai ô trùng key
    // sẽ nội suy từ nhau: ô dưới trượt ngang qua bảng mỗi lần chuyển step. Lỗi
    // này không hiện ra trong SVG tĩnh — chỉ hiện trong Player.
    const keys = nodes(MATRIX)
      .map((n) => n.key)
      .filter((k): k is string => k !== undefined);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('hai ô của một cạnh cùng chỉ về **một** element', () => {
    const byElement = new Map<string, number>();
    for (const node of nodes(MATRIX)) {
      const el = node.attrs['data-el'];
      if (typeof el === 'string') byElement.set(el, (byElement.get(el) ?? 0) + 1);
    }

    expect([...byElement.keys()].sort()).toEqual(EDGES.map(([u, v]) => `e${u}${v}`).sort());
    expect([...byElement.values()]).toEqual(EDGES.map(() => 2));
  });

  it('nhấn một cạnh làm sáng **cả hai** ô', () => {
    const highlighted = createContext(defaultTheme, { highlight: new Set(['ev1v3']) });
    const out: SvgNode[] = [];
    walk(renderer.render(MATRIX, highlighted), (n) => out.push(n));

    const lit = out.filter(
      (n) => n.attrs['data-el'] === 'ev1v3' && n.attrs['stroke-width'] !== undefined,
    );
    expect(lit).toHaveLength(2);
  });

  it('ô trống **có** id ô nhưng **không** có `data-el` (GR-07)', () => {
    const blanks = nodes(MATRIX).filter(
      (n) => n.tag === 'rect' && n.attrs['data-el'] === undefined,
    );

    // 4×4 = 16 ô, 10 ô có cạnh ⇒ 6 ô trống (kể cả 4 ô chéo).
    expect(blanks).toHaveLength(6);

    // M12 để ô trống vô danh, với lý do "nó không phải element nào cả". Đúng về
    // element, nhưng nó **là** một chỗ vẽ của một cặp đỉnh, và cặp ấy tồn tại dù
    // chưa có cạnh. Vô danh thì sandbox không bấm vào được (nên không thêm cạnh từ
    // bảng được) và narrative không neo vào được — mà "ô này trống" là đúng thứ
    // một lập luận đếm hai chiều cần chỉ ra. GR-07 đổi lại: id **ô**, và `data-el`
    // vẫn vắng vì không có cạnh nào để trỏ tới.
    expect(blanks.every((n) => typeof n.key === 'string' && n.key.startsWith('mx-'))).toBe(true);
  });

  it('tổng hàng là bậc đỉnh, tổng cả bảng là $2|E|$', () => {
    // Lọc theo **cột bậc**, không lọc theo nội dung: nhãn đỉnh "3" xuất hiện ở cả
    // hàng lẫn cột, nên đếm chuỗi "3" trong toàn hình sẽ đếm nhầm chúng.
    const degreeColumn = 4 * 10 + 10 * 0.4;
    const texts = nodes(MATRIX).filter((n) => n.tag === 'text');

    expect(texts.map((n) => n.text)).toContain('Σ 10');
    expect(
      texts
        .filter((n) => n.attrs['x'] === degreeColumn && !String(n.text).startsWith('Σ'))
        .map((n) => n.text),
    ).toEqual(['3', '2', '3', '2']);
  });

  it('view mặc định vẫn là đỉnh–cạnh', () => {
    const plain = nodes(scene({}));
    expect(plain.some((n) => n.attrs['data-el'] !== undefined)).toBe(false);
  });
});

/**
 * GR-07 — đồng bộ **hai chiều** với canvas.
 *
 * Chiều cạnh → ma trận đã có từ M12 (ô mang `data-el` của cạnh). Chiều còn lại là
 * chỗ hạng mục này lấp, và nó bắt đầu bằng một lỗi **im lặng**: trước đây chạm
 * trong view ma trận vẫn đo khoảng cách tới toạ độ đỉnh của view kia.
 */
describe('GR-07 — chạm và sửa từ phía ma trận', () => {
  const withView = (s: Scene): Scene => ({ ...s, config: { view: 'matrix' } });

  const run = (s: Scene, type: string, params: unknown): Scene | null => {
    const result = execute(createEditorState(s), graphCommands, command(type, params));
    return result.applied ? result.state.scene : null;
  };

  const triangle = (): Scene =>
    withView({
      engine: 'graph',
      config: {},
      elements: [
        { id: 'a', type: 'vertex', pos: [0, 0] },
        { id: 'b', type: 'vertex', pos: [10, 0] },
        { id: 'c', type: 'vertex', pos: [5, 9] },
        { id: 'e1', type: 'edge', u: 'a', v: 'b' },
      ],
    });

  it('chạm vào ô trả về **ô**, và cả cạnh nếu ô ấy có cạnh', () => {
    const s = triangle();
    // Ô (0,1) = (a,b): có cạnh e1.
    const onEdge = graphHitTest(s, { x: MATRIX_CELL * 1.5, y: MATRIX_CELL * 0.5 });
    expect(onEdge).toEqual(['e1', matrixCellId('a', 'b')]);

    // Ô (0,2) = (a,c): trống, nhưng vẫn là một ô có danh tính.
    expect(graphHitTest(s, { x: MATRIX_CELL * 2.5, y: MATRIX_CELL * 0.5 })).toEqual([
      matrixCellId('a', 'c'),
    ]);

    // Ngoài bảng thì không trả gì — trước GR-07, chỗ này rơi về hình học của view
    // node-link và trả về một đỉnh nào đó.
    expect(graphHitTest(s, { x: -50, y: -50 })).toEqual([]);
  });

  it('bật một ô trống thì **thêm cạnh**; bật lại thì bỏ', () => {
    const added = run(triangle(), 'graph/toggle-adjacency', {
      cell: matrixCellId('a', 'c'),
      id: 'e9',
    })!;
    expect(added.elements.filter((e) => e.type === 'edge')).toHaveLength(2);

    const removed = run(added, 'graph/toggle-adjacency', {
      cell: matrixCellId('a', 'c'),
      id: 'e10',
    })!;
    expect(removed.elements.filter((e) => e.type === 'edge')).toHaveLength(1);
  });

  it('ô đối xứng là **cùng một** cạnh — bảng đối xứng vì cạnh không có chiều', () => {
    // Bấm ô (c,a) khi cạnh a–c đã có ⇒ bỏ đúng cạnh ấy, không thêm cạnh thứ hai.
    const added = run(triangle(), 'graph/toggle-adjacency', {
      cell: matrixCellId('a', 'c'),
      id: 'e9',
    })!;
    const removed = run(added, 'graph/toggle-adjacency', {
      cell: matrixCellId('c', 'a'),
      id: 'e10',
    })!;
    expect(removed.elements.filter((e) => e.type === 'edge')).toHaveLength(1);
  });

  it('ô trên đường chéo bị từ chối — khuyên là quyết định về mô hình', () => {
    expect(
      run(triangle(), 'graph/toggle-adjacency', { cell: matrixCellId('a', 'a'), id: 'e9' }),
    ).toBeNull();
  });

  it('id đỉnh chứa dấu gạch vẫn tách đúng', () => {
    // Tách `mx-<u>-<v>` bằng cách cắt dấu gạch sẽ sai lặng lẽ ở đúng những bài đặt
    // tên đỉnh dài — và "sai lặng lẽ" nghĩa là cú bấm không làm gì mà không ai hiểu.
    const s = withView({
      engine: 'graph',
      config: {},
      elements: [
        { id: 'v-1', type: 'vertex', pos: [0, 0] },
        { id: 'v-2', type: 'vertex', pos: [10, 0] },
      ],
    });
    const added = run(s, 'graph/toggle-adjacency', {
      cell: matrixCellId('v-1', 'v-2'),
      id: 'e1',
    });
    expect(added?.elements.filter((e) => e.type === 'edge')).toHaveLength(1);
  });

  it('thanh công cụ ở view ma trận **khác hẳn** view node-link', () => {
    const ids = (s: Scene): string[] => graphTools(s).map((t) => t.id);
    expect(ids(triangle())).toContain('toggle-cell');
    // Nối cạnh bằng cách bấm hai đỉnh và sắp lại hình đều vô nghĩa khi không có
    // đỉnh nào vẽ ra.
    expect(ids(triangle())).not.toContain('add-edge');
    expect(ids(triangle())).not.toContain('layout-circle');

    const nodeLink: Scene = { ...triangle(), config: {} };
    expect(ids(nodeLink)).toContain('add-edge');
    expect(ids(nodeLink)).not.toContain('toggle-cell');
  });

  it('ô ma trận neo được (ANC-01), kể cả ô trống', () => {
    const ids = graphSchemaFragment.implicitElementIds(triangle());
    expect(ids.has(matrixCellId('a', 'c'))).toBe(true);
    expect(ids.has(matrixCellId('a', 'a'))).toBe(true);
    // View node-link thì không sinh id ô nào.
    expect(
      graphSchemaFragment.implicitElementIds({ ...triangle(), config: {} }).size,
    ).toBe(0);
  });
});
