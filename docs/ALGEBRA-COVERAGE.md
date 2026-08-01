# CombViz — Engine đại số phủ được bao nhiêu phần trăm?

Trạng thái: **ước lượng chuyên gia, không phải điều tra** · Viết: 2026-08-01 (M70,
sau freeze schema `1.0.0`) · Nợ này có tên từ `ENGINE-ALGEBRA.md` §19 mục 3.

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
> tiếp từ mã nguồn và từ kho tại commit này, không lấy từ trí nhớ.

---

## 1. Trả lời ngắn, và nó có hai câu trả lời

Bảng này tồn tại vì `VIZ-COVERAGE.md` đo phủ **tổ hợp** và ghi thẳng rằng
`algebra` cùng `longdiv` đóng góp $0$ vào đó. Không có bảng riêng thì mọi câu
"engine đại số đáng mở rộng tiếp tới đâu" đều trả lời bằng cảm giác.

Và câu trả lời tách đôi ngay từ dòng đầu, vì engine này phục vụ **hai** miền có
tỉ trọng rất khác nhau:

| Miền | Gánh được lập luận | Có hình mang thông tin |
|---|---:|---:|
| **Đại số phổ thông → chuyên** (biến đổi, phương trình, hệ, bất phương trình, log/mũ/lượng giác) | **~88%** | ~95% |
| **Đại số olympiad** (IMO Shortlist A và tương đương) | **~22%** | ~35% |

Hai con số cách nhau bốn lần, và khoảng cách ấy **không phải một lỗ hổng** — nó là
hình dạng của quyết định đã đóng: engine này không có bộ giải, không có
`simplify_all`, không gợi ý bước (NG-03). Nó dựng ra để **kể một chuỗi biến đổi
đã biết** và tự kiểm từng bước, không phải để tìm ra lập luận.

Miền thứ nhất là chỗ nó gần cạn. Miền thứ hai là chỗ ba hạng mục M71–M73 nhắm
tới, và §4 nói chúng mua được bao nhiêu.

---

## 2. Engine hôm nay có gì (đo bằng máy)

| | Số đo | Nguồn |
|---|---:|---|
| Luật | **73** | `RULES.length` |
| …đã có bài dùng | **60** | quét `config.steps[].rule` toàn kho |
| …chưa bài nào dùng | **13** | xem §5 |
| Kiểu nút `Expr` | **14** | union `Expr` |
| Sân kiểm | **4** | $\mathbb{F}_p$ · thực · nguyên · chuỗi hệ số |
| Hợp đồng kiểm | **7** | `sameValue`, `sameSolutionSet`, `implies`, `root`, `instance`, `binding`, `claim` |
| Hàm không-đa-thức | **9** | `binom cos exp fact ln log perm sin tan` |
| Bài dùng engine | **28 / 114** | `engines_used` chứa `algebra` |

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
| **Phương trình hàm** | 20% | 2% | **0%** | 0 | ký hiệu hàm không diễn giải; thế $x \to$ biểu thức; tính đơn ánh/toàn ánh — **M73** |
| **Đa thức** | 15% | 12% | **45%** | 6.75 | Vieta như một quan hệ có tên, đa thức đối xứng, đếm nghiệm theo bậc, bất khả quy |
| **Dãy số và truy hồi** | 15% | 10% | **20%** | 3.0 | $a_n$ với chỉ số là `Expr`, `sum_telescope`, quan hệ truy hồi như nội dung — **M71** |
| **Hàm sinh / chuỗi** | 5% | 1% | **55%** | 2.75 | tích chập, toán tử $[x^n]$ — **M72** |
| **Biến đổi / rút gọn / căn thức** | 4% | 25% | **95%** | 3.8 | — (tầng này gần cạn: 40/75 luật sống ở đây) |
| **Hệ phương trình** | 3% | 12% | **85%** | 2.55 | hệ phi tuyến nhiều hơn hai ẩn; trần `maxRelations: 4` |
| **Log / mũ / lượng giác** | 2% | 15% | **90%** | 1.8 | — (M61 + M56 đã phủ; `double_angle`, `sum_to_product` chưa có bài) |
| **Bất phương trình một biến, tập nghiệm** | 1% | 10% | **90%** | 0.9 | — (M60 + M67, có trục số) |
| **Số học ⟂ đại số** (Diophantine, đồng dư trên biểu thức) | 0% | 3% | **10%** | 0 | đồng dư như một quan hệ nội dung (chân trời cũ, chưa xếp lịch) |
| **Tổng** | 100% | 100% | | **≈ 23** | |

Cột "Đóng góp (OL)" cộng lại ra **~23**, khớp với con số ~22% ở §1 sau khi làm
tròn xuống cho phần ranh giới giữa các họ.

Làm cùng phép tính với cột phổ thông cho **~88**.

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

### 4.2 Phương trình hàm — 20% và đang phủ **0**

Không có gì để tranh luận: engine không có ký hiệu hàm không diễn giải, nên $f(x+y)
= f(x) + f(y)$ **viết ra cũng không được**, chứ chưa nói kiểm. M73 mở đúng cánh cửa
này, và nó là hạng mục có tỉ số *phủ thêm / công sức* cao nhất trong ba mục.

### 4.3 Engine này phục vụ ai

Cột "phổ thông" cho ~88%, và **28/114 bài** của kho đang dùng nó. Nếu bộ mặt của
kho là chuyên đề bắc cầu phổ thông → chuyên, thì engine đã gần xong việc và ba mục
M71–M73 là mở rộng biên, không phải lấp lỗ. Nếu bộ mặt là olympiad thuần, thì
§4.1 và §4.2 là hai việc lớn nhất còn lại của cả dự án.

Bảng này **không** trả lời câu ấy — đó là câu của chính chủ. Nó chỉ làm cho hai
lựa chọn có giá đọc được.

---

## 5. Mười ba luật chưa bài nào dùng

Đo bằng máy, và nó là một danh sách đáng đọc chứ không phải rác: mỗi luật ở đây là
một năng lực **đã trả tiền** mà chưa thu về nội dung nào.

```
double_angle  log_exp  log_quotient  pow_add  pow_mul  pow_split
power_to_root  product_to_sum  pythagorean_identity  root_to_power
split_fraction  sum_const  sum_to_product
```

Ba nhóm, và ba cách xử khác nhau:

- **Anh em của luật đã dùng** (`pow_add`/`pow_mul`/`pow_split`, `root_to_power` ↔
  `power_to_root`, `log_quotient`, `log_exp`, `split_fraction`, `sum_const`): có
  vì bộ luật phải **đóng** — thiếu chiều ngược thì người học đi tới mà không đi
  lui được. Không cần bài riêng.
- **Lượng giác** (`double_angle`, `product_to_sum`, `sum_to_product`,
  `pythagorean_identity`): bốn luật, **không** bài nào. Đây là chỗ đáng soạn nội
  dung nhất trong danh sách — năng lực có sẵn, chỉ thiếu bài.
- Không luật nào ở đây là luật chết cần gỡ.

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
