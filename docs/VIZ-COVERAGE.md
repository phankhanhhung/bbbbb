# CombViz — Kho bài tổ hợp: visualize được bao nhiêu phần trăm?

Trạng thái: **ước lượng chuyên gia, không phải điều tra** · Cập nhật: 2026-07-29 (sau khi có Sequence engine)

> **Đọc con số ở đây đúng cách.**
>
> Mọi phần trăm dưới đây là tích của hai đại lượng do *một người* ước lượng:
> tỉ trọng từng họ bài trong đề thi, và tỉ lệ bài trong họ đó mà engine hiện có
> **gánh nổi lập luận**. Sai số thực tế ±5–8 điểm.
>
> Muốn có số thật thì phải phân loại một danh sách thật — ví dụ toàn bộ mục C
> của IMO Shortlist 2010–2024 (~75 bài). Đó là việc nửa ngày và nó biến tài liệu
> này từ ước lượng thành phép đo. §5 nói cách làm.

---

## 1. Trả lời ngắn

| | Visualize **gánh được lập luận** | Có hình **mang thông tin** |
|---|---|---|
| ~~board + graph~~ | ~~45%~~ | ~~55%~~ |
| ~~+ sequence~~ | ~~55%~~ | ~~64%~~ |
| **Hôm nay** (+ bảng đếm hai chiều PRN-03) | **~60%** | ~68% |
| Xong đúng roadmap Phase 2 của SRS | ~67% | ~75% |
| Xong Phase 3 (game engine) | ~75% | ~82% |
| Thêm 4 view ngoài roadmap (§4) | **~85%** | ~92% |
| Thêm "derivation engine" (§4.5) | ~88% | **~97%** |

**100% không đạt được, và điều đó không phải vì thiếu công sức.** Xem §6.

Nhưng khoảng cách từ 45% lên ~88% là việc kỹ thuật thuần tuý, đã có đường ray, và
kiến trúc hiện tại được dựng đúng để đi đường đó: `packages/schema` không biết
engine nào tồn tại, renderer nhận engine từ ngoài, Player nạp engine theo
`engines_used[]`. Thêm một engine là một milestone có biên giới rõ — graph engine
mất đúng M4.

---

## 2. Phân bố họ bài, và engine hiện có phủ tới đâu

Trọng số cột 2 là tỉ trọng ước lượng trong đề tổ hợp thi đấu (IMO Shortlist C và
tương đương). Cột 3 là tỉ lệ bài **trong họ đó** mà ba engine hiện có gánh nổi.

| Họ bài | Tỉ trọng | Phủ hôm nay | Đóng góp | Vì sao thiếu |
|---|---:|---:|---:|---|
| Lưới / phủ hình / tô màu | 15% | 90% | 13.5 | — |
| Đồ thị | 22% | 80% | 17.6 | thiếu planarity, matching, tô mặt |
| Đếm / song ánh / đếm hai chiều | 14% | **60%** | **8.4** | có bảng incidence có tổng (PRN-03); còn thiếu view song ánh (PRN-04) |
| Dãy số / thao tác lặp / quá trình | 16% | **90%** ✅ | **14.4** | ~~không có engine~~ — `@combviz/engine-sequence` (2026-07-29) |
| Trò chơi | 7% | 10% | 0.7 | vẽ được thế cờ, không có cây trò chơi / Grundy |
| Hệ tập hợp / siêu đồ thị | 8% | 20% | 1.6 | chỉ mô hình hoá được phần nào bằng đồ thị hai phía |
| Hình học tổ hợp | 5% | 5% | 0.25 | không có engine điểm–đoạn |
| Hoán vị / thứ tự | 6% | 20% | 1.2 | chỉ vẽ được qua chu trình trên đồ thị |
| Tổ hợp mang màu số học (thặng dư, chữ số) | 4% | 30% | 1.2 | lưới thặng dư gượng ép |
| Trừu tượng (xác suất, entropy, đại số) | 3% | 5% | 0.15 | xem §6 |
| **Tổng** | **100%** | | **~59%** | |

### Kiểm chứng bằng bài cụ thể

24 bài quen thuộc, phân loại tay. Chính chủ đọc bảng này thấy sai chỗ nào thì sửa
chỗ đó — đây là phần **kiểm chứng được** của tài liệu.

