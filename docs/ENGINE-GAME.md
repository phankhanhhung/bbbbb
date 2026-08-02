# CombViz — Lớp ván chơi: mô tả chức năng

> Trạng thái: **đã đóng GM-01..04 và NFR-S2** (M78.1–M78.8, 2026-08-02).
> Tài liệu này mô tả *lớp ván* — thứ nằm ngang qua nhiều engine — chứ không phải một
> engine. Engine bốc đống (`game`) có phần phân tích Grundy riêng của nó; xem §12.

---

## 1. Lớp này là gì

Một **ván** là bốn câu hỏi, và lớp này trả lời cả bốn mà không biết engine nào:

```
(Scene, bên sắp đi) → legalMoves → người chọn → applyMoveTo → Scene mới
                                                     ↓
                                              đổi lượt, hỏi lại
                                                     ↓
                                        hết nước ⇒ ai thắng (quy ước)
```

Trước M78, engine `game` là **một widget bốc đống**: thế cờ là đa tập số nguyên, luật
thuộc tám họ đóng, hai bên cùng tập nước, và không có khái niệm lượt, người thắng, hay
ván. `schema.ts` của chính nó đã tự thú: *"Chomp, Hackenbush, lật đồng xu, cờ trên đồ
thị, game bàn cờ, game tô màu — thế không phải đa tập số, chấm hết. Đó là GM-01 thật sự,
và nó vẫn còn nợ."*

Bốn họ luật hiện có, trên **ba** substrate khác nhau:

| họ luật | engine | thế cờ là gì | impartial? |
|---|---|---|---|
| `piles` | `game` | đa tập số nguyên | có |
| `chomp` | `board` | tập ô đã ăn (`config.holes`) | có |
| `geography` | `graph` | đồ thị + `config.token` | có |
| `hackenbush` | `graph` | đồ thị màu + `config.ground` | **không** |
| `script` | mọi engine có ván | do tác giả khai | tuỳ |

---

## 2. Bốn quyết định nền

**2.1. Lượt đi *không* nằm trong scene.** `toMove` suy từ `first` và số nước đã đi. Nhét
nó vào scene nghĩa là schema của board và graph mọc thêm một trường chỉ có nghĩa khi bài
ấy là game — đúng kiểu trường ma mà kho này đã dọn nhiều lần. Suy ra thì nó **tất định**:
cùng một dãy nước cho cùng một lượt, không có đường nào để hai bên lệch nhau.

Cái giá: ván **luân phiên nghiêm ngặt**. Không có nước "pass", không đi hai lần. Ghi vào
§13 chứ không giấu.

**2.2. Kết thúc là quy ước, không phải script.** Hết nước ⇒ bên đang đi **thua** (normal
play) hoặc **thắng** (misère). Đó là quy ước của lý thuyết trò chơi tổ hợp, nó đóng, và
nó phủ trọn cả bốn họ luật. Quy ước ấy sống ở đúng **một** hàm:

```ts
export const terminalWinner = (toMove: PlayPlayer, misere: boolean): PlayPlayer =>
  misere ? toMove : other(toMove);
```

Hàm ấy có tên riêng vì nó có hai chỗ gọi — phiên chơi và solver. Viết nó hai lần thì hai
lần ấy khớp nhau hôm nay và lệch nhau vào ngày ai đó sửa một lần, và triệu chứng sẽ là
*"solver bảo Người 1 thắng, chơi thật thì Người 2 thắng"* — một câu không ai lần ngược
được về nguyên nhân.

**2.3. Nước đi chọn theo `id`, không theo object.** Id đến từ danh sách mà chính phiên
này vừa phát ra, nên đi một nước không có trong danh sách là chuyện *không xảy ra được*.
Nhận một `Move` do phía gọi tự dựng là mở đường cho giao diện "thắng" bằng một nước luật
cấm.

**2.4. `player` là tham số thật, không phải trang trí.** `legalMoves(scene, player)` mang
`player` từ ngày đầu, dù ba họ luật đầu tiên đều impartial và bỏ qua nó. Hackenbush
(M78.4) là chỗ nó có việc — và là chỗ nó lần đầu **có răng**: một tham số đi qua bốn tầng
mà không ai đọc thì nó có thể đã bị nối sai từ tầng đầu, và mọi chốt canh vẫn xanh.

