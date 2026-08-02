import { describe, expect, it } from 'vitest';
import type { Bijection, Scene } from '@combviz/schema';
import type { SceneBox, SvgNode } from '@combviz/render';
import { applyChoreography, createContext, keyed } from '@combviz/render';
import { ELEMENT_ATTR } from '@combviz/render/dom';
import { graphRenderer } from '@combviz/engine-graph';
import { defaultTheme } from '@combviz/theme';
import {
  MORPH_LEFT_GROUP,
  MORPH_RIGHT_GROUP,
  morphChoreography,
  prefixRightPane,
} from '../src/bijection-morph.js';

const box = (x: number): SceneBox[] => [{ x, y: 0, width: 4, height: 4 }];

const bijection = (pairs: [string, string][]): Bijection =>
  ({ scene: { engine: 'sequence', config: {}, elements: [] }, pairs }) as Bijection;

const left = (id: string): readonly SceneBox[] => (id.startsWith('x') ? box(0) : []);
const right = (id: string): readonly SceneBox[] => (id.startsWith('b') ? box(50) : []);

const opts = { anchor: 'a1', perPairMs: 100, swapMs: 50 };

describe('PRN-04 — timeline biến hình theo từng cặp', () => {
  it('mỗi cặp một pha, so le theo thời gian', () => {
    const out = morphChoreography(
      bijection([
        ['x1', 'b1'],
        ['x2', 'b2'],
        ['x3', 'b3'],
      ]),
      left,
      right,
      opts,
    )!;

    const morphs = out.spec.phases.filter((p) => p.kind === 'morph');
    expect(morphs).toHaveLength(3);
    // Đây là ràng buộc phân biệt "từng cặp" với "đồng loạt": ba mốc khác nhau.
    expect(morphs.map((p) => p.at)).toEqual([0, 100, 200]);
  });

  it('id pha có đệm số — không thì `morph-10` đứng trước `morph-2`', () => {
    const pairs = Array.from({ length: 12 }, (_, i) => [`x${i}`, `b${i}`] as [string, string]);
    const out = morphChoreography(bijection(pairs), left, right, opts)!;
    const ids = out.spec.phases.filter((p) => p.kind === 'morph').map((p) => p.id);

    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
  });

  it('mọi pha có nhãn riêng — điều kiện để bộ đếm pha đọc được (CHO-09)', () => {
    // Cả bảy step song ánh trong kho có đúng **một** anchor, nên mọi pha chung
    // anchor. Không có nhãn thì chế độ giảm chuyển động in ra $N$ dòng giống hệt
    // nhau, và "bấm qua từng cặp" mất hết nghĩa.
    const out = morphChoreography(
      bijection([
        ['x1', 'b1'],
        ['x2', 'b2'],
      ]),
      left,
      right,
      opts,
    )!;
    const labels = out.spec.phases.map((p) => p.label?.vi);

    expect(labels.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('$k$ cặp cùng vế phải gộp làm **một** pha nhiều target', () => {
    // Đếm $k$-về-$1$: "mỗi hình bên phải ứng với đúng $k$ hình bên trái" là một
    // ý, không phải $k$ ý — và cho $k$ hình cùng bay về một chỗ là cách duy nhất
    // người xem **thấy** được con số $k$.
    const out = morphChoreography(
      bijection([
        ['x1', 'b1'],
        ['x2', 'b1'],
        ['x3', 'b1'],
      ]),
      left,
      right,
      opts,
    )!;

    const morphs = out.spec.phases.filter((p) => p.kind === 'morph');
    expect(morphs).toHaveLength(1);
    expect(morphs[0]!.targets).toEqual(['x1', 'x2', 'x3']);
  });

  it('một vế trái xuất hiện hai lần: cặp đầu thắng, cặp sau vào `skipped`', () => {
    // Pha muộn ghi đè pha sớm, nên để cả hai thì element lặng lẽ bay tới đích
    // cuối cùng. Nói ra thay vì để im.
    const out = morphChoreography(
      bijection([
        ['x1', 'b1'],
        ['x1', 'b2'],
      ]),
      left,
      right,
      opts,
    )!;

    expect(out.skipped).toEqual([['x1', 'b2']]);
  });

  it('đo không được thì bỏ cặp, và bỏ quá một phần ba thì **từ chối cả timeline**', () => {
    // Một animation mà một phần ba số cặp đứng im còn tệ hơn hai hình đặt cạnh
    // nhau: đứng im đọc thành "cái này không có ảnh".
    const partial = morphChoreography(
      bijection([
        ['x1', 'b1'],
        ['x2', 'b2'],
        ['x3', 'b3'],
        ['x4', 'khong-do-duoc'],
      ]),
      left,
      right,
      opts,
    );
    expect(partial?.skipped).toEqual([['x4', 'khong-do-duoc']]);

    const hopeless = morphChoreography(
      bijection([
        ['x1', 'b1'],
        ['x2', 'mat'],
        ['x3', 'mat'],
      ]),
      left,
      right,
      opts,
    );
    expect(hopeless).toBeNull();
  });

  it('pha đổi vai chạm **cả nhóm** hai bên, và nằm sau khi bay xong', () => {
    const out = morphChoreography(
      bijection([
        ['x1', 'b1'],
        ['x2', 'b2'],
      ]),
      left,
      right,
      opts,
    )!;

    const out1 = out.spec.phases.find((p) => p.kind === 'hide')!;
    const in1 = out.spec.phases.find((p) => p.kind === 'show')!;
    // Nhắm vào **nhóm**, không vào từng phần tử: nhãn hàng, tiêu đề, chú thích
    // không thuộc cặp nào, nên nhắm từng phần tử sẽ để chúng nằm lại chồng lên
    // hình bên kia — đúng lỗi mà khung cuối lộ ra khi chụp ảnh.
    expect(out1.targets).toEqual([MORPH_LEFT_GROUP]);
    expect(in1.targets).toEqual([MORPH_RIGHT_GROUP]);
    expect(out1.at).toBe(200);
    expect(in1.at).toBe(200);
  });

  it('không cặp nào dịch chỗ thì **không có** phép biến hình', () => {
    // Hai pane cùng engine cùng view thì ảnh nằm đúng chỗ vật. Chạy đủ thời
    // lượng mà màn hình đứng im là đúng triệu chứng mà M37 và M38 mất nhiều vòng
    // mới tìm ra — nên Player không bày nút ra. View hai pane vẫn nói được "cái
    // này ứng với cái kia" bằng cách rê chuột.
    const same = (id: string): readonly SceneBox[] => (id.startsWith('x') || id.startsWith('b') ? box(0) : []);

    expect(morphChoreography(bijection([['x1', 'b1'], ['x2', 'b2']]), same, same, opts)).toBeNull();
  });

  it('`boxOf` gộp hai pane, pane phải tra qua tiền tố', () => {
    const out = morphChoreography(bijection([['x1', 'b1']]), left, right, opts)!;

    expect(out.boxOf('x1')).toEqual(box(0));
    expect(out.boxOf('r:b1')).toEqual(box(50));
    // Không tiền tố thì tra sang pane trái — và bên trái không có `b1`.
    expect(out.boxOf('b1')).toEqual([]);
  });
});

/**
 * Chốt canh cho **mối nối**, không cho hai đầu.
 *
 * Chín case trên đều gọi `morphChoreography` với hộp giả — hàm thuần, không cây
 * node nào. Chúng xanh suốt trong khi Player vẽ ra một ma trận vỡ vụn, vì lỗi
 * không nằm trong timeline lẫn trong `applyChoreography`: nó nằm ở chỗ hai thứ
 * gặp nhau, đúng chỗ duy nhất không ai chạy. Nên nhóm này dựng cây **thật** từ
 * engine và chạy đúng lối Player chạy.
 */
describe('PRN-04 — cây gộp hai pane, chạy đúng lối Player chạy', () => {
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

  const pairs: [string, string][] = [
    ['ev1v2', 'ev1v2'],
    ['ev2v3', 'ev2v3'],
  ];
  const bij = { scene: matrixScene, pairs } as unknown as Bijection;
  const ctx = createContext(defaultTheme, {});
  const boxes = (scene: Scene) => (id: string) => graphRenderer.elementBoxes(scene, id, ctx);

  const generated = morphChoreography(bij, boxes(graphScene), boxes(matrixScene), {
    anchor: 'a1',
  })!;

  const morphNodes = [
    keyed(MORPH_LEFT_GROUP, 'g', {}, graphRenderer.render(graphScene, ctx)),
    keyed(MORPH_RIGHT_GROUP, 'g', {}, prefixRightPane(graphRenderer.render(matrixScene, ctx))),
  ];

  const groupOf = (nodes: readonly SvgNode[], key: string): SvgNode =>
    nodes.find((n) => n.key === key)!;

  const collect = (node: SvgNode, seen: SvgNode[] = []): SvgNode[] => {
    seen.push(node);
    for (const child of node.children ?? []) collect(child, seen);
    return seen;
  };

  const last = generated.spec.phases[generated.spec.phases.length - 1]!;
  const endMs = last.at + last.duration;
  const marks = [0, Math.round(endMs / 3), Math.round((endMs * 2) / 3), endMs];

  it('không khung nào dời một node của pane **phải** — kể cả khung cuối', () => {
    // Đây là lỗi thật, và nó chỉ hiện ở khung **đứng yên** cuối cùng: mỗi ô ma
    // trận mang cạnh bị dời đúng bằng vector cạnh-bay-sang-bảng, tới hơn bốn ô,
    // xa hơn cả bề ngang cái bảng. Ô $0$ không thuộc cặp nào nên đứng nguyên —
    // nửa bảng đúng chỗ, nửa văng đi.
    for (const ms of marks) {
      const out = applyChoreography(morphNodes, generated.spec, ms, { boxOf: generated.boxOf });
      const moved = collect(groupOf(out, MORPH_RIGHT_GROUP))
        .filter((n) => n.attrs['transform'] !== undefined)
        .map((n) => `${String(n.key)} ${String(n.attrs['transform'])}`);

      expect(moved, `t = ${ms}ms`).toEqual([]);
    }
  });

  it('pane trái **có** dời — nếu không thì chốt trên xanh vì không có gì chạy', () => {
    const middle = applyChoreography(morphNodes, generated.spec, marks[1]!, {
      boxOf: generated.boxOf,
    });
    const moved = collect(groupOf(middle, MORPH_LEFT_GROUP)).filter(
      (n) => n.attrs['transform'] !== undefined,
    );

    expect(moved.length).toBeGreaterThan(0);
  });

  it('hai pane không dùng chung một danh tính nào trong **không gian mà máy tra**', () => {
    // `key` và `data-el` không phải hai không gian tên — `rewrite` gộp chúng làm
    // một (`data-el` trước, `key` là đường lui), nên va chạm thật nằm **chéo**:
    // `key` bên trái đụng `data-el` bên phải. Đếm hai không gian rời nhau thì
    // chốt này xanh trong khi lỗi vẫn còn nguyên — đã thử, và nó xanh thật.
    const idsOf = (group: string): Set<string> => {
      const out = new Set<string>();
      for (const node of collect(groupOf(morphNodes, group))) {
        const owner = node.attrs[ELEMENT_ATTR];
        const id = typeof owner === 'string' ? owner : node.key;
        if (id !== undefined) out.add(id);
      }
      return out;
    };
    const rightIds = idsOf(MORPH_RIGHT_GROUP);

    expect([...idsOf(MORPH_LEFT_GROUP)].filter((id) => rightIds.has(id))).toEqual([]);
  });
});