| Bài | Họ | Hôm nay |
|---|---|---|
| Bàn cờ khuyết hai góc | lưới | ✅ có trong kho |
| Tromino L phủ $2^n\times2^n$ | lưới | ✅ có trong kho |
| Mã đi tuần $5\times5$ | lưới | ✅ có trong kho |
| $8$ quân hậu | lưới | ✅ |
| Lật dấu bảng $4\times4$ | lưới + thao tác | ✅ (sau `board/flip-line`) |
| $R(3,3)=6$ | đồ thị | ✅ có trong kho |
| Bảy cầu Königsberg | đồ thị | ✅ có trong kho |
| Bổ đề bắt tay | đồ thị | ✅ có trong kho |
| Turán $n=5$ | đồ thị | ✅ có trong kho |
| Định lý Hall | đồ thị hai phía | 🟡 vẽ được, thiếu matching + đường tăng |
| Cayley $n^{n-2}$ (mã Prüfer) | song ánh | ❌ cần view song ánh |
| Đồng nhất thức Vandermonde | đếm hai chiều | 🟡 bảng incidence đã có; còn cần nhãn tổng quát |
| Quy tắc nhân, hoán vị, tổ hợp, Pascal, đường đi lưới | đếm cơ bản | ✅ mười bài trong kho |
| Đường đi lưới / số Catalan | đếm | ✅ bảng quy hoạch động trên board |
| Erdős–Szekeres (dãy đơn điệu) | hoán vị | 🟡 vẽ được dãy, thiếu analyzer dãy con đơn điệu |
| Hoán vị 15-puzzle (chẵn lẻ) | hoán vị | 🟡 `inversions` đã có; thiếu view hoán vị |
| Định lý Sperner (phản xích) | hệ tập hợp | ❌ |
| Định lý Dilworth | poset | ❌ |
| Gộp đống sỏi theo mod | dãy / đa tập | ✅ engine sequence, chế độ `piles` |
| Xoá hai số, viết $\|a-b\|$ | dãy / đa tập | ✅ có trong kho |
| Chip-firing | quá trình | 🟡 vẽ và thao tác được, thiếu luật lan truyền |
| Nim | trò chơi | ❌ |
| Trò chơi tô đồ thị | trò chơi | 🟡 vẽ được thế, không chơi được |
| Happy ending (4 điểm lồi) | hình học | ❌ |
| Sylvester–Gallai | hình học | ❌ |
| Phương pháp xác suất: tồn tại tô $K_n$ không $K_k$ đơn sắc | trừu tượng | ❌ §6 |

**13 ✅ · 7 🟡 · 6 ❌** ⇒ ≈ 50% trọn vẹn, ≈ 63% nếu tính nửa điểm cho 🟡. Khớp với
bảng trọng số ở trên, và hai cách đếm đó độc lập nhau.

*(Trước khi có Sequence engine: 9 ✅ · 4 🟡 · 11 ❌ ⇒ ≈ 46%.)*

---

## 3. Roadmap SRS đã có sẵn những gì

Đây **không** phải đề xuất mới — SRS §5.3–5.5 và nhóm PRN đã xếp lịch phần lớn.
Cột cuối là mức phủ ước tính sau khi làm.

| Hạng mục SRS | Phase | Mở khoá họ nào | Phủ sau đó |
|---|---|---|---|
| **ST-01..03** Set/Counting engine (Venn + **bảng incidence** + dot/bar đa tập) | P2 | hệ tập hợp, một phần đếm | 45 → 52% |
| ~~**PRN-03** Double counting (bảng incidence có tổng hàng/cột)~~ ✅ | P2 | đếm hai chiều | **đã làm** — tuỳ chọn `table` của board engine |
| **PRN-04** Bijection view (hai pane + ánh xạ id↔id + animation biến hình) | P2 | đếm bằng song ánh | 57 → 62% |
| **PT-01..02** Point/Segment engine (điểm, đoạn, bao lồi) | P2 | hình học tổ hợp | 62 → 66% |
| **GR-05..07** planarity, matching, ma trận kề | P2 | phần còn lại của đồ thị | 66 → 67% |
| **PRN-05** Extremal helper (argmax/argmin + badge) | P2 | cắt ngang, rẻ | — |
| **GM-01..04** Game engine (rule script, chơi tay đôi, solver ≤ 10⁶ trạng thái) | P3 | trò chơi | 67 → 73% |
| **PRN-06** Parameterized construction (slider $n$, dựng $S(n{+}1)$ từ $S(n)$) | P3 | quy nạp, dãy | 73 → 75% |

SRS đã nhìn ra **PRN-04 là widget đắt giá nhất cho các bài đếm** và gọi nó là
flagship của P2. Đánh giá đó đúng: họ "đếm/song ánh" là 14% và hiện chỉ phủ 25%.

---

## 4. Bốn thứ roadmap SRS **chưa** có — một đã làm, ba còn lại chặn ~7%

### 4.1 ✅ Sequence/Multiset engine — **đã làm** (2026-07-29)

