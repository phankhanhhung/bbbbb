import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createContext, createRenderer } from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { Problem, Step } from '@combviz/schema';
import { ENGINE_RENDERERS } from '../engines.js';

/**
 * REN-01 — render một Scene ra SVG **không cần browser**.
 *
 * Đây là chỗ cược kiến trúc số 3 được thanh toán: lệnh này chạy trong Node, dùng
 * đúng `boardRenderer` mà Player dùng, không có bản sao nào. Nếu renderer từng
 * lén đọc `document`, lệnh này sẽ nổ — và nó nổ ngay ở M1, chứ không phải ở M6
 * khi OG card đã nằm trong lịch phát hành.
 */
export interface RenderOptions {
  root: string;
  problemId: string;
  solutionId?: string;
  stepId?: string;
  out?: string;
  patterns: boolean;
  width?: number;
}

export async function runRender(options: RenderOptions): Promise<string> {
  const path = join(options.root, 'problems', `${options.problemId}.json`);
  const problem = JSON.parse(await readFile(path, 'utf8')) as Problem;

  const solution =
    (options.solutionId
      ? problem.solutions.find((s) => s.id === options.solutionId)
      : problem.solutions[0]) ?? null;
  if (!solution) {
    throw new Error(`Không tìm thấy solution "${options.solutionId}" trong bài này`);
  }

  const step = pickStep(solution.steps, options.stepId);
  if (!step?.scene) {
    throw new Error(
      `Step "${options.stepId ?? '(mặc định)'}" không có scene để render`,
    );
  }

  const renderer = createRenderer(ENGINE_RENDERERS);
  if (!renderer.has(step.scene.engine)) {
    throw new Error(`Chưa có renderer cho engine "${step.scene.engine}"`);
  }

  const ctx = createContext(defaultTheme, { patterns: options.patterns });
  const viewport = renderer.viewportOf(step.scene);
  const width = options.width ?? 720;

  const svg = renderer.toSvg(step.scene, ctx, {
    width,
    height: Math.round((width * viewport.height) / viewport.width),
  });

  if (options.out) await writeFile(options.out, `${svg}\n`, 'utf8');
  return svg;
}

/**
 * Mặc định lấy step cuối của **nhánh chính** — đường đi từ gốc chỉ theo `seq`.
 *
 * Cùng quy tắc mà REN-02 dùng khi bài không khai `og_step_ref`: ảnh đại diện nên
 * là kết cục của lập luận chính, không phải một nhánh phản chứng nào đó tình cờ
 * đứng cuối mảng.
 */
function pickStep(steps: readonly Step[], stepId?: string): Step | undefined {
  if (stepId) return steps.find((s) => s.id === stepId);

  const byParent = new Map<string | null, Step[]>();
  for (const step of steps) {
    const list = byParent.get(step.parent) ?? [];
    list.push(step);
    byParent.set(step.parent, list);
  }

  let current = steps.find((s) => s.parent === null);
  while (current) {
    const next = (byParent.get(current.id) ?? []).find((s) => s.edge_type === 'seq');
    if (!next) break;
    current = next;
  }
  return current;
}