---

## 3. Hợp đồng nước đi

```ts
interface Move {
  readonly id: string;          // duy nhất **trong thế hiện tại**, không hơn
  readonly label: string;       // chữ hiện ra cho người chơi
  readonly command?: Command;   // vắng ⇒ lối B (§4)
  readonly targets: readonly string[]; // "chạm đâu thì được nước này"
}
```

`targets` trả lời câu **"chạm vào đâu thì được nước này"**, *không* phải câu "nước này
đụng vào những gì". Trộn hai câu thì trên bàn Chomp, chạm một ô sẽ ra mọi nước có góc phủ
nó, và bảng nước đi hoá vô dụng đúng ở bàn to.

## 4. `apply` có hai lối, và lối mặc định là lệnh

**Lối A (mặc định)** — nước mang theo một `Command` của engine chủ, và phiên chơi áp bằng
registry. Thuần, replay được, ghi draft được, thừa hưởng nguyên vẹn mọi bảo đảm mà ENG-01
dựng cho lớp lệnh.

**Lối B (`PlayRules.applyMove`)** — luật tự trả về scene mới. Mạnh hơn, và mất ba bảo
đảm; cả ba được bịt bằng **cổng trong `applyMoveTo`**, không bằng lời dặn:

| rủi ro | cổng |
|---|---|
| script không tất định ⇒ replay/golden hết đúng | chạy **hai lần**, so byte; lệch ⇒ từ chối nước |
| scene trả ra có thể sai engine | so `scene.engine` trước và sau |
| không có lệnh để ghi draft | ghi theo **id nước**; script tất định nên replay bằng id là đủ |

Chỗ khác nhau **không** nằm ở undo/redo: `history.ts` lưu snapshot scene đầy đủ từ đầu
(ENG-00), nên lối B không tốn gì thêm ở đó.

## 5. Phiên chơi

`packages/editor/src/play.ts` — thuần, không nhắc tên engine nào:

- `createPlay(scene, rules, {first, misere})` — hỏi ngay từ đầu: một thế mở màn **đã**
  hết nước là một ván hợp lệ (bàn Chomp $1\times1$), và bỏ qua chỗ này thì nó hiện ra như
  một ván đang chờ.
- `playMove(session, moveId, rules, registry)` → `{session, refusal}`.
- `undoMove` / `resetPlay` / `replayPlay` — `replayPlay` vừa là tính năng vừa là **phép
  đo**: cùng dãy id cho cùng một scene tới từng byte (mẫu CHO-08).
- `toDraftSteps(session)` → `{narrative, scene}[]` (GM-04). Narrative là **nháp** — nhãn
  nước cộng tên bên đi — chứ không phải câu hoàn chỉnh; bịa ra một câu nghe như đã viết
  xong là cách chắc nhất để nó được xuất bản mà không ai đọc lại.

`PLAY_LIMIT = 200` không phải trần kỹ thuật mà là hàng rào cho **luật hỏng**: một họ luật
sinh ra nước không giảm thế sẽ cho hai bên đi qua lại vô hạn.

---

## 6. Solver (GM-03)

`packages/editor/src/solve.ts` — **duyệt lùi** trên khoá `positionKey(scene) | toMove`.

Không phải đệ quy có nhớ. Đệ quy chỉ đúng khi đồ thị thế không có chu trình; bốn họ luật
hiện tại đều giảm thế nghiêm ngặt nên đệ quy sẽ chạy đúng — *hôm nay*. Duyệt lùi đúng cả
khi có chu trình, và nó nói được câu thứ ba mà đệ quy không nói được: *"thế này không ai
thắng được, hai bên đi vòng mãi"* — chẩn đoán cho một họ luật hỏng, không phải một vòng
lặp treo.

Nó đi qua đúng ba thứ **là luật** — `rules.legalMoves`, `applyMoveTo`, `terminalWinner` —
và **không** qua `PlaySession`. Phiên chơi mang lịch sử, vết chân, undo: thứ giao diện
cần và solver không đọc một chữ, mà dựng nó cho mỗi *cạnh* đắt gấp bốn lần.

### 6.1. Trần là **số đếm được**, không phải thời gian

Đây là chỗ đi khác kế hoạch, cố ý. Trần thời gian làm solver **không tất định**: cùng một
bài cho hai câu trả lời khác nhau tuỳ máy đang bận hay rảnh, và thế thì chốt canh, golden
và cả lời hứa CHO-08 đều mất nghĩa.

