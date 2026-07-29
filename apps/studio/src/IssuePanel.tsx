import type { ValidationIssue } from '@combviz/schema';

/**
 * Bảng lỗi với click-to-jump (AUT-04).
 *
 * `path` của mỗi issue là JSON Pointer, nên chỗ hỏng luôn trỏ được tới một step
 * cụ thể. Đó là lý do mọi check trong `packages/check` bị buộc phải điền `path`:
 * một lỗi không chỉ ra được chỗ hỏng thì trong Studio nó chỉ là một dòng chữ đỏ
 * làm người soạn hoang mang.
 */
interface IssuePanelProps {
  issues: readonly ValidationIssue[];
  onJump: (pointer: string) => void;
}

export function IssuePanel({ issues, onJump }: IssuePanelProps) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return (
    <section class="panel">
      <h2>
        Kiểm{' '}
        <span class={`count${errors.length > 0 ? ' count--bad' : ' count--ok'}`}>
          {errors.length} lỗi · {warnings.length} cảnh báo
        </span>
      </h2>

      {issues.length === 0 ? (
        <p class="hint">Sạch. Cùng bộ luật mà CI chạy (AUT-04).</p>
      ) : (
        <ul class="issues">
          {[...errors, ...warnings].map((issue, i) => (
            <li key={i} class={`issue issue--${issue.severity}`}>
              <button class="issue__jump" onClick={() => onJump(issue.path)}>
                {issue.message}
              </button>
              <p class="issue__meta">
                <code>{issue.path || '/'}</code> · {issue.code}
              </p>
              {issue.hint ? <p class="issue__hint">{issue.hint}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Đọc `solutionId`/`stepId` từ một JSON Pointer dạng
 * `/solutions/0/steps/3/anchors/a1`.
 *
 * Trả `null` cho lỗi ở mức problem (`/license`, `/topics/0`): những lỗi đó không
 * thuộc step nào, và nhảy đại tới một step sẽ khiến người soạn đi tìm lỗi ở sai
 * chỗ.
 */
export function pointerToStep(
  pointer: string,
): { solutionIndex: number; stepIndex: number } | null {
  const match = /^\/solutions\/(\d+)\/steps\/(\d+)/.exec(pointer);
  if (!match) return null;
  return { solutionIndex: Number(match[1]), stepIndex: Number(match[2]) };
}
