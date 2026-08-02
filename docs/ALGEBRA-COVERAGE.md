# CombViz — Engine đại số phủ được bao nhiêu phần trăm?

Trạng thái: **ước lượng chuyên gia, không phải điều tra** · Viết: 2026-08-01 (M70,
sau freeze schema `1.0.0`) · Đo lại: 2026-08-02 (sau M71–M73, loạt bài hàm sinh,
AL-20) · Nợ này có tên từ `ENGINE-ALGEBRA.md` §19 mục 3.

> **Đọc con số ở đây đúng cách.**
>
> Cùng phương pháp và cùng giới hạn với `VIZ-COVERAGE.md`: mọi phần trăm là tích
> của hai đại lượng do *một người* ước lượng — tỉ trọng từng họ bài trong đề thi,
> và tỉ lệ bài trong họ đó mà engine **gánh nổi lập luận**. Sai số thực tế ±5–8
> điểm.
>
> Muốn có số thật thì phân loại một danh sách thật: toàn bộ mục **A** của IMO
> Shortlist 2010–2024 (~75 bài) cộng một tập đề quốc gia. §6 nói cách làm.
>
> **Phần đo bằng máy thì không ước lượng.** Mọi con số trong §2 và §5 lấy trực
> tiếp từ mã nguồn và từ kho tại commit này, không lấy từ trí nhớ. Hai loại số ấy
> già đi theo hai nhịp khác nhau, nên chúng phải được đo lại theo hai nhịp khác
> nhau: §2/§5 lệch một hạng mục là sai ngay, còn §1/§3 chỉ đổi khi một **năng lực**
> đổi. Lượt 2026-08-02 đo lại §2/§5 bằng máy và chỉ sửa ở §1/§3 những ô mà một
> hạng mục có tên đã đóng.

---

## 1. Trả lời ngắn, và nó có hai câu trả lời

Bảng này tồn tại vì `VIZ-COVERAGE.md` đo phủ **tổ hợp** và ghi thẳng rằng
`algebra` cùng `longdiv` đóng góp $0$ vào đó. Không có bảng riêng thì mọi câu
"engine đại số đáng mở rộng tiếp tới đâu" đều trả lời bằng cảm giác.

Và câu trả lời tách đôi ngay từ dòng đầu, vì engine này phục vụ **hai** miền có
tỉ trọng rất khác nhau:

| Miền | Gánh được lập luận | Có hình mang thông tin |
|---|---:|---:|
| **Đại số phổ thông → chuyên** (biến đổi, phương trình, hệ, bất phương trình, log/mũ/lượng giác) | **~88%** (ước lượng trần, §3 không đỡ) | ~95% |
| **Đại số olympiad** (IMO Shortlist A và tương đương) | **~33%** (M70 ước ~22%) | ~35% (chưa ước lại) |

Con số olympiad đi từ ~22% lên ~33% sau M71 (dãy số), M72 (hàm sinh tầng hai), M73
(phương trình hàm) và AL-20 (phân thức riêng phần) — ba trong bốn hạng mục ấy chính
là ba dòng mà lượt M70 chỉ mặt đặt tên.

**Nói cho rõ ~33% ấy là loại số gì:** nó cộng từ cột "Đóng góp (OL)" của §3, mà cột
ấy nhân tỉ trọng họ bài với một ô **"Phủ" do người ước lượng** — cùng phương pháp và
cùng sai số ±5–8 điểm như lượt M70, không phải một phép đo. Thứ *đã* đo bằng máy là
năng lực đứng sau mỗi ô (luật nào có, bài nào chạy được), và mỗi ô sửa đều ghi hạng
mục có tên ở cột "Thiếu gì". Ba ô còn lại của bảng không đụng tới.

Hai cột **không** đổi ở lượt này, và cả hai đều cố ý: cột phổ thông, vì không hạng
mục nào trong bốn cái đó nhắm vào miền ấy (xem cảnh báo cuối §3 — chỗ ~88% vốn không
rơi ra từ bảng nào); và cột "có hình mang thông tin", vì nó chưa được ước lại — sửa
nó mà không ước là bịa.

Hai con số cách nhau gần ba lần, và khoảng cách ấy **không phải một lỗ hổng** — nó là
hình dạng của quyết định đã đóng: engine này không có bộ giải, không có
`simplify_all`, không gợi ý bước (NG-03). Nó dựng ra để **kể một chuỗi biến đổi
đã biết** và tự kiểm từng bước, không phải để tìm ra lập luận.