Họ "dãy số / thao tác lặp / quá trình" chiếm **16%**, lớn thứ hai sau đồ thị, và
trước engine này phủ 30% bằng cách gượng ép nhét vào bàn cờ. §16 của SRS xếp "gộp
đống sỏi theo mod" vào cụm invariant-centric và đòi ≥ 5 bài — nhưng **không engine
nào trong cả ba phase vẽ được một đống sỏi**.

Dấu hiệu đã hiện ra trong thực tế trước khi có engine: bài `sign-flip-4x4` phải chờ
đến khi có `board/flip-line` (G-11) mới có sandbox, và nó vẫn chỉ là bảng ±1 — một
dãy số thật (`a₁, a₂, …, aₙ` với phép thao tác) thì không có chỗ nào để đặt.

**Đã làm.** `packages/engines/sequence`: hai chế độ (`sequence` có thứ tự / `piles`
đa tập) trên **một** mô hình dữ liệu, chín lệnh chia theo chế độ, bốn validator cố
định + ba loại có tham số, binding `total` và `inversions`.

Quyết định đáng ghi: **tập lệnh chia theo `mode`**. Đổi chỗ chạy ở `sequence` và bị
từ chối ở `piles`; gộp thì ngược lại. Đây là cùng bài học với `board/flip-line`
(G-11) — bất biến của "gộp đống" chỉ là bất biến *vì* người chơi không được đổi chỗ
tuỳ ý, nên ràng buộc phải nằm trong tập thao tác chứ không nằm trong lời dặn.

**Thu về: 16% × (30% → 90%) = +9.6 điểm.** Kho có bài đầu tiên dùng nó:
`erase-two-write-difference`.

### 4.2 Permutation / cycle view

Họ hoán vị chiếm 6%, hiện phủ 20%. Cần: hai hàng có mũi tên (dạng hai dòng), phân
tích chu trình, đếm nghịch thế, ma trận hoán vị. Phần lớn **dùng lại được graph
engine** (chu trình = đồ thị có hướng) — chi phí chính là layout và analyzer, không
phải engine mới. **+2.7 điểm, rẻ.**

### 4.3 Poset / Hasse diagram

Sperner, Dilworth, chuỗi/phản xích — nằm giữa "hệ tập hợp" và "thứ tự". Là graph
engine + **layout phân tầng** + analyzer chuỗi dài nhất / phản xích lớn nhất.
**+1 điểm, rẻ nhất bảng.**

### 4.4 Table / state view

Bảng DP, bảng thặng dư, bảng trạng thái. Gần với bảng incidence của ST-01 nhưng
khác mục đích: ô mang **giá trị tính được**, không mang quan hệ thuộc. **+2 điểm.**

### 4.5 Derivation engine — cách duy nhất tiến gần 100%

Đây là đề xuất khác loại với bốn cái trên, và là câu trả lời thật cho "tao muốn
100%".

Có một lớp bài mà **đối tượng của lập luận là công thức, không phải hình**: đồng
nhất thức tổ hợp, hàm sinh, tổng telescoping, ước lượng bất đẳng thức. Vẽ một cái
hình cho chúng là trang trí, và trang trí thì nói dối.

Nhưng chúng vẫn *visualize* được — chỉ là visualize **chính biểu thức**: mỗi hạng
tử là một element có `id`, có `color_class`, neo được bằng anchor, và chuyển động
giữa hai step là phép biến đổi đại số (triệt tiêu, gộp, đổi chỉ số). Đúng thứ
3Blue1Brown làm với đại số, và nó nằm gọn trong kiến trúc sẵn có: một engine mà
Scene là cây biểu thức, renderer là layout công thức, diff là "hạng tử nào biến
mất, hạng tử nào đổi màu".

Thứ này biến **"bài không visualize được"** thành **"bài visualize bằng công thức
có neo"**, và đó là cách duy nhất tao thấy để cột "có hình mang thông tin" chạm
~97%. Nó cũng cần label atlas (D-07, GR-08) — vốn đã nợ sẵn.

---

## 5. Cách biến ước lượng thành phép đo

Bảng §2 đứng trên phán đoán của một người. Muốn số thật:

1. Lấy danh sách thật: IMO Shortlist C 2010–2024 (~75 bài), hoặc đề VMO/TST 10 năm.
2. Với mỗi bài, ghi ba trường: `family`, `primary_view` (engine nào lẽ ra vẽ), và
   `verdict ∈ {carries, supports, decorative, none}`.
3. `carries` = hình gánh được lập luận; `supports` = hình giúp hiểu đề nhưng lập
   luận nằm ở chữ; `decorative` = vẽ được nhưng vẽ xong chẳng nói thêm gì.

