# SRS — Nền tảng minh họa tương tác lời giải Tổ hợp Olympiad

Working name: **CombViz** (OPQ-1 — giờ là quyết định brand, không chỉ là đặt tên) · Phiên bản 1.0 · 2026-07-29 · Trạng thái: baseline P1

> **Changelog v1.0 (từ 0.9-draft)** — Đổi operating model: **single-author brand engine** (mô hình manim/3Blue1Brown): engine là xưởng in riêng của một tác giả; brand nằm ở corpus + taste, không phải platform đa tác giả. Hệ quả: **gỡ** no-code cho tác giả ngoài (AUT-07), review UI (CMS-04), contribution cộng đồng (CMS-07), toàn bộ accounts/backend (USR-01..05, NFR-S3, NFR-D3). **Thêm**: draft pipeline LLM → validate → duyệt tay (AUT-09), Editorial Style Guide + lint (AUT-10), nhóm REN (OG card, video render), nhóm LOC (dữ liệu người học client-side), siết brand-lock style (DAT-20). AUT-KPI 4h → **1.5h/bài** qua pipeline. ID bị gỡ giữ nguyên số và đánh dấu *Removed v1.0* để truy vết.

---

## 1. Giới thiệu

### 1.1 Mục đích tài liệu

Đặc tả yêu cầu cho toàn bộ sản phẩm qua 3 phase. Phase 1 là cam kết baseline; Phase 2/3 là định hướng đầy đủ, được phép revise theo dữ liệu thực từ P1. Mọi requirement có ID, phase tag và mức bắt buộc để truy vết và kiểm thử.

### 1.2 Tầm nhìn sản phẩm

Một **content brand** về tổ hợp Olympiad, vận hành theo mô hình manim/3Blue1Brown: engine (Player + Studio + pipeline) là xưởng in riêng của đúng một tác giả; sản phẩm công chúng là **kho bài đã curate** với chất lượng và nhận diện đồng nhất tuyệt đối. Người học nhận: lời giải trình diễn từng bước trên canvas tương tác, văn bản ↔ hình liên kết hai chiều, sandbox thử phản ví dụ. Chính chủ nhận: pipeline soạn–duyệt đủ nhanh để **một người** nuôi được kho bài, và một hệ thống ép nhất quán bằng schema thay vì bằng kỷ luật cá nhân.

### 1.3 Người dùng mục tiêu & bối cảnh

- Học sinh chuyên toán THCS/THPT luyện VMO/TST/IMO. Thiết bị chính: laptop và iPad.
- Giáo viên / HLV đội tuyển: dùng presenter mode (PLY-07) và collection link để dạy — **không có role riêng** trong hệ thống.
- Tác giả: **đúng một người** (chính chủ) — power user, làm việc JSON/keyboard-first, có LLM draft hộ. Không tồn tại persona "tác giả ngoài cần no-code" trong mọi phase.

### 1.4 Thuật ngữ

| Thuật ngữ | Nghĩa trong tài liệu |
|---|---|
| Problem | Đơn vị nội dung trung tâm: đề bài + metadata + ≥1 Solution + cấu hình sandbox |
| Statement | Đề bài (LaTeX, đa ngôn ngữ) |
| Solution | Một lời giải, cấu trúc **cây Step** |
| Step | Một bước lời giải: narrative + Scene snapshot + anchors + widget state |
| Scene | Trạng thái hình vẽ đầy đủ tại một Step, thuộc đúng một Engine |
| Element | Phần tử trong Scene (đỉnh, cạnh, ô, quân, tile, điểm...), có id ổn định |
| Engine | Bộ schema + renderer + interaction + analyzer cho một họ đối tượng tổ hợp |
| Anchor | Liên kết hai chiều giữa span văn bản trong narrative và tập Element |
| Selector | Cách trỏ tới Element: danh sách id (P1) hoặc query thuộc tính (P2) |
| Analyzer | Thuật toán chỉ-đọc trên Scene (thành phần liên thông, chu trình, matching...) |
| Validator | Ràng buộc trên Scene, đánh giá đúng/sai + chỉ ra phần tử vi phạm |
| Widget | Panel nguyên lý gắn vào Player (invariant strip, partition view...) |
| Expression DSL | Ngôn ngữ biểu thức thuần, sandboxed, để định nghĩa invariant/validator |
| Player | Giao diện trình diễn lời giải cho người học |
| Sandbox | Chế độ tự do thao tác trên Scene, có/không validator |
| Studio | Công cụ soạn–duyệt bài, phục vụ đúng một power user |
| Draft pipeline | Quy trình AUT-09: LLM sinh problem JSON → validate + lint → chính chủ duyệt từng step trong Studio |
| Style Guide | Tài liệu quy ước editorial (AUT-10), một phần enforce được bằng lint |
| Theme tokens | Bộ giá trị hiển thị trung tâm (màu, phông, nét) — nguồn duy nhất của brand visual |

### 1.5 Quy ước requirement

- ID dạng `<MODULE>-<số>`. Phase tag `[P1] [P2] [P3]`. Mức bắt buộc theo RFC 2119: MUST / SHOULD / MAY.
- Mọi FR kiểm thử được bằng thao tác cụ thể; mọi NFR có số đo và điều kiện đo.
- ID đã gỡ **giữ nguyên số** và đánh dấu *Removed v1.0* kèm lý do — không tái sử dụng số.

---

## 2. Non-goals (áp dụng mọi phase)

- **NG-01** Không phải proof assistant. Hệ thống *minh họa* lời giải, không xác minh chứng minh. Ngoại lệ duy nhất: Validator kiểm tính hợp lệ của một *cấu hình cụ thể* (cách phủ, cách tô, cách đặt quân).
- **NG-02** Không phải GeoGebra. Engine điểm/đoạn chỉ phục vụ tổ hợp; không hình học động tổng quát.
- **NG-03** Không auto-solve trong sản phẩm cho người học. Ở pipeline soạn bài, LLM **được** dùng để draft (AUT-09), nhưng mọi bước lập luận phải được chính chủ verify trước khi publish — máy draft, người chịu trách nhiệm. Không có nội dung sinh máy chạy trực tiếp tới người học.
- **NG-04** Không phải LMS: không chấm điểm tập trung, không thi cử, không leaderboard.
- **NG-05** Không hỗ trợ cấu hình vượt bound NFR-P4. Công cụ minh họa lời giải thi đấu, không phải công cụ nghiên cứu.
- **NG-06** Không NLP tự động ánh xạ văn bản sang hình. Anchor là thủ công (§4.5, §9) — quyết định thiết kế, không phải hạn chế tạm thời.
- **NG-07** **Single-author**: không nhận nội dung ngoài, không multi-author, không contribution cộng đồng trong phạm vi 3 phase. Nhất quán brand đứng trên tốc độ mở rộng kho. Người ngoài muốn góp → góp *đề xuất bài* (issue), không góp *nội dung*.
- **NG-08** **Zero backend** trong 3 phase: không account, không server dữ liệu người dùng. Dữ liệu người học nằm client-side (nhóm LOC). Trade-off chấp nhận công khai: không sync đa thiết bị.

---

## 3. Actors & Roles

| Actor | Quyền chính | Phase |
|---|---|---|
| Learner (guest, mặc định và duy nhất) | Đọc, Player, Sandbox, challenge; tiến độ/attempt lưu client-side, không account | P1 (LOC từ P2) |
| Owner-Author (chính chủ) | Toàn quyền: Studio local + git; kiêm luôn vai admin/review của 0.9 | P1 |
| GV / HLV | Không role hệ thống — dùng như Learner + presenter mode + share link collection | P2 |
## 4. Domain model & định dạng dữ liệu

Đây là phần quyết định của toàn hệ thống. Mọi module (Engine, Player, Studio, CMS) đều là hàm của mô hình này.

### 4.1 Lifecycle spine

