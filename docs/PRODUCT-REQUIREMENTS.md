# CombViz — Product Requirements

**Phiên bản:** 1.0  
**Ngày:** 2026-07-29  
**Trạng thái:** hợp nhất định hướng sản phẩm và các khoảng trống ưu tiên

## 1. Tóm tắt sản phẩm

CombViz là một content brand giáo dục về lời giải Tổ hợp Olympiad. Sản phẩm
công chúng là kho bài đã curate; engine, Studio và pipeline là xưởng in riêng
của một tác giả. Mỗi bài trình bày lời giải theo từng bước trên canvas tương
tác, liên kết hai chiều giữa narrative và hình, đồng thời cho phép người học
thử cấu hình và tìm phản ví dụ.

CombViz **không** là proof assistant, GeoGebra, LMS, hệ thống thi đấu hoặc
platform đa tác giả. Máy có thể draft và kiểm tra cấu hình; tác giả chịu trách
nhiệm xác minh lập luận trước khi publish.

## 2. Mục tiêu

### 2.1 Người học

- Hiểu một lập luận bằng cách quan sát trạng thái thay đổi, không chỉ đọc văn
  bản tĩnh.
- Tự thao tác, dự đoán, thử phản ví dụ và nhìn thấy invariant/validator cập nhật
  ngay.
- Điều hướng được lời giải tuyến tính, phân nhánh, phản chứng và quay lại bước
  bất kỳ qua deep-link.
- Dùng tốt trên laptop và iPad; mọi điều khiển chính dùng được bằng bàn phím và
  touch.

### 2.2 Tác giả

- Soạn một bài bằng JSON git-friendly và preview ngay trên Player.
- Dùng chung một bộ schema, validator, renderer và lint trong CLI, Studio và CI.
- Có thể biến một snapshot scene thành chuyển cảnh tự động, sau đó thêm
  choreography có chủ đích khi lập luận cần dẫn mắt người học.
- Giữ brand visual, thuật ngữ và chất lượng editorial nhất quán trong toàn kho.

## 3. Phạm vi nội dung

### 3.1 Phạm vi ưu tiên

Tổ hợp là lõi của sản phẩm. Các engine hiện có cần tiếp tục hỗ trợ:

- board: lưới, phủ hình, tô màu, bất biến, bảng đếm;
- graph: đồ thị, matching, chu trình, liên thông, phẳng;
- sequence: dãy, đa tập, thao tác lặp;
- set: hệ tập hợp, incidence, Venn;
- permutation/poset và các view song ánh;
- derivation và label atlas cho các biến đổi/nhãn công thức.

### 3.2 Mức hỗ trợ các mảng khác

- **Đại số:** hỗ trợ trình diễn chuỗi biến đổi, telescoping và đếm hai cách;
  chưa coi là đại số Olympic tổng quát nếu chưa có biểu thức, bất đẳng thức,
  hàm số và nghiệm tương tác.
- **Lý thuyết số:** hỗ trợ một phần qua sequence, board/table và derivation;
  cần primitives cho số nguyên, modulo, gcd, ước, phân tích thừa số và
  valuation để bao phủ rộng hơn.
- **Hình học phẳng:** hỗ trợ hình học tổ hợp cơ bản qua point/segment, đường
  thẳng, giao điểm và bao lồi; chưa đủ cho đường tròn, góc, tiếp tuyến, biến
  hình và cấu hình động tổng quát.
- **Trò chơi:** hỗ trợ các trò dựa trên đống sỏi; chưa đủ cho game có nước tác
  động nhiều đống, phụ thuộc lịch sử hoặc có luật trạng thái tổng quát.

 Coverage là số liệu định hướng, không phải cam kết benchmark. Mỗi claim coverage
 phải được kiểm chứng bằng một corpus bài cụ thể.

## 4. Mô hình trải nghiệm

### 4.1 Player

Player phải cung cấp:

- kho bài có tìm kiếm không dấu và lọc theo chủ đề, kỹ thuật, engine;
- statement, narrative LaTeX và canvas đồng bộ;
- cây step có case, contradiction và merge reference;
- next/previous, autoplay, tốc độ, keyboard, swipe và deep-link;
- lời giải che mặc định để người học có cơ hội tự nghĩ;
- alt text, reduced motion, pattern dự phòng màu và kiểm soát focus.

### 4.2 Anchor và highlight

Anchor liên kết span trong narrative với element trong scene theo hai chiều:

- hover/tap narrative làm nổi bật element;
- tap element làm nổi bật các span tham chiếu;
- anchor hỏng là lỗi validate, không được im lặng lúc runtime;
- highlight phải hỗ trợ focus, dim phần không liên quan, nhóm nhiều element
  và camera focus khi cần.

### 4.3 Sandbox

Sandbox phải phản hồi sau từng thao tác, không cần nút “kiểm tra”:

- chọn, multi-select, kéo/thả có snap, undo/redo;
- đặt, xóa, tô, lật hàng/cột, gộp và đổi chỗ tùy engine;
- hiển thị vi phạm validator, invariant và goal;
- cho phép tạo cấu hình phản ví dụ mà không sửa snapshot bài gốc.

## 5. Interactive experiments

Sandbox hiện là scene editor có validator; sản phẩm cần thêm lớp **Experiment**
để đạt trải nghiệm khám phá kiểu Brilliant mà không khóa vào một engine riêng.

### 5.1 Mô hình

```text
controls → experiment state → derived scene/data → visualization → checks/hints
```

Experiment phải khai báo được:

- control: slider, numeric input, toggle, select, button và play/pause;
- state ban đầu, miền giá trị và ràng buộc;
- hàm dẫn xuất scene hoặc dataset từ state;
- invariant, prediction, goal, checkpoint và hint;
- lịch sử thao tác, reset, replay và tùy chọn chạy nhiều lượt;
- chế độ xác định và stochastic nếu bài cần thí nghiệm xác suất.

### 5.2 Use case bắt buộc

- kéo tham số để quan sát bất đẳng thức hoặc cấu hình hình học;
- tăng `n` để nhận ra quy luật dãy, số đếm hoặc cấu trúc đồ thị;
- bật/tắt giả thuyết và tìm phản ví dụ;
- dự đoán invariant trước khi hệ thống xác nhận;
- chạy nhiều lượt thí nghiệm và xem bảng/biểu đồ cập nhật;
- guided discovery với câu hỏi, hint và checkpoint, không tự động lộ đáp án.

Experiment không được cho phép code tùy ý từ content. Logic phải đi qua schema,
DSL sandboxed hoặc primitive đã đăng ký của engine.

## 6. Animation, transition và choreography

### 6.1 Nền tảng hiện tại

Renderer phải tiếp tục giữ các đặc tính:

- snapshot scene đầy đủ, element id ổn định;
- diff theo key và nội suy thuần;
- cùng phép tính cho Player và headless render;
- tôn trọng `prefers-reduced-motion`.

### 6.2 Yêu cầu còn thiếu

Hệ thống phải có **narrative animation layer** độc lập với renderer, hỗ trợ:

- timeline nhiều pha trong một step;
- play, pause, replay và scrub;
- thứ tự xuất hiện/biến mất theo nhóm;
- focus, highlight, pulse, glow và dim nhóm khác;
- camera zoom/pan/focus;
- move theo đường thẳng hoặc path cong;
- show/hide, transform và morph khi engine hỗ trợ;
- đồng bộ từng pha với anchor hoặc đoạn narrative;
- duration, delay, easing và transition hint do tác giả khai báo;
- fallback rõ ràng khi reduced motion.

Mô hình khái niệm:

```text
Step
 ├─ scene snapshot
 ├─ narrative + anchors
 └─ choreography/timeline
     ├─ focus(anchor)
     ├─ dim(group)
     ├─ move(element, path)
     ├─ transform(...)
     ├─ show/hide
     ├─ camera(...)
     └─ pause/checkpoint
```

Animation tự động giữa hai snapshot là fallback; không được giả vờ thay thế
choreography giải thích. `transition_hints` phải được validate và không được
phá tính xác định của headless render.

## 7. Kiến trúc và an toàn

- Schema là hợp đồng trung tâm; problem JSON không chứa style tự do.
- Render thuần không biết DOM hay engine cụ thể.
- DOM patch/animation là lớp riêng.
- DSL không dùng `eval`, không truy cập DOM/network và có budget.
- Content chỉ là dữ liệu; không chạy code tùy ý.
- Engine cung cấp schema fragment, renderer, hit test, commands, analyzers,
  validators, DSL builtins và bounds.
- Engine được lazy-load theo `engines_used[]`.
- Zero backend cho dữ liệu người học trong các phase hiện tại.
- Code MIT; content CC BY-SA 4.0; nguồn đề phải được ghi rõ.

## 8. Ưu tiên triển khai

### P0 — chất lượng lõi

1. Soạn và publish 3–5 bài mẫu do chính tác giả xác minh.
2. Đồng bộ số liệu kho, coverage và tài liệu.
3. Hoàn thiện anchor/highlight, reduced motion, accessibility và kiểm thử trên
   iPad thật.
4. Đo performance thực tế trước khi tối ưu renderer.

### P1 — trải nghiệm giải thích

1. Narrative animation layer: timeline, pause, replay, scrub.
2. Focus/dim/camera và choreography liên kết anchor.
3. `transition_hints` cho order, duration, easing và path.
4. Guided discovery trong Player.

### P2 — experiments

1. Experiment schema và runtime state.
2. Controls, derived data/scene, goal, prediction, hint và checkpoint.
3. Bảng/biểu đồ và stochastic trials.
4. Chuyển Sandbox hiện có thành một loại experiment tương thích ngược.

### P3 — mở rộng miền toán

1. Geometry primitives cho đường tròn, góc, tiếp tuyến và biến hình.
2. Number-theory primitives cho modulo, gcd, ước, prime factors và valuation.
3. Algebra/derivation engine cho biểu thức, bất đẳng thức và hàm số.
4. Game state engine tổng quát có legal moves và history.

Không thêm engine mới chỉ để tăng coverage trước khi P0–P2 chứng minh được giá
trị học tập và chất lượng content.

## 9. Tiêu chí nghiệm thu

Một release được coi là đạt khi:

- người học mở bài, hiểu mục tiêu và thao tác được mà không cần hướng dẫn ngoài;
- mỗi claim trong narrative có hình/animation tương ứng hoặc được đánh dấu là
  văn bản thuần;
- anchor, validator, invariant và goal không có trạng thái im lặng sai;
- transition đọc được lập luận, không chỉ làm cảnh chuyển động mượt;
- reduced motion và keyboard vẫn giữ được thông tin;
- content validate được bằng cùng bộ luật trong CLI, Studio và CI;
- Player và headless renderer cho ra cùng trạng thái ở cùng thời điểm;
- 3–5 bài mẫu được người học/giáo viên dùng thử và phản hồi trước khi mở rộng
  engine;
- mọi số liệu coverage được gắn với danh sách bài kiểm chứng cụ thể.

## 10. Ngoài phạm vi

- proof assistant hoặc tự động xác minh toàn bộ chứng minh;
- auto-solve bài cho người học;
- LMS, điểm tập trung, leaderboard, account và đồng bộ đa thiết bị;
- no-code editor cho tác giả ngoài;
- animation trang trí không phục vụ narrative;
- engine tổng quát cho mọi môn học trước khi lõi tổ hợp đạt chất lượng.
