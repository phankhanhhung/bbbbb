# CombViz — Kho bài tổ hợp: visualize được bao nhiêu phần trăm?

Trạng thái: **ước lượng chuyên gia, không phải điều tra** · Cập nhật: 2026-07-29 (sau M18 — derivation engine + label atlas; hàng đợi §7 đã cạn)

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
| ~~Hôm nay (6 engine + poset/Hasse)~~ | ~~83%~~ | ~~90%~~ |
| ~~Hôm nay (7 engine — thêm derivation + label atlas)~~ | ~~≈85%~~ | ~~≈97%~~ |
| **Hôm nay** (7 engine, sau M22–M30: lưới phi vuông, lan truyền, quân ghép, analyzer mới) | **~88%** | **~97%** |
| Hàng đợi §7 — **đã hết** | — | — |
| Xong đúng roadmap Phase 2 của SRS | ~67% | ~75% |
| Xong Phase 3 (game engine) | ~75% | ~82% |
| Thêm 4 view ngoài roadmap (§4) | **~85%** | ~92% |
| ~~Thêm "derivation engine" (§4.5)~~ ✅ M18 | ~85% | **~97%** |

**100% không đạt được, và điều đó không phải vì thiếu công sức.** Xem §6.

Khoảng cách từ 45% lên ~85% là việc kỹ thuật thuần tuý, đã đi hết, và
kiến trúc hiện tại được dựng đúng để đi đường đó: `packages/schema` không biết
engine nào tồn tại, renderer nhận engine từ ngoài, Player nạp engine theo
`engines_used[]`. Thêm một engine là một milestone có biên giới rõ — graph engine
mất đúng M4.

---

## 2. Phân bố họ bài, và engine hiện có phủ tới đâu

Trọng số cột 2 là tỉ trọng ước lượng trong đề tổ hợp thi đấu (IMO Shortlist C và
tương đương). Cột 3 là tỉ lệ bài **trong họ đó** mà bảy engine hiện có gánh nổi.

| Họ bài | Tỉ trọng | Phủ hôm nay | Đóng góp | Còn thiếu gì |
|---|---:|---:|---:|---|
| Lưới / phủ hình / tô màu | 15% | 98% | 14.7 | vùng khuyết vẽ tay và torus (`BD-05`) |
| Đồ thị | 22% | 95% | 20.9 | tô mặt (phần còn lại của GR-05), analyzer cây (`GR-10`), kiểm tính phẳng tổng quát |
| Đếm / song ánh / đếm hai chiều | 14% | 87% | 12.2 | animation biến hình của PRN-04 |
| Dãy số / thao tác lặp / quá trình | 16% | 96% | 15.4 | — (`SQ-02` và `BD-08` đều xong) |
| Trò chơi | 7% | 66% | 4.62 | thế phải là **đa tập số** cộng nhiều nhất một con số nhớ; mọi game không-phải-đống vẫn chưa — cần GM-01 rule script thật |
| Hệ tập hợp / siêu đồ thị | 8% | 90% | 7.2 | — (`engine-set`: bảng incidence + Venn ≤ 3 tập) |
| Hình học tổ hợp | 5% | 75% | 3.75 | tô vùng do các đoạn chia (PT-03), đường tròn |
| Hoán vị / thứ tự | 6% | 97% | 5.8 | — (chu trình hoán vị + poset/Hasse + Dilworth + dãy con đơn điệu) |
| Tổ hợp mang màu số học | 4% | 60% | 2.4 | — (bảng thặng dư dùng `table` của board) |
| Trừu tượng (xác suất, entropy, đại số) | 3% | 25% | 0.75 | derivation gánh được phần *đại số*; xác suất và entropy thì **không** — xem §6 |
| **Tổng** | **100%** | | **~88%** | |

### Kiểm chứng bằng bài cụ thể

41 bài quen thuộc, phân loại tay. Chính chủ đọc bảng này thấy sai chỗ nào thì sửa
chỗ đó — đây là phần **kiểm chứng được** của tài liệu.

