import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Problem, Scene, SceneValidator } from '@combviz/schema';
import { applyRule, readAlgebra, allPaths, applicableRules, algebraEnvironment } from '@combviz/engine-algebra';
import { tryEvaluate } from '@combviz/dsl';
import { ENGINE_FRAGMENTS } from '../src/engines.js';

/**
 * **Mỗi validator một bài khai ra phải **cắn được** ít nhất một thế** — bản tổng quát
 * của một bài học đã lặp **bốn** lần.
 *
 * | lượt | chốt canh | vì sao nó luôn xanh |
 * |---|---|---|
 * | M59 | `claim` cho hệ | bốc điểm không phân biệt hai đẳng thức |
 * | AL-21 | `impliesSolutionSet` cho AM–GM | phản ví dụ nằm ngoài miền bốc |
 * | AL-23 | `reaches:` | chưa bài nào gọi, nên chưa ai kiểm |
 * | AL-25 | `each-step-sound` | `applyRule` đã chặn trước, `unsound` là lỗi *engine* |
 *
 * Bốn lần, bốn nguyên nhân khác nhau, **một** hình dạng: một chốt canh luôn xanh là một
 * chốt canh không có, và không phép bẻ răng nào bắt được nó — bẻ răng đo chốt canh đang
 * có, nó không đo được chốt canh *thiếu*.
 *
 * ## Hai cách hỏi, và vì sao không dùng một
 *
 * **Đại số hỏi bằng tập nước thật.** `movesAtElement` + `applyRule` cho **đúng** tập thế
 * người học tới được — chính xác, không lấy mẫu. Đó là lý do kết luận về
 * `each-step-sound` là một *phát hiện* chứ không phải một *nghi ngờ*.
 *
 * **Engine khác hỏi bằng nhiễu loạn scene**, vì chúng không có `movesAtElement`. Và ở
 * đây có một cái bẫy đã suýt sập, ghi lại vì nó là bài học của chính lượt này:
 *
 * ```
 * bộ nhiễu loạn                                     cặp "không đỏ được"
 * xoá · +1 · lật boolean                                    46 / 97
 * + nhân đôi element · trỏ id sang element khác             17 / 97
 * + phủ định số · dời toạ độ                                12 / 97
 * ```
 *
 * Con số ấy **đo bộ nhiễu loạn nhiều hơn đo chốt canh**. `simple-graph` chiếm 11 trong
 * 46 chỉ vì bộ đầu không biết nhân đôi một cạnh; thêm đúng một kiểu là nó đỏ. Nên một
 * cổng đỏ thẳng cho mọi cặp chưa tìm được sẽ đỏ vì **lỗi của chính nó**, và một cổng như
 * thế bị tắt trong một tuần.
 *
 * ## Nên nó dùng khuôn `expects_violation`: khai ngoại lệ, và khai thừa cũng đỏ
 *
 * `KNOWN_QUIET` liệt kê từng cặp mà bộ nhiễu loạn hôm nay **chưa** làm đỏ được, kèm lý
 * do. Hai chiều đều đỏ:
 *
 * - cặp **không** trong danh sách mà không đỏ được ⇒ đỏ. Đây là phần gánh việc: một
 *   validator mới không cắn được thì biết ngay.
 * - cặp **trong** danh sách mà nay đỏ được ⇒ cũng đỏ. Không có vế này thì danh sách chỉ
 *   dài ra, không bao giờ ngắn lại, và nó thành chỗ trốn thay vì sổ nợ.
 */

const PROBLEMS = 'packages/content/problems';

/** Bao nhiêu nước là "vài nước". Ba: đủ cho một đường vòng, chưa đủ để thành bộ giải. */
const GOAL_DEPTH = 3;
const fragmentOf = new Map(ENGINE_FRAGMENTS.map((f) => [f.id, f]));

/**
 * Cặp (bài × validator) mà **bộ nhiễu loạn hôm nay** chưa dựng nổi một thế đỏ.
 *
 * Đây là **sổ nợ của bộ nhiễu loạn**, không phải danh sách chốt canh vô nghĩa — phân
 * biệt ấy là cả điểm của §3b.3. Mỗi dòng ghi thứ còn thiếu để lần sau ai đó gỡ được.
 */
const KNOWN_QUIET: Readonly<Record<string, string>> = {
  // Quân đi chéo / đi hình chữ L: dời toạ độ mù thì gần như luôn rơi vào ô không ai
  // chiếu ai. Xe và hậu thì khác — chúng chiếm cả hàng và cột, nên `+1` trúng ngay, và
  // đó đúng là lý do hai bài xe/hậu **không** có mặt ở đây.
  'bishop-keeps-colour :: no-attacks': 'cần dời quân vào đúng đường chéo',
  'knight-closed-tour-5x5 :: no-attacks': 'cần dời quân vào đúng nước mã',
  // Ràng buộc trên **quan hệ giữa hai element**, không trên một element: cần dựng hai
  // tập trùng nhau, mà nhân đôi element chỉ đẻ ra một tập mang tên khác.
  'erdos-ko-rado-pairs :: sets-distinct': 'cần hai tập trùng nhau, không phải một tập lạ',
};

