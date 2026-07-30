import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalStringify, createContext, createRenderer } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { LabelAtlas, SvgNode } from '@combviz/render';
import type { Problem, Scene } from '@combviz/schema';
import { ENGINE_FRAGMENTS, ENGINE_RENDERERS } from '../src/engines.js';

/**
 * Hợp đồng **danh tính mực** cho toàn kho: "element X được vẽ bằng những gì".
 *
 * Đây là chỗ trống lớn nhất trong lưới test của dự án. Golden snapshot quét cả
 * kho, nhưng nó **mù hoàn toàn với `key`**: `serializeNode` chỉ ghi `attrs`, nên
 * `data-k` không bao giờ vào chuỗi SVG — 0/305 file golden chứa nó. Nghĩa là một
 * element có thể mất sạch danh tính mà mọi test vẫn xanh, và triệu chứng duy
 * nhất là rê chuột vào anchor thì **không có gì sáng lên**.
 *
 * Ba bài đã xuất bản đang mắc đúng lỗi đó, và `validate` báo xanh cả ba, vì id
 * **có tồn tại** — nó chỉ không được vẽ kèm danh tính. `ANC-02` bắt được anchor
 * trỏ tới id không tồn tại; nó không bắt được anchor trỏ tới id có tồn tại mà
 * không vẽ.
 */
const CONTENT = fileURLToPath(new URL('../../../packages/content/problems', import.meta.url));

const renderer = createRenderer(ENGINE_RENDERERS);

const ATLAS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../packages/content/labels.json', import.meta.url)), 'utf8'),
) as LabelAtlas;

const problems = readdirSync(CONTENT, { withFileTypes: true, recursive: true })
  .filter((e) => e.isFile() && e.name.endsWith('.json'))
  .map((e) => JSON.parse(readFileSync(join(e.parentPath ?? CONTENT, e.name), 'utf8')) as Problem)
  .sort((a, b) => a.id.localeCompare(b.id));

/** Mọi scene của kho, kể cả pane phải của step song ánh. */
const scenes = problems.flatMap((problem) =>
  problem.solutions.flatMap((solution) =>
    solution.steps.flatMap((step) => {
      const found: { label: string; scene: Scene }[] = [];
      const at = `${problem.id}/${solution.id}/${step.id}`;
      if (step.scene) found.push({ label: at, scene: step.scene });
      // Pane phải cũng phải có danh tính: `PRN-04` ghép cặp id ↔ id qua **hai**
      // scene, nên một bên mất danh tính thì phép ghép cặp câm ở nửa bàn.
      if (step.bijection) found.push({ label: `${at}[bijection]`, scene: step.bijection.scene });
      return found;
    }),
  ),
).filter(({ scene }) => renderer.has(scene.engine));

/** Element khai tường minh **cộng** element ngầm định sinh từ config. */
function elementIds(scene: Scene): string[] {
  const fragment = ENGINE_FRAGMENTS.find((f) => f.id === scene.engine);
  const explicit = scene.elements.map((e) => (e as { id: string }).id);
  const implicit = fragment ? [...fragment.implicitElementIds(scene)] : [];
  return [...new Set([...explicit, ...implicit])];
}

const render = (scene: Scene, highlight: ReadonlySet<string>): SvgNode[] =>
  renderer.render(scene, createContext(defaultTheme, { patterns: true, labels: ATLAS, highlight }));

/**
 * **Mọi** danh tính mà một node trả lời, kể cả của tổ tiên.
 *
 * Không phải "cái đầu tiên tìm thấy": một node hoàn toàn có thể trả lời cả hai
 * tên cùng lúc, và ô giao của bảng incidence làm đúng thế — `key` là `x1__S`
 * (chính nó), `data-el` là `x1` (phần tử mà nó là mực). Lấy một cái rồi dừng thì
 * cái kia bị báo là chết oan; bản đầu tiên của test này đã vấp đúng chỗ đó và
 * dựng lên 13 scene đỏ giả.
 *
 * Leo lên tổ tiên cũng bắt buộc: `decorationAttrs` cố ý đặt halo lên hình **lá**
 * chứ không lên `<g>` (vì `stroke` kế thừa xuống con), nên node thật sự đổi khi
 * highlight thường là một `rect` không key nằm trong một `<g>` keyed.
 */
