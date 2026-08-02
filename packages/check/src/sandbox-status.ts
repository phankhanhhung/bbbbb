import type { Problem } from '@combviz/schema';

/**
 * **Bài này có nợ một sandbox không** — một câu trả lời, hai người hỏi.
 *
 * ## Vì sao nó phải là một hàm, không phải hai chỗ cùng nhớ
 *
 * DoD Phase 1 §15.1 đòi *"100% bài có sandbox + validator"*, và hai cổng đọc câu ấy:
 * `lint/no-sandbox` (chặn lúc `validate`) và tiêu chí *"Sandbox dùng được"* của
 * `combviz coverage`. Trước lượt này chúng là **hai bản chép tay**, và chú thích của
 * bản trong `lint.ts` khẳng định chúng đồng bộ:
 *
 * > *"Bài khai `illustration` được miễn sandbox, đúng như `combviz coverage` đã miễn
 * > từ M9. Hai luật cùng một kho mà nói ngược nhau thì một trong hai sẽ bị bỏ qua."*
 *
 * Câu ấy đúng cho `illustration` và **sai cho bài chơi được**: mệnh đề miễn `playable`
 * thêm vào lint ở M78 mà không thêm vào coverage. Đo được ở lượt soát 2026-08-02:
 * `pnpm validate` xanh tuyệt đối trong khi `combviz coverage` báo đỏ **7 bài** —
 * `chomp-poison-corner`, `chomp-two-rows-staircase`, `geography-path-parity`,
 * `geography-token-on-graph`, `hackenbush-blue-red-halves`, `hackenbush-one-stalk-half`,
 * `nim-two-piles-mirror` — cả bảy đều là bài chơi được.
 *
 * Nên chú thích ấy tự nó là ví dụ cho điều nó cảnh báo. Cách duy nhất làm nó thành thật
 * là hai cổng gọi **một** hàm; giữ hai bản rồi hứa sẽ nhớ sửa cả hai là hứa lại đúng
 * lời hứa vừa gãy.
 *
 * ## Ba cửa, và một chỗ chặt hơn bản cũ
 *
 * `'exempt-illustration'` và `'exempt-playable'` không phải cửa lách: cả hai là **tuyên
 * bố của tác giả** rằng thao tác có nghĩa của bài nằm ở chỗ khác — hoặc không có, hoặc
 * là chính ván cờ. Ép sandbox lên chúng chỉ đẻ ra đồ chơi cho đủ chỉ tiêu, mà một
 * sandbox không ai muốn nghịch còn tệ hơn không có sandbox.
 *
 * `'has-sandbox'` đòi **phản hồi bằng máy** — ít nhất một validator hoặc một `goal_expr`
 * — chứ không chỉ đòi trường `sandbox` có mặt. Đây là chỗ hàm này chặt hơn bản cũ của
 * `lint.ts`, và nó lấy đúng định nghĩa của `coverage.ts` vì định nghĩa ấy đúng hơn: một
 * `sandbox: {}` cho người học một hộp cát không ai chấm, tức đúng thứ DoD muốn tránh.
 * Kho hôm nay không có bài nào như thế, nên hợp nhất **không** đổi kết quả bài nào —
 * đo trước khi sửa, không đoán.
 */
export type SandboxStatus =
  | 'exempt-illustration'
  | 'exempt-playable'
  | 'has-sandbox'
  | 'missing';

export function sandboxStatus(problem: Problem): SandboxStatus {
  if ((problem.kind ?? 'illustration') === 'illustration') return 'exempt-illustration';

  // Bài **chơi được** (GM-01) có thao tác có nghĩa — thao tác ấy là *ván cờ*. Không có
  // cửa này thì bài Chomp đầu tiên bị đòi thêm một sandbox bên cạnh một ván chơi hoàn
  // chỉnh, và hai lối cùng đòi người học "nghịch đi" ở hai chỗ khác nhau.
  if (problem.solutions.some((s) => s.steps.some((step) => step.play !== undefined))) {
    return 'exempt-playable';
  }

  const sandbox = problem.sandbox;
  if ((sandbox?.validators?.length ?? 0) > 0 || sandbox?.goal_expr !== undefined) {
    return 'has-sandbox';
  }
  return 'missing';
}

/** Bài này **đạt** đòi hỏi sandbox của DoD §15.1 — miễn cũng là đạt. */
export const sandboxSatisfied = (problem: Problem): boolean =>
  sandboxStatus(problem) !== 'missing';
