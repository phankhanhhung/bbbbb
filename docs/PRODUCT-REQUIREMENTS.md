# CombViz — Product Requirements

**Phiên bản:** 1.1
**Ngày:** 2026-07-29
**Trạng thái:** hợp nhất định hướng sản phẩm và các khoảng trống ưu tiên

## 0. Vị trí của tài liệu này — đọc trước khi dùng nó

### 0.1 Quan hệ với SRS

`docs/SRS-v1.0.md` là **nguồn của mọi requirement ID** và vẫn giữ nguyên vai trò
đó. Tài liệu này nằm **trên** SRS một tầng: nó nói *sản phẩm cần đi đâu*, còn SRS
nói *hệ thống phải làm gì*. Ba luật giải quyết chồng chéo, và chúng có răng:

- **PRD-01 MUST** — Với một requirement đã có ID trong SRS, **SRS thắng**. Tài
  liệu này chỉ được *trích* ID ấy, không được phát biểu lại bằng lời khác. Hai
  bản phát biểu cho cùng một yêu cầu là đúng cái lỗi "hai nguồn sự thật" mà kho
  này đã trả giá nhiều lần — lần gần nhất là thanh công cụ Sandbox chép tay lệch
  khỏi tập lệnh engine (M19).
- **PRD-02 MUST** — Mọi yêu cầu **mới** trong tài liệu này phải mang một ID mới
  theo cùng cú pháp SRS (`ID [Phase] MUST/SHOULD/MAY`), và ID ấy phải xuất hiện
  trong bảng truy vết §11. Không ID thì không phải requirement — chỉ là ý.
- **PRD-03 MUST** — Bản 1.0 của tài liệu này **không có một ID nào** trên khoảng
  120 phát biểu quy phạm. Hệ quả không phải chuyện hình thức: không gì trong đó
  gán được vào commit, gate, test hay milestone. Bản 1.1 sửa đúng chỗ đó, và luật
  PRD-02 tồn tại để nó không tái diễn.

### 0.2 Ba họ ID mới

| Họ | Phạm vi | Mục |
|---|---|---|
| `EXP-*` | Lớp Experiment — control, state, dẫn xuất, prediction, goal | §5 |
| `CHO-*` | Choreography / narrative animation layer | §6 |
| `DOM-*` | Mở rộng miền toán: hình học, số học, đại số, game trạng thái | §3.2, §8 P3 |

Ngoài ba họ ấy, tài liệu này chỉ trích ID sẵn có.

Hai họ nữa sống ở `docs/ENGINE-BACKLOG.md` — `SQ-*` (engine dãy) và `DV-*` (engine
derivation) — vì hai engine ấy dựng ngoài roadmap SRS nên chưa có họ nào. Backlog
ấy cũng mở tiếp số cho các họ sẵn có (`BD-07+`, `GR-09+`, `GM-05+`, `PT-04+`).

---

## 1. Tóm tắt sản phẩm

CombViz là một content brand giáo dục về lời giải Tổ hợp Olympiad. Sản phẩm
công chúng là kho bài đã curate; engine, Studio và pipeline là xưởng in riêng
của một tác giả. Mỗi bài trình bày lời giải theo từng bước trên canvas tương
tác, liên kết hai chiều giữa narrative và hình, đồng thời cho phép người học
thử cấu hình và tìm phản ví dụ.

CombViz **không** là proof assistant, GeoGebra, LMS, hệ thống thi đấu hoặc
platform đa tác giả. Máy có thể draft và kiểm tra cấu hình; tác giả chịu trách
nhiệm xác minh lập luận trước khi publish (AUT-09, R-8).

Danh sách non-goal đầy đủ và có hiệu lực nằm ở **SRS §2 (NG-01..NG-08)**. §10
dưới đây chỉ nhắc lại phần liên quan tới các đề xuất mới, không thay thế nó.

## 2. Mục tiêu

### 2.1 Người học

- Hiểu một lập luận bằng cách quan sát trạng thái thay đổi, không chỉ đọc văn
  bản tĩnh.
