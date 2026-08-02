# CombViz

Nền tảng minh hoạ tương tác lời giải tổ hợp Olympiad. CombViz biến mỗi lời giải
thành một chuỗi step trên canvas SVG: phần văn bản liên kết hai chiều với hình,
người học có thể tua lại, xem lập luận và thử phản ví dụ trong sandbox.

Đây là **single-author brand engine**: engine và pipeline là xưởng in local của
một tác giả; sản phẩm công khai là kho bài đã được curate. Dự án không phải
proof assistant, LMS hay nền tảng multi-author. Đặc tả đầy đủ nằm ở
[`docs/SRS-v1.0.md`](docs/SRS-v1.0.md).

## Trạng thái hiện tại

Số đo dưới đây lấy từ mã và kho tại `HEAD` (soát 2026-08-02), không lấy từ trí nhớ.

- Phase 1 đang chạy; **9 engine** — board, graph, sequence, set, point, game,
  derivation, longdiv, algebra — cộng một **lớp ván chơi** nằm ngang qua ba engine.
- Kho có **148 bài đã xuất bản**, trên 576 scene. Nội dung do tác giả soạn và tự
  duyệt; chất lượng editorial vẫn là gate của sản phẩm, không được tự động bỏ qua.
- Schema đóng băng ở `1.0.0` (2026-08-01), nay ở **`1.6.0`** sau sáu minor — mỗi
  minor một migration, cả năm đều đồng nhất. Player đọc được minor hiện tại và n−1.
- 3943 test (69 tệp), 146 e2e, golden SVG phủ mọi step có hình.
- Coverage ước lượng khoảng **85%** các họ bài tổ hợp mà engine hiện tại có
  thể gánh phần lập luận. Đây là ước lượng chuyên gia, không phải benchmark
  trên một tập đề hoàn chỉnh; xem [`docs/VIZ-COVERAGE.md`](docs/VIZ-COVERAGE.md).
  Miền **đại số** có bảng đo riêng — [`docs/ALGEBRA-COVERAGE.md`](docs/ALGEBRA-COVERAGE.md),
  ~33% olympiad / ~88% phổ thông, và §3 nói rõ con số nào có bảng đỡ.

**Hai gate đã đóng ngày 2026-08-01**, theo chỉ định trực tiếp của chính chủ. Cả hai
đóng bằng một điều kiện *thay thế* chứ không phải bằng điều kiện gốc, nên chỗ đáng
đọc là phần rủi ro còn lại — [`docs/PLAN-P1.md`](docs/PLAN-P1.md) §10 ghi đủ:

- **G-C** — điều kiện gốc "soạn tay 3–5 bài rồi mới freeze" thay bằng "Style Guide
  v1.0 kết tinh từ **số đo** trên toàn kho" + một lượt rà toàn hệ vá lỗ schema ngay
  trước freeze. **Rủi ro còn nguyên:** người soạn vẫn là người duyệt, AUT-09 chưa
  từng chạy đúng vai. Ở một dự án một người thì thứ thay được cho người duyệt thứ
  hai là **máy** — và đó là lý do sổ chốt canh dài hơn sổ tính năng.
- **G-A** — đóng trên số đo proxy (Chromium headless có bóp CPU): NFR-P1 p95
  17.5ms @×4 trên trần 18ms, tức **sát trần**. iPad Gen 9 thật chưa từng được đo;
  nếu có thiết bị thì NFR-P1 là chỗ nhìn đầu tiên.

Hàng đợi làm mạnh từng engine — [`docs/ENGINE-BACKLOG.md`](docs/ENGINE-BACKLOG.md)
— **đã mở** kể từ khi G-C đóng và đang được lấy việc. `PRD-07` vẫn nguyên: không
thêm engine chỉ để tăng coverage, và mỗi hạng mục vẫn phải đi kèm nội dung.

Định hướng sản phẩm: [`docs/PRODUCT-REQUIREMENTS.md`](docs/PRODUCT-REQUIREMENTS.md).
Nó nằm **trên** SRS một tầng; SRS vẫn giữ quyền với mọi requirement ID đã có (PRD-01).

## Chín engine, và ranh giới của từng cái

