# CombViz — Engine đại số phủ được bao nhiêu phần trăm?

Trạng thái: **ước lượng chuyên gia, không phải điều tra** · Viết: 2026-08-01 (M70,
sau freeze schema `1.0.0`) · Đo lại: 2026-08-02 (sau M71–M73, loạt bài hàm sinh,
AL-20, loạt bài lượng giác) · Nợ này có tên từ `ENGINE-ALGEBRA.md` §19 mục 3.

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
| Luật | **85** | `RULES.length` |
| …đã có bài dùng | **77** | quét `config.steps[].rule` toàn kho |
| …chưa bài nào dùng | **8** | xem §5 |
| Kiểu nút `Expr` | **16** | `EXPR_KINDS.length` |
| Sân kiểm | **4** | $\mathbb{F}_p$ · thực · nguyên · chuỗi hệ số |
| Hợp đồng kiểm | **7** | `sameValue`, `sameSolutionSet`, `implies`, `root`, `instance`, `binding`, `claim` |
| Hàm không-đa-thức | **9** | `binom cos exp fact ln log perm sin tan` |
| Bài dùng engine | **47 / 152** | `engines_used` chứa `algebra` |
| …bật hộp cát | **5** | `kind` khác `illustration` — xem `ENGINE-ALGEBRA.md` §54, §54c, §54e |

Bảng này đi từ $73$ luật lên $80$ kể từ lượt đo M70 — bảy luật, và đúng bảy: M71 thêm
`sum_telescope` + `specialize`, M72 thêm bốn luật `coeff_*`, AL-20 thêm
`partial_fractions`. Số luật **chưa bài nào dùng** tụt $13 \to 12$ ở loạt bài hàm sinh
(`sum_const` rời danh sách), rồi $12 \to 8$ ở loạt bài lượng giác. Đó là con số đáng
nhìn nhất trong bảng, vì nó là con số duy nhất **có thể xấu đi** trong khi mọi con số
khác đẹp lên: mỗi luật thêm vào mà không có bài dùng thì nó tăng.

Lượt $12 \to 8$ là lượt đầu tiên con số ấy tụt vì **nội dung** chứ không vì một luật
mới tình cờ có bài — ba bài lượng giác soạn ra đúng để tiêu bốn năng lực §5 đã chỉ mặt
đặt tên, và không luật nào thêm vào ở lượt ấy. Nên đây là phép đo sạch nhất của cái
nhịp mà §5 đòi: **năng lực trước, nội dung sau, và nội dung phải thật sự tới**.

Rồi lượt bất đẳng thức (AL-21) thêm **hai** luật và tiêu **hết cả hai** trong cùng một
commit; AL-22 thêm một, tiêu một; AL-24 cũng thế. Nên con số đứng yên ở $8$ suốt bốn lượt
liền dù tập luật đi từ $80$ lên $84$. Đó là lý do thứ tự các lượt được ghim từ đầu: soạn nội dung
trước, thêm năng lực sau, và mỗi năng lực mới đi kèm bài dùng nó — chứ không phải cài
luật rồi hy vọng.

Từ lượt này con số ấy **có răng**: `tools/pipeline/test/trigonometry.test.ts` quét kho
rồi so với cả con số ở bảng trên, danh sách tên ở §5, lẫn chữ đếm trong tiêu đề §5.
Trước đó nó là một khẳng định tự khai *"đo bằng máy"* mà không máy nào đo lại — đúng
lớp lỗi mà lượt soát tài liệu tìm thấy mười hai lần trong cùng ngày.

Dòng **hộp cát** mới ở bảng trên đo một thứ khác hẳn: không phải engine biết làm gì, mà
**nội dung có đi qua đường tương tác không**. Nó đứng ở $0/43$ suốt từ M65 — cả đường
`applyRule` / `moveRefusal` / `movesAtElement` cùng ba validator dựng xong rồi không bài
nào bật. AL-23 đưa nó lên $3/44$, và lượt đi đầu tiên ấy tìm ra một chốt canh **luôn
xanh** đã sống từ AL-07 (`ENGINE-ALGEBRA.md` §54.2). Đó là lý do con số này đáng có mặt
trong bảng dù nó không đo năng lực: **một năng lực chưa nội dung nào đi qua là một năng
lực chưa ai kiểm.**

