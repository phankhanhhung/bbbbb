export type Severity = 'error' | 'warning';

/**
 * Một phát hiện của `validate` (AUT-04).
 *
 * `path` là JSON Pointer trỏ đúng vị trí trong file — đây là thứ Studio dùng để
 * click-to-jump và CI dùng để in ra chỗ hỏng. Mọi check phải điền được nó; check
 * nào không chỉ ra được chỗ hỏng thì chưa xong.
 */
export interface ValidationIssue {
  readonly code: string;
  readonly severity: Severity;
  readonly message: string;
  readonly path: string;
  /** Câu gợi ý cách sửa. Có thì lỗi dạy được, không thì lỗi chỉ để mắng. */
  readonly hint?: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

export function formatIssue(issue: ValidationIssue, file?: string): string {
  const mark = issue.severity === 'error' ? 'LỖI ' : 'CẢNH';
  const where = file ? `${file}${issue.path}` : issue.path || '/';
  const hint = issue.hint ? `\n         → ${issue.hint}` : '';
  return `  ${mark}  ${where}\n         ${issue.message} [${issue.code}]${hint}`;
}