| Engine | Bài | Vẽ được | Cố ý **không** làm |
|---|---:|---|---|
| `board` | 40 | lưới **vuông / tam giác / lục giác**, quân, tile (kể cả **trên lưới phi vuông**), vùng khuyết, bàn dán mép, bảng số, lan truyền, đường đi | bàn 3D / nhiều lớp; ô mang công thức; lưới vô hạn có cửa sổ trượt |
| `graph` | 36 | đa đồ thị, ghép cặp + König + Hall, ma trận kề, poset/Hasse + Dilworth, mã Prüfer, **tô mặt sau embedding**, tô đỉnh và tô cạnh đúng luật, đỉnh mang số | kiểm tính phẳng **tổng quát** (LR / PQ-tree); analyzer số sắc $\chi(G)$; luồng cực đại |
| `algebra` | 43 | cây biểu thức 16 kiểu nút, **83 luật**, và **kiểm tính đúng của từng bước** trên bốn sân: $\mathbb{F}_p$, thực, nguyên, chuỗi luỹ thừa hình thức | **không có bộ giải, không `simplify_all`, không gợi ý bước** (NG-03) — nó kể một chuỗi biến đổi đã biết và tự kiểm, không tìm ra lập luận |
| `sequence` | 19 | dãy số, đa tập, đống sỏi, thao tác lặp, dãy con đơn điệu, lan truyền | luật gộp là **enum đóng**, không cho nhập biểu thức |
| `game` | 10 | bốc đống: Grundy, misère, phổ một và **hai** chiều, Wythoff, trò Euclid, hợp luật, **luật nhớ nước trước** | mọi trò **không** phải đa tập số nguyên — chúng sống ở lớp ván chơi bên dưới, không ở engine này |
| `set` | 6 | bảng incidence, Venn ≤ 3 tập, dot/bar cho đa tập | Venn quá 3 tập — sự thật hình học, không phải giới hạn cài đặt |
| `point` | 3 | bao lồi, thẳng hàng, giao điểm, đường thẳng, lưới điểm | PT-03 tô vùng, đường tròn |
| `derivation` | 3 | chuỗi biến đổi; mỗi hạng tử có `id` nên nó **chuyển động** giữa hai bước | không hiểu công thức — nó xếp chỗ cho LaTeX, không phân tích cú pháp toán. Muốn máy **kiểm** đại số thì dùng `algebra` |
| `longdiv` | 1 | bảng chia đa thức có dư | một **bố cục**, không phải một họ bài — nó đóng góp $0$ vào con số coverage tổ hợp, và ghi bằng $0$ là cố ý |

Trên chín engine ấy có một **lớp ván chơi** (`packages/editor/src/play.ts`) — nó
nằm *ngang qua* ba engine chứ không phải engine thứ mười: Chomp trên `board`,
geography và Hackenbush **partizan** trên `graph`, bốc đống trên `game`. Solver là
một phép duyệt lùi trên `(thế, bên sắp đi)`, có trần đếm được, chạy trong Worker.
Ranh giới của nó: thế phải là thứ engine chủ mô tả được, và luật **toàn cục** thì
solver **không** bày `xor`/`grundy` ra DSL — trả một con số ở đó thì mọi `claim`
viết trên nó sẽ đạt trong khi con số ấy vô nghĩa. Chi tiết:
[`docs/ENGINE-GAME.md`](docs/ENGINE-GAME.md).

Cột phải được viết ra vì kho này đã trả giá vài lần cho **trường ma**: một trường
validate xanh mà renderer im lặng lờ đi. Engine nào cũng có phần chưa làm, và nói
ra rẻ hơn để ai đó phát hiện bằng một cái hình sai.

### Engine đại số kiểm được cái gì

Đây là engine duy nhất mà máy **giữ tính đúng của lập luận**, không chỉ giữ hình.
Mỗi bước khai một luật có tên; engine áp luật, rồi một hợp đồng kiểm bốc điểm ngẫu
nhiên để xác nhận bước ấy bảo toàn thứ nó phải bảo toàn — giá trị, tập nghiệm, hay
một chiều kéo theo. Bước nào không kiểm được thì nó **nói ra** thay vì im lặng cho
qua, và bước nào sai thì `validate` chặn ở cửa với `bounds/algebra-unsound`.