Thực thể trung tâm là **Problem**, vòng đời: `draft → published → archived`. Review là tự-duyệt của chính chủ theo pipeline AUT-09 + lịch sử git; **không có** trạng thái `in_review` và không có review UI ở bất kỳ phase nào (đổi so với 0.9). Mọi quyền hạn, luồng nghiệp vụ và màn hình đều treo trên spine này.

### 4.2 Problem

Fields: `id` (slug ổn định), `schema_version`, `statement` (đa ngôn ngữ, LaTeX), `source {contest, year, slot}`, `topics[]`, `techniques[]`, `difficulty {slot_proxy, author_rating 1–10}`, `engines_used[]`, `license`, `authors[]`, `status`, `created/updated`, `invariants[]`, `solutions[]` (≥1), `sandbox`, `assets[]`.

- **DAT-01 [P1] MUST** — Mỗi problem là một file JSON tự chứa, validate được bằng JSON Schema công bố kèm repo. Schema là hợp đồng trung tâm giữa mọi package.
- **DAT-02 [P1] MUST** — `schema_version` theo semver. Player đọc được phiên bản hiện tại và n−1 minor. Nâng major đi kèm công cụ migrate CLI chạy được trên toàn kho.
- **DAT-03 [P1] MUST** — File git-friendly: thứ tự key ổn định, pretty-print, id nội bộ ổn định qua các lần save (không random hóa) để diff/PR đọc được.
- **DAT-04 [P1] MUST** — Export/import round-trip không mất dữ liệu (idempotent).

### 4.3 Solution: cây Step

Một Solution là **cây** các Step; root là trạng thái xuất phát từ đề bài. Timeline tuyến tính không đủ cho lời giải Olympiad (xét trường hợp, phản chứng, quy nạp) — đây là requirement cấu trúc, không phải nice-to-have.

Step fields: `id`, `parent`, `edge_type ∈ {seq, case, contradiction, merge_ref}`, `case_label`, `merge_target?`, `narrative` (LaTeX + anchor markup), `anchors`, `scene`, `bijection?` (PRN-04), `choreography?` (CHO-01..12), `alt_text?`, `author_notes?`, `claims?`, `expects_violation?`, `verified?` (AUT-09). (`widget_state` và `transition_hints` từng đứng ở đây từ bản nháp SRS — cả hai 0 người dùng và đã gỡ trước freeze 1.0.0; vai trò của `transition_hints` do `choreography` đảm nhận.)

Ngữ nghĩa `edge_type`:

- `seq` — bước kế tiếp tuyến tính.
- `case` — rẽ nhánh xét trường hợp; nhiều con cùng cha, mỗi con có `case_label`.
- `contradiction` — nhánh kết thúc bằng mâu thuẫn; là leaf, đánh dấu ✗.
- `merge_ref` — con trỏ từ leaf của một case quay về step "tổng hợp" chung. Giữ cấu trúc là **cây + tham chiếu**, không phải DAG thật: render và navigation đơn giản hơn hẳn, đủ biểu đạt cho mẫu chứng minh thi đấu.

- **DAT-10 [P1] MUST** — Solution là cây không giới hạn độ sâu; case node có nhãn; contradiction leaf có đánh dấu riêng; merge_ref phải trỏ tới step tồn tại (validate).
- **DAT-11 [P1] MUST** — Mỗi Step lưu **snapshot Scene đầy đủ** (declarative). Diff chỉ tồn tại ở runtime/tối ưu lưu trữ, không bao giờ là mô hình ngữ nghĩa. *Rationale:* snapshot cho random access (kéo timeline, deep-link vào step bất kỳ, nhảy nhánh) mà không cần replay; loại bỏ nguyên một lớp bug replay-order; kích thước không đáng kể ở bound NFR-P4.
- **DAT-12 [P1] MUST** — Mọi Element có **id ổn định xuyên các Step**. Runtime tự diff hai snapshot liên tiếp theo id để sinh animation (thêm/xóa/di chuyển/đổi style) — tác giả không phải khai báo animation tay. Đây là cơ chế cho phép "soạn trạng thái, được tặng chuyển động".
- **DAT-13 [P2] SHOULD** — ~~`transition_hints`~~ **Đã thực hiện bằng `choreography` (CHO-01..12)**: override animation mặc định — thứ tự xuất hiện, thời lượng, mốc, `move`/`morph`/`from` — đi qua timeline nhiều pha thay vì một trường hints riêng. Trường `transition_hints` chưa từng có người dùng và đã gỡ khỏi schema trước freeze 1.0.0.
- **DAT-14 [P1] MUST** — Deep-link `…/p/<problem_id>?sol=<sol_id>&step=<step_id>` mở đúng step, đúng nhánh.

### 4.4 Scene & Element model

Scene = `{engine, config, elements[], viewport}`. Element chung: `id`, `type`, thuộc tính ngữ nghĩa theo engine, `emphasis ∈ {none, focus, dim}`, `layer`, `locked`. Không có trường style tự do — xem DAT-20.

- **DAT-20 [P1] MUST** — Tách **ngữ nghĩa** khỏi **hiển thị**, siết mức brand-lock: file problem **không chứa** màu, phông, kích thước cụ thể — chỉ thuộc tính ngữ nghĩa (`color_class` 1..k, `emphasis`); schema cấm trường style tự do (whitelist đóng). Toàn bộ hiển thị đến từ **một bộ theme tokens trung tâm** ở app: đổi brand = sửa một file theme, cả kho đổi theo, không thể lệch từng bài. Mỗi color_class có pattern dự phòng cho người mù màu (NFR-A1). DSL/Validator/Analyzer chỉ tham chiếu thuộc tính ngữ nghĩa. Quy ước *ngữ nghĩa* của màu theo dạng bài (vd. color_class 1 = "đen" trong lập luận tô màu) thuộc Style Guide (AUT-10).
- **DAT-21 [P1] MUST** — `viewport` (khung nhìn, zoom) lưu per-step nhưng mặc định kế thừa step cha; Player chỉ animate viewport khi tác giả đổi chủ đích.

### 4.5 Anchor

Markup trong narrative: `[[a3|đỉnh $v_1$ và các cạnh kề]]`; bảng `anchors` của step ánh xạ `a3 → selector`.

- **ANC-01 [P1] MUST** — Hai chiều: hover/tap span → highlight elements; tap element → highlight mọi span đang tham chiếu nó trong step hiện tại.
- **ANC-02 [P1] MUST** — Anchor trỏ tới id không tồn tại trong scene của step là **lỗi validate** (báo lúc soạn, không im lặng lúc chạy). Đây là chống "anchor rot" khi tác giả sửa scene.
- **ANC-03 [P2] SHOULD** — Selector query trên thuộc tính ngữ nghĩa chuẩn hóa per engine, ví dụ `vertex[deg=max]`, `cell[color_class=2]`, để anchor sống sót qua chỉnh sửa scene tốt hơn danh sách id cứng.

### 4.6 Expression DSL

Dùng cho: invariant (PRN-01), validator tham số (SBX), partition (PRN-02), selector query (ANC-03).

- **DSL-01 [P1] MUST** — Ngôn ngữ biểu thức **thuần** (không side effect, không vòng lặp tự do): số học, so sánh, logic, lambda trong `count/sum/min/max/forall/exists` trên tập Element; builtin per engine (`deg(v)`, `covered(c)`, `attacks(p,q)`...). Grammar đóng, đặc tả kèm schema.
- **DSL-02 [P1] MUST** — Interpreter riêng, sandboxed: không eval JS, không truy cập DOM/network, budget mặc định 50ms/lần eval, vượt thì cắt + báo lỗi. Nội dung problem là **dữ liệu**, không phải code.
- **DSL-03 [P3] MAY** — Mở rộng script *có trạng thái* cho Game rule/AI (§5.5), chạy Web Worker với budget riêng (NFR-S2). Tách hẳn khỏi DSL thuần, không trộn.

### 4.7 Ví dụ file (rút gọn) — bàn cờ khuyết hai góc

