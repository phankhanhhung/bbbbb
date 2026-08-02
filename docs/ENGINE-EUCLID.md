# CombViz — Euclid engine: đặc tả

Trạng thái: **chưa dựng — spec viết trước** · Viết: 2026-08-02
Mã nguồn dự kiến: `packages/engines/euclid/` · Bài đầu tiên dự kiến: `three-medians-concurrent`
Nguồn yêu cầu: `PRODUCT-REQUIREMENTS.md` §3.2 **`DOM-03`** [P3] SHOULD — *"đường tròn, góc, tiếp tuyến, biến hình và cấu hình động"*
Họ ID mới: **`EU-*`** (xem `ENGINE-BACKLOG.md` §0.4). `PT-*` **giữ nguyên** cho engine `point`.
Tiền lệ gần nhất: `packages/engines/algebra/` (M47) — cùng mô hình "tác giả khai phép, engine tính ra hình"

> **Cách đọc tài liệu này.**
>
> Viết ra khi chưa có dòng code nào. Nếu engine được dựng, mọi chỗ thực tế bác lại
> thiết kế phải ghi vào §20 chứ **không sửa lén cho khớp** — một spec luôn đúng là
> một spec chưa ai thử.
>
> **Engine này chưa được phép mở.** `NG-02` đang cấm bằng chữ (§21.1), và nó mở ra
> **miền toán thứ ba** của kho sau tổ hợp và đại số. §21 liệt kê việc phải xong
> trước. Tài liệu này tồn tại để khi mở thì không phải nghĩ lại từ đầu, không phải
> để tự cho phép mình bắt đầu.

---

## 1. Vì sao cần engine này, nói bằng bằng chứng

Quét toàn bộ **141 bài** đang xuất bản, tìm phát biểu có chứa đường tròn, góc,
vuông góc, đồng quy, tiếp tuyến:

```
Số bài nói về đường tròn  : 0
Số bài nói về tiếp tuyến  : 0
Số bài nói về đồng quy    : 0
Số bài nói về góc         : 0
```

Chữ "góc" **có** xuất hiện, ở 6 bài — và cả 6 đều là "ô góc bàn cờ"
(`mutilated-chessboard`, `chomp-poison-corner`, …), không bài nào là góc hình học.

Chữ "tam giác" xuất hiện ở 4 bài, và cả 4 đều **không phải hình học**: tam giác trong
đồ thị (`triangle-free-5-vertices`), lưới tam giác (`triangle-lozenge-parity`), tam
giác Pascal (`pascal-triangle-identity`, `pascal-two-proofs`).

Engine `point` đã có từ M15 và phục vụ **hình học tổ hợp** — điểm, đoạn, bao lồi,
lưới điểm. Nó có ba bài:

| bài | họ |
|---|---|
| `happy-ending-five-points` | bao lồi, cực trị |
| `hexagon-diagonal-crossings` | đếm giao điểm |
| `lattice-midpoint-five` | lưới điểm, Dirichlet |

`VIZ-COVERAGE.md` §2 xếp họ "hình học tổ hợp" ở **5% trọng số, phủ 75%**, và cột
"còn thiếu gì" ghi hai chữ: *"tô vùng do các đoạn chia (PT-03), **đường tròn**"*.

**Kết luận thiết kế.** Khoảng trống không phải là "thiếu vài lệnh vẽ". Hình học phẳng
Olympiad là một **miền khác**, và nó vấp vào đúng một chỗ mà kiến trúc hiện tại chưa
có câu trả lời: `Scene` là **ảnh chụp toàn phần một cấu hình**, còn đối tượng của
hình học phẳng là **một họ cấu hình bị ràng buộc**. Vẽ một tam giác cụ thể để chứng
minh mệnh đề về mọi tam giác chính là thứ `VIZ-COVERAGE` §6 gọi là *đường duy nhất
phải tránh*:

> *"vẽ một cái hình đẹp không mang lập luận... nó phá đúng thứ làm nên khác biệt của
> kho: người học tin rằng nhìn hình là hiểu được, và ở bài đó thì niềm tin ấy sai."*

Engine này tồn tại để trả lời chỗ ấy, và câu trả lời nằm ở §7–§8: **hình vẫn là một
ảnh chụp, còn tính phổ quát nằm ở chốt canh.**

### 1.1 Ranh giới với `point` — cả hai đều sống

Không khai tử `point`. Hai engine, hai loại toạ độ:

| | `point` | `euclid` |
|---|---|---|
| Toạ độ do ai đặt | **tác giả gõ tay** | **engine tính ra** từ phép dựng |
| Một scene là | một cấu hình cụ thể, và cấu hình ấy **là** bài | một instance của một họ cấu hình |
| Câu hỏi điển hình | "5 điểm này có bao lồi mấy đỉnh" | "mọi tam giác đều có O, G, H thẳng hàng" |
| Kiểm được gì | tính chất **của hình đã vẽ** | tính chất của **mọi hình dựng theo cách ấy** |
| Đường tròn | không có | hạng nhất |
| Hợp với | Erdős–Szekeres, bao lồi, lưới điểm, đếm giao điểm | định lý hình học, đuổi góc, bài thi |

`lattice-midpoint-five` **không** được chuyển sang engine này. Năm điểm ấy là dữ kiện
của bài, không phải kết quả của một phép dựng, và ép nó vào đây là nói dối về bản
chất bài toán — cùng loại nói dối mà docstring của `point/schema.ts` đã cảnh báo khi
tách `point` khỏi `graph`: *"layout biết nói dối"*.

---

## 2. Engine này là gì

Vẽ **một cấu hình hình học được dựng ra**, trong đó tác giả khai **các đối tượng tự
do** và **dãy phép dựng**, còn engine tính ra mọi toạ độ.

Tác giả **không bao giờ gõ toạ độ**. Đó là toàn bộ ý:

```jsonc
{
  "engine": "euclid",
  "config": {
    "given": ["A", "B", "C"],
    "steps": [
      { "op": "circumcircle", "args": ["A", "B", "C"], "name": "w" },
      { "op": "point_on",     "args": ["w"],           "name": "P" },
      { "op": "foot",         "args": ["P", "line(B,C)"], "name": "X" },
      { "op": "foot",         "args": ["P", "line(C,A)"], "name": "Y" },
      { "op": "foot",         "args": ["P", "line(A,B)"], "name": "Z" },
      { "op": "line",         "args": ["X", "Z"],       "name": "s" }
    ],
    "claims": ["collinear(X, Y, Z)"]
  },
  "elements": []
}
```

`elements` rỗng và **phải rỗng** — như `algebra` và `longdiv`. Khai element là lỗi
`bounds/euclid-no-elements`. Cả hình suy từ `config`; khai tay là mở khe cho hình
lệch phép dựng.

Sáu dòng ở trên là đường thẳng Simson, đầy đủ, kiểm được.

---

## 3. Ba loại lệnh — và đây là mấu chốt của cả engine

Phân biệt này quyết định mọi thứ còn lại: cái gì kéo được, cái gì bốc ngẫu nhiên,
bậc tự do bao nhiêu, kiểm thế nào.

| Loại | Ví dụ tiếng Việt | Bậc tự do | Engine bốc số cho nó? |
|---|---|---:|---|
| **`given`** | "Cho tam giác $ABC$" | 2 mỗi điểm | Có — bốc $(x, y)$ |
| **`point_on`** | "Lấy $P$ **bất kỳ trên** đường tròn" | 1 | Có — bốc **một** tham số dọc vật |
| **dựng** | "$M$ là giao của $AB$ và $CD$" | 0 | Không — tính ra |