interface Perturb {
  readonly name: string;
  make(scene: Scene): Scene[];
}

/**
 * Từ vựng nhiễu loạn — **khai theo kiểu dữ liệu, không theo engine**, và đó là một
 * lựa chọn có giá đọc được.
 *
 * Khai theo engine thì đúng hơn nhưng mỗi engine phải nhớ tự cập nhật, tức lại là chín
 * bản chép tay cho một câu hỏi — đúng thứ §3b.1 vừa gỡ. Khai theo kiểu dữ liệu thì một
 * bộ chạy cho cả chín, và chỗ nó **không** với tới thì `KNOWN_QUIET` nói ra bằng chữ.
 */
const VOCABULARY: readonly Perturb[] = [
  {
    name: 'xoá element',
    make: (s) => s.elements.map((_, i) => withEls(s, s.elements.filter((__, j) => j !== i))),
  },
  {
    name: 'nhân đôi element',
    make: (s) =>
      s.elements.map((e, i) =>
        withEls(s, [...s.elements, { ...(e as object), id: `${idOf(e)}-dup${i}` }]),
      ),
  },
  {
    // `+0.5` không phải trang trí: `values-integer` chỉ đỏ trước một số **không
    // nguyên**, nên một bộ chỉ biết cộng số nguyên thì mù hẳn với nó. Cổng này tìm ra
    // đúng chỗ ấy ở lượt chạy đầu tiên.
    name: 'số: ±1, phủ định, phân số, ngoài miền',
    make: (s) =>
      fields(s, (v) => (typeof v === 'number' ? [v + 1, -Math.abs(v) - 1, v + 0.5, 999] : null)),
  },
  { name: 'lật boolean', make: (s) => fields(s, (v) => (typeof v === 'boolean' ? [!v] : null)) },
  {
    name: 'dời toạ độ',
    make: (s) =>
      fields(s, (v) =>
        Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number')
          ? [v.map((x: number) => x + 1), v.map(() => 0), v.map(() => 99)]
          : null,
      ),
  },
  {
    name: 'trỏ id sang element khác',
    make: (s) => {
      const ids = s.elements.map(idOf).filter(Boolean);
      return fields(s, (v) =>
        typeof v === 'string' && ids.includes(v) ? ids.filter((o) => o !== v).slice(0, 3) : null,
      );
    },
  },
];

const idOf = (e: unknown): string => String((e as { id?: unknown }).id ?? '');
const withEls = (s: Scene, elements: unknown[]): Scene =>
  ({ ...s, elements }) as unknown as Scene;

/** Mọi element × mọi trường × mọi giá trị thay thế mà `alt` đề xuất. */
function fields(scene: Scene, alt: (v: unknown) => unknown[] | null): Scene[] {
  const out: Scene[] = [];
  scene.elements.forEach((e, i) => {
    for (const [k, v] of Object.entries(e as object)) {
      if (k === 'id' || k === 'type') continue;
      for (const replacement of alt(v) ?? []) {
        out.push(
          withEls(
            scene,
            scene.elements.map((x, j) => (j === i ? { ...(x as object), [k]: replacement } : x)),
          ),
        );
      }
    }
  });
  return out;
}

/**
 * Thế mà người học **thật sự** tới được từ `scene` — chỉ engine đại số trả lời được câu
 * này, và nó trả lời chính xác chứ không lấy mẫu.
 */
function algebraStates(scene: Scene): Scene[] {
  const model = readAlgebra(scene);
  const last = model.rows.at(-1);
  if (last === undefined || model.refusal !== null) return [];

  const out: Scene[] = [];
  for (const [path, node] of allPaths(last.expr)) {
    for (const rule of applicableRules(node)) {
      const next = applyRule(scene, { rule: rule.id, at: path });
      if (!('refusal' in next) && readAlgebra(next).refusal === null) out.push(next);
    }
  }
  return out;
}

const statesFrom = (scene: Scene): Scene[] =>
  scene.engine === 'algebra'
    ? algebraStates(scene)
    : VOCABULARY.flatMap((p) => p.make(scene)).slice(0, 240);

async function bank(): Promise<Problem[]> {
  const out: Problem[] = [];
  for (const name of await readdir(PROBLEMS)) {
    if (!name.endsWith('.json')) continue;
    out.push(JSON.parse(await readFile(join(PROBLEMS, name), 'utf8')) as Problem);
  }
  return out;
}

/** Có thế nào làm `validator` đỏ không — kể cả chính scene tác giả soạn. */
function bites(validator: SceneValidator, scenes: readonly Scene[]): boolean {
  for (const scene of scenes) {
    try {
      if (!validator.check(scene).ok) return true;
    } catch {
      /* nhiễu loạn dựng ra scene vô nghĩa là chuyện thường — không tính là đỏ */
    }
    for (const state of statesFrom(scene)) {
      try {
        if (!validator.check(state).ok) return true;
      } catch {
        /* như trên */
      }
    }
  }
  return false;
}

