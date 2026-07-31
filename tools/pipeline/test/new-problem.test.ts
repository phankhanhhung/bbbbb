import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createChecker, hasErrors } from '@combviz/check';
import { formatProblem } from '@combviz/schema';
import { ENGINE_DSL, ENGINE_FRAGMENTS } from '../src/engines.js';
import { loadTaxonomy } from '../src/taxonomy.js';
import {
  STARTER_ENGINES,
  buildNewProblem,
  starterScene,
} from '../src/commands/new-problem.js';

/**
 * Khung `combviz new` phải qua được **đúng bộ kiểm mà CI dùng** (AUT-04).
 *
 * Đây là toàn bộ giá trị của lệnh ấy. Một khung mà chạy lên là đỏ thì tệ hơn
 * không có khung: nó bắt người soạn đi debug thứ mình chưa viết, và ở gate G-C
 * thì thuế ấy thu ngay ở bước đầu của **mỗi** bài.
 *
 * Bảy engine, bảy scene mẫu, và mỗi scene có bound riêng cùng những chỗ mà "rỗng"
 * là không hợp lệ. Không có test này thì đúng loại lỗi ấy chỉ lộ ra khi chính chủ
 * gõ lệnh lần đầu — tức đúng lúc không nên gặp nó.
 */
// Dùng **đúng** loader mà CLI dùng, không tự dựng lại từ vựng: tag của khung phải
// hợp lệ theo controlled vocabulary thật (CMS-01), không theo một bản sao trong test.
const CONTENT = fileURLToPath(new URL('../../../packages/content', import.meta.url));
const checker = createChecker({
  fragments: ENGINE_FRAGMENTS,
  dsl: ENGINE_DSL,
  taxonomy: await loadTaxonomy(CONTENT),
});

const make = (engine: string) =>
  buildNewProblem({
    root: 'packages/content',
    id: `khung-${engine}`,
    engine,
    kind: 'challenge',
    today: '2026-07-29',
    write: false,
  });

describe('combviz new', () => {
  it('có khung cho **cả tám** engine, không thiếu cái nào', () => {
    expect([...STARTER_ENGINES].sort()).toEqual(
      ['board', 'derivation', 'game', 'graph', 'longdiv', 'point', 'sequence', 'set'].sort(),
    );
  });

  for (const engine of STARTER_ENGINES) {
    describe(engine, () => {
      it('khung qua được **toàn bộ** bộ kiểm, không một lỗi nào', () => {
        const problem = make(engine);
        const issues = checker.check(problem, formatProblem(problem));
        expect({
          engine,
          errors: issues.filter((i) => i.severity === 'error').map((i) => i.code),
        }).toEqual({ engine, errors: [] });
        expect(hasErrors(issues)).toBe(false);
      });

      it('khung cũng **không có cảnh báo** — kho đang ở mức 0 cảnh báo', () => {
        // Nếu khung sinh ra cảnh báo thì mỗi bài mới bắt đầu bằng một vệt vàng,
        // và vệt vàng thường trực là cách nhanh nhất để người ta ngừng đọc nó.
        const problem = make(engine);
        const warnings = checker
          .check(problem, formatProblem(problem))
          .filter((i) => i.severity === 'warning')
          .map((i) => i.code);
        expect({ engine, warnings }).toEqual({ engine, warnings: [] });
      });

      it('đã ở **định dạng chuẩn tắc** ngay khi sinh (DAT-03)', () => {
        // Không thế thì `combviz new` rồi `combviz fmt` sinh diff ngay lập tức,
        // và bài đầu tiên của người soạn mở đầu bằng một commit dọn dẹp.
        const problem = make(engine);
        const text = formatProblem(problem);
        expect(formatProblem(JSON.parse(text))).toBe(text);
      });

      it('không publish nổi: `status: draft` và step chưa `verified` (AUT-09)', () => {
        const problem = make(engine);
        expect(problem.status).toBe('draft');
        expect(problem.solutions[0]!.steps.every((s) => s.verified !== true)).toBe(true);
      });

      it('anchor trỏ vào một id **có thật** trong scene', () => {
        const problem = make(engine);
        const step = problem.solutions[0]!.steps[0]!;
        const ids = new Set(step.scene!.elements.map((e) => e.id));
        const implicit =
          ENGINE_FRAGMENTS.find((f) => f.id === engine)?.implicitElementIds(step.scene!) ??
          new Set<string>();
        for (const id of step.anchors!['a1']!.ids) {
          expect({ engine, id, known: ids.has(id) || implicit.has(id) }).toEqual({
            engine,
            id,
            known: true,
          });
        }
      });

      it('scene mẫu là **hằng số**, không bị lệnh sửa tại chỗ', () => {
        // Hai bài tạo liên tiếp không được chia nhau một object bị mutate.
        const a = make(engine).solutions[0]!.steps[0]!.scene!;
        expect(a).toEqual(starterScene(engine));
      });
    });
  }

  it('engine lạ thì ném, không sinh ra khung rỗng', () => {
    expect(() =>
      buildNewProblem({
        root: 'packages/content',
        id: 'x',
        engine: 'khong-co',
        kind: 'challenge',
        today: '2026-07-29',
        write: false,
      }),
    ).toThrow(/không có khung mẫu/);
  });
});
