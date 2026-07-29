# CombViz — Kế hoạch triển khai Phase 1

Nguồn: `docs/SRS-v1.0.md` (SRS v1.0, 2026-07-29) · Trạng thái: plan draft · Đối tượng: 1 người (Owner-Author)

---

## 0. TL;DR

**Critical path** (mọi thứ khác treo trên đây, theo đúng thứ tự):

```
schema (hợp đồng)  →  renderer thuần (Scene → SVG, không biết chuột)
                    →  scene diff + interpolator thuần (DAT-11/12)
                    →  Player
                    →  DSL + validator  →  Sandbox
                    →  engine thứ hai (Graph)  →  Studio + pipeline
                                                 →  25 bài
```

**Rủi ro số 1 không phải code, mà là content (R-1).** Vì vậy kế hoạch chạy **hai track song song**: track Engine và track Content, gặp nhau ở các gate. Track Content mở từ tuần ~6 bằng cách soạn JSON tay + CLI validate + Player preview — **không đợi Studio**. Đây là cách duy nhất để (a) Style Guide kết tinh từ thực tế như §16 yêu cầu, (b) phát hiện sai lầm schema *trước khi* có 25 bài phải migrate.

**Ba cược kiến trúc phải được chứng minh sớm** (xong trước hết tuần 3, không phải tuần 12):

1. Snapshot đầy đủ + auto-diff theo id thực sự sinh ra animation đủ tốt (DAT-11/12) — nếu sai, cả mô hình soạn bài sụp.
2. SVG + KaTeX đạt 55fps trên iPad Gen 9 (NFR-P1, R-3) — nếu sai, phải đổi sang Canvas *trước khi* viết 2 engine.
3. Đúng một renderer chạy được cả trong browser lẫn headless (REN-01/04) — nếu tách đôi, video sẽ lệch player và nhóm REN chết.

**Đề xuất ước lượng:** P1 full scope ≈ **15–17 tuần full-time** cho một người. Nếu quỹ thời gian thật ít hơn, xem §8 (cut line) — cắt theo thứ tự đã định sẵn, không cắt ngẫu hứng.

---

## 1. Giả định & việc cần chốt trước khi code

| # | Giả định | Cần xác nhận |
|---|---|---|
| A-1 | ~1 học kỳ ≈ 16 tuần, một người full-time. Nếu part-time, nhân đôi lịch và cắt theo §8 | Owner |
| A-2 | Chrome là browser soạn bài (Studio cần File System Access API); Studio chạy **local**, không deploy công khai | Owner |
| A-3 | Hosting static: Cloudflare Pages hoặc GitHub Pages; CI GitHub Actions | Owner |
| A-4 | LLM cho AUT-09 truy cập được qua API từ máy local (tools/pipeline) | Owner |

**Chặn tiến độ nếu không chốt sớm:**

- **OPQ-1 (tên brand + domain)** — chặn REN-02/03 (OG card + watermark cần brand mark). Deadline: **hết tuần 4**, trước khi publish bài đầu.
- **OPQ-2 (UX tree navigator)** — chặn PLY-02. Prototype giấy **tuần 1**, không code trước khi có kết luận.
- **OPQ-3 (license)** — chặn CMS-06 và bài đầu tiên. Deadline: **hết tuần 5**.
- **OPQ-6 (bound board 40×40)** — chặn NFR-P4 và schema. Rà khi chốt seed list, **tuần 2**. Nới rẻ, thu hẹp đắt → nếu phân vân, đặt rộng.
- OPQ-4/5/7 thuộc P2, không chặn P1.

---

## 2. Quyết định kỹ thuật (SRS để mở — chốt tại đây)

