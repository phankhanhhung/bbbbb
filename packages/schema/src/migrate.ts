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

export const MIGRATIONS: readonly Migration[] = [
  {
    from: '0.1.0',
    to: '0.2.0',
    summary: 'thêm Step.choreography (optional) — không đổi dữ liệu, chỉ đóng dấu phiên bản',
    /**
     * Migration **không đổi gì**, và nó vẫn phải tồn tại.
     *
     * Thêm một trường optional thì bài cũ đã hợp lệ sẵn ở schema mới. Cám dỗ là
     * bỏ qua hẳn bước nhảy: cứ để kho ở `0.1.0` và nới `isReadableVersion`.
     * Nhưng thế thì `schema_version` trong file thôi không còn cho biết file ấy
     * đã đi qua những bước nào — và đó là toàn bộ công dụng của nó. Một bước
     * nhảy đồng nhất là rẻ; một kho mà phiên bản không nói lên sự thật thì không.
     */
    apply: (problem) => problem,
  },
  {
    from: '0.2.0',
    to: '0.3.0',
    summary:
      'thêm cell_overrides[].strike của board (BD-10, optional) — không đổi dữ liệu, chỉ đóng dấu phiên bản',
    /**
     * Lại một bước nhảy đồng nhất, và lý do y hệt bước trước: `cell_overrides`
     * đóng (`additionalProperties: false`), nên một file dùng `strike` mà vẫn
     * mang dấu `0.2.0` sẽ bị chính schema `0.2.0` từ chối. Con dấu phải nói đúng
     * về file nó đóng.
     */
    apply: (problem) => problem,
  },
  {
    from: '0.3.0',
    to: '1.0.0',
    summary:
      'freeze G-C (2026-08-01) — schema 1.0.0; gỡ widget_state/assets (0 người dùng), không đổi dữ liệu bài nào',
    /**
     * Bước nhảy **major đầu tiên**, và vẫn là một hàm đồng nhất: hai trường bị
     * gỡ (`widget_state`, `assets`) có đúng 0 người dùng trong kho, nên không
     * file nào phải sửa gì. Major không phải vì dữ liệu đổi — mà vì **lời hứa**
     * đổi: từ đây trở đi mọi thay đổi schema tốn một migration, cửa sổ đọc của
     * Player là `1.0`/n−1 minor, và `0.x` nằm ngoài cửa sổ vĩnh viễn. File cũ
     * đi qua đây là đi qua điểm không quay lại — đúng nghĩa của G-C.
     */
    apply: (problem) => problem,
  },
  {
    from: '1.0.0',
    to: '1.1.0',
    summary:
      'thêm element `path` của board (BD-11) — không đổi dữ liệu bài nào, chỉ đóng dấu phiên bản',
    /**
     * **Minor đầu tiên sau freeze**, và bài kiểm tra thật của bộ máy này: từ
     * `1.0.0` trở đi, mỗi thay đổi schema *phải* đi qua đây, và toàn kho phải
     * đóng dấu lại được bằng một lệnh.
     *
     * Vẫn đồng nhất, và lần này lý do khác ba lần trước: element mới là một
     * **biến thể mới của union**, nên mọi file cũ vẫn hợp lệ ở schema mới —
     * không như `cell_overrides` vốn đóng (`additionalProperties: false`) và
     * bắt buộc phải bump. Nhưng con dấu vẫn phải đổi, vì một file dùng `path`
     * mà mang dấu `1.0.0` sẽ bị chính schema `1.0.0` từ chối, và người đọc file
     * không có cách nào khác để biết nó cần bộ đọc nào.
     *
     * Chuyển động thật của bước này nằm ở chỗ khác: cửa sổ đọc **trượt**. Từ
     * đây `0.3.0` ra khỏi cửa sổ, và một file mang dấu ấy phải bị `validate`
     * chặn ở cửa với `version/unreadable` chứ không đi tiếp vào Player.
     */
    apply: (problem) => problem,
  },
  {
    from: '1.1.0',
    to: '1.2.0',
    summary: 'thêm khối `step.play` (GM-01/02) — không đổi dữ liệu bài nào, chỉ đóng dấu phiên bản',
    /**
     * Đồng nhất, cùng lý do với `1.1.0`: `play` là trường **optional** trên `Step`, nên
     * mọi file cũ vẫn hợp lệ ở schema mới. Con dấu vẫn phải đổi, vì một file có `play`
     * mà mang dấu `1.1.0` sẽ bị chính schema `1.1.0` từ chối (`additionalProperties:
     * false` trên `Step`), và người đọc file không có cách nào khác để biết nó cần bộ
     * đọc nào.
     */
    apply: (problem) => problem,
  },
];

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