Rồi AL-27 đưa nó lên $5/45$ bằng một đường khác hẳn ba bài đầu: đích khai ở **bước**, và
bước nói luôn hộp cát **mở ở đâu**. Không bài nào bị sửa một dòng minh hoạ nào — chuyện
ấy trước AL-27 là không làm được, vì hộp cát luôn mở ở cuối chuỗi nên một đích có nghĩa
đòi phải cắt bớt chính minh hoạ. `ENGINE-ALGEBRA.md` §54e.

Trước đó AL-25 kéo nó xuống $2/45$, và **đi xuống ở đây cũng là đi đúng**:
`extraneous-root-by-squaring` trả về `illustration` vì cổng mới đếm 11 thế ở độ sâu 1 và
42 ở độ sâu 2 mà validator của nó không đỏ lần nào — bài nói về phép *bình phương*, còn
chốt canh nói về phép *chia*. Con số này đo **nội dung có đường tương tác nào đáng nghịch
không**, nên nó phải giảm được; một con số chỉ biết tăng là một chỉ tiêu, không phải một
phép đo.

Cả hai con số cuối bảng đều có răng — `tools/pipeline/test/trigonometry.test.ts` quét kho
thật rồi so với đúng chữ in ở đây.

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

### 4.1 Bất đẳng thức — họ lớn nhất, phần **có tên** đã đóng ✅ AL-21

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

**Làm rồi, 2026-08-02.** `am_gm` và `cauchy_schwarz` (dạng Engel) vào engine đúng
khuôn đoán ở trên: `verify: 'implies'`, `Guard` có cấu trúc, dòng đỏ điều kiện. Ba bài
dùng chúng. Chi tiết ở `ENGINE-ALGEBRA.md` §52.

Một chỗ **đoán sai**, và nó đáng ghi vì nó là bài học chứ không phải một chi tiết: đoạn
trên nói bất đẳng thức có tên *"kiểm được bằng bốc điểm"*. Đúng cho Cauchy, **sai cho
AM–GM**. Đề xuất chiều sai — từ $a+b \ge 1$ suy ra $2\sqrt{ab} \ge 1$ — rồi hỏi
`impliesSolutionSet`: *"kéo theo đúng trên 205 điểm"*. Phản ví dụ cần $ab < \tfrac14$
kèm $a+b \ge 1$, tức một số lớn và một số rất nhỏ, mà bộ lấy mẫu cố ý tránh lân cận $0$.
Nên chiều phải quyết bằng **cấu trúc**, và bốc điểm ở lại làm lưới thứ hai. §52.2 ghi
đủ; ở đây chỉ cần nhớ một câu: *một chốt canh luôn xanh là chốt canh không có*.

**Và nhánh giả thiết cũng làm rồi, 2026-08-03 (AL-28).** Luật `wlog` khai một thứ tự, và
thứ tự ấy **sống tới hết chuỗi** — trường `standing` trên `RuleOutcome`, khác `guard` ở
đời sống chứ không ở hình dạng. Hai bài dùng nó. `ENGINE-ALGEBRA.md` §55.

Ba chỗ đáng ghi, và cả ba đều là **phép đo bác lại một câu đoán**:

- Đoạn ngay trên gọi đây là *"chỗ đắt"*. Nó rẻ hơn tưởng, vì WLOG không phải **rẽ nhánh**
  — nó thu hẹp miền về **một** nhánh, và nhánh kia là chính bài này với hai tên hoán vị.
  Cái đắt thật là *tách trường hợp*, một khái niệm khác và vẫn chưa có.
- Chứng chỉ đối xứng **không** dựng được bằng `same` + `normalize`: `normalize` chỉ làm
  phẳng `add`/`mul` chứ không sắp đối số, nên hoán vị một biểu thức đối xứng hoàn toàn
  vẫn cho `false`. Phải có một khoá chuẩn giao hoán riêng — và riêng thật, không sửa
  `normalize`, vì sửa nó là đổi nghĩa `same` ở 84 luật còn lại.
- Bốc điểm **không** canh được cái biên. $a \ge b$ cho phép $a = b$, và nhân một bất đẳng
  thức *ngặt* với $0$ là sai — nhưng biên ấy có độ đo $0$, nên bộ bốc điểm thực không bao
  giờ rơi trúng. Đo được: bỏ mệnh đề canh nó đi thì `unsound` vẫn rỗng. Lại đúng câu của
  §52.2, ở một chỗ mới: *một chốt canh luôn xanh là chốt canh không có*.

