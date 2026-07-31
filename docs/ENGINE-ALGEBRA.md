# CombViz — Algebra engine: đặc tả

Trạng thái: **đã dựng — tầng 0–3 chạy được, tầng 4 chưa** · Viết: 2026-07-31 (sau M46), dựng: M47
Mã nguồn: `packages/engines/algebra/` · Bài đầu tiên: `equation-moves-that-lie`
Nguồn yêu cầu: chưa có trong `docs/SRS-v1.0.md` — họ ID mới `AL-*` (xem `ENGINE-BACKLOG.md` §0.4)
Tiền lệ gần nhất: `packages/engines/longdiv/` (M46), `packages/engines/derivation/` (M18)

> **Cách đọc tài liệu này.**
>
> Viết ra khi chưa có dòng code nào, rồi **dựng theo nó** ở M47. Phần lớn giữ
> nguyên; chỗ nào thực tế bác lại thiết kế thì §20 ghi lại, không sửa lén cho khớp.
> Tầng 0–3 của §17 đã chạy và có chốt canh; **tầng 4 (sandbox tương tác) chưa làm**
> — đúng kế hoạch, nó đợi ≥ 3 bài dùng engine ở chế độ đọc.
>
> **Engine này được mở theo yêu cầu trực tiếp của chính chủ**, không đi qua hàng
> đợi. `PRD-07` và gate **G-C** vẫn đứng nguyên, và §19 vẫn là nợ chưa trả.

---

## 1. Vì sao cần engine này, nói bằng bằng chứng

Kho đã có `derivation` — engine xếp chỗ cho chuỗi biến đổi. Nó **không hiểu công
thức**, và chính comment trong `packages/engines/derivation/src/validators.ts` khai
điều đó. Đo bằng máy trên bài đang xuất bản:

```
geometric-sum-doubling · step s0 · hạng tử t1b
  "1 + 2 + 4 + 8"  →  "1 + 2 + 4 + 9"

lỗi     : []
cảnh báo: []
hasErrors: false
```

$S = 1+2+4+9$ qua sạch bộ kiểm. Không luật nào trong `check` đọc nội dung `tex`;
nó là chuỗi mờ với toàn bộ hệ thống.

Cùng phép đo còn lộ thứ hai: `t1b` chứa **cả vế phải** trong một element. Schema đặt
`maxTexLength: 120` kèm chú thích *"để giữ hạng tử là hạng tử"*, nhưng không có gì
ép, nên bài trong kho vi phạm đúng tiền đề mà engine sinh ra để phục vụ — danh tính
từng hạng tử. Ở bài này nó không tồn tại.

**Kết luận thiết kế:** khoảng trống không nằm ở bố cục. Nó nằm ở chỗ **ai giữ phép
toán**. `derivation` để tác giả giữ; engine chỉ vẽ lại. Engine này lấy phép toán về
cho máy — cùng đặt cược đã thắng ở `coloring_preset`, ở bảng Grundy, và ở `longdiv`
(M46): *khi hình **là** kết quả phép tính, sinh nó ở một chỗ là cách duy nhất để hình
không bao giờ lệch khỏi phép tính.*

### 1.1 Ranh giới với `derivation` — cả hai đều sống

Không khai tử `derivation`. Hai engine, hai loại chuỗi, và lẫn lộn chúng là hỏng cả
hai:

| | `derivation` | `algebra` |
|---|---|---|
| Một bước là | một **dòng tác giả viết ra** | một **luật máy áp vào cây** |
| Lý do của bước | văn xuôi: "theo giả thiết", "đổi chỉ số" | tên luật: `distribute`, `collect_like` |
| Máy kiểm được gì | hình thức (dòng rỗng, hạng tử biến mất không khai) | **tính đúng** của từng bước |
| Hợp với | đếm hai chiều, song ánh, lập luận tổ hợp | biến đổi đại số cơ học |
| Sai kiểu gì | tác giả gõ nhầm ⇒ hình nói sai, không ai biết | không gõ được kết quả ⇒ không sai kiểu đó được |

Bước "vì mỗi tập con chứa $n$ tương ứng một tập con của $[n-1]$" **không phải** phép
áp luật. Ép nó vào engine này là một kiểu nói dối khác — giả vờ rằng một lập luận
tổ hợp là một phép rewrite.

---

## 2. Engine này là gì

Vẽ **một chuỗi biến đổi biểu thức**, trong đó tác giả khai **biểu thức gốc** và
**dãy luật cần áp**, còn engine tính ra mọi dòng còn lại.

Tác giả **không bao giờ gõ vế sau**. Đó là toàn bộ ý:

```jsonc
{
  "engine": "algebra",
  "config": {
    "start": "(x + 1)^2 = x^2 + 1",
    "steps": [
      { "rule": "expand_square", "at": "L" },
      { "rule": "distribute",    "at": "L.0" }
    ]
  },
  "elements": []
}
```

`elements` rỗng và **phải rỗng** — như `longdiv`. Khai element là lỗi
`bounds/algebra-no-elements`. Cả bảng suy từ `config`; khai tay là mở khe cho hình
lệch phép tính.

---

## 3. Mô hình dữ liệu

### 3.1 Cây biểu thức

```ts
export type Expr =
  | { k: 'int'; v: number }                        // số nguyên
  | { k: 'rat'; p: number; q: number }             // hữu tỉ tối giản, q > 1
  | { k: 'var'; name: string }                     // một chữ cái, tuỳ chọn chỉ số dưới
  | { k: 'add'; args: Expr[] }                     // n-ngôi, args.length ≥ 2
  | { k: 'mul'; args: Expr[] }                     // n-ngôi, args.length ≥ 2
  | { k: 'pow'; base: Expr; exp: number }          // số mũ **nguyên**, không phải Expr
  | { k: 'div'; num: Expr; den: Expr }
  | { k: 'rel'; op: '=' | '<' | '<=' | '!='; lhs: Expr; rhs: Expr };
```

Bốn quyết định, mỗi cái đánh đổi một thứ:

- **Không có nút `neg`.** $-x$ là `mul[int(-1), x]`. Thêm một loại nút thì mọi luật
  phải xử lý thêm một nhánh, và `neg` không mang thông tin gì mà `mul` không mang.
  Giá phải trả: printer phải nhận ra mẫu hệ số $-1$ để in ra `−x` chứ không in
  `(-1) \cdot x`. Đó là việc của printer, và đúng chỗ.
- **Không có nút `sub`.** $a-b$ là `add[a, mul[int(-1), b]]`. Cùng lý do, và nó làm
  `collect_like` thành một luật thay vì hai.
