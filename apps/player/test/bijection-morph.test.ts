import { describe, expect, it } from 'vitest';
import type { Bijection } from '@combviz/schema';
import type { SceneBox } from '@combviz/render';
import {
  MORPH_LEFT_GROUP,
  MORPH_RIGHT_GROUP,
  morphChoreography,
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

  it('`boxOf` gộp hai pane, pane phải tra qua tiền tố', () => {
    const out = morphChoreography(bijection([['x1', 'b1']]), left, right, opts)!;

    expect(out.boxOf('x1')).toEqual(box(0));
    expect(out.boxOf('r:b1')).toEqual(box(50));
    // Không tiền tố thì tra sang pane trái — và bên trái không có `b1`.
    expect(out.boxOf('b1')).toEqual([]);
  });
});