```json
{
  "schema_version": "1.0.0",
  "id": "mutilated-chessboard",
  "statement": { "vi": "Bàn cờ $8\\times8$ bỏ hai ô góc đối nhau. Chứng minh không thể phủ kín phần còn lại bằng 31 quân domino $1\\times2$." },
  "source": { "contest": "folklore" },
  "topics": ["tiling", "coloring"],
  "techniques": ["invariant", "parity"],
  "difficulty": { "slot_proxy": "P1", "author_rating": 2 },
  "engines_used": ["board"],
  "license": "CC-BY-SA-4.0",
  "invariants": [{
    "id": "inv-bw",
    "label": "Ô đen chưa phủ − ô trắng chưa phủ",
    "expr": "count(cells, c => c.color_class==1 && !covered(c)) - count(cells, c => c.color_class==2 && !covered(c))"
  }],
  "solutions": [{
    "id": "sol-mau",
    "steps": [
      { "id": "s0", "parent": null, "edge_type": "seq",
        "narrative": { "vi": "Bàn cờ khuyết [[a1|hai ô góc đối nhau]] còn $62$ ô." },
        "anchors": { "a1": { "ids": ["cell-0-0", "cell-7-7"] } },
        "scene": { "engine": "board", "config": { "rows": 8, "cols": 8, "holes": [[0,0],[7,7]] }, "elements": [] } },
      { "id": "s1", "parent": "s0", "edge_type": "seq",
        "narrative": { "vi": "Tô xen kẽ hai màu. Hai ô bị bỏ [[a2|cùng màu]], nên còn $30$ ô màu 1 và $32$ ô màu 2." },
        "anchors": { "a2": { "ids": ["cell-0-0", "cell-7-7"] } },
        "scene": { "engine": "board", "config": { "rows": 8, "cols": 8, "holes": [[0,0],[7,7]], "coloring_preset": { "type": "checkerboard", "k": 2 } }, "elements": [] } },
      { "id": "s2", "parent": "s1", "edge_type": "contradiction",
        "narrative": { "vi": "Mỗi domino phủ đúng một ô mỗi màu, nên 31 domino phủ $31{+}31$ — mâu thuẫn với $30{+}32$." },
        "scene": { "engine": "board", "config": { "…": "như s1, thêm vài domino minh họa" }, "elements": [ { "id": "t1", "type": "tile", "shape": "domino", "pos": [3,3], "rot": 0 } ] } }
    ]
  }],
  "sandbox": { "validators": ["tiles-no-overlap", "tiles-in-bounds"], "goal_expr": "count(cells, c => !covered(c)) == 0" }
}
```

---

## 5. FR nhóm ENG — Engines

### 5.0 Yêu cầu chung mọi engine

- **ENG-00 [P1] MUST** — Chọn (click/tap), multi-select (khung quét / giữ shift / tap lần lượt trên touch), kéo-thả có snap. Undo/redo ≥ 50 bước trong Studio và Sandbox.
- **ENG-01 [P1] MUST** — Mọi thao tác chỉnh sửa đi qua **command layer** (danh sách lệnh có tham số). Phục vụ: undo/redo, log authoring, và là nền cho no-code editor P2 + Game move P3. Không mutate state trực tiếp từ UI.
- **ENG-02 [P1] MUST** — Zoom/pan (pinch trên touch), fit-to-view, reset viewport.
- **ENG-03 [P1] MUST** — Render SVG-first. Chuyển Canvas khi vượt ngưỡng là quyết định triển khai, không được đổi hành vi tương tác.
- **ENG-04 [P1] MUST** — Analyzer chạy ngoài UI thread khi > 100ms (worker), cache kết quả theo hash của scene, hủy được.

### 5.1 Graph Engine [P1]

Element: `vertex {pos, label, color_class, shape}`, `edge {u, v, directed, multi_index, weight?, color_class, style}`. Hỗ trợ multigraph và loop (cần cho một số bài đếm).

- **GR-01 [P1] MUST** — Thêm/xóa/di chuyển đỉnh; thêm/xóa cạnh (chọn 2 đỉnh hoặc kéo từ đỉnh này sang đỉnh kia); directed/undirected per-edge; tô `color_class` đỉnh/cạnh với palette k ≤ 8.
- **GR-02 [P1] MUST** — Layout: manual là chính; hỗ trợ sắp nhanh: vòng tròn, lưới, hai hàng (bipartite). **[P2] SHOULD** force-directed nhưng chỉ là công cụ nháp trong Studio: kết quả bake thành tọa độ tĩnh. Không có physics động trong Player — vị trí đỉnh là nội dung sư phạm, không phải trang trí.
- **GR-03 [P1] MUST** — Analyzer: bậc đỉnh (badge bật/tắt), thành phần liên thông (tô nhóm), kiểm tra hai phía + tô 2 lớp, tìm và highlight một chu trình, kiểm điều kiện Euler + chỉ ra một đường/chu trình Euler cụ thể.
- **GR-04 [P1] MUST** — Hamilton path/cycle bằng backtracking, chỉ chạy khi n ≤ 20 đỉnh; vượt bound thì từ chối kèm thông báo rõ (không treo). Bound ghi tại NFR-P4.
- **GR-05 [P2] SHOULD** — Planarity check (thuật toán chuẩn qua thư viện) + gợi ý planar embedding; sau khi có embedding, cho phép tô **mặt** (face). Tách bạch ba việc: kiểm planar / vẽ embedding / tô mặt — spec này cam kết cả ba ở P2 với bound ≤ 100 đỉnh.
- **GR-06 [P2] SHOULD** — Bipartite matching tối đa + highlight đường tăng. Phục vụ trực tiếp cụm bài Hall/König — một trong những cụm nhiều bài nhất của graph thi đấu.
- **GR-07 [P2] MAY** — Panel degree sequence; adjacency/incidence matrix view đồng bộ hai chiều với canvas (chọn ô ↔ highlight cạnh) — cầu nối sang double counting.
- **GR-08 [P1] MUST** — Nhãn LaTeX cho đỉnh và cạnh.

### 5.2 Grid/Board Engine [P1]

Element: `board m×n` (config, hỗ trợ ô khuyết), `cell {color_class, glyph}`, `piece {type: vua/hậu/xe/tượng/mã/tốt/custom-glyph, pos}`, `tile` (polyomino: thư viện domino, tromino I/L, tetromino, pentomino + custom bằng offset list; `rot`, `flip`, `pos`), `region` (nhóm ô có viền đậm).

- **BD-01 [P1] MUST** — Tô màu ô k-palette; kéo quét để tô nhanh; **coloring preset tham số hóa**: checkerboard, sọc k màu theo hàng/cột/đường chéo (chọn k, hướng, pha). Preset là công cụ chứng minh chủ lực của dạng tiling, phải là first-class chứ không phải tô tay.
- **BD-02 [P1] MUST** — Đặt/di chuyển/xóa piece; overlay vùng khống chế (attack map) bật/tắt cho từng quân hoặc toàn bộ.
- **BD-03 [P1] MUST** — Đặt tile với xoay/lật; phát hiện chồng lấn và tràn biên realtime (đỏ phần vi phạm); đếm coverage (số ô đã phủ / tổng số ô).
- **BD-04 [P1] MUST** — Validator built-in: `tiles-no-overlap`, `tiles-in-bounds`, `phủ kín`, `không quân nào ăn nhau`, `mỗi hàng/cột có đúng k quân`; điều kiện khác khai báo bằng DSL.
- **BD-05 [P2] SHOULD** — Board khuyết ô tùy ý (đã có ở config P1 mức hole list; P2 thêm công cụ vẽ vùng khuyết), region hình tùy ý; **[P2] MAY** torus wrap.
- **BD-06 [P1] MUST** — Summary strip: đếm ô theo color_class tự động cập nhật (phục vụ lập luận đếm-theo-màu, chạy cùng invariant strip).

### 5.3 Set/Counting Engine [P2]

Element: `token` (phần tử ground set), `set` (container), quan hệ thuộc.