Ô "Phủ" của họ này vẫn **chưa ước lại**, và vẫn vì cùng một lý do: ước mà không đếm là
bịa. Phần *có tên* đóng ở AL-21, phần *nhánh giả thiết* đóng ở AL-28, nhưng "phủ bao
nhiêu phần trăm đề bất đẳng thức olympiad" thì chỉ trả lời được bằng §6 — phân loại một
danh sách đề thật rồi **thử soạn**. Cho tới lúc ấy con số $5\%$ đứng nguyên: nó là con số
cuối cùng có người đếm.

### 4.2 Phương trình hàm — 20%, đã đi từ **0** lên ~25% ✅ M73, nửa sau ✅ AL-22/AL-24

Câu cũ ở đây: *"engine không có ký hiệu hàm không diễn giải, nên $f(x+y) = f(x) + f(y)$
**viết ra cũng không được**, chứ chưa nói kiểm."* M73 đóng đúng câu ấy — nút `ufn` cho
ký hiệu hàm không diễn giải, luật `specialize` cho bước *"thay $y := 0$"*, và
`functional-equation-cauchy` là bài đầu tiên đi hết một mạch Cauchy trong engine.

Vì sao **~25% chứ không phải ~60%**: viết ra được và thế được là hai bước đầu, không
phải cả lời giải. Mạch phương trình hàm thi đấu gần như luôn kết bằng một **kết luận
về hàm** — đơn ánh, toàn ánh, đơn điệu, "vậy $f$ là hằng" — và engine chưa có khái
niệm nào để giữ những kết luận ấy. Nó giữ được *chuỗi thế*, chưa giữ được *điều rút
ra từ chuỗi thế*.

**Làm rồi, 2026-08-02 (AL-22).** Tính chất của hàm khai thành **giả thiết của scene**
(`config.assume`, schema `1.6.0`), và `use_injective` tiêu thụ nó — bóc $f$ khỏi hai vế
một dấu bằng, kiểm bằng cây. Chi tiết ở `ENGINE-ALGEBRA.md` §53.

Chỗ đáng ghi là **vì sao phải bump schema** thay vì cho luật nhận tên hàm qua `arg`:
bước khai lấy bước dùng thì không ai đối chiếu được, nên tác giả gọi luật trên một hàm
chẳng đơn ánh gì mà engine im lặng cho qua. Khai một lần ở scene thì `readAlgebra` **từ
chối** mọi lượt dùng chưa được khai — luật mới có răng ở tầng **nội dung**, không chỉ
tầng cây. Giá là một minor + một migration đồng nhất, đúng khuôn năm lần trước.

**Và nửa sau của nửa sau, 2026-08-02 (AL-24).** `use_monotone` là thành viên thứ hai:
`"f: tăng ngặt"` giữ dấu, `"f: giảm ngặt"` **lật** dấu, và cả hai bóc được mọi quan hệ
trừ `!=`. Nó không đụng một dòng nào của hạ tầng AL-22 — chỉ thêm hai chuỗi vào bảng
tính chất và một mệnh đề lật dấu — nên đây là phép thử xác nhận khuôn kia thật là khuôn.
`ENGINE-ALGEBRA.md` §54b.

Ô này chưa ước lại: hai tính chất (đơn ánh, đơn điệu ngặt) chưa phải cả họ *"kết luận về
hàm"* — toàn ánh và *"$f$ là hằng"* vẫn nguyên. Điều **đã** đổi là khuôn để thêm chúng
vào nay đã chạy qua **hai** luật và hai bài thật, tức nó không còn là một khuôn suy đoán.

**Nhưng khuôn ấy không đỡ được toàn ánh, và câu cũ ở đây nói ngược** — sửa 2026-08-03,
tìm ra lúc dò kế hoạch AL-28. Khuôn là `peelSameFunction`: **bóc $f$ khỏi hai vế** một
quan hệ. Toàn ánh không có hình dạng đó — nó **sinh** một biến mới ($\forall y\, \exists x:
f(x) = y$), và `binding` cũng không đỡ được vì $t$ ấy không có biểu thức định nghĩa để
`model` thế ngược mà so. Nó là một **hợp đồng mới**, không phải một dòng thêm vào bảng
tính chất.

