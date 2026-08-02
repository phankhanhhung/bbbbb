# CombViz — Editorial Style Guide

Trạng thái: **v1.0 — đã kết tinh trên 114 bài (G-C, 2026-08-01)** · Deliverable của AUT-10 · Đo lại trên 141 bài: 2026-08-02 (§2)

> **Đọc phần này trước.**
>
> §16 của SRS nói rõ: *"3–5 bài đầu soạn tay hoàn toàn để Style Guide kết tinh từ
> thực tế, rồi mới bật pipeline AUT-09 — Style Guide viết trước khi soạn bài nào
> là Style Guide bịa."*
>
> ~~Kho hiện có 2 bài, cả hai là **fixture kỹ thuật** dựng để thử engine, không phải
> bài do chính chủ soạn.~~ Câu ấy đúng lúc tài liệu này dựng lên, và **sai từ G-C**
> (2026-08-01) — nó vẫn nằm đây ba dòng dưới một tiêu đề khai "đã kết tinh trên 114
> bài", tức tài liệu tự mâu thuẫn với chính nó. Gạch đi thay vì xoá, vì nó là lý do
> §2 có hình dạng như bây giờ.
>
> Kho tại lượt soát 2026-08-02 có **141 bài**. Hai loại nội dung của tài liệu này
> giữ nguyên, nhưng loại thứ hai đã đổi nghĩa:
>
> - **Phần đã chốt** — những quy ước đã bị *code* ép, nên chúng đã là sự thật rồi,
>   viết ra chỉ là ghi lại.
> - ~~**Phần bỏ ngỏ**~~ → **Phần đã kết tinh** (§2) — những quyết định biên tập chỉ
>   trả lời được sau khi soạn thật. Chúng từng để trống có chủ đích; nay chúng được
>   **đo trên kho**, và mỗi con số ở §2 ghi rõ đo trên bao nhiêu bài. Điền bừa vào
>   đây vẫn tệ hơn để trống, vì một quy ước bịa vẫn sẽ được lint enforce.

---

## 1. Phần đã chốt (code đang ép)

### 1.1 Màu và ngữ nghĩa

`color_class` là **số**, không phải mã màu (DAT-20). Bảng màu nằm ở
`packages/theme/src/palette.ts` và là nguồn duy nhất.

| color_class | Vai trò ngữ nghĩa | Ghi chú |
|---|---|---|
| 1 | Lớp "đậm" / "đen" trong mọi lập luận tô hai màu | Bàn cờ: ô đen. Đồ thị: quan hệ thứ nhất |
| 2 | Lớp "nhạt" / "trắng" | Cặp 1–2 khác nhau về **độ sáng**, nên đọc được cả khi mất hoàn toàn cảm nhận màu |
| 3–7 | Lớp thứ ba trở đi, dùng khi `k ≥ 3` | Không mang nghĩa cố định |
| 8 | Xám than — dùng cho "loại khác / phần dư" | |
| 0 | **Chưa xét**, không phải một màu | `cell_overrides` và preset đều không sinh ra 0 |

Quy ước quan trọng nhất: **0 nghĩa là "chưa xét", không phải "màu thứ ba"**. DSL
dựa vào điều này — `c.color_class == 1` trả về `false` cho ô chưa tô thay vì lỗi.

### 1.2 Notation trong hình

Có **hai** loại nhãn trong canvas, và luật của chúng khác nhau. Mục này từng viết
"canvas chỉ nhận văn bản thuần, label atlas còn ở M6+" — câu đó **đã sai** từ M18,
khi label atlas (D-07, G-02) làm xong và engine `derivation` bắt đầu vẽ công thức
thật trong hình.

**Nhãn LaTeX** — chỉ ở trường `tex` của `derivation`, đi qua label atlas:

- Phải nằm trong atlas: `combviz labels --write` sau khi thêm công thức mới. Thiếu
  thì hình vẽ hẳn `⟨thiếu atlas: …⟩` ra màn hình và `pnpm labels` báo đỏ ở CI.
