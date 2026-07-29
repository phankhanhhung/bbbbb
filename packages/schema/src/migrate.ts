import { SCHEMA_VERSION } from './version.js';
import type { ValidationIssue } from './issues.js';

/**
 * Migrate schema (DAT-02).
 *
 * Mỗi migration là một hàm thuần `(problem) → problem` gắn với **một** bước nhảy
 * phiên bản. Chuỗi chúng lại thì nâng được từ bất kỳ phiên bản cũ nào lên hiện
 * tại, và mỗi bước vẫn test được riêng.
 *
 * Không có migration nào đi lùi: hạ phiên bản là chuyện của git, không phải của
 * công cụ. Một hàm hạ cấp sẽ phải đoán xem dữ liệu mới sinh ra thì bỏ đi đâu, và
 * mọi câu trả lời cho câu hỏi đó đều là mất dữ liệu im lặng.
 */
export interface Migration {
  readonly from: string;
  readonly to: string;
  readonly summary: string;
  apply(problem: Record<string, unknown>): Record<string, unknown>;
}

export const MIGRATIONS: readonly Migration[] = [];

export interface MigrateResult {
  readonly problem: Record<string, unknown>;
  /** Các bước đã áp, theo thứ tự — để CLI in ra người dùng đọc được. */
  readonly applied: readonly string[];
  readonly issues: readonly ValidationIssue[];
}

export function migrateProblem(input: Record<string, unknown>): MigrateResult {
  let problem = input;
  const applied: string[] = [];
  const issues: ValidationIssue[] = [];

  let guard = 0;
  for (;;) {
    const version = String(problem['schema_version'] ?? '');
    if (version === SCHEMA_VERSION) break;

    const migration = MIGRATIONS.find((m) => m.from === version);
    if (!migration) {
      issues.push({
        code: 'migrate/no-path',
        severity: 'error',
        message: `Không có đường nâng cấp từ schema_version "${version}" lên ${SCHEMA_VERSION}`,
        path: '/schema_version',
        hint:
          MIGRATIONS.length === 0
            ? 'Chưa có migration nào — schema vẫn ở giai đoạn 0.x, chưa hứa tương thích'
            : `Có migration từ: ${MIGRATIONS.map((m) => m.from).join(', ')}`,
      });
      break;
    }

    problem = migration.apply(problem);
    problem['schema_version'] = migration.to;
    applied.push(`${migration.from} → ${migration.to}: ${migration.summary}`);

    guard += 1;
    if (guard > MIGRATIONS.length + 1) {
      issues.push({
        code: 'migrate/loop',
        severity: 'error',
        message: 'Chuỗi migration quay vòng',
        path: '/schema_version',
      });
      break;
    }
  }

  return { problem, applied, issues };
}

/**
 * DAT-02 — Player đọc được phiên bản hiện tại và **n−1 minor**.
 *
 * Cửa sổ hẹp là có chủ đích: rộng hơn thì mọi nhánh xử lý phiên bản cũ phải sống
 * mãi trong runtime, và chúng không bao giờ được test vì kho đã migrate hết.
 */
export function isReadableVersion(version: string, current = SCHEMA_VERSION): boolean {
  const parsed = parse(version);
  const target = parse(current);
  if (!parsed || !target) return false;

  if (parsed.major !== target.major) return false;
  return parsed.minor === target.minor || parsed.minor === target.minor - 1;
}

function parse(version: string): { major: number; minor: number; patch: number } | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}
