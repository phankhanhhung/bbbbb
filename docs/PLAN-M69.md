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

## M70 — Bảng đo phủ miền đại số (nợ §19.3 của ENGINE-ALGEBRA)

`VIZ-COVERAGE.md` đo phủ *tổ hợp*; `algebra`/`longdiv` đóng góp 0 vào đó, nên
mọi câu "engine đại số đáng hay không đáng mở rộng tiếp" đến giờ đều trả lời bằng
cảm giác. Dựng `docs/ALGEBRA-COVERAGE.md` cùng phương pháp: lấy một tập đề thật
(chuyên đề đại số olympiad + sách chuyên), phân rã theo kỹ thuật, đối chiếu với
73 luật + 4 sân kiểm hiện có, ra ba cột 🟢/🟡/❌ có dẫn chứng đề cụ thể. Kết quả
quyết định M71–M73 cái nào đáng làm trước — **đo rồi mới xây**, đúng thứ tự đã
giữ suốt từ VIZ-COVERAGE.

Không code. Quy mô: nhỏ-vừa. Không cắt — nó rẻ và nó lái các mục sau.

## M71 — Dãy số: chỉ số là `Expr` (`a_n`), `sum_telescope`, truy hồi

Món M49 hoãn lần ba, giờ đủ đồ nghề: `big` + biến ràng buộc (M57), sân chuỗi
(M68). Ba việc một mạch: (1) `a_{n}` với chỉ số là `Expr` — `a_{k+1}` viết được,
(2) `sum_telescope` — anh em còn thiếu của `prod_telescope`, nhận dạng bằng cấu
trúc như bản tích, (3) quan hệ truy hồi như **nội dung** (dòng khai báo, không
phải bộ giải). *Chuyện kiểm:* bốc họ $a$ như đa thức bậc thấp ngẫu nhiên — cùng
mẹo Schwartz–Zippel của mọi sân; khứ hồi telescope; quét ngẫu nhiên bao luật mới.

Đụng schema engine (element mới trong config algebra? — không: `a_n` là nút
`fn`/`var` mở rộng trong DSL biểu thức, file bài không đổi shape). Quy mô: nặng.

## M72 — Hàm sinh tầng hai: tích chập, và hệ số như toán tử

Vương miện thật của AL-16, hoãn từ M68 có chủ đích: (1) `series_product` — nhân
hai chuỗi, hệ số Cauchy $c_n = \sum a_k b_{n-k}$, choreography **đan hệ số** (pha
`from` của M62/CHO-12 sinh ra để làm đúng cảnh này); (2) $[x^n]$ như toán tử
trích hệ số — trả lời "hệ số của $x^5$ trong $(1+x)^{10}$" bằng một dòng có
kiểm. *Chuyện kiểm:* so với khai triển trực tiếp trên sân chuỗi, chính xác tuyệt
đối; bài đếm kẹo chia phần làm flagship.

Quy mô: nặng. Chờ M70 xác nhận độ phủ đáng giá (dự đoán: 🟡 to nhất của miền).

## M73 — Ký hiệu hàm không diễn giải (phương trình hàm Cauchy)

`f` như ký hiệu **không diễn giải**: `f(x+y) = f(x) + f(y)` viết được, thế được,
đánh giá tại điểm **không** được (không có gì để đánh giá — và bộ kiểm phải nói
thế, `verified: false` trung thực). Kiểm các phép thế bằng cấu trúc (hợp đồng
`instance` sẵn có). Mở đúng một cánh cửa: chuyên đề phương trình hàm — mảng
olympiad lớn nhất mà kho chưa chạm.

Quy mô: vừa-nặng. Chờ số của M70.

## M74 — Board: element `path` hạng nhất

Thay hack piece-glyph mũi tên (`lattice-path-binary-word` đang dùng): element
`path` đi qua dãy ô, vẽ nét liền có bo góc, id neo được từng đoạn. **Đụng
schema engine board** → minor bump + migration đầu tiên sau freeze (phép thử
thật của bộ máy DAT-02 ở thời 1.x — tự nó là một chuyện kiểm đáng làm). Kèm
region label (món M69.4 nếu đã cắt).

Quy mô: vừa.

## M75 — Bản đồ sandbox: vết chân người học

Ghi lại đường đi trong sandbox (dãy command đã chạy) thành một minimap nhỏ —
không solver, không gợi ý, đúng ranh giới §4/NG-03 đã giữ. Người học nhìn thấy
mình đã thử gì; giáo viên nhìn thấy lớp đã thử gì. *Chuyện kiểm:* bản đồ là hàm
thuần của command log; hai người chạy cùng dãy lệnh thấy cùng bản đồ.

Quy mô: vừa. Cắt được nếu M71/M72 tràn.

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
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm e2e
```
