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
| ~~+ bảng đếm hai chiều PRN-03~~ | ~~60%~~ | ~~68%~~ |
| ~~+ set engine, chu trình hoán vị, view song ánh (M11)~~ | ~~63%~~ | ~~71%~~ |
| ~~+ view song ánh, set engine, chu trình hoán vị (M11)~~ | ~~73%~~ | ~~81%~~ |
| ~~+ ghép cặp, tính phẳng, ma trận kề (M12)~~ | ~~76%~~ | ~~84%~~ |
| **Hôm nay** (5 engine + poset/Hasse) | **~80%** | ~87% |
| Còn lại trong hàng đợi §7 làm hết | **~88%** | ~97% |
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
tương đương). Cột 3 là tỉ lệ bài **trong họ đó** mà năm engine hiện có gánh nổi.

| Họ bài | Tỉ trọng | Phủ hôm nay | Đóng góp | Còn thiếu gì |
|---|---:|---:|---:|---|
| Lưới / phủ hình / tô màu | 15% | 92% | 13.8 | — (board: preset, quân, tile custom, bảng) |
| Đồ thị | 22% | 94% | 20.7 | tô mặt (phần còn lại của GR-05), kiểm tính phẳng tổng quát |
| Đếm / song ánh / đếm hai chiều | 14% | 80% | 11.2 | animation biến hình của PRN-04 |
| Dãy số / thao tác lặp / quá trình | 16% | 90% | 14.4 | — (`engine-sequence`) |
| Trò chơi | 7% | 10% | 0.7 | **game engine (GM-01..04)** |
| Hệ tập hợp / siêu đồ thị | 8% | 90% | 7.2 | — (`engine-set`: bảng incidence + Venn ≤ 3 tập) |
| Hình học tổ hợp | 5% | 75% | 3.75 | tô vùng do các đoạn chia (PT-03), đường tròn |
| Hoán vị / thứ tự | 6% | 95% | 5.7 | — (chu trình hoán vị + poset/Hasse + Dilworth) |
| Tổ hợp mang màu số học | 4% | 60% | 2.4 | — (bảng thặng dư dùng `table` của board) |
| Trừu tượng (xác suất, entropy, đại số) | 3% | 5% | 0.15 | xem §6 — **không co lại theo engine** |
| **Tổng** | **100%** | | **~80%** | |

### Kiểm chứng bằng bài cụ thể

31 bài quen thuộc, phân loại tay. Chính chủ đọc bảng này thấy sai chỗ nào thì sửa
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
| Bổ đề bắt tay | đồ thị | ✅ có trong kho (thêm bản ma trận kề) |
| Turán $n=5$ | đồ thị | ✅ có trong kho |
| $K_5$ không phẳng | đồ thị | ✅ có trong kho (chặn $e \\le 3v-6$) |
| Định lý König (ghép cặp = phủ đỉnh) | đồ thị hai phía | ✅ có trong kho |
| Định lý Hall | đồ thị hai phía | ✅ có trong kho (ghép cặp + đường tăng + nhân chứng Hall) |
| Cayley $n^{n-2}$ (mã Prüfer) | song ánh | 🟡 view song ánh đã có; thiếu analyzer sinh mã Prüfer |
| Đồng nhất thức Vandermonde | đếm hai chiều | 🟡 bảng incidence đã có; còn cần nhãn tổng quát |
| Tập con ↔ xâu nhị phân ($2^n$) | song ánh | ✅ có trong kho (view song ánh) |
| Quy tắc nhân, hoán vị, tổ hợp, Pascal, đường đi lưới | đếm cơ bản | ✅ mười bài trong kho |
| Đường đi lưới / số Catalan | đếm | ✅ bảng quy hoạch động trên board |
| Erdős–Szekeres (dãy đơn điệu) | hoán vị | 🟡 vẽ được dãy, thiếu analyzer dãy con đơn điệu |
| Hoán vị 15-puzzle (chẵn lẻ) | hoán vị | ✅ `inversions` + `cycles`/`sign` + layout chu trình |
| Định lý Sperner (phản xích) | hệ tập hợp | ✅ có trong kho (`engine-set`, validator `antichain`) |
| Định lý Dilworth | poset | ✅ có trong kho (sơ đồ Hasse + nhân chứng phản xích) |
| Gộp đống sỏi theo mod | dãy / đa tập | ✅ engine sequence, chế độ `piles` |
| Xoá hai số, viết $\|a-b\|$ | dãy / đa tập | ✅ có trong kho |
| Chip-firing | quá trình | 🟡 vẽ và thao tác được, thiếu luật lan truyền |
| Nim | trò chơi | ❌ |
| Trò chơi tô đồ thị | trò chơi | 🟡 vẽ được thế, không chơi được |
| Happy ending (4 điểm lồi) | hình học | ✅ có trong kho (bao lồi + ba trường hợp) |
| Sylvester–Gallai | hình học | 🟡 có `line` và `aligned`; thiếu bài |
| Năm điểm nguyên có trung điểm nguyên | hình học | ✅ có trong kho |
| Đếm giao điểm đường chéo đa giác | đếm / hình học | ✅ có trong kho |
| Phương pháp xác suất: tồn tại tô $K_n$ không $K_k$ đơn sắc | trừu tượng | ❌ §6 |