- **`div` thì giữ.** Về mặt toán $a/b$ là `mul[a, pow(b,-1)]`, nhưng phân số là một
  **vật thể thị giác** có bố cục riêng, và `cancel_common` là luật mà cả bài học
  xoay quanh. Chuẩn hoá nó đi thì phải dựng lại lúc in — mất nhiều hơn được.
- **`pow.exp` là số nguyên JS, không phải `Expr`.** $x^n$ với $n$ ký hiệu nằm ngoài
  phạm vi (§16). Đổi lại, số mũ không có đường dẫn nên không neo được — chấp nhận.

**Dạng chuẩn tắc** (bất biến của mọi `Expr` do engine sinh ra, có chốt canh):

1. `add`/`mul` không lồng trực tiếp trong chính nó — `add[a, add[b,c]]` bị làm phẳng.
2. `add`/`mul` có ≥ 2 args; một args thì thay bằng chính nó, không args thì thay
   bằng `int(0)` / `int(1)`.
3. `rat` tối giản, `q > 1`; `q == 1` thì là `int`.
4. `pow(e, 1)` → `e`; `pow(e, 0)` → `int(1)`.
5. **Không tự sắp xếp lại thứ tự args.** Đây là điều then chốt: `commute` là một
   **luật người học phải áp tay**, không phải thứ engine lặng lẽ làm. Bảng chuẩn hoá
   tự đổi chỗ hạng tử thì hình nhảy một cái mà không luật nào giải thích.

### 3.2 `config` — `AlgebraConfig`

```ts
export const AlgebraConfig = Type.Object({
  /** Biểu thức hoặc quan hệ gốc, viết bằng cú pháp mặt (§3.3). */
  start: Type.String({ minLength: 1, maxLength: 200 }),
  /** Dãy luật áp lần lượt. Rỗng ⇒ chỉ vẽ một dòng. */
  steps: Type.Optional(Type.Array(AlgebraStep, { maxItems: 12 })),
  /** Tên biến được phép — chặn gõ nhầm `n` thành `m` thành một biến mới. */
  vars: Type.Optional(Type.Array(Type.String({ maxLength: 3 }), { maxItems: 6 })),
  /** Hiện cột tên luật bên phải mỗi dòng. Mặc định bật. */
  show_rules: Type.Optional(Type.Boolean({ default: true })),
  caption: Type.Optional(Type.String({ maxLength: 48 })),
});

export const AlgebraStep = Type.Object({
  rule: Type.String(),                    // tên trong §4
  at: Type.String(),                      // đường dẫn, §3.4
  /** Tham số của luật — chỉ vài luật cần (§4). */
  arg: Type.Optional(Type.String({ maxLength: 40 })),
  /** Ghi chú đè lên tên luật, khi tên luật chưa đủ nói. */
  note: Type.Optional(Type.String({ maxLength: 32 })),
});
```

### 3.3 Cú pháp mặt, và vì sao không gõ cây JSON

`start` là **chuỗi**, không phải cây. Ba lý do:

- **AUT-KPI.** Gõ `(x+1)^2 = x^2+1` mất ba giây; gõ cây JSON tương đương mất vài
  phút và sai chính tả được ở mười chỗ.
- **DAT-03.** File trong kho phải đọc được bằng mắt và diff được bằng git. Một cây
  20 nút thành 60 dòng JSON, và đổi một hệ số thì diff không nói được đã đổi gì.
- Parser **dù sao cũng phải có** cho sandbox (§13: người học gõ đích cần tới).

Grammar, cố ý bé:

```
rel   := sum (('=' | '<' | '<=' | '!=') sum)?
sum   := prod (('+' | '-') prod)*
prod  := unary (('*' | '/') unary)*        // '*' bắt buộc, không có nhân ngầm
unary := '-'? power
power := atom ('^' int)?
atom  := int | var | '(' rel ')'
var   := letter ('_' digit)?
```

**Không có nhân ngầm.** `2x` là lỗi cú pháp, phải viết `2*x`. Nhân ngầm kéo theo
`xy` là một biến hay hai biến nhân nhau — mơ hồ ngay ở ký tự thứ hai, và mơ hồ
trong dữ liệu là thứ đắt nhất. `vars` khai ra rồi thì lỗi nói được tên biến gần đúng.

Parse thất bại ⇒ **từ chối** (§15), không đoán.

### 3.4 Đường dẫn, và danh tính — hai không gian khác nhau

Đây là chỗ dễ nhầm nhất của cả thiết kế, nên nói rõ:

**Đường dẫn (`Path`)** trả lời *"nó đang ở đâu"*. Chuỗi ngắn: `L` = vế trái,
`R` = vế phải, rồi chỉ số con nối bằng dấu chấm. `L.0.1` = con thứ hai của con thứ
nhất của vế trái. Với `div`: `0` = tử, `1` = mẫu. Với `pow`: `0` = cơ số.

**Danh tính (`TermId`)** trả lời *"nó là ai"*. Chuỗi `e7`, cấp phát khi nút **ra
đời** — lúc parse `start`, hoặc lúc một luật tạo nút mới — và **đi theo nút qua mọi
bước**. Anchor và choreography dùng cái này.

Vì sao phải tách: sau `commute`, hạng tử $x$ đổi từ `L.0` sang `L.1`. Nếu id là
đường dẫn thì diff giữa hai bước thấy *"`L.0` đổi nội dung, `L.1` đổi nội dung"* —
một cặp xoá-thêm, và animation là một cú nhấp nháy. Với id bền, diff thấy *"`e3` dịch
từ chỗ này sang chỗ kia"*, và `DAT-11/12` cho ra **chuyển động**. Đây đúng thứ mà
`derivation` đang bắt tác giả khai tay bằng `becomes` — và khai tay thì khai sai được.

**Ánh xạ id không phải song ánh**, và điều đó phải nằm trong kiểu dữ liệu:

```ts
export interface RuleResult {
  readonly after: Expr;
  /** Nút cũ → các nút mới nó trở thành. Rỗng ⇒ nút biến mất. */
  readonly trace: ReadonlyMap<TermId, readonly TermId[]>;
  /** Nút mới không đến từ nút cũ nào (ví dụ số 2 sinh ra khi khai triển bình phương). */
  readonly born: readonly TermId[];
}
```

- `distribute` trên $a(b+c)$: nút $a$ **nhân đôi** — một id ra hai id. Choreography
  vẽ thành một bản sao tách ra.
- `collect_like` trên $3x + 5x$: hai id **nhập một**.
- `cancel_common`: id **biến mất** (`trace` cho mảng rỗng) — và đó chính là chỗ
  `derivation` cần cờ `cancelled` khai tay.

---

## 4. Tập luật (AL-01)