function identitiesOf(node: SvgNode, ancestors: readonly SvgNode[]): string[] {
  const out: string[] = [];
  for (const candidate of [node, ...ancestors]) {
    const owner = candidate.attrs['data-el'];
    if (typeof owner === 'string') out.push(owner);
    if (candidate.key !== undefined) out.push(candidate.key);
  }
  return out;
}

/** Duyệt song song hai cây cùng dáng, trả về danh tính của những node đã đổi. */
function changedOwners(before: readonly SvgNode[], after: readonly SvgNode[]): Set<string> {
  const owners = new Set<string>();
  const walk = (a: readonly SvgNode[], b: readonly SvgNode[], ancestors: SvgNode[]): void => {
    const count = Math.max(a.length, b.length);
    for (let i = 0; i < count; i += 1) {
      const x = a[i];
      const y = b[i];
      if (!x || !y) {
        // Highlight chỉ thêm thuộc tính, không thêm bớt node. Lệch số con nghĩa
        // là engine vẽ **khác hẳn** khi có highlight — hiếm, nhưng nếu xảy ra thì
        // quy cả nhánh về tổ tiên còn hơn bỏ qua im lặng.
        for (const id of identitiesOf(x ?? y!, ancestors)) owners.add(id);
        continue;
      }
      if (canonicalStringify(x.attrs) !== canonicalStringify(y.attrs)) {
        for (const id of identitiesOf(y, ancestors)) owners.add(id);
      }
      if (x.children || y.children) {
        walk(x.children ?? [], y.children ?? [], [...ancestors, y]);
      }
    }
  };
  walk(before, after, []);
  return owners;
}

/** Có **bất kỳ** khác biệt nào giữa hai cây không. */
function differs(before: readonly SvgNode[], after: readonly SvgNode[]): boolean {
  return canonicalStringify(before) !== canonicalStringify(after);
}

/**
 * Nợ đã biết, ghi thành **luật** chứ không thành danh sách 314 dòng.
 *
 * Lần chạy đầu tiên của chốt canh này soi ra 314 cặp (scene, id) chết trên 13
 * bài và 4 engine — nhiều hơn hẳn ba lỗi tìm được bằng mắt. Sửa hết trong một
 * commit thì không review nổi, mà để test đỏ thì CI mất tác dụng cảnh báo.
 *
 * Nên nợ nằm ở đây, dưới dạng luật đọc được, và mỗi lần sửa xong một engine thì
 * **xoá một luật**. Test khẳng định cả hai chiều: id chết phải khớp một luật, và
 * mỗi luật phải còn khớp ít nhất một id chết — luật hết tác dụng mà nằm lại là
 * cách một allowlist mục ruỗng thành lời nói dối.
 */
interface DebtRule {
  readonly why: string;
  readonly engine: string;
  readonly view?: RegExp;
  /** Khớp theo `type` của element khai tường minh. */
  readonly type?: string;
  /** Khớp theo chính chuỗi id — dùng cho element ngầm định. */
  readonly id?: RegExp;
}

const DEBT: readonly DebtRule[] = [
  {
    why: 'derivation: element `row` chưa sinh node nào có danh tính',
    engine: 'derivation',
    type: 'row',
  },
  {
    why: 'game: view phổ không vẽ `pile` — `renderPiles` không được gọi',
    engine: 'game',
    view: /^spectrum/,
    type: 'pile',
  },
  {
    why: 'graph/matrix: nhãn đỉnh là `text()` trần, không key/data-el/decoration',
    engine: 'graph',
    view: /^matrix$/,
    type: 'vertex',
  },
  {
    // Ô **trống** (không cạnh nào nối hai đỉnh ấy, kể cả đường chéo). Ô có cạnh
    // thì sáng được, vì nó mang `data-el` là id cạnh — nên luật này không che
    // mất trường hợp nào đang chạy đúng.
    why: 'graph/matrix: ô trống không nhận highlight theo id của chính nó',
    engine: 'graph',
    view: /^matrix$/,
    id: /^mx-/,
  },
  {
    why: 'graph: mặt phẳng (`face-*`) chưa nhận highlight',
    engine: 'graph',
    id: /^face-/,
  },
  {
    why: 'set/dots: set không gọi `decorationAttrs`; token bị truyền id ô giao',
    engine: 'set',
    view: /^dots$/,
  },
];