- **ST-01 [P2] MUST** — Hai view đồng bộ: (a) container/Venn tối đa 3 tập; (b) **incidence matrix** phần tử × tập. View (b) là chủ lực — trong lời giải thi đấu thật, bảng thuộc/không thuộc và đếm hai chiều xuất hiện nhiều hơn hẳn sơ đồ Venn; Venn giữ vai trò minh họa nhập môn.
- **ST-02 [P2] SHOULD** — Đếm `|A|, |A∩B|, |A∪B|` tự động; panel inclusion–exclusion cho ≤ 3 tập.
- **ST-03 [P2] SHOULD** — Dot/bar view cho multiset (đếm theo lớp) — dùng chung với PRN-02.

### 5.4 Point/Segment Engine [P2]

- **PT-01 [P2] MUST** — Đặt điểm (tùy chọn ép "không có 3 điểm thẳng hàng" khi thêm — engine tự nhích epsilon và cảnh báo), vẽ đoạn nối, tô màu điểm/đoạn.
- **PT-02 [P2] SHOULD** — Analyzer: convex hull (highlight + đếm), đếm giao điểm các đoạn, bound n ≤ 200 điểm.
- **PT-03 [P3] MAY** — Tô vùng do các đoạn chia (arrangement). Đắt và hiếm bài cần; chỉ làm khi seed content P3 đòi hỏi.

### 5.5 Game Engine [P3]

Mô hình: `state` = Scene; `move` = command hợp lệ theo rule script (DSL-03); `turn`; điều kiện kết thúc + người thắng.

- **GM-01 [P3] MUST** — Định nghĩa game bằng rule script sandboxed: `legal_moves(state, player)`, `apply(state, move)`, `terminal(state) → winner`.
- **GM-02 [P3] MUST** — Hai người chơi local (pass-and-play) trên cùng thiết bị.
- **GM-03 [P3] SHOULD** — "AI" theo hai đường, tuyên bố rõ với tác giả: (a) **strategy script** do tác giả viết (khuyến nghị mặc định — winning strategy của bài toán *chính là* nội dung sư phạm); (b) solver tự động (retrograde/minimax + memo) chỉ khi ước lượng state space ≤ 10⁶ (Studio có công cụ ước lượng; vượt bound thì chỉ còn đường (a)). **Không hứa AI tổng quát** — đây là chỗ hồ sơ yêu cầu gốc mâu thuẫn với no-code, spec này chọn giải pháp trên.
- **GM-04 [P3] SHOULD** — Ghi lại ván chơi thành chuỗi step nháp để tác giả chuyển thử nghiệm thành minh họa lời giải.

---

## 6. FR nhóm PLY — Solution Player

Player là sản phẩm chính. Nguyên tắc UI: canvas là nhân vật chính, chrome tối giản; mọi trạng thái ngữ nghĩa có cách đọc không-phụ-thuộc-màu (pattern/shape, NFR-A1); mật độ thị giác thấp — tối đa 8 color_class, không trang trí thừa.

- **PLY-01 [P1] MUST** — Điều khiển: Prev/Next, Play/Pause với tốc độ ×0.5/×1/×2, jump-to-step; phím ←/→ và Space; swipe trái/phải trên touch.
- **PLY-02 [P1] MUST** — **Tree navigator** cho lời giải phân nhánh: minimap cây lời giải (thu gọn được); tại case node người học chọn nhánh; nhánh contradiction hiển thị ✗ khi đã đóng; breadcrumb vị trí hiện tại ("Trường hợp 2 › 2.1"); nút "về điểm rẽ nhánh". Auto-play dừng ở case node chờ người học chọn.
- **PLY-03 [P1] MUST** — Narrative pane render KaTeX, tự cuộn đồng bộ theo step; anchor hai chiều theo ANC-01. Layout responsive: narrative bên phải (landscape) hoặc dưới (portrait).
- **PLY-04 [P1] MUST** — Animation giữa hai step sinh từ auto-diff (DAT-12): mặc định ≤ 400ms, easing thống nhất; tôn trọng `prefers-reduced-motion` (nhảy thẳng trạng thái).
- **PLY-05 [P1] MUST** — **"Thử từ đây"**: tại bất kỳ step nào, fork Scene hiện tại sang Sandbox (kèm validator của bài) mà không phá trạng thái Player; một nút quay lại đúng step đang xem. Đây là cầu nối học-bằng-nghịch, tính năng phân biệt chính so với đọc lời giải tĩnh.
- **PLY-06 [P1] MUST** — **Invariant strip**: nếu problem khai báo `invariants[]`, hiển thị giá trị từng biểu thức tại step hiện tại + sparkline theo tiến trình nhánh đang xem; đánh dấu trực quan khi giá trị đổi/không đổi qua mỗi bước.
- **PLY-07 [P2] SHOULD** — Chế độ trình chiếu cho GV: fullscreen, con trỏ nhấn mạnh, điều khiển bằng phím/remote, QR code để học sinh mở đúng problem+step trên thiết bị của mình (dựa trên DAT-14).
- **PLY-08 [P2] SHOULD** — Self-check nhẹ gắn tại step: trắc nghiệm/điền số ngắn do tác giả soạn, phản hồi tại chỗ, không chấm điểm tập trung (NG-04).
- **ANC-05 [P2] SHOULD** — **Anchor xuyên pane**: với step song ánh, anchor trỏ được vào element của **cả hai** scene và rê vào một câu thì cả hai pane cùng sáng. Kiểm: id phải có ở một trong hai pane (hợp), nhưng "view này không vẽ" vẫn tính **theo từng pane**. Kèm theo (M66): scene bên phải nay đi qua **đủ** lượt validate của engine nó — trước đó nó chỉ bị soi trần kích thước, nên `config` sai kiểu và cả DAT-20 (brand-lock) có cửa sau ở nửa phải.
- **PLY-09 [P2] SHOULD** — **Chạm vào hình để hỏi**: chạm tại chỗ (dưới 8px, phân biệt với vuốt đổi step ở 48px) trên canvas hỏi engine "phần tử này có gì để kể", và câu trả lời đổ vào **cùng** cơ chế highlight của anchor — không thêm đường render thứ hai. Engine nào không có gì để kể thì chạm không làm gì. Thực hiện đầu tiên (M63): tiểu sử hạng tử của engine `algebra` (AL-13); mở đường cho các câu hỏi khác đứng lên cùng chỗ chạm ấy.
  - Thứ tự ưu tiên vệt sáng: rê chuột trên lời kể › thứ vừa chạm › pha timeline đang chạy. Xoá khi chạm hụt, `Escape`, hoặc đổi step.
