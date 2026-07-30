import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalStringify,
  createContext,
  createRenderer,
  nodeBox,
  type Box,
  type LabelAtlas,
  type SceneBox,
  type SvgNode,
} from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Problem, Scene } from '@combviz/schema';
import { ENGINE_FRAGMENTS, ENGINE_RENDERERS } from '../src/engines.js';

/**
 * `elementBoxes` phải khớp **mực thật**, đo bằng một oracle độc lập.
 *
 * Cám dỗ là kiểm chéo với `hitTest` — nó có sẵn ở cả bảy engine và trông như
 * nghịch đảo. Nhưng nó trả lời câu **khác**: `hitTest` nói "người dùng nghĩ mình
 * đang chạm vào cái gì", và nó cố ý phồng to — đỉnh đồ thị nới $1{,}3$ lần bán
 * kính, `token.id` của bảng incidence phủ **cả hàng**, `set.id` phủ **cả cột**,
 * đống sỏi phủ cả cột chứ không phải từng viên. Buộc hai thứ khớp nhau sẽ ép một
 * trong hai thành sai, và trong thực tế nó ép `elementBoxes` thành sai — vì
 * `hitTest` đã có test và đã có người dùng.
 *
 * Oracle đúng là `nodeBox`: nó suy hộp bao **từ cây đã render**, tức là từ mực
 * thật. Nó không hoàn hảo (từ chối path lệnh tương đối, cung, `scale`), nhưng
 * chỗ nó từ chối là chỗ nó nói "tôi không đọc được" thay vì đoán — nên trong vai
 * oracle, "không đọc được" nghĩa là bỏ qua trường hợp, không phải kết tội.
 *
 * Đây là lý do `packages/render/src/box.ts` **không** bị xoá sau khi engine tự
 * khai hình học: nó là nguồn đối chứng độc lập duy nhất của API mới.
 *
 * **Bất biến phát biểu đúng thứ phía gọi cần: bay tới tâm hộp thì đáp trúng mực.**
 *
 * Hai bản trước đều quá chặt và đều đỏ vì lý do không đáng.
 * "Trùng khít" đỏ vì mực của một ô dãy gồm cả nhãn chỉ số bên dưới — ô cao $10$,
 * mực cao $15$. "Hộp khai nằm trong mực" đỏ vì cột sỏi hẹp hơn ô chứa nó: mực
 * rộng $3$ (bề ngang viên sỏi), ô rộng $10$.
 *
 * Cả hai lần, thứ bị ép sai là `elementBoxes`, và ép nó khai cả phần trang trí
 * lẫn bề ngang từng viên sỏi nghĩa là chép chi tiết layout sang chỗ thứ hai —
 * rồi hai chỗ lệch nhau.
 *
 * Phía gọi chỉ cần **một điểm để bay tới**, và điều kiện duy nhất là điểm ấy nằm
 * trên element chứ không rơi vào chỗ trống. Nên bất biến là: tâm mỗi hộp khai
 * phải nằm trong hộp mực, và phải có hộp khi có mực. Nó vẫn bắt trọn hai lỗi
 * nguy hiểm — "engine quên cài" và "engine trỏ sai chỗ" — mà không đòi engine
 * biết chỗ đặt từng cái nhãn.
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

const scenes = problems
  .flatMap((problem) =>
    problem.solutions.flatMap((solution) =>
      solution.steps.flatMap((step) => {
        const found: { label: string; scene: Scene }[] = [];
        const at = `${problem.id}/${solution.id}/${step.id}`;
        if (step.scene) found.push({ label: at, scene: step.scene });
        if (step.bijection) found.push({ label: `${at}[bijection]`, scene: step.bijection.scene });
        return found;
      }),
    ),
  )
  .filter(({ scene }) => renderer.has(scene.engine));

/** Engine đã cài `elementBoxes` — chỉ những engine ấy mới bị kiểm. */
const covered = new Set(
  ENGINE_RENDERERS.filter((e) => e.elementBoxes !== undefined).map((e) => e.id),
);

function elementIds(scene: Scene): string[] {
  const fragment = ENGINE_FRAGMENTS.find((f) => f.id === scene.engine);
  const explicit = scene.elements.map((e) => (e as { id: string }).id);
  const implicit = fragment ? [...fragment.implicitElementIds(scene)] : [];
  const undrawn = fragment?.undrawnElementIds?.(scene) ?? new Set<string>();
  return [...new Set([...explicit, ...implicit])].filter((id) => !undrawn.has(id));
}

/** Hộp bao của **mọi mực** thuộc về `id`, đo từ cây đã render. */
function inkBox(nodes: readonly SvgNode[], id: string): Box | null {
  let found: Box | null = null;
  const merge = (box: Box | null): void => {
    if (!box) return;
    if (!found) {
      found = box;
      return;
    }
    const x = Math.min(found.x, box.x);
    const y = Math.min(found.y, box.y);
    found = {
      x,
      y,
      width: Math.max(found.x + found.width, box.x + box.width) - x,
      height: Math.max(found.y + found.height, box.y + box.height) - y,
    };
  };

  const walk = (list: readonly SvgNode[]): void => {
    for (const node of list) {
      // Chỉ node **mang mực**: tay cầm `fill: 'none'` là chỗ bám cho halo, không
      // phải hình mà người xem thấy, nên gộp nó vào sẽ thổi hộp bao ra quá tay.
      const owns = node.attrs['data-el'] === id || node.key === id;
      if (owns && node.attrs['fill'] !== 'none') merge(nodeBox(node));
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return found;
}

const SLACK = 1e-6;

/** Tâm của `box` có rơi vào `target` không (cho phép chạm mép). */
function centreInside(box: SceneBox, target: Box): boolean {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return (
    cx >= target.x - SLACK &&
    cx <= target.x + target.width + SLACK &&
    cy >= target.y - SLACK &&
    cy <= target.y + target.height + SLACK
  );
}

describe('elementBoxes khớp mực thật', () => {
  it('có engine nào đó đã cài — test này vô nghĩa nếu chưa', () => {
    expect(covered.size).toBeGreaterThan(0);
  });

  for (const { label, scene } of scenes) {
    if (!covered.has(scene.engine)) continue;

    it(label, () => {
      const ctx = createContext(defaultTheme, { patterns: true, labels: ATLAS });
      const nodes = renderer.render(scene, ctx);
      const wrong: string[] = [];

      for (const id of elementIds(scene)) {
        const declared = renderer.boxesOf(scene, id, ctx);
        const ink = inkBox(nodes, id);

        // `nodeBox` không đọc được hình này (path lệnh tương đối, cung...) —
        // không kết tội, vì oracle im lặng không phải là bằng chứng.
        if (!ink) continue;

        if (declared.length === 0) {
          wrong.push(`${id}: engine khai rỗng nhưng có mực ở ${canonicalStringify(ink)}`);
          continue;
        }
        for (const box of declared) {
          if (!centreInside(box, ink)) {
            wrong.push(
              `${id}: tâm hộp khai ${canonicalStringify(box)} rơi ngoài mực ${canonicalStringify(ink)}`,
            );
          }
        }
      }

      expect(wrong, wrong.join('\n')).toEqual([]);
    });
  }
});