Mỗi luật là **hàm toàn phần trên một cây con**: `(sub: Expr, arg?: string) →
RuleResult | Refusal`. Không luật nào đi ra ngoài cây con nó được gọi vào, trừ nhóm
`rel` (đánh dấu ★) vốn định nghĩa trên nút `rel`.

| Tên | Áp được khi | Cho ra | Tham số |
|---|---|---|---|
| `commute` | `add`/`mul`, có `arg` là cặp chỉ số | đổi chỗ hai args | `"0,1"` |
| `associate` | `add`/`mul` lồng nhau | làm phẳng / gom nhóm | nhóm |
| `distribute` | `mul` có ít nhất một args là `add` | $a(b+c) \to ab+ac$ | — |
| `factor` | `add` mà mọi args có thừa số chung | $ab+ac \to a(b+c)$ | thừa số |
| `collect_like` | `add` có ≥ 2 hạng tử **đồng dạng** | gộp hệ số | — |
| `expand_square` | `pow` với `exp == 2`, cơ số là `add` 2 args | $(a\pm b)^2$ | — |
| `pow_add` | `mul` hai `pow` cùng cơ số | $x^m x^n \to x^{m+n}$ | — |
| `pow_mul` | `pow` của `pow` | $(x^m)^n \to x^{mn}$ | — |
| `eval_int` | cây con **không chứa biến** | tính ra `int`/`rat` | — |
| `cancel_common` | `div` có thừa số chung tử–mẫu | rút gọn | thừa số |
| `common_denominator` | `add` của các `div` | quy đồng | — |
| `split_fraction` | `div` có tử là `add` | $\frac{a+b}{c} \to \frac ac+\frac bc$ | — |
| ★ `add_both_sides` | `rel` | cộng `arg` vào hai vế | biểu thức |
| ★ `mul_both_sides` | `rel` | nhân hai vế với `arg` | biểu thức |
| ★ `substitute` | bất kỳ | thay biến bằng biểu thức | `"x := 2*y"` |
| `drop_unit` | `mul` có thừa số $1$, hoặc `add` có hạng tử $0$ | bỏ chúng đi | — |

`associate` và `common_denominator` **chưa cài** — xem §20.

**Hai điều luật này cố ý không có:**

- **Không có `simplify`.** Một nút bấm nhảy năm bước là đúng thứ làm người học không
  học được gì — nó biến engine dạy *cách biến đổi* thành máy trả lời. Mọi thay đổi
  phải mang tên một luật.
- **Không có bộ giải.** Engine **không** tự tìm dãy luật. Tác giả (hoặc người học ở
  sandbox) chọn từng bước. Tự tìm đường là tính năng khác, và nó thuộc họ `EXP-*`.

### 4.1 `mul_both_sides` và cái bẫy nổi tiếng nhất của đại số phổ thông (AL-08)

Nhân hai vế với một biểu thức **có thể bằng $0$** không bảo toàn tập nghiệm — đó là
đường đi của mọi "chứng minh $1 = 2$". Engine phải bắt:

- `arg` là hằng khác $0$ ⇒ áp bình thường.
- `arg` chứa biến ⇒ **cảnh báo** `algebra/multiplier-may-vanish`, và dòng kết quả
  mang một dấu điều kiện đọc được: *"với $x \ne 1$"*.
- Chia (nhân với nghịch đảo) mà mẫu có thể bằng $0$ ⇒ cùng luật.

Đây không phải tính năng phụ. Nó là **thứ duy nhất trong toàn bộ spec mà một engine
sắp chữ không thể có**, và nó là một trong những lỗi đại số hay gặp nhất. Nếu engine
này chỉ làm được đúng một việc, thì nên là việc này.

---

## 5. Máy chạy

```ts
export function applyRule(before: Expr, at: Path, rule: string, arg?: string):
  RuleResult | { refusal: string };

export function readAlgebra(scene: Scene): AlgebraModel;
```

`readAlgebra` chạy `start` qua từng `steps[i]`, thu về:

```ts
export interface AlgebraModel {
  readonly rows: readonly AlgebraRow[];   // dòng 0 là `start`
  readonly refusal: string | null;
  readonly conditions: readonly string[]; // điều kiện tích luỹ từ AL-08
}
export interface AlgebraRow {
  readonly id: string;                    // 'row0', 'row1', …
  readonly expr: Expr;
  readonly rule: string | null;           // luật sinh ra dòng này
  readonly note: string | null;
  readonly trace: ReadonlyMap<TermId, readonly TermId[]>;
  readonly born: readonly TermId[];
}
```

Một luật không áp được ⇒ **cả model từ chối**, không vẽ nửa bảng. Cùng lý lẽ với
`longdiv`: hỏng thì phải nhìn là thấy.

---

## 6. Kiểm tính đúng (AL-03) — và nó kiểm **engine**, không kiểm tác giả

Vì tác giả không gõ kết quả, tác giả **không thể** làm ra một bước sai. Thứ có thể
sai là **luật viết lỗi**. Nên phép kiểm này là chốt canh cho chính engine:

Với mọi bước là rewrite thuần (không phải nhóm ★), `before` và `after` phải **đồng
nhất bằng nhau như hàm hữu tỉ**. Kiểm bằng đánh giá ngẫu nhiên trên $\mathbb{F}_p$
với $p = 2^{31}-1$:

1. Gán mỗi biến một giá trị ngẫu nhiên trong $\mathbb{F}_p$.
2. Tính hai vế. Mẫu số $\equiv 0$ ⇒ bốc lại, tối đa 8 lần.
3. Khác nhau ⇒ **lỗi**.

Theo Schwartz–Zippel, một đa thức khác không bậc tổng $d$ triệt tiêu tại điểm ngẫu
nhiên với xác suất $\le d/p$. Với trần bậc $64$ (§14) thì một lần thử đã cho
$\approx 3\times10^{-8}$; chạy $8$ lần là thừa an toàn.

Không cần CAS, không cần đại số ký hiệu. Đây đúng phương pháp đã dùng cho bảng Grundy
và cho phép quét $A = BQ+R$ của `longdiv`.

Nhóm ★ kiểm khác: `add_both_sides` bảo toàn tập nghiệm **do cấu trúc** (cùng một cây
cộng vào hai vế), `mul_both_sides` theo AL-08, `substitute` thì không phải đẳng thức
nên không kiểm bằng cách này.

---

## 7. Sắp chữ (AL-04) — printer, không phải atlas

**Engine tự in từ cây. Không dùng label atlas (D-07).** Lý do có số liệu: atlas là
bảng tra phải dựng lại mỗi lần nội dung đổi, và quên dựng thì hình hiện chữ đỏ
`⟨thiếu atlas: …⟩` — kho đã xuất bản một bài như thế suốt **bốn hạng mục** (M45).
`longdiv` in $c\,x^k$ thẳng từ model và không bao giờ cũ được. Engine này in một
ngữ pháp rộng hơn, nhưng vẫn là ngữ pháp **đóng và biết trước**.

