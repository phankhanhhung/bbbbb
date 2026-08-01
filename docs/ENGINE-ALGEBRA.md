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

Bảng trên là bản **thiết kế**. Tập luật thật đã đi xa hơn nó nhiều — **41 luật** tính
đến M50 — và hai chỗ bảng này khai sai:

- `associate` **không cài, và sẽ không cài**: dạng chuẩn tắc §3.1 làm phẳng `add`/`mul`
  nên hai cách nhóm là *cùng một cây*. Xem §26.1.
- `common_denominator` **đã cài** (M50), cùng `combine_fraction` là nghịch đảo của
  `split_fraction`.

Xem §21–§37 để biết tập luật thật — **72 luật**, xếp theo mười một lớp:

| lớp | luật |
|---|---|
| **lõi đại số** | `commute`, `distribute`, `factor`, `collect_like`, `eval_int`, `drop_unit`, `fold_coefficients`, `common_denominator`, `combine_fraction`, `split_fraction`, `cancel_common`, `factor_by_grouping` |
| **hằng đẳng thức & đa thức** | `expand_square`, `expand_cube`, `multiply_out`, `expand_diff_squares`, `factor_diff_squares`, `factor_cubes`, `factor_quadratic`, `complete_square`, `factor_power_difference`, `factor_power_sum_odd` |
| **căn & luỹ thừa** | `pow_add`, `pow_mul`, `root_pow`, `root_of_product`, `eval_root`, `pull_square_out`, `rationalize`, `multiply_by_conjugate`, `denest_radical`, `root_to_power`, `power_to_root` |
| **phương trình có điều kiện (★)** | `add_both_sides`, `mul_both_sides`, `pow_both_sides`, `abs_case`, `evaluate_at`, `set_variable`, `substitute`, `quadratic_formula` |
| **chia đa thức** | `divide_by_linear_factor` |
| **tổ hợp** (M56, §32) | `factorial_step`, `binom_to_factorial`, `binom_symmetry`, `pascal`, `binom_absorb` |
| **tổng và tích** (M57, §33) | `sum_const`, `sum_linear`, `sum_split`, `sum_shift`, `sum_expand`, `prod_telescope` |
| **số mũ ký hiệu** (M58, §34) | `pow_split` (và `pow_add`/`pow_mul` vốn đã chạy từ M49) |
| **hệ phương trình** (M59, §35) | `add_equations`, `scale_equation`, `substitute_from`, `drop_equation` |
| **tập nghiệm** (M60, §36) | `abs_to_interval`, `interval_from_factors`, `merge_intervals` |
| **hàm siêu việt** (M61, §37) | `log_product`, `log_quotient`, `log_power`, `log_change_base`, `exp_log`, `log_exp`, `log_both_sides`, `pythagorean_identity`, `double_angle`, `sum_to_product`, `product_to_sum` |

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

> Câu trên **sai**, và nó đã che đúng một lỗi: nhân bất đẳng thức với số âm mà không
> đổi chiều (§22.1). "Đúng do cấu trúc" là thứ phải chứng minh, không phải thứ để khai.
> Đây là lần đầu trong ba lần cùng một bài học lặp lại — xem §25.4.

### 6.1 Bảy hợp đồng kiểm (M50, M59)

Không có một câu hỏi chung. Mỗi bước khai **nó hứa gì**, và engine hỏi đúng câu ấy;
trộn chúng lại là bỏ lọt.

| hợp đồng | câu hỏi | ai dùng |
|---|---|---|
| mặc định (biểu thức) | hai vế **đồng nhất bằng nhau**? | mọi rewrite thuần |
| mặc định (quan hệ) | hai quan hệ **cùng tập nghiệm**? | `add_both_sides`, `mul_both_sides`, `pow_both_sides` bậc lẻ |
| `binding` | thế ngược ẩn phụ rồi mới hỏi câu thứ nhất | `set_variable` |
| `verify: 'root'` | nghiệm ấy có **thoả** phương trình trước? | `quadratic_formula` |
| `verify: 'implies'` | mọi nghiệm cũ còn là nghiệm mới? (một chiều) | `pow_both_sides` bậc chẵn |
| `verify: 'instance'` | `after` có đúng bằng `before` sau khi thế? | `evaluate_at` |

Kèm theo hai thứ mà kết quả kiểm phải phân biệt được:

- **`verified`** — đã thật sự thử được chưa. `ok: true` một mình nhập nhằng giữa "đã
  thử và khớp" với "không tìm được điểm nào để thử" (§25.4a).
- **`guard`** — điều kiện bước tự khai, **máy đọc được**. Bộ kiểm bỏ những điểm vi
  phạm nó. Trước M50 `model` dựng guard bằng cách parse lại `step.arg`: đúng tình cờ
  cho `mul_both_sides`, nơi arg *là* thừa số, và sai với mọi luật khác.

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