| ID | Quyết định | Lý do |
|---|---|---|
| **D-01** | TypeScript strict, pnpm workspaces + Vite. Turborepo chỉ thêm khi build chậm thật | Ít bộ phận chuyển động nhất cho một người |
| **D-02** | Schema viết bằng **TypeBox** → emit JSON Schema chuẩn (công bố kèm repo, DAT-01) + TS types từ cùng một nguồn. Validate bằng **Ajv** | Một nguồn sự thật; tránh schema và types trôi khỏi nhau |
| **D-03** | Renderer = hàm thuần `render(scene, theme) → SvgNode[]`, **không import DOM**. Một `patch(container, nodes)` riêng áp vào DOM, key theo element id | Điều kiện sống còn của REN-01/04 và §14 |
| **D-04** | App chrome bằng **Preact + signals** (~5KB gzip). Canvas **không** đi qua framework — patcher riêng | NFR-P3 bundle ≤300KB; canvas cần kiểm soát DOM chính xác cho animation |
| **D-05** | **Animation là interpolator thuần** `interpolate(sceneA, sceneB, t) → SvgNode[]`, không dùng WAAPI/CSS transition làm nguồn sự thật. Player drive bằng rAF; headless drive bằng timestep cố định | Xem A-01 §4 — đây là điều kiện để video giống hệt player |
| **D-06** | DSL: **Pratt parser viết tay** (~400–600 LOC) + AST interpreter, zero dependency. Budget bằng đếm node đã eval + `performance.now()` check | DSL-01/02 đòi grammar đóng và sandbox thật; thư viện ngoài mang theo bề mặt tấn công và ngữ nghĩa không kiểm soát được |
| **D-07** | Math: **KaTeX runtime** cho narrative pane (`trust:false`, NFR-S1). Nhãn trong canvas (GR-08) **pre-render bằng MathJax SVG lúc build** thành path, cache theo hash chuỗi → "label atlas" | resvg không hỗ trợ `foreignObject`; nếu nhãn canvas dùng KaTeX/HTML thì REN-01/02 headless chết. Xem G-02 |
| **D-08** | Headless raster: **`@resvg/resvg-js`** (Rust, không cần browser). Video P2: SVG frames → resvg → ffmpeg | Nhanh, deterministic, không phụ thuộc browser version |
| **D-09** | Site: Vite SPA + **script prerender** sinh một HTML shell tĩnh per problem (OG meta + statement text cho SEO). Không thêm Astro | Giữ số framework = 1. Astro là đường lùi nếu prerender script phình |
| **D-10** | Engine **lazy-load theo `engines_used[]`** (dynamic import). Core player bundle không chứa engine nào | NFR-P3; và là cách duy nhất giữ ngân sách khi P2/P3 thêm 3 engine nữa |
| **D-11** | Search: **MiniSearch** + tokenizer fold dấu tiếng Việt, index sinh lúc build | CMS-02, ≤500 bài, ~6KB gzip |
| **D-12** | Test: **Vitest** (schema, DSL, diff, analyzer) + **golden SVG snapshot** cho renderer + **Playwright** cho player interaction & perf trace | Renderer thuần ⇒ snapshot test cực rẻ và bắt regression thị giác — đúng thứ một brand cần |
| **D-13** | CLI một binary `combviz` với subcommand: `validate` `lint` `import-draft` `render` `og` `migrate` `stats`. **Cùng code với Studio và CI** (AUT-04) | Ba nơi dùng một bộ luật là yêu cầu tường minh của AUT-04/NFR-D2 |

---

## 3. Monorepo & hợp đồng giữa các package

```
packages/
  schema/     TypeBox defs → JSON Schema + TS types + Ajv validator   [không phụ thuộc gì]
  theme/      tokens: màu, pattern, phông, nét, spacing                [không phụ thuộc gì]
  dsl/        parser + AST + interpreter sandboxed + builtin registry  [← schema]
  render/     render(scene,theme)→SvgNode[]; diff; interpolate; patch  [← schema, theme]
  engines/
    board/    schema fragment, renderer fragment, commands, analyzers, validators
    graph/    (như trên)
  content/    kho problem JSON + taxonomy YAML + assets                [dữ liệu, không code]
apps/
  player/     SPA công khai                                            [← tất cả trên]
  studio/     app local-only cho Owner                                 [← tất cả trên]
tools/
  pipeline/   CLI: validate, lint, import-draft, og, render, migrate   [← tất cả trên]
```

**Luật phụ thuộc (enforce bằng eslint boundaries + CI):**