Quy tắc ngoặc theo độ ưu tiên: `rel` $<$ `add` $<$ `mul`/`div` $<$ `pow` $<$ nguyên
tử. Con có ưu tiên thấp hơn cha thì bọc ngoặc. Ba ngoại lệ phải viết ra vì chúng là
chỗ printer hay sai:

- `mul` có args đầu là `int(-1)` ⇒ in `−` liền, không in `(-1)\cdot`.
- Trong `add`, args dạng `mul[int(k), …]` với $k<0$ ⇒ in dấu `−` **thay cho** dấu `+`
  của phép cộng, và in $|k|$.
- Hệ số $1$ đứng trước biến thì không in — `1x` là thứ không ai viết tay.

Bề rộng đo bằng mô hình per-alphabet của riêng engine, như `longdiv` đã làm:
`estimateTextWidth` ước đều $0{,}55$ em cho mọi ký tự và cố ý ước dôi, nên số mũ
trôi ra xa và `2x ²` đọc thành hai vật rời nhau.

**Đây là phần rủi ro nhất của cả engine.** Phân số lồng phân số, luỹ thừa nhiều tầng,
và ngoặc cao bằng phân số — mỗi thứ là một bài toán bố cục riêng. §17 đâm thủng chỗ
này trước.

---

## 8. Bố cục (AL-05)

Mỗi bước một dòng, xếp dọc, khoảng cách dòng theo `UNITS_PER_CELL` (G-10 — quy ước
duy nhất mọi engine dùng chung).

- Có `rel` ⇒ mọi dòng gióng theo **dấu quan hệ**, y như `derivation` `align:
  'relation'`. Không phải thẩm mỹ: dấu $=$ thẳng cột thì mắt đọc theo cột để thấy vế
  nào đứng yên.
- Không có `rel` ⇒ gióng trái, và mỗi dòng bắt đầu bằng một dấu $=$ mờ.
- `show_rules` bật ⇒ cột phải in tên luật (hoặc `note` nếu có). Tên luật là **tên
  đã có trong bảng §4**, không phải chuỗi tự do — nên cột ghi chú cũng không nói dối
  được.
- Điều kiện tích luỹ từ AL-08 in dưới cùng, một dòng.

---

## 9. Renderer

Theo đúng hợp đồng `EngineRenderer` mà bảy engine kia đã theo:

- Mỗi nút lá được `keyed(termId, 'g', …)`, gồm chữ và một `rect` `fill: 'none'` làm
  tay cầm halo — **không** đặt `stroke` lên chính glyph, vì `stroke` trên chữ vẽ viền
  quanh từng nét và một hạng tử được nhấn thành vệt mực (bài học từ `longdiv`).
- Mỗi dòng có node mang `key = row.id`, để `[[a1|dòng thứ hai]]` neo được vào cả dòng.
- Nút trong (`add`, `mul`, `div`, `pow`) **cũng** có danh tính — neo vào $\,(x+1)^2$
  như một khối là việc thường xuyên. Hộp của nó bao trọn các con.
- `elementBoxes` đọc từ **cùng một `layout`** mà renderer dùng, không đo lại. Hai
  phép đo song song là cách chắc chắn để một ngày nào đó chạm vào $x^2$ lại chọn
  trúng $x^3$.
- `implicitElementIds` đọc từ **`layout`**, không từ model — bài học M46: hai chỗ ấy
  lệch nhau, và khai theo model thì vừa hứa chỗ neo không tồn tại vừa bỏ sót chỗ có
  thật.

---

## 10. Choreography sinh tự động (AL-06)

Engine biết `trace` và `born`, nên pha suy ra được thay vì khai tay:

| Quan hệ | Pha |
|---|---|
| `id → [id]`, đổi chỗ | `move` |
| `id → [id]`, đổi nội dung | `morph` |
| `id → [a, b]` | `move` + một bản sao tách ra |
| `[a, b] → id` | hai nút trượt vào nhau rồi hợp nhất |
| `id → []` | `hide`, kèm gạch chéo trước khi biến mất |
| `born` | `show` |

Đây là `DV-02` của backlog (`becomes` thành chuyển động), nhưng làm đúng chiều:
quan hệ được **suy**, không được **khai**.

Nhãn pha là **chữ trơn**, không LaTeX — nó đi thẳng vào `aria-valuetext`
(`lint/label-not-plain`, M46). Tên luật tiếng Việt dùng luôn làm nhãn.

---

## 11. Mặt DSL

```
expr_nodes    danh sách nút, mỗi nút { kind, degree, vars, id }
rows          số dòng
deg(e)        bậc tổng của cây con
vars_of(e)    tập biến xuất hiện
is_const(e)   không chứa biến
```

Ít, và cố ý ít: thứ đáng khai ra là **cấu trúc**, đủ cho invariant kiểu "bậc không
tăng qua mỗi bước" nói được thành biểu thức.

---

## 12. Validator built-in

| Id | Kiểm |
|---|---|
| `each-step-sound` | mọi bước rewrite qua được §6 |
| `no-vanishing-divisor` | không bước nào nhân/chia bởi thứ có thể bằng $0$ mà không khai điều kiện |
| `reaches:<expr>` | dòng cuối đồng nhất bằng `<expr>` |
| `degree-drops` | bậc giảm ngặt qua mỗi bước |

`reaches:` là validator của chế độ thử thách: *"biến vế trái thành vế phải"*.

---

## 13. Sandbox (AL-07) — và đây là chỗ engine này khác `longdiv`

`longdiv` trả về đúng `SELECT_TOOL`: phép chia dọc không có nước đi để chọn. Engine
này **có**, và nó là lý do engine đáng làm:

1. Người học chạm vào một cây con.
2. Bảng luật hiện ra, **đã lọc còn những luật áp được tại nút ấy**.
3. Chọn một luật ⇒ engine áp, thêm một dòng.

Bước 2 chính là phần dạy học: nó cho thấy **tập nước đi hợp lệ**, thứ mà học sinh
mới học đại số không nhìn ra. Và vì mọi nước đi đều do engine áp, người học **không
thể** viết ra một dòng sai — họ chỉ có thể đi đường vòng.

Nút `Hoàn tác` bỏ dòng cuối. Không có nút "gợi ý bước tiếp theo" (§4: không có bộ
giải).

Kèm `reaches:` ⇒ bài khai được `kind: "both"`.

---

## 14. Bound (NFR-P4)