Đếm **hai** thứ, vì một thứ không chặn nổi công phải làm: số thế, và số cạnh. Một thế có
mười nghìn nước vẫn là *một* thế.

Đổi lại, trần đếm được không tự biết nó là bao nhiêu giây — nên tỉ giá phải **đo và ghi
ra**: ở kho này một cạnh tốn chừng $30\,\mu s$, và mọi con số dưới đây chọn từ tỉ giá ấy.

| hằng số | giá trị | vì sao |
|---|---|---|
| `SOLVER_STATES` | $5000$ | $\approx 1{,}5$ s ở nhánh trung bình mười |
| `SOLVER_STATES_MAX` | $100\,000$ | **đi khác SRS GM-03** ($10^6$): $10^6$ thế là năm phút, và một trần cho phép treo năm phút thì không phải là trần |
| `SOLVER_EDGES_PER_STATE` | $32$ | hàng rào cho nhánh bệnh hoạn, không phải nút điều chỉnh thường ngày |
| `boardPlayRules('chomp').solverBound` | $3000$ | đo thật: $6\times6$ ($1846$ thế) giải $0{,}8$ s; $7\times7$ từ chối sau $0{,}7$ s |
| `graphPlayRules(…).solverBound` | $8000$ | geography là PSPACE-đầy đủ — không công thức nào cứu, chỉ có lời từ chối |

**Đường tắt.** Họ luật tự trả lời được thì khai `solve()`, và solver chung đứng ngoài —
bốc đống trả lời bằng vài phép XOR (Sprague–Grundy) trong khi duyệt lùi mất hàng trăm
nghìn thế cho cùng một câu. `null` nghĩa là *"ca này tôi không biết"*, nên một họ luật có
công thức cho **một phần** các thế vẫn khai được.

---

## 7. Luật do tác giả viết (DSL-03)

Bốn họ luật dựng sẵn nằm trong engine, bằng TypeScript. `play.script` là **đường khác**:
một game thứ năm mà tác giả nghĩ ra không phải đợi ai sửa mã. Đó là NFR-S1 đọc cho lớp
ván — nội dung là dữ liệu, không phải code — và không có đường này thì "thêm một game"
luôn có nghĩa là "phát hành một phiên bản".

**Đúng một dạng cú pháp:**

```
moves { for c in cells where !hole(c) : move board/chomp-bite(at: c) }
```

Không vòng lặp lồng, không `let`, không nhánh, không đệ quy. Bốn chỗ mở rộng đều có tên —
`for`, `where`, `move`, tham số — nên thêm dạng thứ hai là một quyết định nhìn thấy được
chứ không phải một tiện ích lỡ tay. Đó là đối sách R-2 viết thành cú pháp.

**Nó nằm ở `packages/editor/src/script.ts`, *không* trong `@combviz/dsl`.** DSL-03 viết
thẳng *"tách hẳn khỏi DSL thuần, không trộn"*, và nhét một node `moves` vào `ast.ts` là
trộn: kể từ giây ấy invariant strip, guard đại số, và mọi chỗ gọi `compile()` đều *có
thể* sinh ra nước đi. Ở đây ngôn ngữ biểu thức không đổi một dòng — vị ngữ `where` và giá
trị tham số vẫn chạy qua đúng `evalExpr` với môi trường do engine cấp.

**Ba trường của `Move` suy ra, tác giả không gõ:**

| trường | suy từ | vì sao không cho gõ |
|---|---|---|
| `id` | tên lệnh + tham số đã **sắp theo tên** | gõ tay thì hai nước trùng id là chuyện xảy ra được, mà `playMove` chọn theo id |
| `label` | `CommandDef.label(params, scene)` | nhãn ở hai chỗ là hai chỗ để lệch |
| `targets` | các element xuất hiện trong tham số | *"chạm đâu thì được nước này"* **là** câu hỏi về element trong tham số |

Ngân sách là **một cho cả lượt**, không phải một cho mỗi biểu thức: `evalExpr` nhận một
`EvalContext` có sẵn nên vị ngữ chạy bốn mươi lần vẫn chia chung một bộ đếm bước. Gọi
`evaluate` thì "trần 100 ms" hoá thành "100 ms mỗi ô", và trên bàn $40\times40$ đó là một
phút.

