import { describe, expect, it } from 'vitest';
import { isReadableVersion, migrateProblem, MIGRATIONS } from '../src/migrate.js';
import { SCHEMA_VERSION } from '../src/version.js';

describe('DAT-02 — cửa sổ tương thích', () => {
  it('đọc được phiên bản hiện tại', () => {
    expect(isReadableVersion('1.2.0', '1.2.0')).toBe(true);
  });

  it('đọc được minor liền trước', () => {
    expect(isReadableVersion('1.1.9', '1.2.0')).toBe(true);
  });

  it('không đọc được minor cũ hơn nữa', () => {
    // Cửa sổ hẹp là chủ đích: rộng hơn thì mọi nhánh xử lý phiên bản cũ phải sống
    // mãi trong runtime, và chúng không bao giờ được test vì kho đã migrate hết.
    expect(isReadableVersion('1.0.0', '1.2.0')).toBe(false);
  });

  it('không đọc được major khác', () => {
    expect(isReadableVersion('2.0.0', '1.2.0')).toBe(false);
    expect(isReadableVersion('0.9.0', '1.0.0')).toBe(false);
  });

  it('patch không ảnh hưởng', () => {
    expect(isReadableVersion('1.2.7', '1.2.0')).toBe(true);
  });

  it('chuỗi phiên bản hỏng thì không đọc được', () => {
    expect(isReadableVersion('linh tinh')).toBe(false);
    expect(isReadableVersion('1.2')).toBe(false);
  });
});

describe('migrate', () => {
  it('bài đã ở phiên bản hiện tại thì không đổi gì', () => {
    const result = migrateProblem({ schema_version: SCHEMA_VERSION, id: 'x' });

    expect(result.applied).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('phiên bản không có đường nâng cấp thì báo lỗi, không im lặng bỏ qua', () => {
    const result = migrateProblem({ schema_version: '0.0.1', id: 'x' });

    expect(result.issues.map((i) => i.code)).toContain('migrate/no-path');
  });

  it('thiếu hẳn schema_version cũng báo lỗi', () => {
    expect(migrateProblem({ id: 'x' }).issues).toHaveLength(1);
  });

  it('chuỗi migration là một đường thẳng, không có nhánh hay vòng', () => {
    // Hai migration cùng `from` nghĩa là có hai đường nâng cấp khác nhau, và
    // `find` sẽ lặng lẽ chọn cái đầu — kho nâng theo đường nào là chuyện may rủi.
    const froms = MIGRATIONS.map((m) => m.from);
    expect(new Set(froms).size).toBe(froms.length);

    for (const migration of MIGRATIONS) {
      expect(migration.from).not.toBe(migration.to);
    }
  });
});
