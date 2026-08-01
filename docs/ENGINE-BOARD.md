# CombViz — Board engine: mô tả chức năng

Trạng thái: **mô tả code đang chạy**, không phải đặc tả mong muốn · Cập nhật: 2026-07-30 (sau M42)
Nguồn yêu cầu: `docs/SRS-v1.0.md` §`BD-01..06` · Hàng đợi: `docs/ENGINE-BACKLOG.md` (`BD-07/08/09/10` đã xong)
Mã nguồn: `packages/engines/board/`

> **Cách đọc tài liệu này.**
>
> Mọi câu ở đây mô tả **code đang chạy**, đọc trực tiếp từ `packages/engines/board/src/`
> tại thời điểm cập nhật. Chỗ nào engine **không** làm thì §14 nói ra, kể cả khi nó
> là thiếu sót chứ không phải quyết định.
>
> Tài liệu này **không** thay `SRS`: `SRS` nói *phải làm gì*, đây nói *đang làm gì
> và bằng cách nào*. Hai bên lệch nhau ở đâu thì §14 ghi lại.

---

## 1. Engine này là gì

Board là engine **vẽ một lưới ô và những thứ đặt lên lưới ấy**. Nó gánh họ bài
lớn nhất của kho: lát hình, tô màu, đếm hai chiều, quân cờ không ăn nhau, lan
truyền trên bàn, bất biến kiểu "lật một hàng".

Trong 83 bài đã xuất bản, **30 bài** dùng board, trên **100 / 353** scene — engine
được dùng nhiều nhất.