> **Cài ở M51**, và `move` mở khoá ở M53 sau khi lược đồ pha có `from` (CHO-12).
> Xem §27 và §29.

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
  maxDepth: 24,         // **chỉ** chặn đệ quy bệnh lý, không phải trần đọc được
  maxSteps: 12,         // số dòng, khớp maxRows của derivation
  maxVars: 6,
  maxDegree: 64,        // bậc tổng, cận cho Schwartz–Zippel ở §6
  maxSourceLength: 200,
  maxHeightCells: 3,    // đo bằng chính bộ sắp chữ sẽ vẽ nó
  maxWidthCells: 13,
} as const;
```

**Trần đọc được đo bằng kích thước vẽ ra, không bằng độ sâu cây** (M49, §25.1). Bản đầu
khai `maxDepth: 6` và nói nó đứng thay cho chiều cao dòng; nó không đứng thay được, vì
`add` tốn một tầng và tốn $0$ chiều cao còn căn lồng gần như miễn phí cả hai chiều.

`maxSteps` được ép ở **`model.ts`** từ M55, không chỉ ở `maxItems` của TypeBox — trước
đó `readAlgebra` chạy tuốt 14 bước và `checkBounds` im lặng, nên mọi đường vào không qua
ajv đều đi vòng qua nó. `maxWidthCells` cũng đo lại ở M55; xem §31.

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

- ~~**Hàm siêu việt**~~ — **đã làm** (M61). Lời khai cũ nói "lúc cần chúng thì đây là dự
  án khác"; hoá ra không, vì M56 đã trả trước cái giá đắt: mỗi hàm là **một dòng bảng**.
  Nhận xét kèm theo thì vẫn đúng và nay được thanh toán — $2^x$ vẽ được từ M49 mà không
  luật nào biến đổi nó, và muốn có thì phải có logarit. Xem §37.
- ~~**Số mũ ký hiệu**~~ — **đã làm** (M49). Lời khai cũ nói $x^n$ "kéo theo cả một
  tầng suy luận về miền — không đáng". Nửa đầu đúng, nửa sau sai: $x^n$ có mặt từ lớp
  8, và tầng suy luận về miền ấy hoá ra gói gọn được trong hai chỗ, không hơn — xem
  §25.
- ~~**Chia đa thức cho $(x-a)$**~~ — **đã làm** (M54). Câu trả lời cũ "đã có engine
  `longdiv`" đúng một nửa; xem §30.
- ~~**Căn thức**~~ — **đã làm** (M47b, theo yêu cầu chính chủ). Xem §21: nó không
  phải "thêm một loại nút", nó **đổi bộ kiểm**.
- ~~**Giá trị tuyệt đối**~~ — **đã làm** (M47c), chính vì cái thiếu ấy đã cắn.
- ~~**Luỹ thừa số mũ hữu tỉ**~~ — **đã làm** (M49). Nó là nội dung lớp 11–12; khai nó
  là "chưa có" trong khi engine nhắm toàn bộ đại số phổ thông là tự mâu thuẫn.
- **Phần nguyên.** Chưa có. (Logarit đã có từ M61.)
- ~~**Quy đồng, nhóm hạng tử, hoàn thành bình phương, bình phương hai vế**~~ — **đã
  làm** (M50, theo góp ý ngoài). Xem §26.
- **Căn bậc ký hiệu** ($\sqrt[n]{x}$ với $n$ là biến). `root.index` vẫn là số nguyên;
  ai cần thì viết $x^{1/n}$, nay đã có.
- ~~**Hệ phương trình**~~ — **đã làm** (M59). Nó không phải "thêm một nút", nó **thêm
  một hợp đồng kiểm**: `sameSolutionSet` với một hệ là phép kiểm luôn xanh. Xem §35.
- ~~**Hàm tổ hợp** $n!$, $C_n^k$, $A_n^k$~~ — **đã làm** (M56). Với một nền tảng nhắm
  Olympiad Combinatorics thì đây là lỗ **to hơn** $\log$: chúng là ký hiệu nền của cả
  môn. Xem §32 — nó không phải "thêm một nút", nó **thêm một bộ bốc điểm**.
- ~~**Ký hiệu $\Sigma$, $\Pi$**~~ — **đã làm** (M57). Nó là construct **ràng buộc biến**
  đầu tiên của engine, và cái giá nằm ở đúng một hàm: `varsOf`. Xem §33.
- ~~**Tập nghiệm / khoảng**~~ — **đã làm** (M60), và rẻ vì chỗ đặt đáp số **đã có sẵn**:
  `sys` với `join: 'or'` *là* một tuyển khoảng. Xem §36.
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

---

## 25. Lồng sâu và số mũ là **biểu thức** (M49)

Hai yêu cầu của chính chủ: nâng độ cồng kềnh hai bậc, và số mũ phải biểu diễn được cả
hữu tỉ lẫn vô tỉ. Đo trước khi thiết kế, và phép đo đổi hẳn cách làm phần đầu.

### 25.1 Trần cũ đo nhầm vật

`maxDepth: 6` đếm **mọi** tầng nút, với chú thích nói rằng nó đứng thay cho chiều cao
dòng và cỡ chữ. Nó không đứng thay được:

| | `depth` | cao/ô | chữ nhỏ nhất | trần cũ |
|---|---:|---:|---:|---|
| phân thức lồng 3 tầng | 6 | 1,69 | 2,76 | cho qua |
| kết quả nhân liên hợp (mẫu có căn lồng) | 9 | **1,66** | **4,10** | **chặn** |

Cái bị chặn **thấp hơn** và **chữ to hơn** cái được cho qua. Vì `add` tốn một tầng và
tốn $0$ chiều cao, còn căn lồng gần như miễn phí cả hai chiều. Hậu quả cụ thể:
`multiply_by_conjugate` trên `1/(1 + sqrt(3 + 2*sqrt(2)))` — bài trục căn thức bình
thường của THCS — bị từ chối với lời "cây sâu 7 tầng, quá 6".

**Bài học:** một trần đứng thay cho thứ khác thì sớm muộn cũng chặn nhầm. Nay
`readAlgebra` gọi thẳng `measure(toBox(...))` — hỏi đúng bộ sắp chữ sẽ vẽ nó — và lời
từ chối nói con số đo được (`cao 3.9 ô, quá 3`), không nói độ sâu.

### 25.2 Sàn cỡ chữ, rồi mới nâng trần

Số đo nói nút thắt của "nâng hai bậc" **không phải chiều cao mà là cỡ chữ**: căn lồng
giữ $5{,}00$ ở mọi tầng, còn phân thức lồng teo $0{,}82$ mỗi tầng và tới tầng 5 còn
$1{,}85$ đơn vị $\approx 8$px. Nâng trần mà không chạm chỗ teo chữ thì được hai tầng
không đọc nổi.

TeX có đúng **ba** cỡ rồi dừng. `typeset.ts` làm đúng thế: `SIZE_FLOOR = FONT * 0.6`
và mọi chỗ thu nhỏ đi qua `shrink(size, factor)`. Đổi lại chiều cao tăng nhanh hơn ở
tầng sâu — mà chiều cao thì nay đo được.

| tầng | 3 | 4 | 5 | 6 | 7 |
|---|---:|---:|---:|---:|---:|
| cao (ô) | 1,74 | 2,14 | 2,53 | 2,93 | 3,33 |
| chữ nhỏ nhất | 3,00 | 3,00 | 3,00 | 3,00 | 3,00 |

`maxHeightCells: 3` cho qua tới tầng **6** — trần cũ dừng ở tầng 3, nên là nâng ba
bậc. `maxWidthCells: 12` có **riêng** vì Player co cả hình cho vừa khung: một dòng quá
rộng không tràn ra ngoài mà làm *mọi thứ* nhỏ lại, nên sàn ở đơn vị scene không cứu
được. Thứ rộng nhất viết ra được trong thực tế — khai triển $(a+b)^6$ — đo $7{,}78$ ô.

### 25.3 `pow.exp` thành `Expr` — rẻ vì cây chưa bao giờ được serialize

`start` và `arg` trong scene là **chuỗi**, nên đổi kiểu nút không cần migration,
`SCHEMA_VERSION` đứng yên, và 91 bài không đụng tới một ký tự.

Chìa khoá giữ mọi luật cũ nguyên hành vi là đúng một hàm: `intExp(e)` trả số mũ khi nó
là số nguyên, `null` khi không. Mười luật giả định số nguyên hỏi qua đó và từ chối khi
`null`. `pow_add`/`pow_mul` thì **bỏ** cửa ấy và tự tổng quát hoá — $x^ax^b = x^{a+b}$
dựng bằng `add` trên cây số mũ — nhưng vẫn gộp hai số nguyên thành một số, vì $x^2x^3$
phải ra $x^5$ chứ không ra $x^{2+3}$.

Số mũ nay là con `.1` của `pow`, nên nó **neo được**: có `TermId`, tô sáng được, và áp
luật vào chính nó được (`eval_int` tại `"1"`). Đường dẫn cũ vào cơ số vẫn là `.0`.

### 25.4 Chỗ số mũ vô tỉ **không** miễn phí

Kiểu dữ liệu cho không — $\sqrt2$ vốn đã là một `Expr`. Bộ kiểm thì không, và cả ba
chỗ đều là biến thể của cùng cái bẫy đã cắn engine này hai lần.

**(a) `ok: true` là câu trả lời nhập nhằng.** `sameValueReal` bỏ những điểm biểu thức
không xác định, và khi bỏ hết thì vẫn trả `ok: true` với lời "không tìm được điểm nào
xác định". Trước đây nhánh ấy gần như không với tới; nay số mũ không nguyên đòi cơ số
$\ge 0$ trong khi bộ bốc điểm cố ý bốc cả hai dấu, nên **quá nửa số điểm bị bỏ**.
`SoundnessResult.verified` tách hai nghĩa ra, `AlgebraModel.unchecked` gom lại, và
`checkBounds` cảnh báo. Cả kho hiện ở 0, nên nó không phải một vệt vàng thường trực.

**(b) Không được bốc riêng số dương cho dễ.** Cách "sửa" hiển nhiên cho (a) là thấy số
mũ không nguyên thì chỉ bốc cơ số dương. Làm thế là dựng lại đúng lỗ M47b lùi một
tầng: $(x^2)^{1/2} = x$ sẽ **qua**, dù đúng phải là $|x|$. Giữ nguyên hai dấu, sống
với điểm bỏ đi, và để `verified` canh phần còn lại.

**(c) Có chỗ bộ kiểm *không thể* bắt, và ở đó luật phải tự chặn.**
$\sqrt[3]{-8} = -2$ trong khi $(-8)^{1/3}$ không xác định trên $\mathbb{R}$. Chỗ hai vế
khác nhau lại **đúng là** chỗ vế phải trả `null`, tức là điểm bị bỏ qua chứ không bị
kết tội — nên `sameValue` im lặng cho $\sqrt[3]x = x^{1/3}$ đi qua. `root_to_power` và
`power_to_root` vì thế từ chối chỉ số lẻ trừ khi cơ số chắc chắn không âm.

`pow_mul` có một hình dạng cùng họ: số mũ trong **chẵn**, số mũ ngoài không nguyên —
luỹ thừa chẵn giấu mất dấu rồi số mũ không nguyên lấy nhánh chính luôn dương, nên
$(x^2)^{1/2}$ ra $|x|$ chứ không ra $x$. Ở đây bộ kiểm *có* bắt được (cả hai vế cùng
xác định ở $x<0$), nhưng luật vẫn tự chặn: lời báo phải là "từ chối", không phải
"engine sai" — `unsound` mang nghĩa lỗi của engine, và tác giả chọn nhầm luật thì
không phải lỗi ấy.

> Ba lần rồi: mỗi khi đặc tả nói "chỗ này bộ kiểm lo được", phải hỏi lại **nó lo bằng
> cách nào**. M47c là "đúng do cấu trúc" (sai), M47b là "chỉ cần bốc số dương" (sai),
> và đây là "điểm vô định thì bỏ qua" (đúng, nhưng vì thế mà mù).

### 25.5 Một lỗi sắp chữ, lại chỉ thấy khi nhìn

`SUP_RISE` nâng số mũ theo **vươn lên của cơ số** — đủ khi số mũ là một chữ số. Số mũ
nay là `Expr`, nên nó có thể là phân số, và phân số thò xuống dưới đường chân của
chính nó rất sâu. Kết quả trên trang: $x^{1/2}$ vẽ ra thành $x$ đứng cạnh $\frac12$
ngang tầm mắt — đọc là "x một phần hai", không phải "x mũ một phần hai". Không test
nào đỏ; lượt nhìn PNG bắt ngay.

Sửa: nâng theo **đáy của số mũ**, `max(base.above · SUP_RISE, exp.below + base.above ·
SUP_CLEAR)`. `SUP_CLEAR = 0,22` chọn để số mũ là chữ số **không xê dịch một li**.

Cùng một hình dạng lỗi với `NEST` (M47) và `SUP_RISE` ở đây: **một hằng số hiệu chỉnh
cho một hình dạng, rồi hình dạng ấy thôi độc quyền.**


---

## 26. Tập luật mở rộng (M50)

Một danh sách góp ý từ ngoài đề nghị thêm ~20 luật. Soát bằng code thì **5 mục đã có
sẵn** — `expand_binomial_n` chính là `multiply_out`, `factor_minus_one` là `factor`
với `arg: "-1"`, `negate_sum` là `distribute`, `divide_by_linear_factor` là cả một
engine (`longdiv`, M46), `substitute_pattern` là `set_variable` — **1 mục không biểu
diễn được**, và danh sách **bỏ sót** chỗ đắt nhất. Kết quả: 32 → **41 luật**.

### 26.1 `associate` là một phép toán rỗng ở đây

Đề nghị xếp nó đầu bảng, và nó **không cài được**. Dạng chuẩn tắc §3.1 làm phẳng
`add`/`mul`:

```
(a*b + a*c) + (b*d + c*d)   →   (a*b + a*c + b*d + c*d)     gốc có 4 con
```

Hai cách nhóm là *cùng một cây*, nên không có gì để đổi. Và bất biến ấy không bỏ được:
bỏ nó là mở lại lỗi M47 #8 — `add` lồng `add` làm **mọi đường dẫn của bước sau trỏ
lệch**, một triệu chứng cực khó đọc.

Nhu cầu thì có thật, và chỗ giải quyết nằm ở tầng khác: `factor_by_grouping` nhảy
thẳng từ $ab+ac+bd+cd$ tới $a(b+c)+d(b+c)$, còn việc cho người đọc **thấy** cách nhóm
là `hold` một pha tô sáng hai nhóm trước khi đổi (CHO-11, M48). **Cách nhóm là hình
học của lời giải, không phải cấu trúc của cây.**

Cùng lý lẽ ấy áp cho `abs_to_cases`: chia nhánh là việc của cây lời giải
(`edge_type: "case"`), nên `abs_case` chỉ làm **một** nhánh và nhận `arg` là `"+"`/`"-"`
— y hệt `quadratic_formula` (§24.3).

### 26.2 Nhân tử chung phải biết số mũ

`factor_by_grouping` cần nhân tử chung của một nhóm. So thừa số bằng `same` thì $x^2$
và $x$ là hai vật khác nhau, nên nhân tử chung của $2x^2+2x$ ra $2$ thay vì $2x$ — và
$2(x^2+x) + 3(x+1)$ **không lộ ra** thừa số $(x+1)$ chung, tức hỏng đúng việc luật này
sinh ra để làm. Nên `monomial()` tách mỗi hạng tử thành hệ số + bảng *cơ số → số mũ*
(khoá là chuỗi `unparse`, tức so theo **cấu trúc** chứ không theo danh tính), rồi lấy
số mũ nhỏ nhất trên mỗi cơ số.

`complete_square` đi bằng `rat`, không bằng `number`: $2x^2+3x+1 = 2(x+\frac34)^2 -
\frac18$, mà tính bằng số thực thì $-\frac18$ ra $-0{,}12499999999999997$ và **dòng
hình sai**.

### 26.3 Bình phương hai vế là chuyện **lõi kiểm**, không phải chuyện thêm luật

Đây là chỗ danh sách góp ý viết nhẹ tay ("kèm điều kiện rõ"). Hợp đồng kiểm cho
`rel → rel` là `sameSolutionSet`; bình phương hai vế **nới rộng** tập nghiệm, nên viết
luật ấy dưới hợp đồng cũ thì engine báo `unsound` — và báo **đúng**. Phải thêm một câu
hỏi khác (§6.1), không phải thêm một hàm.

`pow_both_sides` có ba nhánh, và sự phân biệt ấy *là* nội dung đáng dạy:

| $n$ | quan hệ | kết quả |
|---|---|---|
| lẻ | bất kỳ | $x \mapsto x^n$ song ánh **tăng** ⇒ bảo toàn tập nghiệm, không mắc nợ gì |
| chẵn | `=`, `!=` | **nới rộng** ⇒ hợp đồng `implies`, ghi món nợ ra hình |
| chẵn | bất đẳng thức | **từ chối** trừ khi hai vế chắc chắn không âm — $-5<3$ mà $25>9$ |

Nhánh thứ ba bám tiền lệ `mul_both_sides` từ chối khi chưa biết dấu: ở trường người ta
tách trường hợp, và một điều kiện lấp liếm ở đây sẽ giấu mất đúng cái phải tách.

**Món nợ ghi theo hợp đồng, không theo kết quả bốc điểm.** Bản đầu treo dòng đỏ vào cờ
`widened` — "đã tìm thấy điểm mà vế sau đúng còn vế trước sai". Với **phương trình**,
tập nghiệm có độ đo $0$ nên cờ ấy gần như không bao giờ bật, tức dòng đỏ sẽ không hiện
ra ở đúng ca cần nó nhất. Chọn `verify: 'implies'` đã là lời khai "bước này một
chiều"; `widened` chỉ xác nhận thêm khi may mắn bốc trúng (thường là ca bất đẳng thức).

Và tình trạng kiểm được ghi **vào dòng đỏ ấy**, không vào `unchecked`: với phương trình
thì "không bốc trúng nghiệm nào" là chuyện **cấu trúc**, xảy ra ở mọi bước bình phương,
nên đẩy nó thành cảnh báo cho tác giả là dựng một vệt vàng thường trực mà tác giả không
sửa được — đúng cái M45 dạy đừng làm.

Răng của `implies` nằm ở **bất đẳng thức**: $x<3 \to x^2<9$ sai tại $x=-5$, và bộ bốc
điểm trúng nửa trục âm một nửa số lần. Chốt canh dựng thẳng cặp ấy để chứng minh phép
kiểm có răng, chứ không chỉ tin vào cái chặn ở luật.

Món nợ được trả bằng `evaluate_at` — thay nghiệm ứng viên vào phương trình **gốc**. Nó
đi hợp đồng `'instance'`, kiểm bằng **cấu trúc**: `substitute` đang được miễn kiểm, và
M47c dạy rằng chỗ miễn kiểm là chỗ lỗ hổng nằm, nên luật này không xin miễn.

### 26.4 Chốt canh quét ngẫu nhiên đã **không** quét gì suốt bốn hạng mục

Thêm một khẳng định độ phủ vào phép quét ngẫu nhiên của §6, và nó lộ ra ngay: **13
luật chưa từng được áp một lần nào**, trong đó 6 luật có từ trước M50. Hai nguyên nhân,
cả hai đều thuộc loại "test xanh mà không kiểm gì":

1. **Bộ sinh không với tới.** Nó không bao giờ sinh một quan hệ, nên cả nhóm ★ vô
   hình; không có `^` nên không bao giờ dựng $(A+B)^2$; không có số mũ hữu tỉ nên
   `power_to_root` cũng thế.
2. **Bốc một cặp (nút, luật) mỗi vòng.** Đo ra thì $40\,000$ vòng chỉ áp được $175$
   lần và chạm $4$ luật — xác suất trúng cả *hình dạng nút đúng* lẫn *luật đúng* cùng
   lúc là tích của hai số nhỏ.

Sửa: quét **mọi luật tại mọi nút**, thêm nhánh sinh quan hệ, và gieo thẳng một danh
sách hình dạng mà bộ sinh không với tới được. Cùng ngần ấy công, độ phủ 41/41.

Bảng `arg` cũng đổi từ chuỗi `?:` ba tầng sang một **bảng tra**: chuỗi `?:` thì luật
thứ tư lặng lẽ rơi vào nhánh mặc định, luôn bị từ chối, và không ai biết.

Và khẳng định độ phủ vừa bật lên đã bắt thêm một lỗi thật trong chính chốt canh: nó
kiểm `set_variable` bằng câu hỏi "hai vế bằng nhau" trong khi luật ấy trả về một
`binding`. Nay bỏ theo **cấu trúc kết quả** (`out.guard`, `out.binding`) chứ không theo
danh sách tên luật — danh sách tên thì luật thứ mười lại lọt.

### 26.5 Hai lỗi dấu, cả hai chỉ thấy khi nhìn PNG

Lượt nhìn bắt hai lỗi mà 2654 test không bắt, và cả hai đều sai **về toán**, không chỉ
xấu:

- $-(x-2)$ in ra `−x − 2`. Dấu trừ chỉ ăn hạng tử đầu, nên đó là một biểu thức **khác**.
  Bảng ưu tiên không bắt được vì dấu trừ ấy không phải một nút — nó là thứ `stripSign`
  vừa bóc ra, nên chỗ duy nhất biết nó tồn tại là chỗ bóc.
- $(-1)\cdot(-2)$ in ra `−−2`. `isNegative` tìm *một* thừa số âm rồi tách, nên phần còn
  lại vẫn âm. Dấu của một tích phải đọc từ **tích các hệ số**.

Lỗi thứ hai có sẵn trong kho: bài `factoring-identities` in $-1 \cdot 3x \cdot -1$
với dấu sai suốt từ M47c. Sửa xong thì 2 golden đổi, và cả hai là **sửa lỗi**.


---

## 27. Choreography sinh tự động — cài thật (M51)

§10 khai mục này từ đầu và nó **chưa từng được cài**. Số đo lúc bắt tay:

```
414 step có scene  →  20 step có choreography
 39 step engine algebra  →  0
