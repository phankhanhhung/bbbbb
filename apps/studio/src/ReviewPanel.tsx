import { buildTree, preorder, type Problem, type Step } from '@combviz/schema';

/**
 * Chế độ duyệt từng step (AUT-09 bước 4) — **răng** của cổng khoá publish.
 *
 * Đây là chỗ trách nhiệm chuyển từ máy sang người. Máy đã kiểm được: schema đúng,
 * anchor không rot, invariant eval được, validator chạy. Máy **không** kiểm được
 * điều duy nhất thật sự quan trọng: lập luận ở step này có đúng không.
 *
 * Vì vậy giao diện cố ý làm việc đánh dấu thành một hành động **từng step một**,
 * không có nút "duyệt tất cả". R-8 nói sai một bước là chết uy tín với khán giả
 * oly, và một nút duyệt-hàng-loạt là lời mời đúng nghĩa để phạm đúng lỗi đó.
 */
interface ReviewPanelProps {
  problem: Problem;
  currentStepId: string | null;
  onSelect: (solutionId: string, stepId: string) => void;
  onToggleVerified: (solutionId: string, stepId: string, verified: boolean) => void;
  onPublish: () => void;
}

export function ReviewPanel({
  problem,
  currentStepId,
  onSelect,
  onToggleVerified,
  onPublish,
}: ReviewPanelProps) {
  const rows = problem.solutions.flatMap((solution) =>
    preorder(buildTree(solution)).map((step) => ({ solution: solution.id, step })),
  );

  const total = rows.length;
  const done = rows.filter(({ step }) => step.verified === true).length;
  const ready = done === total && total > 0;

  return (
    <section class="panel">
      <h2>
        Duyệt <span class="count">{done}/{total}</span>
      </h2>

      <p class="hint">
        Máy đã kiểm schema, anchor, invariant và validator. Phần lập luận là của
        người duyệt — đi từng bước.
      </p>

      <ol class="review">
        {rows.map(({ solution, step }) => (
          <li
            key={`${solution}/${step.id}`}
            class={`review__row${step.id === currentStepId ? ' is-current' : ''}`}
          >
            <input
              type="checkbox"
              checked={step.verified === true}
              aria-label={`Đã duyệt ${step.id}`}
              onChange={(event) =>
                onToggleVerified(
                  solution,
                  step.id,
                  (event.currentTarget as HTMLInputElement).checked,
                )
              }
            />
            <button class="review__label" onClick={() => onSelect(solution, step.id)}>
              <span class="review__id">{step.id}</span>
              <span class="review__text">{summarise(step)}</span>
            </button>
          </li>
        ))}
      </ol>

      {/* Thứ tự nhánh quan trọng: "còn bước chưa duyệt" phải thắng "đã published".
          Một bài published mà còn step chưa duyệt là trạng thái **hỏng** — validate
          báo đỏ đúng như vậy — nên nút không được nói "xong rồi". */}
      <button class="primary" disabled={!ready || problem.status === 'published'} onClick={onPublish}>
        {!ready
          ? `Còn ${total - done} bước chưa duyệt`
          : problem.status === 'published'
            ? 'Đã published'
            : 'Đánh dấu published'}
      </button>

      {!ready && problem.status === 'published' ? (
        <p class="error">
          Bài đang ở <code>published</code> nhưng còn bước chưa duyệt. Duyệt nốt,
          hoặc đổi <code>status</code> về <code>draft</code>.
        </p>
      ) : null}
    </section>
  );
}

function summarise(step: Step): string {
  if (step.edge_type === 'merge_ref') return `↰ về ${step.merge_target ?? '?'}`;
  const text = step.case_label?.vi ?? step.narrative?.vi ?? '';
  const plain = text.replace(/\[\[[a-z0-9_]+\|([\s\S]*?)\]\]/g, '$1').replace(/\$/g, '');
  return plain.length > 64 ? `${plain.slice(0, 63)}…` : plain;
}