| Bài | Họ | Hôm nay |
|---|---|---|
| Bàn cờ khuyết hai góc | lưới | ✅ có trong kho |
| Tromino L phủ $2^n\times2^n$ | lưới | ✅ có trong kho |
| Mã đi tuần $5\times5$ | lưới | ✅ có trong kho |
| $8$ quân hậu | lưới | ✅ |
| Lật dấu bảng $4\times4$ | lưới + thao tác | ✅ (sau `board/flip-line`) |
| Lát tam giác đều bằng hình thoi | lưới **tam giác** | ✅ có trong kho (BD-07, đếm hai màu lên/xuống) |
| Tô màu bàn ong lục giác | lưới **lục giác** | ✅ có trong kho (sắc số $= 3$; phép tô ba màu do máy kiểm) |
| Lát bằng hình thoi / tribone như **quân kéo thả** | lưới phi vuông | ✅ có trong kho (BD-09: `lozenge`, khai bằng đường đi trên đồ thị kề) |
| $R(3,3)=6$ | đồ thị | ✅ có trong kho |
| Bảy cầu Königsberg | đồ thị | ✅ có trong kho |
| Bổ đề bắt tay | đồ thị | ✅ có trong kho (thêm bản ma trận kề) |
| Turán $n=5$ | đồ thị | ✅ có trong kho |
| $K_5$ không phẳng | đồ thị | ✅ có trong kho (chặn $e \\le 3v-6$) |
| Định lý König (ghép cặp = phủ đỉnh) | đồ thị hai phía | ✅ có trong kho |
| Định lý Hall | đồ thị hai phía | ✅ có trong kho (ghép cặp + đường tăng + nhân chứng Hall) |
| Cayley $n^{n-2}$ (mã Prüfer) | song ánh | ✅ có trong kho (GR-09: mã vẽ thành hàng ô dưới cây) |
| Đồng nhất thức Vandermonde | đếm hai chiều | 🟡 derivation viết được chuỗi biến đổi; thiếu bài trong kho |
| Tập con ↔ xâu nhị phân ($2^n$) | song ánh | ✅ có trong kho (view song ánh) |
| Quy tắc nhân, hoán vị, tổ hợp, Pascal, đường đi lưới | đếm cơ bản | ✅ mười bài trong kho |
| Đường đi lưới / số Catalan | đếm | ✅ bảng quy hoạch động trên board |
| Erdős–Szekeres (dãy đơn điệu) | hoán vị | ✅ có trong kho (SQ-01: cặp $(inc,dec)$ hiện dưới từng ô) |
| Hoán vị 15-puzzle (chẵn lẻ) | hoán vị | ✅ `inversions` + `cycles`/`sign` + layout chu trình |
| Định lý Sperner (phản xích) | hệ tập hợp | ✅ có trong kho (`engine-set`, validator `antichain`) |
| Định lý Dilworth | poset | ✅ có trong kho (sơ đồ Hasse + nhân chứng phản xích) |
| Gộp đống sỏi theo mod | dãy / đa tập | ✅ engine sequence, chế độ `piles` |
| Xoá hai số, viết $\|a-b\|$ | dãy / đa tập | ✅ có trong kho |
| Chip-firing | quá trình | ✅ có trong kho (SQ-02: `sequence/fire`, tính abel kiểm bằng máy) |
| Dãy Ducci (hiệu tuyệt đối vòng quanh) | quá trình | ✅ có trong kho (SQ-02: `sequence/step`) |
| Lights-out (lật chữ thập) | lưới + quá trình | ✅ có trong kho (BD-08: `board/toggle-cross`, chạy trên cả ba lưới) |
| Nim | trò chơi | ✅ có trong kho (XOR + giá trị Grundy) |
| Bốc sỏi $1..k$ | trò chơi | ✅ có trong kho (phổ thắng-thua) |
| Trò Grundy (chia đống không đều) | trò chơi | ✅ đối chiếu vét cạn, khớp dãy Grundy đã biết |
| Bốc theo tập $\{1,3,4\}$ | trò chơi | ✅ thua ở $0,2,7,9,14,\dots$ — khớp |
| Bốc **tối đa nửa đống** | trò chơi | ✅ có trong kho (luật `subtract-fraction`, thua ở $2^m-1$) |
| Wythoff (hai đống, nước chéo) | trò chơi | ✅ có trong kho (`subtract-equal-pair`; phổ hai chiều cho ra **hai tia**) |
| Trò Euclid | trò chơi | ✅ có trong kho (`subtract-multiple-of-other`; phổ hai chiều cho ra một **nêm**) |
| Nim Lasker (bốc **hoặc** chia) | trò chơi | ✅ có trong kho (luật `union`, Grundy khớp dạng đóng) |
| Nim Fibonacci | trò chơi | ✅ có trong kho (`subtract-at-most-multiple`; phổ vẽ ra đúng dãy Fibonacci) |
| Chomp, Hackenbush, lật đồng xu | trò chơi | ❌ thế không phải đa tập đống |
| Trò chơi tô đồ thị | trò chơi | 🟡 vẽ được thế, không chơi được — cần GM-01 |
| Game bàn cờ có chiến lược đối xứng | trò chơi | 🟡 board vẽ được thế và cặp ghép; không chơi được |
| Happy ending (4 điểm lồi) | hình học | ✅ có trong kho (bao lồi + ba trường hợp) |
| Sylvester–Gallai | hình học | 🟡 có `line` và `aligned`; thiếu bài |
| Năm điểm nguyên có trung điểm nguyên | hình học | ✅ có trong kho |
| Đếm giao điểm đường chéo đa giác | đếm / hình học | ✅ có trong kho |
| Tổng telescoping $\sum \frac{1}{k(k+1)}$ | đại số / đếm | ✅ có trong kho (derivation, gạch triệt tiêu từng cặp) |
| Hệ thức Pascal chứng minh bằng đếm | đếm hai chiều | ✅ có trong kho (derivation, khai `becomes`) |
| Phương pháp xác suất: tồn tại tô $K_n$ không $K_k$ đơn sắc | trừu tượng | ❌ §6 |

