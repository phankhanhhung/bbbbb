# Kế hoạch M69+ — sau freeze 1.0.0

**Ngày:** 2026-08-01 · **Bối cảnh:** G-C và G-A đã đóng (hồ sơ + rủi ro còn lại:
`PLAN-P1.md` §10). Schema `1.0.0` — từ đây mọi thay đổi tốn migration, nên kế
hoạch này cố ý **không có hạng mục nào đòi đổi schema**, trừ chỗ ghi rõ.

Nguồn của danh sách: (a) các phát hiện **hoãn có chủ đích** của lượt rà toàn hệ
trước freeze — từng cái đã được xác minh bằng chạy thật, không phải phỏng đoán;
(b) chân trời ghi ở kế hoạch M62–M68; (c) ba việc không phải của máy, ghi cuối.

Nguyên tắc xếp vẫn là nguyên tắc cũ: đâm thủng chỗ dễ chết nhất trước, mỗi tầng
nhìn được bằng mắt trước khi sang tầng sau, và mọi tính năng phải kể được
**chuyện kiểm** trước khi kể chuyện đẹp.

---

## M69 — Trả nợ đuôi của lượt rà (5 món, đều đã có địa chỉ) — ✅ **XONG 2026-08-01**

Các phát hiện thật, hoãn vì "không chặn freeze" — chứ không phải vì nhỏ:

> **Kết quả, và bốn thứ kế hoạch này không lường trước.** Cả năm món xong; ngoài
> ra lượt **nhìn PNG** của món 3 lôi ra ba lỗi hiển thị chưa ai biết, tất cả nằm
> trên đúng kênh growth chính:
>
> - `**đậm**` in nguyên **bốn dấu sao** ra ảnh trên **57/114** card — SVG không có
>   thẻ `<strong>` để đổi sang, và không lớp nào tước markup trước khi vẽ.
> - `defaultFontFamily` bỏ trống nên resvg **bốc bừa** một mặt trong danh sách vừa
>   nạp: tiêu đề **mọi** card in nghiêng, và dòng nào chỉ có ASCII in bằng
>   `KaTeX_Fraktur` — chữ "Pascal." hiện ra kiểu gô-tích giữa một tiêu đề sans.
> - `toReadableMath` nuốt cả `\{`, nên `$\{1,2,\dots,n\}$` ra `\1,2,…,n\`.
>
> Và món 4 hoá ra rộng hơn nhiều: **11 bài** đã khai nhãn cho vùng, không bài nào
> hiện ra chữ. Đặt nhãn ở ranh giới hai hàng kèm quầng nền — lượt nhìn đầu tiên
> đặt lửng giữa hàng trên và nhãn đâm thẳng vào glyph.
>
> Món 5 chốt lằn ranh thay vì để lửng: **markup phải giải được** (`[[…]]`,
> `{{…}}`) kiểm mọi thứ tiếng; **văn phong** (glossary, độ dài, số câu — đo trên
> 114 bài tiếng Việt) chỉ kiểm `vi`, và lý do ghi ngay tại `checkGlossary`.

1. **Định tuyến ∞ cho `sameSolutionSet`/`impliesSolutionSet`.** Chỉ `sameValue`
   biết hỏi `hasInfinity` để sang sân chuỗi; hai hợp đồng kia đi thẳng vào bốc
   điểm, `evalReal` trả `null` tại mọi nút `inf`, `done = 0` — nên **mọi** thao
   tác nhóm ★ trên một đẳng thức hàm sinh mang vệt vàng "không tìm được điểm nào"
   vĩnh viễn. Trung thực, nhưng là đúng thất bại M45 (vệt vàng thường trực tác
   giả không sửa được) trên đúng thể loại bài mà AL-16 dựng sân để phục vụ.
   *Chuyện kiểm:* `add_both_sides` trên `sum(k,0,inf,x^k) = 1/(1-x)` phải ra
   evidence xanh qua sân hệ số; làm lệch một vế phải bắt được với đúng chỉ số $k$.
2. **Khung chuyển step vẽ ở `ms` cũ.** Ở commit đầu sau `goTo`, render effect
   của Player đóng gói `timeline.ms` của step **trước** (reset đồng hồ nằm trong
   effect của `useChoreography`, chạy sau) — khung đầu của step mới được dựng tại
   một mốc lệch, `setDiff` đếm so với khung sai, rồi animation 260ms bay về khung
   sai trước khi bị cancel. *Chuyện kiểm:* e2e chuyển step trên bài có
   choreography, chụp khung ngay sau chuyển — phần tử `show`-muộn không được lộ.
3. **OG card của bài song ánh chỉ vẽ pane trái.** `composeCard` nhận một scene;
   19 bài mà điểm bán là song ánh thì card kể nửa câu chuyện — trong khi §11 coi
   OG là kênh growth chính. Ghép hai pane cạnh nhau cùng thước đo (G-10 lo tỉ
   lệ). *Chuyện kiểm:* card của `rooks-permutation-bijection` chứa mực của cả
   hai engine; đếm bằng máy, nhìn bằng mắt.
4. **Region `label` render thật.** Schema có trường, renderer câm — lượt rà đã gỡ
   label chết khỏi `pascal-two-proofs`. Vẽ label cạnh viền region (đi qua label
   atlas như mọi công thức trong canvas), rồi trả label cho bài pascal. Đây là
   món **duy nhất** trong M69 đụng hành vi vẽ — golden đổi có chủ đích.
5. **`narrative.en` mù kiểm.** Mọi lớp kiểm anchor/markup chỉ soi `.vi`; một bản
   dịch `.en` có `[[key]]` hỏng sẽ đi thẳng ra màn hình. Hoặc kiểm cả hai thứ
   tiếng, hoặc tuyên bố `.en` ngoài phạm vi P1 ngay trong schema doc — **chọn
   một**, không để lửng.

Không đổi schema. Quy mô: vừa. Cắt được: món 4 (đẩy xuống M74 cùng board).

## M70 — Bảng đo phủ miền đại số (nợ §19.3 của ENGINE-ALGEBRA) — ✅ **XONG 2026-08-01**

`VIZ-COVERAGE.md` đo phủ *tổ hợp*; `algebra`/`longdiv` đóng góp 0 vào đó, nên
mọi câu "engine đại số đáng hay không đáng mở rộng tiếp" đến giờ đều trả lời bằng
cảm giác. Dựng `docs/ALGEBRA-COVERAGE.md` cùng phương pháp: lấy một tập đề thật
(chuyên đề đại số olympiad + sách chuyên), phân rã theo kỹ thuật, đối chiếu với
73 luật + 4 sân kiểm hiện có, ra ba cột 🟢/🟡/❌ có dẫn chứng đề cụ thể. Kết quả
quyết định M71–M73 cái nào đáng làm trước — **đo rồi mới xây**, đúng thứ tự đã
giữ suốt từ VIZ-COVERAGE.

Không code. Quy mô: nhỏ-vừa. Không cắt — nó rẻ và nó lái các mục sau.

> **Kết quả: `docs/ALGEBRA-COVERAGE.md`.** Hai con số, cách nhau bốn lần —
> **~88%** cho miền phổ thông → chuyên, **~22%** cho olympiad thuần — nên câu
> "engine này đáng mở rộng tới đâu" trước hết là câu *engine phục vụ ai*, và đó
> là câu của chính chủ chứ không phải của bảng đo.
>
> Bảng **lái lại thứ tự M71–M73**: M73 (phương trình hàm) lên trước — 20% đề,
> phủ đúng $0$, mở được bằng một khái niệm duy nhất. M71 (dãy số) giữ chỗ — 15%
> đề, phủ 20%. M72 (tích chập) tụt xuống — 5% đề, đã phủ 55%, mua thêm ít nhất
> trong ba mục.
>
> Hai thứ ngoài dự kiến: **bất đẳng thức là họ lớn nhất của đại số olympiad
> (35%) mà engine phủ 5%** — chưa milestone nào nhắm tới, và §4.1 ghi lại vì sao
> phần *luật có tên* (AM–GM, Cauchy) vừa khuôn kiến trúc hiện có còn phần
> *"không mất tổng quát"* thì không. Và **bốn luật lượng giác** đã dựng mà chưa
> bài nào dùng — năng lực đã trả tiền, chỉ thiếu nội dung.

## M71 — Dãy số: chỉ số là `Expr` (`a_n`), `sum_telescope`, truy hồi — ✅ **XONG 2026-08-01**

Món M49 hoãn lần ba, giờ đủ đồ nghề: `big` + biến ràng buộc (M57), sân chuỗi
(M68). Ba việc một mạch: (1) `a_{n}` với chỉ số là `Expr` — `a_{k+1}` viết được,
(2) `sum_telescope` — anh em còn thiếu của `prod_telescope`, nhận dạng bằng cấu
trúc như bản tích, (3) quan hệ truy hồi như **nội dung** (dòng khai báo, không
phải bộ giải). *Chuyện kiểm:* bốc họ $a$ như đa thức bậc thấp ngẫu nhiên — cùng
mẹo Schwartz–Zippel của mọi sân; khứ hồi telescope; quét ngẫu nhiên bao luật mới.

Đụng schema engine (element mới trong config algebra? — không: `a_n` là nút
`fn`/`var` mở rộng trong DSL biểu thức, file bài không đổi shape). Quy mô: nặng.

## M72 — Hàm sinh tầng hai: tích chập, và hệ số như toán tử — ✅ **XONG 2026-08-01**

Vương miện thật của AL-16, hoãn từ M68 có chủ đích: (1) `series_product` — nhân
hai chuỗi, hệ số Cauchy $c_n = \sum a_k b_{n-k}$, choreography **đan hệ số** (pha
`from` của M62/CHO-12 sinh ra để làm đúng cảnh này); (2) $[x^n]$ như toán tử
trích hệ số — trả lời "hệ số của $x^5$ trong $(1+x)^{10}$" bằng một dòng có
kiểm. *Chuyện kiểm:* so với khai triển trực tiếp trên sân chuỗi, chính xác tuyệt
đối; bài đếm kẹo chia phần làm flagship.

Quy mô: nặng. Chờ M70 xác nhận độ phủ đáng giá (dự đoán: 🟡 to nhất của miền).

## M73 — Ký hiệu hàm không diễn giải (phương trình hàm Cauchy) — ✅ **XONG 2026-08-01**

`f` như ký hiệu **không diễn giải**: `f(x+y) = f(x) + f(y)` viết được, thế được,
đánh giá tại điểm **không** được (không có gì để đánh giá — và bộ kiểm phải nói
thế, `verified: false` trung thực). Kiểm các phép thế bằng cấu trúc (hợp đồng
`instance` sẵn có). Mở đúng một cánh cửa: chuyên đề phương trình hàm — mảng
olympiad lớn nhất mà kho chưa chạm.

Quy mô: vừa-nặng. Chờ số của M70.

## M74 — Board: element `path` hạng nhất — ✅ **XONG 2026-08-01**

Thay hack piece-glyph mũi tên (`lattice-path-binary-word` đang dùng): element
`path` đi qua dãy ô, vẽ nét liền có bo góc, id neo được từng đoạn. **Đụng
schema engine board** → minor bump + migration đầu tiên sau freeze (phép thử
thật của bộ máy DAT-02 ở thời 1.x — tự nó là một chuyện kiểm đáng làm). Kèm
region label (món M69.4 nếu đã cắt).

Quy mô: vừa.

## M75 — Bản đồ sandbox: vết chân người học — ✅ **XONG 2026-08-01**

Ghi lại đường đi trong sandbox (dãy command đã chạy) thành một minimap nhỏ —
không solver, không gợi ý, đúng ranh giới §4/NG-03 đã giữ. Người học nhìn thấy
mình đã thử gì; giáo viên nhìn thấy lớp đã thử gì. *Chuyện kiểm:* bản đồ là hàm
thuần của command log; hai người chạy cùng dãy lệnh thấy cùng bản đồ.

Quy mô: vừa. Cắt được nếu M71/M72 tràn.

---

## M76 → 2026-08-02 — việc đã chạy **sau** khi danh sách trên cạn

Danh sách M69–M75 hết ở đây, và việc thì không dừng. Mục này ghi lại phần chạy
tiếp, xếp theo lịch sử git, để không ai phải đọc `git log` mới biết dự án đang ở
đâu. **Chi tiết kỹ thuật nằm ở tài liệu engine tương ứng** — mục này chỉ là bản đồ.

| Hạng mục | Ngày | Hồ sơ đầy đủ |
|---|---|---|
| **M76 / M76b / M76c** — sắp chữ: thước đo lại bằng máy, dấu gộp vẽ bằng path, thang bậc font, ngoặc vuông vào thang | 08-01 | `ENGINE-ALGEBRA.md` §48–§50 |
| **M77.1–M77.5** — lượt soát engine đại số: **bốn lời hứa mà mã không giữ**, `readAlgebra` trả về thay vì ném, grammar §3.3 có răng, bốn export chết | 08-02 | `ENGINE-ALGEBRA.md` §51 |
| **M78.1–M78.8** — lớp ván chơi: hợp đồng nước đi, nim thành họ luật, Chomp trên board, solver tổng quát, ngữ pháp `moves` + Worker + ngân sách, geography & Hackenbush partizan, UX bàn chơi. Đóng `GM-01..04` | 08-02 | `ENGINE-GAME.md` (cả tài liệu) |
| **Loạt bài 1/4** — chiến lược thắng | 08-02 | `VIZ-COVERAGE.md` §2 |
| **Loạt bài 2/4** — tô màu & ghép cặp; kèm `GR-13` (`proper-colouring[:k]`) | 08-02 | `ENGINE-BACKLOG.md` §2.2 |
| **Loạt bài 3/4** — hàm sinh; nới `geometric_series`/`coeff_repeated_geometric` sang hệ số dẫn $a$ nguyên | 08-02 | `ENGINE-ALGEBRA.md` §44, §47 |
| **Loạt bài 4/4** — ba đề IMO có nguồn đầy đủ | 08-02 | `VIZ-COVERAGE.md` §2 |
| **GR-14** — đỉnh đồ thị mang được số; IMO 1986 bài 3 quay lại | 08-02 | `ENGINE-BACKLOG.md` §2.2 |
| **GR-15** — `proper-edge-colouring[:k]`, nợ cuối của mạch đồ thị | 08-02 | `ENGINE-BACKLOG.md` §2.2 |
| **AL-20** — phân thức riêng phần (nghiệm hữu tỉ phân biệt) + mô hình sai số nhận biết triệt tiêu | 08-02 | `ENGINE-ALGEBRA.md` §44 |
| **Soát chốt canh bằng bẻ răng hàng loạt** — 19 mutant, 16 chết, **3 sống sót** | 08-02 | `ENGINE-BACKLOG.md` §3b |
| **Soát tài liệu** — đối chiếu cả 11 tệp `docs/` với mã và kho tại HEAD; 12 chỗ khai sai | 08-02 | mục "Soát tài liệu" ngay dưới |
| **Soát minimap** — bảy ý: khoá tỉ lệ, bàn phím, sợi/cây, độ phủ nhánh, glyph, ga hội tụ, nhánh ma + xương sống | 08-02 | `PLAN-P1.md` §G-03 (lượt sửa chốt) |
| **Nhúng phông vào raster** — đóng `PLAN-P1.md` §10.3, món cuối của §10 mà máy làm được | 08-02 | `PLAN-P1.md` §10.3 |
| **Ba bài lượng giác** — tiêu bốn luật đã dựng mà chưa bài nào dùng; §5 tụt 12 → 8 | 08-02 | `ALGEBRA-COVERAGE.md` §5 |
| **Chữ toán trên OG card**: `\sin` không còn bị xoá im lặng; 31 lệnh khác cũng thế | 08-02 | `PLAN-P1.md` §10.3c |
| **Tiêu đề OG đo bề rộng thật** — đóng `PLAN-P1.md` §10.3b, `18/144 → 0` card tràn | 08-02 | `PLAN-P1.md` §10.3b |
| **AL-21** — bất đẳng thức có tên: `am_gm`, `cauchy_schwarz` + 3 bài; đóng phần *có tên* của §4.1 | 08-02 | `ENGINE-ALGEBRA.md` §52 |
| **AL-22** — kết luận về hàm: `config.assume` + `use_injective` + 1 bài; schema `1.6.0` | 08-02 | `ENGINE-ALGEBRA.md` §53 |
| **Hai cổng đếm sandbox** nói ngược nhau — `coverage` đỏ 7 bài mà `validate` xanh; gộp về một vị từ | 08-02 | `ENGINE-BACKLOG.md` §3b.1 |
| **AL-23** — hộp cát đại số: 3 bài đầu tiên đi qua đường M65; builtin `reaches`; một chốt canh luôn xanh từ AL-07 bị gỡ | 08-02 | `ENGINE-ALGEBRA.md` §54 |
| **Tên phép toán ăn một đối số** — `\tan\frac{a+b}{2}` hết phẳng; kèm hai lỗ dán dính chưa ai biết | 08-02 | `PLAN-P1.md` §10.3c |

Kho đi từ **114 bài → 149 bài** trong hai ngày, test từ **3459** (M78.8) lên
**3956 / 69 tệp**, schema từ `1.0.0` lên `1.6.0` — sáu minor, sáu migration đồng nhất.

> **Một cái bẫy đếm, ghi ra để lần sau không phải điều tra lại.** Con số chính thức
> là số của `pnpm test` (`vitest run` không lọc đường dẫn) — **3843 / 67 tệp** lúc
> ghi dòng này. Còn
> `tools/mutation-sweep.py` chạy `vitest run packages tools/pipeline/test` — hẹp
> hơn — và cho **3803 / 63 tệp**. Hai con số cùng đúng, chỉ khác phạm vi quét.
> Chênh lệch $40$ test ấy nằm gọn trong **bốn tệp của `apps/`**:
> `player/test/bijection-morph`, `player/test/bijection`, `player/test/play-host`,
> `studio/test/edits`. Chúng từng nằm ngoài tầm với của `tools/mutation-sweep.py`,
> nên mutant nào chỉ bị bốn tệp ấy bắt sẽ hiện ra là "sống sót". Đã sửa — công cụ
> nay quét đúng lệnh của `pnpm test`; xem `ENGINE-BACKLOG.md` §3b.

### Bốn chuyện đáng giữ từ đoạn này

1. **Lỗi trội của dự án không đổi: "một khẳng định mà mã không đỡ".** M77 tìm
   thấy bốn cái, lượt soát tài liệu 2026-08-02 tìm thêm năm cái nữa ở tầng
   `docs/`. Cùng một hình dạng ở hai tầng khác nhau.
2. **Bẻ răng lên quy mô.** `tools/mutation-sweep.py` bẻ từng chốt canh một, chạy
   cả bộ test, so số test hỏng với mốc, rồi khôi phục. Kết luận không phải "test
   yếu" mà là **phân bố**: 16 mutant chết to (39, 148, 14 test đỏ), 3 chỗ không
   răng nằm rải rác — chỉ quét mới tìm ra.
3. **`expects_violation`.** Một step khai rằng nó **cố ý** vi phạm một validator
   sandbox. Không có nó thì "validator đỏ mãi" là một lỗi phải giấu; có nó thì
   validator đỏ mãi **là** bài học.
4. **Dò trước khi soạn.** Mọi suy diễn đại số chạy qua `readAlgebra` và phải cho
   `refusal === null`, `unsound === []`, `unchecked === []` **trước khi** một chữ
   narrative nào được viết. Bị từ chối thì đổi bài, không đổi narrative.

### Soát tài liệu (2026-08-02) — mười hai chỗ `docs/` khai sai thực tế

`PRODUCT-REQUIREMENTS.md` PRD-06 nói thẳng rằng đồng bộ số liệu **không phải một
task mà là một luật thường trực**: *"con số trong tài liệu phải khớp kho ở **mỗi**
commit đổi kho."* Luật ấy đã trượt. Lượt này đối chiếu cả 11 tệp `docs/` với mã và
kho tại HEAD, đo bằng máy chứ không bằng trí nhớ.

**Nguyên tắc phân loại, vì nó quyết định cái gì được sửa:** tài liệu của kho này
vừa là *sổ ghi chép lịch sử* vừa là *mô tả hiện trạng*. Một dòng ghi "2948 test
xanh, 111 bài validate sạch" ở mục M62 là **đúng** — nó là biên bản của khoảnh khắc
ấy, và sửa nó thành số hôm nay là làm sai lịch sử. Chỉ những câu ở **thì hiện tại**
mới bị đối chiếu. Ranh giới ấy được giữ ở từng chỗ sửa.

| # | Chỗ | Khai | Thực tế |
|---:|---|---|---|
| 1 | `PLAN-P1.md` dòng trạng thái | "M48 xong; schema `0.3.0`; kho 91 bài; G-C chưa đóng" | sai cả bốn trường — và §10 của **chính tài liệu ấy** đã ghi G-C đóng từ hôm trước |
| 2 | `PLAN-P1.md` §10 đoạn cuối | "Kho có 73 bài … việc còn nợ là G-C" | mâu thuẫn với mục 2 cách đó mười lăm dòng |
| 3 | `ENGINE-ALGEBRA.md` §20 | "**79 luật**, xếp theo mười một lớp" | **80 luật**, và bảng chỉ khai **72** — tám luật có trong mã mà không có trong bảng |
| 4 | `ENGINE-ALGEBRA.md` §21.1 | "hai sân, chọn theo `hasRadical`" | `needsRealEval` — và lượt đổi tên ghi ở **§22.2 của chính tài liệu ấy**, cách chín mươi dòng |
| 5 | `ALGEBRA-COVERAGE.md` §3 | "làm cùng phép tính với cột phổ thông cho **~88**" | làm thật ra **~65** (số M70), **~68** (số nay). Bảng có một cột "Phủ" cho **hai** miền |
| 6 | `ALGEBRA-COVERAGE.md` §2, §5 | 73 luật · 60 dùng · 13 chưa dùng · 14 kiểu nút · 28/114 bài | 80 · 68 · 12 · 16 · 36/141 |
| 7 | `STYLE-GUIDE.md` mở đầu | "Kho **hiện có 2 bài**, cả hai là fixture kỹ thuật" | ba dòng dưới một tiêu đề khai "đã kết tinh trên **114 bài**" |
| 8 | `VIZ-COVERAGE.md` §8 | "kho 66 bài … việc còn nợ là G-C, rồi mới đóng băng schema `1.0.0`" | G-C đóng, schema `1.5.0`, kho 141 bài |
| 9 | `PRODUCT-REQUIREMENTS.md` §3.1 | "**Bảy** engine, đúng số đang chạy trong repo" | **chín** — thiếu `longdiv` và `algebra` |
| 10 | `SRS-v1.0.md` SBX | "`algebra` (79 luật, một lệnh `apply_rule`)" | 80 luật, và tên lệnh thật là `algebra/apply-rule` |
| 11 | `ENGINE-BOARD.md` §1, §12, §15 | 83 bài / 30 board / 100 trên 353 scene · "13 lệnh" · sáu dòng đếm sai | 141 / 40 / 137 trên 562 · **14** lệnh (thiếu `board/chomp-bite` của M78.3) · đếm lại cả bảng |
| 12 | `ENGINE-BACKLOG.md` §0.1, §0.4 | schema "`1.1.0`" · "`AL-*` — **chưa mở**" | `1.5.0` · đã chạy tới `AL-20` |

Cộng thêm hai lỗi của **chính công cụ soát** (`tools/mutation-sweep.py`), ghi ở
`ENGINE-BACKLOG.md` §3b: phạm vi quét hẹp hơn `pnpm test` đúng bốn tệp, và bỏ qua
mutant trong im lặng khi chuỗi tìm lệch — mà nó **đã** bỏ qua thật một mutant kể từ
lượt tách `unsoundIssue()`.

**Hai hình dạng, và cả hai đều không có gì đỏ khi chúng sai.**

*Một — tài liệu tự mâu thuẫn với chính nó.* Bốn trong mười hai chỗ (số 1, 2, 4, 7)
không phải quên ghi: chỗ đúng nằm ngay trong cùng tệp, có khi cách vài dòng. Tức
lỗi không nằm ở chỗ *biết*, mà ở chỗ **sửa một nơi rồi coi là xong**. Dòng trạng
thái ở đầu tệp là nạn nhân điển hình — nó là thứ người ta đọc đầu tiên và sửa cuối
cùng.

*Hai — đổi tên là kiểu mục nát êm nhất.* `hasRadical → needsRealEval` không làm
hỏng gì, không đỏ ở đâu, chỉ để lại một cái tên `grep` không ra. Test không bắt
được, người đọc không nghi ngờ, và nó sống hơn ba mươi hạng mục.

**Cái được lắp thay vì chỉ được sửa.** Một trong mười hai chỗ nay có răng:
`engine.test.ts` đọc bảng phân lớp §20 của `ENGINE-ALGEBRA.md`, gom mọi tên trong
nháy ngược, so với `RULES`, và so luôn con số trong câu dẫn — thừa một tên đỏ,
thiếu một tên đỏ, lệch con số đỏ. Nó đứng cạnh chốt canh grammar §3.3 vốn đã có từ
M77.3, và hai cái đó là **toàn bộ** phần tài liệu mà máy giữ được. Mười một chỗ còn
lại vẫn phải soát tay — nhưng nay ít nhất chúng có một danh sách và một ngày.

### Nợ có tên còn mở sau đoạn này

- **Nhánh giả thiết** — *"không mất tổng quát, giả sử $a \ge b \ge c$"*. Phần *luật
  có tên* của bất đẳng thức đã đóng ở AL-21, nên nợ này hết mờ: nó không còn là "vài
  luật chưa cài" mà là **một khái niệm chưa có**. `ALGEBRA-COVERAGE.md` §4.1,
  `ENGINE-ALGEBRA.md` §52.4.
- **Toàn ánh, đơn điệu, "$f$ là hằng"** — họ *kết luận về hàm* mới có **một** thành
  viên (đơn ánh, AL-22). Khuôn để thêm đã có và đã chạy qua một bài thật, nên nợ này
  nay là "điền vào khuôn" chứ không phải "dựng khuôn". `ENGINE-ALGEBRA.md` §53.
- **Binet / $\frac{1}{1-P(x)}$ với $\deg P \ge 2$** — sau ranh giới vô tỉ mà
  `series.ts` tự vạch. `ALGEBRA-COVERAGE.md` §5.1.
- **`point` đứng yên ở 3 bài** kể từ M36 — nội dung trước, đúng luật
  `ENGINE-BACKLOG.md` §0.3.
- ~~**`\frac` ngay sau tên phép toán vẫn nhập nhằng khi làm phẳng.**~~ — đóng
  2026-08-02: `structures()` bọc cụm liền sau mười lăm tên phép toán, `\tan\frac{a+b}{2}`
  ra `tan((a+b)/2)`, và chỗ vòng bằng `\left(...\right)` đã gỡ. Lượt dò kéo theo hai lỗ
  **dán dính** chưa ai biết — `$\max\frac{a}{b}$` ra `/b`, `$\sin 3x\cos x$` ra
  `sin 3xcos x` ở 6 chỗ. `PLAN-P1.md` §10.3c.
- ~~**Bài đại số chưa bài nào có sandbox**~~ — đóng ở AL-23: `3/44` bài đại số bật hộp
  cát. Ghi lại vì cái giá của nó: lượt đi đầu tiên qua đường ấy tìm ra validator
  `reaches:` đã **luôn xanh** kể từ AL-07, và không phép bẻ răng nào bắt được vì không
  bài nào gọi nó. `ENGINE-ALGEBRA.md` §54.2.

---

## Việc không phải của máy (chờ chính chủ, ghi để không trôi)

- **Bài tay đầu tiên của chính chủ** — phép thử thật đầu tiên của Style Guide
  v1.0 và của AUT-09 đúng vai. Mọi milestone trên đều không thay được nó.
- **Đo G-A trên iPad Gen 9 thật** khi có thiết bị — NFR-P1 (17.5ms/18ms @×4) là
  chỗ nhìn đầu tiên.
- **Pilot ≥10 học sinh + 2 GV** (DoD §15.5), **nhúng phông vào raster**
  (PLAN-P1 §10.3), **domain + handle** (§10.6).

## Không làm — kỷ luật giữ nguyên

Không `simplify_all`, không bộ giải, không gợi ý bước, không mở ngữ pháp hàm tuỳ
ý, không số phức, không mp4/ffmpeg trong repo. Hào của platform là chỗ nó dám
nói không.

## Chốt canh chung — như mọi đợt

1. Quét ngẫu nhiên bao mọi luật mới; khứ hồi bao mọi cặp luật hai chiều.
2. Bẻ răng từng cơ chế mới trước khi tin nó.
3. Golden bất biến ở hạng mục thuần tương tác; churn có chủ đích thì máy-soát
   từng attribute rồi mới nhận.
4. Nhìn PNG/APNG ở đúng mật độ 4.4px/đơn vị — mọi lỗi hiển thị từ M47 tới M68
   đều lộ ở lượt nhìn, không ở test.

```bash
pnpm check      # index && typecheck && lint && test && validate && labels
CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm e2e
python3 tools/mutation-sweep.py                    # thoát ≠ 0 nếu có mục BỎ QUA
npx tsx tools/pipeline/src/cli.ts coverage         # bảng điểm DoD §15.1
```

Hai lệnh cuối **không** nằm trong `pnpm check`, và đó là lý do chúng phải có tên ở đây:
một cổng chỉ đáng tin bằng lượt chạy gần nhất của nó. `combviz coverage` vào danh sách
sau khi nó báo đỏ bảy bài suốt từ M78 mà không ai chạy — `ENGINE-BACKLOG.md` §3b.1.