Miền thứ nhất là chỗ nó gần cạn. Miền thứ hai là chỗ ba hạng mục M71–M73 nhắm tới —
**cả ba đã xong**, và §3 ghi chúng mua được đúng bao nhiêu. §4 giữ nguyên phần chưa
xong, và chỗ chưa xong lớn nhất vẫn là §4.1.

---

## 2. Engine hôm nay có gì (đo bằng máy)

| | Số đo | Nguồn |
|---|---:|---|
| Luật | **80** | `RULES.length` |
| …đã có bài dùng | **68** | quét `config.steps[].rule` toàn kho |
| …chưa bài nào dùng | **12** | xem §5 |
| Kiểu nút `Expr` | **16** | `EXPR_KINDS.length` |
| Sân kiểm | **4** | $\mathbb{F}_p$ · thực · nguyên · chuỗi hệ số |
| Hợp đồng kiểm | **7** | `sameValue`, `sameSolutionSet`, `implies`, `root`, `instance`, `binding`, `claim` |
| Hàm không-đa-thức | **9** | `binom cos exp fact ln log perm sin tan` |
| Bài dùng engine | **36 / 141** | `engines_used` chứa `algebra` |

Bảng này đi từ $73$ luật lên $80$ kể từ lượt đo M70 — bảy luật, và đúng bảy: M71 thêm
`sum_telescope` + `specialize`, M72 thêm bốn luật `coeff_*`, AL-20 thêm
`partial_fractions`. Số luật **chưa bài nào dùng** vẫn tụt $13 \to 12$ (`sum_const`
rời danh sách ở loạt bài hàm sinh). Đó là con số đáng nhìn nhất trong bảng, vì nó là
con số duy nhất **có thể xấu đi** trong khi mọi con số khác đẹp lên: mỗi luật thêm vào
mà không có bài dùng thì nó tăng, và nó đã không tăng.

Trần cứng đáng nhớ khi đọc bảng §3: `maxSteps: 12` (một scene tối đa 12 bước),
`maxVars: 6`, `maxRelations: 4`, `maxDegree: 64`.

---

## 3. Phân bố họ bài, và engine phủ tới đâu

Trọng số cột 2 là tỉ trọng ước lượng **trong đề đại số olympiad** (IMO Shortlist A
và tương đương). Cột "phổ thông" ghi tỉ trọng của cùng họ ấy trong chương trình
chuyên/ôn thi — hai cột lệch nhau rất mạnh, và đó chính là lý do §1 có hai con số.

| Họ bài | Olympiad | Phổ thông | Phủ | Đóng góp (OL) | Thiếu gì |
|---|---:|---:|---:|---:|---|
| **Bất đẳng thức** | 35% | 10% | **5%** | 1.75 | AM–GM, Cauchy–Schwarz, sắp xếp lại, SOS, "không mất tổng quát giả sử $a\ge b\ge c$" — xem §4.1 |
| **Phương trình hàm** | 20% | 2% | **25%** | 5.0 | ✅ M73 mở `ufn` + `specialize`; còn thiếu tính đơn ánh/toàn ánh như một **kết luận** máy giữ được |
| **Đa thức** | 15% | 12% | **45%** | 6.75 | Vieta như một quan hệ có tên, đa thức đối xứng, đếm nghiệm theo bậc, bất khả quy |
| **Dãy số và truy hồi** | 15% | 10% | **45%** | 6.75 | ✅ M71 mở $a_n$ chỉ số `Expr` + `sum_telescope`; còn thiếu giải truy hồi tuyến tính ra dạng đóng (xem nợ Binet ở §5) |
| **Hàm sinh / chuỗi** | 5% | 1% | **80%** | 4.0 | ✅ M72 tích chập + $[x^n]$, AL-20 phân thức riêng phần; còn thiếu $\frac{1}{1-P(x)}$ với $\deg P \ge 2$ |
| **Biến đổi / rút gọn / căn thức** | 4% | 25% | **95%** | 3.8 | — (tầng này gần cạn: **33/80** luật nằm trong ba lớp lõi/hằng đẳng thức/căn–luỹ thừa của `ENGINE-ALGEBRA.md` §20) |
| **Hệ phương trình** | 3% | 12% | **85%** | 2.55 | hệ phi tuyến nhiều hơn hai ẩn; trần `maxRelations: 4` |
| **Log / mũ / lượng giác** | 2% | 15% | **90%** | 1.8 | — (M61 + M56 đã phủ; `double_angle`, `sum_to_product` chưa có bài) |
| **Bất phương trình một biến, tập nghiệm** | 1% | 10% | **90%** | 0.9 | — (M60 + M67, có trục số) |
| **Số học ⟂ đại số** (Diophantine, đồng dư trên biểu thức) | 0% | 3% | **10%** | 0 | đồng dư như một quan hệ nội dung (chân trời cũ, chưa xếp lịch) |
| **Tổng** | 100% | 100% | | **≈ 33** | |

