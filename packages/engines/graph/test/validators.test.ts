import { describe, expect, it } from 'vitest';
import type { Scene, SceneElement } from '@combviz/schema';
import { layoutPositions } from '../src/layout.js';
import { resolveGraphValidator, GRAPH_VALIDATOR_IDS } from '../src/index.js';

/**
 * Validator là thứ người học **đâm vào** trong sandbox, nên sai ở đây không hiện
 * ra dưới dạng lỗi mà dưới dạng một bài học sai: một cấu hình hợp lệ bị báo đỏ,
 * hoặc tệ hơn, một cấu hình vi phạm được cho qua.
 */
function graphOf(
  edgeSpecs: readonly string[],
  extraVertices: readonly string[] = [],
): Scene {
  const names = new Set<string>(extraVertices);
  const edges: SceneElement[] = edgeSpecs.map((spec, i) => {
    const [u, v, color] = spec.split(/[-:]/) as [string, string, string?];
    names.add(u);
    names.add(v);
    return {
      id: `e${i}`,
      type: 'edge',
      u,
      v,
      ...(color ? { color_class: Number(color) } : {}),
    };
  });

  const ids = [...names].sort();
  const positions = layoutPositions(ids, 'circle');

  return {
    engine: 'graph',
    config: {},
    elements: [
      ...(ids.map((id) => ({
        id,
        type: 'vertex',
        pos: positions.get(id) ?? [0, 0],
      })) as SceneElement[]),
      ...edges,
    ],
  };
}

const run = (id: string, specs: readonly string[], extra: readonly string[] = []) =>
  resolveGraphValidator(id)!.check(graphOf(specs, extra));

describe('triangle-free (G-12)', () => {
  it('cho qua đồ thị hai phía $K_{2,3}$ — $6$ cạnh, không tam giác', () => {
    const k23 = ['v-a', 'v-b', 'v-c', 'w-a', 'w-b', 'w-c'];
    expect(run('triangle-free', k23).ok).toBe(true);
  });

  it('bắt tam giác và chỉ ra đúng ba cạnh', () => {
    const result = run('triangle-free', ['a-b', 'b-c', 'a-c', 'c-d']);

    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(3);
    expect(result.violations).not.toContain('e3');
  });

  it('cho qua chu trình $5$ đỉnh — đây là chỗ `bipartite` cấm nhầm', () => {
    // C5 không có tam giác nhưng cũng **không** hai phía (chu trình lẻ). Trước
    // khi có validator này, cụm bài cực trị chỉ kiểm gián tiếp được bằng
    // `bipartite`, và nó sẽ báo đỏ đúng cấu hình hợp lệ này.
    const c5 = ['a-b', 'b-c', 'c-d', 'd-e', 'e-a'];

    expect(run('triangle-free', c5).ok).toBe(true);
    expect(run('bipartite', c5).ok).toBe(false);
  });

  it('không nhầm khuyên hay cạnh song song thành tam giác', () => {
    expect(run('triangle-free', ['a-a', 'a-b', 'a-b', 'b-c']).ok).toBe(true);
  });

  it('khác `no-mono-triangle`: cạnh chưa tô vẫn là cạnh', () => {
    // Tam giác toàn cạnh chưa tô màu: "chưa xét" ≠ "cùng màu" nên
    // `no-mono-triangle` cho qua — đúng với nó. `triangle-free` thì không.
    const triangle = ['a-b', 'b-c', 'a-c'];

    expect(run('no-mono-triangle', triangle).ok).toBe(true);
    expect(run('triangle-free', triangle).ok).toBe(false);
  });

  it('có mặt trong danh sách validator công bố', () => {
    expect(GRAPH_VALIDATOR_IDS).toContain('triangle-free');
  });
});

