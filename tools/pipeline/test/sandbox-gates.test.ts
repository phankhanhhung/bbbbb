import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Problem, Scene, SceneValidator } from '@combviz/schema';
import { resolveAlgebraValidator } from '@combviz/engine-algebra';
import { lintProblem, sandboxStatus } from '@combviz/check';
import { measure } from '../src/commands/coverage.js';

/**
 * **Hai cổng đếm sandbox phải nói cùng một câu** — và phép so này gọi **hai cổng thật**,
 * không gọi hai lần cùng một hàm.
 *
 * Chỗ này suýt thành một chốt canh tự đúng. Bản đầu gọi `lintProblem` và
 * `sandboxSatisfied`, mà sau lượt gộp thì `lintProblem` **cũng** gọi `sandboxSatisfied`
 * — nên phép so hoá ra chỉ khẳng định một hàm đồng ý với chính nó, và nó không thể đỏ vì
 * đúng cái lý do nó mang tên. Cùng lớp lỗi với "một phép so đỏ vì lý do sai" ở lượt
 * nhúng phông, chỉ khác chiều.
 *
 * Nên nó gọi `measure()` — hàm `combviz coverage` thật sự chạy. Tách một bản chép tay
 * thứ hai vào `coverage.ts` là đỏ ngay, và đó chính là chuyện **đã xảy ra**: mệnh đề
 * miễn bài chơi được thêm vào `lint/no-sandbox` ở M78 mà không thêm vào bảng điểm, nên
 * `pnpm validate` xanh tuyệt đối trong khi `combviz coverage` báo đỏ bảy bài cờ. Cả hai
 * cổng đều "đúng" theo mã của mình; cái sai là có hai mã cho một câu hỏi.
 */
const PROBLEMS = 'packages/content/problems';

async function bank(): Promise<Problem[]> {
  const out: Problem[] = [];
  for (const file of await readdir(PROBLEMS)) {
    if (!file.endsWith('.json')) continue;
    out.push(JSON.parse(await readFile(join(PROBLEMS, file), 'utf8')) as Problem);
  }
  return out.filter((p) => p.status === 'published');
}

const sandboxCriterion = (problems: readonly Problem[]) => {
  const found = measure(problems, () => true).find((c) => c.label.startsWith('Sandbox dùng được'));
  if (found === undefined) throw new Error('bảng điểm không còn tiêu chí sandbox');
  return found;
};

describe('hai cổng đếm sandbox', () => {
  it('`combviz coverage` bác **đúng** những bài `lint/no-sandbox` cảnh báo', async () => {
    const problems = await bank();
    expect(problems.length).toBeGreaterThan(100);

    const lintWarns = problems
      .filter((p) => lintProblem(p).some((i) => i.code === 'lint/no-sandbox'))
      .map((p) => p.id)
      .sort();

    expect([...sandboxCriterion(problems).missing].sort()).toEqual(lintWarns);
  });

  it('bài chơi được được miễn ở **cả hai** cổng — đây là chỗ đã gãy', async () => {
    const problems = await bank();
    const playable = problems.filter((p) => sandboxStatus(p) === 'exempt-playable');
    const failing = new Set(sandboxCriterion(problems).missing);

    // Không ghim con số: kho lớn thêm thì con số đổi, còn tính chất thì không.
    expect(playable.length).toBeGreaterThanOrEqual(7);
    for (const p of playable) {
      expect(failing.has(p.id), `${p.id} trượt bảng điểm`).toBe(false);
      expect(lintProblem(p).some((i) => i.code === 'lint/no-sandbox'), `${p.id} bị lint`).toBe(false);
    }
  });

  it('bốn cửa, và mỗi cửa mở đúng chỗ của nó', () => {
    const base = {
      id: 'x',
      status: 'published',
      solutions: [{ id: 's', label: { vi: '' }, steps: [] }],
    } as unknown as Problem;
    const play = {
      ...base,
      kind: 'challenge',
      solutions: [{ id: 's', label: { vi: '' }, steps: [{ id: 's0', play: {} }] }],
    } as unknown as Problem;

    expect(sandboxStatus({ ...base, kind: 'illustration' } as Problem)).toBe('exempt-illustration');
    expect(sandboxStatus(play)).toBe('exempt-playable');
    expect(sandboxStatus({ ...base, kind: 'challenge' } as Problem)).toBe('missing');
    expect(
      sandboxStatus({ ...base, kind: 'challenge', sandbox: { validators: ['a'] } } as Problem),
    ).toBe('has-sandbox');
    expect(
      sandboxStatus({ ...base, kind: 'challenge', sandbox: { goal_expr: 'true' } } as Problem),
    ).toBe('has-sandbox');

    // Chỗ hàm này **chặt hơn** bản cũ của `lint.ts`: một `sandbox: {}` là hộp cát không
    // ai chấm, tức đúng thứ DoD §15.1 muốn tránh. Kho hôm nay không có bài nào như thế
    // nên hợp nhất không đổi kết quả bài nào — nhưng luật thì phải nói ra.
    expect(sandboxStatus({ ...base, kind: 'challenge', sandbox: {} } as Problem)).toBe('missing');
  });
});

