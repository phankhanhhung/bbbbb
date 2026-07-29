import { describe, expect, it } from 'vitest';
import type { Scene, SceneElement } from '@combviz/schema';
import { buildGraph } from '../src/graph.js';
import {
  bipartite,
  connectedComponents,
  eulerian,
  findCycle,
  hamiltonian,
} from '../src/analyzers.js';
import { layoutPositions } from '../src/layout.js';
import { GRAPH_LIMITS } from '../src/schema.js';

/** Dựng scene từ mô tả cạnh dạng `"a-b"`, đỉnh suy ra từ chúng. */
function graphOf(edgeSpecs: readonly string[], extraVertices: readonly string[] = []): Scene {
  const names = new Set<string>(extraVertices);
  const edges: SceneElement[] = edgeSpecs.map((spec, i) => {
    const [u, v] = spec.split('-') as [string, string];
    names.add(u);
    names.add(v);
    return { id: `e${i}`, type: 'edge', u, v };
  });

  const ids = [...names].sort();
  const positions = layoutPositions(ids, 'circle');

  return {
    engine: 'graph',
    config: {},
    elements: [
      ...ids.map((id) => ({
        id,
        type: 'vertex',
        pos: positions.get(id) ?? [0, 0],
      })) as SceneElement[],
      ...edges,
    ],
  };
}

const model = (specs: readonly string[], extra: readonly string[] = []) =>
  buildGraph(graphOf(specs, extra));

describe('bậc đỉnh', () => {
  it('khuyên tính hai lần vào bậc', () => {
    // Đây là định nghĩa chuẩn, và nó là thứ làm bổ đề bắt tay đúng: tổng bậc bằng
    // hai lần số cạnh, kể cả khi có khuyên.
    const graph = model(['a-a', 'a-b']);

    expect(graph.degree.get('a')).toBe(3);
    expect(graph.degree.get('b')).toBe(1);
  });

  it('tổng bậc bằng hai lần số cạnh', () => {
    const graph = model(['a-b', 'b-c', 'c-a', 'a-a', 'a-b']);
    const total = [...graph.degree.values()].reduce((sum, d) => sum + d, 0);

    expect(total).toBe(2 * graph.edges.length);
  });

  it('cạnh song song đều được tính', () => {
    expect(model(['a-b', 'a-b', 'a-b']).degree.get('a')).toBe(3);
  });
});

describe('thành phần liên thông', () => {
  it('đếm đúng số thành phần, kể cả đỉnh cô lập', () => {
    expect(connectedComponents(model(['a-b'], ['z'])).count).toBe(2);
  });

  it('đồ thị liên thông cho đúng một thành phần', () => {
    expect(connectedComponents(model(['a-b', 'b-c', 'c-d'])).count).toBe(1);
  });
});

describe('hai phía', () => {
  it('chu trình chẵn là hai phía', () => {
    const result = bipartite(model(['a-b', 'b-c', 'c-d', 'd-a']));

    expect(result.bipartite).toBe(true);
    expect(result.side.get('a')).toBe(result.side.get('c'));
    expect(result.side.get('a')).not.toBe(result.side.get('b'));
  });

  it('chu trình lẻ không hai phía, và chỉ ra được nhân chứng', () => {
    const result = bipartite(model(['a-b', 'b-c', 'c-a']));

    expect(result.bipartite).toBe(false);
    // Nhân chứng mới là thứ dạy được: "không hai phía" thì vô dụng, "vì có tam
    // giác này" thì người học kiểm được bằng mắt.
    expect(result.oddCycle.length).toBeGreaterThan(0);
  });

  it('khuyên làm mất tính hai phía ngay lập tức', () => {
    const result = bipartite(model(['a-a']));

    expect(result.bipartite).toBe(false);
    expect(result.oddCycle).toEqual(['a']);
  });
});

describe('chu trình', () => {
  it('cây không có chu trình', () => {
    expect(findCycle(model(['a-b', 'b-c', 'b-d']))).toEqual([]);
  });

  it('tìm được chu trình trong đồ thị có chu trình', () => {
    expect(findCycle(model(['a-b', 'b-c', 'c-a'])).length).toBe(3);
  });

  it('hai cạnh song song là chu trình độ dài 2, không phải "không có"', () => {
    // Đi ra rồi quay lại qua **cùng một cạnh** thì không phải chu trình; qua một
    // cạnh song song khác thì là. Nhầm chỗ này làm multigraph trông như cây.
    expect(findCycle(model(['a-b', 'a-b'])).length).toBe(2);
  });

  it('khuyên là chu trình độ dài 1', () => {
    expect(findCycle(model(['a-a']))).toEqual(['a']);
  });
});

