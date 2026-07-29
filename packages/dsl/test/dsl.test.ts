import { describe, expect, it } from 'vitest';
import {
  compile,
  DslError,
  element,
  evaluate,
  parse,
  tryEvaluate,
  type DslEnvironment,
} from '../src/index.js';

const cells = [
  element('c1', { color_class: 1, covered: false, row: 0, col: 0 }),
  element('c2', { color_class: 2, covered: true, row: 0, col: 1 }),
  element('c3', { color_class: 1, covered: true, row: 1, col: 0 }),
  element('c4', { color_class: 0, covered: false, row: 1, col: 1 }),
];

const env: DslEnvironment = {
  bindings: { cells, rows: 2, cols: 2, empty: [] },
  builtins: {
    covered: (args) => Boolean((args[0] as { props: Record<string, unknown> }).props['covered']),
  },
};

const run = (source: string): unknown => evaluate(parse(source), env);

describe('số học và so sánh', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['10 - 3 - 2', 5],
    ['7 % 3', 1],
    ['-4 + 1', -3],
    ['2.5 * 2', 5],
  ])('%s = %s', (source, expected) => {
    expect(run(source)).toBe(expected);
  });

  it('trừ kết hợp trái', () => {
    expect(run('10 - 3 - 2')).toBe(5);
  });

  it('so sánh chuỗi độ ưu tiên đúng', () => {
    expect(run('1 + 1 == 2')).toBe(true);
    expect(run('1 < 2 && 3 > 2')).toBe(true);
  });
});

describe('tập hợp và lambda', () => {
  it('count không lambda trả về số phần tử', () => {
    expect(run('count(cells)')).toBe(4);
  });

  it('count có lambda đếm phần tử thoả', () => {
    expect(run('count(cells, c => c.color_class == 1)')).toBe(2);
  });

  it('builtin của engine dùng được trong lambda', () => {
    expect(run('count(cells, c => !covered(c))')).toBe(2);
  });

  it('sum, min, max', () => {
    expect(run('sum(cells, c => c.color_class)')).toBe(4);
    expect(run('min(cells, c => c.color_class)')).toBe(0);
    expect(run('max(cells, c => c.color_class)')).toBe(2);
  });

  it('forall và exists', () => {
    expect(run('forall(cells, c => c.color_class >= 0)')).toBe(true);
    expect(run('forall(cells, c => c.color_class > 0)')).toBe(false);
    expect(run('exists(cells, c => c.color_class == 2)')).toBe(true);
  });

  it('lambda lồng nhau giữ đúng biến của từng tầng', () => {
    expect(run('count(cells, a => exists(cells, b => a.row == b.row && a.col != b.col))')).toBe(4);
  });

  it('element bằng nhau theo id, không theo nội dung', () => {
    expect(run('exists(cells, a => exists(cells, b => a == b))')).toBe(true);
    expect(run('count(cells, a => count(cells, b => a == b) == 1)')).toBe(4);
  });

  it('min trên tập rỗng là lỗi, không phải 0', () => {
    // Trong lập luận cực trị, "không có phần tử nào" là thông tin — trả 0 sẽ nói
    // dối một cách im lặng.
    expect(() => run('min(empty, x => x.row)')).toThrow(DslError);
  });
});

describe('sandbox — nội dung problem là dữ liệu, không phải code (NFR-S1)', () => {
  it('không có phép gán', () => {
    expect(() => parse('x = 1')).toThrow(/Dùng `==` để so sánh/);
  });

  it('không với tới được global của JS', () => {
    expect(() => run('globalThis')).toThrow(/Không có tên/);
    expect(() => run('constructor')).toThrow(/Không có tên/);
  });

  it('không gọi được hàm lạ', () => {
    expect(() => run('fetch(cells)')).toThrow(/Không có hàm "fetch"/);
  });

  it('không đọc được thuộc tính ngoài danh sách của element', () => {
    expect(() => run('count(cells, c => c.__proto__ == 1)')).toThrow(
      /không có thuộc tính/,
    );
  });

  it('ngân sách bước cắt được vòng lặp tổ hợp quá lớn', () => {
    const many = Array.from({ length: 400 }, (_, i) => element(`e${i}`, { v: i }));
    const bigEnv: DslEnvironment = { bindings: { xs: many }, builtins: {} };

    // Ngân sách tường minh, không đồng hồ: test phải khẳng định *chốt số bước*
    // hoạt động. Nếu để mặc định, dưới tải nặng đồng hồ 50ms sẽ cắt trước và test
    // đo nhầm thứ khác — chính nó từng flaky vì lý do này.
    const outcome = tryEvaluate('count(xs, a => count(xs, b => a.v == b.v) > 0)', bigEnv, {
      maxSteps: 10_000,
      maxMs: Number.POSITIVE_INFINITY,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/ngân sách/);
  });

  it('ngân sách deterministic: cùng đầu vào cho cùng kết quả', () => {
    const many = Array.from({ length: 400 }, (_, i) => element(`e${i}`, { v: i }));
    const bigEnv: DslEnvironment = { bindings: { xs: many }, builtins: {} };
    const source = 'count(xs, a => count(xs, b => a.v == b.v) > 0)';

    const budget = { maxSteps: 10_000, maxMs: Number.POSITIVE_INFINITY };
    const first = tryEvaluate(source, bigEnv, budget);
    const second = tryEvaluate(source, bigEnv, budget);

    expect(first).toEqual(second);
  });
});

describe('lỗi dạy được', () => {
  it('gõ nhầm tên tập hợp thì liệt kê tên có sẵn', () => {
    expect(() => run('count(cell, c => true)')).toThrow(/Không có tên "cell"/);
  });

  it('gõ nhầm tên hàm thì liệt kê hàm có sẵn', () => {
    expect(() => run('countt(cells)')).toThrow(/count/);
  });

  it('quên lambda thì nói rõ dạng cần viết', () => {
    expect(() => run('sum(cells)')).toThrow(/x => …/);
  });

  it('trộn kiểu thì nói rõ nhận được gì', () => {
    expect(() => run('1 + true')).toThrow(/cần hai số/);
  });

  it('lỗi mang vị trí để Studio nhảy tới đúng chỗ', () => {
    const outcome = tryEvaluate('count(cells, c => c.mau == 1)', env);

    expect(outcome.ok).toBe(false);
    expect(outcome.pos).toBeGreaterThan(0);
  });

  it('chia cho 0 báo lỗi thay vì trả Infinity', () => {
    expect(() => run('1 / 0')).toThrow(/Chia cho 0/);
  });
});

describe('compile dùng lại được', () => {
  it('parse một lần, chạy nhiều lần', () => {
    const expr = compile('count(cells, c => c.color_class == 1)');

    expect(expr.run(env)).toBe(2);
    expect(expr.run(env)).toBe(2);
    expect(expr.source).toContain('color_class');
  });

  it('tryEvaluate không bao giờ ném', () => {
    // Nội dung không tin cậy (kể cả draft máy, AUT-09) phải làm hỏng đúng ô hiển
    // thị của nó, không làm trắng cả trang.
    expect(() => tryEvaluate('((((', env)).not.toThrow();
    expect(tryEvaluate('((((', env).ok).toBe(false);
  });
});