---

## 8. Cách ly (NFR-S2) — đạt tới đâu, và một chỗ **không** đạt

| điều khoản đòi | trạng thái |
|---|---|
| không DOM, không network | **đạt ở tầng ngữ pháp** — `ast.ts` không có node nào nói ra chúng, `call.callee` phải là builtin có tên. Chặn lúc *parse*, mạnh hơn chặn lúc chạy |
| budget 100 ms mỗi lượt gọi | đạt, **hai lớp**: đồng hồ trong tiến trình (`interpreter.ts`) và `terminate()` từ luồng chính (`play-host.ts`) |
| kill + lỗi hiển thị | đạt — và lớp thứ hai mới là lớp có răng |
| Web Worker cách ly | đạt (`apps/player/src/play.worker.ts`) |
| **64 MB** | **không ép được** — xem dưới |

Lỗ thật mà Worker bịt hẹp hơn người ta tưởng: `interpreter.ts` chỉ soát hạn mỗi
`steps & 2047` bước, nên **một** bước chạy lâu (builtin duyệt cấu trúc khổng lồ) thì
không ai cắt được từ bên trong. Mã không hợp tác chỉ có thể bị giết từ ngoài.

**64 MB không ép được cầm tay.** Không trình duyệt nào cho một Worker đọc heap của chính
nó theo chuẩn nào (`performance.memory` chỉ có ở Chromium và đo cả tab). Ba thứ *ép được*
và cùng nhau chặn đúng cái mà 64 MB muốn chặn: `maxSteps`, `MOVES_LIMIT` (số nước trả
ra), và đồng hồ ngoài — thứ giết được cả khi hai trần kia không soát tới. **Không có chốt
canh nào giả vờ kiểm 64 MB**: một cái răng không cắn được thì không lắp.

Hai loại việc, hai cái hạn: script $100$ ms (NFR-S2), giải $15$ s. Áp hạn chung là giết
đúng thứ §6 vừa xây — solver **được phép** chạy vài giây vì nó có trần riêng đếm được.

---

## 9. Giao diện (GM-02)

`apps/player/src/PlayBoard.tsx` — component riêng, **không** phải một chế độ của Sandbox.
Sandbox là sửa tự do: mọi lệnh bấm được, undo là undo lệnh, không có lượt. Ván chơi ngược
lại ở cả ba, nên trộn chúng nghĩa là mỗi nhánh trong bảy trăm dòng của Sandbox mọc thêm
một điều kiện *"đang chơi?"*, và chế độ nào cũng đọc như ngoại lệ của chế độ kia. Chúng
dùng chung thứ đáng dùng chung — renderer, `hitTest`, viewport, `patch` — và chỗ ấy là
các gói.

- **Chọn nước trên hình.** `Move.targets` trả lời "chạm đâu thì được nước này";
  `engine.hitTest` trả lời "chạm đây là chạm cái gì" từ P1. Nối hai câu là xong.
- **Rê tới đâu, ô ấy sáng** — và **chỉ** ô ấy. Sáng mọi nước hợp lệ cùng lúc thì cả bàn
  Chomp hoá một khối vàng: "sáng" không phân biệt được gì, và nó còn che màu của chính
  nội dung.
- **Lượt** hiện thành hai chip, cái đang đi thì đậm. Chip chưa tới lượt vẫn đọc được: ở
  ván partizan người chơi cần thấy bên kia là ai.
- **`PlayRules.sideName`** cho họ luật nói rõ hơn "Người 1": ở Hackenbush một bên *là*
  cạnh xanh. Câu ấy phải đến từ họ luật chứ không từ CSS — `styles.css` chỉ được nói về
  khung, không được nói về hình.
- **"Ai thắng thế này?" hỏi mới trả lời.** Chạy solver mỗi nước vừa tốn vừa *làm hỏng trò
  chơi*: ngôi sao hiện sẵn trên nước thắng thì không còn gì để nghĩ. Đi một nước thì lời
  khuyên tắt, vì câu đúng cho thế cũ là câu sai cho thế đang xem.

---

## 10. Khai trong bài