- **AL-16 [P3] MAY** — **Chuỗi luỹ thừa hình thức**: nguyên tử `inf` (kiểu nút thứ 14 — kế hoạch M68 đếm nhầm 15, số thật đo từ union `Expr`) cho cận vô hạn, và một **sân kiểm thứ tư** so hai biểu thức bằng **hệ số** (hữu tỉ chính xác trên `bigint`, không xác suất, không sai số). Biểu thức chứa `inf` định tuyến sang sân này; ba sân bốc điểm cũ trả `verified: false` một cách trung thực. Luật v1: `geometric_series` hai chiều, cố ý hẹp. `sum_expand` từ chối vô hạn có lời; `sum_shift` giữ $\infty + c = \infty$.
- **AL-17 [P3] MAY** — **Ký hiệu hàm không diễn giải**: nút `ufn` cho $f$, $g$ của một phương trình hàm — tên là chữ tác giả gõ, không có bảng nào để tra. Không sân nào tính được nó; thay vào đó `check.ts` **trừu tượng hoá** mỗi lời gọi $f(t)$ cực đại thành một nguyên tử rồi chạy lại chính hợp đồng cũ, nên cả tập luật áp được trên biểu thức chứa $f$ và câu phép kiểm khẳng định là *"bước này đúng với mọi hàm $f$"*. Luật `specialize` thay một biến bởi một **biểu thức** trên cả phương trình, hợp đồng `instance` (không phải `implies` — xem `ENGINE-ALGEBRA.md` §45.3).
- **AL-18 [P3] MAY** — **Dãy số**: cách viết chỉ số dưới (`ufn.notation = 'sub'`) cho $a_n$, $a_1$, $a_{k+1}$ — cùng kiểu nút với AL-17, vì một dãy *là* một hàm trên chỉ số và chỗ khác nhau duy nhất là cách viết. Khi một $a_{\cdot}$ nằm dưới dấu $\Sigma$/$\Pi$ ràng buộc chính chỉ số của nó, phép trừu tượng hoá AL-17 **mù** (nó gán một nguyên tử cho một giá trị đổi theo $k$) nên `check.ts` chuyển sang **diễn giải**: thay mỗi ký hiệu bằng một đa thức bậc $\le 3$ có hệ số là biến được bốc. Ký hiệu nhiều đối số dưới dấu $\Sigma$ thì khai không kiểm được thay vì bịa một họ hàm. Luật `sum_telescope` ($\sum (a_{k+1} - a_k) = a_{n+1} - a_1$, một chiều); `substitute_from` nhận một số hạng dãy có chỉ số **đóng** làm ẩn. Xem `ENGINE-ALGEBRA.md` §46.
- **AL-19 [P3] MAY** — **Trích hệ số**: nút `coeff` cho $[x^n]F(x)$ (kiểu nút thứ 16) — biến chuỗi **bị ràng buộc**, bậc thì **tự do**. Nút này *tự tính*: với bậc nguyên không âm, `check.ts` đóng băng mọi biến tự do khác theo điểm đã bốc rồi khai `of` thành chuỗi tới đúng bậc ấy, nên mọi đồng nhất thức hàm sinh với $n$ ký hiệu kiểm được trên **bộ bốc điểm nguyên** sẵn có — không sân mới. Bốn luật: `coeff_of_product` (tích chập Cauchy), `coeff_linear`, `coeff_shift` (điều kiện $n \ge d$ là một `Guard`), `coeff_repeated_geometric` ($[x^n](1-x)^{-m} = \binom{n+m-1}{m-1}$). Bậc không nguyên/âm, biến chưa bốc, chuỗi không khai được → không kiểm được, không đoán. Xem `ENGINE-ALGEBRA.md` §47.
- **AL-15 [P2] MAY** — **Trục số**: engine đại số vẽ tập nghiệm của những dòng ở **dạng chuẩn** (một vế là biến trần, vế kia là hằng) thành một trục có đoạn tô, đầu mút đặc/rỗng theo dấu ngặt, mũi tên khi nghiệm chạy ra vô cùng. Bật bằng `show_sets` (mặc định tắt). Dòng chưa về dạng chuẩn thì **không vẽ và không than** — engine không có bộ giải (NG-03). Mỗi đoạn tô được đối chiếu với chính `evalRelation` mà bộ kiểm dùng.
- **AL-14 [P2] SHOULD** — **Bằng chứng nhìn được**: kết quả phép kiểm của từng bước giữ lại **các điểm đã bốc** (`witnesses`, tối đa 8 đồng thuận + điểm phản chứng), gắn theo dòng; một chấm trong máng cạnh nhãn luật mang kết luận (đã kiểm / chưa kiểm được / sai), chỉ ở chế độ giải thích nên ảnh tĩnh của kho không đổi. Điều kiện tích luỹ (AL-08) mang theo `Guard`, nên chạm vào dòng đỏ trả về **một điểm cụ thể** làm nó gãy ("tại $a = 0$: $a = 0$ — chia cho không"). Không tìm được thì im — engine không có bộ giải và không bịa điểm.
- **AL-13 [P2] SHOULD** — **Tiểu sử hạng tử**: với engine `algebra`, chạm một hạng tử làm sáng cả phả hệ của nó — tổ tiên lẫn hậu duệ — ở mọi dòng nó có mặt. Suy từ `AlgebraRow.trace` và tính bền của `TermId` (DAT-11/12); không có dữ liệu mới nào được thêm. Nút nhân bản thì phả hệ rẽ nhánh, nút gộp thì đi lên ra nhiều tổ tiên, nút mới sinh **không** bịa ra tổ tiên.

---

## 7. FR nhóm PRN — Nguyên lý tổ hợp tích hợp

Triết lý: nguyên lý **sống bên trong problem player và sandbox**, không phải widget demo đứng rời. Giá trị sư phạm của Dirichlet không nằm ở hoạt hình thả thỏ mà ở chỗ *nhận ra chuồng là gì trong bài này*.

- **PRN-01 [P1] MUST** — Invariant/Monovariant: khai báo bằng DSL trên problem; hiển thị qua PLY-06; và quan trọng nhất: **hiển thị live trong Sandbox** khi người học tự thao tác — học sinh thấy tận mắt đại lượng đứng yên khi mình nghịch. Monovariant: đánh dấu chiều đơn điệu, cảnh báo khi thao tác làm giá trị đi ngược chiều khai báo.
- **PRN-02 [P1] MUST** — Partition/Pigeonhole view: tác giả định nghĩa một phân hoạch các Element (bằng selector/DSL, ví dụ theo `color_class`, theo lớp đồng dư của tọa độ); panel hiển thị các "chuồng" với kích thước, min/max tự động, đồng bộ highlight với canvas.
- **PRN-03 [P2] SHOULD** — Double counting: tác giả khai báo quan hệ hai ngôi (X × Y, phần tử quan hệ xác định bằng DSL); hệ thống dựng bảng incidence với tổng hàng/tổng cột tự động; click hàng/cột/ô ↔ highlight trên canvas. Dùng chung hạ tầng với GR-07 và ST-01b.
- **PRN-04 [P2] SHOULD** — Bijection view: hai pane cấu hình cạnh nhau + ánh xạ id↔id do tác giả khai báo; hover một bên sáng bên kia; animation "biến hình" theo từng cặp. Đây là widget đắt giá nhất cho các bài đếm bằng song ánh — flagship của P2.
- **PRN-05 [P2] SHOULD** — Extremal helper: sort/gắn badge theo key DSL; nút "highlight argmax/argmin" ("xét đỉnh có bậc lớn nhất"). Bản chất là selector + badge trên hạ tầng sẵn có, chi phí thấp, tần suất dùng cao.
- **PRN-06 [P3] MAY** — Parameterized construction (quy nạp): generator script sandboxed sinh Scene theo tham số n, slider n trong bound khai báo; minh họa "dựng S(n+1) từ S(n)" bằng cách diff hai scene sinh ra (tái dùng DAT-12).

---

## 8. FR nhóm SBX — Sandbox & Validation

- **SBX-01 [P1] MUST** — Hai cửa vào: sandbox độc lập per engine (không cần problem, từ menu chính) và sandbox theo problem (khởi tạo từ scene đề bài, nạp sẵn validator + invariant của bài; cửa thứ ba là PLY-05).
  - **Bảng nước đi tại chỗ chọn (M65)** — engine nào có khái niệm "nước đi tại một phần tử" thì sandbox hiện danh sách ấy cạnh chỗ chạm, **đã lọc** còn những nước áp được tại đúng nút đó; nước cần tham số mở một ô nhập; không áp được thì hiện **nguyên văn** lời từ chối của engine. Thực hiện đầu tiên: `algebra` (79 luật, một lệnh `apply_rule`). Không có nút "gợi ý bước tiếp theo" — engine không có bộ giải (NG-03).
- **SBX-02 [P1] MUST** — Validator live: vi phạm hiển thị tức thời (element vi phạm đánh dấu đỏ + message cụ thể); danh sách constraint đang áp dụng, bật/tắt từng cái để "nới luật" khi thí nghiệm.
- **SBX-03 [P2] SHOULD** — **Challenge mode**: problem có thể yêu cầu người học *xây* cấu hình (một cách phủ, một cách tô, một phản ví dụ); hệ thống chấm bằng validator + `goal_expr`; attempt lưu client-side (LOC-02). Khai báo rõ trong metadata: problem thuộc loại minh họa / challenge / cả hai.
- **SBX-04 [P2] SHOULD** — Chia sẻ trạng thái sandbox bằng URL (state nén trong fragment, không cần backend); người nhận mở ra đúng cấu hình để tranh luận phản ví dụ với nhau.
- **SBX-05 [P1] MUST** — Export PNG/SVG scene hiện tại (kèm/không kèm chú thích), phục vụ dán vào vở, slide, bài nộp.