```

Toàn bộ hình đại số trong kho là **ảnh tĩnh**: mọi dòng hiện cùng lúc, không nhịp,
không mốc dừng. Cả bộ máy timeline, nhãn pha và `hold` dựng ở M48 chưa chạm tới engine
mới nhất và lớn nhất.

### 27.1 Danh tính phải mang tên **theo dòng**

`TermId` bền qua các dòng — đó là cả thiết kế (DAT-11/12): $e_2$ ở dòng ba đúng là nút
$e_2$ của dòng một. Nhưng choreography **địa chỉ hoá bằng tên**, nên một pha chạm `e2`
chạm mọi dòng còn chứa nó. Đo trên SVG thật:

```
hàng 0: e1 e2 e3 e6 e7 e9 e10 e12 e13
hàng 1: e2 … e14 e16 …          ← e2 có ở cả hai
hàng 2: e14 e16 …
```

Với `focus` thì va chạm ấy lại **hay** — hạng tử sáng lên ở mọi chỗ nó còn sống, đúng
nghĩa "vẫn là một vật ấy". Với `show` thì hỏng hẳn: không hiện được dòng $k$ mà giữ
dòng $k-1$ nguyên. Nên mực mang tên `r{k}-{TermId}` (dấu `-` vì `ENTITY_ID_PATTERN`
không nhận dấu hai chấm), còn `TermId` vẫn nguyên trong model để `trace` nói được ai là
ai. Muốn hiệu ứng "sáng ở mọi dòng" thì pha khai nhiều đích — bộ sinh làm được vì nó
biết hạng tử sống ở những dòng nào.

Đổi được rẻ vì **không anchor nào trong kho trỏ vào tên hạng tử**: 39/39 step đại số chỉ
neo vào `row0`…`row7`, mà tên dòng giữ nguyên.

### 27.2 Vì sao **không** có `move`/`morph`

Bảng §10 xếp `move`/`morph` làm phương tiện chính. Không dùng được, và lý do thuộc về
cấu trúc chứ không phải công sức: trong một chuỗi biến đổi **mọi dòng đều ở lại trên màn
hình**. `move` hiện có nghĩa "bay **tới**" một đích rồi đậu ở đó, nên muốn hạng tử dòng
$k$ bay xuống dòng $k+1$ thì phải lấy bản của dòng $k$ đi — và dòng $k$ thủng một lỗ.

Thứ cần là "bay **từ**", tức một trường `from` hoặc một `kind` mới trên
`ChoreographyPhase` — lược đồ **dùng chung cho cả chín engine**. Không lén thêm ở đây.

Nên "hạng tử này chính là hạng tử kia" được kể bằng `focus` **đồng thời ở cả hai dòng**.
Nhờ `TermId` bền, bộ sinh biết chính xác cặp ấy — thứ mà một lớp animation suy từ chênh
lệch hai ảnh (`interpolateNodes`, CHO-10) không bao giờ biết được.

### 27.3 Nhịp suy từ **hình dạng kết quả**, không từ bảng tên luật

Mỗi bước sinh tối đa bốn pha:

| pha | đọc từ | kể gì |
|---|---|---|
| `focus` + **`hold`** | `row.at` | chỗ sắp đổi, ở dòng trên — và dừng lại đây |
| `dim` | `trace[x] = []` | cái sắp biến mất, mờ đi trước khi dòng mới hiện |
| `show` | mọi id của dòng $k$ | dòng mới hiện ra |
| `focus` | `trace` ra nhiều bản / nhiều về một / `born` | nhân bản, gộp lại, hay phần mới |

Một bảng `rule.id → kiểu chuyển động` sẽ quên luật thứ 42. Đọc cấu trúc thì luật mới có
nhịp đúng ngay hôm nó ra đời — cùng bài học với `out.guard`/`out.binding` ở M50.

`hold` đặt đúng ở pha "chỗ sắp đổi" chứ không rải đều: đó là khoảnh khắc người đọc cần
để nhìn ra *vì sao* luật áp được. Và nó không bao giờ rơi vào pha cuối (luôn còn pha
"hiện dòng" phía sau), nên bất biến của `lint/hold-at-end` được giữ — dù lint **không
soi được** timeline sinh lúc chạy, nên chốt canh cho nó phải nằm trong test engine.

Tác giả vẫn đè được: `step.choreography` luôn thắng. Engine chỉ lấp chỗ trống.

### 27.4 Một lỗi nữa chỉ lượt nhìn bắt được

Khung $0$ của timeline vừa sinh bày sẵn **tên cả bốn phép biến đổi** trong khi mới có
một dòng: nhãn luật không mang danh tính nào, nên `show` không chạm tới nó.

Và chốt canh đầu tiên tao viết cho nó **không có răng** — nó hỏi "danh tính này thuộc
dòng nào", mà lỗi chính là nhãn *không có* danh tính, nên nó bỏ qua đúng cái phải bắt.
Câu hỏi đúng: **"chữ nào còn mực ở khung 0"**, và mọi chữ ấy phải thuộc dòng một. Bản
sửa được kiểm bằng cách bỏ lại dòng `data-el` và xem test đỏ — bắt đúng ba nhãn.


---

## 28. Mực giải thích (M52)

Không làm `move`/`morph` (§27.2) thì phải bù bằng thứ khác, và thứ khác ấy hoá ra
mạnh hơn: **engine được phép vẽ mực không thuộc về biểu thức**, chỉ thuộc về lời giải
thích cho một bước. Choreography chỉ bật/tắt.

### 28.1 Cái chốt phải dựng trước: `ctx.explain`

Golden và OG card render **không qua** choreography (`renderer.toSvg(scene, ctx)`
trần), nên mực giải thích sẽ lọt vào ảnh tĩnh của cả kho.

Và `opacity: 0` **không cứu được**: `applyChoreography` **nhân** vào độ mờ sẵn có
(`base * progress`), nên mực khai $0$ thì nhân kiểu gì cũng ra $0$ — nó sẽ không bao
giờ hiện, im lặng, không lỗi, không cảnh báo. Đây đúng là loại bẫy mà cả engine này
sinh ra để bịt, nên nó phải được ghi ra.

Cửa đúng nằm ở `RenderContext.explain`: nó nói "khung này có ai kể chuyện không", tức
một sự thật về **nơi vẽ**, không phải về scene. Player bật; golden, OG, sandbox không.

### 28.2 Sáu loại mực, tất cả suy từ cấu trúc

| mực | đọc từ | nói gì |
|---|---|---|
| **màu vai** | `RuleOutcome.roles` | $(a+b)^2$: $a$ một màu, $b$ một màu, **bắc cầu qua hai dòng** vì `TermId` bền |
| **sợi nối** | `trace` | "cái này thành cái kia" — nội dung ngữ nghĩa của `move`, không cần chuyển động |
| **gạch triệt tiêu** | `trace[x] = []` | §10 hứa từ đầu, nay mới vẽ |
| **ngoặc nhóm** | `roles` nằm gọn trong dòng nguồn | cách nhóm là mẹo của bài, nên nó phải nhìn thấy được |
| **nối dòng điều kiện** | `conditions` | dòng đỏ thôi lơ lửng, nó chỉ vào chỗ nó ràng buộc |
| **dòng tự viết ra** | thứ tự đọc của hộp bao | mấy pha `show` so le, không cần primitive mới |

Màu vai là thứ rẻ nhất và nói được nhiều nhất, vì nó nói đúng cái mà một hằng đẳng
thức *là*: một khuôn, và những thứ điền vào khuôn. Bảng màu lấy đúng bộ Okabe-Ito mà
`patterns` (NFR-A1) đang dùng, nên hai kênh dự phòng cho người mù màu nói cùng một
thứ tiếng.

### 28.3 Hai tiêu chí lọc, cả hai tìm ra bằng cách nhìn

Bản đầu vẽ đủ thứ và hình thành mạng nhện. Hai lỗi, cả hai chỉ lộ ở lượt nhìn PNG:

**Sợi nối từ nút bao.** `freshCopy` khai cặp cho *mọi* nút trong cây con nó sao, kể cả
nút bao. Nối hai nút bao thì sợi chạy từ giữa cả biểu thức tới giữa cả biểu thức —
đúng về dữ liệu, vô nghĩa với mắt. Lọc: **chỉ mảnh sơ cấp** (nút không có con) mới có
sợi. Nút không con là một vật người đọc chỉ tay vào được.

**Gạch chéo qua cả dòng.** Nút được áp luật biến mất là chuyện *cấu trúc* — "chỗ này
vừa được viết lại" — chứ không phải một phép triệt tiêu, và `focus` đã nói điều ấy
rồi. `factor_by_grouping` dựng lại toàn bộ tổng, nên bản đầu gạch nát cả dòng. Lọc:
gạch **chỉ khi nút được áp luật sống sót** sang dòng sau. Lúc ấy thứ mất đi thật sự là
*bị triệt tiêu khỏi một biểu thức đang đứng yên* — đúng ca `drop_unit` bỏ thừa số $1$,
`cancel_common` rút một nhân tử.

### 28.4 Không phải đồ trang trí — đo trên cả kho

```
39 step algebra:  sợi 30 (9 step)   gạch 14 (5)   ngoặc 4 (3)
                  nối điều kiện 6   glyph có vai 60 (6 step)
