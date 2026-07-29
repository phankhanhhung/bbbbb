# CombViz — Editorial Style Guide

Trạng thái: **v0.1 — khung, chưa kết tinh** · Deliverable của AUT-10

> **Đọc phần này trước.**
>
> §16 của SRS nói rõ: *"3–5 bài đầu soạn tay hoàn toàn để Style Guide kết tinh từ
> thực tế, rồi mới bật pipeline AUT-09 — Style Guide viết trước khi soạn bài nào
> là Style Guide bịa."*
>
> Kho hiện có 2 bài, cả hai là **fixture kỹ thuật** dựng để thử engine, không
> phải bài do chính chủ soạn. Vì vậy tài liệu này cố ý chỉ chứa hai loại nội dung:
>
> - **Phần đã chốt** — những quy ước đã bị *code* ép, nên chúng đã là sự thật rồi,
>   viết ra chỉ là ghi lại.
> - **Phần bỏ ngỏ** — những quyết định biên tập chỉ trả lời được sau khi soạn thật.
>   Chúng để trống có chủ đích. Điền bừa vào đây tệ hơn để trống, vì một quy ước
>   bịa vẫn sẽ được lint enforce và sẽ định hình 25 bài.

---

## 1. Phần đã chốt (code đang ép)

### 1.1 Màu và ngữ nghĩa

`color_class` là **số**, không phải mã màu (DAT-20). Bảng màu nằm ở
`packages/theme/src/palette.ts` và là nguồn duy nhất.

| color_class | Vai trò ngữ nghĩa | Ghi chú |
|---|---|---|
| 1 | Lớp "đậm" / "đen" trong mọi lập luận tô hai màu | Bàn cờ: ô đen. Đồ thị: quan hệ thứ nhất |
| 2 | Lớp "nhạt" / "trắng" | Cặp 1–2 khác nhau về **độ sáng**, nên đọc được cả khi mất hoàn toàn cảm nhận màu |
| 3–7 | Lớp thứ ba trở đi, dùng khi `k ≥ 3` | Không mang nghĩa cố định |
| 8 | Xám than — dùng cho "loại khác / phần dư" | |
| 0 | **Chưa xét**, không phải một màu | `cell_overrides` và preset đều không sinh ra 0 |

Quy ước quan trọng nhất: **0 nghĩa là "chưa xét", không phải "màu thứ ba"**. DSL
dựa vào điều này — `c.color_class == 1` trả về `false` cho ô chưa tô thay vì lỗi.

### 1.2 Notation trong hình

Nhãn trong canvas chỉ nhận **văn bản thuần**, chưa nhận LaTeX (G-02: label atlas
còn ở M6+). Cụ thể:

- Đỉnh đồ thị: đặt tên bằng số `1, 2, 3…` hoặc chữ `a, b, c…`. Không `$v_1$`.
- Ô bàn cờ: không đặt nhãn; vị trí đã là danh tính (`cell-3-4`).
- LaTeX **được** dùng thoải mái trong `statement`, `narrative`, `case_label`,
  `invariants[].label` — những chỗ đó render bằng KaTeX.

### 1.3 Cấu trúc file

- `combviz fmt` quyết định định dạng. Không sửa tay thứ tự khoá.
- Id step: `s0, s1, …`; **không tái dùng số đã xoá** (A-02).
- Id anchor: `a1, a2, …` theo thứ tự xuất hiện trong narrative.
- Mỗi step lưu **snapshot scene đầy đủ** (DAT-11), không lưu delta.

### 1.4 `case_label`

Lint ép định dạng: `Trường hợp N: …` ở mức một, `Na: …` ở mức hai.

```
Trường hợp 1: ba cạnh đó màu 1
1a: có một cạnh màu 1 giữa chúng
```

Lý do là kỹ thuật: breadcrumb ghép chúng bằng `›`, nên chúng phải đọc được khi
đứng cạnh nhau.

### 1.5 Glossary

Kho chọn **một** cách gọi cho mỗi khái niệm (lint cảnh báo khi lệch):

| Dùng | Không dùng |
|---|---|
| hai phía | lưỡng phân |
| nguyên lý Dirichlet | nguyên lý chuồng bồ câu, pigeonhole |
| bất biến | bất biến số |
| ô | ô vuông nhỏ, hình vuông đơn vị |
| song ánh | song ánh học |

Cả hai cột đều đúng tiếng Việt. Chọn một là để người học không phải tự nhận ra
hai cách gọi là cùng một thứ — thuế nhận thức đó đánh vào đúng người ít khả năng
trả nhất.

### 1.6 Vi phạm có chủ đích

Lời giải thường phải bày ra đúng thứ sandbox cấm. Khai bằng `expects_violation`:

```json
{ "id": "s7", "expects_violation": ["no-mono-triangle"] }
```

Không khai thì lint kêu mãi; khai thừa (scene đã đổi, không còn vi phạm) thì lint
cũng kêu.

---

## 2. Phần bỏ ngỏ — chờ 5 bài soạn tay

Những mục dưới đây là **câu hỏi**, không phải câu trả lời. Điền chúng sau khi
soạn xong 3–5 bài, bằng cách nhìn lại xem mình đã thực sự làm gì.

### 2.1 Độ dài một step

- [ ] Một step nên dài bao nhiêu? Hiện lint cảnh báo ở 420 ký tự và 4 câu — **hai
      con số này là đoán**, đặt để có chỗ bám, không phải vì đã đo.
- [ ] "Một ý một step" nghĩa là gì trong thực tế? Một phép biến đổi? Một bổ đề?
- [ ] Bài IMO P1/P4 điển hình ra bao nhiêu step? (AUT-KPI giả định 15–25.)

### 2.2 Giọng văn

- [ ] Xưng hô: "ta", "chúng ta", hay không xưng?
- [ ] Có được dùng câu hỏi tu từ để dẫn dắt không?
- [ ] Chỗ nào nói "dễ thấy rằng" là chấp nhận được, chỗ nào là lười?

### 2.3 Anchor

- [ ] Mỗi step nên có bao nhiêu anchor? Hiện lint chỉ cảnh báo khi có **0**.
- [ ] Neo vào danh từ ("đỉnh $v$") hay cả mệnh đề ("ba cạnh cùng màu")?

### 2.4 Invariant

- [ ] Đặt tên invariant thế nào? Mô tả đại lượng, hay mô tả ý nghĩa?
- [ ] Bài nào *nên* có invariant strip, bài nào có mà thành nhiễu?

### 2.5 Độ sâu cây

- [ ] Giới hạn mềm hiện là 4 mức (R-6). Thực tế lời giải thi đấu sâu mấy mức?
- [ ] Khi nào nên tách một nhánh sâu thành bài riêng?

---

## 3. Checklist tự duyệt trước khi publish

Phần máy kiểm được thì `combviz validate` đã chạy. Đây là phần còn lại:

- [ ] Từng bước lập luận có đúng không — đọc lại như thể đang chấm bài người khác.
- [ ] Hình có **nói đúng** thứ narrative nói không? (Ví dụ: bàn cờ khuyết hai góc
      phải cho 30/32, không phải 31/31.)
- [ ] Bài này có phải lời giải của *mình* không, hay đang nhớ lại lời giải đã đọc
      ở đâu đó? (R-5)
- [ ] Nếu draft từ máy: có step nào mình đánh dấu verified mà chưa thật sự kiểm
      từng chữ không? (R-8 — cộng đồng oly bắt lỗi trong ngày.)
- [ ] Đề bài đã ghi nguồn đầy đủ chưa?
