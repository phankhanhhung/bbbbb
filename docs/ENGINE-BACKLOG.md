# CombViz — Checklist làm mạnh từng engine

**Ngày:** 2026-07-30 · **Trạng thái:** backlog có bằng chứng, **không phải kế hoạch chạy ngay**

## 0. Đọc checklist này đúng cách

### 0.1 Nó không được chạy trước G-C

`PRODUCT-REQUIREMENTS.md` §9 xếp P0 trước, và `R-13` nói thẳng: xây thêm năng lực
trong khi chưa có bài nào do chính chủ soạn là **R-1** (content bottleneck) ở dạng
mới. `PRD-07` cấm thêm engine chỉ để tăng coverage. Tài liệu này là **danh sách
chờ**, dựng sẵn để khi mở ra thì không phải nghĩ lại — không phải lệnh xuất phát.

### 0.2 Mỗi hạng mục phải có bằng chứng, không có ý tưởng suông

Cột **Bằng chứng** trỏ tới một dòng 🟡/❌ cụ thể trong `VIZ-COVERAGE.md` §2, hoặc
một ID có sẵn trong SRS. Hạng mục nào không trỏ được vào đâu thì xuống **Tầng B**
và ở đó cho tới khi có một bài thật đòi nó. Luật này tồn tại vì kho đã hai lần hạ
số coverage sau khi đo lại (M11, M17b) — thêm năng lực theo cảm giác là cách nhanh
nhất để lặp lại chuyện đó.

### 0.3 Với bốn engine mỏng bài, **nội dung đi trước năng lực**

Đo trên 56 bài đã xuất bản:

| Engine | Số bài | Đọc con số này thế nào |
|---:|---:|---|
| `board` | 20 | Chủ lực. Khoảng trống ở đây là khoảng trống **thật sự cảm thấy được**. |
| `graph` | 18 | Chủ lực. Cùng loại. |
| `sequence` | 10 | Đủ để tin. |
| `game` | 3 | Năng lực đi trước nội dung — nhưng xem §2.6, ba hạng mục ở đó **rẻ** và mỗi cái có một bài kinh điển đứng chờ sẵn. |
| `point` | 3 | Nội dung trước. Engine chưa bị dùng đủ để biết nó thiếu gì. |
| `set` | 3 | Nội dung trước. |
| `derivation` | 2 | Nội dung trước — và dòng 🟡 duy nhất của nó nói **thiếu bài**, không thiếu năng lực. |

Bốn engine cuối cộng lại có **11 bài**. Thêm năng lực cho một engine mới 2–3 bài là
đoán, không phải đáp ứng.

### 0.4 Họ ID

Hạng mục nào đã có ID trong SRS thì **dùng lại**, không đặt tên mới (PRD-01). Hai
họ mới cho hai engine dựng ngoài roadmap SRS nên chưa có họ nào:

| Họ | Engine |
|---|---|
| `SQ-*` | sequence / multiset |
| `DV-*` | derivation |

---

## 1. Bảng ưu tiên — đọc trước, chi tiết ở §2

Sắp theo **bằng chứng × trọng số họ bài × độ rẻ**, không theo engine.

| # | Hạng mục | Engine | Mở khoá | Rẻ? | Bằng chứng |
|---:|---|---|---|---|---|
| 1 | `GM-05` nước đi đụng **nhiều** đống | game | Wythoff | rất rẻ | ❌ "một nước chỉ đụng **một** đống" |
| 2 | `GM-06` luật đọc đống khác | game | trò Euclid | rất rẻ | ❌ "nước ăn theo đống kia" |
| 3 | `GM-07` hợp hai luật | game | Nim Lasker | rất rẻ | §4 "`rule` là **một** thành viên" |
| 4 | `SQ-01` analyzer dãy con đơn điệu | sequence | Erdős–Szekeres | rẻ | 🟡 "thiếu analyzer dãy con đơn điệu" |
| 5 | `GR-09` analyzer mã Prüfer | graph | Cayley $n^{n-2}$ | rẻ | 🟡 "thiếu analyzer sinh mã Prüfer" |
| 6 | `BD-08`+`SQ-02` luật lan truyền | board+seq | chip-firing, lights-out | vừa | 🟡 "thiếu luật lan truyền" |
| 7 | `BD-07` lưới tam giác / lục giác | board | phủ hình phi vuông | vừa | §2 — engine **không vẽ được** |
| 8 | `GR-05` tô mặt sau embedding | graph | công thức Euler, tô mặt | vừa | SRS `GR-05` [P2] |
| 9 | `GR-07` ma trận đồng bộ hai chiều | graph | đếm hai chiều | vừa | SRS `GR-07` [P2] |
| 10 | `PRN-04` animation biến hình | cross | **cả họ song ánh (14%)** | đắt | §2 "còn thiếu: animation biến hình của PRN-04" |
| 11 | `BD-05` vùng khuyết vẽ tay + torus | board | bài trên hình xuyến | vừa | SRS `BD-05` [P2] |
| 12 | `ST-03` dot/bar cho đa tập | set | đếm theo lớp | rẻ | SRS `ST-03` [P2] |