```ts
export const ALGEBRA_LIMITS = {
  maxNodes: 120,        // mỗi biểu thức
  maxDepth: 6,          // độ sâu cây; phân số lồng phân số ăn 2 tầng
  maxSteps: 12,         // số dòng, khớp maxRows của derivation
  maxVars: 6,
  maxAbsInt: 9999,
  maxDegree: 64,        // bậc tổng, cận cho Schwartz–Zippel ở §6
  maxSourceLength: 200,
} as const;
```

`maxDepth: 6` không phải để tiết kiệm bộ nhớ mà vì **printer**: mỗi tầng phân số
lồng nhau làm cỡ chữ giảm và chiều cao dòng tăng, và quá sáu tầng thì không đọc được
trên iPad — thiết bị đích của NFR-P1..P3.

---

## 15. Từ chối

Như `longdiv`: vẽ một dòng chữ đỏ nói **vì sao**, không vẽ bảng nửa vời.

| Mã | Khi nào | Mức |
|---|---|---|
| `bounds/algebra-no-elements` | `elements` không rỗng | lỗi |
| `bounds/algebra-parse` | `start` sai cú pháp | lỗi |
| `bounds/algebra-rule-refused` | luật không áp được tại `at` | lỗi |
| `bounds/algebra-unknown-rule` | tên luật không có trong §4 | lỗi |
| `bounds/algebra-path` | `at` trỏ ra ngoài cây | lỗi |
| `bounds/algebra-unsound` | bước không qua §6 — **lỗi của engine** | lỗi |
| `algebra/multiplier-may-vanish` | AL-08 | cảnh báo |
| `algebra/no-steps` | `steps` rỗng, hình chỉ có một dòng | cảnh báo |

---

## 16. Cố ý **không** làm

- **Hàm siêu việt.** Không $\sin$, không $\log$, không $e^x$. Lúc cần chúng thì đây
  là dự án khác, không phải một phiên bản sau.
- **Số mũ ký hiệu.** $x^n$ với $n$ là biến. Nó kéo theo luật luỹ thừa có điều kiện và
  kéo theo cả một tầng suy luận về miền — không đáng cho họ bài đang nhắm.
- ~~**Căn thức**~~ — **đã làm** (M47b, theo yêu cầu chính chủ). Xem §21: nó không
  phải "thêm một loại nút", nó **đổi bộ kiểm**.
- ~~**Giá trị tuyệt đối**~~ — **đã làm** (M47c), chính vì cái thiếu ấy đã cắn.
- **Phần nguyên, luỹ thừa số mũ hữu tỉ, logarit.** Chưa có.
- **Hệ phương trình.** Cần một nút chứa **nhiều** quan hệ; chưa có. Đây là mảng lớn
  nhất còn thiếu của chương trình phổ thông.
- ~~**Công thức nghiệm bậc hai**~~ — **đã làm** (M47e), và **không** cần nút "hoặc":
  xem §24.
- **Bộ giải / gợi ý.** §4.
- **`simplify` một phát.** §4.
- **Đồ thị hàm số.** Miền khác, engine khác.

---

## 17. Kế hoạch dựng, xếp theo **rủi ro giảm dần**

Nguyên tắc: đâm thủng chỗ dễ chết nhất trước, và mỗi tầng phải **nhìn được bằng
mắt** trước khi sang tầng sau.

**Tầng 0 — printer (rủi ro cao nhất).** Chỉ parser + printer + renderer, không luật
nào. Chốt canh: `parse(print(parse(s))) ≡ parse(s)` trên một bộ ~200 chuỗi sinh ngẫu
nhiên, cộng **render ra PNG rồi nhìn** cỡ 20 biểu thức xấu nhất nghĩ ra được (phân số
lồng, mũ âm, ngoặc cao). Nếu tầng này không đẹp thì dừng — mọi thứ sau đều vô nghĩa.

**Tầng 1 — máy luật + kiểm đúng.** Sáu luật: `distribute`, `factor`, `collect_like`,
`eval_int`, `expand_square`, `commute`. Chốt canh: quét ngẫu nhiên `(biểu thức × luật
× vị trí)` cỡ $10^4$ lượt, mỗi lượt áp được thì phải qua §6. Đây là bản đại số của
phép quét $A = BQ+R$.

**Tầng 2 — danh tính bền + choreography sinh.** `trace`/`born`, ánh xạ id, pha tự
sinh. Chốt canh: ANC-01 toàn kho, `elementBoxes`, và **mở Player nhìn từng mốc
timeline** — M46 vừa dạy lại rằng golden mù với thời gian.

**Tầng 3 — nhóm ★ và AL-08.** Bài đầu tiên nên là *"chứng minh $1 = 2$ sai ở đâu"*,
vì nó biến chốt canh thành nội dung.

**Tầng 4 — sandbox.** Chỉ sau khi có ≥ 3 bài dùng engine ở chế độ đọc.

---

## 18. Rủi ro đã biết, chưa ai bác bỏ

1. **Printer là thứ có thể giết cả engine.** Sắp chữ toán là một ngành. Tao đánh cược
   rằng ngữ pháp bé + `maxDepth: 6` đủ để tự in; cược này chưa được kiểm. Kế hoạch
   thoát: nếu tầng 0 xấu, quay về atlas cho **nguyên tử** (biến, số) và tự in phần
   cấu trúc — mất tính "không bao giờ cũ", giữ được phần còn lại.
2. **Chuẩn hoá không sắp lại thứ tự (§3.1 luật 5) có thể làm `collect_like` yếu.**
   $3x + 2 + 5x$ có hai hạng tử đồng dạng không kề nhau. Hoặc luật phải gộp được nút
   không kề, hoặc người học phải `commute` trước. Tao nghiêng về **gộp được**, và
   choreography vẽ hai nút trượt lại gần nhau — nhưng chưa thử.
3. **Trần 12 bước có thể chật** cho một biến đổi thật.
4. **`substitute` phá bất biến danh tính**: thay $x$ bằng $2y$ thì mọi lần xuất hiện
   của $x$ sinh ra một cây con mới. `trace` diễn đạt được (một id ra nhiều id), nhưng
   animation của nó thì chưa nghĩ ra.
5. **Chưa đo được nó có dạy được gì không.** Đây là rủi ro lớn nhất và không phải rủi
   ro kỹ thuật. `PRD-07` chặn đúng vì lý do này.

---

## 19. Việc phải làm **trước** khi mở engine này

Không phải mở màn — đây là hàng đợi thật:

1. **G-C**: chính chủ soạn tay 3–5 bài, rồi đóng băng schema `1.0.0`. Kho có 86 bài,
   **chưa bài nào do chính chủ soạn**, và người duyệt cũng là người soạn.
2. **G-A**: đo NFR-P1..P3 trên iPad thật. Engine này in nhiều text node hơn mọi
   engine hiện có — đo trước thì biết trần.