- `schema` và `theme` là lá — không import gì trong repo.
- `render` **không được** import DOM, `window`, hay bất kỳ engine cụ thể nào (engine tự đăng ký renderer fragment qua registry).
- `dsl` không được import DOM/network (NFR-S1/S2).
- Chỉ `tools/pipeline` được import LLM client. Vi phạm = CI đỏ (§14 SRS).
- `apps/*` không được import chéo nhau.

**Interface engine (mỗi engine phải cung cấp đúng bộ này):**

```ts
interface Engine {
  id: string
  sceneSchema: TSchema                       // fragment ghép vào schema chính
  render(scene, theme): SvgNode[]            // thuần
  commands: CommandRegistry                  // ENG-01
  hitTest(scene, point): ElementId[]         // lớp interaction, tách khỏi render
  analyzers: Record<string, Analyzer>        // chạy được trong worker
  validators: Record<string, Validator>
  dslBuiltins: Record<string, BuiltinFn>     // deg(v), covered(c), attacks(p,q)...
  bounds: BoundSpec                          // NFR-P4
}
```

Định nghĩa engine như một *record dữ liệu* chứ không phải class kế thừa: đó là thứ cho phép `engines_used[]` lazy-load (D-10) và cho phép CLI nạp engine trong Node.

---

## 4. Ràng buộc kiến trúc SRS chưa nói ra (phải tuân thủ từ commit đầu)

- **A-01 — Animation phải thuần.** REN-04 hứa "video giống hệt player". Nếu player animate bằng WAAPI còn video interpolate bằng code khác, hai đường sẽ lệch và không ai phát hiện cho tới lúc render clip đầu tiên ở P2. ⇒ D-05. Chi phí: viết easing/interpolation tay (~1 ngày). Lợi: REN-04 gần như miễn phí ở P2, đúng như §11 tuyên bố.
- **A-02 — Id ổn định cần *chính sách cấp id*, không chỉ "đừng random".** DAT-12 nói id ổn định xuyên step; DAT-03 nói ổn định qua các lần save. Cần: id do command layer cấp, dạng `<type>-<counter>` với counter per-problem lưu trong file, **không bao giờ tái sử dụng** kể cả sau khi xóa. Thiếu điều này, xóa rồi thêm lại sẽ khiến diff hiểu nhầm là "di chuyển" và anchor rot âm thầm.
- **A-03 — Canonical scene hash.** ENG-04 cần cache analyzer theo hash scene. Cùng hàm hash đó phục vụ golden test và cache label atlas. Viết một lần trong `packages/schema` (serialize theo key order chuẩn của DAT-03 rồi hash).
- **A-04 — Trạng thái dẫn xuất phải có thứ tự eval xác định.** `covered(c)` trong DSL là dẫn xuất từ tiles; `deg(v)` dẫn xuất từ edges. Cần một lớp `derive(scene) → DerivedState` memo hóa theo A-03, chạy trước mọi eval DSL. Nếu để mỗi builtin tự tính, invariant strip sẽ là O(n²) và trượt NFR-P2.
- **A-05 — Interaction tách khỏi render, nhưng hit-test cũng phải thuần.** Đừng dùng `document.elementFromPoint`: nó trói interaction vào DOM và làm test khó. `hitTest(scene, point)` hình học thuần, test được bằng Vitest.

---

## 5. Khoảng trống trong SRS + đề xuất xử lý

