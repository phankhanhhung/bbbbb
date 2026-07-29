import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tryEvaluate, DETERMINISTIC_BUDGET } from '@combviz/dsl';
import type { Problem } from '@combviz/schema';
import { ENGINE_DSL } from '../engines.js';

/**
 * `combviz eval` — chạy một biểu thức DSL trên **từng step** của một bài.
 *
 * Sinh ra từ việc soạn 6 bài ở M7. Câu hỏi lặp lại nhiều nhất khi soạn không
 * phải "file có hợp lệ không" (validate trả lời rồi) mà là **"hình có đúng thứ
 * tôi vừa viết trong narrative không"** — bàn cờ $5\\times5$ thật sự có $13$ ô
 * màu 1 chứ? năm quân tromino kia thật sự phủ kín chứ?
 *
 * Không có lệnh này thì cách duy nhất là đọc lại JSON bằng mắt, mà đó chính là
 * cách sinh ra loại lỗi tệ nhất của kho: narrative nói một đằng, hình nói một
 * nẻo, và cả hai đều "hợp lệ".
 *
 * Dùng `DETERMINISTIC_BUDGET`: kết quả không được phụ thuộc vào máy đang bận hay
 * rảnh.
 */
export interface EvalOptions {
  root: string;
  problemId: string;
  expressions: readonly string[];
}

export async function runEval(options: EvalOptions): Promise<number> {
  const path = join(options.root, 'problems', `${options.problemId}.json`);
  const problem = JSON.parse(await readFile(path, 'utf8')) as Problem;

  // Không có biểu thức nào ⇒ chạy chính các invariant của bài. Đó là mặc định
  // hữu ích nhất: invariant là thứ tác giả đã tuyên bố là bất biến, nên nhìn nó
  // đổi theo từng step là cách nhanh nhất thấy mình sai chỗ nào.
  const declared = (problem.invariants ?? []).map((i) => ({ label: i.id, expr: i.expr }));
  const extra = options.expressions.map((expr) => ({ label: expr, expr }));
  const all = [...declared, ...extra];

  if (all.length === 0) {
    console.log('Bài không khai invariant nào; truyền biểu thức để chạy.');
    return 0;
  }

  let failures = 0;

  for (const solution of problem.solutions) {
    console.log(`# ${solution.id}`);
    for (const step of solution.steps) {
      if (!step.scene) {
        console.log(`  ${step.id.padEnd(4)} (không có scene)`);
        continue;
      }

      const engine = ENGINE_DSL[step.scene.engine];
      if (!engine) {
        console.log(`  ${step.id.padEnd(4)} (engine "${step.scene.engine}" chưa nạp)`);
        continue;
      }

      const env = engine.environment(step.scene);
      const parts = all.map(({ label, expr }) => {
        const outcome = tryEvaluate(expr, env, DETERMINISTIC_BUDGET);
        if (!outcome.ok) {
          failures += 1;
          return `${label} = LỖI(${outcome.error})`;
        }
        return `${label} = ${String(outcome.value)}`;
      });

      console.log(`  ${step.id.padEnd(4)} ${parts.join('   ')}`);
    }
  }

  return failures;
}