- Tự thao tác, dự đoán, thử phản ví dụ và nhìn thấy invariant/validator cập nhật
  ngay (SBX-01, SBX-02).
- Điều hướng được lời giải tuyến tính, phân nhánh, phản chứng và quay lại bước
  bất kỳ qua deep-link (PLY-01..03).
- Dùng tốt trên laptop và iPad; mọi điều khiển chính dùng được bằng bàn phím và
  touch (NFR-A2, NFR-A3).

### 2.2 Tác giả

- Soạn một bài bằng JSON git-friendly và preview ngay trên Player (AUT-01..04).
- Dùng chung một bộ schema, validator, renderer và lint trong CLI, Studio và CI
  (AUT-04).
- Có thể biến một snapshot scene thành chuyển cảnh tự động (DAT-11), sau đó thêm
  choreography có chủ đích khi lập luận cần dẫn mắt người học (§6).
- Giữ brand visual, thuật ngữ và chất lượng editorial nhất quán trong toàn kho
  (DAT-20, AUT-10).

## 3. Phạm vi nội dung

### 3.1 Engine hiện có

Bảy engine, đúng số đang chạy trong repo. Bản 1.0 liệt kê sáu mục và trộn lẫn
engine với view — `point` và `game` bị bỏ khỏi danh sách engine trong khi §3.2
lại bàn về năng lực của chúng, còn "permutation/poset" thực chất là **layout +
analyzer trên graph engine**, không phải engine riêng:

| Engine | Phạm vi |
|---|---|
| `board` | lưới, phủ hình, tô màu, bất biến, bảng đếm (BD-01..06) |
| `graph` | đồ thị, matching, chu trình, liên thông, tính phẳng, ma trận kề, **poset/Hasse + Dilworth**, chu trình hoán vị (GR-01..08) |
| `sequence` | dãy, đa tập, thao tác lặp |
| `set` | hệ tập hợp, incidence, Venn ≤ 3 tập (ST-01..03) |
| `point` | điểm/đoạn, bao lồi, thẳng hàng, giao điểm, lưới điểm (PT-01..02) |
| `game` | game bốc đống: Grundy, misère, phổ thắng-thua (một phần GM-02..04) |
| `derivation` | chuỗi biến đổi đại số, hạng tử có danh tính (+ label atlas D-07/GR-08) |

Ranh giới "cố ý không làm" của từng engine nằm trong `README.md` và
`docs/VIZ-COVERAGE.md` §4; tài liệu này không nhân bản nó.

### 3.2 Mức hỗ trợ các mảng khác

Bốn dòng dưới đây là **đánh giá hiện trạng**, và mỗi dòng có một ID cho phần còn
thiếu để nó gán được vào milestone:

- **Đại số** — hỗ trợ trình diễn chuỗi biến đổi, telescoping và đếm hai cách.
  **DOM-01 [P3] SHOULD** — primitives cho biểu thức có cấu trúc, bất đẳng thức
  và hàm số; chỉ khi ấy mới gọi là đại số Olympic tổng quát.
- **Lý thuyết số** — hỗ trợ một phần qua sequence, board/table và derivation.
  **DOM-02 [P3] SHOULD** — primitives cho số nguyên, modulo, gcd, ước, phân tích
  thừa số và valuation.
- **Hình học phẳng** — hỗ trợ hình học tổ hợp cơ bản qua point/segment.
  **DOM-03 [P3] SHOULD** — đường tròn, góc, tiếp tuyến, biến hình và cấu hình
  động. (PT-03 tô vùng do các đoạn chia đã có ID sẵn và vẫn còn nợ.)
- **Trò chơi** — hỗ trợ trò dựa trên đống sỏi, tập luật **đóng**.
  **DOM-04 [P3] SHOULD** — game state engine tổng quát: nước tác động nhiều
  đống, luật phụ thuộc lịch sử, legal-move generator theo trạng thái. Đây là
  GM-01 + DSL-03 thật sự, và cả hai đang còn nợ có chủ đích (xem
  `VIZ-COVERAGE.md` §4).

