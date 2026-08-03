# CombViz — Checklist làm mạnh từng engine

**Ngày:** 2026-07-30 · **Soát lại:** 2026-08-02 · **Trạng thái:** hàng đợi **mở** kể từ khi G-C đóng (§0.1) — đã và đang được lấy việc, không còn là danh sách chờ · `GM-05/06/07/08/09`, `BD-07`, `SQ-01/02`, `GR-09` làm ở M22–M28; `GM-01..04` đóng ở M78; `GR-13/14/15` và `AL-20` ở lượt 2026-08-02

## 0. Đọc checklist này đúng cách

### 0.1 Nó không được chạy trước G-C

> **G-C đã đóng 2026-08-01** (schema freeze 1.0.0, theo chỉ định chính chủ; nay
> nay đã ở `1.5.0` sau năm minor, minor đầu tiên là của M74 — hồ sơ đóng
> và rủi ro còn lại ở `PLAN-P1.md` §10). Điều kiện chặn của mục này vì thế đã
> hết hiệu lực: danh sách dưới đây từ nay là hàng đợi **mở**, lấy theo thứ tự
> đề xuất §1 hoặc theo chỉ định. `PRD-07` vẫn nguyên: không thêm engine chỉ để
> tăng coverage, và mỗi hạng mục vẫn phải đi kèm nội dung.

`PRODUCT-REQUIREMENTS.md` §9 xếp P0 trước, và `R-13` nói thẳng: xây thêm năng lực
trong khi chưa có bài nào do chính chủ soạn là **R-1** (content bottleneck) ở dạng
mới. `PRD-07` cấm thêm engine chỉ để tăng coverage. Tài liệu này là **danh sách
chờ**, dựng sẵn để khi mở ra thì không phải nghĩ lại — không phải lệnh xuất phát.