**23 ✅ · 6 🟡 · 2 ❌** trên 31 bài ⇒ 74% trọn vẹn, **84%** nếu tính nửa điểm cho 🟡.
Hơi cao hơn 80% của bảng trọng số, và chênh lệch nhỏ ấy có thật: danh sách này
thiên về bài **kinh điển**, mà bài kinh điển thường là bài có hình đẹp — đó chính
là lý do người ta nhớ chúng. Bảng trọng số ở trên là con số nên tin.

*(Trước Sequence engine: 9 ✅ · 4 🟡 · 11 ❌ ⇒ ≈ 46%. Trước M11: ≈ 63%.
Trước M12: ≈ 72%. Trước M15: ≈ 76%. Trước M16: 22 ✅ · 7 🟡 · 2 ❌ ⇒ ≈ 82%.)*

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

## 7. Còn lại gì để lên ~88%

Chi phí tính bằng **M4** — một engine graph, tức khoảng hai tuần ở nhịp 35h/tuần.
"Lãi" là số điểm phủ thu được. Sắp theo **lãi trên chi phí**, không theo thứ tự
trong SRS.

| # | Việc | Lãi | Chi phí | Lãi/chi phí | Ghi chú |
|---|---|---:|---:|---:|---|
| ~~1~~ | ~~**View hoán vị + chu trình**~~ ✅ M11 | +1.8 | xong | — | `permutationCycles` + binding `cycles`/`sign`/`fixed_points` + layout `cycles` |
| ~~2~~ | ~~**Set/hypergraph engine**~~ ✅ M11 | +6.2 | xong | — | `packages/engines/set`: bảng incidence + Venn ≤ 3 tập, DSL `member`/`subset`/`common`, 6 validator |
| ~~3~~ | ~~**Bijection view**~~ ✅ M11 (một phần) | +2.8 | xong | — | Hai pane + ánh xạ id↔id + nhấn liên động hai chiều. **Chưa có** animation biến hình theo từng cặp — xem hạn chế bên dưới |
| ~~4~~ | ~~**Point/segment engine**~~ ✅ M15 | +3.5 | xong | — | `packages/engines/point`: bao lồi, thẳng hàng, đếm giao điểm, đường thẳng, lưới điểm. **Chưa có**: PT-03 tô vùng, đường tròn |
| ~~5~~ | ~~**Hoàn tất graph**~~ ✅ M12 (phần lớn) | +2.7 | xong | — | Ghép cặp + König + Hall, ma trận kề, tính phẳng qua hình vẽ và chặn Euler. **Chưa có**: tô mặt, kiểm tính phẳng tổng quát |
| ~~6~~ | ~~**Poset / Hasse**~~ ✅ M16 | +0.6 | xong | — | Layout `hasse` + `analyzePoset`; Dilworth tính bằng **chính** lõi ghép cặp của GR-06 |
| 7 | **Game engine** (GM-01..04) | +5.25 | 1.5 | **3.5** | Đắt nhất: cần DSL-03 rule script sandboxed + solver + mô hình lượt. Đúng như SRS xếp vào P3 |
| 8 | **Derivation engine** (§4.5) | +1.35 | 1.0 | **1.35** | Lãi thấp ở cột "gánh lập luận" nhưng đẩy cột "**có hình mang thông tin**" từ ~71% lên ~97%. Cần label atlas (D-07) trước |