describe('validator `tree` (GR-09)', () => {
  const check = (s: Scene) => resolveGraphValidator('tree')!.check(s);

  it('cây thì đạt', () => {
    expect(check(graphOf(['1-2', '2-3', '3-4'])).ok).toBe(true);
    expect(check(graphOf(['1-2'])).ok).toBe(true);
  });

  it('**nói ra hỏng ở đâu**, không chỉ nói "không phải cây"', () => {
    // Thừa cạnh ⇒ chỉ vào chu trình.
    const cyclic = check(graphOf(['1-2', '2-3', '3-1']));
    expect(cyclic.ok).toBe(false);
    expect(cyclic.message).toMatch(/chu trình/);
    expect(cyclic.violations).toHaveLength(3);

    // Thiếu cạnh ⇒ nói rời mấy mảnh.
    const split = check(graphOf(['1-2'], ['3', '4']));
    expect(split.ok).toBe(false);
    expect(split.message).toMatch(/thành phần rời nhau/);
  });

  it('có trong danh sách id để Studio bày ra', () => {
    expect(GRAPH_VALIDATOR_IDS).toContain('tree');
  });
});

/**
 * GR-05 — tô mặt, và hai chi tiết quyết định nó đúng hay chỉ trông đúng.
 */
describe('validator `face-colouring`', () => {
  /** Hai tam giác dán theo cạnh a–b, cộng bảng màu mặt. */
  const diamond = (faceColors: Record<string, number>): Scene => ({
    engine: 'graph',
    config: { show_faces: true, face_colors: faceColors },
    elements: [
      { id: 'a', type: 'vertex', pos: [0, 0] },
      { id: 'b', type: 'vertex', pos: [10, 0] },
      { id: 'c', type: 'vertex', pos: [5, 9] },
      { id: 'd', type: 'vertex', pos: [5, -9] },
      { id: 'e1', type: 'edge', u: 'a', v: 'b' },
      { id: 'e2', type: 'edge', u: 'b', v: 'c' },
      { id: 'e3', type: 'edge', u: 'c', v: 'a' },
      { id: 'e4', type: 'edge', u: 'a', v: 'd' },
      { id: 'e5', type: 'edge', u: 'b', v: 'd' },
    ],
  });

  const check = (scene: Scene, id = 'face-colouring') =>
    resolveGraphValidator(id)!.check(scene);

  it('hai mặt chung cạnh cùng màu là vi phạm; khác màu thì đạt', () => {
    // Ba mặt: hai tam giác trong, cộng mặt ngoài. Mặt ngoài **cũng phải tô**.
    expect(check(diamond({ 'face-0': 1, 'face-1': 1, 'face-outer': 2 })).ok).toBe(false);
    expect(check(diamond({ 'face-0': 1, 'face-1': 2, 'face-outer': 3 })).ok).toBe(true);
  });

  it('mặt chưa tô thì báo **mặt nào**, không báo chung chung', () => {
    const outcome = check(diamond({ 'face-0': 1 }));
    expect(outcome.ok).toBe(false);
    expect(outcome.violations).toContain('face-outer');
    expect(outcome.message).toMatch(/chưa tô/);
  });

  it('mặt ngoài **không** được miễn — bỏ nó ra thì bài dễ đi một màu', () => {
    // Hai tam giác trong khác màu nhau nhưng mặt ngoài chưa tô ⇒ chưa đạt.
    expect(check(diamond({ 'face-0': 1, 'face-1': 2 })).ok).toBe(false);
  });

  it('dạng có tham số chặn thêm số màu', () => {
    const good = diamond({ 'face-0': 1, 'face-1': 2, 'face-outer': 3 });
    expect(check(good, 'face-colouring:3').ok).toBe(true);
    expect(check(good, 'face-colouring:2').ok).toBe(false);
    expect(check(good, 'face-colouring:2').message).toMatch(/quá 2/);
  });

  it('hình còn cắt nhau thì nói **điều đó**, không nói "chưa tô"', () => {
    const crossing: Scene = {
      engine: 'graph',
      config: { show_faces: true },
      elements: [
        { id: 'a', type: 'vertex', pos: [0, 0] },
        { id: 'b', type: 'vertex', pos: [10, 10] },
        { id: 'c', type: 'vertex', pos: [10, 0] },
        { id: 'd', type: 'vertex', pos: [0, 10] },
        { id: 'e1', type: 'edge', u: 'a', v: 'b' },
        { id: 'e2', type: 'edge', u: 'c', v: 'd' },
      ],
    };
    const outcome = check(crossing);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/cắt nhau|liên thông/);
  });
});
