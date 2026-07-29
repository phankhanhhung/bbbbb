# CombViz

Nền tảng minh hoạ tương tác lời giải Tổ hợp Olympiad — lời giải trình diễn từng bước
trên canvas tương tác, văn bản ↔ hình liên kết hai chiều, sandbox thử phản ví dụ.

Vận hành theo mô hình **single-author brand engine**: engine là xưởng in riêng của
một tác giả; sản phẩm công chúng là kho bài đã curate. Xem `docs/SRS-v1.0.md`.

**Trạng thái:** Phase 1 xong phần kỹ thuật, cộng engine thứ ba (dãy số / đa tập) — mức phủ đề tổ hợp
đi từ ~45% lên ~55%, xem `docs/VIZ-COVERAGE.md`. Kho có **9 bài: 2 fixture + 7 draft chờ duyệt**,
chưa bài nào do chính chủ soạn. Hai gate còn mở là việc của chính chủ: đo perf trên iPad thật (G-A)
và soạn tay 3–5 bài (G-C). Xem `docs/PLAN-P1.md`.

## Bắt đầu

```bash
pnpm install
pnpm check          # typecheck + lint + test + validate toàn kho
```

Từng phần:

```bash
pnpm typecheck
pnpm lint           # gồm luật phụ thuộc giữa các package
pnpm test           # unit + golden SVG toàn kho
pnpm validate       # validate toàn kho bài
pnpm index          # sinh packages/content/index.json (CMS-02)
pnpm coverage       # bảng điểm content sprint
pnpm e2e            # Playwright: Player trên profile desktop + iPad
pnpm e2e:perf       # ngân sách NFR-P1..P3 — chạy một worker, xem bên dưới
```

`pnpm e2e:perf` **phải** chạy một worker. Đo frame time trong khi hai worker khác đang
dựng browser cho ra số của máy CI đang bận chứ không phải của Player: p95 nhảy từ 17.4ms
lên 22ms mà không đổi một dòng code. Số đo sai còn tệ hơn không đo, vì nó dạy người ta bỏ
qua màu đỏ.

Golden SVG snapshot phủ **mọi step có hình trong kho**. Diff golden nở to là *thông tin*,
không phải phiền phức — nó nói đúng bao nhiêu bài bị một thay đổi chạm tới. Nhìn diff
trước, rồi mới `pnpm test -u`.

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
npx tsx tools/pipeline/src/cli.ts og --png        # OG card SVG + PNG (REN-02)
npx tsx tools/pipeline/src/cli.ts index           # chỉ mục tìm kiếm (CMS-02)
npx tsx tools/pipeline/src/cli.ts stats           # đối chiếu AUT-KPI
npx tsx tools/pipeline/src/cli.ts coverage --drafts   # bảng điểm content sprint (DoD §15.1)
npx tsx tools/pipeline/src/cli.ts eval knight-closed-tour-5x5 "count(cells, c => c.color_class == 1)"
```

`coverage` chấm kho theo đúng khung phân bố của DoD Phase 1 và nói còn thiếu bao nhiêu
bài loại nào. `eval` chạy một biểu thức DSL trên **từng step** — cách nhanh nhất để hỏi
"hình có đúng thứ narrative vừa nói không", câu hỏi mà `validate` không trả lời.

`og --png` raster bằng resvg, không cần browser. Phông lấy từ **hệ thống**: máy thiếu
phông thì resvg không báo lỗi, nó chỉ bỏ chữ đi — ra một card 1200×630 bố cục hoàn hảo và
không một chữ nào. `tools/pipeline/test/og-raster.test.ts` rasterize chữ có dấu và ký tự
quân cờ rồi đếm mực, nên kiểu lỗi đó làm đỏ CI thay vì lên Twitter.

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
  engines/sequence/  Sequence/Multiset engine: dãy số và đống sỏi, thao tác lặp
  content/           Kho bài JSON + controlled vocabulary
apps/
  player/            SPA cho người học (Preact + Vite)
  player/e2e/        Playwright: hành vi Player + ngân sách perf
  studio/            Công cụ soạn–duyệt cho chính chủ, chạy local
tools/
  pipeline/          CLI: validate, render, fmt, migrate, import-draft, og, index,
                     stats, coverage, eval
docs/
  SRS-v1.0.md        Đặc tả yêu cầu — nguồn của mọi ID requirement
  PLAN-P1.md         Kế hoạch triển khai Phase 1
  STYLE-GUIDE.md     Quy ước biên tập — cố ý còn để trống phần chờ 5 bài soạn tay
  VIZ-COVERAGE.md    Visualize được bao nhiêu % đề tổ hợp, và cần gì để hơn
```

Luật phụ thuộc giữa các package được enforce bằng eslint (`eslint.config.js`) chứ
không bằng quy ước: `render` không biết DOM, `schema` không biết engine nào tồn tại,
LLM chỉ sống trong `tools/pipeline`. Ba ràng buộc đó là kiến trúc của dự án.

## License

- **Code** — MIT, xem `LICENSE`.
- **Nội dung** (bài, lời giải, hình, clip) — CC BY-SA 4.0, xem `packages/content/LICENSE`.
- **Đề bài** trích từ các kỳ thi không thuộc bản quyền của kho; mỗi bài ghi nguồn
  trong trường `source`.