Ghi ra vì cái sai này đúng lớp lỗi trội của kho — *một khẳng định mà mã không đỡ* — và
lần này nó nằm trong tài liệu **lập kế hoạch**, chỗ nó sẽ định giá sai một hạng mục chưa
làm. Đơn điệu ngặt thật sự là "điền vào khuôn" và đã chứng minh thế; suy ra rằng mọi
thành viên còn lại của họ cũng thế là suy quá tay.

### 4.3 Engine này phục vụ ai

Cột "phổ thông" cho ~88%, và **47/152 bài** của kho đang dùng nó. Nếu bộ mặt của
kho là chuyên đề bắc cầu phổ thông → chuyên, thì engine đã gần xong việc và ba mục
M71–M73 là mở rộng biên, không phải lấp lỗ. Nếu bộ mặt là olympiad thuần, thì
§4.1 là việc lớn nhất còn lại của cả dự án, và §4.2 là việc lớn thứ hai — nhưng
§4.2 nay là **nửa sau** của một cánh cửa đã mở, không còn là một cánh cửa đóng.

Bảng này **không** trả lời câu ấy — đó là câu của chính chủ. Nó chỉ làm cho hai
lựa chọn có giá đọc được.

---

## 5. Tám luật chưa bài nào dùng

Đo bằng máy, và nó là một danh sách đáng đọc chứ không phải rác: mỗi luật ở đây là
một năng lực **đã trả tiền** mà chưa thu về nội dung nào.

```
log_exp log_quotient pow_add pow_mul pow_split power_to_root root_to_power split_fraction
```

Sau lượt lượng giác thì danh sách chỉ còn **một** nhóm, và đó là nhóm không cần chữa:

- **Anh em của luật đã dùng** (`pow_add`/`pow_mul`/`pow_split`, `root_to_power` ↔
  `power_to_root`, `log_quotient`, `log_exp`, `split_fraction`): có vì bộ luật
  phải **đóng** — thiếu chiều ngược thì người học đi tới mà không đi lui được.
  Không cần bài riêng.
- Không luật nào ở đây là luật chết cần gỡ.

**Bốn luật lượng giác rời danh sách** (2026-08-02): `double_angle`, `product_to_sum`,
`sum_to_product`, `pythagorean_identity` — đúng nhóm mà bản trước của mục này gọi là
*"chỗ đáng soạn nội dung nhất trong danh sách"*. Ba bài tiêu chúng:

| bài | luật tiêu được |
|---|---|
| `trig-square-of-sum` | `pythagorean_identity`, `double_angle` |
| `trig-sum-and-product` | `sum_to_product`, `product_to_sum` |
| `trig-equation-double-angle` | `double_angle` — chỗ nó **làm việc**, không chỉ minh hoạ |

Hai chỗ đáng ghi, vì cả hai là ràng buộc thật của engine chứ không phải lựa chọn thẩm mỹ:

- **Cả bốn luật chỉ đi một chiều, và là cùng một chiều.** `pythagorean_identity` chỉ
  nuốt $\sin^2 + \cos^2 \to 1$; `double_angle` chỉ bung $\sin 2x \to 2\sin x\cos x$.
  Nên bài phải soạn *xuôi theo dòng*: không dựng được lời giải nào cần gấp $2\sin x\cos
  x$ ngược lại thành $\sin 2x$. Chỗ ấy đi vòng bằng một **phép kiểm đẳng thức** — đặt
  hai vế cạnh nhau rồi bung vế phải cho tới khi hai vế trùng nhau từng ký hiệu, đúng như
  bước 2 của `trig-square-of-sum`. Cách vòng ấy không phải một mẹo che: nó **đúng hơn**,
  vì thứ hiện ra trên hình là một phép kiểm chứ không phải một phép biến đổi giả vờ.
- **`cancel_common` nhận một thừa số mỗi lần.** Rút $2\cos\frac{a-b}{2}$ trong một lượt
  bị từ chối; phải hai bước — và hai bước ấy hoá ra **dạy được**: bước rút $2$ im lặng,
  bước rút $\cos\frac{a-b}{2}$ kèm một dòng điều kiện đỏ, nên người học nhìn thấy ngay
  vì sao chỉ một trong hai cần điều kiện.

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
