# CombViz — Checklist làm mạnh từng engine

**Ngày:** 2026-07-30 · **Trạng thái:** backlog có bằng chứng, **không phải kế hoạch chạy ngay** · `GM-05/06/07/08/09`, `BD-07`, `SQ-01/02` và `GR-09` **đã làm ở M22–M28**

## 0. Đọc checklist này đúng cách

### 0.1 Nó không được chạy trước G-C

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

Đo trên 73 bài đã xuất bản (56 lúc dựng tài liệu này, cộng mười bảy bài của M22–M36):

| Engine | Số bài | Đọc con số này thế nào |
|---:|---:|---|
| `board` | 22 | Chủ lực. Khoảng trống ở đây là khoảng trống **thật sự cảm thấy được**. |
| `graph` | 19 | Chủ lực. Cùng loại. |
| `sequence` | 13 | Đủ để tin. |
| `game` | 6 | Tầng A ở §2.6 **đã làm hết** (M22–M23): ba luật mới kèm ba bài kinh điển, cộng phổ hai chiều. |
| `point` | 3 | Nội dung trước. Engine chưa bị dùng đủ để biết nó thiếu gì. |
| `set` | 3 | Nội dung trước. |
| `derivation` | 2 | Nội dung trước — và dòng 🟡 duy nhất của nó nói **thiếu bài**, không thiếu năng lực. |

Bốn engine cuối cộng lại có **14 bài**, và $6$ trong số đó là của `game`. Thêm năng lực cho một engine mới 2–3 bài là
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

### 2.1 `board` — 25 bài, engine chủ lực

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

### 2.2 `graph` — 21 bài, engine chủ lực

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

**Tầng B — cố ý không làm**

- **kiểm tính phẳng tổng quát** (LR / PQ-tree). Đã từ chối có lý do viết ra trong
  `VIZ-COVERAGE.md` §4: hai đường hiện có đúng là hai đường mà lời giải thi đấu
  dùng thật. Giữ nguyên quyết định.
- luồng cực đại / cắt nhỏ nhất — hiếm trong tổ hợp thi đấu.

### 2.3 `sequence` — 13 bài

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

### 2.4 `set` — 5 bài

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

### 2.6 `game` — 9 bài · **Tầng A đã làm xong ở M22–M25**

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

### 2.7 `derivation` — 2 bài · **nội dung trước**

Dòng 🟡 duy nhất liên quan (Vandermonde) nói **"thiếu bài trong kho"**, không nói
thiếu năng lực. Nên hạng mục đúng ở đây là **soạn bài**, không phải viết code.

**Tầng B**

- **DV-01** — gióng theo **nhiều** mốc (biến đổi ba cột). Chưa bài nào đòi.
- **DV-02** — morph một hạng tử thành hạng tử khác (`becomes` đã khai quan hệ; phần
  còn thiếu là chuyển động). Lớp `CHO-05` đã có từ **M37** và `move`/`morph` gọi
  được ngay; việc còn lại là dịch quan hệ `becomes` thành pha, chưa làm.

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

## 4. Việc **không** nằm trong tài liệu này

Ba thứ hay bị nhầm là "làm engine mạnh hơn":

- **Thêm engine mới.** Hàng đợi engine ở `VIZ-COVERAGE.md` §7 đã cạn, và `PRD-07`
  chặn việc mở thêm trước khi P0–P2 chứng minh giá trị học tập.
- **Nâng coverage bằng cách chọn bài dễ vẽ.** `VIZ-COVERAGE.md` §6 đã nói: ~12% đề
  có lập luận **không mang nội dung không gian**, và con số đó không co theo engine.
- **Sửa những chỗ engine cố ý không làm.** Ba chỗ có lý do viết ra — tính phẳng
  tổng quát, GM-01 rule script, PT-03 tô vùng — và lý do vẫn còn đúng.