**30 ✅ · 7 🟡 · 4 ❌** trên 41 bài ⇒ 73% trọn vẹn, **82%** nếu tính nửa điểm cho 🟡.

Con số này **tụt** so với lần trước (88%) mà không có dòng code nào bị gỡ. Lý do
nằm ở chính danh sách: tôi vừa thêm bảy dòng trò chơi, bốn trong số đó là ❌ (một
dòng thứ năm vá được ngay — xem `subtract-fraction` ở §4), vì câu hỏi "engine game
đã đủ mở chưa" chỉ trả lời được bằng cách viết ra những game **không** khai
được. Chín dòng trò chơi trên bốn mươi mốt là 22% danh sách, trong khi họ trò
chơi chỉ chiếm 7% đề thi thật. Nói cách khác: danh sách này giờ thiên về chỗ
yếu, đúng như trước kia nó thiên về bài kinh điển có hình đẹp. **Bảng trọng số ở
§2 mới là con số nên tin** — cả hai lần lệch đều là lệch của danh sách, không
phải của kho.

*(Trước Sequence engine: 9 ✅ · 4 🟡 · 11 ❌ ⇒ ≈ 46%. Trước M11: ≈ 63%.
Trước M12: ≈ 72%. Trước M15: ≈ 76%. Trước M16: ≈ 82%. Trước M17: 23 ✅ · 6 🟡 · 2 ❌ ⇒ ≈ 84%,
đo trên danh sách 32 dòng chưa có bảy dòng trò chơi.)*

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

### 4.5 ✅ Derivation engine — **đã làm** (M18)

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

**Đã làm ở M18.** `packages/engines/derivation`: scene là các **dòng**, mỗi dòng
là dãy **hạng tử**, mỗi hạng tử có `id`, `tex`, `color_class`, `role`. Dòng gióng
theo dấu quan hệ. Nhãn dựng sẵn thành path bằng MathJax lúc build (D-07), nên
cùng một công thức hiện y hệt trong Player, trong OG card và trong test golden.

Ba điều đáng ghi lại vì chúng vượt ngoài "một engine nữa":

- **Danh tính hạng tử sống xuyên step.** Cùng `id` ⇒ diff của DAT-11/12 cho ra
  một *chuyển động* thay vì "xoá cái này, thêm cái kia". Phép biến đổi đại số
  trở thành thứ nhìn thấy được.