| Dùng để nói điều gì | Ví dụ trong kho |
|---|---|
| Lát hình và chứng minh không lát được | `mutilated-chessboard` (#1), `tromino-l-4x4` (#8), `pentomino-l-cover-4x5` (#32) |
| Tô màu như một phép chứng minh | `hex-board-three-colours` (#61), `triangle-lozenge-parity` (#60) |
| Đếm hai chiều (bảng có nhãn và tổng) | `counting-double-counting-table` (#10), `counting-pascal-rule` (#14) |
| Quân cờ, vùng khống chế | `queens-eight-non-attacking` (#33), `kings-domination-8x8` (#26) |
| Bất biến của phép lật | `sign-flip-4x4` (#6), `lights-out-3x3` (#67), `lights-out-torus` (#68) |
| Bàn như một cái bảng đánh dấu, gạch dần | `sieve-primes-100` (#79), `sum-odd-numbers-gnomon` (#81) |

### 1.1 Nguyên tắc xuyên suốt: đổi hình ô, không đổi toạ độ

Đây là quyết định kiến trúc quan trọng nhất của engine, và nó giải thích gần như
mọi thứ còn lại.

Ô luôn định danh bằng **`(hàng, cột)`** và luôn mang id `cell-<r>-<c>`, ở **cả ba
lưới**. Vì thế `holes`, `cell_overrides`, anchor, region, validator, DSL và tập
lệnh **không biết** lưới nào đang được vẽ. Chỗ duy nhất biết là
`src/lattice.ts` — nó trả lời ba câu: đa giác của một ô, tâm ô, và ô nằm dưới một
điểm.

Lãi trực tiếp: `BD-08` (lan truyền) chạy đúng trên cả ba lưới mà không viết ba
lần, vì nó chỉ hỏi `neighbours()`.

### 1.2 Quy ước G-10

Khoảng cách ngang giữa hai tâm ô kề nhau luôn là `CELL` = **10 đơn vị scene**
(= 44 px trên màn hình), ở cả ba lưới. Nhờ vậy bàn vuông $8\times8$ và bàn ong
$8\times8$ ra cùng cỡ, và lớp `scale.ts` không phải biết engine đang vẽ lưới gì.

`CELL` đọc từ `UNITS_PER_CELL` của `@combviz/render` — **một** hằng số cho cả bảy
engine, không phải bảy bản sao.

---

## 2. Hợp đồng dữ liệu

### 2.1 `config` — `BoardConfig`

| Trường | Kiểu | Mặc định | Ý nghĩa |
|---|---|---|---|
| `lattice` | `"square" \| "hex" \| "triangle"` | `"square"` | Hình dạng ô (BD-07) |
| `rows` | số nguyên $1..40$ | — | Bắt buộc |
| `cols` | số nguyên $1..40$ | — | Bắt buộc. Lưới tam giác đòi `cols = rows` |
| `wrap` | `"none" \| "cylinder" \| "torus"` | `"none"` | Dán mép (BD-05). Chỉ lưới vuông |
| `holes` | `[r, c][]` | — | Ô khuyết |
| `coloring_preset` | xem §4 | — | Phép tô tham số hoá (BD-01) |
| `table` | xem §5 | — | Nhãn hàng/cột + dòng tổng (PRN-03). Chỉ lưới vuông |
| `cell_overrides` | `Record<"cell-r-c", {color_class?, glyph?, strike?}>` | — | Tô tay / ghi chữ / **gạch** ô, đè lên preset |

`additionalProperties: false` — trường lạ là lỗi, không phải là bị bỏ qua.

### 2.2 Ô là element **ngầm định**

Ô **không** nằm trong `elements[]`. Chúng sinh từ `rows`/`cols`, và
`implicitElementIds()` khai chúng ra cho tầng validator.

Vì sao: materialize 1600 ô vào file sẽ làm file phình, diff git thành vô dụng
(DAT-03), và đốt ngưỡng 1 MB của NFR-P4 vào thứ suy ra được. Tô tay đi vào
`cell_overrides` dạng **thưa**; preset lo phần còn lại — bàn $8\times8$ tô xen kẽ
là *một dòng config*, không phải 64 dòng dữ liệu.

**Ô khuyết vẫn nằm trong tập id.** "Khuyết" là một *thuộc tính* của ô, không phải
sự vắng mặt của nó — bài mẫu mở đầu bằng đúng câu "bàn cờ khuyết hai ô góc đối
nhau" và anchor trỏ thẳng vào hai ô đó. Loại chúng ra sẽ khiến `ANC-02` báo anchor
rot cho một anchor hoàn toàn đúng.

### 2.3 Ba loại element

| `type` | Trường riêng | Dùng để |
|---|---|---|
| `piece` | `kind`, `glyph?`, `pos`, `show_attacks?` | Quân cờ |
| `tile` | `shape`, `offsets?`, `pos`, `rot?`, `dir?`, `flip?` | Quân ghép (§6) |
| `region` | `cells[]`, `label?` | Khoanh "vùng đang xét" |

Cộng các trường chung của mọi `SceneElement`: `id`, `color_class?`, `emphasis?`
(`focus` / `dim`), `layer?`, `locked?`.

`kind` của quân: `king`, `queen`, `rook`, `bishop`, `knight`, `pawn`, `custom`.
`custom` bắt buộc khai `glyph`.

---

## 3. Ba lưới (BD-07)

| | `square` | `hex` | `triangle` |
|---|---|---|---|
| Hình ô | vuông cạnh `CELL` | lục giác **đỉnh nhọn hướng lên** | tam giác đều cạnh `CELL` |
| Số ô hàng $r$ | `cols` | `cols` | $2r+1$ |
| Tổng số ô | $rows \times cols$ | $rows \times cols$ | $rows^2$ |
| Số láng giềng (trong lòng bàn) | 4 | 6 | **3** |
| Số hướng `directionCount` | 4 | 6 | 3 |
| Bề cao một hàng | `CELL` | $1{,}5 R \approx 8{,}66$ | $\frac{\sqrt3}{2}CELL \approx 8{,}66$ |

Hằng số hình học ($CELL = 10$):

- `TRI_H` $= \frac{\sqrt3}{2} CELL \approx 8{,}660$ — chiều cao một hàng tam giác.
- `HEX_R` $= CELL/\sqrt3 \approx 5{,}774$ — bán kính ngoại tiếp lục giác. Chọn
  theo **bề ngang** (cạnh phẳng tới cạnh phẳng $= CELL$) chứ không theo chiều cao,
  vì G-10 nói về khoảng cách **ngang**.
- `HEX_ROW` $= 1{,}5\,R \approx 8{,}660$ — khoảng cách giữa hai hàng lục giác.

### 3.1 Lưới tam giác

Tam giác **cạnh `rows`**. Hàng $r$ có $2r+1$ ô: $r+1$ ô hướng lên xen $r$ ô hướng
xuống. Cột **chẵn** hướng lên, cột **lẻ** hướng xuống.

Cộng lại đúng $n^2$ ô, nên khai `cols = rows` giữ cho tích `rows × cols` vẫn đếm
đúng số ô và trần `maxCells` không phải có luật riêng. Validator ép điều kiện này
(`bounds/triangle-cols-mismatch`).

### 3.2 Lưới lục giác

Quy ước **"odd-r offset"**: hàng lẻ đẩy sang phải nửa ô. Cùng quy ước mà mọi tài
liệu về lưới lục giác dùng.

### 3.3 Chạm — `cellAt`

Ba lưới, ba cách, và mỗi cách là cách **đúng** chứ không phải gần đúng:

- **vuông** — chia lấy nguyên (`Math.floor`, không `round`: ô $(0,0)$ trải từ $0$
  đến $10$, nên điểm $9{,}9$ vẫn thuộc ô $0$);
- **lục giác** — **tâm gần nhất**. Lưới lục giác đều *đúng là* sơ đồ Voronoi của
  các tâm, nên "gần tâm nào nhất" là **định nghĩa** của ô. Có chặn thêm bằng bán
  kính: không thì chạm cách bàn nửa màn hình vẫn "trúng" ô mép;
- **tam giác** — toạ độ trong ô đơn vị, rồi so với hai cạnh xiên: phần
  $v \ge |2u-1|$ thuộc tam giác hướng lên.

### 3.4 Hướng đi — `step` / `oppositeDirection`

Thứ tự hướng là thứ tự **vòng quanh**, để `dir + 1` luôn là "quay một nấc":

- vuông: $0$ đông, $1$ nam, $2$ tây, $3$ bắc;
- lục giác: $0$ đông, rồi vòng theo chiều kim đồng hồ tới $5$ đông-bắc;
- tam giác: $0$ tây, $1$ đông, $2$ **qua cạnh ngang** — xuống nếu ô hướng lên, lên
  nếu ô hướng xuống. Hướng $2$ **tự nghịch đảo**.

Bất biến máy ép: `step(step(x, d), opposite(d)) == x` với **mọi** ô, mọi hướng, cả
ba lưới.

`step` **không lọc biên**; `neighbours` lọc. Hai hàm khác nhau ở đúng chỗ đó, và
`neighbours` đi qua `step` chứ không chép lại bảng hình học.

---

## 4. Tô màu (BD-01)

`color_class` là **số** $1..8$, không phải mã màu (DAT-20). Bảng màu nằm ở
`packages/theme`. `0` nghĩa là **"chưa xét"**, không phải màu thứ ba.

Thứ tự tra: **`cell_overrides` trước, preset sau** (`cellColorClass`).

### 4.1 `checkerboard`

`{ type: "checkerboard", phase?: 0|1 }`

- vuông / lục giác: $(row + col + phase) \bmod 2$;
- **tam giác**: $(col + phase) \bmod 2$ — tức là **hướng lên / hướng xuống**. Đó
  chính là phép tô mà cả họ bài lát hình thoi dựa vào, và nó khác hẳn $(r+c)$.

Trên **lưới lục giác** phép này bị **từ chối** (`bounds/checkerboard-on-hex`): ba ô
kề nhau đôi một trên bàn ong tạo thành tam giác, nên đồ thị kề của nó có chu trình
lẻ và không tô được hai màu. Từ chối lúc soạn thay vì vẽ ra một hình sai.

### 4.2 `stripes`

`{ type: "stripes", orientation, k: 2..8, phase? }` với
`orientation ∈ {row, col, diag-right, diag-left}`.

Kết quả là $\big((index + phase) \bmod k\big) + 1$ với `index` = `row`, `axis`,
`row + axis`, hoặc `row − axis`.

**Trên lưới lục giác, "cột" đọc theo toạ độ trục** $q = c - \lfloor r/2 \rfloor$,
không theo chỉ số cột thô. Lý do không phải thẩm mỹ: hàng lẻ lệch nửa ô, nên cột
$c$ của hàng $r$ và cột $c$ của hàng $r+1$ **không** thẳng hàng. Nặng hơn — với
$k=3$, dùng $r+c$ cho **hai ô kề nhau cùng màu**, tức là một phép tô trông hệt
phép tô ba màu kinh điển của bàn ong và **sai**. Với toạ độ trục thì `diag-left`
$k=3$ đúng là phép tô ba màu thật, và có test ép cả hai chiều.

### 4.3 Gạch ô (BD-10)

`cell_overrides[id].strike` = một `color_class` $1..8$: **gạch ô này bằng nét màu
của lớp ấy**.

**Gạch khác tô, và khác ở đúng chỗ làm nên một cái sàng: ô bị gạch vẫn đọc được.**
Tô đè lên số $12$ thì người xem mất luôn con số; gạch nó thì họ thấy cả "số này"
lẫn "số này đã bị loại" — mà cả hai đều là nội dung của lập luận.

Màu gánh một nghĩa: **ai đã loại ô này**. Trong sàng Eratosthenes, nét mang màu của
ước nguyên tố nhỏ nhất, nên bảng cuối cùng không chỉ nói "$74$ hợp số" mà đọc được
*vì sao từng số một* bị loại.

Ba chi tiết cài đặt đáng biết:

- **Danh tính riêng** — nét mang key `strike-<r>-<c>`, không dùng chung với ô. Đó
  là cả lý do nó tồn tại: `applyChoreography` tra `data-el ?? key`, nên chung id thì
  một pha "hiện dần nét gạch" sẽ làm **cả ô** nhoà vào rồi hiện ra. Id chỉ sinh ra
  cho ô **có khai** `strike` (§2.2 vẫn đúng: khai cả 1600 nét không tồn tại sẽ bắt
  chốt canh ANC-01 đòi mực cho từng cái).
- **Vẽ sau glyph**, để nét nằm trên con số. Gạch mà bị số đè lên thì nó thành gạch
  chân.
- **Vẽ chéo**, dựng quanh **tâm ô** với bán kính $0{,}35\,CELL$ — không theo đường
  chéo hộp bao, vì đường ấy thò ra ngoài ô tam giác. Gạch ngang thì đọc thành dấu
  trừ hoặc dấu phân số; cùng lý do đã ghi ở engine chuỗi biến đổi.

Đánh đổi, ghi ra để không ai tưởng là sót: lúc được nhấn, nét **đổi màu** thành màu
halo thay vì mọc thêm halo — `decorationAttrs` trả về `stroke` + `stroke-width`, mà
một nét thì không có `fill` để `paint-order` dựng viền quanh. Với nét mảnh thì đó
vẫn đọc được là "cái này đây", và cách duy nhất giữ được màu là phát thêm một node
vô hình cho **mọi** ô bị gạch.

Ô khuyết không gạch được: nó không phải một ô.

---

## 5. Chế độ bảng (PRN-03)

```json
"table": { "row_labels": [...], "col_labels": [...],
           "show_sums": true, "sum_label": "Σ" }
```

Đếm hai chiều là kỹ thuật nền của gần như mọi bài đếm, và hình của nó luôn là cùng
một thứ: một bảng, đếm theo hàng, đếm theo cột, hai con số bằng nhau. Cái bảng đó
khác bàn cờ đúng **ba** chi tiết — nhãn hàng, nhãn cột, dòng tổng — nên nó là *tuỳ
chọn của board*, không phải engine mới.

`show_sums` đếm số ô **đã tô** trong mỗi hàng/cột (ô khuyết không tính), cộng một
ô tổng chung ở góc dưới-phải. Bảng chứa *số* (tam giác Pascal, bảng quy hoạch
động) thì đơn giản là không bật nó — số đi vào `glyph` của `cell_overrides`.

Chi tiết bố cục đáng biết:

- Lề trái đọc từ **nhãn dài nhất** qua `estimateTextWidth`, không từ một hằng số:
  nhãn được phép tới 10 ký tự, mà `CELL × 1,4` chỉ đủ cho khoảng năm.
- Nhãn cột **co lại cho vừa một ô**. Nhãn dài hơn ô thì hai nhãn cạnh nhau dính
  thành một chuỗi vô nghĩa — `"dec=1dec=2dec=3"` — mà không có gì báo: chữ vẫn vẽ
  đủ, khung vẫn đúng. Chỉ nhìn mới thấy.

Chỉ dùng được với **lưới vuông** (`bounds/table-needs-square`): nhãn hàng/cột và
dòng tổng giả định hàng và cột thẳng.

---

## 6. Quân ghép — **hai họ hình**

Đây là chỗ dễ hiểu nhầm nhất của engine, nên nói thẳng: `tile` có **hai** họ hình,
mang tư thế bằng **hai** trường khác nhau, và validator không cho lẫn.

| | Polyomino | Hình của lưới phi vuông (BD-09) |
|---|---|---|
| `shape` | `domino`, `tromino-i/-l`, `tetromino-i/-o/-t/-s/-l`, `custom` | `lozenge` |
| Lưới | chỉ `square` | lưới khai trong `LATTICE_SHAPES` |
| Tư thế | `rot` ∈ $\{0, 90, 180, 270\}$ (**độ**), `flip` | `dir` ∈ $0..n-1$ (**nấc hướng**) |
| Mô hình | tập offset $(\Delta r, \Delta c)$ tịnh tiến tới `pos` | **đường đi** trên đồ thị kề, bắt đầu ở `pos` |
| Vẽ | toạ độ cục bộ + `translate` | toạ độ **tuyệt đối** |

### 6.1 Vì sao không gộp làm một

Hai lý do, cả hai là toán chứ không phải đặt tên:

1. **Tịnh tiến không bảo toàn hình.** Trên lưới tam giác, ô cột chẵn hướng lên còn
   ô cột lẻ hướng xuống. Cùng một tập offset đặt ở hai ô khác tính chẵn lẻ cho ra
   **hai hình khác nhau** — nên offset không mô tả được một quân.
2. **$90°$ không phải phép đối xứng của lưới.** Nhóm quay của lưới tam giác và lưới
   lục giác sinh bởi $60°$. Xoay một hình thoi đi $90°$ cho ra một hình **không nằm
   trên lưới nào cả**.

Vì thế quân lưới mang `dir` và **để trống** `rot`, chứ không mang `rot: 0` giả: một
trường có mặt là một trường có nghĩa.

### 6.2 Chúng gặp nhau ở đâu

Ở đúng **một** hàm: `tileCells(element, lattice, board)` → danh sách ô. Mọi thứ
phía sau — validator chồng lấn, đếm phủ, hit-test, `elementBoxes`, lệnh xoá — chỉ
cần *tập ô*, nên không chỗ nào khác phải biết có hai họ.

### 6.3 `LATTICE_SHAPES`

Bảng cố tình **ngắn**: chỉ hình mà kho đang cần.

| id | Lưới | `walk` | Ghi chú |
|---|---|---|---|
| `lozenge` | `triangle` | `[0]` | Hai tam giác kề cạnh. **Ba** hướng cho **ba** hình thoi, và đó là tất cả: một tam giác có ba cạnh nên đúng ba hình thoi chứa nó |

`walk` là danh sách bước tính bằng **độ lệch hướng** so với `dir`. Rỗng = hình một
ô. Thêm một hình là thêm **một dòng** ở đây — không sửa renderer, validator hay
tập lệnh.

### 6.4 Giá phải trả, ghi ra để không ai tưởng là quên

Quân lưới **nhảy** giữa hai step thay vì trượt. Polyomino giữ nguyên hình khi dời
chỗ nên vẽ một lần trong toạ độ cục bộ rồi `translate` là đúng, và nhờ vậy nó trượt
mượt. Hình thoi thì không: dời nó từ một tam giác hướng lên sang một tam giác hướng
xuống là **lật** nó. Không có phép tịnh tiến nào để nội suy, nên vờ có một cái sẽ
cho ra animation đi qua những vị trí không tồn tại trên lưới. Đổi lại: **mọi khung
hình đều là một thế hợp lệ**.

---

## 7. Quân cờ và vùng khống chế (BD-02)

Luật đi quân nằm ở `src/attacks.ts`, dạng hình học thuần — **một cài đặt, ba nơi
dùng**: builtin `attacks()` của DSL, validator `no-attacks`, và overlay
`show_attacks`. Hai bản cài của cùng một luật sẽ lệch nhau, và người phát hiện ra
sẽ là học sinh nhìn thấy một ô được tô "bị khống chế" trong khi bảng bảo không.

| `kind` | Luật | Glyph |
|---|---|---|
| `king` | 8 ô quanh | ♚ |
| `queen` | tia thẳng + tia chéo | ♛ |
| `rook` | tia thẳng | ♜ |
| `bishop` | tia chéo | ♝ |
| `knight` | 8 nước chữ L | ♞ |
| `pawn` | ăn chéo **lên** (hàng giảm dần) | ♟ |
| `custom` | không khống chế ô nào | `glyph` của tác giả |

**Quân chặn tầm vẫn bị khống chế**: một quân xe bị con mã chắn đường vẫn ăn được
chính con mã đó; chỉ những ô *phía sau* nó mới thoát.

Overlay vẽ **dấu chấm nhỏ ở tâm ô**, không tô nền: nền ô đã mang `color_class`, mà
ở phần lớn bài dùng attack map thì màu ô **cũng** đang mang nghĩa (bàn cờ tô xen
kẽ). Đè một lớp nền thứ hai lên đó là cách chắc chắn để hai khẳng định khác nhau
trông giống nhau.

`show_attacks` bị **từ chối** trên lưới phi vuông (`bounds/attacks-need-square`) và
trên bàn dán mép (`bounds/attacks-with-wrap`) — xem §8.

---

## 8. Dán mép (BD-05)

`wrap: "cylinder"` dán trái với phải; `"torus"` dán cả hai chiều.

Nó đổi **quan hệ kề**, không đổi cách vẽ: bàn vẫn là hình chữ nhật trên màn hình,
nhưng ô cột cuối kề ô cột đầu. Quan hệ kề là thứ mà tô màu, thống trị, lan truyền
và đếm chu trình đều đọc — nên đổi một dòng config là đổi cả **họ bài**, không
phải đổi cách vẽ.

Trên hình xuyến **mọi ô đều giống nhau**: không còn ô góc, không còn ô mép. Chính
điều đó làm hỏng phần lớn lập luận "xét ô ở góc" — và đó là lý do bài trên hình
xuyến khó hơn.

`wrapCell()` là **chỗ duy nhất** biết mép có được dán hay không.

### 8.1 Ký hiệu mép dán

Một bàn dán mép vẽ ra **giống hệt** một bàn thường, nên người đọc không có cách nào
biết — trong khi cả lời giải dựa vào đúng chuyện đó. Engine vẽ ký hiệu chuẩn của
không gian thương: hai cạnh **được dán với nhau** mang cùng loại mũi tên, cùng
chiều. Một mũi tên cho cặp trái–phải, hai mũi tên cho cặp trên–dưới. Cùng chiều
nghĩa là dán thẳng — hình ống / hình xuyến, không phải dải Möbius hay mặt Klein.

### 8.2 Hai luật chặn

- **Chỉ lưới vuông** (`bounds/wrap-needs-square`). Trên bàn ong, hàng lẻ lệch nửa ô
  nên dán trái–phải chỉ khớp khi số hàng chẵn — một điều kiện ngầm mà tác giả không
  có cách nào biết mình đã vi phạm, và vi phạm thì bàn vẫn vẽ ra bình thường. Trên
  lưới tam giác, bàn không phải hình chữ nhật nên "mép trái" không có nghĩa.
- **Không đi cùng `show_attacks`** (`bounds/attacks-with-wrap`). Trên bàn xuyến
  **không có mép**: quân xe trượt vòng quanh hàng và ăn chính nó. Quân cờ trên hình
  xuyến là một **bộ luật khác**, không phải bộ luật cũ với toạ độ vòng.

### 8.3 Chi tiết dễ sai

Trên bàn hẹp, hai hướng ngược nhau **vòng về cùng một ô**: bàn xuyến 2 cột thì đông
và tây của $(r,0)$ đều là $(r,1)$. Kề nhau là một *quan hệ*, không phải một phép
đếm cạnh, nên ô ấy chỉ được kể **một lần** — và ô vòng về chính nó thì không kề
chính nó.

Quân thò qua mép **vòng về**, nên `tiles-in-bounds` cho qua. Ô rơi ra khỏi chiều
**không** dán thì vẫn là tràn biên và giữ nguyên toạ độ ngoài bàn, để validator còn
chỉ ra được.

---

## 9. Renderer

Hàm **thuần**: `Scene → SvgNode[]`. Không đụng DOM, không đọc giờ, không random.
Cùng hàm này chạy trong Player, trong golden test, và trong Node khi build OG card
— nên thứ người học thấy và thứ xuất bản ra không thể lệch nhau.

### 9.1 Thứ tự nhóm

```
<g class="cv-cells">      ô + glyph
<g class="cv-table">      nhãn hàng/cột + tổng     (chỉ khi có `table`)
<g class="cv-attacks">    dấu vùng khống chế       (chỉ khi có quân bật)
<g class="cv-seams">      mũi tên mép dán          (chỉ khi có `wrap`)
<g class="cv-elements">   tile / piece / region, sắp theo `layer`
```

Nhóm rỗng **không** được phát ra: mọi bàn không dùng tính năng đó phải cho ra đúng
SVG như trước, để diff golden nói lên điều gì đó.

Overlay khống chế nằm **giữa** ô và quân: nó phải đè lên màu ô để đọc được, nhưng
không được che chính quân đang khống chế.

### 9.2 Mỗi ô là một node có key

Cố ý **không** gộp các ô cùng màu thành một `<path>`. Gộp thì ít node hơn, nhưng
khoảnh khắc thị giác quan trọng nhất của cả dạng bài tiling là lúc bàn cờ được tô
xen kẽ; gộp sẽ biến nó thành một cú nháy thay vì một chuyển màu mà mắt theo được.
Giữ ô rời để auto-diff (DAT-12) lo phần chuyển động. Tối ưu gộp chỉ đưa vào **sau
khi** đo trên iPad thật cho thấy cần (NFR-P1).

Lưới vuông vẫn vẽ `<rect>`, không phải `<polygon>` bốn đỉnh: hai thứ ra cùng một
hình, nhưng đổi thẻ sẽ làm lệch golden của hai mươi bài đang publish mà không đổi
một pixel nào.

### 9.3 Danh tính và trang trí

| Node | `key` |
|---|---|
| ô | `cell-<r>-<c>` |
| nét gạch (BD-10) | `strike-<r>-<c>` |
| tile / piece / region | `element.id` |
| dấu khống chế | `<pieceId>-atk-<r>-<c>` |
| nhãn bảng | `row-label-<r>`, `col-label-<c>`, `row-sum-<r>`, `col-sum-<c>`, `grand-sum` |

Halo anchor đi qua `decorationAttrs(ctx, id)` cho ô và `elementDecoration(ctx, e)`
cho element; `emphasis: "dim"` đi qua `groupAttrs` và đặt `opacity` lên chính `<g>`
để cả nhóm mờ như một khối.

### 9.4 `elementBoxes`

Trả **một hộp cho mỗi ô**, không phải hộp bao chung. Với quân hình L thì tâm hộp
bao chung rơi vào **cái khuyết** — một chỗ không có mực — và phép biến hình
(`PRN-04`) sẽ bay tới chỗ trống.

Mọi thứ quy về `cellPolygon`, cùng hàm mà renderer dùng để vẽ ô. Nhờ vậy bàn ong và
bàn tam giác không cần một dòng riêng nào. Board là engine **duy nhất qua ngay từ
lần đầu** khi oracle `element-boxes.test.ts` được dựng — phần thưởng của quyết định
"một ô có một hình dạng, khai ở một chỗ".

### 9.5 Màu

`fillForClass(ctx, k)` tôn trọng chế độ pattern (cho người mù màu). Quân ghép vẽ
với `fill-opacity` < 1: **quân che ô nhưng không xoá ô**. Với dạng tiling đó không
phải chuyện thẩm mỹ — cả lập luận nằm ở chỗ "quân này phủ một ô mỗi màu", mà quân
đục thì người đọc không kiểm được.

Glyph của ô lấy mực theo `inkForClass` của **chính ô ấy**: một dấu `−` trên ô lớp 8
vẽ bằng mực đen chung thì gần như biến mất.

---

## 10. Mặt DSL

Trạng thái dẫn xuất tính **một lần cho mỗi scene** rồi memo theo `hashScene`
(bộ đệm 64 mục, thải vào-trước-ra-trước). Nếu để mỗi lần gọi builtin tự tính lại,
`count(cells, c => !covered(c))` trên bàn $40\times40$ sẽ thành $O(\text{ô} \times
\text{quân})$ và invariant strip trượt NFR-P2 mà không ai hiểu vì sao.

### 10.1 Biến

| Tên | Kiểu |
|---|---|
| `cells` | danh sách element ô |
| `tiles`, `pieces`, `regions` | danh sách element |
| `rows`, `cols` | số |

### 10.2 Thuộc tính

| Trên | Thuộc tính |
|---|---|
| ô | `row`, `col`, `color_class`, `hole`, `covered` |
| tile | `shape`, `row`, `col`, `size`, `color_class`, **và** `dir` *hoặc* `rot` + `flip` |
| piece | `kind`, `row`, `col`, `color_class` |
| region | `size`, `color_class` |

Ô không được tô mang `color_class: 0`, không phải "không có giá trị": DSL không có
`null`, nên `c.color_class == 1` luôn trả lời được.

Tile **chỉ hiện bộ thuộc tính tư thế đúng với họ của nó**. Quân trên lưới tam giác
không có `rot`, vì phép quay $90°$ không phải phép đối xứng của lưới ấy; trả về
`rot: 0` cho nó là bịa ra một con số đúng cú pháp và vô nghĩa.

### 10.3 Builtin

| Hàm | Trả về |
|---|---|
| `covered(cell)` | ô có bị quân nào phủ không |
| `hole(cell)` | ô có phải ô khuyết không |
| `adjacent(a, b)` | hai ô có kề **cạnh** nhau không — hỏi thẳng `lattice.ts`, và **đọc cả `wrap`** |
| `attacks(a, b)` | quân `a` có ăn được quân `b` không |

`adjacent` không tự tính $|\Delta r| + |\Delta c| = 1$: công thức ấy đúng cho lưới
vuông và **sai lặng lẽ** cho hai lưới kia — trên bàn ong hai ô kề nhau lệch cả hàng
lẫn cột, trên lưới tam giác một ô chỉ có **ba** láng giềng. Một biểu thức đếm cạnh
sẽ ra con số hợp lý và sai.

---

## 11. Validator (BD-04)

Viết bằng code chứ không bằng DSL vì chúng cần chỉ ra **đúng phần tử nào** vi phạm,
còn DSL chỉ trả về một giá trị. Điều kiện riêng của từng bài thì khai bằng DSL — đó
là cửa thoát, không phải đường chính.

| id | Đạt khi | Chỉ ra |
|---|---|---|
| `tiles-no-overlap` | không hai quân nào phủ chung một ô | các quân chồng nhau |
| `tiles-in-bounds` | mọi quân nằm trong bàn và không đè ô khuyết | quân vi phạm |
| `full-cover` | mọi ô không khuyết đều bị phủ | ô còn trống |
| `no-attacks` | không quân nào ăn được quân nào | các quân đang ăn nhau |
| `proper-colouring` | hai ô kề nhau khác màu, **và** bàn tô kín | ô đụng nhau, hoặc ô chưa tô |
| `proper-colouring:<k>` | như trên, thêm: dùng tối đa $k$ màu | |
| `all-cells:<k>` | mọi ô mang lớp màu $k$ | ô chưa về màu đó |
| `pieces-per-row:<k>` | mỗi hàng đúng $k$ quân | ô đầu hàng sai |
| `pieces-per-col:<k>` | mỗi cột đúng $k$ quân | ô đầu cột sai |

Ba điểm đáng biết:

- `tiles-in-bounds` coi việc **đè lên ô khuyết** là tràn biên — chỉ là kiểu tràn mà
  mắt khó thấy hơn. Nó dùng `inBoard` chứ không so với `rows`/`cols`: trên lưới tam
  giác, một hình thoi thò ra khỏi cạnh xiên vẫn có chỉ số cột nhỏ hơn `cols`.
- `proper-colouring` và `all-cells` chạy đúng trên **cả ba lưới** vì chúng hỏi
  `neighbours()` và `cellsInRow()`. `proper-colouring:2` trên bàn ong là một mục
  tiêu **không thể đạt**, và đó đúng là điều bài toán nói: người học thử bao lâu
  cũng không xanh, rồi đọc lời giải để biết vì sao.
- `all-cells` coi ô **chưa tô** là `FLIP_CLASSES[0]` $= 1$ — cùng hằng số mà lệnh
  lật đọc, nên không có cửa cho chuyện người học bấm đúng mà bảng vẫn đỏ.

`no-attacks` chạy $O(n^2)$ có chủ ý: NFR-P4 chặn ở 200 quân, tức 40 000 cặp — rẻ
hơn nhiều so với một chỉ mục theo hàng/cột/chéo mà lại còn phải xử lý chặn tầm.

---

## 12. Tập lệnh (sandbox)

Mọi lệnh là hàm thuần `(scene, params) → scene | null`. `null` = "không đổi gì",
và khi ấy **không** sinh mục lịch sử. Không lệnh nào sinh id, đọc giờ hay random.

| Lệnh | Tham số | Ghi chú |
|---|---|---|
| `board/paint-cells` | `cells[]`, `color_class \| null` | Nhận **danh sách**: kéo quét 20 ô là *một* mục undo |
| `board/set-preset` | `preset \| null` | |
| `board/place-tile` | `id`, `shape`, `pos`, `rot?`/`dir?`, `flip?`, `color_class?` | **Lưới quyết định họ hình nào hợp lệ** |
| `board/place-piece` | `id`, `kind`, `pos`, `glyph?`, `color_class?` | |
| `board/move-element` | `id`, `pos` | Cho kéo **ra chỗ vi phạm** |
| `board/rotate-tile` | `id`, `delta` | Polyomino: **độ**. Quân lưới: **nấc hướng** |
| `board/flip-tile` | `id` | Từ chối quân lưới |
| `board/remove` | `ids[]` | Bỏ qua element `locked` |
| `board/toggle-attacks` | `id` | |
| `board/toggle-holes` | `cells[]` | Chạy trên **cả ba lưới** |
| `board/draw-region` | `id`, `cells[]`, `label?` | Gộp ô trùng |
| `board/toggle-cross` | `cell`, `rule?`, `classes?` | Lights-out (BD-08) |
| `board/flip-line` | `axis`, `index`, `classes?` | Chỉ lưới vuông (G-11) |

### 12.1 Nguyên tắc: lệnh không chặn cái mà validator báo

`move-element` cho phép kéo tới chỗ chồng lấn hoặc tràn biên; `toggle-holes` cho
khoét một ô đang bị quân đè. Chồng lấn và tràn biên là thứ validator báo realtime
(SBX-02), không phải thứ command chặn. Chặn ở đây sẽ biến sandbox thành **cái hộp
không nghịch được**, mà cả điểm của nó là học bằng nghịch.

### 12.2 Lật hàng / cột (G-11)

Cả một họ bài có dạng "mỗi bước được lật dấu một hàng hoặc một cột" — bảng $\pm1$,
đèn bật/tắt, lật đồng xu. Trước lệnh này những bài đó **không có sandbox được**:
người học chỉ tô được từng ô một, mà tô từng ô thì phá luôn cái luật làm nên bài
toán — **bất biến chỉ tồn tại vì thao tác hợp lệ đụng vào cả hàng cùng lúc**.

Nên đây không phải tiện ích. Nó là ràng buộc của bài toán, viết thành thao tác:
người học không thể lách được bất biến, đúng như trên giấy.

Lệnh đọc màu **hiệu dụng** (`cellColorClass`), không chỉ override — lật một hàng
của bàn cờ tô sẵn phải đổi đúng những ô đó. Ô khuyết và ô **chưa mang màu nào** bị
bỏ qua: "chưa xét" không phải một lớp để lật.

### 12.3 Lan truyền (BD-08)

Tập luật **đóng**, enum chứ không phải biểu thức — cho nhập biểu thức là mở cửa hậu
cho `DSL-03`.

| `rule` | Đổi |
|---|---|
| `cross` | ô được bấm **và** các ô kề (lights-out kinh điển) |
| `neighbours` | chỉ các ô kề, không đổi ô được bấm |

Chạy đúng trên **cả ba lưới** mà không viết ba lần: danh sách ô kề đọc từ
`neighbours()`, nên bàn vuông là chữ thập 5 ô, bàn ong 7 ô, lưới tam giác 4 ô. Đây
là lãi trực tiếp của BD-07.

Khác `flip-line` ở một điểm có chủ ý: ô **chưa mang màu** tính là lớp thứ nhất — một
bàn trống là bàn ở **trạng thái nghỉ** (mọi đèn đang tắt), nên bắt tác giả tô sẵn cả
bàn chỉ để nói "chưa ai đụng vào" là bắt gõ thừa.

Luật lạ bị **từ chối** qua `Object.hasOwn`, không tra thẳng: `rule: "toString"` sẽ
lấy được hàm trên prototype, và một giá trị truthy ở đây nghĩa là luật lạ **chạy im
lặng** như `cross`.

Tính chất mà test ép, và cũng là nội dung toán của họ bài này: bấm hai lần là không
bấm; hai lần bấm **giao hoán** — nhờ vậy lời giải là một *tập* ô chứ không phải một
dãy, và không gian tìm kiếm trên bàn $n$ ô là $2^n$ chứ không phải $n!$.

### 12.4 Số đọc ra (không phải lệnh)

- `coverage(scene)` → `{ covered, total }` — số ô đã phủ / tổng ô hợp lệ (BD-03).
- `colorSummary(scene)` → `Map<color_class, số ô>` — summary strip (BD-06). **Xem
  §14.2.**

---

## 13. Thanh công cụ, hit-test, bound

### 13.1 Thanh công cụ

`boardTools(scene)` bày nút **theo lưới đang dùng**. Bày một nút mà lệnh sẽ từ chối
là đúng cái bệnh mà lớp `SandboxTool` sinh ra để dẹp.

| Nhóm | Có ở lưới |
|---|---|
| Tô màu $1..8$, xoá màu | cả ba |
| `✳` lật chùm (`cross`, `neighbours`) | cả ba |
| `✂` khoét ô, `⬚` khoanh vùng | cả ba |
| `✥` di chuyển, `↻` xoay, xoá quân | cả ba |
| Quân của `LATTICE_SHAPES` (vd. hình thoi) | lưới của chính hình ấy |
| Polyomino (`domino`, `tromino-l`, `tetromino-o/-t`) | chỉ vuông |
| `⇄` lật hàng / lật cột | chỉ vuông |

Di chuyển là **hai chạm**, không kéo thả. Danh sách polyomino đọc từ `TILE_SHAPES`
chứ không gõ lại tên — danh sách gõ tay ở `apps/player` đã từng lệch khỏi thứ engine
thật sự đặt được.

### 13.2 Hit-test

`boardHitTest(scene, point) → string[]`, **trên trước dưới sau**: element sắp theo
`layer` giảm dần, rồi id ô **luôn là phần tử cuối**. UI lấy phần tử đầu để chọn mà
vẫn biết mình đang ở ô nào. Chạm vào quân domino thì chọn quân, không chọn ô nằm
dưới nó.

Ô nằm dưới con trỏ đọc từ `cellAt` của `lattice.ts` — **cùng module** mà renderer
dùng để đặt ô. Chia lấy nguyên theo `CELL` chỉ đúng cho lưới vuông; trên bàn ong nó
lệch dần theo hàng, và người dùng chỉ mô tả được thành "canvas chạm lệch".

`previewCells()` vẽ bóng xem trước. Nó nhận `lattice` vì với quân lưới, bóng **đổi
hình** theo ô đang trỏ tới: cùng một hình thoi rê qua tam giác hướng lên và tam giác
hướng xuống cho ra hai hình khác nhau — đó chính là thứ người học cần thấy trước khi
thả.

### 13.3 Trần (NFR-P4)

| | Trần |
|---|---|
| `rows`, `cols` | 40 |
| ô | 1600 |
| tile | 400 |
| piece | 200 |
| region | 32 |

`maxTiles = 400` và bàn $40\times40$ nhất quán với nhau: bài tromino L phủ bàn
$2^n \times 2^n$ khuyết 1 ô cần $(4^n-1)/3$ quân, nên cả hai bound cùng chặn đúng ở
$n = 5$ ($32\times32$, 341 quân).

### 13.4 Bảng mã lỗi

Lỗi **chặn** (`severity: error`):

| Mã | Khi |
|---|---|
| `bounds/board-too-many-cells` | vượt 1600 ô |
| `bounds/too-many-tiles` / `-pieces` / `-regions` | vượt trần tương ứng |
| `bounds/hole-out-of-board` | ô khuyết ngoài bàn |
| `bounds/cell-override-out-of-board` | `cell_overrides` trỏ ngoài bàn |
| `bounds/triangle-cols-mismatch` | lưới tam giác mà `cols ≠ rows` |
| `bounds/checkerboard-on-hex` | tô hai màu trên bàn ong |
| `bounds/table-needs-square` | `table` trên lưới phi vuông |
| `bounds/tile-needs-square` | polyomino trên lưới phi vuông |
| `bounds/attacks-need-square` | `show_attacks` trên lưới phi vuông |
| `bounds/wrap-needs-square` | `wrap` trên lưới phi vuông |
| `bounds/attacks-with-wrap` | `show_attacks` trên bàn dán mép |
| `bounds/dir-on-polyomino` | polyomino mang `dir` |
| `bounds/rot-on-lattice-shape` | quân lưới mang `rot` |
| `bounds/flip-on-lattice-shape` | quân lưới mang `flip: true` |
| `bounds/shape-wrong-lattice` | hình đặt sai lưới |
| `bounds/dir-out-of-range` | `dir` ≥ số hướng của lưới |
| `board/custom-tile-missing-offsets` | `shape: "custom"` không khai `offsets` |
| `board/tile-out-of-board` | `pos` của quân nằm ngoài bàn |

Cảnh báo (`severity: warning`):

| Mã | Khi |
|---|---|
| `bounds/cell-override-on-hole` | tô một ô khuyết — sẽ không hiện |
| `board/offsets-on-preset-tile` | khai `offsets` cho hình có sẵn — bị bỏ qua |

Trừ bốn mã đầu (trần NFR-P4), mọi luật ở đây là "chặn thứ **hỏng lặng lẽ**", không
phải "chặn cho chặt": không chặn thì hình vẫn vẽ ra và `validate` vẫn xanh — chỉ là
sai. Quân domino nằm chéo trên bàn ong không nổ; nó chỉ trông như lỗi của bài chứ
không phải lỗi của engine.

---

## 14. Chỗ engine **không** làm

### 14.1 Quyết định có chủ ý

| Không có | Vì sao |
|---|---|
| Quân cờ trên bàn dán mép | Là một **bộ luật khác**, không phải bộ luật cũ với toạ độ vòng |
| Phép lật cho quân lưới | Hình thoi đối xứng tâm — lật ra chính nó, và một nút không đổi gì là một nút nói dối |
| Quân lưới **trượt** giữa hai step | Không có phép tịnh tiến nào để nội suy (§6.4) |
| Bảng (`table`) trên lưới phi vuông | Nhãn hàng/cột giả định hàng và cột thẳng |
| Tô hai màu trên bàn ong | Đồ thị kề của nó có chu trình lẻ — không tồn tại |
| Gộp ô cùng màu thành một `<path>` | Sẽ giết mất chuyển màu mà mắt theo được (§9.2) |
| Nhiều hình lưới hơn `lozenge` | `LATTICE_SHAPES` cố tình ngắn: thêm hình khi có bài cần nó |

### 14.2 ~~Thiếu sót thật, chưa sửa~~ — đã trả, 2026-08-01

Ba chỗ từng dùng khung **chữ nhật** `rows × cols` trong khi lưới tam giác có hàng $r$
chỉ $2r+1$ ô — ghi nợ ở đây từ M28, trả một lượt trong lượt review tổng trước freeze:

| Chỗ | Triệu chứng cũ | Sửa |
|---|---|---|
| `colorSummary` | Tam giác cạnh 3, sọc theo hàng $k=3$: báo $3/3/3$, đúng là $1/3/5$ | vòng `c` chạy tới `cellsInRow` |
| `board/paint-cells` | Nhận `cell-0-2` — một ô **không tồn tại** — và tô một ô ma trong sandbox | thân `inBounds` gọi `inBoard` |
| `board/place-piece` | Nhận `pos: [0, 2]` trên cùng bàn ấy | cùng cửa `inBounds` |

Sửa ở **thân `inBounds`** chứ không ở từng chỗ gọi, nên hai lệnh khỏi cùng lúc và chỗ
gọi thứ tư trong tương lai khỏi sẵn. Chốt canh dùng đúng con số triệu chứng của bảng
cũ ($1/3/5$), cộng tam giác cạnh 4 để tổng $16$ không trùng tình cờ với $rows \times
cols$; bẻ từng fix ra thì đỏ 1 và 2 test. Con số cũ giữ nguyên ở bảng trên làm bằng
chứng — một món nợ được ghi chính xác thì trả rẻ.

### 14.3 Ghi nhận giới hạn

Ký tự quân cờ là **Unicode** (♚♛♜♝♞♟). Render headless (REN-01/02) cần nhúng phông
có các ký tự này, nếu không quân cờ biến mất khỏi OG card trong khi trên player vẫn
hiện.

---

## 15. Bản đồ file

| File | Dòng | Nội dung |
|---|---|---|
| `schema.ts` | 238 | Hợp đồng dữ liệu: `BoardConfig`, `PieceElement`, `TileElement`, `RegionElement`, `BOARD_LIMITS` |
| `lattice.ts` | 534 | **Toàn bộ hình học của ba lưới**: đa giác, tâm, chạm, kề, hướng, dán mép, hình của lưới phi vuông |
| `geometry.ts` | 177 | Polyomino: `TILE_SHAPES`, xoay/lật, đường bao; và `cellColorClass` (preset + override) |
| `render.ts` | 778 | `Scene → SvgNode[]`, `defaultViewport`, `elementBoxes` |
| `commands.ts` | 621 | 13 lệnh sandbox + `coverage` + `colorSummary` |
| `validators.ts` | 332 | 9 validator (5 cố định + 4 có tham số) |
| `dsl.ts` | 304 | Trạng thái dẫn xuất, biến và builtin |
| `attacks.ts` | 113 | Luật đi quân — một cài đặt, ba nơi dùng |
| `index.ts` | 444 | `EngineSchemaFragment`: id ngầm định + toàn bộ `checkBounds` |
| `tools.ts` | 186 | Thanh công cụ sandbox, bày theo lưới |
| `hit-test.ts` | 110 | Điểm → element, và bóng xem trước |
| `ids.ts` | 41 | `cellId` / `parseCellId`, `strikeId` / `parseStrikeId` |

Test: `test/lattice.test.ts` (938 dòng) là lớn nhất — nó ép các bất biến hình học
mà không phần nào của code tự phát biểu được (kề là đối xứng, đi–về là quay lại,
`latticeExtent` khớp hộp bao thật, `outlineOfCells` khớp `outlinePath` trên lưới
vuông).

---

## 16. Thêm gì thì sửa ở đâu

| Muốn thêm | Sửa |
|---|---|
| Một lưới thứ tư | Thêm nhánh trong `lattice.ts` (`cellPolygon`, `centreOf`, `cellAt`, `step`, `oppositeDirection`, `directionCount`, `cellsInRow`, `latticeExtent`) + một nhánh ở `checkLattice`. **Không** đụng renderer, DSL, validator |
| Một hình cho lưới phi vuông | **Một dòng** trong `LATTICE_SHAPES` |
| Một polyomino | Một dòng trong `TILE_SHAPES`; thêm vào `OFFERED` nếu muốn có nút |
| Một validator có tham số | Một hàm trong `validators.ts` + một dòng ở `resolveBoardValidator` và `BOARD_VALIDATOR_IDS` |
| Một luật lan truyền | Một dòng ở `SPREAD_RULES` + `SPREAD_LABELS`. Nút tự mọc |
| Một preset tô màu | Một nhánh của union `ColoringPreset` + một nhánh ở `presetColorClass` |
