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

Xem §21–§26 để biết tập luật thật, xếp theo ba lớp:

| lớp | luật |
|---|---|
| **lõi đại số** | `commute`, `distribute`, `factor`, `collect_like`, `eval_int`, `drop_unit`, `fold_coefficients`, `common_denominator`, `combine_fraction`, `split_fraction`, `cancel_common`, `factor_by_grouping` |
| **hằng đẳng thức & đa thức** | `expand_square`, `expand_cube`, `multiply_out`, `expand_diff_squares`, `factor_diff_squares`, `factor_cubes`, `factor_quadratic`, `complete_square`, `factor_power_difference`, `factor_power_sum_odd` |
| **căn & luỹ thừa** | `pow_add`, `pow_mul`, `root_pow`, `root_of_product`, `eval_root`, `pull_square_out`, `rationalize`, `multiply_by_conjugate`, `denest_radical`, `root_to_power`, `power_to_root` |
| **phương trình có điều kiện (★)** | `add_both_sides`, `mul_both_sides`, `pow_both_sides`, `abs_case`, `evaluate_at`, `set_variable`, `substitute`, `quadratic_formula` |

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

### 6.1 Sáu hợp đồng kiểm (M50)

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

- **Hàm siêu việt.** Không $\sin$, không $\log$. Lúc cần chúng thì đây là dự án khác,
  không phải một phiên bản sau. ($2^x$ **vẽ** được từ M49 vì số mũ là `Expr`, nhưng
  không có **luật** nào biến đổi nó — muốn có thì phải có logarit. Biểu diễn được
  không đồng nghĩa biến đổi được, và ranh giới ấy là cố ý.)
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
- **Phần nguyên, logarit.** Chưa có.
- ~~**Quy đồng, nhóm hạng tử, hoàn thành bình phương, bình phương hai vế**~~ — **đã
  làm** (M50, theo góp ý ngoài). Xem §26.
- **Căn bậc ký hiệu** ($\sqrt[n]{x}$ với $n$ là biến). `root.index` vẫn là số nguyên;
  ai cần thì viết $x^{1/n}$, nay đã có.
- **Hệ phương trình.** Cần một nút chứa **nhiều** quan hệ; chưa có. Đây là mảng lớn
  nhất còn thiếu của chương trình phổ thông. (Kế hoạch: M59.)
- **Hàm tổ hợp** $n!$, $C_n^k$, $A_n^k$ — chưa có, và với một nền tảng nhắm Olympiad
  Combinatorics thì đây là lỗ **to hơn** $\log$: chúng là ký hiệu nền của cả môn.
  (Kế hoạch: M56.)
- **Ký hiệu $\Sigma$, $\Pi$.** Cần một construct **ràng buộc biến** — thứ engine chưa
  từng có. (Kế hoạch: M57.)
- **Tập nghiệm / khoảng.** $x^2-3x+2>0$ phân tích ra $(x-2)(x-1)>0$ rồi **dừng**: không
  có nút nào để đặt đáp số. Thêm luật không cứu được, phải thêm chỗ cho kết quả rơi vào.
  (Kế hoạch: M60.)
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