- **`derivation/silent-drop`.** Hạng tử biến mất giữa hai bước mà không khai là
  **lỗi**. Lối ra: `cancelled: true` (triệt tiêu, hình gạch chéo) hoặc
  `becomes: "<id>"` (bị thay thế — và id đích phải **có thật** ở bước sau). Đây
  là lỗi đại số hay gặp nhất khi soạn tay, và giờ máy đếm được nó.
- **Nhãn thiếu atlas không im lặng.** Vẽ hẳn `⟨thiếu atlas: …⟩` ra hình, đồng
  thời `pnpm labels` báo đỏ ở CI. Hai lớp, vì đây đúng loại lỗi mà kho này đã
  học đắt: thứ gì hỏng lặng lẽ thì sống rất lâu.

Giới hạn, nói thẳng: engine này **không hiểu công thức**. Nó xếp chỗ cho LaTeX
chứ không phân tích cú pháp toán học, nên nó không biết $\frac{1}{k}-\frac{1}{k+1}$
có bằng $\frac{1}{k(k+1)}$ hay không. Thứ nó kiểm được là *hình thức* của chuỗi
biến đổi — và `derivation/silent-drop` là phần kiểm được có giá trị nhất trong đó.

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

## 7. Hàng đợi — đã cạn

> Hàng đợi **engine** cạn không có nghĩa là hết việc. Danh sách làm mạnh **từng
> engine** — mỗi hạng mục trỏ về một dòng 🟡/❌ cụ thể của §2 — nằm ở
> `docs/ENGINE-BACKLOG.md`.

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
| ~~7~~ | ~~**Game engine**~~ ✅ M17 (một phần) | +3.3 | xong | — | Tập luật **đóng** thay cho DSL-03: bốc theo khoảng / theo tập / chia đống, cộng Grundy, misère, phổ thắng-thua. Chơi được **game bốc đống**, không hơn — ranh giới ở §4. **Chưa có**: GM-01 rule script |
| ~~8~~ | ~~**Derivation engine**~~ ✅ M18 | +1.3 | xong | — | `packages/engines/derivation` + label atlas D-07 (MathJax build-time). Lãi thấp ở cột "gánh lập luận", nhưng đẩy cột "**có hình mang thông tin**" lên ~97% — và mang theo luật `derivation/silent-drop` |

Cộng dồn: **63 → ~85%**. Hàng đợi §7 **đã cạn** — mọi hạng tử trong bảng đều
xong. Phần còn thiếu từ đây trở đi không phải "thêm một engine nữa": nó là §6,
những lập luận không mang nội dung không gian, cộng với các mảnh còn nợ đã ghi
tên trong cột "còn thiếu gì" ở §2 (tô mặt đồ thị, PT-03 tô vùng, GM-01 rule
script, animation biến hình PRN-04).

**M11 đã lấy ba hạng mục đầu**: kho đi từ 63.4% lên **73.2%** (+9.8, thấp hơn +10.8
dự tính — view song ánh mới xong phần nhấn liên động, chưa có animation biến hình).

**M12 lấy hạng mục 5**: 73.2% → **75.9%** (+2.7, sát dự tính +2.9; phần hụt là tô
mặt).

**M15 lấy hạng mục 4**: 75.9% → **79.4%** (+3.5, thấp hơn dự tính +4.0 — phần hụt
là PT-03 tô vùng và đường tròn, cả hai đều ngoài phạm vi P2).

**M16 lấy hạng mục 6**: 79.4% → **80.0%** (+0.6, dự tính +0.8).

**M17 lấy hạng mục 7**: 80.0% → **83.3%** (+3.3, thấp hơn dự tính +5.25). Chỗ
hụt là có chủ ý và cần nói rõ: engine dùng **tập luật đóng** thay vì mở DSL-03,
nên game có luật riêng — cờ trên đồ thị, Chomp, trò tô màu — vẫn chưa khai được.
Đó là GM-01 thật sự và nó còn nợ. Xem phần dưới.

> **Sửa số, ngày 2026-07-29.** Ngay sau M17 tôi ghi phủ họ trò chơi là **65%** và
> tổng là 83.8%. Con số ấy tôi đặt ra khi trong đầu chỉ có game bốc đống. Khi
> ngồi liệt kê **thật** những game thi đấu không khai được (bảng ngay dưới đây),
> nó không đứng vững: 65% ngụ ý hai phần ba họ bài chơi được, trong khi chơi được
> chỉ có đúng một họ con. Hạ xuống **55%**, rồi lên lại **57%** sau khi thêm luật
> `subtract-fraction`; tổng còn **83.3%**. Không có code nào bị gỡ giữa hai con số
> — chỉ có tôi kiểm lại điều mình đã khẳng định.