```jsonc
"play": {
  "rule": "chomp",        // phải nằm trong `playRules` của engine chủ
  "first": "left",        // mặc định "left"
  "misere": true,         // mặc định false
  "apply": "command",     // "script" ⇒ validate **cảnh báo**, không chặn
  "solver_bound": 2000,   // hạ trần xuống; nâng lên vẫn bị engine kẹp
  "script": "moves { … }" // có mặt ⇔ rule === "script"
}
```

Khối này cố ý **rất mỏng**. Nó không mô tả luật, không mô tả thế, không mô tả bàn: thế là
`scene` của chính step, tham số luật đã nằm trong `scene.config` nơi engine chủ vốn đã
kiểm chúng. Nhét luật vào đây sẽ là nguồn sự thật thứ hai bên cạnh `config`, và hai nguồn
cho một câu hỏi là lớp lỗi đắt nhất kho này từng gặp.

**Vì sao là khối trên `step` chứ không phải trường trong `scene`:** một scene board là
một scene board dù có ai chơi nó hay không. Đẩy `rule`/`first` vào `board.config` nghĩa
là schema của 33 bài bàn cờ mọc thêm ba trường chỉ có nghĩa với những bài là game.

### Phép kiểm của từng engine

| mã lỗi | mức | nói gì |
|---|---|---|
| `play/unknown-rule` | lỗi | engine không có họ luật ấy, **và kể ra những họ nó có** |
| `play/script-missing` / `play/script-unused` | lỗi | cặp `rule === "script"` ⇔ `script`, ép **cả hai chiều** vì cả hai chiều đều im lặng nếu không bắt |
| `play/chomp-needs-square`, `play/chomp-is-misere` | lỗi | lưới tam giác thì không nước nào hợp lệ; normal play thì bài dạy ngược lời giải của chính nó |
| `play/geography-needs-token`, `play/geography-token-missing`, `play/geography-is-normal` | lỗi | không quân thì bài mở ra đã kết thúc |
| `play/hackenbush-needs-ground` | lỗi | không đất thì "rụng" không định nghĩa được |
| `play/hackenbush-colourless-edge` | lỗi | cạnh không bên nào gỡ được; nếu nó là cầu thì cả nhánh treo trên nó không bao giờ rụng, và trò chơi thôi là Hackenbush |
| `play/misere-mismatch` | lỗi | `play.misere` lệch `config.misere` của engine bốc đống |
| `play/script-apply` | **cảnh báo** | lối B hợp lệ và mạnh hơn, nhưng đánh đổi phải có mặt trong bản duyệt |

---

## 11. Primitive của từng substrate

Nước đi là **một lệnh**, không phải hai. Tách đôi thì có một khoảnh khắc scene ở giữa —
hợp lệ về schema, vô nghĩa về luật — và undo dừng đúng ở đó.

| lệnh | làm gì |
|---|---|
| `game/take`, `game/split`, `game/take-both` | ba hình dạng nước của bốc đống, đã có từ P1 |
| `board/chomp-bite` | chạm một ô ⇒ xoá cả góc phần tư; `holes` sắp thứ tự để cùng thế cho cùng một byte |
| `graph/move-token` | đẩy quân theo cạnh **và** xoá đỉnh vừa rời (cùng cạnh của nó) |
| `graph/remove-edge-prune` | gỡ một cạnh rồi mọi thứ không còn nối về `config.ground` **rụng** |

`graph/remove-edge-prune` là ca chứng minh vì sao `apply` nên là lệnh đóng chứ không phải
script tự do: "rụng" là một phép tính liên thông trên toàn đồ thị, và để tác giả viết tay
nghĩa là mỗi bài Hackenbush có một bản cài đặt riêng của cùng một luật, sai theo những
kiểu khác nhau.

Xoá đỉnh vừa rời trong geography cũng là chỗ luật *"chỉ đi tới đỉnh chưa thăm"* tự lo
được: đỉnh đã thăm không còn trên đồ thị, nên không cần một danh sách `visited` song song
— vốn là trạng thái thứ hai để lệch với đồ thị thật.

### "Xanh–đỏ" ở đây là xanh đậm và **cam đất**