| ID | Khoảng trống | Đề xuất |
|---|---|---|
| **G-01** | REN-02 nói "chính chủ chọn step tiêu biểu trong Studio" nhưng §4.2 **không có field** lưu lựa chọn đó | Thêm `og_step_ref: {sol_id, step_id}` vào Problem, optional, fallback = step cuối của nhánh chính. Sửa schema **trước** M6 |
| **G-02** | GR-08 (nhãn LaTeX trong canvas) mâu thuẫn tiềm tàng với REN-01 headless | D-07: label atlas MathJax build-time. Hệ quả: nhãn canvas dùng **subset LaTeX** (không `\begin{array}`, không macro tự định nghĩa) — ghi vào Style Guide (AUT-10) |
| **G-03** | `merge_ref` render thế nào trong tree navigator (PLY-02) chưa định nghĩa | Chốt trong prototype OPQ-2 tuần 1: đề xuất vẽ như cạnh đứt nét quay về node tổng hợp, navigation coi như "seq" nhưng breadcrumb reset về nhánh chính |
| **G-04** | PLY-06 nói sparkline "theo tiến trình nhánh đang xem" — với `merge_ref` thì "nhánh" là gì | Định nghĩa: đường đi từ root tới step hiện tại theo `parent`, bỏ qua merge_ref. Ghi vào schema doc |
| **G-05** | DAT-02 nói Player đọc được version hiện tại và n−1 minor, nhưng schema sẽ churn dữ dội trong 5 bài đầu | Đặt **schema freeze gate**: schema là `0.x` (không hứa tương thích) tới hết M5; sau 5 bài soạn tay, freeze `1.0.0`, từ đó mọi thay đổi đi kèm migrate CLI. Viết `migrate` CLI ngay tại lúc freeze, không hoãn |
| **G-06** | AUT-KPI đo "median 5 bài cuối pilot" nhưng AUT-08 (công cụ đo) là **P2** | Cần một bản đo tối thiểu ở P1: `combviz stats` đọc log thời gian thủ công (file CSV owner tự ghi) — 2 giờ công, đủ để gate có răng |
| **G-07** | LOC-04 (analytics) là P1 nhưng không nói dùng tool gì | Đề xuất Plausible/Umami self-host hoặc **tắt hẳn ở P1** — cookieless + không PII dễ nhất bằng cách không thu gì. Quyết cùng OPQ-3 |
| **G-08** | SBX-05 export PNG cần render trong browser, REN-01 cần render trong Node — hai đường raster | Browser: `XMLSerializer` + `canvas.drawImage` từ SVG blob. Node: resvg. Cả hai ăn **cùng chuỗi SVG** từ D-03 ⇒ khác biệt chỉ ở rasterizer, chấp nhận được. Golden test so sánh ở mức SVG, không mức pixel |

---

## 6. Milestones

Ký hiệu: **[E]** track Engine · **[C]** track Content. Mỗi milestone có DoD kiểm được.

### M0 — Nền móng & khử rủi ro quyết định · Tuần 1 · [E]

- Monorepo, TS strict, eslint boundaries, CI skeleton (lint + typecheck + test).
- `packages/theme`: tokens Okabe–Ito + pattern dự phòng (NFR-A1, DAT-20). Whitelist đóng — schema cấm style tự do ngay từ ngày đầu, đừng "thêm sau".
- `packages/schema` v0: Problem/Solution/Step/Scene theo §4.2–4.4. File §4.7 validate pass.
- **Prototype giấy tree navigator (OPQ-2)** + chốt G-03.
- Chốt OPQ-6 sơ bộ (bound board).

**DoD:** `pnpm validate examples/mutilated-chessboard.json` chạy xanh; CI xanh.

### M1 — Walking skeleton (cược kiến trúc) · Tuần 2–3 · [E]

Đây là milestone quan trọng nhất. Mục tiêu duy nhất: chứng minh 3 cược ở §0.

- `packages/render`: `render()`, `diff()`, `interpolate()` (D-03/D-05), `patch()`.
- `engines/board` **tối thiểu**: board + cell + coloring preset checkerboard + tile domino. Chưa cần interaction.
- `apps/player` **tối thiểu**: đọc file JSON, Prev/Next, narrative pane KaTeX, animation từ auto-diff.
- Canonical scene hash (A-03), id policy (A-02).
- **Đo perf trên iPad Gen 9 thật** với scene 300 element (R-3 yêu cầu budget từ tuần 2).

**DoD:** bài §4.7 chạy end-to-end trên iPad thật, chuyển step ≤150ms p95, kéo timeline mượt. Nếu trượt → **dừng, đánh giá lại Canvas fallback trước khi đi tiếp**. Không viết engine thứ hai khi cược này chưa xong.

### M2 — DSL + validator + invariant · Tuần 4–5 · [E]