**PRD-04 MUST** — Coverage là số liệu định hướng, không phải cam kết benchmark.
Mọi claim coverage phải gắn với một corpus bài cụ thể; cách biến ước lượng thành
phép đo đã viết ở `VIZ-COVERAGE.md` §5. Số nào chưa đo thì phải **ghi rõ là ước
lượng** ngay tại chỗ nó xuất hiện.

## 4. Mô hình trải nghiệm

Bản 1.0 viết cả mục này ở thể "phải cung cấp", nên không phân biệt được thứ đã
chạy với thứ còn thiếu — người đọc tưởng cả danh sách là việc chưa làm. Mỗi mục
dưới đây tách hai phần, giống cách §6 vốn đã làm đúng.

### 4.1 Player

**Đã có:** kho bài có tìm kiếm không dấu và lọc theo chủ đề/kỹ thuật/engine
(CMS-01..03); statement, narrative LaTeX và canvas đồng bộ; cây step có `case`,
`contradiction`, `merge_ref` (DAT-04); next/previous, autoplay, tốc độ, keyboard,
swipe, deep-link (PLY-01..03); lời giải che mặc định (PLY-05); alt text, reduced
motion, pattern dự phòng màu, kiểm soát focus (NFR-A1..A4).

**Còn thiếu:** PLY-07 (challenge mode), PLY-08 (presenter mode) — đã có ID, thuộc
P2, chưa làm.

### 4.2 Anchor và highlight

**Đã có:** liên kết hai chiều span ↔ element; hover/tap narrative làm nổi bật
element và ngược lại (ANC-01); anchor hỏng là **lỗi validate**, không im lặng
lúc runtime (ANC-02); focus, dim, nhóm nhiều element.

**Còn thiếu:** ANC-03 (camera focus theo anchor) — đã có ID, thuộc P2. Nó là tiền
đề của CHO-06 nên hai chỗ phải làm cùng nhau, không tách.

### 4.3 Sandbox

**Đã có:** phản hồi sau **từng** thao tác, không có nút "kiểm tra" (SBX-01);
chọn, multi-select, undo/redo ≥ 50 bước (ENG-00); tô, đặt tile, xoá, lật
hàng/cột, gộp, đổi chỗ, bật/tắt quan hệ thuộc, nước đi game, đánh dấu triệt tiêu
— **theo đúng engine đang mở**, do engine tự khai (M19); hiển thị vi phạm
validator, invariant và goal (SBX-02); fork scene không sửa snapshot bài gốc.

**Còn thiếu, và bản 1.0 khai như thể đã có:**

- **SBX-06 [P2] SHOULD** — kéo/thả có snap trong Sandbox. Hôm nay lớp công cụ
  chung chỉ biết **bấm**; `board/move-element` và `point/move` là lệnh có thật
  nhưng **không có nút nào** gọi tới, vì bày một nút kéo mà bấm không ăn gì đúng
  bằng lỗi vừa dẹp ở M19.

## 5. Interactive experiments

Sandbox hiện là scene editor có validator; sản phẩm cần thêm lớp **Experiment**
để đạt trải nghiệm khám phá mà không khoá vào một engine riêng.

### 5.1 Mô hình

```text
controls → experiment state → derived scene/data → visualization → checks/hints
```

- **EXP-01 [P2] MUST** — Experiment khai báo **control** trong một tập đóng:
  slider, numeric input, toggle, select, button, play/pause. Tập đóng, không phải
  "widget tuỳ ý" — cùng lý do với `COMBINE_RULES`, `GameRule` và `SandboxTool`:
  ba lần trước, mở tự do đều là mở cửa hậu cho DSL-03.
- **EXP-02 [P2] MUST** — Khai được state ban đầu, miền giá trị và ràng buộc giữa
  các control; miền phải kiểm được lúc validate, không phải lúc chạy.
- **EXP-03 [P2] MUST** — Hàm dẫn xuất scene hoặc dataset từ state là **thuần**,
  đi qua schema, DSL sandboxed (DSL-01/02) hoặc **primitive đã đăng ký của
  engine**. Không code tuỳ ý từ content (NFR-S1).
