import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createContext, createRenderer } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Problem } from '@combviz/schema';
import type { LabelAtlas } from '@combviz/render';
import { ENGINE_RENDERERS } from '../src/engines.js';

/**
 * Golden SVG snapshot cho **toàn kho** (§9).
 *
 * Rẻ đến mức gần như miễn phí, vì renderer thuần (D-03): không browser, không
 * ảnh, không so pixel — chỉ là chuỗi vào, chuỗi ra. Và đây là lớp lưới duy nhất
 * bắt được loại hồi quy nguy hiểm nhất của dự án này: **hình đổi mà test vẫn
 * xanh**. Một tweak trong theme hay một sửa nhỏ trong layout có thể làm lệch 25
 * bài cùng lúc, và không có unit test nào thấy — người xem thì thấy.
 *
 * Phải có **trước** content sprint, không phải sau: khi kho còn 2 bài, review
 * một diff golden là chuyện 30 giây; khi kho có 25 bài thì cái lưới này là thứ
 * duy nhất phân biệt "tôi sửa một bài" với "tôi vừa đổi cả kho".
 *
 * Diff golden nở to là **thông tin**, không phải phiền phức: nó nói đúng bao
 * nhiêu bài bị ảnh hưởng. Cập nhật bằng `pnpm test -u` sau khi đã nhìn diff.
 */
const CONTENT = fileURLToPath(new URL('../../../packages/content/problems', import.meta.url));
const GOLDEN = fileURLToPath(new URL('./__golden__', import.meta.url));

const renderer = createRenderer(ENGINE_RENDERERS);

// Atlas thật, không phải bảng rỗng: golden phải khoá **hình người xem thấy**, mà
// nhãn thiếu atlas thì vẽ ra một dòng chữ báo lỗi trông chẳng giống công thức nào.
const ATLAS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../packages/content/labels.json', import.meta.url)), 'utf8'),
) as LabelAtlas;

const problems = readdirSync(CONTENT, { withFileTypes: true, recursive: true })
  .filter((e) => e.isFile() && e.name.endsWith('.json'))
  .map((e) => JSON.parse(readFileSync(join(e.parentPath ?? CONTENT, e.name), 'utf8')) as Problem)
  .sort((a, b) => a.id.localeCompare(b.id));

describe('golden SVG toàn kho', () => {
  it('kho không rỗng — test này vô nghĩa nếu không quét được bài nào', () => {
    expect(problems.length).toBeGreaterThan(0);
  });

  for (const problem of problems) {
    const scenes = problem.solutions.flatMap((solution) =>
      solution.steps
        .filter((step) => step.scene !== undefined)
        .map((step) => ({ solution: solution.id, step })),
    );

    describe(problem.id, () => {
      for (const { solution, step } of scenes) {
        it(`${solution}/${step.id}`, async () => {
          const scene = step.scene!;
          if (!renderer.has(scene.engine)) return;

          // Bật pattern (NFR-A1): golden nên khoá luôn kênh dự phòng không màu,
          // vì đó chính là thứ dễ hỏng lặng lẽ nhất — không ai bật nó hằng ngày.
          const ctx = createContext(defaultTheme, { patterns: true, labels: ATLAS });
          const svg = renderer.toSvg(scene, ctx);

          await expect(svg).toMatchFileSnapshot(
            join(GOLDEN, `${problem.id}--${solution}--${step.id}.svg`),
          );
        });
      }
    });
  }
});