- `packages/dsl`: parser, interpreter, budget 50ms, builtin registry (DSL-01/02).
- `derive(scene)` + memo (A-04).
- BD-04 validator built-in; invariant eval.
- PLY-06 invariant strip + sparkline (G-04).
- `combviz validate` v1: schema + anchor (ANC-02) + eval invariant/validator mọi step + bound (NFR-P4) → AUT-04 phần máy.
- **Chốt OPQ-1** (brand name/domain) — hết tuần 4.

**DoD:** invariant `inv-bw` của bài mẫu hiển thị đúng qua cả 3 step; `validate` bắt được anchor rot cố ý và bound vượt ngưỡng; DSL có ≥40 unit test gồm test budget/timeout.

### M3 — Board engine đầy đủ + Sandbox · Tuần 5–7 · [E]

- ENG-00..04: command layer, undo/redo ≥50, multi-select, zoom/pan, worker + cancel.
- BD-01..03, BD-06 (summary strip theo color_class).
- ANC-01/02 hai chiều trong Player.
- SBX-01/02 (validator live, bật/tắt constraint), SBX-05 (export PNG/SVG).
- PRN-01 live trong sandbox, PRN-02 partition view.

**DoD:** sandbox board độc lập dùng được: đặt domino, thấy chồng lấn đỏ realtime, thấy invariant đổi live khi thao tác. Export PNG đúng theme.

### M4 — Mở cửa content + Graph engine · Tuần 6–9 · [E]+[C]

**[C] từ tuần 6 — song song, ưu tiên cao hơn Graph khi xung đột:**

- Soạn **tay hoàn toàn 5 bài** (JSON thô + `combviz validate` + Player preview). Bắt buộc gồm cả bài §4.7 và ≥1 bài case-branching.
- Ghi lại mọi chỗ schema/khái niệm gây vướng → backlog sửa schema.
- **Style Guide v1** kết tinh từ 5 bài này (AUT-10), không viết trước.
- Bắt đầu đo thời gian soạn (G-06).

**[E]:**

- `engines/graph`: GR-01, GR-02 (layout manual + circle/grid/bipartite), GR-08 (label atlas D-07).
- GR-03 analyzer trong worker: bậc, liên thông, bipartite, chu trình, Euler.
- GR-04 Hamilton backtracking ≤20 đỉnh, từ chối rõ ràng khi vượt bound.

**DoD:** 5 bài soạn tay pass validate; Style Guide v1 trong repo; graph engine chạy đủ analyzer trên bài $K_6$ hai màu ($R(3,3)=6$).

### M5 — Player hoàn chỉnh + **schema freeze** · Tuần 9–10 · [E]

- PLY-02 tree navigator theo kết luận OPQ-2 (đây là phần UX khó nhất của P1 — R-6).
- PLY-05 "Thử từ đây" (fork scene sang sandbox, quay lại đúng step).
- PLY-01/03/04 hoàn chỉnh: tốc độ, swipe, responsive, `prefers-reduced-motion`.
- DAT-14 deep-link; NFR-A2 keyboard đầy đủ; NFR-A3 alt_text.
- **Schema freeze → 1.0.0** (G-05) + `combviz migrate` chạy được trên toàn kho.

**DoD:** bài case-branching điều hướng được đủ: chọn nhánh, thấy ✗ ở contradiction, breadcrumb đúng, "về điểm rẽ nhánh" hoạt động; deep-link mở đúng step trong nhánh.

### M6 — Studio + pipeline + xuất bản · Tuần 10–12 · [E]

- AUT-01 (duplicate scene → sửa canvas → save), AUT-02 (anchor tool), AUT-03 (thao tác cây), AUT-05 (preview bằng Player thật + khung iPad), AUT-06 (File System Access API).
- AUT-04 hoàn chỉnh trong Studio: lỗi click-to-jump.
- **AUT-09 draft pipeline**: `import-draft` → validate đầy đủ → chế độ duyệt từng step trong Studio → **khóa publish khi còn step chưa verified**. Cờ `verified` lưu trong file, git-diff đọc được.
- **AUT-10 lint**: glossary, format `case_label`, ràng buộc chéo techniques↔widget, cảnh báo narrative dài.
- CMS-01 (taxonomy YAML), CMS-02 (filter + search MiniSearch), CMS-03 (trang problem, lời giải che mặc định), CMS-06 (license bắt buộc).
- REN-01 headless render, REN-02 OG card (cần G-01 + OPQ-1), REN-03 watermark.
- G-06 `combviz stats`.