Kỷ luật đi kèm, và nó là phần đắt hơn cả tập luật: mọi suy diễn phải chạy qua
`readAlgebra` cho `refusal === null`, `unsound === []`, `unchecked === []` **trước
khi** một chữ narrative nào được viết. Bị từ chối thì đổi bài, không đổi narrative.
Chi tiết: [`docs/ENGINE-ALGEBRA.md`](docs/ENGINE-ALGEBRA.md) (§20 có bảng phân lớp
83 luật, và bảng ấy **có chốt canh đọc lại từ mã**).

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
phải có nút gọi tới. Trước ràng buộc này (M19, lúc kho có bảy engine), cả bảy dùng
chung một thanh công cụ toàn lệnh `board/*` — ở năm engine còn lại, bấm nút nào
cũng im lặng. Nay là **46 lệnh trên 9 engine**, và không lệnh nào sinh id, đọc giờ
hay random: sandbox phải replay được thì vết chân người học mới có nghĩa.

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
npx tsx tools/pipeline/src/cli.ts film catalan-first-return-gf --apng
npx tsx tools/pipeline/src/cli.ts schema --out schema.json
npx tsx tools/pipeline/src/cli.ts stats
npx tsx tools/pipeline/src/cli.ts eval knight-closed-tour-5x5 "count(cells, c => c.color_class == 1)"
```

`new` dựng khung một bài soạn tay: đủ trường bắt buộc, một step có scene mẫu **hợp lệ**
của engine ấy, anchor trỏ vào một id có thật, `status: draft` và `verified: false` nên nó
không publish nổi (AUT-09). Khung qua được `validate` ngay — có test ép điều đó cho **cả
chín** engine, vì một khung chạy lên là đỏ thì tệ hơn không có khung: nó bắt người soạn
debug thứ mình chưa viết.

Luồng nội dung là **draft → validate/lint → tác giả duyệt từng step → publish**.
`validate` kiểm tra schema, cấu trúc cây, anchor, bound, taxonomy, invariant và
validator trên mọi step; `--strict` biến cảnh báo thành lỗi. `render` dùng
chính renderer của Player nhưng chạy headless, không cần browser.

## Kiến trúc

```text
packages/
  schema/             schema + TypeScript types — hợp đồng trung tâm, và migration
  theme/              theme tokens — nguồn visual brand duy nhất
  dsl/                parser/interpreter DSL sandboxed
  render/             scene → SVG, diff, interpolate, DOM patch, choreography
  editor/             command layer, selection, undo/redo, lớp ván chơi + solver
  check/              bộ kiểm dùng chung bởi Studio, CLI và CI
  engines/
    board/ graph/ sequence/ set/ point/ game/ derivation/ longdiv/ algebra
  content/            problem JSON, taxonomy và assets
apps/
  player/             SPA công khai (Preact + Vite)
  studio/             app local-only cho Owner-Author
tools/
  pipeline/           CLI validate, render, import, migrate, OG, film và thống kê
  mutation-sweep.py   soát định kỳ: bẻ từng chốt canh, xem cái nào bẻ mà không đỏ
docs/                 SRS, roadmap, style guide và hai bảng coverage
```

Ba ràng buộc quan trọng được ESLint enforce: renderer không biết DOM,
schema không biết engine cụ thể, và LLM chỉ xuất hiện trong pipeline — không
bao giờ chạy trong runtime dành cho người học.

### Bản đồ `docs/`

| Tệp | Nói gì |
|---|---|
| [`SRS-v1.0.md`](docs/SRS-v1.0.md) | **nguồn của mọi requirement ID** — hệ thống *phải làm gì* |
| [`PRODUCT-REQUIREMENTS.md`](docs/PRODUCT-REQUIREMENTS.md) | sản phẩm *cần đi đâu*; nằm trên SRS một tầng, SRS thắng khi lệch (PRD-01) |
| [`PLAN-P1.md`](docs/PLAN-P1.md) | kế hoạch Phase 1, hồ sơ đóng gate, nhật ký milestone tới M48 |
| [`PLAN-M69.md`](docs/PLAN-M69.md) | M69 → nay, gồm bảng "M76 → 2026-08-02" và sổ nợ có tên còn mở |
| [`ENGINE-BACKLOG.md`](docs/ENGINE-BACKLOG.md) | hàng đợi từng engine, mỗi hạng mục có bằng chứng; §3b là lượt soát chốt canh |
| [`ENGINE-ALGEBRA.md`](docs/ENGINE-ALGEBRA.md) · [`ENGINE-BOARD.md`](docs/ENGINE-BOARD.md) · [`ENGINE-GAME.md`](docs/ENGINE-GAME.md) | mô tả **code đang chạy** của ba lớp dày nhất |
| [`VIZ-COVERAGE.md`](docs/VIZ-COVERAGE.md) · [`ALGEBRA-COVERAGE.md`](docs/ALGEBRA-COVERAGE.md) | phủ miền tổ hợp và miền đại số — **ước lượng**, và mỗi tệp tự nói chỗ nào chưa đo |
| [`STYLE-GUIDE.md`](docs/STYLE-GUIDE.md) | chuẩn biên tập, kết tinh từ số đo trên kho chứ không viết trước |

Tài liệu ở đây vừa là **sổ ghi chép** vừa là **mô tả hiện trạng**, và hai vai ấy
đọc khác nhau: một dòng "2948 test xanh, 111 bài" trong mục M62 là biên bản của
khoảnh khắc ấy — nó đúng, và sửa nó thành số hôm nay là làm sai lịch sử. Chỉ câu ở
**thì hiện tại** mới phải khớp `HEAD`. Lượt soát 2026-08-02 tìm ra mười hai chỗ
lệch, ghi ở `PLAN-M69.md`; bốn trong số đó tài liệu tự mâu thuẫn với chính nó.

## Giấy phép

- **Code/engine:** MIT — xem [`LICENSE`](LICENSE).
- **Nội dung** (bài, lời giải, hình, clip): CC BY-SA 4.0 — xem
  [`packages/content/LICENSE`](packages/content/LICENSE).
- Đề bài được ghi nguồn riêng trong trường `source`; license nội dung của kho
  không tuyên bố sở hữu các đề thi được trích dẫn.