- **EXP-04 [P2] MUST** — "Primitive đã đăng ký" phải là một **danh sách đóng có
  ID**, engine tự khai và test ép hai chiều như `SandboxTool` (M19): không
  experiment nào gọi primitive engine không có, và primitive nào có thì phải
  dùng được. Không có luật này thì EXP-03 chỉ là một lời hứa, và R-2 (DSL phình
  thành ngôn ngữ lập trình) đi vào từ cửa này.
- **EXP-05 [P2] MUST** — Khai được invariant, prediction, goal, checkpoint, hint.
- **EXP-06 [P2] SHOULD** — Lịch sử thao tác, reset, replay; chạy nhiều lượt.
- **EXP-07 [P2] MAY** — Chế độ stochastic cho bài xác suất. **Bắt buộc có
  seed**, và seed là **một phần của state**: PRNG không seed phá NFR-D2 (CI
  không được đỏ ngẫu nhiên), phá golden snapshot toàn kho, và phá REN-04 (clip
  phải khớp Player). Bản 1.0 viết "chế độ xác định và stochastic" mà không nói
  seed — đó là một câu ngắn kéo theo ba hệ thống vỡ.
- **EXP-08 [P2] MUST** — Experiment render **headless được** (REN-01): cùng
  state cho cùng hình, trong Node và trong browser. Không đạt điều này thì
  experiment không vào được golden test, tức nó là vùng duy nhất trong kho hỏng
  mà không ai biết.

### 5.2 Use case bắt buộc

**EXP-09 [P2] MUST** — Lớp Experiment phải đủ diễn đạt sáu tình huống sau; mỗi
tình huống cần **ít nhất một bài thật** trong kho làm bằng chứng, không phải một
demo:

1. kéo tham số để quan sát bất đẳng thức hoặc cấu hình hình học;
2. tăng `n` để nhận ra quy luật dãy, số đếm hoặc cấu trúc đồ thị;
3. bật/tắt giả thuyết và tìm phản ví dụ;
4. dự đoán invariant trước khi hệ thống xác nhận;
5. chạy nhiều lượt thí nghiệm và xem bảng/biểu đồ cập nhật;
6. guided discovery với câu hỏi, hint, checkpoint — không tự động lộ đáp án.

**EXP-10 [P2] MUST** — Sandbox hiện tại chuyển thành **một loại** experiment,
tương thích ngược: **mọi** bài đang publish không được đổi hành vi, và diff golden của
bước chuyển đổi phải bằng **rỗng**. Đây là chốt canh duy nhất phân biệt "thêm một
lớp" với "viết lại lớp cũ và làm lệch cả kho".

## 6. Animation, transition và choreography

### 6.1 Nền tảng hiện tại

Renderer phải tiếp tục giữ các đặc tính: snapshot scene đầy đủ với element id ổn
định (DAT-11, DAT-12); diff theo key và nội suy **thuần** (D-05); cùng phép tính
cho Player và headless render (REN-01, REN-04); tôn trọng
`prefers-reduced-motion` (NFR-A4).

### 6.2 Yêu cầu còn thiếu

`transition_hints` **đã có ID sẵn: DAT-13 [P2] SHOULD** (override thứ tự xuất
hiện, thời lượng, kiểu di chuyển). Bản 1.0 phát biểu lại nó bằng lời khác mà
không trích ID — vi phạm PRD-01. Phần thật sự mới là **timeline nhiều pha**:

- **CHO-01 [P2] MUST** — Narrative animation layer **độc lập với renderer**:
  renderer vẫn là `Scene → SvgNode[]` thuần, choreography là một lớp đọc
  `(scene, choreography, t)` và cũng phải thuần. Nhét thời gian vào renderer là
  giết D-03 và kéo theo REN-01/02/04.
- **CHO-02 [P2] MUST** — Timeline nhiều pha trong một step; play, pause, replay,
  scrub.
- **CHO-03 [P2] MUST** — Thứ tự xuất hiện/biến mất theo nhóm.
- **CHO-04 [P2] SHOULD** — focus, highlight, pulse, glow, dim nhóm khác.
- **CHO-05 [P2] SHOULD** — move theo đường thẳng hoặc path cong; show/hide,
  transform, morph khi engine hỗ trợ.