Chữ **"bất kỳ"** trong đề bài có nghĩa rất cụ thể với máy: mỗi lần bốc cấu hình mới
thì **bốc luôn cả vị trí của điểm ấy**. Kết luận phải đúng ở cả 8 lần.

Không có loại thứ hai thì không viết được nửa số bài hình. "Lấy một điểm bất kỳ trên
cung nhỏ $BC$", "lấy $D$ trên cạnh $AB$", "lấy tiếp tuyến bất kỳ" — tất cả đều là nó.

### 3.1 Hệ quả cho tương tác

Vì mỗi vật khai rõ nó phụ thuộc vào cái gì, engine tự biết vật nào tự do. Luật kéo
chuột (§15) **không cần ai cưỡng chế** — nó là hệ quả của cách khai:

- `given` → kéo tự do trong mặt phẳng.
- `point_on` → kéo được nhưng **trượt dọc vật chứa nó**, không rời ra được.
- dựng → không kéo được. Kéo nó là bài toán ngược, tức là bộ giải, tức là `NG-03`.

### 3.2 Bậc tự do là số đếm được, và engine phải đếm nó

Tổng bậc tự do = $2 \times |{\tt given}| + |{\tt point\_on}|$. Engine khai ra con số
này vì ba chỗ cần:

1. **Bốc cấu hình** — biết phải bốc bao nhiêu số.
2. **Cảnh báo lúc soạn** — bài có $0$ bậc tự do là một hình cố định; mệnh đề chứng
   minh trên nó không phổ quát, và engine phải nói ra thay vì để tác giả tưởng mình
   đã chứng minh xong.
3. **Trần** — xem §16.

---

## 4. Mô hình dữ liệu

### 4.1 Đối tượng

```ts
type Obj =
  | { kind: 'point';  x: Num; y: Num }
  | { kind: 'line';   a: Num; b: Num; c: Num }        // ax + by + c = 0, chuẩn hoá
  | { kind: 'circle'; cx: Num; cy: Num; r2: Num }     // giữ r², không giữ r
  | { kind: 'arc';    circle: Id; from: Id; to: Id; dir: 'ccw' | 'cw' }
```

Hai quyết định trong đó:

**Giữ $r^2$ chứ không giữ $r$.** Bán kính của đường tròn qua ba điểm hữu tỉ là một
số vô tỉ, nhưng **bình phương** của nó thì hữu tỉ. Mọi phép dựng và mọi vị từ đều
diễn đạt được bằng $r^2$ (một điểm nằm trên đường tròn ⟺ $(x-c_x)^2 + (y-c_y)^2 = r^2$).
Lấy căn một lần là mất tính chính xác vĩnh viễn, và §5 cho thấy ta giữ được chính xác
xa hơn nhiều người tưởng.

**Đường thẳng lưu bằng ba hệ số, không lưu bằng hai điểm.** Hai điểm là *một cách*
xác định đường thẳng; đường thẳng thì không nhớ mình sinh ra thế nào. Lưu bằng hai
điểm sẽ khiến "đường thẳng $AB$" và "đường thẳng $BA$" thành hai vật khác nhau, và
`elementBoxes` sẽ trả hai hộp cho một vật.

### 4.2 `Num` — hai tầng số học, và đây là chỗ engine này ăn tiền

```ts
type Num = Rat | number;   // Rat = { p: bigint, q: bigint }, tối giản, q > 0
```

Chạy **chính xác trên $\mathbb{Q}$ ở đâu có thể**, rơi xuống dấu phẩy động chỉ khi
buộc phải lấy căn. Lý do làm được, và nó là một sự thật đẹp của hình học Olympiad:

**Phần lớn phép dựng đóng kín trong $\mathbb{Q}$.** Giao hai đường thẳng, trung điểm,
trung trực, song song, vuông góc, chân đường vuông góc, đối xứng, vị tự, trọng tâm,
trực tâm, tâm ngoại tiếp, trục đẳng phương — tất cả đều là phép hữu tỉ trên toạ độ.

**Và đường tròn cũng đóng kín, nhờ Vieta.** Đây là chỗ then chốt. Một đường thẳng
cắt đường tròn tại hai điểm; nói chung toạ độ chúng cần căn. **Nhưng** nếu đường
thẳng đi qua **một điểm đã biết** trên đường tròn — mà trong bài hình thì gần như
luôn thế — thì phương trình bậc hai theo tham số $t$ có sẵn một nghiệm $t = 0$, nên
nghiệm kia bằng $-b/a$: **hữu tỉ**.

Cụ thể: đường tròn $x^2+y^2+Dx+Ey+F = 0$ với $D, E, F \in \mathbb{Q}$, điểm $A$ hữu
tỉ trên nó, phương $\vec v$ hữu tỉ. Thế $P = A + t\vec v$ được $|\vec v|^2 t^2 + bt = 0$,
nên $t = -b/|\vec v|^2 \in \mathbb{Q}$.

Đó chính là dạng `giao(..., khác: A)` mà §6 nói là dạng gặp nhiều nhất.

**`point_on(đường tròn)` cũng hữu tỉ được.** Chiếu nổi từ một điểm hữu tỉ đã biết
trên đường tròn: mọi đường thẳng hệ số góc hữu tỉ qua điểm ấy cắt đường tròn lần nữa
tại một điểm hữu tỉ. Nên tham số tự do của `point_on` là **một số hữu tỉ**, và mọi
điểm nó sinh ra cũng hữu tỉ.

**Giao hai đường tròn có chung một điểm đã biết** cũng hữu tỉ: trục đẳng phương là
đường thẳng hữu tỉ đi qua điểm ấy, rồi áp Vieta.

#### Chỗ buộc phải rơi xuống float

Bốn chỗ, và phải liệt kê hết vì chúng quyết định bài nào kiểm được chính xác:

| Phép dựng | Vì sao cần căn |
|---|---|
| `incenter`, `excenter` | tâm nội tiếp là tổ hợp theo **độ dài cạnh**, mà độ dài là $\sqrt{\cdot}$ |
| `tangent_from` | tiếp điểm cần $\sqrt{\text{phương tích}}$ |
| `arc_midpoint` | trung điểm cung là giao của phân giác với đường tròn, không có nghiệm sẵn |
| giao "mù" (`intersect` không có điểm chung đã biết) | biệt thức không phải số chính phương |

**Tâm nội tiếp là chỗ đau nhất**, vì nó cực kỳ hay gặp. Chấp nhận.

#### Chính sách kiểm theo tầng số học

| Cấu hình chạy trọn trong | Phép kiểm | Engine nói gì |
|---|---|---|
| $\mathbb{Q}$ | **chính xác** — so bằng $0$, không ngưỡng | "kiểm chính xác" |
| có float | số gần đúng + ngưỡng tương đối (§8.2) | **"bài này kiểm bằng số gần đúng"**, hiện rõ trong Studio |

Nói ra thay vì giấu, vì đây đúng loại chuyện mà kho đã học đắt: *thứ gì hỏng lặng lẽ
thì sống rất lâu*.

**Mở rộng bậc hai $\mathbb{Q}(\sqrt d)$** — khi cả cấu hình chỉ sinh ra **một** căn
(bài có đúng một tam giác cần tâm nội tiếp) thì tính chính xác được trong trường mở
rộng. Ghi ở §18.3 là **chưa làm**, không phải quên.

### 4.3 Cây phụ thuộc

Danh sách `steps` là một DAG có thứ tự: mỗi vật chỉ tham chiếu vật đã khai trước.
Không cho tham chiếu tới trước — kiểm ở tầng structure, mã lỗi
`euclid/forward-reference`.