Cột "Đóng góp (OL)" cộng lại ra **~33**, và đó là con số thay cho ~22% ở §1: ba hạng
mục M71–M73 cộng AL-20 đóng đúng ba ô mà lượt M70 ghi là chỗ hụt lớn nhất sau bất
đẳng thức. Mười điểm ấy **không** phải engine bỗng khá lên đồng đều — nó nằm gọn
trong ba dòng, và dòng lớn nhất (bất đẳng thức, 35%) không nhúc nhích.

**Một chỗ lệch phải ghi ra, không phải chữa lén.** Câu cũ ở đây viết *"làm cùng phép
tính với cột phổ thông cho ~88"*. Làm thật thì không ra: $\sum(\text{Phổ thông} \times
\text{Phủ})$ cho **~68** với số hôm nay (và **~65** với số của lượt M70). Con số ~88%
ở §1 chưa bao giờ rơi ra từ bảng này.

Lý do thì không phải lỗi số học, mà là lỗi cấu trúc bảng: có **một** cột "Phủ" cho
**hai** miền. Một bài bất đẳng thức phổ thông phần lớn là biến đổi tương đương —
engine gánh được; một bài bất đẳng thức olympiad thì không, và cùng ô $5\%$ đang
phải nói cả hai. Muốn §1 có bảng đỡ thì phải **đo thêm một cột** *Phủ (phổ thông)*,
mười ô, bằng đúng cách §6 mô tả. Cho tới lúc ấy: **~33% là số có bảng đỡ, ~88% là
ước lượng trần trụi** — đọc §1 với chênh lệch đó trong đầu.

---

## 4. Ba quyết định mà bảng này ép phải đối mặt

### 4.1 Bất đẳng thức — họ lớn nhất, và engine đang phủ 5%

Đây là con số quan trọng nhất trong tài liệu. Một phần ba đề đại số olympiad là
bất đẳng thức, và engine hôm nay chỉ làm được phần **biến đổi tương đương**: nhân
hai vế (có guard dấu), chuyển vế, rút gọn. Bước mang nội dung — *"AM–GM cho ba số
này"* — không có tên, nên nó phải viết thành một `add_both_sides` nào đó và lời
giải mất đúng câu đáng dạy.

Hỏi tiếp thì lộ ra một chuyện **hợp với kiến trúc hiện có** hơn tưởng: bất đẳng
thức kinh điển là các luật **có tên, có điều kiện, và kiểm được bằng bốc điểm**.
`sameSolutionSet` đã bốc điểm trên `rel` từ M50 và đã bắt được đúng lỗi
"nhân hai vế số âm không đổi chiều". Một luật `am_gm` với guard $a,b,c > 0$ nằm
gọn trong khuôn ấy: `verify: 'implies'`, guard có cấu trúc, dòng đỏ điều kiện.

Cái **không** nằm gọn là "không mất tổng quát giả sử $a \ge b \ge c$": nó là một
bước về *cấu trúc chứng minh*, không phải một phép biến đổi cây. Nó đòi một khái
niệm mà engine chưa có — nhánh giả thiết — và đó mới là chỗ đắt.

Chưa xếp lịch. Ghi ra đây để lần sau bàn thì bàn trên số, không trên cảm giác.

### 4.2 Phương trình hàm — 20%, đã đi từ **0** lên ~25% ✅ M73

Câu cũ ở đây: *"engine không có ký hiệu hàm không diễn giải, nên $f(x+y) = f(x) + f(y)$
**viết ra cũng không được**, chứ chưa nói kiểm."* M73 đóng đúng câu ấy — nút `ufn` cho
ký hiệu hàm không diễn giải, luật `specialize` cho bước *"thay $y := 0$"*, và
`functional-equation-cauchy` là bài đầu tiên đi hết một mạch Cauchy trong engine.

Vì sao **~25% chứ không phải ~60%**: viết ra được và thế được là hai bước đầu, không
phải cả lời giải. Mạch phương trình hàm thi đấu gần như luôn kết bằng một **kết luận
về hàm** — đơn ánh, toàn ánh, đơn điệu, "vậy $f$ là hằng" — và engine chưa có khái
niệm nào để giữ những kết luận ấy. Nó giữ được *chuỗi thế*, chưa giữ được *điều rút
ra từ chuỗi thế*. Đó là hạng mục kế tiếp của họ này, và nó chưa xếp lịch.

### 4.3 Engine này phục vụ ai