- **CHO-06 [P2] SHOULD** — camera zoom/pan/focus. Trùng phạm vi ANC-03, phải làm
  cùng nó.
- **CHO-07 [P2] MUST** — Đồng bộ từng pha với anchor hoặc đoạn narrative. Đây là
  điều phân biệt choreography giải thích với animation trang trí (NG-07).
- **CHO-08 [P2] MUST** — duration, delay, easing, transition hint do tác giả
  khai; **validate được**, và không được phá tính xác định của headless render
  (NFR-D2). Cụ thể: cùng `t` cho cùng khung, ở mọi nơi.
- **CHO-09 [P2] MUST** — Fallback rõ ràng khi reduced motion: bỏ chuyển động
  **không được làm mất thông tin** (NFR-A4). Một pha chỉ tồn tại dưới dạng
  chuyển động là một pha không đọc được với người tắt animation.
- **CHO-10 [P2] MUST** — Animation tự động giữa hai snapshot là **fallback**, và
  không được coi là đã thay choreography giải thích.

Mô hình khái niệm:

```text
Step
 ├─ scene snapshot          (DAT-11)
 ├─ narrative + anchors     (ANC-01)
 └─ choreography/timeline   (CHO-01..10)
     ├─ focus(anchor)
     ├─ dim(group)
     ├─ move(element, path)
     ├─ transform(...)
     ├─ show/hide
     ├─ camera(...)
     └─ pause/checkpoint
```

## 7. Kiến trúc và an toàn

Mục này **không** đặt requirement mới; nó là bản rút gọn để đọc nhanh, và mọi
dòng đều có ID ở SRS:

- Schema là hợp đồng trung tâm; problem JSON không chứa style tự do (DAT-01,
  DAT-20).
- Render thuần không biết DOM hay engine cụ thể; DOM patch/animation là lớp riêng
  (D-03, enforce bằng eslint).
- DSL không dùng `eval`, không truy cập DOM/network, có budget (DSL-01, DSL-02).
- Content chỉ là dữ liệu; không chạy code tuỳ ý (NFR-S1).
- Engine cung cấp schema fragment, renderer, hit test, commands, analyzers,
  validators, DSL builtins, bounds — **và công cụ sandbox** (M19).
- Engine lazy-load theo `engines_used[]` (D-10, NFR-P3).
- Zero backend cho dữ liệu người học trong các phase hiện tại (LOC-01..04).
- Code MIT; content CC BY-SA 4.0; nguồn đề ghi rõ (OPQ-3).

## 8. Chính sách phiên bản schema — chỗ bản 1.0 tự mâu thuẫn

**PRD-05 MUST** — §5 và §6 thêm **schema surface đáng kể** (`experiment`,
`choreography`), trong khi P0 mục 1 dẫn tới gate **G-C: freeze schema `1.0.0`
sau khi chính chủ soạn tay 3–5 bài**. Bản 1.0 xếp cả hai vào cùng một kế hoạch mà
không nói chúng đụng nhau. Cách gỡ, và nó phải được viết ra chứ không để suy diễn:

1. Freeze `1.0.0` chốt **tập trường hiện có**, không chốt "sẽ không thêm gì".
2. `choreography` và `experiment` vào dưới dạng **trường optional, thêm mới**, ở
   `1.1.0` và `1.2.0`. Bài cũ không khai chúng thì đọc y nguyên.
3. Mỗi minor bump đi kèm một bước `combviz migrate` chạy được và một test
   round-trip; DAT-02 (Player đọc được version hiện tại và n−1 minor) vẫn giữ.
4. Bất kỳ thay đổi **phá vỡ** trường đã freeze là `2.0.0`, và cần lý do viết ra,
   không phải một PR tiện tay.

## 9. Ưu tiên triển khai

### P0 — chất lượng lõi