> **Ngoại lệ đã dùng, ngày 2026-07-30 (M22–M28).** Chín hạng mục đã làm:
> `GM-05/06/07` (#1–#3), `GM-08` (#13), `BD-07` (#7), `GM-09` (mới), `SQ-01` (#4),
> `GR-09` (#5) và `SQ-02` (nửa của #6). Điều kiện chung để chúng
> **không** vi phạm `R-13` là điều kiện §2.6 vốn đã viết ra: không thêm engine nào
> (`PRD-07` không đụng tới), chỉ mở rộng thứ đã có, và **mỗi hạng mục đi kèm nội
> dung** — bốn bài mới, kho 56 → 60 — nên năng lực và nội dung tăng cùng nhịp.
>
> Ba hạng mục đầu do chính §2.6 xếp là "rẻ, có bài kinh điển chờ sẵn". `GM-08` và
> `BD-07` thì **chính chủ chỉ định**, và ghi ra ở đây để không ai đọc nhầm thành
> tài liệu tự cho phép mình: thứ tự trong bảng §1 là **đề xuất**, còn quyết định
> làm cái nào là của người sở hữu dự án.
>
> Ngoại lệ này **không** tự mở rộng ra các hạng mục còn lại: chúng hoặc đụng engine
> chưa đủ bài để biết nó thiếu gì, hoặc là năng lực không có bài đi kèm. Chúng vẫn
> chờ G-C, hoặc chờ một chỉ định tương tự.

### 0.2 Mỗi hạng mục phải có bằng chứng, không có ý tưởng suông

Cột **Bằng chứng** trỏ tới một dòng 🟡/❌ cụ thể trong `VIZ-COVERAGE.md` §2, hoặc
một ID có sẵn trong SRS. Hạng mục nào không trỏ được vào đâu thì xuống **Tầng B**
và ở đó cho tới khi có một bài thật đòi nó. Luật này tồn tại vì kho đã hai lần hạ
số coverage sau khi đo lại (M11, M17b) — thêm năng lực theo cảm giác là cách nhanh
nhất để lặp lại chuyện đó.

### 0.3 Với bốn engine mỏng bài, **nội dung đi trước năng lực**

Đo lại **2026-08-02** trên **141 bài** đã xuất bản, đếm bằng `engines_used` (một bài
dùng hai engine thì đếm ở cả hai, nên tổng cột lớn hơn 141). Cột "M36" giữ số đo cũ
để thấy engine nào thật sự được nội dung kéo lên:

| Engine | Số bài | M36 | Đọc con số này thế nào |
|---:|---:|---:|---|
| `board` | **40** | 22 | Chủ lực. Khoảng trống ở đây là khoảng trống **thật sự cảm thấy được**. |
| `algebra` | **36** | — | Mở ở M47, và đã lên ngang chủ lực trong một tháng. §2.8. |
| `graph` | **36** | 19 | Chủ lực. Cùng loại. Ba hạng mục GR-13/14/15 của lượt 2026-08-02 sinh ra từ đây. |
| `sequence` | **19** | 13 | Đủ để tin. |
| `game` | **10** | 6 | Tầng A ở §2.6 đã làm hết ở M22–M23; **M78 đóng nốt GM-01..04** — ván chơi thật, solver, ngữ pháp `moves`. |
| `set` | **6** | 3 | Vẫn mỏng, nhưng đã gấp đôi. Nội dung trước. |
| `point` | **3** | 3 | Nội dung trước — và là engine **duy nhất không nhích một bài nào** kể từ M36. |
| `derivation` | **3** | 2 | Nội dung trước. Xem §2.8: nó **không kiểm được đại số**, và chỗ đó không phải thiếu bài. |
| `longdiv` | **1** | 1 | Mới ở M46. Chưa bị dùng đủ để biết nó thiếu gì. |

Bốn engine mỏng nhất (`set`, `point`, `derivation`, `longdiv`) cộng lại có **13 bài**
trên 141. Luật §0.3 giữ nguyên và nay có thêm bằng chứng: `game` đi từ 6 lên 10 bài
**rồi** M78 mới mở GM-01..04, còn `point` đứng yên ở 3 bài và cũng đứng yên ở năng
lực — thêm năng lực cho một engine mới 3 bài vẫn là đoán, không phải đáp ứng.

### 0.4 Họ ID

Hạng mục nào đã có ID trong SRS thì **dùng lại**, không đặt tên mới (PRD-01). Hai
họ mới cho hai engine dựng ngoài roadmap SRS nên chưa có họ nào:

| Họ | Engine |
|---|---|
| `SQ-*` | sequence / multiset |
| `DV-*` | derivation |
| `LD-*` | longdiv (chia dọc) |
| `AL-*` | algebra (biến đổi biểu thức) — **đã mở từ M47**, chạy tới `AL-20`; xem `docs/ENGINE-ALGEBRA.md` |

---

## 1. Bảng ưu tiên — đọc trước, chi tiết ở §2

Sắp theo **bằng chứng × trọng số họ bài × độ rẻ**, không theo engine.

| # | Hạng mục | Engine | Mở khoá | Rẻ? | Bằng chứng |
|---:|---|---|---|---|---|
| ~~1~~ | ~~`GM-05` nước đi đụng **nhiều** đống~~ ✅ M22 | game | Wythoff | rất rẻ | ~~❌ "một nước chỉ đụng **một** đống"~~ |
| ~~2~~ | ~~`GM-06` luật đọc đống khác~~ ✅ M22 | game | trò Euclid | rất rẻ | ~~❌ "nước ăn theo đống kia"~~ |
| ~~3~~ | ~~`GM-07` hợp hai luật~~ ✅ M22 | game | Nim Lasker | rất rẻ | ~~§4 "`rule` là **một** thành viên"~~ |
| ~~4~~ | ~~`SQ-01` analyzer dãy con đơn điệu~~ ✅ M26 | sequence | Erdős–Szekeres | rẻ | ~~🟡 "thiếu analyzer dãy con đơn điệu"~~ |
| ~~5~~ | ~~`GR-09` analyzer mã Prüfer~~ ✅ M27 | graph | Cayley $n^{n-2}$ | rẻ | ~~🟡 "thiếu analyzer sinh mã Prüfer"~~ |
| 6a | ~~`SQ-02` lan truyền trên dãy~~ ✅ M28 | sequence | chip-firing, Ducci | vừa | ~~🟡 "thiếu luật lan truyền"~~ |
| ~~6b~~ | ~~`BD-08` lan truyền trên bàn cờ~~ ✅ M29 | board | lights-out | vừa | ~~❌ dòng lights-out ở VIZ-COVERAGE §2~~ |
| ~~7~~ | ~~`BD-07` lưới tam giác / lục giác~~ ✅ M24 | board | phủ hình phi vuông | vừa | ~~§2 — engine **không vẽ được**~~ |
| ~~8~~ | ~~`GR-05` tô mặt sau embedding~~ ✅ M33 | graph | công thức Euler, tô mặt | vừa | ~~SRS `GR-05` [P2]~~ |
| ~~9~~ | ~~`GR-07` ma trận đồng bộ hai chiều~~ ✅ M34 | graph | đếm hai chiều | vừa | ~~SRS `GR-07` [P2]~~ |
| ~~10~~ | ~~`PRN-04` animation biến hình~~ ✅ M37 | cross | cả họ song ánh (14%) | đắt | ~~§2 "còn thiếu: animation biến hình của PRN-04"~~ |
| ~~11~~ | ~~`BD-05` vùng khuyết vẽ tay + torus~~ ✅ M31 | board | bài trên hình xuyến | vừa | ~~SRS `BD-05` [P2]~~ |
| ~~12~~ | ~~`ST-03` dot/bar cho đa tập~~ ✅ M35 | set | đếm theo lớp | rẻ | ~~SRS `ST-03` [P2]~~ |
| ~~13~~ | ~~`GM-08` phổ **hai chiều**~~ ✅ M23 | game | quy luật Wythoff nhìn thành hai tia | vừa | ~~§2.6 — `spectrum` là bảng một chiều~~ |

~~`PRN-04` là hạng mục **trọng số cao nhất** trong bảng~~ — xong ở **M37**, cùng
lúc với lớp choreography mà nó phụ thuộc (`CHO-05`). **Bảng đã cạn.**

Một ghi chú đáng giữ về cách nó *không* được làm. Đường ngắn nhất tưởng là: đổi
key của pane phải thành key ảnh ngược rồi ném vào `interpolateNodes`. Nó chạy
được ở bài mà hai pane cùng engine và **hỏng lặng lẽ** ở bài mà hai pane khác
engine — dạng phổ biến nhất của chứng minh song ánh — vì phép nội suy ấy khớp
theo *dáng cây*, mà mỗi engine dựng một dáng khác nhau. Thứ duy nhất bảy engine
dùng chung là **toạ độ scene** (G-10), nên phép biến hình xuyên engine phải nói
bằng toạ độ.

---

## 2. Chi tiết theo engine

### 2.1 `board` — 40 bài, engine chủ lực

> Mô tả chức năng đầy đủ của engine này: **`docs/ENGINE-BOARD.md`**. Mục dưới đây
> chỉ ghi *hàng đợi* — cái gì đã làm, cái gì còn nợ.

**Tầng A**

- **BD-07 ✅ (M24)** — **lưới tam giác và lục giác**, `config.lattice`. Ô vẫn định
  danh bằng `(hàng, cột)` ở cả ba lưới nên `holes`, `cell_overrides`, anchor,
  region, validator và DSL không phải biết gì; chỗ duy nhất biết là `lattice.ts`.
  Kèm hai bài: `triangle-lozenge-parity` (lưới tam giác) và `hex-board-three-colours` (lưới lục giác). Ba tính năng **chỉ có nghĩa trên lưới vuông**
  — polyomino, bảng PRN-03, luật đi quân cờ — bị chặn ở cả `checkBounds` lẫn lệnh.
- **BD-10 ✅ (M42)** — **gạch ô**: `cell_overrides[].strike`, một `color_class` cho
  nét. Gạch khác tô ở đúng chỗ làm nên một cái sàng — ô bị gạch **vẫn đọc được** —
  và màu nét gánh nghĩa "ai đã loại ô này". Nét có key riêng `strike-<r>-<c>` để
  một pha `show` hiện được nét mà không hiện lại cả ô. Kèm `sieve-primes-100` viết
  lại: bốn số nguyên tố sàng mang bốn màu, nét gạch mang màu của ước nguyên tố nhỏ
  nhất.
- **BD-11 ✅ (M74)** — **đường đi hạng nhất**: element `path` với `cells` là dãy ô,
  vẽ nối tâm, kèm `arrow`/`dashed`/`label`. Mỗi bước có id riêng
  `<pathId>-step-<i>`, nên anchor và choreography trỏ được vào *nước đi thứ ba* —
  đúng khả năng mà cách hack cũ (một `piece` glyph mũi tên mỗi ô) có và một
  `polyline` liền mạch thì không. `lattice-path-binary-word` viết lại bằng nó, song
  ánh nay ghép `route-step-i` với `w_i`. Kèm **bump schema `1.0.0` → `1.1.0`**:
  minor đầu tiên sau freeze, migration đồng nhất, và lần đầu cửa sổ đọc trượt
  (`0.3.0` ra khỏi cửa sổ vĩnh viễn).
- **BD-09 ✅ (M30)** — **quân ghép trên lưới phi vuông**: `LATTICE_SHAPES` +
  `latticeTileCells` ở `lattice.ts`, hình `lozenge`, trường `dir` trên `tile`.
  `triangle-lozenge-parity` nay là `challenge`.

  *Đính chính (M36):* M30 viết bài ấy "kéo thả được". Sai — **không có kéo thả
  nào** trong sandbox, và `board/move-element` chưa từng có đường tới kể từ M4.
  Thứ làm được lúc đó là đóng dấu quân mới rồi xoá. M36 nối lệnh ấy bằng thao tác
  **hai chạm**.

  Chỗ khác với dự đoán: **không** dựng được song song với `TILE_SHAPES` bằng cùng
  mô hình. Mô hình polyomino là "tập offset, tịnh tiến tới `pos`, xoay $90°$", và
  cả ba mệnh đề đều hỏng ngoài lưới vuông — tịnh tiến không bảo toàn hình (ô cột
  chẵn hướng lên, cột lẻ hướng xuống), còn $90°$ không phải phép đối xứng của lưới
  tam giác hay lục giác. Hình vì thế khai bằng **đường đi trên đồ thị kề**, và tư
  thế mang trong `dir` (nấc hướng) chứ không trong `rot` (độ). Hai trường loại trừ
  nhau, `checkBounds` chặn cả hai chiều lẫn lộn.
- **BD-08 ✅ (M29)** — **lan truyền trên bàn cờ**: lệnh `board/toggle-cross`, tập
  luật đóng `SPREAD_RULES` (`cross`, `neighbours`) cùng khuôn với `GameRule` và
  `COMBINE_RULES`. Đúng như dự đoán, `neighbours()` của `lattice.ts` khiến nó chạy
  trên **cả ba lưới** mà không viết ba lần: chữ thập bốn ô trên bàn vuông, sáu ô
  trên bàn ong, ba ô trên lưới tam giác — nút công cụ vì thế bày ở mọi lưới, khác
  hẳn polyomino và `flip-line`. Kèm validator `all-cells:<k>` và bài
  `lights-out-3x3`. Cặp lớp mặc định về **một** chỗ (`FLIP_CLASSES`) vì lệnh lật
  hàng, lệnh lật chùm và validator phải đồng ý với nhau — lệch một chỗ thì người
  học bấm đúng lời giải mà bảng vẫn báo sai.
- **BD-05 ✅ (M31)** — hai lệnh `board/toggle-holes` và `board/draw-region` (config
  đã có từ P1; thiếu là cái **tay** để vẽ), cộng `config.wrap` với hai kiểu dán
  `cylinder` và `torus`.

  Dán mép đổi đúng một thứ — **quan hệ kề** — và vì thế nó đổi cả họ bài mà không
  đổi cách vẽ ô: `wrapCell` là chỗ duy nhất biết mép có dán, còn `adjacent()`,
  `proper-colouring`, `toggle-cross` và `tiles-in-bounds` đọc lại từ đó. Chỉ có
  nghĩa trên lưới vuông, và không đi cùng `show_attacks` — quân cờ trên hình xuyến
  là **bộ luật khác**, không phải bộ luật cũ với toạ độ vòng.

  Kèm ký hiệu **đồng nhất cạnh** ở renderer: không có nó, bàn dán mép vẽ ra giống
  hệt bàn thường và người đọc không có cách nào biết cột cuối kề cột đầu.

  Bài `lights-out-torus`, và nó là chỗ BD-05 gặp BD-08: trên hình xuyến mọi ô có
  cùng bậc, nên "bấm hết" chạm mỗi ô đúng $5$ lần và tắt sạch đèn — một lời giải
  **một câu**, đúng *chỉ vì* hình xuyến không có góc.

**Tầng B — chưa có bài nào đòi**

- bàn 3D / nhiều lớp; bảng số có công thức trong ô; lưới vô hạn có cửa sổ trượt.

### 2.2 `graph` — 36 bài, engine chủ lực

**Tầng A**

- **GR-09 ✅ (M27)** — **analyzer mã Prüfer**, cộng view `show_prufer` vẽ mã thành
  hàng ô dưới cây (mỗi ô có id `prufer-<i>` nên neo được), binding `is_tree` /
  `prufer_code` / `leaves` và per-vertex `in_code`, cùng validator `tree`. Kèm bài
  `cayley-prufer-bijection`. Test khứ hồi duyệt **mọi** dãy độ dài $n-2$ với
  $n \le 5$ — tức dựng ra công thức Cayley chứ không tra nó.
- **GR-10 ✅ (M32)** — **analyzer cây**: `treeShape` trả đường kính (đếm bằng
  **cạnh**), đường đi đạt nó, độ lệch tâm từng đỉnh, tâm, trọng tâm, lá và dãy bậc.
  Binding `diameter`/`radius`/`centres`/`centroids`/`centroid_piece`/
  `degree_sequence`, per-vertex `ecc`/`piece`/`is_centre`/`is_centroid`/`leaf`,
  validator `diameter:<k>`, view `show_diameter`. Không phải cây thì cả cụm **vắng
  mặt** — cùng luật với `prufer_code`.

  Điểm sư phạm là **tâm ≠ trọng tâm**: hai câu hỏi nghe giống nhau ("đâu là giữa
  cây") cho hai đáp án khác nhau, vì một bên cân bằng khoảng cách còn bên kia cân
  bằng số đỉnh. Bài `tree-centre-vs-centroid`.

  Test dựng **mọi** cây có nhãn tới $n = 7$ bằng cách giải mã Prüfer — dùng chính
  song ánh của M27 làm bộ sinh — rồi kiểm ba định lý trên từng cây: một hoặc hai
  tâm, một hoặc hai trọng tâm, và hai thì kề nhau.
- **GR-05 ✅ (M33)** — phần còn lại: **mặt, và tô mặt.** `planarFaces` lần biên
  từng mặt bằng **hệ quay** dựng từ chính toạ độ đỉnh — hình không giao điểm nào
  thì bản thân nó **đã là** một cách nhúng phẳng, nên không cần LR hay PQ-tree.
  Công thức Euler làm bài kiểm sẵn có: `planarity` đếm mặt bằng $e - v + 1 + c$,
  hai đường phải gặp nhau và hàm **từ chối** nếu không.

  Kèm `config.show_faces` + `face_colors`, lệnh `graph/paint-faces`, hit-test theo
  điểm-trong-đa-giác, binding `face_list`, và validator `face-colouring[:k]` — bài
  tô bản đồ, kể cả định lý bốn màu, thành thứ nghịch được. Bài `euler-formula-faces`.
- **GR-07 ✅ (M34)** — ma trận kề **đồng bộ hai chiều**. Chiều cạnh → ma trận đã có
  từ M12; chiều còn lại bắt đầu bằng một lỗi im lặng: chạm trong view ma trận vẫn
  đo khoảng cách tới toạ độ đỉnh của view kia, nên sandbox ở view ấy vô nghĩa. Nay
  ô mang id riêng `mx-<u>-<v>` (kể cả ô **trống** — nó là chỗ vẽ của một cặp đỉnh,
  và cặp ấy tồn tại dù chưa có cạnh), chạm đúng ô, neo được, và lệnh
  `graph/toggle-adjacency` cho phép **sửa đồ thị từ phía bảng**.

  Kèm một lỗi nội dung có sẵn từ M12: `adjacency-matrix-handshake` nói suốt về
  "bảng", "ô $(i,j)$", "tổng theo hàng" mà **mọi** bước đều vẽ hình đỉnh–cạnh. View
  ma trận ra đời ở M12 nhưng chưa bài nào dùng.

- **GR-13 ✅ (loạt bài 2/4)** — validator **`proper-colouring[:k]`**: "hai đỉnh kề
  thì khác màu". Trước nó `GRAPH_VALIDATOR_IDS` có `bipartite` (tức tô đúng $2$
  màu), `no-mono-triangle` (tô **cạnh**) và `face-colouring[:k]` (tô **mặt**) —
  không cái nào trả lời câu hỏi trung tâm của tô màu đồ thị, nên mọi bài tô đỉnh
  chỉ **minh hoạ được** chứ không **nghịch được** (SBX-02).

  Khuôn lấy nguyên từ `face-colouring[:k]`, khác đúng một chỗ: quan hệ kề đọc từ
  `graph.adjacency` thay vì `faceAdjacency`. Ba tầng trả lời theo thứ tự **đụng
  màu → chưa tô → quá $k$ màu**, và thứ tự ấy là quyết định chứ không phải tình
  cờ: người học đang tô dở phải nghe "chưa xong", không phải "sai".

  Hai quy ước: đỉnh **chưa tô** (`color_class` vắng) là *chưa xét*, không phải
  "màu số 0" — cùng quy ước `no-mono-triangle` đã đặt cho cạnh. Khuyên ($u = v$)
  **không** tính là xung đột: một đỉnh không thể khác màu chính nó, và báo đỏ ở đó
  là báo một điều vô nghĩa.

  Bài: `cycle-chromatic-parity`, `greedy-colouring-degree-bound`,
  `wheel-chromatic-number`.

**Tầng B — cố ý không làm**

- **kiểm tính phẳng tổng quát** (LR / PQ-tree). Đã từ chối có lý do viết ra trong
  `VIZ-COVERAGE.md` §4: hai đường hiện có đúng là hai đường mà lời giải thi đấu
  dùng thật. Giữ nguyên quyết định.
- **analyzer số sắc** ($\chi(G)$). Tính số sắc là NP-khó, nhưng lý do từ chối
  không phải giá: nó **thừa**. Bài "hình này cần $4$ màu" dạy được bằng đúng thủ
  pháp `no-mono-triangle` đã dùng cho Ramsey — bài khai **cả hai** mục tiêu
  `proper-colouring:4` (đạt được) và `proper-colouring:3` (không), rồi để người
  học tự đâm vào bức tường. *Validator đỏ mãi **là** bài học.* Một con số do máy
  đọc ra thì người học phải tin; một bức tường thì người học chạm được.
- luồng cực đại / cắt nhỏ nhất — hiếm trong tổ hợp thi đấu.

**Nợ có tên**

- ~~**validator tô màu *cạnh***~~ ✅ **trả xong (GR-15): `proper-edge-colouring[:k]`.**

  Nợ này ghi ở loạt 2/4 với giả định bài Ramsey nhiều màu sẽ cần nó. Sai, và loạt 4/4
  chỉ ra chỗ sai: `no-mono-triangle` vốn **không phân biệt màu** — nó so
  `ab.color === bc.color === ca.color` với bất kỳ màu nào — nên $R(3,3,3)$ ba màu chạy
  được ngay, không thêm một dòng. Phần thật sự còn thiếu chỉ là tô cạnh **đúng luật**,
  và biết được điều đó là nhờ đi làm chứ không nhờ suy đoán thêm.

  Song sinh với `proper-colouring`, và **cố ý** giống hệt: cùng ba tầng trả lời (đụng
  màu → chưa tô → quá $k$ màu), cùng quy ước "chưa tô là *chưa xét*, không phải màu số
  $0$". Hai validator đọc như một cặp thì tác giả học một lần dùng được cả hai.

  Khác đúng một chỗ, và chỗ ấy là bản chất: quan hệ "kề" của **cạnh** là *chung một đầu
  mút*, không phải `graph.adjacency`. Nên khuyên ($u = v$) ở đây **không** được bỏ qua
  như bên tô đỉnh — một cạnh chung đầu mút với chính nó là câu vô nghĩa, nên luật từ
  chối thẳng thay vì giả vờ chấm được.

  Bài trả tiền: `timetable-edge-colouring`. Xếp thời khoá biểu **là** tô màu cạnh —
  tiết học là cạnh, ca học là màu, "không dạy hai chỗ cùng lúc" đúng là "hai cạnh chung
  đỉnh khác màu". Đáp số bằng $\Delta$, nhưng **chỉ vì** đồ thị hai phía: bỏ điều kiện
  ấy thì tam giác cần $3$ ca dù mọi đỉnh chỉ bậc $2$, và bước ấy khai
  `expects_violation` để bức tường **là** bài học.
- ~~**đỉnh đồ thị không mang được số**~~ ✅ **trả xong (GR-14).** Nợ này ghi ở loạt
  4/4 khi IMO 1986 bài 3 bị cắt: cạnh có `weight`, đỉnh chỉ có `label` là chuỗi, nên
  đại lượng đơn điệu $\sum (x_i - x_{i+2})^2$ không khai thành `invariants[]` được và
  lint AUT-10 chặn đúng.

  Trả bằng **ba mảnh nhỏ**, không phải một mảnh to:

  1. `vertex.value` — số trên đỉnh, đối xứng với `weight` của cạnh. Tách khỏi `label`
     chứ không gộp: `label` hỏi *"vẽ chữ gì"*, `value` hỏi *"mang giá trị bao nhiêu"*,
     và ép chúng là một sẽ chặn ngay bài đầu tiên muốn ghi $x_1$ trên đỉnh mang giá
     trị $2$. Schema `1.4.0 → 1.5.0`, migration đồng nhất, kho re-stamp.
  2. `edge.gap` — hiệu số hai đầu mút, **suy ra** chứ không gõ tay. Một hiệu số gõ tay
     lệch ngay lần đầu bài đổi một con số, và lệch im lặng.
  3. `filter(list, pred)` trong DSL — mảnh còn thiếu giữa `count` và `sum`. `count` có
     vị ngữ, `sum` thì cộng **mọi** phần tử, nên không cách nào cộng $f$ chỉ trên phần
     thoả điều kiện. Trả về **danh sách** chứ không nhét thêm tham số vào `sum`: thế
     thì nó ghép được với mọi hàm tổng hợp đã có, kể cả hàm chưa viết.

  Cả ba đều **vắng mặt** thay vì trả $0$ khi không có dữ liệu — một đỉnh mang số $0$ là
  chuyện có thật, và trộn nó với "đỉnh không mang số" làm mọi tổng đọc sai im lặng.

  Kèm một lời của chính bài: hình nay vẽ **cả năm đường chéo** bằng nét đứt, vì chúng
  là các cặp mà $S$ đo — và đó là thứ khó thấy nhất của bài, nên nó thuộc về hình chứ
  không thuộc về lời văn. Bài `imo-1986-p3-pentagon-operation`.
- ~~**`five-colour-planar-sketch` bị cắt**~~ ✅ **soạn xong, và chướng ngại là ảo.**
  Ghi chú nợ khi ấy nói `planarity(...).value?.planar` trả `undefined` và gọi đó là
  *một lỗi analyzer cần soát*. Soát ra thì `PlanarityResult` khai **`verdict`** với ba
  giá trị (`planar` / `not-planar` / `unknown`) và **chưa từng có** trường `planar`;
  không dòng nào trong kho đọc `.planar` cả.

  Lỗi nằm ở tay người dò, và nó sống trong sổ nợ như một lỗi của mã — đúng dạng "một
  khẳng định mà mã không đỡ", lần này ở trong **chính sổ ghi nợ**. Thứ làm nó im lặng
  là `?.`: đọc một trường không tồn tại qua optional chaining cho ra `undefined` y hệt
  khi analyzer từ chối, nên hai chuyện rất khác nhau trông giống hệt.

  Nay có răng khoá tên trường lại (`planarity.test.ts`), và bài đã soạn: bổ đề "hình
  phẳng luôn có đỉnh bậc $\le 5$", chứng minh bằng đếm bậc hai chiều cộng $e \le 3v-6$,
  **không nhìn hình cụ thể nào**. Mọi hình trong bài đều hỏi engine trước khi ship —
  `verdict === 'planar'`, `crossings === 0`.

  Kèm một bài học về hình: bát diện ở bước cuối lúc đầu vẽ với bán kính trong $13$ trên
  ngoài $30$. Tam giác đều bán kính $R$ có bán kính nội tiếp $R/2$, mà tam giác trong
  xoay $60°$ chĩa đỉnh **thẳng vào** cạnh ngoài — nên khoảng hở chỉ $2$ đơn vị. Engine
  xác nhận $0$ giao điểm, tức hình **đúng**, mà mắt đọc ra một búi rối. $r = 9$ cho hở
  $6$, và đó là khác biệt giữa "đúng" và "nhìn được".

### 2.3 `sequence` — 19 bài

**Tầng A**

- **SQ-01 ✅ (M26)** — **analyzer dãy con đơn điệu dài nhất**. Cặp $(inc, dec)$ trên
  từng phần tử (`show_monotone`), hai binding DSL, và validator `no-monotone:<k>`
  — một mục tiêu sandbox **bất khả thi có chủ đích** khi $n > k^2$. Kèm bài
  `erdos-szekeres-monotone`.
- **SQ-02 ✅ (M28)** — **luật lan truyền cho quá trình lặp**. Hai lệnh, hai bản
  chất: `sequence/step` đụng **cả dãy** theo một enum đóng `STEP_RULES` (Ducci và
  hai họ hàng), còn `sequence/fire` đụng **một ô** do người học chọn (chip-firing).
  Cộng validator `all-zero` / `stable` và binding `unstable` / `zeros`. Kèm hai bài:
  `ducci-four-numbers` và `chip-firing-abelian`.

**Tầng B**

- dãy hai chiều; dãy vô hạn có chu kỳ; đa tập có phần tử trùng lặp lớn.

### 2.4 `set` — 6 bài

- **ST-03 ✅ (M35)** — **view `dots`**: mỗi tập một cột chấm, mỗi chấm một phần
  tử. Một phần tử thuộc $d$ tập cho $d$ chấm, nên tổng chấm **là** `incidences`
  $= \sum_S |S|$ — nhìn thấy một phần tử được đếm nhiều lần chính là toàn bộ nội
  dung của phép đếm hai chiều. Chấm mang `data-el` của phần tử nên rê vào một
  phần tử thì mọi bản sao cùng sáng.
- **ST-02 ✅ (M35)** — **bảng bao hàm–loại trừ** (`show_inclusion_exclusion`).
  Trước đó ST-02 mới xong một nửa: DSL có `common(A,B)` nhưng panel thì không.
  Bảng in từng hạng tử kèm dấu, rồi tổng, rồi $|hợp|$ **đếm trực tiếp** — hai con
  số cuối đi qua hai đường tính khác nhau, nên bảng là một phép **đối chiếu** chứ
  không phải một lời khẳng định.
- **Cực trị hệ tập hợp ✅ (M35)** — validator `intersecting`, `sunflower`,
  `min-common:<k>`; binding `union_size`, `min_common`, `max_size`, `min_size`.
  Bài `erdos-ko-rado-pairs` ($n=4$, $k=2$), cộng một bước bao hàm–loại trừ cho
  `venn-three-clubs`.

**Tầng B — đọc lại sau khi có thêm bài**

Backlog cũ nói "không đề xuất gì, soạn bài trước rồi đọc lại". Đã soạn, và đây là
thứ hai bài mới **thật sự** đòi mà engine chưa có:

- **phần bù** như một khái niệm hiển ngôn. Lập luận "gia đình giao nhau trên $[n]$
  có nhiều nhất $2^{n-1}$ tập" ghép mỗi tập với phần bù của nó và lấy nhiều nhất
  một trong hai — engine hôm nay không nói được "tập này là phần bù của tập kia".
- **tập nền ngầm định**. Trần `maxSets = 8` là đủ cho mọi bài đang có, nhưng họ
  bài "mọi tập con của $[n]$" cần $2^n$ tập; $n = 4$ đã vượt trần. Đó là giới hạn
  thật, không phải bỏ sót — và nó cần một cách biểu diễn khác, không phải nới số.

### 2.5 `point` — 3 bài · **nội dung trước**

- **PT-04 [P3] MAY** — đường tròn (điểm trên đường tròn, dây cung). Có tên trong
  cột "còn thiếu" của §2.
- **PT-03 [P3] MAY** — tô vùng do các đoạn chia. **SRS tự nói hoãn**: "đắt và hiếm
  bài cần; chỉ làm khi seed content P3 đòi hỏi." Giữ nguyên chữ ấy.

### 2.6 `game` — 10 bài · **Tầng A đã làm xong ở M22–M25**

Ba hạng mục dưới đây đều là **mở rộng họ luật đóng**, và tiền lệ đã có: M17b thêm
`subtract-fraction` trong một buổi và nó biến "bốc tối đa nửa đống" từ ❌ thành ✅.
Cả ba đã làm, mỗi cái kèm bài kinh điển của nó.

- **GM-05 ✅** — `Move` đụng **nhiều** đống cùng lúc ⇒ **Wythoff**
  (`wythoff-two-piles`). Đúng như dự đoán: đổi kiểu `Move` từ "một đống biến thành
  mấy đống" sang "mấy đống biến thành mấy đống" là chỗ tốn công thật, solver thì
  gần như không phải sửa.
- **GM-06 ✅** — luật đọc **cỡ đống khác** khi sinh nước ⇒ **trò Euclid**
  (`euclid-game-two-piles`). Không cần lệnh mới: một khi `allMoves` đọc cả thế thì
  nút "Bốc $k$" của thanh công cụ tự đúng theo đống bên kia.
- **GM-07 ✅** — `rule` nhận **hợp** tới ba thành viên ⇒ **Nim Lasker**
  (`lasker-nim-take-or-split`), cộng một thành viên `split-any` cho nhánh chia đều.

**Một hệ quả không có trong dự toán, và nó lớn hơn cả ba luật.** Wythoff và trò
Euclid làm ván **không còn là tổng các trò con độc lập**, nên Sprague–Grundy không
áp dụng: `grundy` và `xor` ở đó là những con số trông rất thuyết phục và vô nghĩa.
Solver phân biệt bằng `isLocalRule`, và với luật toàn cục nó **gỡ hẳn** hai binding
ấy khỏi DSL để mọi biểu thức chạm vào chúng lỗi ngay lúc validate. Bài học lặp lại
lần thứ tư trong kho này: chỗ nguy hiểm không phải chỗ không tính được, mà là chỗ
tính ra một con số không ai kiểm.

**Còn nợ, và đã có tên**

- **GM-08 ✅ (M23)** — phổ **hai chiều**, `view: 'spectrum-2d'`. Wythoff ra **hai
  tia** toả từ gốc, trò Euclid ra một **nêm** kẹp đường chéo; cả hai bài đã thay
  step "công thức" bằng step "nhìn". Mỗi ô là một element ngầm định `pos-<a>-<b>`
  nên anchor trỏ được vào **một thế**, và thế hiện tại của scene được khoanh trên
  lưới. Trần $24$ không phải trần tính (DP $O(N^2)$ chạy trong chớp mắt) mà là
  **trần đọc được**: theo G-10 một ô là $44$px.
- **GM-09 ✅ (M25)** — luật đọc **nước vừa đi**, `subtract-at-most-multiple` ⇒
  **Nim Fibonacci**. Thành viên đầu tiên mà đa tập đống không đủ mô tả ván: trạng
  thái mang thêm `last_take`, lệnh `game/take` tự ghi lại nó, và phổ vẽ ra đúng dãy
  Fibonacci. Kèm bài `fibonacci-nim`.
- **GM-01 / DOM-04** — rule script tổng quát cho Chomp, cờ trên đồ thị, game bàn
  cờ, game partizan. Đây là DSL-03 thật sự và nó đi thẳng vào **R-2**. Đã hoãn có
  lý do viết ra; đừng mở bằng cửa sau.

**Hai năng lực có sẵn mà không bài nào dùng — lấp ở M36.** Rà bằng máy (cờ config
khai trong schema mà không xuất hiện trong bài nào) chỉ ra `misere` và `allowed`.
Cả hai đều **đã xong hết**: solver đi đường riêng cho misère, `subtract-set` có
test, phổ vẽ đúng cả hai. Thứ thiếu là bài. Nay có `misere-nim-last-loses` và
`subtraction-set-134`.

Đáng nói hơn: `VIZ-COVERAGE.md` đánh ✅ cho "bốc theo tập $\{1,3,4\}$" trong bảng
**"Kiểm chứng bằng bài cụ thể"**, trong khi cái ✅ ấy dựa vào một *test*, không phải
một *bài*. Bảng nói một đằng, kho có một nẻo.

### 2.7 `derivation` — 3 bài · **nội dung trước**

Dòng 🟡 duy nhất liên quan (Vandermonde) nói **"thiếu bài trong kho"**, không nói
thiếu năng lực. Nên hạng mục đúng ở đây là **soạn bài**, không phải viết code.

**Tầng B**

- **DV-01** — gióng theo **nhiều** mốc (biến đổi ba cột). Chưa bài nào đòi.
- **DV-02** — morph một hạng tử thành hạng tử khác (`becomes` đã khai quan hệ; phần
  còn thiếu là chuyển động). Lớp `CHO-05` đã có từ **M37** và `move`/`morph` gọi
  được ngay; việc còn lại là dịch quan hệ `becomes` thành pha, chưa làm.

### 2.8 `algebra` — 36 bài · **engine đã mở (M50+)**

Đặc tả: **`docs/ENGINE-ALGEBRA.md`**. Phần dưới đây là **lý lẽ dựng engine, giữ
nguyên làm hồ sơ** — nó viết ở thời engine chưa tồn tại, nên đọc nó như một bản ghi
quyết định chứ không phải mô tả hiện trạng. Tóm tắt lý do có nó, đo bằng máy trên bài
đang xuất bản lúc ấy:

```
geometric-sum-doubling · hạng tử t1b: "1 + 2 + 4 + 8" → "1 + 2 + 4 + 9"
lỗi: []   cảnh báo: []   hasErrors: false
```

`derivation` **xếp chỗ cho công thức chứ không hiểu công thức** — chính comment trong
`validators.ts` của nó khai thế. Không luật nào trong `check` đọc nội dung `tex`, nên
một đẳng thức sai qua sạch bộ kiểm. Đây không phải "thiếu bài"; đây là khoảng trống
năng lực, và nó không lấp được bằng cách thêm luật vào `derivation`.

Engine mới đặt cược y hệt `longdiv`: **tác giả khai biểu thức gốc + dãy luật, engine
tính ra mọi dòng còn lại**. Không gõ được vế sau thì không sai kiểu đó được.

**Chưa được duyệt để làm.** `PRD-07` chặn mở engine mới trước khi P0–P2 chứng minh
giá trị học tập; nợ lớn hơn là **G-C**. §19 của đặc tả liệt kê ba việc phải xong
trước.

---

## 3. Hai hạng mục xuyên engine, và cả hai thuộc PRD

- ~~**PRN-04 [P2] SHOULD** — **animation biến hình** cho view song ánh~~ ✅ **M37**.
  Nút "Biến hình" gộp hai pane thành một khung chung, mỗi phần tử trượt tới ảnh
  của nó rồi mới đổi vai. Kèm thanh kéo — đó là kênh duy nhất dùng được bằng bàn
  phím (NFR-A2) và là cách người tắt chuyển động vẫn xem được từng chặng (NFR-A4).
- **PRN-06 [P3] MAY** — dựng có tham số (quy nạp): slider $n$, sinh Scene theo $n$.
  **Trùng gần hết** `EXP-01..03` của PRD. Đừng làm hai lần: nếu lớp Experiment tới
  thì PRN-06 là một use case của nó, không phải một tính năng riêng.

---

## 3b. Soát chốt canh bằng bẻ răng hàng loạt (2026-08-02)

Câu hỏi: *"còn cổng nào đang xanh mà không canh gì?"* — đặt ra sau khi `AL-20` tình cờ
lộ ra rằng trần số học của phép quét bảo toàn giá trị có thể nới từ $10^{-15}$ lên
$10^{-3}$ mà không test nào đỏ.

Cách trả lời: `tools/mutation-sweep.py`. Sửa **một** chốt canh, chạy toàn bộ test, so số
test hỏng với mốc, khôi phục. Mutant **chết** nghĩa là chốt canh ấy đang canh thật;
mutant **sống sót** nghĩa là cổng vẫn xanh nhưng không gác gì.

**Lượt đầu: 19 mutant, 16 chết, 3 sống sót.**

| sống sót | hỏng thầm ở đâu | răng đã lắp |
|---|---|---|
| `SERIES_TERMS = 1` | Sân kiểm thứ tư hạ độ sâu từ $12$ xuống "so hệ số bậc $0$" — lớp duy nhất phân biệt một luật hàm sinh **đúng** với một luật chỉ trùng vài hệ số đầu | 4 test: lệch ở bậc ngay dưới trần phải bắt; lệch nông phải **nói rõ hệ số nào**; không báo động giả; và **trần là trần** — khoá luôn con số $12$ |
| `MAX_CANVAS_VH = 9999` | Hàng rào duy nhất trên trục dọc. Bỏ nó thì scene cao đẩy narrative ra khỏi màn hình — hình đúng, tỉ lệ đúng, golden khớp từng byte, chỉ **bố cục** hỏng | 2 test: trần phải tính theo **viewport** chứ không theo pixel; và phải chừa chỗ cho chữ |
| mã lỗi `bounds/algebra-unsound` | Cổng cuối trước khi **toán sai** lên trang. Ba anh em của nó đều có test khẳng định đúng mã; riêng nó thì không | tách `unsoundIssue()` thành hàm có tên + 4 test: mã, **mức** (`error` chứ không `warning`), hint trỏ đúng engine, và phần **nối** vào `checkBounds` |

**Chạy lại ở lượt soát tài liệu (2026-08-02): cả ba mutant nay đều chết** — 1, 2 và 1
test đỏ theo thứ tự bảng trên. Cột "răng đã lắp" là một *lời khai*; ba con số này là
*bằng chứng*, và khoảng cách giữa hai thứ ấy đúng bằng khoảng cách mà cả mục §3b này
sinh ra để đo. Không lượt lắp răng nào được coi là xong cho tới khi mutant chết.

Lượt chạy lại còn lôi ra **hai lỗi của chính công cụ soát**, cùng một hình dạng với
thứ nó đi tìm:

- **Phạm vi quét hẹp hơn `pnpm test`.** Nó chạy `vitest run packages tools/pipeline/test`,
  thiếu đúng bốn tệp của `apps/` ($40$ test: `player/test/bijection-morph`,
  `player/test/bijection`, `player/test/play-host`, `studio/test/edits`). Mutant nào chỉ
  bị tầng Player/Studio bắt thì báo cáo in ra "SỐNG SÓT" — dương tính giả, và nó lái
  người soát đi lắp răng vào chỗ đã có răng.
- **Bỏ qua trong im lặng.** Chuỗi tìm lệch khỏi mã thì công cụ in "BỎ QUA" rồi chạy
  tiếp; trong một báo cáo 19 dòng, dòng ấy trông y hệt một mutant không có trong danh
  sách. Và nó **đã** xảy ra: mục `bounds/algebra-unsound` giữ thụt lề cũ từ trước lúc
  `unsoundIssue()` được tách thành hàm, nên nó im lặng không chạy kể từ đó — tức chính
  cái mutant khó nhất trong ba cái đã không được kiểm lại lần nào.

Cả hai đã sửa: quét đúng lệnh của `pnpm test`, đếm số mục bỏ qua, in đậm ở tổng kết,
và **thoát với mã khác 0** khi có mục bỏ qua. "Chạy xong" phải khác "chạy đủ".

Hai điều đáng giữ lại từ lượt đầu.

**Một — cái sống sót thứ ba thoát vì một lý do có cấu trúc.** Nhánh ấy chỉ chạy khi *một
luật của engine sai*, mà mọi luật đều đúng: không đầu vào nào dựng ra `unsound` không
rỗng, nên không test nào đi qua đó được bằng đường thường. Phòng thủ cho ngày một luật
hỏng — và phòng thủ không ai kiểm là phòng thủ có thể đã mục từ lâu. Cách vá là **tách
hợp đồng thành hàm gọi được**, không phải cố dựng một đầu vào không tồn tại.

**Hai — 16 cái chết đều chết rất to.** `maxSteps = 1` làm đỏ $39$ test,
`VERTEX_RADIUS = 0.1` đỏ $148$, `SCHEMA_VERSION` lệch đỏ $14$. Vấn đề của kho **không**
phải chất lượng trung bình của chốt canh mà là **phân bố**: vài chỗ không ai canh, nằm
rải rác chứ không tụ một khu. Đọc mã không tìm ra chúng — chỉ quét mới tìm ra.

Giữ `tools/mutation-sweep.py` trong kho, kể cả ba mutant đã vá, để lượt sau còn kiểm
được rằng răng vẫn còn đó.

### 3b.1 Lượt sau: hai cổng đếm sandbox nói ngược nhau (2026-08-02)

Không tìm ra bằng bẻ răng mà bằng một câu hỏi rẻ hơn: **chạy hết mọi lệnh soát, không
chỉ lệnh trong `pnpm check`.** `combviz coverage` in `· 141/148 Sandbox dùng được` và
gọi tên bảy bài, trong khi `pnpm validate` xanh tuyệt đối, 0 cảnh báo. Cả bảy là bài
**chơi được** (`step.play`):

```
chomp-poison-corner        geography-path-parity     hackenbush-blue-red-halves
chomp-two-rows-staircase   geography-token-on-graph  hackenbush-one-stalk-half
nim-two-piles-mirror
```

Nguyên nhân: DoD §15.1 *"100% bài có sandbox + validator"* được cài **hai lần** —
`lint/no-sandbox` và tiêu chí của bảng điểm — và mệnh đề miễn bài chơi được thêm vào
lint ở M78 mà không thêm vào bảng điểm. Cả hai cổng đều đúng theo mã của mình; cái sai
là **có hai mã cho một câu hỏi**.

Chỗ đáng ghi nhất: chú thích của `lint.ts` khẳng định hai cổng đồng bộ, và khẳng định ấy
đứng ngay trong một đoạn cảnh báo về đúng lớp lỗi này — *"Hai luật cùng một kho mà nói
ngược nhau thì một trong hai sẽ bị bỏ qua."* Nó tự nó là ví dụ cho điều nó nói.

Vá: một vị từ `sandboxStatus` trong `@combviz/check`, cả hai cổng gọi. Và chốt canh phải
gọi **hai cổng thật** — bản đầu gọi `lintProblem` với `sandboxSatisfied`, mà sau lượt gộp
thì `lintProblem` *cũng* gọi `sandboxSatisfied`, nên phép so chỉ khẳng định một hàm đồng
ý với chính nó và không thể đỏ vì đúng cái lý do nó mang tên. Bản dùng được gọi
`measure()` của `coverage.ts`; bẻ răng bằng cách **tách lại** bản chép tay thứ hai (đúng
bản M78 đã lệch) thì nó đỏ.

Bài học chung với hai lỗi của công cụ soát ở trên: **một cổng chỉ đáng tin bằng lượt
chạy gần nhất của nó**, và cổng nào không nằm trong `pnpm check` thì phải có người chủ
động gọi. `combviz coverage` là cổng như thế — nay nó vào danh sách chốt canh chung của
mỗi đợt.

### 3b.2 Lượt sau nữa: một validator luôn xanh vì chưa ai gọi nó (2026-08-02)

Cùng một họ với 3b.1, và cũng không tìm ra bằng bẻ răng — bẻ răng **không thể** tìm ra
nó. Mutant chỉ chết khi có một chốt canh chạy qua chỗ bị sửa, và validator `reaches:`
(engine đại số, dựng ở AL-07) **chưa bài nào trong kho gọi**, nên mọi mutant trong thân
nó đều sống sót một cách vô hình: không có test nào để đỏ.

Nó lộ ra khi AL-23 soạn bài đầu tiên bật hộp cát đại số. Bản gốc trả lời *"đã tới đích
chưa"* bằng `sameValue`, và đo được:

```
sameValue(x = 3, x = 4).ok           → true
sameSolutionSet(x = 3, x = 4, …).ok  → true      (còn khai verified: true)
```

Tập nghiệm của một phương trình có **độ đo $0$**, nên hai phương trình khác hẳn nhau
vẫn cùng *sai* ở gần như mọi điểm bốc trúng; hai bên "đồng ý" ở mọi điểm và phép so
xanh mà không chứng minh gì. Chi tiết ở `ENGINE-ALGEBRA.md` §54.2.

Hai điều đáng mang đi:

- **Bẻ răng đo được chốt canh, không đo được *thiếu* chốt canh.** Câu hỏi bổ sung, rẻ
  như câu hỏi của 3b.1: *"năng lực nào đã dựng mà chưa nội dung nào đi qua?"* —
  `ALGEBRA-COVERAGE.md` §5 hỏi đúng câu ấy cho **luật**, và bảng §2 nay hỏi thêm cho
  **đường tương tác**. Cả hai đều là danh sách nợ, không phải danh sách khoe.
- **Bốc điểm không phân biệt được hai đẳng thức.** Lần thứ ba trong cùng một mạch
  (`claim` cho hệ ở M59, `impliesSolutionSet` cho AM–GM ở `ENGINE-ALGEBRA.md` §52.2,
  `reaches:` ở đây). Chỗ nào sắp dùng bốc điểm để phân biệt hai đẳng thức thì phải đổi
  sang so **cấu trúc** — và ba lần là đủ để coi đây là một luật, không phải ba tai nạn.

### 3b.3 Lượt thứ ba: câu hỏi của chính chủ rẻ hơn cả hai lượt trên (2026-08-02)

Không tìm ra bằng bẻ răng, cũng không bằng "chạy hết mọi lệnh soát", mà bằng **một câu
hỏi của chính chủ**: *"sao không bật tất sandbox lên?"* — và quyết định đo thay vì trả
lời bằng cảm giác.

Kết quả: `each-step-sound` đỏ **0 / 1599** thế mà người học tới được. Không phải tình cờ
mà cấu trúc — `applyRule` đã từ chối 3814/4128 nước, và `unsound` theo định nghĩa là lỗi
*engine*. Nó lại còn là **bản trùng**: `checkBounds` đã đẩy `unsoundIssue` với
`severity: 'error'` cho cả 45 bài đại số. Ba bài bật nó chỉ là một bản yếu hơn chạy ít
hơn. Chi tiết ở `ENGINE-ALGEBRA.md` §54c.

Và nó lôi theo hai cái nữa, cả hai thuộc lớp *"tên nói một đằng, mã làm một nẻo"*:
`no-vanishing-divisor` đỏ vì **mọi** điều kiện chứ không riêng mẫu số (nên bài
`monotone-peels-an-inequality` vi phạm một luật về mẫu số dù không có phân số nào), và
bảng §12 khai một validator `degree-drops` **chưa bao giờ tồn tại** trong engine này.

Ba lượt, ba câu hỏi khác nhau, và không câu nào là "chạy lại test":

| lượt | câu hỏi | tìm ra |
|---|---|---|
| §3b | *bẻ răng thì có đỏ không?* | 19 mutant, 3 sống sót |
| §3b.1 | *cổng nào không nằm trong `pnpm check`?* | hai cổng đếm nói ngược nhau |
| §3b.2 / §3b.3 | *năng lực nào chưa nội dung nào đi qua?* | hai chốt canh luôn xanh |

> **Bẻ răng đo được chốt canh; nó không đo được *thiếu* chốt canh, cũng không đo được
> chốt canh **sai tên**.** Cả hai thứ ấy chỉ lộ khi có người hỏi một câu ngoài bộ test.

**Cổng, dựng luôn trong cùng lượt:** `tools/pipeline/test/validator-bite.test.ts`. Quét
mọi cặp (bài × validator) rồi đòi mỗi validator có ít nhất một thế đỏ.

Ràng buộc thiết kế đến từ chính phép đo ở trên — con số phụ thuộc **bộ nhiễu loạn**, nên
cổng phải:

1. **Đại số hỏi bằng tập nước thật** (`movesAtElement` + `applyRule`), không nhiễu loạn.
   Đó là lý do kết luận về `each-step-sound` là một *phát hiện*, còn phần còn lại là một
   *nghi ngờ*.
2. **Từ vựng nhiễu loạn khai theo kiểu dữ liệu, không theo engine** — khai theo engine
   thì lại là chín bản chép tay cho một câu hỏi, đúng thứ §3b.1 vừa gỡ.
3. **Ngoại lệ phải khai ra, và khai thừa cũng đỏ** — cùng khuôn `expects_violation`.
   `KNOWN_QUIET` là **sổ nợ của bộ nhiễu loạn**, không phải danh sách chốt canh vô nghĩa,
   và vế "khai thừa cũng đỏ" là thứ giữ nó ngắn lại thay vì chỉ dài ra.

Lượt chạy đầu tiên trả về ba thứ, và **cả ba đều là chỗ tác giả sai chứ không phải cổng
sai**:

- `values-integer` chưa từng đỏ được vì bộ số chỉ biết cộng số nguyên. Thêm `+0.5`.
- `extraneous-root-by-squaring` bật `no-vanishing-divisor` mà **11 thế ở độ sâu 1 và 42 ở
  độ sâu 2** đều không đỏ — bài nói về phép *bình phương*, chốt canh nói về phép *chia*.
  Bài trả về `illustration`. Đây là lần đầu một cổng **đổi nội dung**.
- Và cổng bắt luôn **tác giả của chính nó**: `KNOWN_QUIET` viết tay bảy dòng theo phỏng
  đoán, vế "khai thừa cũng đỏ" gọi tên **bốn** dòng sai. Còn ba.

### 3b.4 Một chốt canh **không** dựng, và vì sao đó cũng là một kết quả (2026-08-02)

Kế hoạch đặt tên `no-lost-roots` cho chiều **thu hẹp** tập nghiệm — chia hai vế cho một
biểu thức chứa ẩn rồi mất một họ nghiệm. Đo trên `mul_both_sides` trước khi viết một dòng
nào, và ba ca cho ba kết quả khác nhau đúng như mong đợi:

| nước đi | điều kiện engine ghi | chiều |
|---|---|---|
| nhân $\frac{1}{\sin x}$ (**chia** cho $\sin x$) | có, dấu `'!=0'` | mất nghiệm |
| nhân $\sin x$ | có, dấu `'!=0'` | thêm nghiệm |
| nhân $\frac12$ | không | an toàn |

Hai chiều ngược nhau mà **cùng dấu**, nên `no-vanishing-divisor` đã phân biệt được cả ba.
Một validator mới sẽ đỏ ở đúng cùng tập thế — tức chỉ là tên thứ hai cho một dấu, và cổng
§3b.3 vừa dựng ra để bắt đúng loại ấy sẽ không bắt được nó (nó *có* cắn, chỉ là cắn trùng).

Nhưng lượt dò tìm ra thứ khác, và thứ ấy đáng hơn: điều kiện cho phép **chia** ghi ra là
`1/sin(x) ≠ 0` — **một câu luôn đúng**, vì nghịch đảo không bao giờ bằng $0$ (đo: $0$ điểm
trên $400$ chỗ xác định). Dòng đỏ người học đọc không có nội dung, còn chỗ nguy hiểm thật
thì không ai nhắc. `ENGINE-ALGEBRA.md` §54d.

> **Một hạng mục bị huỷ vì phép đo không phải một hạng mục thất bại.** Cái đáng ghi là
> lượt dò ấy vẫn trả về một lỗi thật — chỉ không phải lỗi mà kế hoạch đoán.

### 3b.5 Lần thứ tư của "chốt canh luôn xanh", và lần này mã kiểm **không** sai (2026-08-03)

Ba mục trên đều là *mã kiểm không kiểm gì*. AL-27 gặp cùng triệu chứng với một nguyên
nhân khác hẳn: đích của hộp cát tính đúng, mà **thế ban đầu** làm câu hỏi thành vô nghĩa —
`Player` fork bằng `step.scene`, tức scene đã chạy hết `config.steps`, nên hộp cát mở ở
**dòng cuối** và mọi đích viết bằng dòng cuối xanh trước khi người học bấm gì.

Rút ra, và đây là chỗ khác bốn mục trước: **một chốt canh còn phụ thuộc chỗ nó bắt đầu
đo.** Bẻ răng không thấy được điều đó — nhiễu loạn *mã* trong khi chỗ hỏng nằm ở *dữ liệu
vào*. Cái thấy được nó là lượt nhìn bằng mắt, và câu hỏi rẻ tiền quen thuộc đặt cho đúng
chỗ: *"chốt canh này đo từ đâu?"*

Cùng lượt, lượt nhìn bắt thêm hai lỗi trong chính commit vừa gõ xong — cửa vào fork nhầm
bước, rồi bản sửa ấy đẻ ra một nhãn nói sai bước. Cả hai là *"cửa vào dẫn tới đâu"*, không
phải *"dữ liệu có hợp lệ không"*, nên chúng nằm ngoài tầm mọi cổng dữ liệu đã có.
`ENGINE-ALGEBRA.md` §54e.

| lượt | câu hỏi | thứ tìm được |
|---|---|---|
| §3b.1 | *cổng nào không nằm trong `pnpm check`?* | hai cổng đếm nói ngược nhau |
| §3b.2 / §3b.3 | *năng lực nào chưa nội dung nào đi qua?* | hai chốt canh luôn xanh |
| §3b.5 | *chốt canh này đo **từ đâu**?* | một chốt canh xanh trước khi ai bấm |

### 3b.6 Lần thứ năm, và lần này chốt canh sai nằm trong **chú thích tôi vừa gõ** (2026-08-03)

AL-28 dựng nhánh giả thiết. Giả sử $a \ge b$ cho $a - b \ge 0$, tức $a-b$ **có thể bằng
$0$** — và nhân một bất đẳng thức *ngặt* với $0$ là sai. Luật ghi thêm điều kiện $a \ne b$
cho ca ngặt, và chú thích ngay cạnh nó khai: *"bỏ mệnh đề này đi thì bộ kiểm đỏ ngay — nó
bốc trúng điểm $a = b$."*

Bẻ thử: `unsound` **vẫn rỗng**. Biên $a = b$ có độ đo $0$ trên $\mathbb{R}$, nên bộ bốc
điểm thực không bao giờ rơi trúng nó. Lời khai ấy sai, và nó là *một khẳng định mà mã
không đỡ* — đúng lớp lỗi trội của kho, viết ra trong chính commit đi vá lớp lỗi ấy.

Hai thứ đáng giữ:

- **Chốt canh thật phải là cấu trúc, và phải ở `model`.** Nó dựng lại điều kiện cần từ
  `target.op` của chính nó, độc lập với thứ luật khai — bài học M78.3. Sau khi dời, bẻ
  mệnh đề kia làm `unsound` đỏ thật.
- **Câu hỏi rẻ mới cho lượt sau:** *"chốt canh này bốc điểm hay hỏi cây?"* Nếu chỗ hỏng
  nằm trên một tập có độ đo $0$ — một biên, một điểm, một trùng nhau — thì bốc điểm không
  bao giờ tới. §3b.5 hỏi *đo từ đâu*; mục này hỏi *đo bằng gì*.

| lượt | câu hỏi | thứ tìm được |
|---|---|---|
| §3b.1 | *cổng nào không nằm trong `pnpm check`?* | hai cổng đếm nói ngược nhau |
| §3b.2 / §3b.3 | *năng lực nào chưa nội dung nào đi qua?* | hai chốt canh luôn xanh |
| §3b.5 | *chốt canh này đo **từ đâu**?* | một chốt canh xanh trước khi ai bấm |
| §3b.6 | *chốt canh này đo **bằng gì**?* | một chỗ hỏng có độ đo 0, bốc điểm không tới |

## 4. Việc **không** nằm trong tài liệu này

Ba thứ hay bị nhầm là "làm engine mạnh hơn":

- **Thêm engine mới.** Hàng đợi engine ở `VIZ-COVERAGE.md` §7 đã cạn, và `PRD-07`
  chặn việc mở thêm trước khi P0–P2 chứng minh giá trị học tập.
  Hai ngoại lệ, ghi ra để không ai tưởng luật này đã bị bỏ: `longdiv` **đã mở** ở
  M46 theo yêu cầu trực tiếp của chính chủ, và `algebra` ở §2.8 mới chỉ có **đặc
  tả**, chưa có dòng code nào. Luật vẫn đứng — cả hai đều không đi qua hàng đợi này.
- **Nâng coverage bằng cách chọn bài dễ vẽ.** `VIZ-COVERAGE.md` §6 đã nói: ~12% đề
  có lập luận **không mang nội dung không gian**, và con số đó không co theo engine.
- **Sửa những chỗ engine cố ý không làm.** Ba chỗ có lý do viết ra — tính phẳng
  tổng quát, GM-01 rule script, PT-03 tô vùng — và lý do vẫn còn đúng.