> **Sửa số lần hai, ngày 2026-07-30.** GM-05/06/07 mở thêm ba họ kinh điển —
> Wythoff, trò Euclid, Nim Lasker — mỗi họ có một bài trong kho và mỗi bài đối
> chiếu với dạng đóng của toán học. Nâng **57% → 63%**, và cố ý dừng ở đó: ranh
> giới mới không phải "game bốc đống" mà là "**thế là một đa tập số**", rộng hơn
> đáng kể nhưng vẫn để cả họ game bàn cờ / đồ thị / tô màu ở ngoài — mà đó là
> phần không nhỏ của game thi đấu. Tổng vẫn làm tròn về **~85%**: họ này nặng 7%,
> nên sáu điểm ở đây là $0{,}42$ điểm tổng. Ghi ra để không ai đọc nhầm ba luật
> mới thành một bước nhảy của cả kho.

> **Sửa số lần ba, ngày 2026-07-30.** `GM-09` (luật đọc nước vừa đi) lấy nốt dòng
> ❌ cuối cùng của họ bốc đống: Nim Fibonacci. Nâng **63% → 66%**, và lại dừng ở
> đó — ranh giới mới là "thế là đa tập số **cộng nhiều nhất một con số nhớ**", vẫn
> để cả họ game bàn cờ / đồ thị / tô màu ở ngoài. Tổng vẫn ~85%.

Còn lại **một** hạng mục: derivation engine (+1.35, ~1.0 M4, cần label atlas D-07).

#### Vì sao game engine không mở DSL-03

SRS đòi "định nghĩa game bằng rule script sandboxed" (GM-01), tức một ngôn ngữ
*có trạng thái* chạy trong Web Worker với budget riêng (NFR-S2). Ba lý do không
làm thế:

- **R-2 trong sổ rủi ro** là "DSL phình thành ngôn ngữ lập trình", đối sách ghi
  rõ là grammar đóng. Mở một ngôn ngữ có trạng thái là đi thẳng vào rủi ro đó.
- **Tiền lệ trong chính kho**: `COMBINE_RULES` của engine dãy là enum đóng, kèm
  ghi chú rằng cho nhập biểu thức là "mở cửa hậu cho DSL-03".
- **Bảy thành viên luật đóng, cộng phép hợp, phủ trọn họ game trên đa tập đống**:
  bốc theo khoảng, bốc theo tập cho trước, bốc theo phần của đống, chia đống (đều
  và không đều), bốc bằng nhau ở hai đống, bốc bội số của đống kia. Nim nhiều
  đống, bài bốc sỏi $1..k$, trò Grundy, Wythoff, trò Euclid, Nim Lasker, cùng bản
  misère của các luật cục bộ, đều nằm trong đó. Luật **cục bộ** đối chiếu vét cạn
  với định nghĩa gốc (`test/solver.test.ts`, >600 thế); luật **toàn cục** thì đối
  chiếu với dạng đóng đã biết của toán học — cặp Beatty của Wythoff, mốc $\varphi$
  của trò Euclid — vì với chúng `analyzeGame` đã đi đường duyệt lùi, mà so một
  phép duyệt lùi với một phép duyệt lùi khác thì không kiểm được gì.

#### Chính xác thì tập luật đóng khai được tới đâu

Đây là chỗ tôi từng nói quá ("phủ gần hết game thi đấu"). Nó phủ gần hết game
**bốc đống**, mà game bốc đống chỉ là một họ con. Ranh giới thật:

| Khai được | Không khai được | Vướng ở đâu |
|---|---|---|
| Nim nhiều đống, **Wythoff** | Nim Fibonacci **nhiều đống** | "đối thủ vừa bốc bao nhiêu" không nói bốc ở đâu |
| Bốc $1..k$, **bốc tối đa $1/d$ đống**, **Nim Fibonacci** | "bốc tối đa gấp đôi **tổng** hai nước trước" | thế nhớ **một** con số, không nhớ cả lịch sử |
| Bốc theo tập $\{1,3,4\}$, tập số nguyên tố… | Chomp, Hackenbush, lật đồng xu | thế không phải đa tập số |
| Chia đống (đều và không đều), **trò Euclid** | Cờ trên đồ thị, game tô màu, game bàn cờ | thế không phải đống, chấm hết |
| **Hợp tới ba thành viên** (Nim Lasker) | Game partizan (hai bên luật khác nhau) | solver giả định luật đối xứng |
| Misère của mọi luật **cục bộ** | | |

Dòng "tối đa nửa đống" đáng nói riêng, vì khi rà bảng này tôi phát hiện nó **đang
thiếu** dù là cách phát biểu rất hay gặp, và nhìn qua thì tưởng `subtract` khai
được. Không: thế thua của nó là $n = 2^m - 1$ ($1, 3, 7, 15, 31$), còn mọi
`subtract` với `max` cố định đều cho thế thua là một cấp số cộng — có test đối
chiếu đủ hai mươi giá trị `max`, không phải suy đoán. Chỗ này đã **vá xong** bằng
một thành viên thứ tư của họ luật đóng, `subtract-fraction`, và không phải đụng
tới DSL-03. Đó là điểm đáng giữ của thiết kế tập luật đóng: mở rộng thì rẻ.

Ba dòng ❌ tiếp theo — Wythoff, trò Euclid, Nim Lasker — cũng đã vá, và chúng đắt
hơn `subtract-fraction` đúng một chỗ: `Move` phải đổi từ "một đống biến thành mấy
đống" thành "**mấy** đống biến thành mấy đống". Đổi kiểu ấy kéo theo một hệ quả
lớn hơn cả ba luật: ván không còn chắc chắn là **tổng các trò con độc lập**, nên
Sprague–Grundy không áp dụng cho Wythoff và trò Euclid. Solver phân biệt hai
trường hợp bằng `isLocalRule`, và với luật toàn cục nó **không bày** `xor` hay
`grundy` ra DSL — trả một con số ở đó thì mọi `claim` viết trên nó sẽ đạt, bài
trông như đã kiểm, mà con số ấy không có nghĩa gì.

Cái giá, nói thẳng: thế phải là một **đa tập số nguyên** và hai bên phải cùng
luật. Ngoài đó thì **không** khai được cho tới khi ai đó thật sự làm GM-01 +
NFR-S2.

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

Không tới được bằng cách thêm engine, và giờ thì đó không còn là dự đoán: bảng
trên **đã làm hết** và dừng ở **~85%**. Phần còn lại là ~12% ở §6 — những lập luận **không có nội dung không gian**. Con số đó
không co lại theo số engine, nên chênh lệch 85 → 90 phải mua bằng cách khác:
hoặc chọn bài (không nhận vào kho những bài mà hình không nói được gì — hoàn toàn
hợp lệ với một kho *đã curate*), hoặc chấp nhận đo bằng cột "có hình mang thông
tin", nơi derivation engine **đã** đưa lên ~97%.

Nói thẳng: nếu chỉ tiêu là "90% bài trong **kho** có hình gánh được lập luận" thì
đạt được, vì kho là do mình chọn. Nếu là "90% **đề tổ hợp thi đấu nói chung**" thì
không, và không phải vì thiếu công sức.

---

## 8. Cảnh báo về thứ tự

**AUT-KPI là gate có răng:** *trượt KPI thì dồn sửa pipeline **trước khi** mở
engine mới* (SRS §9, AUT-KPI). Kho hôm nay có **66 bài** — nhưng **không bài nào do chính
chủ soạn**, và người duyệt cũng là người soạn. Theo đúng luật của chính dự án,
việc còn nợ không phải engine nào trong bảng §7, mà là **soạn tay 3–5 bài**
(G-C), rồi mới đóng băng schema 1.0.0.

*(Ghi chú dọn dẹp 2026-07-29: chỗ này trước đây còn sót lại một bảng hàng đợi cũ
từ thời kho mới có 8 bài — số liệu mâu thuẫn với §7 và tiêu đề bảng thì hỏng.
Đã bỏ; §7 là bảng duy nhất.)*