describe('Euler', () => {
  it('mọi đỉnh bậc chẵn cho chu trình Euler đi qua mọi cạnh', () => {
    const graph = model(['a-b', 'b-c', 'c-a']);
    const result = eulerian(graph);

    expect(result.kind).toBe('circuit');
    expect(new Set(result.trail).size).toBe(graph.edges.length);
  });

  it('đúng hai đỉnh bậc lẻ cho đường Euler', () => {
    // Đường đi a-b-c-d: b và c bậc 2, a và d bậc 1.
    const graph = model(['a-b', 'b-c', 'c-d']);
    const result = eulerian(graph);

    expect(result.kind).toBe('path');
    expect([...result.oddVertices].sort()).toEqual(['a', 'd']);
    expect(new Set(result.trail).size).toBe(graph.edges.length);
  });

  it('bốn đỉnh bậc lẻ thì không có, và nói rõ vì sao', () => {
    // $K_4$: mọi đỉnh bậc 3.
    const result = eulerian(model(['a-b', 'a-c', 'a-d', 'b-c', 'b-d', 'c-d']));

    expect(result.kind).toBe('none');
    expect(result.reason).toMatch(/bậc lẻ/);
  });

  it('cạnh nằm ở hai thành phần rời nhau thì không có', () => {
    const result = eulerian(model(['a-b', 'c-d']));

    expect(result.kind).toBe('none');
    expect(result.reason).toMatch(/liên thông/);
  });

  it('đỉnh cô lập không phá vỡ sự tồn tại của chu trình Euler', () => {
    // Một đỉnh không có cạnh thì đơn giản là không nằm trên đường đi.
    expect(eulerian(model(['a-b', 'b-c', 'c-a'], ['z'])).kind).toBe('circuit');
  });
});

describe('Hamilton (GR-04)', () => {
  it('tìm được chu trình Hamilton trên chu trình', () => {
    const result = hamiltonian(model(['a-b', 'b-c', 'c-d', 'd-a']));

    expect(result.value?.kind).toBe('cycle');
    expect(new Set(result.value?.order).size).toBe(4);
  });

  it('đường đi mà không khép được thì vẫn báo là đường đi', () => {
    const result = hamiltonian(model(['a-b', 'b-c', 'c-d']));

    expect(result.value?.kind).toBe('path');
    expect(result.value?.order).toHaveLength(4);
  });

  it('đồ thị không liên thông thì không có', () => {
    expect(hamiltonian(model(['a-b', 'c-d'])).value?.kind).toBe('none');
  });

  it('vượt bound thì **từ chối kèm lý do**, không treo', () => {
    const many = Array.from(
      { length: GRAPH_LIMITS.maxHamiltonVertices + 1 },
      (_, i) => `v${i}-v${(i + 1) % (GRAPH_LIMITS.maxHamiltonVertices + 1)}`,
    );
    const result = hamiltonian(model(many));

    // NFR-P4: thà nói "bài này quá lớn cho tính năng này" còn hơn để người học
    // nhìn một spinner vô hạn.
    expect(result.value).toBeNull();
    expect(result.refused).toMatch(/vượt trần/);
  });
});

describe('layout (GR-02)', () => {
  it('vòng tròn đặt đỉnh kề nhau cách đúng một khoảng chuẩn', () => {
    const positions = layoutPositions(['a', 'b', 'c', 'd', 'e', 'f'], 'circle');
    const a = positions.get('a')!;
    const b = positions.get('b')!;

    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(10, 1);
  });

  it('vòng tròn bắt đầu từ đỉnh trên cùng', () => {
    expect(layoutPositions(['a', 'b', 'c'], 'circle').get('a')?.[0]).toBeCloseTo(0, 5);
  });

  it('hai phía căn giữa hai hàng theo nhau', () => {
    const positions = layoutPositions(['a', 'b', 'c', 'd', 'e'], 'bipartite', {
      topSide: ['a', 'b'],
    });

    const topXs = ['a', 'b'].map((id) => positions.get(id)![0]);
    const bottomXs = ['c', 'd', 'e'].map((id) => positions.get(id)![0]);
    const mid = (xs: number[]) => (Math.min(...xs) + Math.max(...xs)) / 2;

    // Hai hàng lệch nhau sẽ làm mắt đọc nhầm rằng có tương ứng vị trí giữa hai phía.
    expect(mid(topXs)).toBeCloseTo(mid(bottomXs), 5);
  });
});
