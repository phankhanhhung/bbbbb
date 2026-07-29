# CombViz

Nền tảng minh hoạ tương tác lời giải Tổ hợp Olympiad — lời giải trình diễn từng bước
trên canvas tương tác, văn bản ↔ hình liên kết hai chiều, sandbox thử phản ví dụ.

Vận hành theo mô hình **single-author brand engine**: engine là xưởng in riêng của
một tác giả; sản phẩm công chúng là kho bài đã curate. Xem `docs/SRS-v1.0.md`.

**Trạng thái:** Phase 1, M6 xong (Studio + pipeline soạn–duyệt–xuất bản). Còn chờ đo perf trên iPad (gate G-A) và 5 bài soạn tay (gate G-C) — cả hai là việc của chính chủ. Xem `docs/PLAN-P1.md`.

## Bắt đầu

```bash
pnpm install
pnpm check          # typecheck + lint + test + validate toàn kho
```

Từng phần:

```bash
pnpm typecheck
pnpm lint           # gồm luật phụ thuộc giữa các package
pnpm test
pnpm validate       # validate toàn kho bài
pnpm index          # sinh packages/content/index.json (CMS-02)
```

`index.json` là **sinh lúc build, không commit**: nó là hàm thuần của kho bài, và
một bản sao trong git chỉ tạo thêm một thứ có thể lệch. `pnpm install` sinh nó qua
`prepare`, `pnpm check` sinh lại trước khi chạy, và `dev`/`build` của Player cũng
vậy — nên không có đường nào chạy trên chỉ mục cũ.

## CLI

```bash
npx tsx tools/pipeline/src/cli.ts --help          # danh sách đầy đủ
npx tsx tools/pipeline/src/cli.ts validate packages/content [--strict]
npx tsx tools/pipeline/src/cli.ts render mutilated-chessboard --step s2 --out s2.svg
npx tsx tools/pipeline/src/cli.ts fmt --write     # định dạng chuẩn tắc (DAT-03)
npx tsx tools/pipeline/src/cli.ts import-draft draft.json --write
npx tsx tools/pipeline/src/cli.ts og              # OG card (REN-02)
npx tsx tools/pipeline/src/cli.ts index           # chỉ mục tìm kiếm (CMS-02)
npx tsx tools/pipeline/src/cli.ts stats           # đối chiếu AUT-KPI
```

`validate` chạy đúng bộ luật mà Studio và CI dùng (AUT-04): schema → cấu trúc cây →
anchor → bound → taxonomy → eval invariant và validator trên **mọi** step.
`--strict` coi cảnh báo là lỗi.

`render` chạy trong Node, không cần browser (REN-01), bằng **đúng renderer** mà
Player dùng — không có bản sao nào.

## Player & Studio

```bash
pnpm --filter @combviz/app-player dev    # kho bài + trình chiếu từng bước
pnpm --filter @combviz/app-studio dev    # công cụ soạn–duyệt, chạy local
```

Studio phục vụ **đúng một power user** và không giấu điều đó: JSON là first-class,
không wizard, không onboarding. Nó gọi cùng bộ kiểm mà CI gọi (`packages/check`) —
một Studio kiểm khác CI thì đúng bằng không có cổng nào.

Publish bị khoá tới khi **mọi** step được đánh dấu `verified`, và không có nút
"duyệt tất cả": máy kiểm được schema, anchor, invariant, validator; máy không kiểm
được lập luận, nên chỗ đó phải tốn thời gian của người (AUT-09, R-8).

## Bố cục

```
packages/
  schema/            JSON Schema + kiểm cấu trúc — hợp đồng trung tâm
  theme/             Theme tokens — nguồn brand visual duy nhất (DAT-20)
  render/            Scene → SvgNode[] thuần, diff, interpolate, serialize
  render/src/dom/    Lớp DOM duy nhất: patch + animate (entry point riêng)
  dsl/               Expression DSL: parser Pratt, interpreter sandboxed
  editor/            Command layer, undo/redo, selection — nền của Sandbox và Studio
  check/             Một bộ kiểm cho Studio + CLI + CI (AUT-04): schema, ngữ nghĩa, lint
  engines/board/     Grid/Board engine: schema, bound, renderer, DSL env, validator
  engines/graph/     Graph engine: multigraph, layout, analyzer, validator
  content/           Kho bài JSON + controlled vocabulary
apps/
  player/            SPA cho người học (Preact + Vite)
  studio/            Công cụ soạn–duyệt cho chính chủ, chạy local
tools/
  pipeline/          CLI: validate, render, fmt, migrate, import-draft, og, index, stats
docs/
  SRS-v1.0.md        Đặc tả yêu cầu — nguồn của mọi ID requirement
  PLAN-P1.md         Kế hoạch triển khai Phase 1
  STYLE-GUIDE.md     Quy ước biên tập — cố ý còn để trống phần chờ 5 bài soạn tay
```

Luật phụ thuộc giữa các package được enforce bằng eslint (`eslint.config.js`) chứ
không bằng quy ước: `render` không biết DOM, `schema` không biết engine nào tồn tại,
LLM chỉ sống trong `tools/pipeline`. Ba ràng buộc đó là kiến trúc của dự án.

## License

- **Code** — MIT, xem `LICENSE`.
- **Nội dung** (bài, lời giải, hình, clip) — CC BY-SA 4.0, xem `packages/content/LICENSE`.
- **Đề bài** trích từ các kỳ thi không thuộc bản quyền của kho; mỗi bài ghi nguồn
  trong trường `source`.