Cột "phổ thông" cho ~88%, và **36/141 bài** của kho đang dùng nó. Nếu bộ mặt của
kho là chuyên đề bắc cầu phổ thông → chuyên, thì engine đã gần xong việc và ba mục
M71–M73 là mở rộng biên, không phải lấp lỗ. Nếu bộ mặt là olympiad thuần, thì
§4.1 là việc lớn nhất còn lại của cả dự án, và §4.2 là việc lớn thứ hai — nhưng
§4.2 nay là **nửa sau** của một cánh cửa đã mở, không còn là một cánh cửa đóng.

Bảng này **không** trả lời câu ấy — đó là câu của chính chủ. Nó chỉ làm cho hai
lựa chọn có giá đọc được.

---

## 5. Mười hai luật chưa bài nào dùng

Đo bằng máy, và nó là một danh sách đáng đọc chứ không phải rác: mỗi luật ở đây là
một năng lực **đã trả tiền** mà chưa thu về nội dung nào.

```
double_angle  log_exp  log_quotient  pow_add  pow_mul  pow_split
power_to_root  product_to_sum  pythagorean_identity  root_to_power
split_fraction  sum_to_product
```

Ba nhóm, và ba cách xử khác nhau:

- **Anh em của luật đã dùng** (`pow_add`/`pow_mul`/`pow_split`, `root_to_power` ↔
  `power_to_root`, `log_quotient`, `log_exp`, `split_fraction`): có vì bộ luật
  phải **đóng** — thiếu chiều ngược thì người học đi tới mà không đi lui được.
  Không cần bài riêng.
- **Lượng giác** (`double_angle`, `product_to_sum`, `sum_to_product`,
  `pythagorean_identity`): bốn luật, **không** bài nào. Đây là chỗ đáng soạn nội
  dung nhất trong danh sách — năng lực có sẵn, chỉ thiếu bài.
- Không luật nào ở đây là luật chết cần gỡ.

**`sum_const` rời danh sách** ở loạt bài hàm sinh (2026-08-02) — bảy luật mới vào từ
lượt M70 mà danh sách này ngắn đi một, không dài ra. Cách duy nhất giữ được nhịp ấy
là dò luật qua `readAlgebra` **trước khi** viết chữ narrative, chứ không phải cài luật
rồi hy vọng có bài dùng.

### 5.1 Nợ có tên của họ hàm sinh

Hai món, ghi ra để lần sau bàn thì bàn trên chỗ đã vạch chứ không bàn lại từ đầu:

- **Binet / truy hồi tuyến tính ra dạng đóng.** $\frac{1}{1-x-x^2}$ cần phân tích
  trên $\mathbb{Q}(\sqrt5)$; `partial_fractions` (AL-20) chỉ nhận nghiệm hữu tỉ phân
  biệt, và đó là một ranh giới cố ý — mở tới số vô tỉ là bắt đầu viết một CAS, đúng
  chỗ `series.ts` đã tự vạch (`fn`, `root`, `abs` → `null`).
- **$\frac{1}{1-P(x)}$ với $\deg P \ge 2$.** Cùng lý do, và cùng ranh giới.

Hai món này là **lý do ô "Hàm sinh / chuỗi" ở §3 dừng ở 80% chứ không 95%**.

---

## 6. Cách biến tài liệu này thành phép đo

Nửa ngày, và nó thay toàn bộ §3:

1. Lấy mục **A** của IMO Shortlist 2010–2024 (~75 bài) + một tập đề quốc gia
   (VMO/TST 2015–2025) để cân lại tỉ trọng cho bối cảnh Việt Nam.
2. Phân mỗi bài vào **một** họ ở §3 (họ chính, không chia phần).
3. Với mỗi bài, hỏi đúng một câu — *engine hôm nay có kể được lập luận không?* —
   rồi trả lời bằng cách **thử soạn** ba bài mỗi họ, không bằng cách đoán.
4. Thay cột "Phủ" bằng tỉ lệ đếm được, ghi ngày và commit.

Bước 3 là bước duy nhất tốn công thật, và cũng là bước duy nhất không thay thế
được: `VIZ-COVERAGE.md` §5 nói đúng chuyện ấy cho miền tổ hợp và tới nay vẫn chưa
ai làm.

---

## 7. Cái tài liệu này **không** đo

- **Chất lượng sư phạm.** Phủ được không có nghĩa dạy tốt. Style Guide lo phần ấy.
- **Miền hình học và số học thuần.** Không engine nào của kho nhắm tới chúng.
- **`longdiv`.** Bảng chia đa thức là một *bố cục*, không phải một họ bài; nó phục
  vụ họ "Đa thức" ở §3 và đã được tính vào con số 45% ở đó.