1. **G-C** — soạn và publish 3–5 bài do **chính tác giả** xác minh, rồi freeze
   schema `1.0.0`. Hôm nay 60 bài đều do máy soạn và người soạn cũng là người
   duyệt, nên AUT-09 đang là tự cấp chứng nhận.
2. **G-A** — đo NFR-P1..P3 trên **iPad Gen 9 thật**. Số hiện có đo bằng Chromium
   desktop có bóp CPU; đó là hàng rào rẻ, không phải phép đo của gate.
3. **AUT-KPI** — ≤ 1.5h median một bài qua pipeline, đo trên 5 bài cuối.
4. Hoàn thiện anchor/highlight, reduced motion, accessibility trên thiết bị thật.

**PRD-06 MUST** — "Đồng bộ số liệu kho, coverage và tài liệu" ở bản 1.0 là một
task không đo được, và nó vốn không phải task mà là **luật thường trực**: con số
trong tài liệu phải khớp kho ở **mỗi** commit đổi kho. M17b và M18 đã hạ số
coverage khi phát hiện nó không đứng vững; đó là cách luật này chạy.

### P1 — trải nghiệm giải thích

CHO-01..CHO-03 (timeline, pause, replay, scrub) → CHO-04, CHO-06 + ANC-03
(focus/dim/camera) → DAT-13 (`transition_hints`) → guided discovery (phần thứ 6
của EXP-09, làm được trước khi có cả lớp Experiment vì nó chỉ cần narrative + anchor).

### P2 — experiments

EXP-01..EXP-05 (schema + runtime state) → EXP-06, EXP-07 (history, seeded
stochastic) → EXP-09 (bảng/biểu đồ, trials) → EXP-10 (chuyển Sandbox, diff golden
rỗng).

### P3 — mở rộng miền toán

DOM-01..DOM-04, cộng PT-03 và GM-01 vốn đã nợ.

**PRD-07 MUST** — Không thêm engine mới chỉ để tăng coverage trước khi P0–P2
chứng minh được giá trị học tập và chất lượng content. Hàng đợi engine ở
`VIZ-COVERAGE.md` §7 **đã cạn**, nên luật này hiện không chặn việc gì — nó chặn
việc *tương lai*.

## 10. Tiêu chí nghiệm thu

Bản 1.0 viết mục này bằng những câu không đo được ("người học hiểu mục tiêu và
thao tác được mà không cần hướng dẫn ngoài" — bằng phương pháp nào, ngưỡng nào,
bao nhiêu người?). SRS §15 đã có ngưỡng số; mục này **trích** chúng và chỉ thêm
tiêu chí cho phần mới:

**Kế thừa từ SRS §15 (không phát biểu lại):** DoD Phase 1 mục 1–6, gồm pilot
≥ 10 học sinh + 2 GV với SUS ≥ 75, AUT-KPI ≤ 1.5h median, NFR-P1..P3 pass trên
iPad thật, CI xanh toàn kho.

**Thêm cho phần mới, và đều kiểm được bằng máy:**

- **PRD-08 MUST** — Mỗi claim trong narrative có hình/animation tương ứng, hoặc
  được đánh dấu là văn bản thuần. Máy kiểm được phần cơ học: `claims` (M14) và
  `derivation/silent-drop` (M18) là hai lớp đã chạy.
- **PRD-09 MUST** — Không có trạng thái **im lặng sai**: anchor rot, validator
  không tồn tại, invariant không eval được, nhãn thiếu atlas, nút gọi lệnh engine
  không có — tất cả phải đỏ ở CI. Đây là lớp lỗi tốn nhiều thời gian nhất của kho
  này, và mọi lần đều cùng một hình dạng.
- **PRD-10 MUST** — Player và headless renderer cho ra **cùng** trạng thái ở
  cùng thời điểm, kể cả sau khi có CHO-* và EXP-*. Golden SVG toàn kho là chốt
  canh; experiment/choreography không vào được golden thì không được publish.
- **PRD-11 MUST** — EXP-09: mỗi use case có ≥ 1 bài thật trong kho.
- **PRD-12 MUST** — EXP-10: diff golden của bước chuyển Sandbox → Experiment
  bằng **rỗng**.