---


---

## 9. FR nhóm AUT — Authoring Studio

Triết lý v1.0: Studio phục vụ **đúng một power user**. JSON là first-class UI — không giấu, không bọc; keyboard-first; tối ưu throughput chứ không tối ưu learnability. Binding constraint của cả platform vẫn là tốc độ ra nội dung — nhưng lời giải giờ là pipeline người–máy, không phải tuyển thêm người.

- **AUT-01 [P1] MUST** — Tạo step mới = **duplicate scene của step trước → chỉnh trực tiếp trên canvas → save**; narrative editor cạnh bên với live preview KaTeX. Vẫn là đường soạn tay nhanh nhất kể cả cho power user.
- **AUT-02 [P1] MUST** — Anchor tool: bôi đen span → click element(s) → tạo anchor; danh sách anchor per step, click kiểm tra; cảnh báo anchor rot theo ANC-02 ngay trong editor.
- **AUT-03 [P1] MUST** — Thao tác cây: thêm case sibling, `case_label`, contradiction leaf, merge_ref; kéo-thả sắp xếp; xóa nhánh có confirm.
- **AUT-04 [P1] MUST** — **Validate problem**: schema, anchor, eval invariant/validator mọi step, bound engine, editorial lint (AUT-10); lỗi click-to-jump. Chạy được cả dạng **CLI** — cùng một bộ dùng cho Studio, pipeline (AUT-09) và CI (NFR-D2).
- **AUT-05 [P1] MUST** — Preview dùng đúng Player thật (cùng codebase) + khung giả lập iPad.
- **AUT-06 [P1] MUST** — Import/export JSON; làm việc file local không cần server (File System Access API, fallback upload/download).
- **AUT-07** — *Removed v1.0*: no-code editor cho tác giả ngoài không còn đối tượng phục vụ (NG-07). Expression builder UI, template wizard: bỏ.
- **AUT-08 [P2] SHOULD** — Studio tự đo thời gian soạn/duyệt per bài (log local), hiển thị cho chính chủ — nguồn số của AUT-KPI, không còn là "telemetry opt-in đa người".
- **AUT-09 [P1] MUST** — **Draft pipeline**: (1) đầu vào cho LLM = JSON Schema + Style Guide + đề bài + phác thảo lời giải của chính chủ (nếu có); (2) LLM sinh problem JSON draft; (3) CLI `import-draft` chạy AUT-04 đầy đủ, draft đạt thì vào hàng đợi duyệt; (4) Studio mở chế độ duyệt: đi **từng step**, mỗi step phải được đánh dấu *verified* thủ công; publish bị khóa khi còn step chưa verified. Draft máy là nội dung không tin cậy như mọi nội dung khác (NFR-S1) — không đường tắt. Schema + theme + lint chính là bộ ép brand: LLM có draft kiểu gì cũng không lệch được nhận diện.
- **AUT-10 [P1] MUST** — **Editorial Style Guide** là deliverable P1, sống trong repo (~2 trang), tối thiểu gồm: quy ước notation (đặt tên đỉnh/ô/quân), **ngữ nghĩa màu theo dạng bài** (vd. color_class 1 = "đen" trong lập luận tô màu, thống nhất toàn kho), cấu trúc một step chuẩn (một ý/step, độ dài mục tiêu), giọng văn, cách đặt tên và vị trí invariant, format `case_label`. Kèm bộ **lint** enforce phần máy kiểm được: glossary thuật ngữ, format case_label, ràng buộc chéo techniques↔widget (bài tag `invariant` phải khai `invariants[]`), cảnh báo mềm narrative quá dài. Visual consistency do engine ép (DAT-20); editorial consistency do Style Guide + lint ép — hai tầng của brand.
- **AUT-KPI [P1]** — Median thời gian ra một bài mức IMO P1/P4 (15–25 step) **qua pipeline AUT-09: ≤ 1.5 giờ** (gồm cả duyệt từng step); đường soạn tay thuần: ≤ 4 giờ. Đo trên 5 bài cuối pilot. Trượt → backlog dồn sửa pipeline/Studio **trước khi** mở engine mới. Gate này vẫn có răng.

---

## 10. FR nhóm CMS — Problem Bank

- **CMS-01 [P1] MUST** — Metadata & taxonomy theo §4.2; controlled vocabulary `topics/techniques` là file YAML trong repo, chỉ chính chủ sửa. Không tag tự do.
- **CMS-02 [P1] MUST** — Danh sách + filter contest/topic/technique/difficulty/engine; full-text search statement, index build-time, client-side (đủ ở quy mô ≤ 500 bài).
- **CMS-03 [P1] MUST** — Trang problem: statement + sandbox trước; **lời giải che mặc định**; hỗ trợ nhiều solution song song.
- **CMS-04** — *Removed v1.0*: không review UI ở mọi phase. Review = duyệt từng step trong AUT-09 + lịch sử git.
- **CMS-05 [P2] MUST** *(nâng từ SHOULD)* — Collection/chuyên đề curated: thứ tự, lời dẫn, landing riêng. Curation chính là brand — đây là mặt tiền của kho, không phải tính năng phụ.
- **CMS-06 [P1] MUST** — `license` bắt buộc per problem. Statement trích nguồn kỳ thi và ghi rõ nguồn. Solution: tự viết, hoặc draft máy đã được chính chủ **verify từng step** (AUT-09) — về trách nhiệm là tác phẩm của chính chủ. Cấm chép AoPS/sách/blog; cảnh giác LLM regurgitate lời giải có sẵn: khi cấu trúc lập luận của draft trùng bất thường một nguồn đã biết → viết lại bằng giọng của kho (checklist R-5/R-8). License nội dung gốc dự kiến CC BY-SA 4.0 (OPQ-3).
- **CMS-07** — *Removed v1.0*: contribution cộng đồng đi ngược NG-07. Kênh tiếp nhận duy nhất từ bên ngoài: issue đề xuất *bài nên làm*, không nhận nội dung.

---

## 11. FR nhóm REN — Render & xuất bản

Engine render deterministic từ snapshot + auto-diff (DAT-11/12), nên xuất bản đa kênh gần như miễn phí về mặt kiến trúc. Với một content brand, đây là **kênh growth chính**, không phải phụ kiện — nhóm này là lý do kiến trúc render phải tách khỏi event layer từ ngày đầu (§14).

- **REN-01 [P1] MUST** — Headless render một Scene → SVG/PNG ở build time (CLI, không cần browser tương tác). Nền của mọi xuất bản tĩnh.
- **REN-02 [P1] MUST** — OG/social card tự sinh per problem: scene tiêu biểu (chính chủ chọn step trong Studio) + brand mark + tên bài; chạy trong build, không làm tay.
- **REN-03 [P1] MUST** — Mọi export từ Sandbox (SBX-05) đóng brand mark kín đáo ở góc; người học không tắt được, chính chủ tắt được trong Studio.
- **REN-04 [P2] MUST** — Render solution playback → video (webm/mp4), preset **16:9 và 9:16**, tốc độ và điểm dừng cấu hình theo step, caption lấy từ narrative (bật/tắt). Mục tiêu vận hành: 1 bài → 1 clip với ≤ 15 phút chỉnh tay. Nhánh case render thành các clip riêng hoặc một clip theo đường đi chọn trước.
  - **Phần lõi đã có (M62)** — `combviz film <bài> [--fps] [--hold] [--apng] --out <dir>`: dãy `frame-%04d.png` + `manifest.json`, tuỳ chọn gộp APNG. Dùng **đúng** `applyChoreography` mà Player dùng, nên đây cũng là chỗ CHO-08 lần đầu được kiểm (`tools/pipeline/test/film.test.ts`). Điểm dừng theo `hold` của step đã tôn trọng. **Chưa có:** preset 16:9/9:16, caption từ narrative, webm/mp4 (dựng ngoài repo từ dãy PNG — ffmpeg không vào repo, xem `ENGINE-ALGEBRA.md` §38.1), gộp nhiều step thành một clip.