- **Không định nghĩa macro** (`\newcommand`, `\def`, `\DeclareMathOperator`…).
  Đây là hệ quả đã ghi của G-02, và nó có lý do cứng: MathJax giữ macro trong
  document, nên một nhãn định nghĩa `\zz` làm **nhãn khác** đọc được `\zz` —
  atlas thành hàm của *tập* nhãn thay vì của từng chuỗi. Phần sinh atlas dựng mỗi
  nhãn trong một document riêng **và** từ chối lệnh định nghĩa macro; hai lớp, vì
  đây là cửa mất tính xác định chứ không phải chuyện gu.
- Một hạng tử là **một** hạng tử: trần 120 ký tự. Nhét cả dòng vào một `tex` là
  mất sạch thứ engine sinh ra để có — từng hạng tử một danh tính, neo được, theo
  dõi được qua các bước.

**Nhãn văn bản thuần** — mọi engine còn lại (đỉnh đồ thị, đống sỏi, tập hợp, điểm,
ghi chú dòng). Chưa đi qua atlas, nên:

- Đỉnh đồ thị: đặt tên bằng số `1, 2, 3…` hoặc chữ `a, b, c…`. Không `$v_1$`.
- Ô bàn cờ: không đặt nhãn; vị trí đã là danh tính (`cell-3-4`).
- Ghi chú dòng của `derivation` (`row.note`) là **chữ**, không phải toán: viết
  `n = 4`, không viết `$n = 4$` — dấu `$` sẽ hiện ra nguyên trên hình.

LaTeX **được** dùng thoải mái trong `statement`, `narrative`, `case_label`,
`invariants[].label` — những chỗ đó render bằng KaTeX lúc chạy.

### 1.3 Tỉ lệ và đơn vị scene (G-10)

**Một ô bàn cờ, một khoảng cách giữa hai đỉnh chuẩn = 10 đơn vị scene.** Engine
mới chọn tỉ lệ theo quy ước này, không ngược lại. Con số ấy giờ là **một** hằng số
(`UNITS_PER_CELL` ở `@combviz/render`) mà cả bảy engine import — trước đây mỗi
engine tự khai `= 10`, tức bảy chỗ có thể lệch.

Trên màn hình, một ô luôn là **44px** — cùng con số với ngưỡng chạm NFR-A3. Scene
rộng quá pane thì co lại, **chỉ co không bao giờ giãn**, và hệ số co tính từ step
rộng nhất của cả bài. Hệ quả cho người soạn:

- Bài nhỏ **không** được thổi phồng cho đầy khung, và đó là chủ đích: bàn $4\times4$
  phải nhỏ hơn bàn $8\times8$ trên màn hình.
- Một step rất rộng sẽ **kéo cả bài co lại**, vì tỉ lệ dùng chung. Muốn tránh thì
  tách step rộng ra bài khác, đừng để một phổ 40 ô ngồi cùng bài với một hình 3 đỉnh.

### 1.4 Cấu trúc file

- `combviz fmt` quyết định định dạng. Không sửa tay thứ tự khoá.
- Id step: `s0, s1, …`; **không tái dùng số đã xoá** (A-02).
- Id anchor: `a1, a2, …` theo thứ tự xuất hiện trong narrative.
- Mỗi step lưu **snapshot scene đầy đủ** (DAT-11), không lưu delta.

### 1.5 `case_label`

Lint ép định dạng: `Trường hợp N: …` ở mức một, `Na: …` ở mức hai.

```
Trường hợp 1: ba cạnh đó màu 1
1a: có một cạnh màu 1 giữa chúng
```

Lý do là kỹ thuật: breadcrumb ghép chúng bằng `›`, nên chúng phải đọc được khi
đứng cạnh nhau.

### 1.6 Glossary

Kho chọn **một** cách gọi cho mỗi khái niệm (lint cảnh báo khi lệch):

| Dùng | Không dùng |
|---|---|
| hai phía | lưỡng phân |
| nguyên lý Dirichlet | nguyên lý chuồng bồ câu, pigeonhole |
| bất biến | bất biến số |
| ô | ô vuông nhỏ, hình vuông đơn vị |
| song ánh | song ánh học |