3. **Bảng đo phủ cho miền đại số.** `VIZ-COVERAGE.md` đo phủ *tổ hợp*; `longdiv` và
   engine này đều đóng góp $0$ vào đó. Không có bảng đo riêng thì không có cách nào
   nói engine này đáng hay không đáng — chỉ có cảm giác.


---

## 20. Thực tế bác lại thiết kế ở chỗ nào (M47)

Ghi lại thay vì sửa lén cho khớp: một spec luôn đúng là một spec chưa ai thử.

1. **Thiếu hẳn một luật.** `expand_square` trên $(x+1)^2$ cho ra $2 \cdot x \cdot 1$
   và $1^2$ — đúng toán, nhưng không ai viết thế. Phải thêm `drop_unit`. Nó **không**
   được là chuẩn hoá lặng lẽ trong hàm dựng: tác giả gõ `x*1` thì engine không có
   quyền sửa lời họ viết, và một nút biến mất giữa hai dòng mà không luật nào giải
   thích là đúng thứ engine này sinh ra để dẹp.

2. **`replaceAt` phá dạng chuẩn tắc.** Luật trả về `add` mà chỗ thay vào nằm trong
   `add` thì sinh ra `add` lồng `add`, và từ đó **mọi đường dẫn của bước sau trỏ
   lệch** — bước tiếp theo nhắm `"1"` lại trúng một nút khác hẳn. Phải chuẩn hoá lại
   sau mỗi lần ghép (`normalize`). §3.1 nói dạng chuẩn tắc là bất biến nhưng không
   nói ai giữ nó; nay là `model`.

3. **`collect_like` làm mất danh tính hạng tử không liên quan.** Nhóm chỉ có một
   thành viên vẫn bị dựng lại bằng `withCoefficient`, tức cấp id mới cho một hạng tử
   không hề đổi — và diff biến nó thành một cặp xoá–thêm, nên $2$ trong
   $3x + 2 + 5x$ nhấp nháy trong khi lời kể nói nó đứng yên.

4. **Cảnh báo AL-08 bắn vào đúng bài lấy AL-08 làm nội dung.** §15 khai
   `algebra/multiplier-may-vanish` là cảnh báo. Bài đầu tiên của engine — nguỵ biện
   $1 = 2$ — dính ba cảnh báo, và kho chạy ở mức **0 cảnh báo**. Đã bỏ luật ấy: điều
   kiện được in **đỏ ngay trong hình**, vĩnh viễn, cho *người đọc*; một dòng vàng
   trong `validate` chỉ nói với *người soạn*, và nói sai. Tác giả muốn khẳng định bài
   mình không cần điều kiện nào thì bật validator `no-vanishing-divisor`.

5. **Ba lỗi sắp chữ chỉ thấy khi render ra PNG rồi nhìn**, không lỗi nào làm test đỏ:
   `String(-2)` cho ra gạch nối ASCII đứng cạnh dấu trừ toán học; chỉ số dưới của
   $a_1$ không hạ xuống; và $x/(y/z)$ vẽ ba dòng với hai vạch **bằng nhau**, đọc
   được thành $(x/y)/z$ — một biểu thức khác hẳn. Cái thứ ba sửa bằng cách thu nhỏ
   tầng phân số lồng, đúng như sách toán làm.

6. **Một lỗi nữa chỉ thấy trong Player, không thấy ở SVG rời.** Khoảng trắng đầu
   chuỗi `<text>` bị lớp patch DOM nuốt, nên `a = b` hiện ra `a= b`. Khoảng cách nay
   là **hình học** (`{t:'gap'}`), không phải ký tự trắng — đúng chỗ của nó, và hết
   phụ thuộc `xml:space`.

7. **Chốt canh `elementBoxes` đòi mực đo được.** Oracle bỏ qua node `fill: 'none'`
   (đúng — tay cầm không phải mực), nên khi id nằm thẳng trên hình chữ nhật halo thì
   mực duy nhất của một nút là mấy **điểm** toạ độ của `<text>`, và không hộp nào có
   tâm rơi trúng một điểm. Phải đặt danh tính lên `<g>` bọc ngoài, y như `longdiv`.

8. **Nhãn luật đo bằng sai thước.** Bảng bề ngang của engine dựng cho chữ toán;
   nhãn luật là chữ giao diện tiếng Việt, và "nhân phân phối" hiện ra "nhân phân
   phố". Chữ giao diện đo bằng `estimateTextWidth`, hàm sinh ra cho đúng việc ấy.

**Cái §18 lo nhất — printer — lại qua được ngay lượt đầu.** Rủi ro thật nằm ở những
chỗ không ai liệt kê trước: bất biến dạng chuẩn tắc, danh tính hạng tử, và một cảnh
báo đúng về nguyên tắc mà sai chỗ.


---

## 21. Căn thức (M47b) — và vì sao nó không phải "thêm một nút"

§16 khai căn thức là cố ý không làm. Chính chủ bác, và bác đúng: đại số phổ thông
thiếu căn thì hụt hẳn một mảng (rút gọn căn, trục căn thức ở mẫu, công thức nghiệm).

**Nút mới `root`** với chỉ số nguyên $\ge 2$. Không mã hoá thành $x^{1/2}$: số mũ ở
đây là số nguyên theo thiết kế, và dấu căn là một **vật thể thị giác** có bố cục
riêng — hệt lý do `div` không bị chuẩn hoá thành `mul` với luỹ thừa âm.

Cú pháp mặt: `sqrt(x)` và `root(3, x)`. Hai cái tên, không mở cửa cho hàm tuỳ ý.

### 21.1 Nó **đổi bộ kiểm**, và đó là phần đắt nhất

$\sqrt{\cdot}$ không phải hàm hữu tỉ, nên §6 không dùng được: trên $\mathbb{F}_p$ thì
$\sqrt a$ chỉ tồn tại khi $a$ là thặng dư bậc hai, và khi tồn tại thì có **hai**
nghiệm không có nhánh chính tắc. Biểu thức có căn chuyển sang **đánh giá trên
$\mathbb{R}$** với sai số tương đối $10^{-9}$; biểu thức hữu tỉ vẫn đi đường
$\mathbb{F}_p$ chính xác tuyệt đối. Hai sân, chọn theo `hasRadical`.

**Và bộ lấy mẫu phải bốc cả số âm.** Bản đầu bốc trong $[0{,}3, 4)$ cho căn bậc chẵn
luôn xác định — nhưng thế thì $\sqrt{x^2} = x$ **qua được**, dù nó sai với mọi
$x < 0$. Một bộ kiểm chỉ nhìn nửa trục số là bộ kiểm mù đúng chỗ nguy hiểm nhất của
căn thức. Nay nó bốc trong $[-4,-0{,}3] \cup [0{,}3,4]$ và bắt được:

```
sqrt(x^2) vs x → khác nhau tại x=-2.8593: 2.8593 ≠ -2.8593
```

### 21.2 Luật mới

| Tên | Cho ra |
|---|---|
| `eval_root` | $\sqrt{16} \to 4$, chỉ khi ra số nguyên |
| `pull_square_out` | $\sqrt{48} \to 4\sqrt3$, $\sqrt[3]{54} \to 3\sqrt[3]2$ |
| `root_of_product` | $\sqrt a\,\sqrt b \to \sqrt{ab}$ |
| `root_pow` | $(\sqrt[n]a)^n \to a$ |
| `rationalize` | $\dfrac{a}{\sqrt b} \to \dfrac{a\sqrt b}{b}$ |

**`pull_square_out` từ chối rút biến ra khỏi căn bậc chẵn.** $\sqrt{x^2} = |x|$, và
engine không có nút giá trị tuyệt đối. Đây là chỗ **không** ghi điều kiện: một dòng
"$x \ge 0$" làm người đọc tưởng đẳng thức đúng nếu chịu thêm giả thiết, trong khi thứ
thiếu là **một ký hiệu khác**, không phải một giả thiết. Từ chối nói đúng sự thật ấy.

### 21.3 Vẽ

Dấu căn vẽ bằng **path**, không phóng to glyph `√`: glyph có tỉ lệ cố định nên phóng
lên cho vừa một phân số hai tầng thì nét dày ra và cái móc thò xuống dưới đường chân.
Vạch trùm dài đúng bằng ruột — nó là thứ nói cho người đọc biết căn ăn tới đâu, và ăn
sai một hạng tử là đọc ra một biểu thức khác.

Hai lỗi nữa lộ ra ở lượt nhìn PNG: hệ số $1$ hiện ra thành `1√2`, và chỉ số căn dính
vào hệ số đứng trước nên $3\sqrt[3]2$ đọc thành `33√2`.

### 21.4 Một lỗi ngoài engine, phát hiện nhờ nhìn Player

`source.note` bị Player **nội suy thẳng vào chuỗi**, không qua bộ sắp chữ — nên
`$R(3,3)=6$` hiện ra đúng mười ba ký tự và `**mọi**` hiện ra kèm bốn dấu sao, ở
**21 bài** trong kho. Statement ngay phía trên thì sắp chữ đúng, nên lỗi nằm im rất
lâu: nhìn lướt thì tưởng ghi chú vốn viết thế. Sửa ở chỗ vẽ (một dòng), không bắt 21
ghi chú viết lại thành chữ trơn — ghi chú nguồn là chỗ hay có công thức nhất sau
narrative. Kèm một khẳng định e2e khoá lại.


---

## 22. Bất đẳng thức, hằng đẳng thức, $|x|$ (M47c)

Chính chủ: phủ toàn bộ đại số phổ thông. Đợt này ba mảng, và mảng đầu là **sửa lỗi
sai về toán**, không phải thêm tính năng.

### 22.1 Lỗi: nhân bất đẳng thức với số âm không đổi chiều

Kiểu dữ liệu đã có `<` và `<=` từ đầu, `mul_both_sides` áp lên chúng bình thường, và
engine cho ra:

```
x < 3   ⟶   −x < −3        unsound = 0
```

Sai trắng trợn. Không gì kêu, vì `model` **bỏ qua hẳn** nút `rel` — §6 khai nhóm ★
"bảo toàn tập nghiệm do cấu trúc" nên miễn kiểm. Câu ấy là một lời hứa chưa được
chứng minh, và nó che đúng lỗi này.

**Chữa ở hai chỗ, không một chỗ.**

- Luật: nhân bất đẳng thức với số âm thì `flipOp`. Dấu **chưa biết** thì **từ chối** —
  ở trường người ta tách trường hợp, và một điều kiện "$y > 0$" ở đây giấu mất đúng
  cái phải tách.
- Bộ kiểm: thêm `sameSolutionSet`. Biểu thức hỏi "có **đồng nhất bằng nhau** không";
  quan hệ hỏi "có **cùng tập nghiệm** không" — hai câu hỏi khác nhau, và trộn chúng là
  bỏ lọt. Nó so **giá trị chân lý** tại các điểm ngẫu nhiên, và `guard` là điều kiện
  bước ấy tự khai: điểm làm `guard` triệt tiêu bị bỏ qua. Nhờ vậy điều kiện in ra hình
  có **nghĩa vận hành** chứ không chỉ là một dòng chữ.

Bài học: mỗi lần đặc tả nói "đúng do cấu trúc nên miễn kiểm", đó là chỗ nên kiểm.

### 22.2 Giá trị tuyệt đối

Nút `abs`. Có vì thiếu nó thì $\sqrt{x^2}$ **không rút được** — M47b phải từ chối, và
từ chối một phép biến đổi có trong mọi sách giáo khoa là lỗ hổng nhìn thấy được. Nay
`pull_square_out` cho ra $|x|$.

Kéo theo: `hasRadical` thành `needsRealEval`. Cả căn lẫn $|\cdot|$ đều không sống trên
$\mathbb{F}_p$ — một cái cần khái niệm thặng dư bậc hai, cái kia cần **thứ tự**, mà
trường hữu hạn thì không có thứ tự.

### 22.3 Hằng đẳng thức và phân tích nhân tử

| Tên | Cho ra |
|---|---|
| `expand_cube` | $(a+b)^3 = a^3+3a^2b+3ab^2+b^3$ |
| `factor_diff_squares` | $a^2-b^2 = (a-b)(a+b)$ |
| `factor_cubes` | $a^3 \pm b^3 = (a\pm b)(a^2 \mp ab + b^2)$ |
| `factor_quadratic` | $x^2+bx+c = (x+p)(x+q)$, **chỉ nghiệm nguyên** |
| `fold_coefficients` | $(-3)\cdot x\cdot(-1) \to 3x$ |

`factor_quadratic` không hứa phân tích được mọi tam thức: kết quả chứa căn thì nên đi
qua công thức nghiệm, chứ không qua luật này.

### 22.4 Hai lỗi hiển thị nữa, và cả hai chỉ thấy khi mở Player

- **Dấu âm chỉ được tách khi hạng tử nằm trong một tổng.** Tích âm đứng một mình — vế
  trái của $-3x < 6$ — in ra `−1·3x`. Trước đợt này không thấy, vì tích âm luôn nằm
  trong một tổng; giải bất phương trình mới lôi nó ra.
- **Thừa số âm không đứng đầu thiếu ngoặc**: `3x·−1` đọc ra hai phép toán liền nhau.