- **REN-05 [P3] MAY** — Kịch bản render nâng cao: nhấn anchor theo timeline, ghép voice-over track thu ngoài. Không TTS trong phạm vi.

---

## 12. FR nhóm LOC — Dữ liệu người học (client-side, không tài khoản)

Thay thế toàn bộ nhóm USR của 0.9 theo NG-08. **USR-01..USR-05 — *Removed v1.0***.

- **LOC-01 [P2] MUST** — Bookmark, đánh dấu "đã học", resume đúng step: lưu IndexedDB trên thiết bị.
- **LOC-02 [P2] MUST** — Challenge attempt (SBX-03) lưu local, xem lại lịch sử cấu hình đã nộp.
- **LOC-03 [P2] SHOULD** — Export/import toàn bộ dữ liệu cá nhân ra một file JSON — đường chuyển máy thủ công, trade-off chấp nhận của NG-08.
- **LOC-04 [P1] MUST** — Analytics (nếu bật): cookieless, aggregate, không PII, không thu bất kỳ nội dung người học nhập; tuân thủ pháp luật bảo vệ dữ liệu cá nhân VN. User base phần lớn vị thành niên — mọi tính năng xã hội công khai nằm ngoài phạm vi (khớp NG-07/08).
## 13. NFR (nhóm yêu cầu thứ 4 — thiếu trong hồ sơ gốc)

### 13.1 Hiệu năng

Thiết bị chuẩn đo: iPad Gen 9 (A13) / Safari, và laptop i5 thế hệ 8 / Chrome. Đo bằng script tự động trong CI perf + checklist tay trên thiết bị thật.

- **NFR-P1 [P1] MUST** — Kéo-thả/tô quét ≥ 55fps (p95 frame time ≤ 18ms) với scene ≤ 300 element hiển thị.
- **NFR-P2 [P1] MUST** — Chuyển step (diff + bắt đầu animation) ≤ 150ms p95.
- **NFR-P3 [P1] MUST** — TTI trang problem ≤ 3s trên 4G (p75); bundle Player ≤ 300KB gzip chưa tính KaTeX font.
- **NFR-P4 [P1] MUST** — Bound nội dung, validate lúc soạn (AUT-04): graph ≤ 300 đỉnh + 1000 cạnh; analyzer nặng có bound riêng (Hamilton ≤ 20 đỉnh, planarity ≤ 100 đỉnh); board ≤ 40×40; tile ≤ 400; điểm ≤ 200; step ≤ 200/solution; file problem ≤ 1MB.
- **NFR-P5 [P1] MUST** — Mọi analyzer chạy > 100ms: worker + spinner + cancel (khớp ENG-04).

### 13.2 Thiết bị & tương thích

- **NFR-C1 [P1] MUST** — Evergreen Chrome/Edge/Firefox (2 bản gần nhất), Safari/iPadOS ≥ 16.
- **NFR-C2 [P1] MUST** — Touch first-class: hit target ≥ 44×44pt; **không có affordance hover-only** — mọi tương tác hover có tương đương tap; pinch zoom/pan trong canvas không xung đột scroll trang.
- **NFR-C3 [P1] SHOULD** — Dùng tốt ở 1024×768 (iPad ngang, kể cả split view); layout narrative đổi trục theo hướng màn hình.

### 13.3 Accessibility

- **NFR-A1 [P1] MUST** — Palette mặc định color-blind-safe (Okabe–Ito); mọi `color_class` có kênh dự phòng pattern/shape bật được toàn cục (dựa trên DAT-20).
- **NFR-A2 [P1] MUST** — Điều khiển Player đầy đủ bằng bàn phím; focus visible.
- **NFR-A3 [P1] SHOULD** — Mỗi step có `alt_text` (tác giả soạn; fallback auto: tóm tắt đếm element theo loại). Ghi nhận công khai giới hạn: không cam kết screen-reader đầy đủ cho canvas tương tác.
- **NFR-A4 [P1] MUST** — Tôn trọng `prefers-reduced-motion` toàn hệ thống.

### 13.4 i18n

- **NFR-I1 [P1] MUST** — UI string externalized; nội dung đa ngôn ngữ per-field (`vi` bắt buộc, `en` tùy chọn — quyết định phạm vi tại OPQ-5); render tiếng Việt chuẩn trong cả KaTeX text mode.

### 13.5 Bảo mật & sandboxing nội dung

- **NFR-S1 [P1] MUST** — Nội dung problem là **dữ liệu, không phải code**: không eval JS từ file problem; DSL đi qua interpreter riêng (DSL-02); KaTeX render với `trust: false` (chặn `\href` javascript và tương tự); asset chỉ nhận định dạng ảnh whitelist. Draft sinh từ pipeline (AUT-09) là nội dung *không tin cậy* như mọi nội dung khác: đi qua đúng validator và sandbox DSL, không có đường tắt trust.
- **NFR-S2 [P3] MUST** — Khi có script (GM-01, PRN-06): chạy trong Web Worker cách ly, không DOM/không network, budget 100ms/lượt gọi và 64MB; vượt budget → kill + báo lỗi hiển thị. Giữ nguyên dù single-author: script do chính chủ viết hay máy draft thì bug vẫn treo máy người học — cách ly là vệ sinh, không phải chống ác ý.
- **NFR-S3** — *Removed v1.0*: không có backend trong phạm vi 3 phase (NG-08).

### 13.6 Độ bền dữ liệu

- **NFR-D1 [P1] MUST** — Toàn bộ content nằm trong git repo: lịch sử đầy đủ, review qua PR, không lock-in nền tảng.
- **NFR-D2 [P1] MUST** — CI validate toàn kho mỗi commit (đúng bộ AUT-04); chính sách schema migration theo DAT-02.
- **NFR-D3** — *Removed v1.0*: không có DB; git là source of truth duy nhất (NG-08, NFR-D1).

### 13.7 Offline

- **NFR-O1 [P2] SHOULD** — PWA: cache app shell + problem đã mở; sandbox độc lập hoạt động offline hoàn toàn.

---


---

## 14. Kiến trúc khuyến nghị (guidance — không phải requirement)

- **Static forever.** Cả 3 phase không có backend (NG-08): SPA TypeScript + kho JSON trong git, build ra static site; search index và OG card sinh lúc build. "CMS" là git; "database người dùng" là IndexedDB.
- **Render tách khỏi event layer từ ngày đầu.** Renderer nhận Scene → cây SVG thuần túy, không biết gì về chuột/touch; interaction là lớp bọc ngoài. Đây là điều kiện để REN-01/04 dùng *đúng renderer đó* chạy headless (Node + svg→raster, hoặc headless browser — chọn lúc triển khai) và bảo đảm video giống hệt player.
- **Monorepo:** `packages/schema` (JSON Schema + types — hợp đồng trung tâm), `packages/theme` (tokens — nguồn brand duy nhất, DAT-20), `packages/dsl`, `packages/engines/*`, `packages/render`, `apps/player`, `apps/studio`, `tools/pipeline` (import-draft, lint, OG build).
- **LLM chỉ sống trong `tools/pipeline`** — build tooling của chính chủ, không bao giờ chạm runtime người học.
- Immutable state + command layer (ENG-01) giữ nguyên vai trò: undo/diff/animation/replay video đều rẻ nhờ nó.

---

## 15. Phasing & Definition of Done

### Phase 1 — Player + Graph/Grid + Studio & Pipeline (~1 học kỳ)

**In scope:** DAT/ANC/DSL-01..02 toàn bộ, ENG-00..04, GR-01..04 + GR-08, BD-01..04 + BD-06, PLY-01..06, PRN-01..02, SBX-01..02 + SBX-05, AUT-01..06 + AUT-09 + AUT-10 + AUT-KPI, CMS-01..03 + CMS-06, REN-01..03, LOC-04, toàn bộ NFR tag [P1].