Cả hai cột đều đúng tiếng Việt. Chọn một là để người học không phải tự nhận ra
hai cách gọi là cùng một thứ — thuế nhận thức đó đánh vào đúng người ít khả năng
trả nhất.

### 1.7 Vi phạm có chủ đích

Lời giải thường phải bày ra đúng thứ sandbox cấm. Khai bằng `expects_violation`:

```json
{ "id": "s7", "expects_violation": ["no-mono-triangle"] }
```

Không khai thì lint kêu mãi; khai thừa (scene đã đổi, không còn vi phạm) thì lint
cũng kêu.

---

## 2. ~~Phần bỏ ngỏ — chờ 5 bài soạn tay~~ Phần đã kết tinh (G-C, 2026-08-01)

Các câu hỏi dưới đây để ngỏ từ v0.1, chờ "soạn thật rồi nhìn lại". Kho nay có **114
bài / 462 step** (đo lại 2026-08-02: **141 bài / 557 step** — xem bảng dưới), soạn qua pipeline AUT-09 và duyệt liên tục bởi chính chủ qua từng
mốc; chính chủ chỉ định đóng G-C trên corpus này. Mỗi câu trả lời dưới đây là **số đo
trên cả kho**, không phải quyết định bịa — đúng điều kiện mà v0.1 đặt ra để được điền.

> Số liệu 6 bài draft máy (M7) từng đứng ở đây đã bị thay: bảng dưới đo trên 114 bài.

> **Đo lại trên 141 bài / 557 step (2026-08-02).** Kho lớn thêm $24\%$ kể từ lúc kết
> tinh, nên câu đáng hỏi là *chuẩn này có giữ được không, hay nó chỉ mô tả một corpus
> đã đông cứng*. Số đo trả lời: **giữ được, và giữ gần như từng chữ số.**
>
> | | 114 bài (G-C) | 141 bài (nay) |
> |---|---:|---:|
> | step · narrative `vi` | 462 · 445 | 557 · 540 |
> | ký tự/narrative — trung vị · p90 · max | 166 · 295 · 415 | **175 · 299 · 415** |
> | câu/step — trung vị · p90 · max | 2 · 3 · 4 | **2 · 3 · 4** |
> | step/bài — trung vị · max | 4 · 11 | **4 · 11** |
> | anchor/step — trung vị · max | 1 · 5 | **1 · 5** |
> | step không anchor | 20 | **20** |
> | bài có invariant strip | 53/114 (46%) | 55/141 (39%) |
> | không xưng hô · "ta" · "chúng ta" | 428 · 17 · 0 | **522 · 18 · 0** |
> | câu hỏi tu từ | 15 (3%) | 18 (3%) |
> | "dễ thấy rằng" | 0 | **0** |
>
> Ba chỗ đáng đọc. **Max không nhích một đơn vị nào** ở bốn hàng có max — cùng bài
> $415$ ký tự, cùng bài 11 step, cùng 5 anchor. Trần không phải do lint chặn (cảnh
> báo ở 420 và 4 câu); corpus tự dừng dưới trần. **Số step không anchor đứng nguyên
> ở 20** trong khi kho thêm 95 step: 20 ấy là các step `m1`/`m2` của lớp ván chơi —
> nước đi, không có narrative — chứ không phải step quên neo. Và **`invariant` tụt
> từ 46% xuống 39%**: hai mươi bảy bài mới phần lớn là đại số và hàm sinh, nơi bất
> biến không phải công cụ chính. Đó là dịch chuyển **thành phần kho**, không phải
> chuẩn biên tập lỏng đi — và là con số duy nhất trong bảng cần nhìn lại nếu kho
> tiếp tục nghiêng về đại số.
>
> Các mục §2.1–§2.5 dưới đây giữ nguyên chữ; chỉ những chỗ số đổi mới được chú thích.

### 2.1 Độ dài một step — chốt