Và một lỗi ở tầng luật: `splitCoefficient` chỉ lấy **thừa số nguyên đầu tiên**, nên
`a - 3*x` (parse ra `mul[−1, 3, x]`) có hệ số $-1$ và phần còn lại $3x$ — tức $-3x$ và
$5x$ bị coi là **không đồng dạng**. Nay nó gom mọi thừa số nguyên.


---

## 23. Nhân liên hợp và căn lồng (M47d)

Ba luật, và cả ba đều là bài trong sách giáo khoa chứ không phải tiện ích.

| Tên | Cho ra |
|---|---|
| `expand_diff_squares` | $(a+b)(a-b) \to a^2-b^2$ — chiều **khai triển** |
| `multiply_by_conjugate` | $\dfrac{c}{a+\sqrt b} \to \dfrac{c(a-\sqrt b)}{(a+\sqrt b)(a-\sqrt b)}$ |
| `denest_radical` | $\sqrt{a \pm 2\sqrt b} \to \sqrt c \pm \sqrt d$ với $c+d=a$, $cd=b$ |

**`expand_diff_squares` có riêng chứ không bắt người học `distribute` hai lần rồi
`collect_like`.** Đây là *lý do* người ta nhân liên hợp, nên nó phải là một bước có
tên, đọc ra được ý đồ — bốn bước máy móc thì kết quả đúng mà mất hẳn nghĩa.

**`rationalize` không đủ cho mẫu là tổng.** Nó chỉ xử được mẫu là một dấu căn trần;
mẫu $a+\sqrt b$ mà nhân với chính nó thì không giúp gì. Hai luật khác nhau, và giữ
riêng thì thông báo từ chối nói đúng chỗ hỏng.

**`denest_radical` không hứa khử được mọi căn lồng**, và đó là sự thật toán học chứ
không phải giới hạn cài đặt: phần lớn căn lồng **không** viết lại được bằng căn bậc
hai. Luật đi tìm cặp $(c,d)$ **nguyên** và từ chối khi không có. Dấu trừ đòi
$c \ge d$ — vế trái là một căn bậc hai nên luôn không âm, mà $\sqrt c-\sqrt d$ âm khi
$c<d$.

Bài `conjugate-and-nested-radicals` (#90) khép hai nhánh lại ở một chỗ đẹp: nhân liên
hợp cho $1/(2+\sqrt3) = 2-\sqrt3$, khử căn lồng cho $\sqrt{7-4\sqrt3} = 2-\sqrt3$ —
cùng một số, vì $(2-\sqrt3)(2+\sqrt3)=1$ và $(2-\sqrt3)^2 = 7-4\sqrt3$.

**Một lỗi hiển thị nữa:** căn làm cơ số của luỹ thừa thiếu ngoặc, nên `√3²` đọc được
thành $\sqrt{3^2}$ — số mũ đứng ngay sau vạch trùm nên mắt không biết nó thuộc về căn
hay về ruột căn. Bảng ưu tiên không bắt được vì căn xếp ngang nguyên tử, và đúng là
thế ở **mọi** chỗ khác; chỗ này là ngoại lệ phải viết ra tay.


---

## 24. Đặt ẩn phụ và công thức nghiệm (M47e)

Chính chủ đưa một dòng: $(x+1)(x+2)(x+3)(x+4)-8=0$. Thử bằng engine thì nó vướng ở
**ba** chỗ, và cả ba đều là thiếu sót thật.

### 24.1 Nhân hai đa thức phải là **một** bước

$(x+1)(x+4)$ tốn sáu bước vi mô: `distribute` ba lần, `drop_unit`, `pow_add`, rồi
`collect_like`. Học sinh viết đúng một dòng. Sáu dòng cho một phép nhân làm **chìm
mất** bước thật sự đáng nhìn của bài, và trần $12$ bước cũng không đủ cho bài nào có
hai phép nhân. `multiply_out` khai triển và thu gọn trong một bước có tên.

Nó nhận `arg` là **chỉ số các thừa số** cần nhân với nhau. Cần vì `mul` làm phẳng:
$(x+1)(x+2)(x+3)(x+4)$ là **một** tích bốn thừa số, không phải hai tích lồng nhau,
nên không có cách nào nhóm cặp bằng cấu trúc — mà nhóm cặp lại chính là mẹo của cả
họ bài này. Nhân hết ra bậc bốn là mất mẹo.

### 24.2 Ẩn phụ phải khớp **một phần** trong tổng

$x^2+5x$ nằm trong $x^2+5x+4$ mà **không phải một nút**, vì `add` làm phẳng. Khớp cả
cây thì `set_variable` gần như vô dụng — người ta hầu như luôn đặt ẩn phụ theo kiểu
ấy. Nay nó tìm một **đa tập con** các hạng tử của tổng.

Phép kiểm phải biết ràng buộc: `RuleOutcome.binding` mang $t = x^2+5x$ về cho `model`,
và `model` **thế ngược lại** trước khi so. Không có nó thì bộ kiểm thấy hai biểu thức
khác biến rồi kết tội oan.

### 24.3 Hai nghiệm, và vì sao **không** cần nút "hoặc"

Một phương trình bậc hai có hai nghiệm, còn một dòng chỉ chứa một quan hệ. Chỗ đúng
để tách hai nghiệm là **cây lời giải** (`edge_type: "case"`) — vốn đã có sẵn, và vốn
sinh ra để làm đúng việc ấy. Thêm một nút "hoặc" vào cây biểu thức là dựng lại cùng
một khái niệm ở tầng thứ hai. `quadratic_formula` nhận `arg` là `"+"` hoặc `"-"`.

Kéo theo một **hợp đồng kiểm thứ ba**. Một nhánh nghiệm **hẹp hơn** tập nghiệm gốc,
nên hỏi "cùng tập nghiệm" là hỏi sai; điều phải kiểm là nghiệm ấy **thoả** phương
trình trước đó. `RuleOutcome.verify: 'root'` khai điều đó, và `model` thay giá trị
vào rồi so.

Ba hợp đồng kiểm, khai tường minh thay vì đoán theo dáng nút:

| Hợp đồng | Câu hỏi |
|---|---|
| mặc định (biểu thức) | hai vế **đồng nhất bằng nhau** không |
| mặc định (quan hệ) | hai quan hệ **cùng tập nghiệm** không |
| `binding` | thế ngược ẩn phụ rồi mới hỏi câu thứ nhất |
| `verify: 'root'` | nghiệm ấy có **thoả** phương trình trước không |

**Biệt thức âm thì từ chối** — và lời từ chối ấy chính là câu trả lời của nhánh đó.
Bài `quartic-by-substitution` (#91) dùng đúng nó làm nội dung nhánh thứ hai.
