# CombViz

Nền tảng minh hoạ tương tác lời giải tổ hợp Olympiad. CombViz biến mỗi lời giải
thành một chuỗi step trên canvas SVG: phần văn bản liên kết hai chiều với hình,
người học có thể tua lại, xem lập luận và thử phản ví dụ trong sandbox.

Đây là **single-author brand engine**: engine và pipeline là xưởng in local của
một tác giả; sản phẩm công khai là kho bài đã được curate. Dự án không phải
proof assistant, LMS hay nền tảng multi-author. Đặc tả đầy đủ nằm ở
[`docs/SRS-v1.0.md`](docs/SRS-v1.0.md).

## Trạng thái hiện tại

- Phase 1 đang chạy; đã có **7 engine**: board, graph, sequence, set, point,
  game và derivation.
- Kho có **56 bài đã xuất bản**. Nội dung do tác giả soạn và tự duyệt; chất
  lượng editorial vẫn là gate của sản phẩm, không được tự động bỏ qua.
- Coverage ước lượng khoảng **85%** các họ bài tổ hợp mà engine hiện tại có
  thể gánh phần lập luận. Đây là ước lượng chuyên gia, không phải benchmark
  trên một tập đề hoàn chỉnh; xem [`docs/VIZ-COVERAGE.md`](docs/VIZ-COVERAGE.md).
- Roadmap và các gate còn lại: [`docs/PLAN-P1.md`](docs/PLAN-P1.md).

## Bắt đầu nhanh

Yêu cầu Node.js 22+ và pnpm 10.33+:

```bash
pnpm install
pnpm check
```

`pnpm check` sinh lại các file index/artifact cần thiết, sau đó chạy
typecheck, lint, test, validate nội dung và kiểm tra label atlas.

### Chạy ứng dụng

```bash
# Player — giao diện công khai cho người học
pnpm --filter @combviz/app-player dev

# Studio — công cụ soạn và duyệt local cho tác giả
pnpm --filter @combviz/app-studio dev
```

Mặc định Vite sẽ in URL local trong terminal. Player là nơi xem kho bài;
Studio làm việc trực tiếp với JSON và dùng cùng bộ kiểm với CLI/CI.

## Các lệnh thường dùng

```bash
pnpm typecheck       # kiểm tra TypeScript
pnpm lint            # ESLint + luật phụ thuộc giữa package
pnpm test            # unit test và golden SVG
pnpm validate        # validate toàn bộ packages/content
pnpm labels          # kiểm tra label atlas
pnpm index           # sinh index tìm kiếm lúc build
pnpm coverage        # báo cáo coverage nội dung
pnpm e2e             # Playwright trên desktop và iPad
pnpm e2e:perf        # đo ngân sách hiệu năng, bắt buộc một worker
```

`index.json`, taxonomy và OG assets là artifact sinh lúc build, không commit.
Label atlas là ngoại lệ: nó được sinh bằng `labels --write` và commit để mọi
thay đổi công thức hiện rõ trong diff. Vì vậy `pnpm install`, `pnpm check`,
`dev` và `build` đều tạo index mới thay vì dùng dữ liệu cũ.

### CLI pipeline

CLI đầy đủ có thể xem bằng `npx tsx tools/pipeline/src/cli.ts --help`:

```bash
npx tsx tools/pipeline/src/cli.ts validate packages/content [--strict]
npx tsx tools/pipeline/src/cli.ts render mutilated-chessboard --step s2 --out s2.svg
npx tsx tools/pipeline/src/cli.ts fmt --write
npx tsx tools/pipeline/src/cli.ts import-draft draft.json --write
npx tsx tools/pipeline/src/cli.ts migrate --write
npx tsx tools/pipeline/src/cli.ts labels --write
npx tsx tools/pipeline/src/cli.ts og --png
npx tsx tools/pipeline/src/cli.ts eval knight-closed-tour-5x5 "count(cells, c => c.color_class == 1)"
```

Luồng nội dung là **draft → validate/lint → tác giả duyệt từng step → publish**.
`validate` kiểm tra schema, cấu trúc cây, anchor, bound, taxonomy, invariant và
validator trên mọi step; `--strict` biến cảnh báo thành lỗi. `render` dùng
chính renderer của Player nhưng chạy headless, không cần browser.

## Kiến trúc

```text
packages/
  schema/             schema + TypeScript types — hợp đồng trung tâm
  theme/              theme tokens — nguồn visual brand duy nhất
  dsl/                parser/interpreter DSL sandboxed
  render/             scene → SVG, diff, interpolate, DOM patch
  editor/             command layer, selection, undo/redo
  check/              bộ kiểm dùng chung bởi Studio, CLI và CI
  engines/
    board/ graph/ sequence/ set/ point/ game/ derivation
  content/            problem JSON, taxonomy và assets
apps/
  player/             SPA công khai (Preact + Vite)
  studio/             app local-only cho Owner-Author
tools/
  pipeline/           CLI validate, render, import, migrate, OG và thống kê
docs/                 SRS, roadmap, style guide và coverage
```

Ba ràng buộc quan trọng được ESLint enforce: renderer không biết DOM,
schema không biết engine cụ thể, và LLM chỉ xuất hiện trong pipeline — không
bao giờ chạy trong runtime dành cho người học.

## Giấy phép

- **Code/engine:** MIT — xem [`LICENSE`](LICENSE).
- **Nội dung** (bài, lời giải, hình, clip): CC BY-SA 4.0 — xem
  [`packages/content/LICENSE`](packages/content/LICENSE).
- Đề bài được ghi nguồn riêng trong trường `source`; license nội dung của kho
  không tuyên bố sở hữu các đề thi được trích dẫn.