function debtFor(scene: Scene, id: string): DebtRule | undefined {
  const view = String((scene.config as { view?: unknown } | undefined)?.view ?? '');
  const type = (scene.elements as { id: string; type?: string }[]).find((e) => e.id === id)?.type;
  return DEBT.find(
    (rule) =>
      rule.engine === scene.engine &&
      (rule.view === undefined || rule.view.test(view)) &&
      (rule.type === undefined || rule.type === type) &&
      (rule.id === undefined || rule.id.test(id)),
  );
}

/** Luật nào đã thật sự được dùng — để phát hiện luật mục. */
const used = new Set<string>();

describe('ANC-01 — mọi element phải sáng được', () => {
  it('kho không rỗng — test này vô nghĩa nếu không quét được scene nào', () => {
    expect(scenes.length).toBeGreaterThan(0);
  });

  for (const { label, scene } of scenes) {
    it(label, () => {
      const ids = elementIds(scene);
      if (ids.length === 0) return;

      // Đường nhanh: **hai** lần render cho cả scene thay vì một lần cho mỗi id.
      // Kho có ~5 600 id; cách ngây thơ tốn ~11 000 lần render, tức gần 20 giây
      // thêm vào suite cho một khẳng định mà 2 lần render nói được.
      const base = render(scene, new Set());
      const lit = changedOwners(base, render(scene, new Set(ids)));

      // Đường chậm chỉ chạy cho id khả nghi, và nó hỏi thẳng câu cần hỏi: highlight
      // **một mình** id này thì hình có đổi không. Không cần quy kết cho ai —
      // trong tập highlight chỉ có nó, nên đổi gì cũng là do nó.
      const dead = ids
        .filter((id) => !lit.has(id))
        .filter((id) => !differs(base, render(scene, new Set([id]))));

      const unexpected = dead.filter((id) => {
        const rule = debtFor(scene, id);
        if (rule) used.add(rule.why);
        return !rule;
      });

      expect(
        unexpected,
        `element không sáng lên khi được highlight: ${unexpected.join(', ')}`,
      ).toEqual([]);
    });
  }
});

describe('danh tính mực — mỗi element phải có ít nhất một node nhận nó', () => {
  for (const { label, scene } of scenes) {
    it(label, () => {
      const owned = new Set<string>();
      const walk = (nodes: readonly SvgNode[]): void => {
        for (const node of nodes) {
          const owner = node.attrs['data-el'];
          if (typeof owner === 'string') owned.add(owner);
          if (node.key !== undefined) owned.add(node.key);
          if (node.children) walk(node.children);
        }
      };
      walk(render(scene, new Set()));

      const orphans = elementIds(scene)
        .filter((id) => !owned.has(id))
        .filter((id) => {
          const rule = debtFor(scene, id);
          if (rule) used.add(rule.why);
          return !rule;
        });
      expect(orphans, `element không node nào nhận: ${orphans.join(', ')}`).toEqual([]);
    });
  }
});

describe('bảng nợ không được mục', () => {
  it('mọi luật miễn trừ đều còn khớp ít nhất một id chết thật', () => {
    // Chạy **sau** hai describe trên (vitest giữ thứ tự khai báo trong file), nên
    // `used` đã đầy. Luật nằm lại sau khi engine đã sửa xong là cách một
    // allowlist mục ruỗng thành lời nói dối: nó vẫn tha thứ, chỉ là không còn gì
    // để tha.
    const stale = DEBT.filter((rule) => !used.has(rule.why)).map((rule) => rule.why);
    expect(stale, `luật đã hết tác dụng, xoá đi: ${stale.join(' | ')}`).toEqual([]);
  });
});
