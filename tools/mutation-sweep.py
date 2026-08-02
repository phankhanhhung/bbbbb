# -*- coding: utf-8 -*-
"""Bẻ răng hàng loạt: chốt canh nào bẻ mà không đỏ là chốt canh không canh gì.

Không chạy trong CI — nó sửa mã nguồn rồi khôi phục, và mỗi mutant tốn một lượt test
đầy đủ. Đây là công cụ **soát định kỳ**, chạy tay khi muốn hỏi "còn cổng nào xanh mà
không canh gì".

Lượt đầu (2026-08-02) chạy 19 mutant: **16 chết, 3 sống sót.** Ba cái sống sót là
`SERIES_TERMS` (độ sâu sân kiểm chuỗi), `MAX_CANVAS_VH` (trần chiều cao canvas), và mã
lỗi `bounds/algebra-unsound`. Cả ba nay đã có răng; giữ chúng lại trong danh sách để
lượt sau còn kiểm được rằng răng vẫn còn đó. **Chạy lại 2026-08-02 (lượt soát tài
liệu): cả ba chết.**

Chạy: python3 tools/mutation-sweep.py [lọc]

Mỗi mục là (tệp, chuỗi tìm, chuỗi thay, tên). Kịch bản sửa **một** chỗ, chạy test, so
số test hỏng với mốc, rồi khôi phục — luôn khôi phục, kể cả khi test ném.

**Hai chỗ chính công cụ này từng nói dối, sửa ở lượt soát tài liệu 2026-08-02.**

Một — nó chạy `vitest run packages tools/pipeline/test`, hẹp hơn `pnpm test` đúng bốn
tệp của `apps/` ($40$ test). Một mutant chỉ bị `apps/player` hay `apps/studio` bắt sẽ
in ra "SỐNG SÓT", và người đọc sẽ đi lắp một cái răng đã có sẵn. Nay nó chạy đúng lệnh
mà `pnpm test` chạy: `vitest run`, không lọc đường dẫn.

Hai — chuỗi tìm mà lệch thì nó in "BỎ QUA" **rồi chạy tiếp**. Trong một báo cáo 19
dòng, một dòng BỎ QUA trông y hệt một mutant không có trong danh sách, và **chuyện ấy
đã xảy ra thật**: mục `bounds/algebra-unsound` mang thụt lề cũ từ trước lúc
`unsoundIssue()` được tách ra thành hàm, nên nó im lặng không chạy suốt từ đó. Một
công cụ soát mà bỏ qua trong im lặng thì chính nó là cổng xanh không canh gì. Nay số
mục bỏ qua được đếm, in đậm ở cuối, và kịch bản **thoát với mã khác 0**.
"""
import io, os, subprocess, sys, shutil, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