Trường thứ ba là trường quan trọng nhất và cũng là trường dễ tự lừa nhất — vì vậy
nó phải điền **trước** khi biết engine nào đang có.

Đây là việc nửa ngày, làm một lần, và nó định hướng cả năm engine tiếp theo. Nếu
kết quả cho thấy họ "dãy số" chỉ là 8% chứ không phải 16%, thì §4.1 tụt xuống cuối
hàng đợi và tiết kiệm được đúng một milestone.

---

## 6. Vì sao 100% (nghĩa "hình gánh được lập luận") không đạt được

Không phải vì thiếu engine. Vì có những lập luận **không có nội dung không gian**:

- **Phương pháp xác suất.** "Tồn tại một cách tô vì kỳ vọng số $K_k$ đơn sắc nhỏ
  hơn 1." Đối tượng là một phân phối trên tất cả cách tô. Vẽ được một cách tô, vẽ
  được số đếm — nhưng bước quyết định là một phép tính kỳ vọng, và nó không có
  hình.
- **Hàm sinh.** Đối tượng là chuỗi luỹ thừa hình thức. §4.5 vẽ được phép biến đổi;
  vẫn là vẽ *đại số*, không vẽ *cấu hình*.
- **Entropy / nén.** Lập luận về lượng thông tin.
- **Tiệm cận với $n$ lớn.** Vẽ được $n = 5$; lập luận nói về $n \to \infty$, và
  hình ở đây luôn có nguy cơ dạy sai — người học nhớ trường hợp nhỏ và tưởng đó là
  chứng minh.
- **Bài mà cấu trúc chính là một song ánh trừu tượng** giữa hai họ vô hạn.

Ước tính họ này ~10–12% và **nó không co lại theo số engine**.

Với chúng, lựa chọn trung thực có hai đường, và cả hai đều tốt hơn việc vẽ bừa:

1. **Không nhận bài đó vào kho.** Kho 25 bài là kho *đã curate*; §16 nói rõ 25 bài
   xuất sắc thắng 100 bài khá. Một bài mà hình không nói được gì thì để nó cho
   sách, không phải cho CombViz.
2. **Nhận, và visualize phần visualize được** — thường là cấu hình nhỏ minh hoạ
   ($n = 4, 5$) cộng với derivation view cho phần đại số — kèm một câu nói thẳng
   với người học rằng bước quyết định nằm ở chữ.

Đường thứ ba — vẽ một cái hình đẹp không mang lập luận — là đường **duy nhất** phải
tránh, vì nó phá đúng thứ làm nên khác biệt của kho: người học tin rằng nhìn hình
là hiểu được, và ở bài đó thì niềm tin ấy sai.

---

## 7. Thứ tự nên làm, theo lãi trên mỗi tuần

| # | Việc | Điểm phủ | Cỡ | Ghi chú |
|---|---|---:|---|---|
| ~~1~~ | ~~**Sequence/Multiset engine**~~ ✅ | +9.6 | xong | Kho: 45% → **55%** |
| 2 | **PRN-03 bảng incidence** | +5 | nhỏ | Dùng lại được cho ST-01 và GR-07 |
| 3 | **PRN-04 bijection view** | +5 | vừa | SRS gọi là flagship P2, đánh giá đó đúng |
| 4 | **ST-01..03 Set engine** | +7 | ~0.7 M4 | Bảng incidence ở #2 là nửa việc rồi |
| 5 | **PT-01..02 Point engine** | +4 | ~0.7 M4 | Họ riêng biệt, không dùng lại được gì |
| 6 | **Permutation/cycle + Poset** (§4.2, §4.3) | +3.7 | nhỏ | Chủ yếu là layout + analyzer trên graph engine |
| 7 | **GM game engine** | +6 | ~1.5 M4 | Đắt vì cần DSL-03 rule script + solver |
| 8 | **Derivation engine** (§4.5) | +3 phủ, +5 "có hình" | ~1 M4 | Cần label atlas trước |

Cộng dồn: 45 → 55 (đã đi) → **~88%**.

**Một cảnh báo về thứ tự.** AUT-KPI là gate có răng: *trượt KPI thì dồn sửa
pipeline **trước khi** mở engine mới* (SRS §7). Kho hiện có 8 bài và chưa bài nào
do chính chủ soạn — nên theo đúng luật của chính dự án, việc đầu tiên không phải
engine nào trong bảng này, mà là **soạn tay 3–5 bài** (G-C). Mở engine thứ ba khi
kho chưa chứng minh nổi engine thứ nhất và thứ hai nuôi được bài là cách R-1 giết
dự án.
