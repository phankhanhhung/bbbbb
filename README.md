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
- Kho có **61 bài đã xuất bản**. Nội dung do tác giả soạn và tự duyệt; chất
  lượng editorial vẫn là gate của sản phẩm, không được tự động bỏ qua.
- Coverage ước lượng khoảng **85%** các họ bài tổ hợp mà engine hiện tại có
  thể gánh phần lập luận. Đây là ước lượng chuyên gia, không phải benchmark
  trên một tập đề hoàn chỉnh; xem [`docs/VIZ-COVERAGE.md`](docs/VIZ-COVERAGE.md).
- Roadmap và các gate còn lại: [`docs/PLAN-P1.md`](docs/PLAN-P1.md).
- Checklist làm mạnh từng engine, có bằng chứng cho từng hạng mục:
  [`docs/ENGINE-BACKLOG.md`](docs/ENGINE-BACKLOG.md). Là **danh sách chờ**, không
  phải kế hoạch chạy ngay — `R-13` chặn nó lại sau G-C.
- Định hướng sản phẩm và các khoảng trống ưu tiên:
  [`docs/PRODUCT-REQUIREMENTS.md`](docs/PRODUCT-REQUIREMENTS.md). Nó nằm **trên**
  SRS một tầng; SRS vẫn giữ quyền với mọi requirement ID đã có (PRD-01).

Hai gate còn mở, và cả hai là việc của chính chủ chứ không phải việc kỹ thuật:

- **G-C** — chưa bài nào do chính chủ soạn, và người duyệt cũng chính là người
  soạn, nên AUT-09 hiện là tự cấp chứng nhận. Soạn tay 3–5 bài rồi mới đóng băng
  schema 1.0.0.
- **G-A** — chưa đo hiệu năng trên iPad Gen 9 thật. Ngân sách NFR-P1..P3 đang đo
  bằng Chromium desktop có bóp CPU; đó là hàng rào rẻ, không phải phép đo của gate.

## Bảy engine, và ranh giới của từng cái

| Engine | Vẽ được | Cố ý **không** làm |
|---|---|---|
| `board` | lưới **vuông / tam giác / lục giác**, quân, tile, vùng, bảng số | quân ghép trên lưới phi vuông |
| `graph` | đa đồ thị, ghép cặp + König + Hall, ma trận kề, poset/Hasse + Dilworth | tô mặt, kiểm tính phẳng tổng quát |
| `sequence` | dãy số, đa tập, đống sỏi, thao tác lặp | luật gộp là **enum đóng**, không cho nhập biểu thức |
| `set` | bảng incidence, Venn ≤ 3 tập | Venn quá 3 tập — sự thật hình học, không phải giới hạn cài đặt |
| `point` | bao lồi, thẳng hàng, giao điểm, đường thẳng, lưới điểm | PT-03 tô vùng, đường tròn |
| `game` | game trên **đa tập đống**: Grundy, misère, phổ thắng-thua một và **hai** chiều, Wythoff, trò Euclid, hợp luật | Fibonacci nim, Chomp, cờ trên đồ thị, game partizan |
| `derivation` | chuỗi biến đổi đại số; mỗi hạng tử có `id` nên nó **chuyển động** giữa hai bước | không hiểu công thức — nó xếp chỗ cho LaTeX, không phân tích cú pháp toán |

Cột phải được viết ra vì kho này đã trả giá vài lần cho **trường ma**: một trường
validate xanh mà renderer im lặng lờ đi. Engine nào cũng có phần chưa làm, và nói
ra rẻ hơn để ai đó phát hiện bằng một cái hình sai.

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

**Tỉ lệ scene → màn hình bị khoá** (`packages/render/src/scale.ts`): một ô bàn cờ, một
khoảng cách giữa hai đỉnh — quy ước G-10 gọi là 10 đơn vị scene — luôn là **44px**, đúng
ngưỡng chạm tối thiểu NFR-A3. Scene rộng quá pane thì co lại, **chỉ co không bao giờ giãn**,
và hệ số co tính từ step rộng nhất của cả bài nên không đối tượng nào đổi cỡ khi bấm sang
bước sau. Trước lớp này, quy ước G-10 chỉ có trong tài liệu: Player kéo mỗi `viewBox` cho
đầy pane, nên cùng một đối tượng chênh 7,1× giữa các step của một bài và 10,2× giữa các
bài. `packages/render/test/scale.test.ts` và ba e2e "Tỉ lệ đồng nhất" khoá bất biến ấy.

Thanh công cụ Sandbox **do engine khai**, không phải danh sách gõ cứng trong
Player (`packages/editor/src/tool.ts`). Nút nào hiện ra thì lệnh sau nó chắc chắn
nằm trong tập lệnh của engine đang mở, và `packages/editor/test/tool.test.ts` ép
cả hai chiều: không nút nào gọi lệnh engine không có, và engine nào có lệnh thì
phải có nút gọi tới. Trước ràng buộc này, cả bảy engine dùng chung một thanh công
cụ toàn lệnh `board/*` — ở năm engine còn lại, bấm nút nào cũng im lặng.

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

`pnpm e2e:perf` phải chạy **một** worker. Đo frame time trong khi hai worker khác
đang dựng browser cho ra số của máy CI đang bận chứ không phải của Player: p95
nhảy từ 17.4ms lên 22ms mà không đổi một dòng code. Số đo sai còn tệ hơn không
đo, vì nó dạy người ta bỏ qua màu đỏ.

Golden SVG snapshot phủ **mọi step có hình trong kho**. Diff golden nở to là
*thông tin*, không phải phiền phức — nó nói đúng bao nhiêu bài bị một thay đổi
chạm tới. Nhìn diff trước, rồi mới `pnpm test -u`.

`index.json`, taxonomy và OG assets là artifact sinh lúc build, không commit.
Label atlas là ngoại lệ: nó được sinh bằng `labels --write` và commit để mọi
thay đổi công thức hiện rõ trong diff. Vì vậy `pnpm install`, `pnpm check`,
`dev` và `build` đều tạo index mới thay vì dùng dữ liệu cũ.

### CLI pipeline

CLI đầy đủ có thể xem bằng `npx tsx tools/pipeline/src/cli.ts --help`:

```bash
npx tsx tools/pipeline/src/cli.ts new <id> --engine graph --write
npx tsx tools/pipeline/src/cli.ts validate packages/content [--strict]
npx tsx tools/pipeline/src/cli.ts render mutilated-chessboard --step s2 --out s2.svg
npx tsx tools/pipeline/src/cli.ts fmt --write
npx tsx tools/pipeline/src/cli.ts import-draft draft.json --write
npx tsx tools/pipeline/src/cli.ts migrate --write
npx tsx tools/pipeline/src/cli.ts labels --write
npx tsx tools/pipeline/src/cli.ts og --png
npx tsx tools/pipeline/src/cli.ts eval knight-closed-tour-5x5 "count(cells, c => c.color_class == 1)"
```

`new` dựng khung một bài soạn tay: đủ trường bắt buộc, một step có scene mẫu **hợp lệ**
của engine ấy, anchor trỏ vào một id có thật, `status: draft` và `verified: false` nên nó
không publish nổi (AUT-09). Khung qua được `validate` ngay — có test ép điều đó cho cả bảy
engine, vì một khung chạy lên là đỏ thì tệ hơn không có khung: nó bắt người soạn debug thứ
mình chưa viết.

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