**DoD:** một bài đi trọn vòng LLM draft → import → duyệt từng step → publish → OG card sinh tự động trong build. Thử publish bài còn step chưa verified → bị chặn.

### M7 — Content sprint + hardening + pilot · Tuần 12–16 · [C]+[E]

- **20 bài còn lại qua pipeline AUT-09**, theo khung phân bố §16: ≥10 grid, ≥10 graph, ≥5 invariant-centric, ≥8 case-branching thật, 100% có sandbox+validator.
- Đo AUT-KPI trên 5 bài cuối.
- Perf pass NFR-P1..P3 trên 3 bài nặng nhất, iPad thật.
- Pilot: ≥10 học sinh đội tuyển + 2 GV, đo SUS, thu top-10 friction.
- NFR-C1..C3, NFR-A1..A4, NFR-I1 kiểm tra checklist.

**DoD:** đúng DoD Phase 1 §15 SRS, cả 6 mục.

---

## 7. Lịch hai track

| Tuần | Track Engine | Track Content | Gate |
|---|---|---|---|
| 1 | M0 nền móng | prototype giấy OPQ-2 | |
| 2–3 | **M1 walking skeleton** | — | **G-A: 3 cược kiến trúc** (cuối T3) |
| 4–5 | M2 DSL + invariant | chốt OPQ-1, OPQ-3 | |
| 5–7 | M3 board + sandbox | — | |
| 6–9 | M4 graph engine | **5 bài soạn tay → Style Guide v1** | **G-B: Style Guide v1** (cuối T9) |
| 9–10 | M5 player + freeze | rà 5 bài theo Style Guide | **G-C: schema 1.0.0 freeze** |
| 10–12 | M6 studio + pipeline | | **G-D: 1 bài trọn pipeline** (cuối T12) |
| 12–16 | hardening, perf, a11y | **20 bài qua pipeline** | **G-E: DoD P1** |

**Ý nghĩa các gate — không phải mốc trang trí:**

- **G-A trượt** → dừng, đánh giá Canvas fallback. Viết engine thứ hai trên nền render sai là cách đắt nhất để hỏng dự án.
- **G-B trượt** (Style Guide chưa ổn định sau 5 bài) → soạn tay thêm 2 bài nữa **trước khi** bật pipeline. §16 nói rõ: Style Guide viết trước khi soạn bài nào là Style Guide bịa.
- **G-C** là điểm không quay lại: sau đây mọi thay đổi schema tốn migrate.
- **G-D trượt** → hoãn content sprint, sửa pipeline. R-1 + AUT-KPI: cắt engine trước khi cắt content.
- **G-E**: nếu tuần 16 mới có 18 bài chứ không phải 25 → **kéo dài content sprint**, không hạ chuẩn lint/checklist (§16: 25 bài xuất sắc thắng 100 bài khá).

---

## 8. Cut line — thứ tự descope khi trượt lịch

Quyết định trước, để lúc gấp không phải quyết trong hoảng loạn. Cắt từ trên xuống:

1. **GR-04 Hamilton** — chỉ phục vụ 1 bài seed (mã đi tuần). Cắt → đổi bài seed.
2. **GR-03 Euler path cụ thể** — giữ kiểm điều kiện Euler, bỏ phần chỉ ra đường đi cụ thể.
3. **PRN-02 partition view** — hạ xuống P2, giữ PRN-01 (invariant là trục demo chính).
4. **SBX-05 export SVG** — giữ PNG.
5. **AUT-03 kéo-thả sắp xếp cây** — giữ thao tác cây bằng nút/phím.
6. **Studio canvas editing (AUT-01 phần canvas)** — lùi về soạn JSON + preview. Xấu nhưng vẫn ra được bài; AUT-KPI sẽ trượt và điều đó phải được ghi nhận công khai.