describe('mỗi validator một bài khai ra phải cắn được (§3b.3)', () => {
  it('không cặp (bài × validator) nào luôn xanh mà chưa được khai', async () => {
    const quiet: string[] = [];
    const rescued: string[] = [];

    for (const problem of await bank()) {
      const ids = problem.sandbox?.validators ?? [];
      if (ids.length === 0) continue;

      const scenes = problem.solutions
        .flatMap((s) => s.steps)
        .map((s) => s.scene)
        .filter((s): s is Scene => s !== undefined);

      for (const id of ids) {
        const engines = new Set(scenes.map((s) => s.engine));
        const validator = [...engines]
          .map((e) => fragmentOf.get(e)?.resolveValidator(id) ?? null)
          .find((v): v is SceneValidator => v !== null);
        if (!validator) continue;

        const key = `${problem.id} :: ${id}`;
        const bit = bites(validator, scenes);
        if (!bit && KNOWN_QUIET[key] === undefined) quiet.push(key);
        if (bit && KNOWN_QUIET[key] !== undefined) rescued.push(key);
      }
    }

    expect(
      quiet,
      `chốt canh không thế nào làm đỏ được — hoặc nó vô nghĩa, hoặc từ vựng nhiễu loạn ` +
        `còn thiếu một kiểu. Cả hai đều phải viết ra:\n  ${quiet.join('\n  ')}`,
    ).toEqual([]);

    expect(
      rescued,
      `khai thừa trong KNOWN_QUIET — nay đã đỏ được, hãy xoá dòng tương ứng:\n  ` +
        `${rescued.join('\n  ')}`,
    ).toEqual([]);
  });

  it('đích của bước: **chưa đạt** lúc mở, và **tới được** trong vài nước', async () => {
    // Đích có đúng hai lỗi gương của validator, và cả hai đều là "chốt canh không có":
    // đã đạt lúc mở ⇒ huy hiệu xanh trước khi ai bấm gì; không ai tới nổi ⇒ luôn đỏ.
    // `combviz validate` đã canh vế thứ nhất (nó rẻ, chạy mọi lần); vế thứ hai cần duyệt
    // nước đi thật nên nó nằm ở đây, cạnh bộ duyệt đã có.
    const unreachable: string[] = [];
    let checked = 0;

    for (const problem of await bank()) {
      for (const sol of problem.solutions) {
        for (const step of sol.steps) {
          const goal = step.sandbox?.goal_expr;
          const opens = step.sandbox?.scene ?? step.scene;
          if (goal === undefined || opens === undefined || opens.engine !== 'algebra') continue;

          checked += 1;
          const met = (sc: Scene): boolean => {
            const out = tryEvaluate(goal, algebraEnvironment(sc));
            return out.ok && out.value === true;
          };
          expect(met(opens), `${problem.id}/${step.id}: đích đã đạt lúc mở`).toBe(false);

          let frontier = [opens];
          let found = false;
          for (let depth = 1; depth <= GOAL_DEPTH && !found; depth += 1) {
            const next: Scene[] = [];
            for (const sc of frontier) {
              for (const after of algebraStates(sc)) {
                if (met(after)) { found = true; break; }
                next.push(after);
              }
              if (found) break;
            }
            frontier = next.slice(0, 400);
          }
          if (!found) unreachable.push(`${problem.id}/${step.id}`);
        }
      }
    }

    expect(checked, 'không bài nào khai đích cho bước — chốt canh này rỗng').toBeGreaterThan(0);
    expect(
      unreachable,
      `đích không tới được trong ${GOAL_DEPTH} nước — người học không xong được bài:\n  ` +
        `${unreachable.join('\n  ')}`,
    ).toEqual([]);
  });

  it('cổng này **biết nói không** — một validator luôn `ok` phải bị gọi tên', async () => {
    // Không có phép này thì cả khối trên có thể xanh vì `bites` luôn trả `true`, và một
    // cổng chỉ biết nói có là đúng thứ nó sinh ra để bắt.
    const always: SceneValidator = {
      id: 'luôn-đạt',
      label: 'luôn đạt',
      check: () => ({ ok: true, violations: [], message: 'không bao giờ đỏ' }),
    };
    const problem = JSON.parse(
      await readFile(join(PROBLEMS, 'equation-moves-that-lie.json'), 'utf8'),
    ) as Problem;
    const scenes = problem.solutions
      .flatMap((s) => s.steps)
      .map((s) => s.scene)
      .filter((s): s is Scene => s !== undefined);

    expect(bites(always, scenes)).toBe(false);
    // Và cùng tập scene ấy thì validator thật **có** đỏ — nên `false` ở trên đúng là
    // tính chất của validator, không phải của tập scene.
    const real = fragmentOf.get('algebra')?.resolveValidator('no-vanishing-divisor');
    expect(bites(real as SceneValidator, scenes)).toBe(true);
  });
});