- **PRD-13 MUST** — Mọi số liệu coverage gắn với danh sách bài kiểm chứng cụ thể
  (PRD-04).

## 11. Bảng truy vết

| Mục | ID mới | ID sẵn có được trích |
|---|---|---|
| §0 hợp đồng tài liệu | PRD-01..03 | — |
| §3.1 engine | — | BD-01..06, GR-01..08, ST-01..03, PT-01..02, GM-02..04, D-07 |
| §3.2 miền toán | DOM-01..04, PRD-04 | PT-03, GM-01, DSL-03 |
| §4.1 Player | — | CMS-01..03, DAT-04, PLY-01..08, NFR-A1..A4 |
| §4.2 anchor | — | ANC-01..03 |
| §4.3 sandbox | SBX-06 | SBX-01..05, ENG-00 |
| §5 experiment | EXP-01..10 | DSL-01..02, NFR-S1, NFR-D2, REN-01, REN-04, R-2 |
| §6 choreography | CHO-01..10 | DAT-11..13, ANC-01, ANC-03, NFR-A4, NFR-D2, NG-07 |
| §7 kiến trúc | — | DAT-01, DAT-20, DSL-01..02, NFR-S1, NFR-P3, LOC-01..04 |
| §8 version schema | PRD-05 | DAT-02, G-C |
| §9 ưu tiên | PRD-06..07 | G-A, G-C, AUT-KPI, AUT-09 |
| §10 nghiệm thu | PRD-08..13 | SRS §15 DoD P1 |

## 12. Rủi ro của chính hai đề xuất mới

Hai lớp ở §5 và §6 là phần lớn nhất tài liệu này thêm vào, nên chúng phải có
dòng rủi ro riêng — SRS §17 chưa có, vì lúc viết SRS chưa có hai lớp này.

| ID | Rủi ro | Đối sách |
|---|---|---|
| R-9 | **EXP-03/04 trượt thành DSL-03**: "primitive đã đăng ký" nới dần cho tới khi content chạy được logic tuỳ ý | Danh sách đóng có ID + test ép hai chiều (EXP-04); mỗi primitive mới là một PR có lý do, không phải một tham số |
| R-10 | **Mất tính xác định**: seed thiếu (EXP-07) hoặc thời gian lọt vào renderer (CHO-01) làm golden test và REN-04 lệch Player | EXP-08 và CHO-08 đòi headless render khớp; golden SVG toàn kho là chốt canh sẵn có |
| R-11 | **Choreography thành trang trí**: timeline đẹp mà không gánh lập luận (đúng NG-07) | CHO-07 buộc mỗi pha đồng bộ với anchor/narrative; CHO-09 buộc bỏ chuyển động vẫn đọc được |
| R-12 | **EXP-10 làm lệch 60 bài đang publish** | PRD-12: diff golden phải rỗng, không phải "gần rỗng" |
| R-13 | **Phình phạm vi trước khi G-C đóng**: xây EXP/CHO trong khi chưa có bài nào do chính chủ soạn — đúng R-1 (content bottleneck) ở dạng mới | P0 xếp trước P1/P2 trong §9 và thứ tự đó có răng: AUT-KPI trượt thì dồn sửa pipeline trước khi mở lớp mới (SRS §9, không phải §7 — chỗ này `PLAN-P1.md` và `VIZ-COVERAGE.md` đang trích sai) |

## 13. Ngoài phạm vi

Bổ sung vào SRS §2 (NG-01..NG-08), **không** thay nó:

- proof assistant hoặc tự động xác minh toàn bộ chứng minh;
- auto-solve bài cho người học;
- LMS, điểm tập trung, leaderboard, account, đồng bộ đa thiết bị;
- no-code editor cho tác giả ngoài;
- animation trang trí không phục vụ narrative (NG-07);
- engine tổng quát cho mọi môn học trước khi lõi tổ hợp đạt chất lượng;
- **control tuỳ ý hoặc primitive tuỳ ý trong Experiment** — đây là ranh giới mới
  mà tài liệu này thêm, và nó là ranh giới quan trọng nhất trong §5.