**Không bao giờ cắt:** DAT-11/12 (snapshot + auto-diff), DAT-20 (brand-lock), AUT-04 (validate), AUT-09 verify-per-step gate, AUT-10 lint, NFR-S1, số lượng/chất lượng 25 bài. Cắt bất kỳ thứ nào trong đây là cắt vào định nghĩa sản phẩm chứ không phải cắt scope.

---

## 9. Chiến lược test & CI

| Tầng | Công cụ | Bắt gì |
|---|---|---|
| Schema | Vitest + Ajv | Mọi file trong `packages/content` validate; round-trip DAT-04 idempotent |
| DSL | Vitest | ~60 case: grammar, ngữ nghĩa, budget/timeout, không thoát sandbox |
| Diff/interpolate | Vitest | id stability, thêm/xóa/di chuyển, `interpolate(a,b,0)===render(a)`, `t=1 ⇒ render(b)` |
| Renderer | **Golden SVG snapshot** | Regression thị giác toàn kho — rẻ vì renderer thuần (D-03) |
| Analyzer | Vitest + property test | So với brute force trên đồ thị nhỏ |
| Player | Playwright | Điều hướng cây, anchor hai chiều, deep-link, keyboard, reduced-motion |
| Perf | Playwright trace + checklist tay iPad | NFR-P1..P3 |
| Content | `combviz validate` + `combviz lint` | NFR-D2: chạy trên **toàn kho mỗi commit** |

**CI mỗi commit:** typecheck → eslint (gồm boundaries §3) → unit → golden snapshot → validate toàn kho → lint toàn kho → build. Playwright + perf chạy nightly và trên PR đụng `apps/player`.

---

## 10. Hành động tuần 1 (cụ thể)

1. `pnpm init` monorepo; dựng `packages/schema`, `packages/theme`; CI skeleton xanh.
2. Viết TypeBox schema cho Problem/Solution/Step/Scene; port file §4.7 vào `packages/content/examples/`; `validate` chạy được.
3. Theme tokens: Okabe–Ito 8 màu + 8 pattern; kiểm color-blind bằng simulator.
4. Prototype giấy tree navigator, thử trên 1 bài case-branching thật (đề xuất: $R(3,3)=6$) → chốt OPQ-2 và G-03.
5. Mượn/chuẩn bị iPad Gen 9 cho M1 — đo perf tuần 2 chứ không phải tuần 12.
6. Mở issue cho từng OPQ với deadline ở §1.

---

## 11. Truy vết requirement → milestone

| Milestone | Requirement P1 |
|---|---|
| M0 | DAT-01, DAT-03, DAT-20 (schema-side), NFR-A1 (tokens) |
| M1 | DAT-11, DAT-12, DAT-21, PLY-01 (một phần), PLY-03 (một phần), PLY-04, ENG-03, NFR-P1, NFR-P2, NFR-P3 |
| M2 | DSL-01, DSL-02, PLY-06, PRN-01 (Player), BD-04, AUT-04 (CLI v1), NFR-P4, NFR-S1 |
| M3 | ENG-00..04, BD-01, BD-02, BD-03, BD-06, ANC-01, ANC-02, SBX-01, SBX-02, SBX-05, PRN-01 (Sandbox), PRN-02, NFR-P5 |
| M4 | GR-01, GR-02, GR-03, GR-04, GR-08, AUT-10 (Style Guide v1) |
| M5 | PLY-02, PLY-05, DAT-02, DAT-14, NFR-A2, NFR-A3, NFR-A4, NFR-C2, NFR-C3 |
| M6 | AUT-01, AUT-02, AUT-03, AUT-05, AUT-06, AUT-09, AUT-10 (lint), CMS-01, CMS-02, CMS-03, CMS-06, REN-01, REN-02, REN-03, LOC-04, NFR-D1, NFR-D2 |
| M7 | AUT-KPI, NFR-C1, NFR-I1, toàn bộ DoD §15 |

Removed v1.0 (không có trong plan): AUT-07, CMS-04, CMS-07, USR-01..05, NFR-S3, NFR-D3.