Bảng màu của kho là Okabe–Ito, chọn để người mù màu vẫn phân biệt được, và nó **không có
đỏ** — đỏ với lục là cặp lẫn nhau nhiều nhất. `HACKENBUSH_LEFT = 1` (xanh đậm, nét liền)
và `HACKENBUSH_RIGHT = 3` (cam đất, gạch chéo trái) khác nhau cả về sắc, độ sáng **và**
hoa văn. Ở một trò mà màu *là* luật, không phân biệt được hai màu nghĩa là **không chơi
được**, chứ không phải chỉ thấy hình xấu.

---

## 12. Quan hệ với engine `game`

Engine bốc đống giữ nguyên phần của nó và **không** bị lớp ván nuốt mất:

- `allMoves`/`analyzeGame`/`solver.ts` không đổi một dòng ở M78. `gamePlayRules` chỉ
  **dịch** nước của `solver.ts` sang hợp đồng `Move`; viết lại phép sinh nước ở đó là
  dựng nguồn sự thật thứ hai cho cùng một câu hỏi.
- Phổ thắng–thua, `config.misere`, và bảng Grundy vẫn là chuyện của engine ấy.
- Tám thành viên của `GameRule` **không** là tám họ luật ở tầng ván: chúng là tham số của
  cùng một cách chơi, đã nằm trong `scene.config.rule`. Khai tám tên ở `play.rule` là bắt
  tác giả gõ cùng một thứ hai lần, ở hai chỗ có thể lệch nhau.

---

## 13. Chỗ lớp này **không** làm

Ghi ra để không ai tưởng là sót:

- **Nước "pass"**, đi ngoài lượt, ván không luân phiên — hệ quả trực tiếp của §2.1.
- **Game > 2 người.**
- **Luật đổi giữa ván.**
- **AI mạnh hơn duyệt lùi.** Không có minimax cắt tỉa, không có heuristic. Quá trần thì
  **từ chối có lời**, không đoán.
- **Ước lượng không gian thế trước khi duyệt.** `analyzeGame` làm thế và nó đúng cho đa
  tập số, sai cho bàn cờ: số thế của Chomp $m\times n$ không phải $2^{mn}$ mà là số iđêan
  thứ tự — $3\times3$ có $20$ vị trí chứ không phải $512$. Ước dôi thì từ chối những bài
  giải được ngon lành; ước hụt thì treo máy. Lớp này **đo thật**: duyệt và đếm.

---

## 14. Bản đồ file

| file | việc |
|---|---|
| `packages/editor/src/play.ts` | phiên chơi, `PlayRules`, `terminalWinner`, `applyMoveTo` |
| `packages/editor/src/solve.ts` | duyệt lùi, trần đếm được |
| `packages/editor/src/script.ts` | ngữ pháp `moves { … }`, `scriptPlayRules` |
| `packages/editor/src/command.ts` | `Move`, `PlayPlayer` |
| `packages/schema/src/step.ts` | khối `Play` |
| `packages/engines/game/src/play.ts` | họ luật `piles` + đường tắt Grundy |
| `packages/engines/board/src/play.ts` | họ luật `chomp` |
| `packages/engines/graph/src/play.ts` | `geography`, `hackenbush` |
| `apps/player/src/PlayBoard.tsx` | bàn chơi |
| `apps/player/src/play-host.ts` | đồng hồ ngoài + dựng lại Worker |
| `apps/player/src/play.worker.ts` | `solve` và `moves` ngoài luồng chính |
| `apps/player/src/usePlay.ts` | hook, cache theo hash scene, huỷ theo id |

## 15. Thêm gì thì sửa ở đâu

**Một họ luật mới trên engine đã có ván** → thêm tên vào `<ENGINE>_PLAY_RULES`, thêm nhánh
trong `<engine>PlayRules(rule)`, và nếu thế mở màn có thể sai thì thêm phép kiểm vào
`check<Engine>Play`. Không đụng vào `editor/`.

**Một engine chưa có ván** → viết `<engine>PlayRules(rule): PlayRules | null` cùng chữ ký,
khai `playRules`/`checkPlay` trong `<engine>SchemaFragment`, và thêm engine vào `LOADERS`
của `play.worker.ts` cùng `LoadedEngine` trong `engines.ts`.

**Một primitive mới** → `defineCommand` trong `commands.ts` của engine chủ. Nó phải thuần
và replay được: không sinh id bên trong, không đọc giờ, không random.

**Một dạng cú pháp thứ hai cho `moves`** → đọc lại §7 trước. Đó là một quyết định về R-2,
không phải một tiện ích.