**Definition of Done:**

1. **25 bài published**, phân bố: ≥ 10 grid (tiling/coloring/pieces), ≥ 10 graph, ≥ 5 lấy invariant làm trục; ≥ 8 bài case-branching thật, ≥ 10 bài có invariant strip, 100% có sandbox + validator, 100% pass editorial lint + checklist tự duyệt (AUT-10), 100% có OG card (REN-02).
2. **Style Guide v1** nằm trong repo, được lint tham chiếu, và đã ổn định qua ≥ 5 bài soạn tay đầu tiên (xem §16).
3. **AUT-KPI đạt**: ≤ 1.5h median qua pipeline trên 5 bài cuối; đường tay ≤ 4h.
4. **NFR-P1..P3 pass** trên 3 bài nặng nhất, đo trên iPad thật.
5. **Pilot**: ≥ 10 học sinh đội tuyển + 2 GV; SUS ≥ 75; top-10 friction vào backlog P2.
6. **CI xanh** toàn kho (validate + lint) trên mọi commit.

### Phase 2 — Mở rộng engine + Video + Curation

**In scope:** ST-01..03, PT-01..02, GR-05..07, BD-05, DAT-13, ANC-03, PLY-07..08, PRN-03..05, SBX-03..04, AUT-08 (+ ergonomics nâng cao: command palette, bulk edit, snippet cá nhân — hậu duệ gọn của AUT-07 cho một người dùng), CMS-05, REN-04, LOC-01..03, NFR-O1.

**DoD:** kho ≥ **60 bài** (chủ đích thấp hơn con số 80 của 0.9 — chất trên lượng, gate lint/checklist giữ nguyên, xem §16); ≥ 3 collection curated có landing; REN-04 nghiệm thu "1 bài → 1 clip ≤ 15 phút chỉnh tay" đo trên 10 bài liên tiếp; challenge mode chạy trên ≥ 20 bài; bijection view dùng trong ≥ 5 bài đếm; presenter mode + share link được ≥ 1 đội tuyển dùng dạy thật.

### Phase 3 — Game + Quy nạp + Render nâng cao

**In scope:** GM-01..04, DSL-03, PRN-06, PT-03, REN-05, NFR-S2.

**DoD:** ≥ 10 bài game hoàn chỉnh (họ Nim, trò chơi tô/xóa, trò chơi trên đồ thị) có minh họa chiến thuật thắng chơi được; ≥ 3 bài quy nạp dùng PRN-06; ≥ 1 chuyên đề game curated phát hành kèm clip.

---

## 16. Seed content plan (P1 — 25 bài)

Tiêu chí: mỗi bài (a) tự đứng vững về sư phạm, (b) phô diễn ≥ 1 năng lực nền tảng, (c) **pass Style Guide checklist — không đạt thì không publish, không deadline nào ép được**. 25 bài này là bộ mặt brand; với brand, 25 bài xuất sắc thắng 100 bài khá.

Trình tự vận hành quan trọng: **3–5 bài đầu soạn tay hoàn toàn** để Style Guide kết tinh từ thực tế, *rồi mới* bật pipeline AUT-09 — Style Guide viết trước khi soạn bài nào là Style Guide bịa.

Khung phân bố:

- **Tiling/coloring (grid):** domino trên bàn khuyết hai góc (bài mẫu §4.7); tromino L phủ bàn $2^n \times 2^n$ khuyết 1 ô (quy nạp dạng tĩnh); các bài "tô k màu chứng minh không phủ được" với preset sọc/chéo; đếm theo màu với BD-06.
- **Pieces (grid):** n quân hậu cỡ nhỏ; phủ xe không ăn nhau; khống chế/độc lập của mã dùng attack map; mã đi tuần bàn nhỏ dựng cross-engine trên Graph — demo Hamilton GR-04.
- **Graph:** bắt tay & parity tổng bậc; $R(3,3)=6$ trên $K_6$ hai màu — bài anchor/case-branching mẫu mực; Euler phiên bản đề thi; cực trị cạnh kiểu Turán nhỏ; tournament có "vua".
- **Invariant-centric:** lật dấu trên bảng ±; gộp đống sỏi theo mod; các bài thao tác lặp có bất biến rõ — trục demo PLY-06 + PRN-01 trong sandbox.

---

## 17. Rủi ro & câu hỏi mở

| ID | Rủi ro | Khả năng / Ảnh hưởng | Đối sách |
|---|---|---|---|
| R-1 | Content bottleneck: engine xong mà kho lèo tèo | Cao / Cao | AUT-KPI 1.5h làm gate; pipeline AUT-09 là hạng mục P1, không phải để sau; cắt engine trước khi cắt content |
| R-2 | DSL phình thành ngôn ngữ lập trình | Vừa / Cao | Grammar đóng (DSL-01); script có trạng thái cách ly ở DSL-03 |
| R-3 | Perf iPad Safari (SVG + KaTeX dày) | Vừa / Vừa | Budget đo từ tuần 2; pre-render KaTeX lúc build; đường lùi Canvas sau render interface |
| R-4 | Anchor rot khi sửa scene | Cao / Thấp | ANC-02 chặn lúc validate; "find usages" trước khi xóa element |
| R-5 | Bản quyền: chép lời giải sách/AoPS | Vừa / Cao | Solution tự viết hoặc verify từng step; checklist nguồn; ghi nguồn statement đầy đủ |
| R-6 | Tree navigator rối với case sâu > 4 mức | Vừa / Vừa | Prototype giấy trước khi code (OPQ-2); giới hạn mềm độ sâu trong Style Guide |
| R-7 | **Solo bus-factor & burnout**: toàn hệ treo trên một người | Vừa / Cao | Mọi thứ trong git + schema versioned + pipeline có tài liệu → kho vẫn sống và kế thừa được nếu dừng; nhịp phát hành bền vững thắng dồn dập; scope 3 phase đã cắt sẵn cho một người |
| R-8 | **Hallucinated proof từ draft máy**: sai một bước là chết uy tín với khán giả oly — cộng đồng này bắt lỗi trong ngày | Vừa / Rất cao | AUT-09 khóa publish khi còn step chưa verified; ưu tiên draft những bài chính chủ đã giải tay; validator + invariant eval bắt được lớp lỗi cơ học, phần lập luận là trách nhiệm người duyệt |

**Câu hỏi mở:**

- **OPQ-1** — Tên brand + domain. Ưu tiên cao hơn 0.9: giờ tên là tài sản, cần chốt trước khi phát hành bài đầu (đổi tên sau khi có corpus + clip là đốt nhận diện).
- **OPQ-2** — UX tree navigator cho lời giải phân nhánh sâu: minimap cây đứng hay breadcrumb + drawer? Prototype giấy tuần đầu P1.
- **OPQ-3** — License chính thức (đề xuất CC BY-SA 4.0), gộp luôn điều khoản cho video render từ kho.
- **OPQ-4** — *Đổi kết luận so với 0.9*: video không còn "hoãn vô thời hạn" — REN-04 sinh clip gần-tự-động nên chi phí nội dung không nhân đôi. Voice-over vẫn để P3/MAY (REN-05).
- **OPQ-5** — vi-only P1, giữ nguyên. Ghi chú mới: clip REN-04 dạng caption-only vượt rào ngôn ngữ tốt hơn text — nếu tính đường ra quốc tế thì đi bằng video trước, dịch text sau (schema đã sẵn đa ngôn ngữ).
- **OPQ-6** — Bound board 40×40 có đủ cho seed list không — rà khi chốt content plan; nới rẻ, thu hẹp đắt.
- **OPQ-7** — Kênh phân phối chính cho REN-04 (YouTube Shorts / TikTok / Facebook Reels) và format ưu tiên (9:16 trước hay 16:9 trước)? Quyết trước khi build preset — thứ tự preset ảnh hưởng thiết kế caption và safe area.
