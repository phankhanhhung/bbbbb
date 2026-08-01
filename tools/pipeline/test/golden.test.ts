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

  it('không có snapshot mồ côi', () => {
    // `toMatchFileSnapshot` **không tự dọn**: xoá một step thì golden của nó nằm
    // lại vĩnh viễn, không ai so nữa và không gì báo. Kho từng có đúng một file
    // như thế (`hall-marriage-condition--sol--s4.svg`) — 305 file cho 304 scene.
    const expected = new Set(
      problems.flatMap((problem) =>
        problem.solutions.flatMap((solution) =>
          solution.steps.flatMap((step) => [
            ...(step.scene !== undefined && renderer.has(step.scene.engine)
              ? [`${problem.id}--${solution.id}--${step.id}.svg`]
              : []),
            ...(step.bijection !== undefined && renderer.has(step.bijection.scene.engine)
              ? [`${problem.id}--${solution.id}--${step.id}--bijection.svg`]
              : []),
          ]),
        ),
      ),
    );
    const orphans = readdirSync(GOLDEN)
      .filter((name) => name.endsWith('.svg'))
      .filter((name) => !expected.has(name));

    expect(orphans, `golden không còn scene nào sinh ra: ${orphans.join(', ')}`).toEqual([]);
  });

  /**
   * **Không golden nào được chứa nhãn thiếu atlas.**
   *
   * `missingLabel` vẽ ra `⟨thiếu atlas: …⟩` bằng mực đỏ, cố ý ồn ào — nhưng ồn ào
   * chỉ có tác dụng với người **nhìn** hình. Golden thì không nhìn: nó chụp đúng
   * cái nó thấy, kể cả khi cái nó thấy là bốn dòng chữ báo lỗi chồng lên nhau.
   *
   * Đã sống thật, và sống lâu: `geometric-sum-doubling` xuất bản từ M40 với **8**
   * node đỏ thay cho công thức, vì soạn xong mà quên `combviz labels --write`. CI
   * có bắt (`pnpm labels` chạy ở đó), nhưng bộ kiểm chạy tay thì không — nên lỗi
   * nằm im qua bốn hạng mục. Khẳng định này đưa nó về đúng chỗ: chỗ mà người soạn
   * chạy trước khi commit.
   */
  it('không golden nào vẽ ra nhãn thiếu atlas (D-07)', () => {
    const broken = readdirSync(GOLDEN)
      .filter((name) => name.endsWith('.svg'))
      .filter((name) => readFileSync(join(GOLDEN, name), 'utf8').includes('thiếu atlas'));

    expect(
      broken,
      `atlas cũ so với nội dung — chạy \`pnpm labels --write\`: ${broken.join(', ')}`,
    ).toEqual([]);
  });

  for (const problem of problems) {
    /**
     * Pane **phải** của song ánh cũng vào lưới hồi quy — cùng căn bệnh công dân
     * hạng hai mà M66 chữa ở validate và lượt rà này chữa ở formatProblem: 19
     * bài bijection, 442 file golden, và không một file pane-phải nào. Nửa mà
     * bài song ánh sinh ra để nói là nửa duy nhất không có ai canh.
     */
    const scenes = problem.solutions.flatMap((solution) =>
      solution.steps.flatMap((step) => [
        ...(step.scene !== undefined
          ? [{ solution: solution.id, step, scene: step.scene, suffix: '' }]
          : []),
        ...(step.bijection !== undefined
          ? [
              {
                solution: solution.id,
                step,
                scene: step.bijection.scene,
                suffix: '--bijection',
              },
            ]
          : []),
      ]),
    );

    describe(problem.id, () => {
      for (const { solution, step, scene, suffix } of scenes) {
        it(`${solution}/${step.id}${suffix}`, async () => {
          if (!renderer.has(scene.engine)) return;

          // Bật pattern (NFR-A1): golden nên khoá luôn kênh dự phòng không màu,
          // vì đó chính là thứ dễ hỏng lặng lẽ nhất — không ai bật nó hằng ngày.
          const ctx = createContext(defaultTheme, { patterns: true, labels: ATLAS });
          const svg = renderer.toSvg(scene, ctx);

          await expect(svg).toMatchFileSnapshot(
            join(GOLDEN, `${problem.id}--${solution}--${step.id}${suffix}.svg`),
          );
        });
      }
    });
  }
});
