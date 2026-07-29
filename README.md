# CombViz

Nền tảng minh hoạ tương tác lời giải Tổ hợp Olympiad — lời giải trình diễn từng bước
trên canvas tương tác, văn bản ↔ hình liên kết hai chiều, sandbox thử phản ví dụ.

Vận hành theo mô hình **single-author brand engine**: engine là xưởng in riêng của
một tác giả; sản phẩm công chúng là kho bài đã curate. Xem `docs/SRS-v1.0.md`.

**Trạng thái:** Phase 1 xong phần kỹ thuật, và **bảy engine** — board, graph, sequence, set,
point, game, derivation. Mức phủ đề tổ hợp ước ~45% → **~85%**; cột "có hình mang thông tin"
~97%. Hàng đợi engine trong `docs/VIZ-COVERAGE.md` §7 đã cạn. Kho có **56 bài đã xuất bản**.

Hai điều phải nói rõ chứ không giấu trong tài liệu:

- **Chưa bài nào do chính chủ soạn**, và người duyệt cũng chính là người soạn — nên
  AUT-09 hiện là tự cấp chứng nhận. Gate **G-C** (soạn tay 3–5 bài rồi đóng băng schema
  1.0.0) vẫn mở.
- **Chưa đo perf trên iPad Gen 9 thật.** Ngân sách NFR-P1..P3 đo bằng Chromium desktop có
  bóp CPU; đó là hàng rào rẻ, không phải phép đo của gate **G-A**.

Xem `docs/PLAN-P1.md`.

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
pnpm labels         # kiểm label atlas (D-07) còn khớp nội dung không
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

**Label atlas** (`packages/content/labels.json`) thì ngược lại: **sinh lúc build và có
commit**, cùng lý do với golden SVG. Nhãn LaTeX trong canvas được MathJax dựng sẵn thành
path (D-07), vì KaTeX dựng ra HTML mà resvg không đọc được `<foreignObject>` — nhãn sẽ hiện
trong Player rồi biến mất khỏi OG card. Thêm công thức mới thì chạy
`npx tsx tools/pipeline/src/cli.ts labels --write`; CI canh bằng `pnpm labels`. Atlas cũ
không hỏng lặng lẽ: hình vẽ hẳn `⟨thiếu atlas: …⟩` ra màn hình.

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
npx tsx tools/pipeline/src/cli.ts labels --write  # dựng label atlas bằng MathJax (D-07)
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

## Engine

Bảy engine, và mỗi cái có một **ranh giới đã viết ra** — thứ nó chịu trách nhiệm, và thứ
nó cố ý không làm:

| Engine | Vẽ được | Cố ý **không** làm |
|---|---|---|
| `board` | lưới, quân, tile, vùng, bảng số | — |
| `graph` | đa đồ thị, ghép cặp + König + Hall, ma trận kề, poset/Hasse + Dilworth | tô mặt, kiểm tính phẳng tổng quát (chỉ có hai đường mà lời giải thi đấu thật sự dùng) |
| `sequence` | dãy số, đa tập, đống sỏi, thao tác lặp | luật gộp là **enum đóng**, không cho nhập biểu thức |
| `set` | bảng incidence, Venn ≤ 3 tập | Venn quá 3 tập — đó là sự thật hình học, không phải giới hạn cài đặt |
| `point` | bao lồi, thẳng hàng, giao điểm, đường thẳng, lưới điểm | PT-03 tô vùng, đường tròn |
| `game` | game **bốc đống**: Grundy, misère, phổ thắng-thua | Wythoff, Euclid, Fibonacci nim, Chomp, cờ trên đồ thị — xem `VIZ-COVERAGE.md` §4 |
| `derivation` | chuỗi biến đổi đại số; mỗi hạng tử có `id` nên nó **chuyển động** giữa hai bước | không hiểu công thức — nó xếp chỗ cho LaTeX chứ không phân tích cú pháp toán |

Ranh giới ấy được viết ra vì kho này đã trả giá vài lần cho **trường ma**: một trường
validate xanh mà renderer im lặng lờ đi. Engine nào cũng có phần "chưa làm", và nói ra thì
rẻ hơn để ai đó phát hiện bằng một cái hình sai.

## Player & Studio

```bash
pnpm --filter @combviz/app-player dev    # kho bài + trình chiếu từng bước
pnpm --filter @combviz/app-studio dev    # công cụ soạn–duyệt, chạy local
```

Thanh công cụ Sandbox **do engine khai**, không phải một danh sách gõ cứng trong Player
(`packages/editor/src/tool.ts`). Nút nào hiện ra thì lệnh sau nó chắc chắn nằm trong tập
lệnh của engine đang mở, và `packages/editor/test/tool.test.ts` ép cả hai chiều: không nút
nào gọi lệnh engine không có, và engine nào có lệnh thì phải có nút gọi tới.

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
  editor/            Command layer, undo/redo, selection, khai báo công cụ sandbox
  check/             Một bộ kiểm cho Studio + CLI + CI (AUT-04): schema, ngữ nghĩa, lint
  engines/board/     Grid/Board engine: schema, bound, renderer, DSL env, validator
  engines/graph/     Graph engine: multigraph, layout, analyzer (ghép cặp, König,
                     tính phẳng, poset/Dilworth), ma trận kề
  engines/sequence/  Sequence/Multiset engine: dãy số và đống sỏi, thao tác lặp
  engines/set/       Set/hypergraph engine: bảng incidence + Venn ≤ 3 tập
  engines/point/     Point/segment engine: bao lồi, thẳng hàng, đếm giao điểm
  engines/game/      Game engine: tập luật **đóng**, Grundy, misère, phổ thắng-thua
  engines/derivation/ Derivation engine: chuỗi biến đổi đại số, hạng tử có danh tính
  content/           Kho bài JSON + controlled vocabulary + label atlas
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