MUTANTS = [
    # ================= LỚP HAI: cổng ở tầng nội dung, schema, hiển thị =================
    ('packages/schema/src/structure.ts',
     "code: 'structure/bijection-unknown-element',", "code: 'structure/SKIP-bijection-unknown-element',",
     'đổi mã lỗi của kiểm ghim song ánh'),
    ('packages/engines/algebra/src/index.ts',
     "    code: 'bounds/algebra-unsound',", "    code: 'bounds/SKIP-algebra-unsound',",
     'đổi mã lỗi "bước không bảo toàn giá trị"'),
    ('packages/schema/src/version.ts',
     "export const SCHEMA_VERSION = '1.5.0';", "export const SCHEMA_VERSION = '9.9.9';",
     'SCHEMA_VERSION nhảy lên 9.9.9 (kho lệch con dấu)'),
    ('packages/engines/graph/src/index.ts',
     "const MONO_TRIANGLE_LIMIT = 30;", "const MONO_TRIANGLE_LIMIT = 0;",
     'MONO_TRIANGLE_LIMIT = 0 (mọi đồ thị bị bỏ qua, validator luôn đạt)'),
    ('packages/engines/algebra/src/check.ts',
     'export const WITNESS_MAX = 8;', 'export const WITNESS_MAX = 999;',
     'WITNESS_MAX = 999 (dải chứng cứ dài vô tận)'),
    ('packages/render/src/scale.ts',
     'export const CELL_PX = 44;', 'export const CELL_PX = 4;',
     'CELL_PX = 4 (ô bé xíu — mọi hình co lại 11 lần)'),
    ('packages/engines/graph/src/graph.ts',
     'export const VERTEX_RADIUS = 2.3;', 'export const VERTEX_RADIUS = 0.1;',
     'VERTEX_RADIUS = 0.1 (đỉnh gần như vô hình)'),

    # ---- trần và guard của lớp kiểm đại số ----
    ('packages/engines/algebra/src/check.ts',
     'export const WITNESS_MAX = 8;', 'export const WITNESS_MAX = 0;',
     'WITNESS_MAX = 0 (không ghi nhân chứng nào)'),
    ('packages/engines/algebra/src/series.ts',
     'export const SERIES_TERMS = 12;', 'export const SERIES_TERMS = 1;',
     'SERIES_TERMS = 1 (chỉ so hệ số bậc 0)'),
    ('packages/engines/algebra/src/check.ts',
     'export const P = 2147483647n;', 'export const P = 3n;',
     'P = 3 (sân F_p bé xíu ⇒ đụng độ đầy)'),

    # ---- trần solver ván chơi ----
    ('packages/editor/src/solve.ts',
     'export const SOLVER_STATES = 5_000;', 'export const SOLVER_STATES = 1;',
     'SOLVER_STATES = 1 (solver từ chối gần như mọi thế)'),
    ('packages/editor/src/solve.ts',
     'export const SOLVER_EDGES_PER_STATE = 32;', 'export const SOLVER_EDGES_PER_STATE = 1;',
     'SOLVER_EDGES_PER_STATE = 1'),

    # ---- trần lịch sử / vết chân / ngữ pháp nước đi ----
    ('packages/editor/src/history.ts',
     'export const HISTORY_LIMIT = 60;', 'export const HISTORY_LIMIT = 1;',
     'HISTORY_LIMIT = 1 (undo chỉ nhớ một bước)'),
    ('packages/editor/src/trail.ts',
     'export const TRAIL_LIMIT = 40;', 'export const TRAIL_LIMIT = 1;',
     'TRAIL_LIMIT = 1'),
    ('packages/editor/src/script.ts',
     'export const MOVES_LIMIT = 2_000;', 'export const MOVES_LIMIT = 1;',
     'MOVES_LIMIT = 1'),
    ('packages/editor/src/play.ts',
     'export const PLAY_LIMIT = 200;', 'export const PLAY_LIMIT = 1;',
     'PLAY_LIMIT = 1'),

    # ---- ngân sách DSL ----
    ('packages/dsl/src/interpreter.ts',
     'maxSteps: 200_000', 'maxSteps: 1',
     'DSL maxSteps = 1'),

    # ---- màu: trần lớp màu ----
    ('packages/schema/src/bounds.ts',
     'export const MAX_COLOR_CLASS = 8;', 'export const MAX_COLOR_CLASS = 99;',
     'MAX_COLOR_CLASS = 99 (schema nhận lớp màu không có trong bảng màu)'),

    # ---- kích thước vẽ ----
    ('packages/render/src/scale.ts',
     'export const MAX_CANVAS_VH = 72;', 'export const MAX_CANVAS_VH = 9999;',
     'MAX_CANVAS_VH = 9999 (bỏ trần chiều cao khung vẽ)'),
]


def run_tests():
    # Không lọc đường dẫn: đúng lệnh của `pnpm test`. Quét hẹp hơn thì mutant nào chỉ
    # bị `apps/` bắt sẽ hiện ra là sống sót — một dương tính giả tốn cả một lượt điều
    # tra, và tệ hơn: nó lái người soát đi lắp răng vào chỗ đã có răng.
    r = subprocess.run(
        ['pnpm', 'exec', 'vitest', 'run'],
        capture_output=True, text=True, timeout=1800)
    out = r.stdout + r.stderr
    for line in out.splitlines():
        if line.strip().startswith('Tests '):
            return line.strip()
    return 'KHÔNG ĐỌC ĐƯỢC'


print('== mốc ==')
print(run_tests())
print()

only = sys.argv[1] if len(sys.argv) > 1 else None
skipped, survived = [], []
for path, find, repl, name in MUTANTS:
    if only and only not in name:
        continue
    src = io.open(path, encoding='utf8').read()
    if find not in src:
        # Không `continue` im lặng: xem tổng kết cuối tệp.
        skipped.append(name)
        print('BỎ QUA (không tìm thấy):', name)
        continue
    backup = tempfile.mktemp()
    shutil.copy(path, backup)
    try:
        io.open(path, 'w', encoding='utf8').write(src.replace(find, repl, 1))
        result = run_tests()
    finally:
        shutil.copy(backup, path)
        os.unlink(backup)
    alive = 'failed' not in result
    if alive:
        survived.append(name)
    print(f'{"SỐNG SÓT ⚠" if alive else "chết ✓":12} {name}\n             → {result}')

print()
print(f'== tổng kết ==  sống sót: {len(survived)}  ·  bỏ qua: {len(skipped)}')
for name in survived:
    print('  SỐNG SÓT ⚠', name)
for name in skipped:
    # Một mục bỏ qua **không** phải một mục đạt. Chuỗi tìm lệch khỏi mã là chuyện
    # thường xảy ra sau mỗi lượt đổi tên hay tách hàm, và nó đã xảy ra một lần
    # (`bounds/algebra-unsound` sau khi `unsoundIssue()` tách ra) — im lặng ở đây
    # nghĩa là công cụ soát tự nó thành một cổng xanh không canh gì.
    print('  BỎ QUA ⚠  ', name, '— sửa chuỗi tìm cho khớp mã hiện tại')

# Mã thoát khác 0 khi có mục bỏ qua: "chạy xong" phải khác "chạy đủ".
sys.exit(1 if skipped else 0)