Engine giữ luôn danh sách phụ thuộc, và nó phục vụ ba chỗ ngoài việc dựng: kéo chuột
(§15) chỉ dựng lại nhánh con của điểm bị kéo; `lineage` (chạm vào một điểm hỏi "cái
này từ đâu ra") dùng lại đúng cây ấy; và thông báo lỗi suy biến chỉ ra **bước nào**
gãy chứ không nói "hình hỏng".

---

## 5. Bảng phép dựng (EU-01)

Ba mươi tư phép. Cột **Q** = đóng kín trong $\mathbb{Q}$; cột **↔** = số nghiệm.

### 5.1 Tự do

| op | args | ra | dof | Q |
|---|---|---|---:|:-:|
| `given` | — | point | 2 | ✓ |
| `point_on` | line \| segment \| circle \| arc | point | 1 | ✓ |
| `length_given` | — | scalar | 1 | ✓ |

### 5.2 Thẳng

| op | args | ra | ↔ | Q |
|---|---|---|:-:|:-:|
| `line` | P, Q | line | 1 | ✓ |
| `segment` | P, Q | segment | 1 | ✓ |
| `ray` | P, Q | ray | 1 | ✓ |
| `intersect` | line, line | point | 1 | ✓ |
| `midpoint` | P, Q | point | 1 | ✓ |
| `perp_bisector` | P, Q | line | 1 | ✓ |
| `parallel_through` | P, line | line | 1 | ✓ |
| `perp_through` | P, line | line | 1 | ✓ |
| `foot` | P, line | point | 1 | ✓ |
| `angle_bisector` | P, Q, R | line | 1 | ✗ |
| `external_bisector` | P, Q, R | line | 1 | ✗ |
| `altitude` | P, line | line | 1 | ✓ |

### 5.3 Đường tròn

| op | args | ra | ↔ | Q |
|---|---|---|:-:|:-:|
| `circle` | tâm, điểm-trên | circle | 1 | ✓ |
| `circle_r2` | tâm, r² | circle | 1 | ✓ |
| `circumcircle` | P, Q, R | circle | 1 | ✓ |
| `diameter_circle` | P, Q | circle | 1 | ✓ |
| `incircle` | P, Q, R | circle | 1 | ✗ |
| `excircle` | P, Q, R, đỉnh | circle | 1 | ✗ |
| `nine_point_circle` | P, Q, R | circle | 1 | ✓ |
| `arc` | circle, P, Q, chiều | arc | 1 | ✓ |
| `arc_midpoint` | arc | point | 1 | ✗ |
| `radical_axis` | circle, circle | line | 1 | ✓ |
| `intersect` | line, circle | point | **2** | ✓* |
| `intersect` | circle, circle | point | **2** | ✓* |
| `tangent_from` | P, circle | line | **2** | ✗ |
| `tangent_at` | P-trên-circle, circle | line | 1 | ✓ |

`✓*` = hữu tỉ **khi** một giao điểm đã biết (§4.2). Không thì rơi float.

### 5.4 Điểm đặc biệt của tam giác

| op | args | ra | Q |
|---|---|---|:-:|
| `centroid` | P, Q, R | point | ✓ |
| `orthocenter` | P, Q, R | point | ✓ |
| `circumcenter` | P, Q, R | point | ✓ |
| `incenter` | P, Q, R | point | ✗ |
| `excenter` | P, Q, R, đỉnh | point | ✗ |
| `nine_point_center` | P, Q, R | point | ✓ |

### 5.5 Biến hình

| op | args | ra | Q |
|---|---|---|:-:|
| `reflect_point` | P, tâm | point | ✓ |
| `reflect_line` | P, trục | point | ✓ |
| `homothety` | P, tâm, tỉ số | point | ✓ |
| `rotate` | P, tâm, góc | point | ✗† |
| `translate` | P, vector | point | ✓ |
| `invert` | P, circle | point | ✓ |

`✗†` — quay giữ được hữu tỉ khi góc là bội của một góc có sin/cos hữu tỉ (bộ ba
Pythagore). Trường hợp chung thì không. Cho khai góc bằng **cặp $(\cos, \sin)$ hữu
tỉ** để giữ chính xác khi tác giả cần.

Ba mươi tư phép này phủ được toàn bộ §24 đợt 1 và đợt 2. Danh sách **đóng** — xem
§18.1.

### 5.6 Biểu thức lồng

Không bắt đặt tên cho mọi thứ. `line(B,C)` viết lồng ngay trong `args`:

```jsonc
{ "op": "foot", "args": ["P", "line(B,C)"], "name": "X" }
```

Ngữ pháp lồng **đóng**: chỉ những op ở §5.2–§5.5 với ↔ = 1, không tham số tự do,
không lồng quá 2 tầng. Op hai nghiệm **bắt buộc** phải đặt tên riêng, vì nó cần chỉ
định nhánh và một chỉ định nhánh nằm lọt giữa biểu thức là chỗ không ai đọc ra.

---

## 6. Op hai nghiệm — luật chọn nhánh (EU-02)

Đường thẳng cắt đường tròn ở hai chỗ. Engine phải biết lấy chỗ nào.

**Luật cứng: chỉ định nhánh bằng một quan hệ hình học, không bao giờ bằng số thứ tự.**

```jsonc
{ "op": "intersect", "args": ["line(A,D)", "w"], "name": "E", "pick": { "other_than": "A" } }
{ "op": "intersect", "args": ["w1", "w2"],       "name": "F", "pick": { "other_than": "M" } }
{ "op": "intersect", "args": ["line(P,Q)", "w"], "name": "G", "pick": { "nearest_to": "B" } }
{ "op": "intersect", "args": ["w1", "w2"],       "name": "H", "pick": { "same_side": "line(A,B)", "as": "C" } }
{ "op": "tangent_from", "args": ["P", "w"],      "name": "t", "pick": { "same_side": "line(P,O)", "as": "Q" } }
```

Bốn kiểu chỉ định, và `other_than` chiếm đa số vì đường thẳng trong bài hình gần như
luôn đi qua một điểm đã biết trên đường tròn.

**`pick: { index: 0 }` không tồn tại trong ngữ pháp.** Cấm ở tầng schema, không phải
khuyến cáo. Lý do: thứ tự hai nghiệm phụ thuộc cách giải phương trình bậc hai, nên nó
**đảo** khi bốc cấu hình mới hoặc khi kéo chuột. Một bài dùng `index` sẽ chạy đúng
trên hình tác giả nhìn thấy và sai trên bảy hình còn lại — đúng lớp lỗi hỏng-lặng-lẽ
mà cả kho này được dựng để chặn.

Thiếu `pick` ở op hai nghiệm → lỗi `euclid/branch-ambiguous`, chặn publish.

**Chốt canh riêng cho luật này** (§19 tầng 1): với mọi op hai nghiệm trong kho, bốc
$10^3$ cấu hình và kiểm rằng nhánh chọn ra **liên tục** — không có cấu hình nào mà
đổi $\varepsilon$ ở điểm tự do làm nhánh nhảy. Cấu hình nào làm nhảy thì `pick` ấy
sai, và engine chỉ ra được cấu hình phản ví dụ.

---

## 7. Bốc cấu hình (EU-03)

### 7.1 Bốc cái gì

Với mỗi bậc tự do:

- `given` → hai số hữu tỉ trong $[-100, 100]$, mẫu số bị chặn.
- `point_on(circle)` → **một** tham số hữu tỉ, qua chiếu nổi (§4.2).
- `point_on(line)` / `point_on(segment)` → một tham số hữu tỉ, `segment` thì trong $(0,1)$.
- `point_on(arc)` → một tham số hữu tỉ, kèm kiểm nằm trong cung.
- `length_given` → một số hữu tỉ dương.

### 7.2 Bốc **tất định**

Cùng một bài phải cho cùng 8 cấu hình, mọi lúc, mọi máy. Sinh số bằng LCG gieo bằng
**id bài + chỉ số lượt**, đúng khuôn `algebra/check.ts` đã dùng:

> *"Sinh số giả ngẫu nhiên **tất định**: cùng scene phải cho cùng kết quả kiểm."*

Không `Math.random()`, không `Date.now()`. Test golden và CI phụ thuộc vào điều này.

### 7.3 Cấu hình suy biến

Bốc trúng ba điểm gần thẳng hàng, hai đường gần song song, đường tròn bán kính gần
$0$, hoặc chia cho số gần $0$ → **bỏ, bốc lại**. Trần 64 lượt bốc lại cho mỗi cấu
hình cần.

Bốc quá 64 lần vẫn hỏng ⇒ **không phải máy xui, mà là bài khai sai**. Ví dụ: bài đòi
`intersect(line(A,B), line(C,D))` trong khi $AB \parallel CD$ theo cấu tạo. Mã lỗi
`euclid/degenerate-by-construction`, và thông báo phải chỉ **bước nào** gãy cùng một
cấu hình cụ thể để tác giả mở ra xem.

Ngưỡng suy biến đo **tương đối theo đường kính cấu hình**, không tuyệt đối — một hình
vẽ trong phạm vi $0{,}01$ đơn vị không được coi là suy biến chỉ vì số nhỏ.

---

## 8. Kiểm (EU-04) — và nó kiểm **mệnh đề của tác giả**

Khác `algebra`. Ở đó phép kiểm canh **engine** (tác giả không gõ vế sau nên không sai
được). Ở đây tác giả **tự viết** `claims`, nên phép kiểm canh cả hai: luật dựng viết
lỗi, **và** mệnh đề tác giả viết sai.

### 8.1 Cách kiểm

Với mỗi `claim`: dựng lại toàn bộ cấu hình với **8 bộ tham số ngẫu nhiên**, đánh giá
vị từ ở từng bộ. Đúng cả 8 → nhận. Sai ở bất kỳ bộ nào → `euclid/claim-false`, kèm
bộ tham số phản ví dụ và ảnh render của nó.

Vì sao 8 lần là đủ mạnh: mọi vị từ ở §8.3 quy về "một hàm đại số theo các tham số tự
do bằng $0$". Một hàm đại số khác không thì tập không điểm của nó có **độ đo $0$**;
trúng nó 8 lần liên tiếp bằng số ngẫu nhiên là chuyện không xảy ra. Cùng lập luận với
Schwartz–Zippel mà `algebra/check.ts` đang dùng, chỉ khác là ở đây biến số là toạ độ
chứ không phải ẩn của biểu thức.

**Vì sao không dùng thẳng $\mathbb{F}_p$ như `algebra`.** Vì đường tròn cần căn bậc
hai, mà `check.ts` đã ghi rõ giới hạn ấy: *"Căn không sống trên $\mathbb{F}_p$: $\sqrt a$
chỉ tồn tại khi $a$ là thặng dư bậc hai."* Ở đây ta chạy trên $\mathbb{Q}$ (§4.2) —
mạnh hơn, vì nó **chính xác** chứ không xác suất, cho những bài không rơi float.

### 8.2 Ngưỡng, cho nhánh float

So $|v| < \varepsilon \cdot s$ với $s$ là **thang của cấu hình** (đường kính bao lồi
mọi điểm đã dựng), $\varepsilon = 10^{-9}$.

Ngưỡng tương đối chứ không tuyệt đối, và ngay cả thế thì nó vẫn là ngưỡng — nên nhánh
float **không bao giờ được báo "kiểm chính xác"** trong giao diện. Ở nhánh này, 8 cấu
hình lại làm thêm một việc thứ hai: một đại lượng khác không mà nhỏ hơn ngưỡng ở **cả
8** cấu hình ngẫu nhiên thì gần như chắc chắn nó bằng $0$ thật.

### 8.3 Bảng vị từ

| vị từ | args | Q |
|---|---|:-:|
| `collinear` | ≥3 điểm | ✓ |
| `concyclic` | ≥4 điểm | ✓ |
| `concurrent` | ≥3 đường | ✓ |
| `parallel` | 2 đường | ✓ |
| `perpendicular` | 2 đường | ✓ |
| `eq_length` | 2 đoạn | ✓ (so bình phương) |
| `eq_angle` | 2 góc | ✓ (so tang định hướng) |
| `tangent` | đường/đường tròn, đường tròn | ✓ |
| `ratio` | 2 đoạn, tỉ số hữu tỉ | ✓ |
| `on` | điểm, vật | ✓ |
| `between` | 3 điểm | ✓ |
| `eq` | 2 đại lượng (§9) | ✓ |

Mười hai vị từ. Chúng phủ gần hết kết luận của bài hình thi đấu.

Điều đáng ghi: **mọi vị từ đều so bằng $0$ trên một biểu thức hữu tỉ theo toạ độ.**
`eq_length` so $|PQ|^2 - |RS|^2$ chứ không so $|PQ| - |RS|$ — nhờ vậy không cần căn.
`eq_angle` so bằng tích chéo/tích vô hướng dạng định hướng, cũng không cần căn. Đây
là lý do bảng §5 giữ được nhiều dấu `✓` đến thế.

### 8.4 Cái **không** kiểm được — nói thẳng

**Bất đẳng thức.** Phép kiểm 8 cấu hình rất mạnh với đẳng thức và gần như **vô nghĩa**
với bất đẳng thức: một bất đẳng thức đúng ở 8 điểm ngẫu nhiên có thể sai ở điểm thứ
chín, và một bất đẳng thức sai vẫn dễ dàng qua được 8 điểm. Lý do sâu: đẳng thức là
một sự kiện độ-đo-$0$, bất đẳng thức là một tập mở.

Vì thế: **vị từ so sánh (`<`, `≤`) không có trong bảng §8.3.** Bài bất đẳng thức hình
học thì engine vẽ minh hoạ được, không kiểm được, và phải nói thẳng với người học
rằng bước quyết định nằm ở chữ — đúng cách kho đang xử lý bài hàm sinh
(`VIZ-COVERAGE` §6, đường thứ hai).

**Quỹ tích, dựng hình, tồn tại.** "Tìm tập hợp điểm $M$ sao cho..." không phải một
mệnh đề kiểm được bằng một cấu hình. Không nhận.

**Điểm định nghĩa bằng điều kiện.** "Lấy $P$ sao cho $\angle PAB = \angle PBC$" là
một bài toán ngược — tức là bộ giải, tức là `NG-03`. Tác giả phải viết **cách dựng**
$P$; mà cách dựng ấy thường chính là một phần của lời giải, nên viết ra là đúng chứ
không phải thiệt. Mã lỗi `euclid/not-constructible`, và thông báo phải nói rõ hai
đường ra chứ không chỉ từ chối.

---

## 9. Đại lượng (EU-05)

Không có đại lượng thì engine này chỉ ở cột *"hình mang thông tin"*. Đại lượng là thứ
đưa nó sang cột *"hình gánh được lập luận"*.

### 9.1 Bốn loại, danh sách đóng

```jsonc
{ "op": "angle",  "args": ["B", "A", "C"], "name": "α" }   // ∠BAC, đỉnh ở giữa
{ "op": "dist",   "args": ["A", "B"],      "name": "c" }
{ "op": "ratio",  "args": ["seg(A,B)", "seg(C,D)"], "name": "k" }
{ "op": "area",   "args": ["A", "B", "C"], "name": "S" }
```

Mỗi đại lượng là một element có `id` như mọi vật khác: tô màu được, neo anchor được,
đưa lên thanh bất biến được, đưa vào `claims` được.

### 9.2 Góc là **góc định hướng**, mod $180°$ — quyết định lớn nhất của mục này

Nếu góc là một số dương từ $0$ tới $180$, cùng một chuỗi đuổi góc sẽ đúng với hình
này và sai với hình kia, chỉ vì $D$ nằm bên này hay bên kia đường thẳng. Mọi bài phải
tách ba bốn trường hợp, và toàn là trường hợp vụn vặt không mang bài học nào.

Góc định hướng giữa hai đường thẳng, lấy mod $180°$, làm cùng một chuỗi đúng cho mọi
vị trí. Đây là công cụ chuẩn của hình học thi đấu và nó phải là **mặc định**.

Có số liệu để đọc quyết định này: hiện cả kho chỉ **6% lời giải** có xét trường hợp
(21/143, và trong đó chỉ 9 là vét cạn thật). Chọn góc không dấu sẽ đẩy riêng hình học
lên rất cao và làm hỏng thứ mà cây lời giải sinh ra để nói — `case` sẽ mất nghĩa "đây
là một nhánh lập luận thật".

Hệ quả phải chấp nhận: người mới đọc `∠(AB, AC) = ∠(DB, DC)` khó hơn `∠BAC = ∠BDC`.
Giao diện phải giúp — hiện dấu cung có mũi tên chiều, và `alt_text` viết bằng lời.

Vẫn giữ một đại lượng **góc không dấu** (`angle_abs`) cho bài lớp dưới, nhưng nó
không tham gia đuổi góc.

### 9.3 Thanh bất biến — và đây là chỗ đại lượng ăn tiền ngay từ ngày đầu

`PRN-01 [P1] MUST` đã đòi đúng hành vi này cho engine khác:

> *"...và quan trọng nhất: **hiển thị live trong Sandbox** khi người học tự thao tác —
> học sinh thấy tận mắt đại lượng đứng yên khi mình nghịch."*

Với hình học nó thành: bấm nút "Hình khác" (§15.2) mười lần, hình đổi mười kiểu, mà
dòng $\angle(AB,AC) - \angle(DB,DC)$ ở dưới **đứng im ở $0$**. Người học không cần
nghe ai nói tính chất ấy đúng — họ phá không nổi nó.

Thanh bất biến đã có sẵn trong Player và 55 bài đang dùng. Engine này chỉ cần khai
binding (§13); không phải viết widget nào.

---

## 10. Đuổi góc (EU-06)

### 10.1 Luật đuổi góc là luật **hình học**, không phải luật đại số

Engine `algebra` có ~80 luật và không luật nào biết đường tròn là gì. Đừng nhét luật
hình học vào đó: nó sẽ mọc thêm một cái não hình học và không ai gỡ ra được nữa.

Engine này tự khai bộ luật của nó, giống hệt cách engine `game` tự khai họ luật chơi
và `board` tự khai validator. Phần cộng trừ số thuần thì trả về `algebra`.

### 10.2 Mười lăm luật

| luật | phát biểu |
|---|---|
| `triangle_sum` | tổng ba góc trong tam giác |
| `exterior_angle` | góc ngoài bằng tổng hai góc trong không kề |
| `inscribed` | góc nội tiếp bằng nửa góc ở tâm |
| `same_arc` | hai góc nội tiếp cùng chắn một cung thì bằng nhau |
| `cyclic_quad` | tứ giác nội tiếp ⟺ hai góc đối bù nhau |
| `tangent_chord` | góc giữa tiếp tuyến và dây bằng góc nội tiếp chắn dây ấy |
| `isosceles` | tam giác cân ⟹ hai góc đáy bằng nhau |
| `parallel_angles` | so le trong, đồng vị |
| `vertical` | góc đối đỉnh |
| `perp_shift` | vuông góc ⟹ lệch $90°$ |
| `reflect_angle` | đối xứng giữ góc, đổi dấu |
| `rotate_angle` | quay cộng một hằng vào mọi góc |
| `homothety_angle` | vị tự giữ góc |
| `sum` / `diff` | cộng trừ hai góc kề |
| `mod180` | quy về đại diện chuẩn |

### 10.3 Hiển thị: dùng lại view hai pane

Không dựng cơ chế mới. Kho đã có view song ánh — hai pane, hai engine khác nhau, nối
bằng bảng `pairs` id ↔ id, và anchor xuyên pane từ M66. Hiện **25 bước** dùng nó, và
**17** trong số đó ghép **hai engine khác nhau** (`board↔sequence` 9, `algebra↔board`
4, `set↔sequence` 3, `algebra↔sequence` 1). Cơ chế đã chịu tải thật.

Đuổi góc rơi đúng vào khuôn ấy:

```
pane trái : euclid  — hình, góc α đang tô đỏ
pane phải : euclid  — chuỗi đuổi góc, hạng tử α đang tô đỏ
pairs     : [["α", "t3"], ["β", "t7"], …]
```

Chạm góc trong hình → hạng tử sáng. Chạm hạng tử → góc trong hình sáng. Không viết
thêm dòng nào ở Player.

### 10.4 Kiểm từng bước

Mỗi bước đuổi góc là một đẳng thức giữa các đại lượng ⇒ kiểm bằng đúng §8: đánh giá
ở 8 cấu hình. Nghĩa là **cả chuỗi đuổi góc được canh từng bước**, không chỉ kết luận.

Đây là chỗ engine này mạnh hơn hẳn `derivation`: ở đó máy chỉ kiểm được *hình thức*
của chuỗi; ở đây máy kiểm được *tính đúng* của từng bước, cùng hạng với `algebra`.

---

## 11. Renderer (EU-07)

### 11.1 Quy ước đơn vị

Tuân G-10 như mọi engine: **10 đơn vị scene = một "ô" = 44px**. Với hình học, đơn vị
neo vào **đường kính bao lồi của cấu hình**: engine co giãn toàn cấu hình về một
khung chuẩn trước khi vẽ, để một tam giác nhỏ và một tam giác to ra cùng cỡ trên màn
hình. Hệ số co tính từ **step rộng nhất của cả bài**, đúng luật `render/scale.ts` —
không step nào đổi cỡ khi bấm sang bước sau.

### 11.2 Thứ tự nhóm

Từ dưới lên: đường tròn → đường thẳng/tia/đoạn → cung nhấn → dấu góc → dấu bằng nhau
→ điểm → nhãn. Nhãn luôn trên cùng; điểm luôn trên đường.

### 11.3 Ký hiệu

| thứ | vẽ thế nào |
|---|---|
| đường phụ (dựng thêm) | nét đứt, mảnh hơn |
| góc | cung tròn ở đỉnh; **hai** cung cho góc bằng nhau thứ hai, ba cung cho thứ ba |
| góc định hướng | cung có mũi tên chiều |
| góc vuông | ô vuông nhỏ |
| đoạn bằng nhau | một, hai, ba gạch ngang |
| tiếp xúc | chấm tiếp điểm + cung ngắn |
| điểm tự do | vòng rỗng (dấu hiệu "kéo được") |
| điểm dựng ra | chấm đặc |

Vòng rỗng cho điểm tự do là ký hiệu **mang thông tin**, không trang trí: nó nói cho
người học biết chỗ nào nghịch được, trước cả khi họ thử.

### 11.4 Nhãn không đè nhau

Bài toán thật, và nó là lý do §19 xếp renderer ở tầng rủi ro cao. Đặt nhãn theo
hướng "ra xa trọng tâm cấu hình", rồi chạy một lượt đẩy nhau đơn giản với trần vòng
lặp cố định. Không có lời giải hoàn hảo; có thể để tác giả đè bằng `label_hint`
(8 hướng la bàn), và **chỉ** bằng chừng ấy — không cho gõ toạ độ nhãn, vì toạ độ nhãn
thì hỏng ngay khi bấm "Hình khác".

### 11.5 `elementBoxes`

Bắt buộc cài (view song ánh của §10.3 cần). Một điểm trả một hộp suy biến; một đường
thẳng trả hộp của đoạn nhìn thấy được trong khung; một đường tròn trả hộp bao; một
**góc** trả hộp của cung — nhờ vậy chạm vào cung góc thì đúng đại lượng ấy sáng lên.

### 11.6 Label atlas

`needsLabels: true`. Nhãn điểm là chữ cái, nhưng nhãn đại lượng ($\angle BAC$,
$\sqrt{}$, chỉ số dưới) là LaTeX ⇒ đi qua atlas D-07 như `derivation` và `algebra`.

---

## 12. Hai bộ toạ độ, và đừng lẫn chúng

Đây là chỗ dễ hiểu nhầm nhất của cả thiết kế.

| | dùng để | ai chọn |
|---|---|---|
| **Toạ độ trưng bày** | vẽ hình in ra trong bài | **tác giả** chọn, lưu trong `config.display` |
| **8 bộ ngẫu nhiên** | kiểm, và nút "Hình khác" | engine bốc, tất định theo id bài |

Bốc ngẫu nhiên cho ra tam giác méo, nhãn chồng nhau, hình xấu. Bài in ra phải đẹp, và
đẹp là việc của tác giả. Nên `config.display` giữ **giá trị các tham số tự do** (không
phải toạ độ mọi điểm — toạ độ vẫn do phép dựng tính ra) mà tác giả đã chọn tay.

Đổi lại, engine phải kiểm rằng bộ trưng bày ấy **không suy biến** và **không đặc
biệt** — ví dụ tác giả vô tình chọn tam giác cân trong một bài không nói gì về cân,
thì hình sẽ dạy sai. Cảnh báo `euclid/display-too-special`: chạy các vị từ ở §8.3 trên
bộ trưng bày và báo mọi quan hệ **đúng ở đó mà không đúng ở 8 bộ ngẫu nhiên**.

Chốt canh này tự nó đáng giá. Nó bắt đúng lỗi kinh điển của sách giáo khoa: hình vẽ
tình cờ cân, và người học học nhầm một tính chất không có trong đề.

---

## 13. Mặt DSL

### 13.1 Biến

| tên | kiểu |
|---|---|
| `points` | danh sách điểm đã dựng |
| `lines`, `circles` | tương tự |
| `free` | danh sách vật tự do |
| `dof` | tổng bậc tự do |
| `exact` | `true` nếu cấu hình chạy trọn trong $\mathbb{Q}$ |

### 13.2 Thuộc tính

`p.x`, `p.y`, `p.free`, `c.r2`, `l.a/b/c`, và với đại lượng: `q.value` (góc trả về
radian định hướng mod $\pi$).

### 13.3 Builtin

`dist2(P,Q)` · `angle(P,Q,R)` · `area(P,Q,R)` · `power(P, w)` (phương tích) ·
`on(P, obj)` · `collinear(...)` · `concyclic(...)`

Trả `dist2` chứ không `dist` — cùng lý do §4.1: căn là chỗ mất chính xác, và mọi
mệnh đề đều viết được bằng bình phương.

---

## 14. Validator built-in

| id | ý nghĩa |
|---|---|
| `non-degenerate` | không có ba điểm thẳng hàng ngoài ý muốn, không đường tròn suy biến |
| `all-constructed` | mọi điểm được nhắc trong `claims` đều đã dựng |
| `exact-arithmetic` | cấu hình chạy trọn trong $\mathbb{Q}$ (dùng để **khoe**, và để bài nào rơi float thì biết) |
| `claims-hold:<k>` | mọi `claim` đúng trên $k$ cấu hình (mặc định 8; nâng lên khi cần chắc hơn) |

`exact-arithmetic` là validator đầu tiên trong kho nói về **chất lượng phép kiểm** chứ
không về nội dung scene. Đó là cố ý: người học nên phân biệt được "máy chứng nhận
chính xác" với "máy đo thấy khớp tới $10^{-9}$".

---

## 15. Sandbox và tương tác (EU-08)

### 15.1 Ba luật giữ `NG-02` và `NG-03`

1. **Chỉ kéo được vật tự do.** `given` kéo tự do; `point_on` trượt dọc vật chứa nó;
   vật dựng ra không kéo được. Không phải luật áp từ ngoài — là hệ quả của §3.
2. **Không đưa bảng lệnh dựng hình cho người học.** Sandbox hình học không có nút
   "thêm đường tròn". Người học nghịch cấu hình của tác giả, không dựng cấu hình mới.
3. **Không có nút gợi ý, không có bộ giải.** Như mọi engine khác.

Ba luật này là thứ phải thay cho chữ *"Không phải GeoGebra"* trong `NG-02` — xem §21.1.

### 15.2 Nút "Hình khác" — làm trước, kéo chuột làm sau

Bấm một cái, engine bốc bộ tham số mới, dựng lại, vẽ ra.

Được gì so với kéo chuột:

- Người học vẫn thấy đúng điều quan trọng: **tính chất không phụ thuộc hình cụ thể**.
- **Không có chuyện điểm nhảy.** Hình nhảy hẳn sang hình khác, không đi liên tục qua
  chỗ suy biến — nên bài toán liên tục của §6 biến mất.
- Không tốn ngân sách khung hình.
- **Dùng lại y nguyên đường code đã cần cho §8.** Không viết thêm gì.

Mất gì: cảm giác liên tục — kéo thì thấy cả quá trình biến dạng.

**Kéo chuột chỉ làm sau khi có ≥ 15 bài** và người học thật cho thấy họ thiếu nó. Khi
đó phải xử đúng một bài toán khó là **điểm nhảy khi kéo liên tục** (§6 chốt canh chỉ
kiểm nhảy ở mức $\varepsilon$; kéo cả quãng dài là chuyện khác), cộng ngân sách
NFR-P1 17,5ms cho một lần dựng lại toàn cấu hình.

---

## 16. Bound (NFR-P4)

| trần | giá trị | vì sao |
|---|---|---|
| `maxSteps` | 60 | phép dựng của một bài IMO hiếm khi quá 25 |
| `maxDof` | 12 | 6 điểm tự do; hơn thế thì không phải một bài hình |
| `maxObjects` | 200 | kể cả vật lồng sinh ra |
| `maxClaims` | 12 | |
| `maxChaseSteps` | 30 | chuỗi đuổi góc |
| `maxRatDigits` | 64 | **quan trọng** — xem dưới |
| `resampleLimit` | 64 | §7.3 |
| `checkRounds` | 8 | §8.1 |

**`maxRatDigits` là trần thật, không phải trần cho vui.** Số hữu tỉ chính xác phình
theo độ sâu phép dựng: mỗi phép giao nhân đôi cỡ tử/mẫu. Một chuỗi 25 bước có thể sinh
phân số hàng nghìn chữ số, và khi ấy phép kiểm "chính xác" chậm hơn float hàng nghìn
lần mà không mua thêm gì.

Chạm trần ⇒ **tự động rơi xuống float cho lượt kiểm đó**, và nói ra (`exact-arithmetic`
đỏ). Không âm thầm chậm, không âm thầm mất chính xác.

---

## 17. Từ chối — thông báo phải nói được gì

Mọi từ chối phải chỉ ra **bước nào** và **cấu hình nào**, không được nói "hình hỏng".

| mã | khi nào | thông báo phải có |
|---|---|---|
| `bounds/euclid-no-elements` | khai `elements` | — |
| `euclid/unknown-op` | op lạ | danh sách op gần đúng |
| `euclid/forward-reference` | tham chiếu tới trước | tên vật, bước |
| `euclid/branch-ambiguous` | op hai nghiệm thiếu `pick` | bốn kiểu `pick` hợp lệ |
| `euclid/branch-unstable` | `pick` cho nhánh nhảy | cấu hình phản ví dụ + ảnh |
| `euclid/degenerate-by-construction` | bốc lại 64 lần vẫn hỏng | bước gãy + cấu hình + **lý do hình học** ("$AB \parallel CD$ theo cấu tạo") |
| `euclid/claim-false` | mệnh đề sai ở ≥1 cấu hình | cấu hình phản ví dụ + ảnh render + giá trị đo được |
| `euclid/not-constructible` | điểm định nghĩa bằng điều kiện | hai đường ra (§8.4) |
| `euclid/display-too-special` | hình trưng bày có tính chất thừa | **quan hệ nào** thừa (§12) |
| `euclid/inexact` | rơi float | phép dựng nào gây ra (§4.2) |

`euclid/claim-false` **phải kèm ảnh**. Một phản ví dụ hình học mà chỉ có số thì không
ai đọc ra được mình sai ở đâu.

---

## 18. Cố ý **không** làm

### 18.1 Danh sách đóng

Sổ rủi ro có **R-2: "DSL phình thành ngôn ngữ lập trình"**. Hình học là chỗ dễ phình
nhất — hôm nay thêm góc, mai thêm lượng giác, mốt thành hệ đại số máy tính.

Chặn bằng cách giữ đóng **cả bốn** danh sách: 34 op (§5), 12 vị từ (§8.3), 4 loại đại
lượng (§9.1), 15 luật đuổi góc (§10.2). Muốn thêm thì sửa code và có bài đi kèm, đúng
`ENGINE-BACKLOG` §0.2. Tác giả **không** tự chế được trong file bài. Engine `game` đã
đi đúng đường này bằng tập luật đóng thay cho `DSL-03` và nó giữ được.

### 18.2 Không hình học động tổng quát

Không canvas trống, không cho người học dựng hình mới, không bộ giải, không chứng minh
tự động. §15.1.

### 18.3 Chưa làm, không phải quên

- **$\mathbb{Q}(\sqrt d)$** — mở rộng bậc hai cho bài chỉ sinh một căn (§4.2). Sẽ đưa
  `incenter` và `arc_midpoint` về nhánh chính xác. Đắt, và float đã đủ dùng trước mắt.
- **Hình học xạ ảnh / toạ độ thuần nhất** — điểm ở vô cực hiện đang bị coi là suy
  biến (§7.3). Toạ độ thuần nhất xử đúng được, và nó cũng làm `intersect` không bao
  giờ hỏng. Đáng làm, không phải bây giờ.
- **Hình học không gian.** Không.
- **Bất đẳng thức hình học** — §8.4, và đây là *không làm được*, không phải *chưa làm*.

---

## 19. Kế hoạch dựng, xếp theo **rủi ro giảm dần**

Nguyên tắc như `ENGINE-ALGEBRA` §17: đâm thủng chỗ dễ chết nhất trước, và mỗi tầng
phải **nhìn được bằng mắt** trước khi sang tầng sau.

**Tầng 0 — máy dựng + số hữu tỉ (rủi ro cao nhất).** 12 op đầu (§5.1, §5.2), lớp
`Rat`, không renderer đẹp, vẽ thô cũng được. Chốt canh: dựng 4 bài đồng quy (trung
tuyến, đường cao, trung trực, phân giác) và kiểm `concurrent` trên $10^3$ cấu hình.
Nếu bốn bài này không xanh thì dừng — mọi thứ sau đều vô nghĩa.

**Tầng 1 — đường tròn + chọn nhánh.** §5.3, cộng `pick` và **chốt canh liên tục nhánh**
của §6. Đây là bản hình học của phép quét $A = BQ + R$: quét $10^3$ cấu hình cho mọi
op hai nghiệm, không cấu hình nào được làm nhánh nhảy. Đây là tầng dễ chết thứ hai và
nó phải chết ở đây chứ không chết ở bài thứ ba mươi.

**Tầng 2 — renderer.** Nhãn không đè, dấu góc, dấu bằng, nét đứt. Chốt canh: **render
ra PNG rồi nhìn** cỡ 20 cấu hình xấu nhất nghĩ ra được (tam giác tù, điểm sát nhau,
đường tròn to gấp mười lần tam giác). Golden mù với chuyện đẹp/xấu — M46 đã dạy lại
điều đó một lần.

**Tầng 3 — 12 bài định lý nền** (§24 đợt 1). Euler và đường tròn chín điểm là phép
thử thật: chúng cần nhiều phép dựng lồng nhau và chúng sẽ tìm ra chỗ `maxRatDigits`
chật.

**Tầng 4 — đại lượng + thanh bất biến** (§9). Rẻ, và nó làm nút "Hình khác" có nghĩa.

**Tầng 5 — đuổi góc hai pane** (§10). Nặng nhất. Chỉ sau khi tầng 3 có ≥ 8 bài.

**Tầng 6 — sandbox kéo chuột.** Chỉ sau ≥ 15 bài, và chỉ nếu người học thật cho thấy
họ thiếu nó (§15.2).

---

## 20. Thực tế bác lại thiết kế ở chỗ nào

*(Để trống cho tới khi dựng. Ghi vào đây thay vì sửa lén cho khớp.)*

---

## 21. Việc phải làm **trước** khi mở engine này

Không phải mở màn — đây là hàng đợi thật, và ba mục đầu chưa mục nào đóng.

### 21.1 Sửa `NG-02` cho đúng — **bắt buộc**

Hiện `SRS-v1.0.md` §6 viết:

> **NG-02** Không phải GeoGebra. Engine điểm/đoạn chỉ phục vụ tổ hợp; không hình học
> động tổng quát.

Thiết kế ở trên **không** vi phạm tinh thần dòng đó — không canvas trống, không bộ
giải, hình mặc định vẫn tĩnh. Nhưng nó rõ ràng vượt khỏi chữ *"chỉ phục vụ tổ hợp"*.

Và dòng ấy đang cấm bằng một **tên thương hiệu** chứ không bằng một ranh giới. Đề nghị
viết lại thành ba luật của §15.1, để ai đọc cũng biết mình được làm tới đâu. Đây là
quyết định của chính chủ, không phải của tài liệu này.

### 21.2 Bảng đo phủ riêng cho miền hình học

`VIZ-COVERAGE.md` đo phủ **tổ hợp**. `longdiv` đã phải ghi đóng góp $0$ vào đó, với lý
do ghi thẳng: *"Ghi bằng $0$ thay vì lặng lẽ cộng vào là cách giữ cho con số còn
nghĩa; miền đại số cần bảng đo riêng."* Đại số đã có `ALGEBRA-COVERAGE.md` (M70).

Hình học cần `GEOMETRY-COVERAGE.md`, và nó phải viết **trước** khi dựng — không thì
không có cách nào biết engine đã đi được bao xa. Khác đại số ở một điểm: đại số có sẵn
104 step để đo khi lập bảng; hình học bắt đầu từ **0**.

### 21.3 `point` engine phải dày bài hơn

`ENGINE-BACKLOG` §0.3 nói thẳng về đúng tình huống này:

> *"Thêm năng lực cho một engine mới 2–3 bài là đoán, không phải đáp ứng."*

`point` có **3 bài**. Nếu ngay cả hình học tổ hợp còn chưa được dùng đủ để biết nó
thiếu gì, thì mở hình học Euclid là xây tầng hai trên móng chưa lún hết.

**Đường rẻ hơn, làm trước:** thêm `circle` như một element **tổ hợp** của engine
`point` — điểm trên đường tròn, dây cung, đếm miền. Không góc, không tiếp tuyến. Nó
lấp dòng ❌ *"đường tròn"* có tên sẵn trong `VIZ-COVERAGE` §2, phục vụ đúng đối tượng
hiện tại, mở một họ kinh điển mà kho đang có **0 bài**, và cho `point` mấy bài mà nó
đang rất cần.

### 21.4 `PT-03` nên đi cùng

Tô vùng do các đoạn chia. `SRS` xếp P3 MAY với lý do *"đắt và hiếm bài cần"* — nhưng
nếu §21.3 mở ra họ đường tròn thì "hiếm bài cần" hết đúng, và `PT-03` có bằng chứng
theo đúng `ENGINE-BACKLOG` §0.2.

### 21.5 Ước lượng chi phí

`VIZ-COVERAGE` §7 lấy engine `graph` làm đơn vị: **M4 ≈ hai tuần ở nhịp 35h/tuần**.

| phần | ước lượng |
|---|---|
| Tầng 0–2 (dựng + đường tròn + renderer) | ~2 M4 |
| Tầng 3 (12 bài nền) | ~1 M4 |
| Tầng 4–5 (đại lượng + đuổi góc) | ~1,5 M4 |
| Tầng 6 (kéo chuột) | ~0,5 M4 |
| **Tổng** | **~5 M4 ≈ 10 tuần** |

Ước lượng chuyên gia, không phải phép đo — `PRD-04` áp dụng.

---

## 22. Bản đồ file (dự kiến)

| file | việc |
|---|---|
| `packages/engines/euclid/src/schema.ts` | `EuclidConfig`, không có element |
| `packages/engines/euclid/src/rat.ts` | số hữu tỉ chính xác trên `bigint`, trần chữ số |
| `packages/engines/euclid/src/numeric.ts` | tầng float, ngưỡng tương đối, thang cấu hình |
| `packages/engines/euclid/src/obj.ts` | `Obj`, chuẩn hoá đường thẳng, đường tròn giữ $r^2$ |
| `packages/engines/euclid/src/ops.ts` | bảng 34 phép dựng |
| `packages/engines/euclid/src/build.ts` | máy chạy phép dựng, cây phụ thuộc, dựng lại theo nhánh |
| `packages/engines/euclid/src/pick.ts` | chọn nhánh cho op hai nghiệm |
| `packages/engines/euclid/src/sample.ts` | bốc cấu hình tất định, xử lý suy biến |
| `packages/engines/euclid/src/predicates.ts` | 12 vị từ |
| `packages/engines/euclid/src/check.ts` | quét 8 cấu hình, báo phản ví dụ |
| `packages/engines/euclid/src/quantity.ts` | góc định hướng, độ dài, tỉ số, diện tích |
| `packages/engines/euclid/src/chase.ts` | 15 luật đuổi góc |
| `packages/engines/euclid/src/layout.ts` | khung nhìn, đặt nhãn không đè |
| `packages/engines/euclid/src/render.ts` | renderer, dấu góc, dấu bằng |
| `packages/engines/euclid/src/dsl.ts` | binding |
| `packages/engines/euclid/src/validators.ts` | 4 validator |
| `packages/engines/euclid/src/tools.ts` | thanh công cụ sandbox (mỏng — §15.1 luật 2) |
| `packages/engines/euclid/src/index.ts` | `EngineSchemaFragment`, renderer, command |
| `apps/player/src/engines.ts` | thêm loader `euclid`, `needsLabels: true` |
| `docs/GEOMETRY-COVERAGE.md` | bảng đo riêng (§21.2) |

Test bắt buộc, mỗi cái ứng với một chốt canh của §19:

| test | canh gì |
|---|---|
| `rat.test.ts` | số học chính xác, trần chữ số, rơi float đúng lúc |
| `build.test.ts` | 34 op, cây phụ thuộc, dựng lại theo nhánh |
| `pick.test.ts` | **liên tục nhánh trên $10^3$ cấu hình** — chốt canh nặng nhất |
| `sample.test.ts` | tất định: cùng id bài ⇒ cùng 8 cấu hình |
| `predicates.test.ts` | 12 vị từ, cả chiều đúng lẫn chiều sai |
| `check.test.ts` | mệnh đề sai **phải** bị bắt; kèm phản ví dụ |
| `chase.test.ts` | 15 luật, quét ngẫu nhiên |
| `display.test.ts` | `euclid/display-too-special` bắt được hình cân tình cờ |

---

## 23. Thêm gì thì sửa ở đâu

**Một phép dựng mới** → thêm dòng vào `ops.ts`, khai lớp số học (Q hay float), thêm
test dựng, và **một bài dùng nó**. Không đụng `build.ts`.

**Một vị từ mới** → `predicates.ts` + `POINT_VALIDATOR_IDS`-tương-đương, cộng test cả
hai chiều. Nhớ: vị từ phải viết được dưới dạng "một biểu thức hữu tỉ bằng $0$"; nếu
không viết được thì nó không thuộc engine này (§8.4).

**Một luật đuổi góc mới** → `chase.ts` + quét ngẫu nhiên. Không đụng `algebra`.

**Một kiểu `pick` mới** → `pick.ts`, và **bắt buộc** bổ sung vào chốt canh liên tục
của `pick.test.ts`. Đây là chỗ duy nhất trong engine mà một thay đổi nhỏ có thể làm
hỏng lặng lẽ mọi bài đã có.

---

## 24. Lộ trình nội dung

`ENGINE-BACKLOG` §0.2 buộc mỗi hạng mục năng lực phải **đi kèm nội dung**. Đây là danh
sách ấy, viết sẵn.

### Đợt 1 — 12 định lý nền (đi cùng tầng 3)

Ba trung tuyến đồng quy · ba đường cao đồng quy · ba trung trực đồng quy · ba phân
giác đồng quy · góc nội tiếp và góc ở tâm · tứ giác nội tiếp · phương tích một điểm ·
trục đẳng phương · **đường thẳng Euler** · **đường tròn chín điểm** · **đường thẳng
Simson** · Ptolemy

Bốn bài đầu là bài lớp 8–9; bốn bài cuối là bài chuyên. Cùng một bộ máy chạy được cả
hai đầu, và đó là phép thử tốt nhất cho §5.

### Đợt 2 — kỹ thuật (đi cùng tầng 5)

Đuổi góc · phương tích · tam giác đồng dạng · Ceva · Menelaus · phép vị tự · phép
quay · điểm Miquel · trung điểm cung

Mỗi kỹ thuật là một `technique` mới trong `taxonomy/techniques.yaml`, và theo luật của
file ấy thì chỉ thêm khi đã có bài thật đòi.

### Đợt 3 — bài thi

Bài hình IMO chia làm ba loại, tỉ lệ rất lệch:

| loại | kết luận | engine làm được gì |
|---|---|---|
| **Đa số** | thẳng hàng, đồng quy, đồng viên, tiếp xúc, đi qua điểm cố định | **kiểm trọn vẹn** |
| Ít hơn | bất đẳng thức, quỹ tích, dựng hình | chỉ minh hoạ (§8.4) |
| Rải rác | phụ thuộc cấu hình (điểm trong hay ngoài) | cần cây `case` — và góc định hướng (§9.2) xoá gần hết |

### Từ vựng

`topics.yaml` cần **`plane-geometry`**. Theo luật của chính file ấy: *"Thêm topic mới
là một quyết định có chủ đích — sửa file này, commit riêng, và rà lại xem bài cũ có
nên gắn thêm không."*

Rà trước: **không bài nào** trong 141 bài hiện có nên gắn `plane-geometry`. Ba bài của
`point` là hình học **tổ hợp** và phải giữ nguyên `counting` (§1.1).