Cộng dồn: **63 → ~88%**, tổng chi phí ≈ **5.5 M4**, tức khoảng 11 tuần ở nhịp
35h/tuần nếu làm liên tục.

**M11 đã lấy ba hạng mục đầu**: kho đi từ 63.4% lên **73.2%** (+9.8, thấp hơn +10.8
dự tính — view song ánh mới xong phần nhấn liên động, chưa có animation biến hình).

**M12 lấy hạng mục 5**: 73.2% → **75.9%** (+2.7, sát dự tính +2.9; phần hụt là tô
mặt).

**M15 lấy hạng mục 4**: 75.9% → **79.4%** (+3.5, thấp hơn dự tính +4.0 — phần hụt
là PT-03 tô vùng và đường tròn, cả hai đều ngoài phạm vi P2).

**M16 lấy hạng mục 6**: 79.4% → **80.0%** (+0.6, dự tính +0.8). Còn lại **hai**
hạng mục, và cả hai đều đắt: game engine (+5.25, ~1.5 M4, cần DSL-03) và
derivation engine (+1.35, ~1.0 M4, cần label atlas D-07). Phần "rẻ mà lãi" của
hàng đợi đã hết.

#### Hạn chế đã biết của kiểm tính phẳng

Không có thuật toán kiểm tính phẳng tổng quát (LR / PQ-tree). Có hai đường, và
may thay đó là hai đường mà lời giải thi đấu thật sự dùng:

- **Chứng minh phẳng** — kiểm rằng hình tác giả vẽ không có cạnh nào cắt nhau.
  Toạ độ đỉnh ở dự án này vốn là nội dung (GR-02), nên hình trong file *chính là*
  chứng chỉ. Đây cũng là cách duy nhất một bài thi chấp nhận.
- **Chứng minh không phẳng** — chặn $e \le 3v-6$, hoặc $2v-4$ khi không có tam
  giác. Giết $K_5$ và $K_{3,3}$ ngay.

Ngoài hai đường đó, kết luận là **`unknown`**, và đó là câu trả lời trung thực:
một hình vẽ vụng không nói lên điều gì về đồ thị. Đồ thị không đơn hoặc có cạnh
vẽ cong thì analyzer **từ chối** — chặn Euler chỉ đúng cho đồ thị đơn, và phân
tích giao điểm bằng đoạn thẳng không mô tả đúng một cạnh cong.

#### Hạn chế đã biết của view song ánh ở P1

Ánh xạ do **tác giả khai**, không phải do máy tính ra, và pane phải là một scene
tĩnh viết sẵn trong file. Ba hệ quả, nói ra để không ai trông đợi nhầm:

- **Không có sandbox.** Người học sửa cấu hình bên trái thì bên phải không đổi
  theo — nó không được tính từ đâu cả. Nên bài dùng view này khai
  `kind: "illustration"`; ép `both` sẽ cho ra một hình nói dối.
- **Không có animation biến hình** (phần còn lại của PRN-04). Hai pane nhấn liên
  động, chưa có chuyển động nối một hình sang hình kia.
- **Ánh xạ không được kiểm là song ánh thật.** Validate kiểm id có tồn tại đúng
  bên, và **cảnh báo** khi không đơn ánh — nhưng nó không biết cặp có đúng về mặt
  toán học hay không. Đó vẫn là việc của người duyệt.

### ~90% thì sao?

Không tới được bằng cách thêm engine. Làm hết bảng trên ra **~88%**, và phần còn
lại là ~12% ở §6 — những lập luận **không có nội dung không gian**. Con số đó
không co lại theo số engine, nên chênh lệch 88 → 90 phải mua bằng cách khác:
hoặc chọn bài (không nhận vào kho những bài mà hình không nói được gì — hoàn toàn
hợp lệ với một kho *đã curate*), hoặc chấp nhận đo bằng cột "có hình mang thông
tin", nơi derivation engine đưa lên ~97%.

Nói thẳng: nếu chỉ tiêu là "90% bài trong **kho** có hình gánh được lập luận" thì
đạt được, vì kho là do mình chọn. Nếu là "90% **đề tổ hợp thi đấu nói chung**" thì
không, và không phải vì thiếu công sức.

---|---|---:|---|---|
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