| | trung vị | p90 | max | lint hiện tại |
|---|---:|---:|---:|---|
| ký tự / narrative | 166 | 295 | 415 | cảnh báo 420 — **giữ**, corpus tựa sát trần mà không chạm (141 bài: 175 · 299 · **415**) |
| câu / step | 2 | 3 | 4 | cảnh báo 4 — **giữ** |
| step / bài | 4 | 5 | 11 | — (141 bài: 4 · 5 · **11**) |

"Một ý một step" trong thực tế = **một phép biến đổi hoặc một bổ đề**, và corpus giữ
được nó tới trung vị 4 step/bài. Giả định 15–25 step của AUT-KPI cho bài IMO **chưa
được kiểm** — bài dài nhất trong kho là 11 step; khi soạn bài IMO P1/P4 đầu tiên,
đo lại rồi mới sửa AUT-KPI.

### 2.2 Giọng văn — chốt

Đo trên 445 narrative: **428 không xưng hô** (96%), 17 dùng "ta" (chỗ kéo người đọc
vào một phép đếm chung), 0 "chúng ta". Chốt: **mặc định không xưng**; "ta" cho phép
khi lập luận cần một chủ thể đếm; "chúng ta" không dùng.

Câu hỏi tu từ: 15 step (3%) — dùng để **mở một nghi vấn thật** mà step sau trả lời,
không dùng làm màu. Giữ ở mức ấy.

"Dễ thấy rằng": **0 lần trong cả kho**, và giữ nguyên số 0 ấy. Chỗ nào "dễ thấy" thì
hoặc hình đã nói thay, hoặc phải viết ra.

### 2.3 Anchor — chốt

Trung vị **1 anchor/step**, max 5; 20/462 step không có anchor (đa số là step mở đầu
chỉ bày cấu hình). Đo lại trên 557 step: vẫn **đúng 20**, và nay chúng là các step
nước đi `m1`/`m2` của lớp ván chơi — không có narrative để neo vào. Chốt: mỗi step có ≥ 1 anchor trừ khi hình *là* toàn bộ nội dung.
Neo vào **danh từ có hình** ("đỉnh $v$", "ô $C_5^2$") là chính; neo cả mệnh đề khi
mệnh đề ấy trỏ vào một *tập* element ("ba cạnh cùng màu" → ba id).

### 2.4 Invariant — chốt

53/114 bài có invariant strip (đo lại: **55/141**, tức $46\% \to 39\%$ — kho nghiêng
sang đại số chứ chuẩn không lỏng đi; xem bảng đầu §2). Đặt tên theo **đại lượng đo được** ("Số cặp kề khác
màu"), không theo ý nghĩa ("Chướng ngại"); ý nghĩa thuộc về narrative. Bài nào strip
chỉ lặp lại một hằng số suốt mọi step mà narrative không nhắc tới nó → nhiễu, bỏ.

### 2.5 Độ sâu cây — chốt

Trung vị 3 mức, max 5 (23 bài chạm 5). Giới hạn mềm 4 mức của R-6 **đã bị corpus bác**
— nâng ghi nhận thành: mềm 5, cứng theo `checkDepth`. Sâu hơn 5 thì tách bài.

---

## 3. Checklist tự duyệt trước khi publish

Phần máy kiểm được thì `combviz validate` đã chạy. Đây là phần còn lại:

- [ ] Từng bước lập luận có đúng không — đọc lại như thể đang chấm bài người khác.
- [ ] Hình có **nói đúng** thứ narrative nói không? (Ví dụ: bàn cờ khuyết hai góc
      phải cho 30/32, không phải 31/31.)
- [ ] Bài này có phải lời giải của *mình* không, hay đang nhớ lại lời giải đã đọc
      ở đâu đó? (R-5)
- [ ] Nếu draft từ máy: có step nào mình đánh dấu verified mà chưa thật sự kiểm
      từng chữ không? (R-8 — cộng đồng oly bắt lỗi trong ngày.)
- [ ] Đề bài đã ghi nguồn đầy đủ chưa?