/**
 * **`no-vanishing-divisor` cắn đúng chỗ nó mang tên** (AL-25).
 *
 * Hai chuyện được đo ở đây, và cả hai là lỗi đã có thật trong kho:
 *
 * 1. `equation-moves-that-lie` — bài *nói về* chuyện nhân/chia cho thứ có thể bằng $0$ —
 *    ra đời (AL-23) với **chỉ** `each-step-sound`, một chốt canh đo được là không bao giờ
 *    đỏ. Validator duy nhất cắn được ở đúng bài nó sinh ra để phục vụ thì không được bật.
 * 2. Bản cũ của `no-vanishing-divisor` hỏi `conditions.length === 0`, nên nó đỏ vì **mọi**
 *    điều kiện — kể cả `f tăng ngặt`, một giả thiết không dính gì tới mẫu số. Nay nó đọc
 *    `Guard.sign === '!=0'`, tức hỏi thẳng thứ nó mang tên.
 */
describe('AL-25 — no-vanishing-divisor đỏ đúng chỗ, xanh đúng chỗ', () => {
  const nvd = resolveAlgebraValidator('no-vanishing-divisor');

  const scenesOf = async (id: string): Promise<Array<[string, Scene]>> => {
    const problem = JSON.parse(
      await readFile(join('packages/content/problems', `${id}.json`), 'utf8'),
    ) as Problem;
    const out: Array<[string, Scene]> = [];
    for (const sol of problem.solutions) {
      for (const step of sol.steps) {
        if (step.scene?.engine === 'algebra') out.push([step.id, step.scene]);
      }
    }
    return out;
  };

  it('đỏ ở đúng ba bước chia của `equation-moves-that-lie`', async () => {
    const red = (await scenesOf('equation-moves-that-lie'))
      .filter(([, scene]) => !(nvd as SceneValidator).check(scene).ok)
      .map(([id]) => id);

    expect(red).toEqual(['s1', 'c2', 'end']);
  });

  it('…và bài khai thẳng ba bước ấy bằng `expects_violation`', async () => {
    // Chỗ cố ý phạm luật thì phải viết ra — nếu không, `combviz validate` cảnh báo, và
    // một cảnh báo thường trực là thứ người ta học cách bỏ qua (bài học M45).
    const problem = JSON.parse(
      await readFile(join('packages/content/problems', 'equation-moves-that-lie.json'), 'utf8'),
    ) as Problem;
    const declared = problem.solutions
      .flatMap((s) => s.steps)
      .filter((s) => (s.expects_violation ?? []).includes('no-vanishing-divisor'))
      .map((s) => s.id);

    expect(declared).toEqual(['s1', 'c2', 'end']);
  });

  it('**xanh** ở bước chỉ mang giả thiết về hàm — điều kiện không phải mẫu số', async () => {
    // Bản cũ đỏ ở cả hai bài dưới: chúng có `f tăng ngặt` / `f đơn ánh` trong
    // `conditions`, và không có phân số nào. Một chốt canh mang tên một thứ mà kiểm một
    // thứ khác thì mỗi lần nó đỏ, người đọc học sai lý do.
    for (const id of ['monotone-peels-an-inequality', 'functional-equation-injective']) {
      for (const [stepId, scene] of await scenesOf(id)) {
        expect((nvd as SceneValidator).check(scene).ok, `${id}/${stepId} đỏ oan`).toBe(true);
      }
    }
  });
});