`PRN-04` là hạng mục **trọng số cao nhất** trong bảng — nó là khoảng trống duy nhất
còn lại của họ "Đếm / song ánh" (14% đề thi, đang ở 85%). Nhưng nó phụ thuộc
`CHO-05` (morph) của PRD, nên nó thuộc P1 của PRD chứ không phải việc engine.

---

## 2. Chi tiết theo engine

### 2.1 `board` — 20 bài, engine chủ lực

**Tầng A**

- **BD-07 [P2] SHOULD** — **lưới tam giác và lục giác.** Hôm nay board chỉ có lưới
  vuông, nên cả họ phủ hình phi vuông (lục giác, tam giác, kim cương) **không vẽ
  được cách nào**. Đây là khoảng trống lớn nhất còn lại của engine được dùng nhiều
  nhất. Hình học: toạ độ trục cho lục giác, giữ nguyên quy ước `UNITS_PER_CELL`.
- **BD-08 [P2] SHOULD** — **luật lan truyền**: một thao tác kéo theo thay đổi ở ô
  lân cận theo luật đóng (chip-firing đổ hạt sang láng giềng, lights-out lật chữ
  thập). Dòng 🟡 của chip-firing nói đúng chỗ này. Phải là **tập luật đóng**, cùng
  khuôn với `GameRule` và `COMBINE_RULES` — không phải script.
- **BD-05 [P2] SHOULD** — công cụ **vẽ** vùng khuyết và region tuỳ ý (config đã có
  từ P1); **[P2] MAY** torus wrap. Torus mở một họ nhỏ nhưng thật.

**Tầng B — chưa có bài nào đòi**

- bàn 3D / nhiều lớp; bảng số có công thức trong ô; lưới vô hạn có cửa sổ trượt.

### 2.2 `graph` — 18 bài, engine chủ lực

**Tầng A**

- **GR-09 [P2] SHOULD** — **analyzer mã Prüfer.** Dòng 🟡 của Cayley $n^{n-2}$ nói
  đúng một câu: "view song ánh đã có; thiếu analyzer sinh mã Prüfer". Một analyzer
  biến một 🟡 thành ✅, và đó là bài song ánh kinh điển nhất.
- **GR-10 [P2] SHOULD** — **analyzer cây**: đường kính, tâm/trọng tâm, đếm lá, dãy
  bậc. Hôm nay chỉ có liên thông chung. Họ bài về cây là họ thường trực.
- **GR-05 [P2] SHOULD** — phần còn lại: **planar embedding rồi tô mặt.** Đã có
  chứng minh phẳng qua hình vẽ và chặn Euler; thiếu embedding nên chưa tô mặt được.
- **GR-07 [P2] MAY** — ma trận kề **đồng bộ hai chiều** với canvas (chọn ô ↔ sáng
  cạnh). View ma trận đã có từ M12, phần đồng bộ thì chưa. SRS gọi nó là cầu nối
  sang đếm hai chiều.

**Tầng B — cố ý không làm**

- **kiểm tính phẳng tổng quát** (LR / PQ-tree). Đã từ chối có lý do viết ra trong
  `VIZ-COVERAGE.md` §4: hai đường hiện có đúng là hai đường mà lời giải thi đấu
  dùng thật. Giữ nguyên quyết định.
- luồng cực đại / cắt nhỏ nhất — hiếm trong tổ hợp thi đấu.

### 2.3 `sequence` — 10 bài

**Tầng A**

- **SQ-01 [P2] SHOULD** — **analyzer dãy con đơn điệu dài nhất** (tăng và giảm).
  Dòng 🟡 của Erdős–Szekeres nói đúng chỗ này, và Erdős–Szekeres là một trong những
  kết quả hay được ra đề nhất. Một analyzer, một 🟡 thành ✅.
- **SQ-02 [P2] SHOULD** — **luật lan truyền cho quá trình lặp**, song song `BD-08`.
  Cùng một họ bài nhìn từ phía dãy: "mỗi bước, thay $a_i$ bằng …".

**Tầng B**

- dãy hai chiều; dãy vô hạn có chu kỳ; đa tập có phần tử trùng lặp lớn.