```

Chín luật sinh ra mực. Nếu con số nào về $0$ thì đó là tính năng chết, và bảng này là
chỗ để phát hiện điều đó.

### 28.5 Danh tính mực giải thích **không** neo được

`explainIds` tách khỏi `drawnIds` có chủ ý: `drawnIds` là tập anchor
(`implicitElementIds`), mà mực giải thích chỉ tồn tại khi `ctx.explain` — một anchor
trỏ vào nó sẽ trỏ vào hư không ở golden và OG card. Choreography thì nhắm được, vì
Player vẽ với `explain`.


---

## 29. `move` lật chiều: `from` (M53, CHO-12)

§27.2 để lại `move`/`morph` với một lý do thuộc về cấu trúc: trong chuỗi biến đổi
**mọi dòng đều ở lại trên màn hình**, mà `move` chỉ biết "bay **tới**" rồi đậu — cho
hạng tử dòng $k$ bay xuống dòng $k+1$ sẽ đục một lỗ vào dòng $k$.

Lối ra không phải một thủ thuật trong engine mà là **một trường trong lược đồ pha**,
tức tầng dùng chung cho chín engine — nên nó là quyết định của chính chủ, không phải
việc lén nhét vào một engine.

### 29.1 `to` và `from` là hai câu chuyện, không phải hai cách nói một chuyện

- **`to`** — "vật này **rời chỗ**": nó bỏ trống chỗ cũ và đậu ở chỗ mới.
- **`from`** — "vật này **đến**": chỗ cũ vẫn còn nguyên nội dung của nó, chỉ có vật
  này là mới tới.

Chuỗi biến đổi cần đúng vế thứ hai và **không có** vế thứ nhất. Với `from` thì bản ở
dòng dưới xuất phát từ chỗ của bản dòng trên rồi về chỗ của mình, và không ai mất gì.

Chỉ đi được đường **toạ độ scene** (`boxOf`), không đi đường sao chép thuộc tính: "lúc
đầu mày đứng ở đâu" là một phát biểu về **vị trí**, mà vị trí thì chỉ toạ độ scene nói
được bằng thứ tiếng chung của mọi engine (G-10).

Hệ quả: chỉ những hạng tử **giữ nguyên danh tính** mới bay. Đó chính là lời hứa của
`TermId` bền (DAT-11/12) — "$e_2$ ở dòng ba đúng là nút $e_2$ của dòng một" — được nói
ra thành chuyển động, thay vì chỉ là một câu trong tài liệu.

### 29.2 Ba chỗ phải sửa, và một chỗ chưa từng chạy

Trường mới thì rẻ; ba chỗ quanh nó mới là việc.

- **Có tác dụng *trước* mốc.** "Bay tới từ đó" nghĩa là trước khi bay nó **đang ở đó**.
  `applyChoreography` bỏ qua pha chưa bắt đầu (trừ `show`), nên thiếu nhánh này thì vật
  đứng sẵn ở chỗ đích suốt phần đầu timeline rồi mới nhúc nhích — tức không bay đi đâu.
- **Player chưa bao giờ truyền `boxOf`.** Đường còn lại sao chép thuộc tính hình học,
  mà hai `<g>` rỗng thuộc tính thì không có gì để chép: pha chạy đủ thời lượng trong
  khi màn hình đứng im. Nghĩa là `move`/`morph` **chưa từng chạy trong Player** kể từ
  khi có CHO-01 — không test nào bắt, vì không bài nào dùng.
- **`key` nằm trên node, không trong `attrs`.** Nhét `key` vào attrs thì nó thành một
  thuộc tính SVG vô nghĩa, `node.key` vẫn rỗng, và pha nhắm vào nó không khớp gì cả.
  Lỗi ấy đã xảy ra với dòng chữ đỏ và chỉ lộ ở lượt nhìn khung 0.

### 29.3 Dòng đỏ hiện ở cuối

Điều kiện AL-08 và món nợ nghiệm ngoại lai tóm tắt **cả chuỗi**, không thuộc dòng nào
— nên không pha `show` nào của một dòng chạm tới chúng, và chúng bày ra ngay khung
đầu: đọc kết luận trước khi nghe kể. Nay chúng có danh tính (`noteId`) và một pha
`show` ở cuối timeline, cùng lúc với sợi nối chỉ vào chỗ chúng ràng buộc.

Danh tính ấy vào `explainIds` chứ không vào `drawnIds`: choreography nhắm được, anchor
thì không — cùng lý lẽ với mực giải thích (§28.5).


---

## 30. Chia cho nhân tử tuyến tính (M54)

Một bản rà soát ngoài liệt kê ~10 luật còn thiếu. Đối chiếu bằng code thì **9 trong 10
đã có từ M50**, một cái (`associate`) không cài được vì dạng chuẩn tắc làm phẳng
`add`/`mul` — và đúng **một** mục là lỗ thật.

### 30.1 "Đã có `longdiv`" đúng một nửa

Lần trước câu trả lời cho mục này là "engine `longdiv` lo rồi". Nửa sai mới quan trọng:
`longdiv` là một **scene riêng**, nên nó không giảm bậc được như một *bước bên trong*
một chuỗi đại số. Mạch chuyên toán kinh điển gãy đúng ở giữa:

```
P(1) = 0   ⟶   P = (x−1)·Q   ⟶   giải Q bậc hai
evaluate_at      (không có)      quadratic_formula
```

Đo để chắc chứ không đoán: `cancel_common` **từ chối** $(x^3-3x+2)/(x-1)$ — nó chỉ rút
thừa số **cú pháp**, không chia được.

### 30.2 Lời từ chối **chính là** nội dung

`divide_by_linear_factor` nhận ước số, chạy Horner, và **dư $\ne 0$ thì từ chối kèm số
dư**: *"dư 20 ≠ 0 — x - 3 không phải nhân tử"*. Đó không phải lỗi kỹ thuật mà là câu
trả lời cho câu hỏi của bài. Bài `cubic-by-known-root` lấy đúng chuyện ấy làm bước cuối:
đoán sai vẫn dạy được một điều.

Hệ số phải nguyên — Horner trên số thực thì một dư $10^{-16}$ được nhận là $0$, nghĩa
là engine **khẳng định một nhân tử không tồn tại**, rồi mọi bước sau xây trên lời nói
dối ấy.

Nhưng cửa ấy hiện **không với tới được**: `flatten` đã từ chối cả `rat` lẫn `div` từ
trước. Giữ lại làm lớp chắn thứ hai, và **không** viết chốt canh cho nó — một test
không với tới được nhánh nó nhắm là một test xanh vô nghĩa (bài học M48). Chốt canh
thay vào đó khẳng định **hành vi quan sát được**: hệ số hữu tỉ dừng ở "không phải đa
thức", kể cả khi hệ số ấy do chính engine sinh ra ở bước trước.

### 30.3 Ba bản chép tay thành một hàm

`quadratic_formula`, `complete_square` và luật mới đều cần đúng một câu hỏi: "hệ số của
đa thức một biến này là gì". Trước M54 nó nằm ở hai chỗ dưới dạng hai bản chép tay gần
giống nhau; thêm bản thứ ba là mời một chỗ lệch đi mà không ai nhìn. Nay là `univariate`,
trả chuỗi khi từ chối để phía gọi tự gói vào ngữ cảnh của nó.

### 30.4 Còn lại gì

`associate` **sẽ không có** (§26.1). Ngoài nó, tập luật 42 phủ hết danh sách rà soát.
(M56 nâng lên **47** với năm luật tổ hợp — xem §32.)

---

## 31. Dọn nhà trước khi mở ngữ pháp (M55)

Ba lượt review — của tao, của người ngoài, và lượt đối chiếu bằng code — hội tụ vào một
câu: engine khoẻ ở việc viết lại biểu thức cục bộ, bất lực ở chỗ **ngữ pháp không có nút
để biểu diễn**. Kế hoạch mở ngữ pháp (hàm tổ hợp, $\Sigma$, hệ phương trình, hàm siêu
việt) nằm ở M56–M61. M55 là lượt dọn trước, và nó đóng đúng những lỗ mà lượt soát bằng
probe **đo được** chứ không đoán ra.

### 31.1 Đường dẫn theo vị trí **dịch chỗ**, và chỗ chữa nằm ở đầu kia

Đo được: $|x-1| + |x-2| = 3$, chạy `abs_case` tại `L.0`, thì dấu $|\cdot|$ thứ hai
**nhảy từ `L.1` sang `L.2`**. Vì luật trả về `x + (-1)`, một `add`, và nó bị làm phẳng
vào tổng cha — mọi chỉ số sau nó lùi một nấc.

Bất biến làm phẳng **không bỏ được**: bỏ nó là mở lại lỗi M47 #8 (`add` lồng `add` ⇒ mọi
đường dẫn của bước sau trỏ lệch). Nên chỗ chữa ở đầu kia — cho `at` trỏ bằng **nội dung**:

```json
{ "rule": "abs_case", "at": "@abs(x - 2)", "arg": "+" }
```

Tiền tố `@` nghĩa là "cây con nào khớp mẫu này". Từ chối khi không khớp chỗ nào, và khi
khớp **nhiều hơn một** chỗ thì nói ra *có mấy chỗ và ở đâu*, để tác giả chuyển sang đường
dẫn được ngay. Cả họ bài từ hai dấu trị tuyệt đối trở lên nay soạn được.

**Không** cho trỏ bằng `TermId`. Id do `Minter` cấp theo thứ tự dựng cây; tác giả không
đoán được nó, nên id-trong-`at` là một đường cụt đội lốt tính năng.

Một chi tiết dễ bỏ sót: `row.at` phải giữ đường dẫn **đã giải**, không giữ chuỗi tác giả
gõ — `layout` và `choreography` đưa thẳng nó vào `nodeAt`, mà `nodeAt` không hiểu `@`.

### 31.2 Một trần được khai mà **không được ép**

`readAlgebra` chạy đủ 14 bước và `checkBounds` trả về **không một issue nào**. Thứ duy
nhất chặn `maxSteps` là `maxItems` của TypeBox, tức chỉ chặn nội dung đi qua ajv.

Mọi trần khác — `maxNodes`, `maxDegree`, `maxHeightCells`, `maxWidthCells` — đều ép ở
`model.ts`. Riêng cái này lệch, và lệch **âm thầm**: không có triệu chứng nào cho tới lúc
một đường vào khác xuất hiện. Đây là lớp lỗi khó thấy nhất của kho: một luật viết ra rồi
để đó, y như quy ước G-10 trước khi `render/scale.ts` thi hành nó.

### 31.3 Trần bề ngang là một **số chọn**, không phải một số đo

`maxWidthCells: 12` đặt ở M49 theo cảm tính. Hậu quả đo được:

| biểu thức sau khi khai triển | rộng |
|---|---:|
| $(a+b+c)^2$ | 6,16 ô |
| $(a+b)^6$ | 9,88 ô |
| $(a+b)^7$ | 11,75 ô — lọt |
| **$(a+b+c)^3$** | **12,55 ô — bị từ chối** |

Một hằng đẳng thức sách giáo khoa bị chặn còn một thứ hiếm hơn nhiều thì qua. Thứ tự ưu
tiên ngược với thực tế dạy học.

Cách sửa **không** phải nâng lên 13 cho vừa một bài, mà là hỏi trần này thật ra canh cái
gì. Câu trả lời nằm ở `render/scale.ts`: Player **co** hình cho vừa pane và không bao giờ
giãn, nên một dòng quá rộng không tràn ra ngoài — nó kéo *mọi* step của cùng bài nhỏ lại,
vì hệ số co dùng chung. Tức trần này canh **số pixel cuối cùng của chữ**, và đo được:

| rộng (ô) | ĐT 360px | ĐT 390px | tablet | desktop |
|---:|---:|---:|---:|---:|
| 12 | 13,7px | 14,9px | 22px | 22px |
| **13** | **12,6px** | 13,8px | 22px | 22px |
| 14 | 11,7px | 12,8px | 22px | 22px |

$13$ là bề rộng cuối cùng còn giữ chữ trên $12$px ở màn hẹp nhất. Nó cho qua
$(a+b+c)^3$ và $a^9-b^9$ đã phân tích ($12{,}32$), vẫn chặn $(a+b)^8$ ($13{,}62$). Cả kho
đo tối đa $7{,}06$ ô, trung vị $2{,}30$ — trần này không chạm nội dung thật, nó là hàng
rào cho thứ **luật** có thể sinh ra.

Kèm theo là một chú thích sai bị gỡ: `model.ts` nói *"công thức quá rộng **tràn** chứ
không co lại"* — ngược hẳn với `scale.ts`. Một chú thích sai ở đúng chỗ biện minh cho một
con số thì tệ hơn không có chú thích.

### 31.4 Hai lỗ mà review ngoài bắt trúng

**`factor_quadratic` chỉ nhận hệ số dẫn đầu $=1$.** $2x^2+7x+3$ bị từ chối — nội dung lớp
9. Cách tìm mới là vét cạn **xác định** trên ước của $a$ và của $c$: $p_1 \mid a$,
$q_1 \mid c$, rồi kiểm hạng tử giữa. Mọi phép so trên số nguyên, không có sai số nào để
lọt. Thứ tự duyệt cố định nên nhánh $a=1$ cho ra **đúng cặp cũ** — và ở đây có một bài
học nhỏ: bản đầu dựng cây theo thứ tự khác, hình **giống hệt từng toạ độ** mà hai golden
vẫn đổi, vì `data-el` *là* `TermId`. Cấp danh tính cho cả hai biến trước rồi mới dựng thì
diff về không.

**`rationalize` chỉ trục được căn bậc hai.** $\frac{1}{\sqrt[3]2}$ bị từ chối, dù công
thức là cùng một ý ở mọi bậc: $\frac{a}{\sqrt[n]b} = \frac{a\sqrt[n]{b^{\,n-1}}}{b}$. Hai
nhánh dựng cây tách riêng **cố ý** — nhánh bậc hai giữ nguyên từng chữ của bản cũ, kể cả
thứ tự cấp danh tính. Mẫu **nhị thức** chứa căn thì từ chối có lời và chỉ sang
`multiply_by_conjugate`, thay vì im lặng rơi vào "mẫu không chứa căn".

### 31.5 Chốt canh, và phép thử răng

14 chốt canh mới. Rồi bẻ từng chỗ đã sửa và xem test có đỏ không — cả 7 chỗ đều bị bắt.
Đây không phải nghi thức: M48 đã dạy rằng một test không với tới được nhánh nó nhắm là
một test xanh vô nghĩa, và cách duy nhất biết được là **thử làm hỏng**.

---

## 32. Hàm tổ hợp, và bộ bốc điểm thứ ba (M56)

Engine nhắm Olympiad Combinatorics mà `n!` chết ở parser. Đây là hạng mục đầu tiên của
loạt mở ngữ pháp (M56–M61), và nó dựng hai thứ mà mọi hạng mục sau đứng lên: **một biến
thể nút cho cả họ hàm**, và **một bộ bốc điểm mới**.

### 32.1 Một biến thể, một bảng — vì kiểu nút mới đắt

Mỗi kiểu nút mới phải đi qua đúng sáu chỗ: `expr` (biến thể, `children`, `withChildren`,
`same`, `totalDegree`, `varsOf`, `needsRealEval`), `parse` (nhánh `atom`, `PLAIN_PREC`,
`toPlain`, `unparse`), `typeset` (biến thể `Box`, `measure`, `place`, `toBox`, `PREC`),
`check` (`evalAt`, `evalReal`), `rules`, và bảng ưu tiên. `layout` với `choreography` thì
**miễn phí** — chúng làm việc trên hộp và `TermId`, không trên `Expr['k']`.

Dựng `fact`, `binom`, `perm`, rồi sau này `log`, `sin`, `exp` thành sáu biến thể là trả
cái giá ấy sáu lần. Nên trả **một lần**:

```ts
| ({ readonly k: 'fn'; readonly name: FnName; readonly args: readonly Expr[] } & WithId)
```

`FnName` là union **đóng**, còn mọi thứ riêng của từng hàm — arity, cú pháp mặt, cách in
chữ trơn, cách tính — nằm ở bảng trong `functions.ts`. Hàm thứ bảy là **một dòng bảng**.
Đây là lý do M56 đứng trước M61 dù M61 mới là thứ được gọi tên.

Cách **vẽ** thì cố ý không ở bảng: nó cần kiểu `Box` của `typeset.ts`, mà `typeset` đã
import từ `expr` — để cách vẽ vào bảng là dựng một vòng import.

### 32.2 `C(` không mơ hồ, và lý do là một quyết định cũ

`C` và `A` cũng là tên biến hợp lệ. Không mơ hồ, vì engine **cấm nhân ngầm** từ §3.3:
một biến không bao giờ đứng sát dấu ngoặc mở, nên `C(` chỉ có thể là lời gọi hàm. Một
ràng buộc đặt ra vì lý do khác hẳn, trả cổ tức ở đây.

Chỗ **thật sự** mơ hồ là dấu `!`, vì `!=` là toán tử quan hệ. Quy tắc: `!` chỉ là giai
thừa khi ký tự ngay sau **không** phải `=`, và không bỏ qua khoảng trắng trước nó. Hệ quả
phải nói ra: `n!=3` đọc thành $n \ne 3$; muốn "$n! = 3$" thì viết dấu cách.

### 32.3 Bộ bốc điểm thứ ba — và vì sao nó là chốt canh, không phải tiện nghi

Hai bộ kiểm cũ **đều chết** với giai thừa:

- $\mathbb{F}_p$: $n!$ với $n$ là một thặng dư ngẫu nhiên cỡ $10^9$ là câu vô nghĩa.
- Thực: bốc trong $[-4,-0{,}3]\cup[0{,}3,4]$, toàn số **không nguyên** ⇒ `fact` trả
  `null` ở **mọi** điểm.

Đo bằng cách tắt bộ nguyên đi rồi chạy lại cả năm luật:

```
factorial_step       unchecked=1  không tìm được điểm nào xác định
binom_to_factorial   unchecked=1  không tìm được điểm nào xác định
pascal               unchecked=1  không tìm được điểm nào xác định
binom_absorb         unchecked=1  không tìm được điểm nào xác định
```

Tức **vàng thường trực trên mọi bài tổ hợp** — đúng thất bại M45, và là cách nhanh nhất
để người ta ngừng đọc mọi cảnh báo. Bộ kiểm phải **kiểm được**, không chỉ phải trung
thực; trung thực một mình là chưa đủ.

Nên `sameValueInteger` bốc số nguyên trong $[0, 12]$: đủ nhỏ để $12!$ còn chính xác từng
đơn vị (quá $18!$ thì `number` làm tròn, và lúc ấy phép so sẽ báo "khớp" cho hai thứ
không bằng nhau), đủ rộng để hai đa thức khác nhau bậc $\le 12$ không trùng nhau ở mọi
điểm. Vẫn tính bằng `evalReal` chứ không bằng một bộ đánh giá song song — điểm thì nguyên
nhưng biểu thức quanh nó vẫn có thể có căn và phân số, và hai bộ đánh giá là hai chỗ để
lệch nhau.

`sameValue` nay hỏi **ba** sân, và thứ tự hỏi quan trọng: số nguyên → thực → $\mathbb{F}_p$.
$C_n^k$ *có* tính được trên $\mathbb{F}_p$ khi $n$ là hằng, nhưng đường ấy im lặng đúng ở
chỗ nguy hiểm nhất — $n$ ký hiệu.

Nó có răng thật, và răng nói bằng số cụ thể:

```
pascal (bẻ thành C(n−1,k−1) + C(n−1,k+1)):
  khác nhau tại k=6, n=12: 924 ≠ 792
```

**Không có hợp đồng kiểm thứ bảy.** Sáu hợp đồng của §6.1 giữ nguyên; thứ thêm vào là một
*sân*, không phải một *câu hỏi*. Phân biệt ấy đáng giữ, vì cùng bộ bốc điểm này sẽ phục
vụ $\Sigma$ (M57) và số mũ ký hiệu (M58) mà không phải khai thêm gì.

### 32.4 Chỗ quét bỏ qua `guard` là một lỗ im lặng

Phép quét ngẫu nhiên trước M56 **bỏ nguyên bước** khi luật khai `guard`, với lý lẽ "luật
chỉ hứa đúng trong điều kiện của nó". Lý lẽ đúng, kết luận sai: `sameValue` **nhận được**
`guard` và tự bỏ những điểm vi phạm. Bốn trong năm luật M56 đều có `guard`, nên chúng sẽ
được đếm là "đã quét" trong khi giá trị chưa ai kiểm.

Sửa thành truyền `guard` vào bộ kiểm. Thử răng bằng cách bẻ `factorial_step`: phép quét
bắt được, và bắt ở cả những biểu thức sinh ngẫu nhiên sâu năm tầng. Chỗ bỏ qua là chỗ lỗ
hổng nằm (M47c).

### 32.5 Sắp chữ: $C_n^k$ phải **chồng cột**

Lối Việt Nam: chỉ số dưới $n$, số mũ trên $k$. Không ghép được từ `sup` và `shift` sẵn có
— hai tầng ấy phải chồng cột với nhau, tức bề ngang của cả cụm là `max` chứ không phải
tổng. Ghép hai hộp cũ cho ra $C_n{}^k$, đọc ra một thứ khác. Nên có hộp `subsup`.

Ba lỗi hiển thị, và cả ba chỉ lộ ở **lượt đo và lượt nhìn**, không ở test:

1. **Hai tầng đụng nhau ở sàn cỡ chữ.** `supRise` và `subDrop` mỗi cái chỉ nhìn *một*
   tầng nên không biết tầng kia ở đâu. Ở cỡ thường thì thừa chỗ; $C_n^k$ lồng trong chỉ số
   dưới của một $C_n^k$ khác đẩy cả hai xuống `SIZE_FLOOR` và chúng chồng $0{,}07$ đơn vị.
   Phải có một chỗ nhìn **cả hai** rồi đẩy đều ra hai phía.
2. **Dấu `!` không có trong bảng bề ngang** nên rơi vào $0{,}5$ em, dôi $0{,}22$ — đủ để
   $n!^2$ vẽ ra số mũ trôi khỏi dấu `!`, đọc thành hai vật rời nhau.
3. **Chữ hoa rộng hơn chữ thường**, mà bảng ước đều $0{,}5$ em cho mọi chữ cái. $C$ trong
   KaTeX_Main rộng $0{,}722$ em: ước thiếu đẩy cả hai tầng chỉ số lùi vào trong, và trên
   trang thì số mũ **đè lên** chữ $C$. Suốt bốn hạng mục không ai thấy, vì mọi biến của
   kho đều là chữ thường — lỗi ngủ cho tới khi một chữ hoa làm **gốc** của một cụm.

Không golden nào đổi vì cả kho chưa có biểu thức nào chứa biến viết hoa.

### 32.6 Điều kiện hiển nhiên đúng thì **im**

$C_5^2$ khai "$0 \le 2 \le 5$" là một dòng đỏ nói một chuyện ai cũng thấy. Bỏ khi tính ra
được và thoả; có biến thì luôn in, vì engine không biết miền. Tiền lệ có sẵn ở
`rationalize`, và lý lẽ là M45: chữ đỏ thường trực vô ích giết chữ đỏ thật.

Ngược lại, `binom_symmetry` **không** khai điều kiện nào — nó đúng ở mọi $k$ nguyên nhờ
quy ước $C_n^k = 0$ ngoài $[0,n]$, vì ở đó cả hai vế cùng bằng $0$. Quy ước ấy cũng là
thứ làm `pascal` đúng tại $k = 0$.

---

## 33. $\Sigma$, $\Pi$, và construct ràng buộc biến đầu tiên (M57)

### 33.1 Cả hạng mục gói trong một hàm

`varsOf`. Trước M57 nó là ba dòng — "mọi nút `var`" — vì engine không có construct nào
ràng buộc tên. $\sum_{k=1}^{n} k$ đổi chuyện đó, và bỏ sót chỗ trừ làm **hai** thứ hỏng
cùng lúc, cả hai đều im lặng:

- `maxVars` đếm thừa, nên một bài hai ẩn bị từ chối vì "quá 6 biến";
- bộ kiểm bốc một giá trị cho $k$ rồi truyền vào `evalReal`, nơi vòng lặp của `big`
  **đè lên nó**. Giá trị bốc ra bị bỏ đi lặng lẽ, và phép kiểm **vẫn xanh** — nhưng nó
  xanh vì một lý do khác với lý do người ta tưởng.

Cái thứ hai là loại lỗi tệ nhất kho này có thể mắc, vì không chốt canh hành vi nào bắt
được: phép quét ngẫu nhiên chạy qua và không kêu gì. Đo được: bẻ đúng dòng trừ ấy thì
**chỉ** hai chốt canh khai thẳng về phạm vi đỏ lên, còn 132 chốt canh còn lại xanh hết.
Đó là lý do hai chốt canh ấy tồn tại và tại sao chúng khẳng định `varsOf` chứ không
khẳng định một hệ quả của nó.

Ba chỗ phải đúng, và cả ba đều là chỗ dễ sai:

| | |
|---|---|
| **thân** | trừ `v` ra |
| **hai cận** | **không** trừ — $\sum_{k=1}^{k}$ thì cận trên là một $k$ khác, tự do |
| **lồng nhau** | mỗi tầng ràng buộc tên của nó, không phải một tập chung |

Trùng tên thì **từ chối ở parser**: $\sum_k$ lồng trong $\sum_k$. Đổi tên tự động là một
mẹo, và mẹo ở tầng ngữ pháp là chỗ lỗi nằm — tác giả gõ `k`, đọc lại thấy `k'` mà không
hiểu vì sao, còn `at` của bước sau thì trỏ vào một cái tên chưa từng gõ.

Kèm theo là `substituteVar` chuyển từ `model.ts` ra `expr.ts` và học phạm vi: nó không
thò vào thân một $\sum$ đã ràng buộc chính tên ấy. Từ M57 cả `rules` lẫn `model` đều cần
nó, và hai bản chép tay thì bản thứ hai sẽ quên đúng dòng phạm vi này.

### 33.2 Bộ bốc điểm của M56 dùng lại **nguyên si**

$\sum$ chỉ khai được khi hai cận là số nguyên — đúng điều kiện mà `sameValueInteger` của
M56 cung cấp. Nên M57 **không khai thêm gì**: một dòng trong `needsIntegerEval`, hết.

Đây là cổ tức của quyết định ở §32.3: thứ M56 thêm là một **sân**, không phải một **câu
hỏi**. Sáu hợp đồng kiểm của §6.1 vẫn là sáu.

Khoảng **rỗng** cho $0$ với tổng và $1$ với tích. Quy ước chuẩn, và nó có việc thật:
`sum_split` tại $m = b$ sinh ra đúng một khoảng rỗng, nên nếu chỗ này trả `null` thì luật
ấy hoá ra không kiểm được.

### 33.3 `guard` phải nhận **số nhiều** — và ca buộc nó là `sum_split`

Tách $\sum_{k=a}^{b}$ tại $m$ chỉ đúng khi $a-1 \le m \le b$. Hai bất đẳng thức, mà
`RuleOutcome.guard` chỉ nhận một. Engine bắt được ngay ở lượt chạy thử:

```
sum_split tại "" của Σ(k=1..n) k: khác nhau tại n=1: 1 ≠ 6
```

Ở $n=1$ vế trái là $1$, còn vế phải là $\sum_1^3 + \sum_4^1 = 6 + 0$.

Gói hai điều kiện vào một biểu thức — chẳng hạn $(b-m)(m-a+1) \ge 0$ — thì **đúng tình
cờ**: nó cũng đúng khi cả hai thừa số cùng âm. Mã hoá hai điều kiện thành một là đúng
loại mẹo engine này tránh ở mọi chỗ khác, nên `Guard` thành `Guards = Guard | Guard[]`,
và `guardHolds` đòi **mọi** điều kiện cùng thoả.

Rẻ hơn tưởng: `model.ts` chỉ chuyển tiếp, còn `check.ts` gom hai kiểu về một qua
`guardList()`.

### 33.4 `sum_expand` là cầu nối, không phải tiện nghi

Không có nó thì $\Sigma$ là một **ốc đảo**: cả 47 luật cũ đều không áp được vào một nút
`big`. Nó viết hết các hạng tử khi hai cận là số, và từ đó mọi thứ trở lại là `add`
thường.

Trần sáu hạng tử — không phải vì sáu là con số thiêng, mà vì bảy trở lên thì dòng đụng
trần bề ngang, và **để trần kích thước từ chối thì đúng phân công hơn** là dựng thêm một
trần ở đây. Cùng lý lẽ với tầng C của M50.

### 33.5 `prod_telescope` nhận dạng bằng cấu trúc

$\prod_{k=a}^{b} \frac{f(k+1)}{f(k)} = \frac{f(b+1)}{f(a)}$. Nhận dạng bằng cách hỏi
"tử có đúng bằng mẫu sau khi thay $k \to k+1$ không" — một phép so cấu trúc, xác định,
không có ca nào nó "gần đúng". $\frac{k+2}{k}$ bị từ chối ngay dù nhìn rất giống.

### 33.6 Vẽ

Hộp `big` riêng, không ghép được từ `subsup`: hai cận nằm **trên và dưới** ký hiệu chứ
không bên phải, nên bề ngang là $\max(\text{glyph}, \text{cận trên}, \text{cận dưới})$
còn thân đứng bên phải.

`PREC['big'] = 0` — lỏng nhất bảng, vì ký hiệu tổng ăn tới hết thân của nó. Hệ quả:
$\sum f + g$ luôn vẽ ra $\left(\sum f\right) + g$. Hơi nặng mắt, nhưng $\sum(f+g)$ và
$\sum f + g$ là hai biểu thức khác nhau mà **không dấu gộp nào** trong ký hiệu $\sum$
phân biệt được chúng — ngoặc là thứ duy nhất làm việc ấy.

Đo chiều cao trước khi chốt, không ước lượng: $\Sigma$ trơn cao $1{,}51$ ô; $\Sigma$ chồng
$\Sigma$ trong một phân số — ca xấu nhất viết ra được — cao $2{,}74$ ô. Trần là $3$, nên
lọt, và lọt có biên chứ không sát nút.

---

## 34. Số mũ ký hiệu, và dấu ba chấm (M58)

### 34.1 Soát trước khi viết — và ba phần tư việc đã xong sẵn

Kế hoạch M58 liệt kê năm món. Lượt soát bằng probe cho thấy **hai trong số đó đã chạy**
từ M49, vì `pow.exp` là `Expr` nên chúng không bao giờ giả định số nguyên:

| | |
|---|---|
| `x^m · x^n → x^{m+n}` | `pow_add` — chạy sẵn |
| `(x^m)^n → x^{mn}` | `pow_mul` — chạy sẵn |

Viết lại chúng là thêm hai luật trùng nghĩa vào một bảng đã 53 dòng. Chốt canh của M58
khẳng định thẳng rằng chúng chạy, để lần sau không ai viết lại.

Thiếu là **chiều ngược**: `pow_split` ($x^{m+n} \to x^m x^n$).

### 34.2 $\Sigma$ trả nốt món nợ của dấu ba chấm

$a^n - b^n = (a-b)\left(a^{n-1} + a^{n-2}b + \dots + b^{n-1}\right)$ với $n$ ký hiệu thì
nhân tử sau cần một dấu ba chấm, và engine **không có nút cho dấu ba chấm**. Trước M57
đó là lý do `factor_power_difference` từ chối mọi bậc ký hiệu.

Nhưng dấu ba chấm ấy *là* một tổng có chỉ số:

$$a^n - b^n \;=\; (a-b)\sum_{k=0}^{n-1} a^{k} b^{\,n-1-k}$$

Viết thế thì nó có ngữ nghĩa, **kiểm được** (bộ bốc điểm số nguyên thay $n$ bằng $1..12$
rồi khai tổng ra), và không phải dựng thêm kiểu nút nào. Đây là toàn bộ lý do "nút dấu ba
chấm" nằm ở mục *cố ý không làm* — không phải vì nó khó, mà vì có thứ tốt hơn thay được.

Hai chi tiết nhỏ mà bỏ qua thì lệch:

- **$x^n - 1$** phải nhận được: $1$ **là** $1^n$, và đó là ví dụ kinh điển nhất của cả
  họ. Không nhận thì luật từ chối đúng bài người ta mở sách ra để tìm. Nhân tử thứ hai
  khi ấy in thành $\sum x^k$, không phải $\sum x^k 1^{n-1-k}$ — không dựng nút thừa
  **khác** với rút gọn lén: ở đây không có gì bị bỏ đi.
- **Chỉ số mới không được bắt một biến đang có.** $a^k - b^k$ mà lấy luôn tên `k` làm
  chỉ số thì biến tự do $k$ bị ràng buộc mất — đúng lỗi phạm vi mà M57 dựng cả `varsOf`
  để tránh. `freshIndex` chọn tên chưa dùng.

`factor_power_sum_odd` thì **từ chối** khi bậc là ký hiệu, và lời từ chối là nội dung:
tính chẵn/lẻ của $n$ quyết định hẳn câu trả lời — $n$ lẻ phân tích được, $n$ chẵn thì
không ($a^2+b^2$) — mà engine không biết chẵn lẻ của một ký hiệu. Đúng tiền lệ
`pow_both_sides`: chỗ nào tính chẵn lẻ đổi kết luận thì chỗ ấy phải từ chối.

### 34.3 Một lỗi ngủ từ M47b

`substitute` duyệt cây bằng một `switch` viết tay liệt kê `add`/`mul`/`pow`/`div`/`rel`,
rồi `default: return e`. Nên nó **im lặng bỏ qua** `abs`, `root`, và (từ M56/M57) `fn`,
`big`. Hậu quả đo được:

```
sqrt(x) + 1   ✗ không thấy biến "x" trong cây con này
abs(x) + 1    ✗ không thấy biến "x" trong cây con này
x + 1         ✓ (4 + 1)
```

Lời từ chối không chỉ sai, nó **nói ngược sự thật**: biến nằm ngay đó. Lỗi này có từ
M47b — năm hạng mục — và không ai gặp vì chưa bài nào thế vào trong một dấu căn. M57 làm
nó lộ ra vì `big` là kiểu nút thứ tư bị bỏ quên.

Chữa bằng `children`/`withChildren`, vốn **đầy đủ theo kiến trúc** nên không quên được,
cộng một dòng phạm vi cho `big`. Bài học chung: một `switch` viết tay trên `Expr['k']` là
một danh sách phải bảo trì tay, và mọi danh sách phải bảo trì tay đều sẽ cũ. Kiểu
exhaustive của TypeScript bắt được các `switch` **có kiểu trả về đầy đủ**; nó không bắt
được một `default` nuốt mọi thứ.

### 34.4 `pow()` chuẩn hoá, nên mọi chỗ dựng cây phải đi qua nó

`replaceIndex` (M57) dựng lại cây bằng `withChildren`, tức đi vòng qua hàm dựng. Kết quả:
`sum_expand` trên $\sum_{k=0}^{3} x^k$ cho ra `x^0 + x^1 + x^2 + x^3` — đúng về giá trị,
mà hai hạng tử đầu là thứ không ai viết.

`pow()` vốn chuẩn hoá $x^1 \to x$ và $x^0 \to 1$, và mọi luật khác đều đi qua nó. Cho
`replaceIndex` đi qua nó nữa thì ra `1 + x + x^2 + x^3`. Danh tính không mất gì: cây ở đó
đã là bản sao mới toanh, sắp thành hạng tử của dòng sau.

---

## 35. Hệ phương trình, và hợp đồng kiểm thứ bảy (M59)

### 35.1 Hệ là **một `Expr`**, không phải một dòng chứa nhiều `Expr`

```ts
| ({ readonly k: 'sys'; readonly join: 'and' | 'or'; readonly rels: readonly Expr[] } & WithId)
```

`children` là các quan hệ, nên `"0"` chỉ vào phương trình đầu và `"0.L"` vào vế trái của
nó — **toàn bộ máy luật, `replaceAt`, danh tính và choreography chạy nguyên si**. Phương
án kia ("một dòng chứa nhiều biểu thức") bắt sửa `model`, `layout`, `choreography` và mọi
luật; phương án này sửa đúng sáu chỗ như mọi kiểu nút khác.

`join` khai từ M59 dù M59 chỉ dùng `'and'`: tập nghiệm bất phương trình (M60) cần `'or'`,
và thêm một trường vào một nút đã xuất bản thì đắt hơn khai sẵn.

Dấu **chấm phẩy** ngăn các phương trình, vì dấu phẩy đã thuộc về `root(3, x)`, `C(n, k)`
và `sum(k, 1, n, …)`. Hệ chỉ ở gốc và không lồng nhau: một hệ của các hệ không phải thứ
ai viết, và cho phép nó là mở một chiều lồng mà không luật nào biết đi trong đó.

### 35.2 `sameSolutionSet` là một phép kiểm **luôn xanh** — và đây là bằng chứng

Bốc một điểm $(x,y)$ ngẫu nhiên thì cả hệ trước lẫn hệ sau đều **sai**, hai bên "đồng
ý", `agree` tăng. Chốt canh của M59 khẳng định thẳng chuyện đó bằng một hệ **sai hẳn**:

```ts
sameSolutionSet(  x + 2y = 5 ; 3x − y = 1,
                  x + 2y = 5 ; 3x − y = 99 )   →   ok: true, verified: true
```

Một chốt canh luôn xanh là chốt canh không có. Nên phép biến đổi hàng phải hỏi một câu
khác — và câu ấy có sẵn trong toán: **hiệu hai vế là một hàm**, còn hàm thì `sameValue`
kiểm được từ M47.

### 35.3 Hợp đồng thứ bảy: `claim`

```ts
readonly claim?: { readonly left: Expr; readonly right: Expr };
```

Luật khai một cặp trong đó `left` **đọc ra từ cây sau** còn `right` **dựng từ cây
trước**, rồi `model` hỏi `sameValue`. Cộng hai phương trình mà quên một vế thì:

```
bước 1 (cộng hai phương trình):
  khác nhau tại x=610369400, y=1418865157: 805362135 ≠ 805362150
```

Bốn luật, bốn khẳng định:

| luật | `left` (từ sau) | `right` (từ trước) |
|---|---|---|
| `add_equations` | hiệu hai vế hàng mới | hiệu cũ $+\ \lambda\cdot$ hiệu hàng nguồn |
| `scale_equation` | hiệu hai vế hàng mới | $\lambda\cdot$ hiệu cũ |
| `substitute_from` | hiệu hai vế hàng mới | hiệu cũ **sau khi thế** |
| `drop_equation` | hiệu hai vế hàng bị bỏ | $0$ |

**Kế hoạch M59 nói sai chỗ này, và ghi lại thì đáng hơn là ép cho vừa.** Bản kế hoạch
viết "không hợp đồng mới, dùng `verify: 'instance'` qua `replaceVar`". `'instance'` thay
biến trên **toàn** cây, mà phép biến đổi hàng chỉ đụng *một* phương trình — nó không
vừa. Ép một hợp đồng không vừa là cách tạo ra một phép kiểm đúng hình thức mà rỗng.

### 35.4 Chỗ có răng nhất không nằm ở bộ kiểm

`substitute_from` đòi phương trình nguồn **đã cô lập một ẩn** ($x = t$, với $x$ là một
biến trần và $t$ không còn $x$). Đây mới là cửa quan trọng: thế một thứ không phải ràng
buộc là cách nhanh nhất làm hỏng một hệ, và cửa này chặn bằng **cấu trúc** chứ không bằng
lời hứa.

Cùng họ: `drop_equation` chỉ bỏ được hàng mà hai vế **giống hệt** nhau (`same`), vì bỏ một
phương trình còn nội dung là mất nghiệm. Và cả hai luật cộng/nhân **từ chối bất đẳng
thức** — nhân một bất đẳng thức phải xét dấu, mà đó là chuyện của `mul_both_sides`, không
phải của một phép biến đổi hàng.

`scale_equation` với hệ số chưa chắc khác $0$ thì ghi điều kiện đỏ và khai `guard` — cùng
cơ chế và cùng lý lẽ với AL-08.

### 35.5 Vẽ: dấu $=$ phải thẳng cột

Hộp `stack` mang theo `lead` — bề ngang phần **trước** dấu quan hệ của từng dòng, đo bằng
chính bộ sắp chữ sẽ vẽ nó — rồi `place` đẩy mỗi dòng sang phải $\max(\text{lead}) -
\text{lead}$. Không gióng thì một hệ nhìn như hai dòng rời nhau, và đó không phải chuyện
thẩm mỹ: cái làm một hệ *đọc được như một hệ* chính là cột dấu bằng.

Ngoặc nhọn vẽ bằng **path**, không phải glyph `{` phóng to — glyph có tỉ lệ cố định nên
kéo cho cao bằng ba dòng thì nét dày ra và hai cái móc méo hẳn. Cùng lý lẽ với dấu căn từ
M47b.

Trần mới `maxRelations: 4`, ép ở `model.ts` chứ không chỉ ở TypeBox — bài học M55: một
trần chỉ khai ở schema là một trần chỉ chặn được một đường vào.

---

## 36. Tập nghiệm, và một lỗ **suýt** không ai thấy (M60)

### 36.1 Chỗ đặt đáp số đã có sẵn từ M59

Lỗ đo được: $x^2-3x+2>0$ phân tích ra $(x-2)(x-1)>0$ rồi **dừng**. Thêm bao nhiêu luật
cũng vô ích vì không có chỗ cho kết quả rơi vào.

Nhưng chỗ ấy không cần dựng mới: `sys` với `join: 'or'` *là* một tuyển khoảng, và
`join: 'and'` *là* một khoảng. **Không** có nút `set`/`interval` riêng — một khoảng *là*
một hội hai bất đẳng thức, và dựng lại nó thành một nút thứ hai là dựng hai lần cùng một
thứ (đúng lỗi §24.3 đã tránh với hai nghiệm bậc hai).

Ba luật, và chúng chỉ là cách đọc dấu:

| | |
|---|---|
| `abs_to_interval` | $\|A\| < a$ thành hội, $\|A\| > a$ thành tuyển |
| `interval_from_factors` | $(x-r_1)(x-r_2) > 0$ thành hai khoảng ngoài, $< 0$ thành khoảng giữa |
| `merge_intervals` | hội giữ ràng buộc **chặt** hơn, tuyển giữ ràng buộc **lỏng** hơn |

`interval_from_factors` chỉ nhận **hai** nhân tử. Ba trở lên cho ra một tuyển của các
hội — hai tầng lồng, không mắt nào đọc nổi trên một dòng. Từ chối có lời thay vì vẽ ra
một thứ không đọc được.

Vẽ: tuyển nằm **ngang**, nối bằng chữ "hoặc" — đó là cách mọi sách viết một tập nghiệm,
và một ngoặc nhọn quanh hai nhánh loại trừ nhau đọc ra đúng nghĩa ngược lại.

### 36.2 `sameSolutionSet` **có răng** ở đây — và tương phản mới là điều đáng ghi

Với hệ phương trình (§35.2) nó là một phép kiểm luôn xanh: mọi điểm ngẫu nhiên làm cả
hai vế cùng sai. Với tập nghiệm thì "thuộc tập nghiệm" là một câu đúng/sai **có nghĩa** ở
cả hai vế, nên cùng một hàm ấy bắt được sai lệch ngay:

```
sameSolutionSet( x² − 3x + 2 > 0,  x < 1 )
  →  ok: false — tập nghiệm khác nhau tại x = 4.6338
```

Cùng một bộ kiểm mà chỗ này dùng được, chỗ kia không. Đó không phải khiếm khuyết của bộ
kiểm — nó là hai câu hỏi khác nhau đội lốt một câu.

### 36.3 Lỗ suýt không ai thấy: `unsound: []` vì **chưa ai hỏi**

Hai nhánh cuối của phép kiểm ở `model.ts` hỏi `k === 'rel'`. M60 sinh ra bước đầu tiên
trong cả lịch sử engine đi từ `rel` sang **`sys`** — và bước ấy không rơi vào nhánh nào:

| | `unsound` |
|---|---|
| luật đúng, dispatch cũ | `0` |
| luật **cố tình sai**, dispatch cũ | `0` |
| luật **cố tình sai**, dispatch mới | `1` |

Hai dòng đầu giống hệt nhau, và đó là toàn bộ vấn đề: con số $0$ không phân biệt "đã hỏi
và đúng" với "chưa ai hỏi". Đây đúng loại lỗ mà M47c gọi tên — *chỗ miễn kiểm là chỗ lỗ
hổng nằm* — và nó chỉ lộ ra khi đi tìm **nhánh nào đã chạy**, không lộ ở kết quả.

Chữa bằng một vị từ `isPredicate(e) = e.k === 'rel' || e.k === 'sys'`, và chốt canh khẳng
định bằng một luật cố tình sai chứ không bằng một luật đúng — vì một luật đúng cho ra
cùng con số ở cả hai bên.

### 36.4 Hệ lồng hệ: làm phẳng **cùng phép nối**, không khác

$(A \wedge B) \wedge C$ và $A \wedge B \wedge C$ là một, nên `normalize` làm phẳng —
cùng chỗ đứng và cùng lý lẽ với `add`/`mul`. Nhưng $(A \vee B) \wedge C$ làm phẳng là đổi
hẳn nghĩa, nên phép nối phải khớp mới gộp. Một dòng điều kiện, và thiếu nó thì
`abs_to_interval` áp bên trong một hệ sẽ lặng lẽ biến một tuyển thành một hội.

---

## 37. Hàm siêu việt — sáu dòng bảng (M61)

### 37.1 Cái giá đã trả từ M56

Đặc tả §16 từng khai: *"Không $\sin$, không $\log$. Lúc cần chúng thì đây là dự án khác,
không phải một phiên bản sau."* Lời ấy đúng với kiến trúc lúc viết — khi mỗi hàm là một
kiểu nút thì sáu hàm là sáu vòng sửa sáu tệp.

M56 đổi kiến trúc ấy: **một** biến thể `fn` cho cả họ, mọi thứ riêng của từng hàm ở bảng
`functions.ts`. Nên M61 là sáu dòng bảng, hết. Không kiểu nút mới, không sửa `expr.ts`
ngoài việc nới union tên, không đụng `check.ts`.

Đó là toàn bộ lý do M56 đứng trước M61 trong kế hoạch dù M61 mới là thứ được gọi tên.

### 37.2 Trường `domain` khai ở M56 có **hình dạng sai** — và M61 là chỗ phát hiện

M56 khai `domain?: (args) => Guard | null` với chú thích *"dùng ở M61"*. Đến lúc dùng thì
nó thừa: `evalReal` của $\ln$ trả `null` ngay khi đối số $\le 0$ (`Math.log` cho
`-Infinity`/`NaN`), nên bộ bốc điểm **đã** tự bỏ mọi điểm ngoài miền. Một `Guard` ở đó
không thêm răng nào, nó chỉ trùng lặp.

Việc còn thiếu là **nói cho người đọc**: $\log(ab) = \log a + \log b$ đúng khi $a>0$ và
$b>0$, và dòng đỏ ấy là nội dung chứ không phải thủ tục. Nên trường đổi thành
`domainText`, trả chữ.

Bài học: một trường khai trước cho một hạng mục chưa tới thì đoán được **có cần**, không
đoán được **hình dạng nào**. Ghi lại chỗ đoán sai thay vì lặng lẽ đổi kiểu.

### 37.3 Điều kiện: chỗ nào cần, chỗ nào **không**

| bước | dòng đỏ |
|---|---|
| $\log(xy) \to \log x + \log y$ | $x>0,\ y>0$ |
| $\log(x^3) \to 3\log x$ | $x>0$ |
| $\log(2\cdot 3) \to \log 2 + \log 3$ | **không** — hằng dương, hiển nhiên |
| $e^{\ln x} \to x$ | **không** |

Dòng cuối nghe lạ vì $\ln x$ rõ ràng đòi $x>0$. Nhưng nếu $\ln x$ đã **viết ra được** thì
điều kiện ấy đã thoả từ dòng trước; điều kiện nằm ở chính dấu $\ln$, không ở bước triệt
tiêu. Đúng lý lẽ `root_pow` từ M47b, và đây là lần thứ hai nó được dùng.

`log_both_sides` **không từ chối** khi hai vế chưa chắc dương — nó ghi điều kiện, đúng cơ
chế AL-08. Từ chối thì luật này gần như không bao giờ áp được, vì hai vế thường chứa biến.
Và nó đi hợp đồng `sameSolutionSet` chứ không phải `implies`: $\ln$ **tăng ngặt**, nên nó
bảo toàn tập nghiệm chứ không nới rộng như bình phương.

### 37.4 Tập luật **đóng**, mười một dòng

Sáu luật logarit, bốn đồng nhất thức lượng giác có tên, một luật nhóm ★. Hết.

**Không** có "rút gọn biểu thức lượng giác": không gian đồng nhất thức lượng giác vô hạn,
và một nút bấm nhảy năm bước là đúng thứ làm người học không học được gì (§4). Mười một
luật này là những đồng nhất thức có tên trong sách, không phải một bộ giải.

Nhận dạng bằng **cấu trúc**: `double_angle` đòi góc có dạng $2\cdot\theta$ như một *tích*,
`pythagorean_identity` đòi $\sin^2$ và $\cos^2$ của **cùng một góc** so bằng `same`. Không
có ca nào chúng "gần đúng".

Bộ kiểm ở đây chạy đường **thực**, và nó thoải mái nhất trong cả ba sân: $\sin$ và $\cos$
xác định ở mọi điểm nên không điểm nào bị bỏ. Đo được: $\sin 2x$ so với $2\sin x\cos x$
qua, so với $2\sin x\sin x$ đỏ.

### 37.5 Lỗi bề ngang lần thứ ba

`ln` cộng từng chữ ra $1{,}0$ em, glyph thật rộng $0{,}778$ — chữ `l` hẹp bằng nửa chữ
`n`. Trên trang thấy một khe hở giữa `ln` và dấu ngoặc, đọc thành hai vật rời nhau.

Cùng lớp lỗi với dấu `!` (M56) và chữ hoa ở $C_n^k$ (M56), nhưng cách chữa khác: đo theo
**cả tên**, không theo từng chữ cái. Chữa từng chữ thì `t`, `r`, `s`, `n`, `e`, `p` đều
đổi bề ngang, mà chúng có mặt làm **biến** trong golden của kho — hình không đổi một nét
mà 400 golden phải soát lại. Tên hàm là chuỗi nhiều ký tự **duy nhất** engine này in ra,
nên một bảng theo tên vừa đủ và không chạm gì khác.

---

## 38. `combviz film` — CHO-08 lần đầu được kiểm (M62)

Mục này không mở thêm ngữ pháp. Nó lấy một tài sản đã có sẵn và **đem ra dùng** — rồi
phát hiện ba chỗ hỏng mà không lớp lưới nào của kho chạm tới được.

### 38.1 Một lời hứa chưa ai chạy thì không phải một lời hứa

CHO-08 viết từ ngày đầu, trong chính chú thích của `applyChoreography`:

> Không đọc giờ, không random, không trạng thái. Cùng `t` cho cùng khung ở mọi nơi —
> Player gọi mỗi rAF, render video gọi theo timestep cố định, và hai bên phải ra byte
> giống nhau.

Vế đầu có người chạy. Vế sau thì **không có call site**: tới trước M62, thứ duy nhất gọi
`applyChoreography` là `Player.tsx`. Nghĩa là "tất định" chưa từng bị thử — hàm có thể
đã thuần suốt, hoặc đã hỏng từ M51 và không ai biết.

`combviz film` là vế thứ hai. Nó **không dựng lại phép tính nào**: cùng `createRenderer`,
cùng `applyChoreography`, cùng `toSvgString`. Nhờ vậy chốt canh của nó là một phát biểu về
*engine*, không phải về lệnh: bẻ nhánh `progress <= 0` trong `choreography.ts` thì
`film.test.ts` đỏ hai dòng.

Đường ra: dãy `frame-%04d.png` + `manifest.json`, và `--apng` gộp một file xem thẳng trên
browser. **Không** mp4, không ffmpeg trong repo — ffmpeg là một binary hệ thống, không cài
được bằng `pnpm install`, và là thứ đầu tiên thiếu trên máy CI. Ai cần mp4 thì dãy PNG nằm
sẵn đó, một dòng lệnh là xong; dòng ấy in trong `--help`.

**Đính chính kế hoạch.** Kế hoạch M62 ghi lệnh này vào `REN-05`. Đọc lại SRS thì sai:
REN-05 là kịch bản nâng cao + voice-over, còn thứ lệnh này làm chính là **REN-04**
(*"render solution playback → video"*). Nó trả phần lõi của REN-04 — timeline tất định,
điểm dừng theo `hold`, một bài một clip — và để lại preset 16:9/9:16 cùng caption
voice-over. Ghi ra chứ không sửa số cho khớp: xem §35.3 và §37.2, cùng loại.

### 38.2 APNG ghép bằng `node:buffer`, không thêm phụ thuộc

Kế hoạch ghi `upng-js`. Đo lại thì nó **đắt hơn thứ nó thay**: `upng-js` mã hoá từ buffer
RGBA thô, tức mỗi khung phải giữ $w \times h \times 4$ byte rồi nén lại bằng deflate viết
bằng JS — với clip 5 giây ở 25fps, bề rộng 720 là ~140 MB giữ trong RAM và 125 lượt nén.
Trong khi resvg **đã** trả về PNG nén sẵn.

Mà APNG, theo đúng đặc tả, **là** một dãy PNG chung `IHDR`: khung đầu giữ nguyên `IDAT`,
khung sau đổi nhãn thành `fdAT` và thêm số thứ tự. Không giải nén, không nén lại, không
đọc một pixel nào. `apng.ts` vì thế ngắn hơn phần chú thích của nó, và Chromium mở được
file nó sinh ra (đã thử: `naturalWidth = 720`, hai lần chụp cách 1,5 giây khác nhau).

Khung trùng nhau **byte-identical** liền kề gộp thành một khung dài hơn — quãng đứng hình
ở mốc `hold` sinh hàng chục bản y hệt, và 186 khung của `extraneous-root-by-squaring` gộp
còn 76 mà không mất một pixel thông tin nào.

### 38.3 Lỗi thứ nhất lượt nhìn bắt: pha `focus` **câm** khi không có CSS

Clip đầu tiên xuất ra chạy đủ $4180$ ms và **1,2 giây đầu không có chuyện gì xảy ra**.
Không lỗi, không cảnh báo, test xanh.

Nguyên do nằm ở một quyết định đúng: `applyChoreography` cố ý không chọn màu, nó gắn
`data-phase` rồi thôi — vì nó không biết theme và phải chạy y hệt ở Node lẫn browser.
Trong Player, lớp đọc thuộc tính ấy là `styles.css`:

```css
.canvas [data-phase] { filter: drop-shadow(0 0 3px var(--halo)) drop-shadow(0 0 6px var(--halo)); }
```

Trong resvg **không có lớp ấy**. Nên `data-phase` là thuộc tính không ai đọc, và mọi pha
`focus` — thứ mang cả mốc `hold`, tức khoảnh khắc quan trọng nhất của mỗi bước — trôi qua
không để lại dấu vết.

`withFocusGlow` là **anh em song sinh của `styles.css`**, không phải tính năng mới: cùng
một quyết định thị giác nói bằng thứ tiếng thứ hai (`feDropShadow`, đúng màu
`theme.emphasis.anchorHalo` mà `--halo` đang dùng). Hai bản có thể lệch nếu ai đó sửa một
bên — cái giá phải trả để giữ `applyChoreography` mù theme.

Hai chi tiết đo được, không đoán:

- **Bán kính theo tỉ lệ của Player, không theo `--width`.** CSS nói `3px` ở tỉ lệ hiển thị
  của Player ($44$px mỗi $10$ đơn vị, G-10), nên quy về đơn vị scene là $3/4{,}4$. Lấy
  theo bề rộng xuất ra thì cùng một clip xuất ở 1440 có quầng bằng nửa bản 720 — quầng
  phải to bằng chữ, không bằng file.
- **Tiến độ đi vào `flood-opacity`.** CSS bỏ qua giá trị của `data-phase` và mượn
  `transition` để sáng dần; ở đây không có transition, nên tiến độ lượng tử hoá thành 8
  mức để số filter còn đếm được mà vẫn tất định.

### 38.4 Lỗi thứ hai: phông là **một nửa của phép đo**

Sau khi có quầng sáng, khung cuối lộ tiếp một chuyện: quầng anchor **cắt ngang chữ số
cuối** của dòng `x = 8`.

Đo thì layout đúng đến từng phần nghìn: hộp dòng rộng $11{,}30$, glyph `8` bắt đầu ở
$20{,}233$ và theo metric KaTeX kết thúc đúng ở $22{,}733$ — mép phải của hộp. Sai nằm ở
chỗ khác: `typeset.ts` đo bề ngang **bằng bảng metric của KaTeX**, còn resvg với mỗi
`loadSystemFonts` thì trên máy này có $59$ phông và **không cái nào** là KaTeX. Nó lặng lẽ
rơi về một sans hệ thống, chữ số rộng hơn, hình tràn khỏi hộp.

Không lớp lưới nào bắt được: golden so **chuỗi SVG**, mà chuỗi SVG thì đúng — sai nằm ở
chỗ resvg vẽ chuỗi ấy bằng phông khác. Nên phông ở đây không phải chuyện trang trí, nó là
**một nửa của phép đo**; nửa kia đã nằm sẵn trong repo và hai nửa phải trỏ vào cùng bộ
file. Sửa dùng chung cho cả `og --png`, vốn có đúng lỗi ấy từ trước.

### 38.5 Lỗi thứ ba: bốn mặt chữ **tự khai mình là Regular**

Trỏ thẳng vào `katex/dist/fonts` xong thì mọi thứ hoá **nghiêng**, kể cả chữ Việt của nhãn
luật. Đọc bảng `OS/2` mới ra nguyên do:

| file | family | subfamily | `fsSelection` |
|---|---|---|---|
| `KaTeX_Main-Regular.ttf` | KaTeX_Main | Regular | `0b1000000` |
| `KaTeX_Main-Italic.ttf` | KaTeX_Main | Italic | `0b1000000` |
| `KaTeX_Main-Bold.ttf` | KaTeX_Main | Bold | `0b1000000` |
| `KaTeX_Main-BoldItalic.ttf` | KaTeX_Main | Bold Italic | `0b1000000` |

Bit thứ 6 là `REGULAR`. **Cả bốn mặt đều khai mình là Regular**, không mặt nào bật bit
`ITALIC` hay `BOLD`. Với KaTeX đó không phải lỗi: trong browser, kiểu chữ do
`@font-face { font-style: italic }` khai ở CSS quyết định, bảng trong file không ai đọc.
Nhưng resvg **chỉ có** bảng trong file.

`fonts.ts` sửa đúng hai bit ấy trên một bản sao trong cache, suy kiểu chữ từ tên file —
chính thứ mà `@font-face` của KaTeX cũng dùng để suy. File gốc trong `node_modules` không
đụng tới. Checksum bảng **không** tính lại vì `ttf-parser` (bộ đọc của resvg) không kiểm;
ghi ra đây để lần sau đổi bộ đọc thì biết chỗ nào nợ.

### 38.6 Bẻ răng — và một chốt canh rỗng đội lốt

Bốn cơ chế mới, bốn lần bẻ, bốn lần đỏ: nhánh `show` chưa bắt đầu, quầng focus, mốc
`hold`, số thứ tự `fdAT`.

Lần bẻ thứ nhất lộ ra một chuyện khác. Chốt canh *"khung `ms = 0` không lộ thứ chưa hiện"*
chạy trên hai bài — một đại số, một bàn cờ — và khi bẻ nhánh `show`, **chỉ nửa đại số
đỏ**. Nửa bàn cờ vẫn xanh vì nó dò danh tính bằng regex trên chuỗi SVG, mà engine bàn cờ
đeo danh tính ở `key` — một **trường của node**, không phải thuộc tính, nên `toSvgString`
không viết nó ra. Nó quét $0$ node và xanh mà chẳng kiểm gì.

Đúng bài học M48, lần thứ hai: *một test không với tới nhánh của nó là một test rỗng đội
lốt*, và cách duy nhất biết là **bẻ thứ nó canh**. Chữa: đi trên cây node (`frameNodes`,
tách khỏi `frameSvg` đúng vì lý do này) và **đếm** số node chạm tới.

### 38.7 Golden không đổi một byte

`film` render với `explain: true` và một lớp `defs` riêng, nhưng nó là một **đường ra
mới**, không phải một sửa đổi trong renderer: 2948 test xanh, 111 bài validate sạch, không
golden nào đổi. Đó là điều kiện để mục này được xem là đã xong.

---

## 39. Tiểu sử hạng tử — chạm vào hình để hỏi (M63, AL-13)

Câu hỏi mà lớp học hỏi nhiều nhất trước một chuỗi biến đổi là *"con số này từ đâu ra?"*.
Engine đã có câu trả lời từ M46 và chưa ai hỏi nó.

### 39.1 Không thêm dữ liệu nào — chỉ đem thứ đã tính ra dùng

`AlgebraRow.trace` ghi nút cũ đi đâu; `TermId` bền qua mọi dòng (DAT-11/12) nên $e_2$ ở
dòng ba **đúng là** nút $e_2$ của dòng một. Hai thứ ấy cộng lại đã là một phả hệ đầy đủ.
Tới trước M63, chỗ duy nhất đọc `trace` là bộ sinh choreography — nó lấy phần "cái gì vừa
đổi" rồi bỏ phần còn lại.

`provenance.ts` không thêm một trường nào vào model. Nó chỉ **nối** `trace` qua các cặp
dòng kề, và cả tệp là hai vòng lặp.

### 39.2 Quy tắc nối có hai vế, và vế thứ hai gánh việc

```
trace.has(id) ? trace.get(id) : (dòng sau còn id ? [id] : [])
```

`trace` **chỉ ghi chỗ đổi**: `dup`, `merged`, và một vòng quét bắt nút biến mất. Nút đi
tiếp nguyên vẹn không có mặt ở đâu cả — mà đó là đa số nút của mọi dòng. Bỏ vế thứ hai
thì phả hệ đứt ngay dòng đầu tiên hạng tử ấy không bị luật chạm tới, tức gần như luôn.

Đo bằng cách bẻ: gỡ vế thứ hai ở chiều xuôi → **4/14 test đỏ**; gỡ ở chiều ngược → 1 đỏ.

Đi **cả hai chiều** vì không đoán được người ta đang hỏi chiều nào — chạm dòng cuối là
hỏi "từ đâu ra", chạm dòng đầu là hỏi "rồi thành gì" — và cả hai đều là *cùng một* phả hệ.
Chiều lên là **nghịch ảnh** của `trace`, không phải một bảng thứ hai: nút gộp từ ba nút
thì đi lên ra ba tổ tiên, đúng thứ cần thấy.

Ba hình dạng, đo trên chuỗi $2(x+3) + 4x \to 2x + 2\cdot3 + 4x \to 6x + 2\cdot3$:

| chạm | phả hệ |
|---|---|
| hệ số $2$ ở dòng 0 | `{0:[e1], 1:[e1,e11], 2:[e11]}` — **rẽ hai**, một nhánh chết |
| hệ số $6$ ở dòng 2 | `{0:[e8], 1:[e8,e10], 2:[e15]}` — **nhập hai**, lên nữa còn một |
| nút mới sinh | `{2:[e14]}` — không bịa tổ tiên |

### 39.3 Một lớp canh **không đầu vào nào với tới**, và nó bị gỡ

Bản đầu có thêm `&& !trace.has(one)` ở nhánh tự nối ngược chiều, lý lẽ nghe rất xuôi: một
`TermId` có thể vừa là **khoá** của `trace` vừa còn sống ở dòng dưới với chính tên ấy, nên
không kiểm thì phả hệ nở ra tổ tiên không có thật.

Bẻ nó ra thì **14/14 test vẫn xanh**. Không phải vì test yếu — vì hình ấy không tồn tại:
chỗ duy nhất sinh ra "khoá mà vẫn sống" là `dup`, và `dup` ghi `trace.set(from, [from, to])`,
tức `from` nằm trong chính danh sách đích, nên vòng lặp nghịch ảnh đã bắt nó rồi; cộng lần
nữa vào một `Set` không đổi gì.

Đây là bài học M48 **lật ngược**: lần trước là một *test* không với tới nhánh của nó, lần
này là một *dòng code* không đầu vào nào với tới. Giữ thì mang mãi một lớp canh giả không
ai kiểm được; gỡ thì code ngắn đi và không mất gì. Gỡ — và ghi lại để lần sau ai đó thấy
thiếu thì biết nó đã được cân nhắc, không phải bị quên.

### 39.4 Đường chạm đầu tiên của Player, và vùng chết giữa hai ngưỡng

Trước M63, cử chỉ duy nhất trên canvas Player là **vuốt ngang 48px** đổi step; hit-test chỉ
sống trong Sandbox. Nay có hai cử chỉ trên cùng một canvas, và khoảng giữa chúng phải
**không làm gì cả**:

| dịch chuyển | nghĩa |
|---|---|
| $< 8$px | chạm tại chỗ — hỏi phả hệ |
| $8..48$px | **không gì cả** |
| $> 48$px | vuốt — đổi step |

Vùng chết là chủ ý. Một ngón tay dịch 20px là cử chỉ **mập mờ**, và đoán bừa thì một nửa
số lần đoán sai — mà đoán sai ở đây nghĩa là nhảy mất một bước lời giải. Thà không phản
ứng: người dùng thử lại, chứ không phải hoàn tác.

Đo cả `y` chứ không chỉ `x`: bản đầu chỉ theo `clientX`, nên cuộn trang một đoạn dài rồi
nhấc tay cũng tính là "chạm tại chỗ" và làm sáng bừa một hạng tử ngẫu nhiên dưới ngón.

Đi ngược DOM theo đúng mẫu `BijectionPanes.onPoint` — leo hết chuỗi tổ tiên, `data-el`
**trước** `data-k`. Không gọi `hitTest`: cây DOM đã mang sẵn câu trả lời, còn `hitTest` bắt
quy đổi toạ độ qua `getScreenCTM`. Cùng lý lẽ M37 đã ghi cho song ánh.

**`null` chứ không phải tập rỗng** khi chạm hụt: Player phân biệt "chạm trúng một hạng tử
đứng một mình" với "chạm hụt", và cái sau phải **xoá** vệt đang sáng chứ không thay nó bằng
một vệt rỗng. Đó là cách người ta bỏ chọn.

### 39.5 Ba nguồn cùng nói "nhìn chỗ này"

Rê chuột trên lời kể › hạng tử vừa chạm › pha timeline đang chạy. Cùng lý lẽ đã dùng cho
`shownAnchor` ở M51: thứ người dùng *vừa làm* thắng thứ máy đang tự chạy.

Cả ba đổ vào **cùng một** `ctx.highlight` — không thêm đường render thứ hai, nên vẫn đúng
một chỗ quyết định "được nhấn" trông thế nào, và golden không đổi một byte.

### 39.6 Chốt canh đầu tiên đỏ vì một giả định sai

Test e2e bản đầu mở bằng `expect(HALO).toHaveCount(0)` — "chưa chạm thì tối om". Nó đỏ
ngay: step ấy có anchor, và pha đầu của timeline sinh ra bắt đầu đúng tại `ms = 0`, nên đã
có sẵn một vệt sáng trước khi ai chạm vào đâu. Nay mọi assert so với **nền** chứ không so
với rỗng.

Lỗi thứ hai cùng loại: `expect(await lit(page))` đọc DOM **một lần**, trong khi vệt sáng
tắt qua một lượt `patch` bất đồng bộ. Ba test qua, một test đỏ ngẫu hứng. `expect.poll`
sửa cả bốn.

Bẻ răng: bỏ `tapped` khỏi thứ tự ưu tiên → 3 đỏ; `Escape` không xoá → 1 đỏ; **đảo thứ tự
hai nhánh cử chỉ** cho nhánh chạm đứng trước nhánh vuốt → test "vuốt vẫn đổi step" đỏ.
Cái thứ ba là cái đáng lo nhất của mục này và nó có người canh.

76 e2e xanh trên cả desktop lẫn iPad, 2962 unit test xanh, golden không đổi.

---

## 40. Bằng chứng nhìn được (M64, AL-14)

Bộ kiểm bốc hàng chục điểm cho mỗi bước rồi tóm tắt tất cả vào một câu chữ: *"khớp trên
8 điểm ngẫu nhiên"*. Con số $8$ ấy là **toàn bộ** những gì sống sót — bản thân các điểm,
thứ đắt nhất trong cả phép kiểm, biến mất ngay khi vòng lặp kết thúc.

### 40.1 Giữ lại thứ đã tính — không tốn thêm một phép tính nào

`SoundnessResult.witnesses` giữ tối đa tám điểm đồng thuận cộng điểm phản chứng. `env`
đã nằm sẵn trong tay tại chỗ so, nên đây thuần tuý là **ngừng vứt đi**.

Điểm phản chứng đứng **cuối** và không bị trần chặn: nó là điểm duy nhất trong cả danh
sách thật sự nói lên điều gì khi bước sai. Và chỉ điểm **thoả quan hệ trước** mới vào sổ
ở `impliesSolutionSet` — điểm mà `before` sai không nói gì về một mệnh đề kéo theo, đếm
nó vào là thổi phồng số chứng cứ bằng những điểm chưa từng được hỏi.

Một cảnh báo ghi vào chính chỗ khai kiểu: ở sân $\mathbb{F}_p$, `env` là phần tử của một
trường cỡ $2^{31}$, nên `x = 1483920571` là chứng cứ **thật** mà **vô nghĩa với người
đọc**. Dải chấm chỉ đếm chúng; đừng in giá trị của sân ấy ra màn hình.

`AlgebraRow.evidence` gắn kết quả ấy vào **từng dòng**. Khác `model.unsound`/`unchecked`:
hai danh sách kia là của cả scene và chỉ nói khi có chuyện, nên dòng nào đã kiểm và
**qua** thì trước M64 không để lại dấu vết nào — mà đó chính là thứ đáng cho người đọc
thấy.

### 40.2 Dải tám chấm **không đọc được**, và cách biết điều đó

Kế hoạch vẽ một dải: mỗi chấm một điểm đã bốc. Ở 720px hay 1800px thì tám chấm đếm được
rõ ràng. Ở **đúng mật độ Player hiển thị** — $4{,}4$px mỗi đơn vị scene, G-10, tức bài
này rộng $408$px chứ không phải $1800$ — thì:

| bán kính (đơn vị) | bước nhảy | tám chấm trông ra sao |
|---|---|---|
| $0{,}375$ | $1{,}1$ | một nét gạch chân chấm chấm |
| $0{,}5$ | $1{,}7$ | vẫn là một nét gạch chân |

Nới rộng thêm thì dải vượt quá bề ngang nhãn luật — mà bề ngang scene **không** tính dải
này (tính vào thì `layout` phải biết `ctx.explain`, và mọi golden đổi), nên nó sẽ bị cắt
cụt ở mép phải. Đường cùng.

Nên đổi thứ được vẽ: **một** chấm mỗi dòng mang *kết luận* (đã kiểm / chưa kiểm được /
sai), còn *số điểm* đi vào chỗ chạm. Một chấm $5{,}7$px đọc được ở mọi cỡ, và nó nằm
trong **máng** giữa cột công thức và cột nhãn luật nên không đè ai và không đổi bề ngang
một đơn vị nào. Đặt trước nhãn chứ không dưới nhãn: một chấm lẻ dưới một dòng chữ đọc
thành dấu chấm câu lạc lõng, còn đứng trước thì nó đọc thành *dấu đầu dòng*.

Bài học M45 nguyên văn: một dấu hiệu thường trực mà không ai giải mã được thì tệ hơn là
không có. Cách duy nhất biết là **nhìn ở kích thước thật** — nhìn ảnh to gấp ba lần thực
tế thì mọi thứ nhỏ đều trông ổn.

### 40.3 Điều kiện **hỏi được**, và một quyết định M61 được xem lại

Dòng đỏ *"với $x - 1 \ne 0$"* có từ M50 và nó đúng, nhưng nó nói bằng thứ tiếng của
người đã hiểu. Câu tiếp theo của người học là *chuyện gì xảy ra ở chỗ bị cấm*, và một
chuỗi ký tự không trả lời được. Nay `Condition` mang **cả `Guard`**, và `algebraIncident`
quét một lưới hữu tỉ nhỏ (mẫu $\le 4$, trị $\le 6$) tìm điểm đầu tiên làm nó gãy.

Thứ tự quét là một quyết định sư phạm: **mẫu số nhỏ trước, rồi tới trị tuyệt đối nhỏ**.
Nhờ vậy câu trả lời là *"tại $x = 1$"* chứ không phải *"tại $x = -23/4$"* — cùng một sự
thật, một cái dạy được và một cái thì không.

Đo trên cả kho: **11 trong 13** chỗ khai `condition` không kèm `guard` nào. Sáu trong số
đó thuộc M61, và M61 đã **cân nhắc đúng chuyện này** (§37.2): `evalReal` của $\ln$ trả
`null` ngay khi đối số $\le 0$, nên bộ bốc điểm đã tự bỏ mọi điểm ngoài miền và một
`Guard` không thêm gì.

Kết luận ấy đúng — với **người tiêu thụ duy nhất tồn tại lúc đó**. M64 thêm người thứ
hai, và với người ấy thì `Guard` là toàn bộ câu trả lời. Nên đây không phải lật lại một
quyết định sai, mà là cùng một quyết định trong một thế giới có thêm một người dùng.
Sau khi bù đủ: **14/15** dòng điều kiện trong kho trả về một điểm cụ thể. Cái còn lại là
$2^x > 0$ — đúng ở mọi $x$ thực, nên **im lặng là câu trả lời đúng**, không phải một
thiếu sót.

### 40.4 `Guard` không được ngốn không gian danh tính

Thêm `guard` cho một luật làm bốn golden đổi — toạ độ **giống hệt từng chữ số**, chỉ khác
`data-el`. Nguyên do: guard dựng bằng `freshCopy(m, …)` với `m` là `Minter` của chính
scene, nên mỗi điều kiện mới đẩy mọi `TermId` sinh sau nó dịch đi một số. Đúng loại nhiễu
đã cắn ở M55, và nó sẽ cắn lại mỗi lần ai đó thêm một điều kiện.

Mà biểu thức điều kiện **không bao giờ được vẽ**: nó chỉ đi qua `evalReal`, `varsOf`, và
từ M64 là `toPlain`. Không chỗ nào nhìn tới `TermId`. Nên `freshCopy` ở đó vừa thừa (bản
sao chỉ tốn bộ nhớ) vừa có hại (ngốn id).

`guardOf(sign, build)` dựng bằng một `Minter` **mới mỗi lần** và dùng thẳng cây con,
không sao chép. Một lần đổi hết tám chỗ khai guard: bốn golden churn — đã soát bằng máy,
bỏ `data-el`/`key` ra thì hai bên **giống nhau từng byte** — và từ nay thêm điều kiện cho
luật thứ 73 sẽ không đụng một golden nào.

### 40.5 Hai lỗ do chốt canh cũ bắt, một lỗ do lượt nhìn

- **Chấm chứng cứ lộ ở khung $0$.** Ảnh chụp Player cho thấy hai chấm mờ nổi giữa khoảng
  trống, trong khi dòng và nhãn luật của chúng còn chưa hiện. Cùng hình dạng với lỗi
  nhãn-hiện-sớm của M51, lần thứ hai. Chữa: lô đầu của pha "dòng tự viết ra" kéo theo
  `evidenceId(k)`.
- **Hợp đồng `implies` chưa từng ghi chứng cứ.** Nhánh ấy cố ý không đi qua `judge` (vì
  `verified: false` ở đó mang nghĩa khác), và hệ quả là `pow_both_sides` được kiểm mà
  không để lại dấu vết nào. Lộ ra vì chốt canh *"mọi đích của mọi pha đều là danh tính có
  mực"* (M51) đỏ: pha hiện dòng nhắm vào một chấm không tồn tại. Một chốt canh cũ bắt một
  lỗ mới — đúng thứ nó được dựng ra để làm.
- **Chốt canh e2e chạm vào thứ người dùng không nhìn thấy.** Bản đầu bấm `note0` ngay ở
  khung $0$, nơi dòng đỏ còn `opacity: 0` — Playwright bấm được, người dùng thì không.
  Nay tua timeline tới cuối trước. Lần thứ hai trong đợt này một chốt canh xanh trên một
  trạng thái không với tới được.

### 40.6 Bẻ răng

| bẻ | kết quả |
|---|---|
| điểm phản chứng không đứng cuối | 1 đỏ |
| bỏ trần `WITNESS_MAX` | **xanh** → test không với tới nhánh |
| lưới quét theo thứ tự ngược | 2 đỏ |
| chấm vẽ đè lên nhãn luật | 1 đỏ |
| `incident` không được thử ở chỗ chạm | 2 e2e đỏ |

Dòng thứ hai là bài học M48 **lần thứ ba trong đợt này**: chuỗi dùng làm giá đỡ đi sân so
**giá trị** (8 lượt), nên trần tám không bao giờ chạm tới ở đó. Phải hỏi ở sân so **tập
nghiệm** (24 lượt) — và ở đó test khẳng định luôn cả điều đáng nói nhất: *phép kiểm chạy
24 lần, dải chỉ giữ 8*.

2976 test xanh, 82 e2e xanh, 111 bài validate sạch.