### 2.4 `set` — 3 bài · **nội dung trước**

- **ST-03 [P2] SHOULD** — dot/bar view cho đa tập (đếm theo lớp), dùng chung với
  `PRN-02`. Rẻ, và đã có ID trong SRS.

Ngoài ST-03 thì **không đề xuất gì**: engine mới gánh 3 bài, chưa đủ để biết nó
thiếu gì. Việc đúng là soạn thêm bài extremal set theory rồi đọc lại mục này.

### 2.5 `point` — 3 bài · **nội dung trước**

- **PT-04 [P3] MAY** — đường tròn (điểm trên đường tròn, dây cung). Có tên trong
  cột "còn thiếu" của §2.
- **PT-03 [P3] MAY** — tô vùng do các đoạn chia. **SRS tự nói hoãn**: "đắt và hiếm
  bài cần; chỉ làm khi seed content P3 đòi hỏi." Giữ nguyên chữ ấy.

### 2.6 `game` — 3 bài, nhưng là chỗ **lãi nhất** cả bảng

Ba hạng mục dưới đây đều là **mở rộng họ luật đóng**, và tiền lệ đã có: M17b thêm
`subtract-fraction` trong một buổi và nó biến "bốc tối đa nửa đống" từ ❌ thành ✅.
Mỗi hạng mục có một bài kinh điển đứng chờ sẵn.

- **GM-05 [P3] SHOULD** — `Move` đụng **nhiều** đống cùng lúc ⇒ **Wythoff**. Hôm
  nay `Move` là "một đống biến thành mấy đống", nên nước chéo của Wythoff không
  diễn đạt được. Đổi kiểu `Move` là chỗ tốn công thật, phần solver thì không.
- **GM-06 [P3] SHOULD** — luật đọc **cỡ đống khác** khi sinh nước ⇒ **trò Euclid**.
- **GM-07 [P3] SHOULD** — `rule` nhận **hợp** hai thành viên (bốc **hoặc** chia) ⇒
  **Nim Lasker**. Hôm nay `rule` là một thành viên đơn.

**Tầng B — cố ý không làm, và có tên rồi**

- **GM-01 / DOM-04** — rule script tổng quát cho Chomp, cờ trên đồ thị, game bàn
  cờ, game partizan. Đây là DSL-03 thật sự và nó đi thẳng vào **R-2**. Đã hoãn có
  lý do viết ra; đừng mở bằng cửa sau.

### 2.7 `derivation` — 2 bài · **nội dung trước**

Dòng 🟡 duy nhất liên quan (Vandermonde) nói **"thiếu bài trong kho"**, không nói
thiếu năng lực. Nên hạng mục đúng ở đây là **soạn bài**, không phải viết code.

**Tầng B**

- **DV-01** — gióng theo **nhiều** mốc (biến đổi ba cột). Chưa bài nào đòi.
- **DV-02** — morph một hạng tử thành hạng tử khác (`becomes` đã khai quan hệ; phần
  còn thiếu là chuyển động). Trùng phạm vi `CHO-05`, nên làm cùng nó.

---

## 3. Hai hạng mục xuyên engine, và cả hai thuộc PRD

- **PRN-04 [P2] SHOULD** — **animation biến hình** cho view song ánh. Trọng số cao
  nhất trong cả tài liệu này: nó là khoảng trống **duy nhất** còn lại của họ "Đếm /
  song ánh / đếm hai chiều" — 14% đề thi, đang ở 85%. Phụ thuộc `CHO-05`.
- **PRN-06 [P3] MAY** — dựng có tham số (quy nạp): slider $n$, sinh Scene theo $n$.
  **Trùng gần hết** `EXP-01..03` của PRD. Đừng làm hai lần: nếu lớp Experiment tới
  thì PRN-06 là một use case của nó, không phải một tính năng riêng.

---

## 4. Việc **không** nằm trong tài liệu này

Ba thứ hay bị nhầm là "làm engine mạnh hơn":

- **Thêm engine mới.** Hàng đợi engine ở `VIZ-COVERAGE.md` §7 đã cạn, và `PRD-07`
  chặn việc mở thêm trước khi P0–P2 chứng minh giá trị học tập.
- **Nâng coverage bằng cách chọn bài dễ vẽ.** `VIZ-COVERAGE.md` §6 đã nói: ~12% đề
  có lập luận **không mang nội dung không gian**, và con số đó không co theo engine.
- **Sửa những chỗ engine cố ý không làm.** Ba chỗ có lý do viết ra — tính phẳng
  tổng quát, GM-01 rule script, PT-03 tô vùng — và lý do vẫn còn đúng.
