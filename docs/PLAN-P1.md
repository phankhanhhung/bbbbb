# CombViz — Kế hoạch triển khai Phase 1

Nguồn: `docs/SRS-v1.0.md` (SRS v1.0, 2026-07-29) · Định hướng sản phẩm: `docs/PRODUCT-REQUIREMENTS.md` v1.1 (họ ID mới `EXP-*`, `CHO-*`, `DOM-*`) · Trạng thái: **đang chạy, M19 xong (7 engine, phủ ~85%); kho 56 bài đã xuất bản — nhưng do tôi soạn và tôi tự duyệt, G-C chưa đóng** · Đối tượng: 1 người (Owner-Author)

> **Các quyết định đã chốt (2026-07-29)** — xem §12 để biết đầy đủ.
> Quỹ thời gian **35h/tuần** → lịch 16 tuần bên dưới giữ nguyên, không cắt scope.
> Tree navigator = **(a) minimap cây đứng, thu gọn được**. Bound giữ nguyên 40×40 / 400 tile.
> Tên brand chính thức: **CombViz**. License: **MIT cho code, CC BY-SA 4.0 cho nội dung**, engine open source.

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

| # | Giả định | Trạng thái |
|---|---|---|
| A-1 | 16 tuần, một người, **35h/tuần** | ✅ chốt — lịch §7 giữ nguyên, không cắt scope |
| A-2 | Chrome là browser soạn bài (Studio cần File System Access API); Studio chạy **local**, không deploy công khai | ✅ chốt |
| A-3 | Hosting static Cloudflare Pages; CI GitHub Actions | ✅ chốt |
| A-4 | LLM cho AUT-09 truy cập qua API từ máy local (tools/pipeline) | ✅ chốt; đo chi phí + số vòng lặp ở **M4**, không đợi M6 |

**Câu hỏi mở của SRS — trạng thái:**

- **OPQ-1** ✅ **CombViz** là tên chính thức, đã vào `packages/theme` (`brand.name`). Việc còn lại: kiểm domain + handle YouTube/TikTok trước tuần 4.
- **OPQ-2** ✅ **(a) minimap cây đứng, thu gọn được**. Prototype giấy tuần 1 giờ chỉ để chốt bố cục và G-03, không còn để chọn phương án.
- **OPQ-3** ✅ **MIT cho code, CC BY-SA 4.0 cho nội dung** (gồm clip REN-04). Đề bài tách riêng qua `source`, không nằm trong license — xem D-14.
- **OPQ-6** ✅ Giữ 40×40 / 400 tile; demo tromino dừng ở n = 4.
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
| **D-14** | License **MIT cho code, CC BY-SA 4.0 cho nội dung**; engine open source. Đề bài **không** nằm trong license nội dung — tách thành `source { contest, note, url }` trong schema | OPQ-3. Engine mở là kênh growth theo đúng mô hình manim; brand nằm ở corpus và taste chứ không ở palette (§1.2 SRS). Tách đề bài là đối sách trực tiếp của R-5 |
| **D-15** | Ô bàn cờ là element **ngầm định** sinh từ `config`, không materialize vào `elements[]`. Tô tay đi vào `cell_overrides` dạng thưa; preset lo phần còn lại | Bàn 40×40 mà nhét 1600 ô vào file thì diff git vô dụng (DAT-03) và ngưỡng 1MB (NFR-P4) bị đốt vào thứ suy ra được |
| **D-15b** *(sửa ở M1)* | Nhưng khi **vẽ**, mỗi ô là một node riêng có key — **không** gộp ô cùng màu thành một `<path>` như dự tính ban đầu | Gộp thì ít node hơn, nhưng khoảnh khắc thị giác quan trọng nhất của dạng bài tiling là lúc bàn được tô xen kẽ; gộp biến chuyển màu của 62 ô thành một cú nháy. Tối ưu gộp chỉ đưa vào **sau khi** đo iPad cho thấy cần — đó là điều gate G-A trả lời, không phải điều ta đoán trước |
| **D-16** | Ô khuyết **vẫn là** element trỏ tới được bằng anchor | "Bàn cờ khuyết hai ô góc đối nhau" — chính hai ô khuyết là thứ narrative trỏ vào. Khuyết là thuộc tính của ô, không phải sự vắng mặt |
| **D-17** | Luật phụ thuộc giữa package enforce bằng **eslint làm CI đỏ**, không bằng quy ước | Ba ràng buộc kiến trúc quan trọng nhất đều có dạng "X không được import Y" (render↛DOM, schema↛engine, LLM↛runtime). Quy ước không giữ nổi chúng qua 16 tuần |

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
| **G-03** | `merge_ref` render thế nào trong tree navigator (PLY-02) chưa định nghĩa | ✅ Chốt: minimap vẽ cạnh **đứt nét** từ leaf quay về node tổng hợp; node tổng hợp vẽ khác dạng (viên thuốc) để phân biệt với step thường; navigation coi merge_ref như một bước `seq` và breadcrumb reset về nhánh chính. Schema đã enforce: merge_ref là leaf, có `merge_target` trỏ tới step tồn tại, **không** mang scene riêng |
| **G-04** | PLY-06 nói sparkline "theo tiến trình nhánh đang xem" — với `merge_ref` thì "nhánh" là gì | Định nghĩa: đường đi từ root tới step hiện tại theo `parent`, bỏ qua merge_ref. Ghi vào schema doc |
| **G-05** | DAT-02 nói Player đọc được version hiện tại và n−1 minor, nhưng schema sẽ churn dữ dội trong 5 bài đầu | Đặt **schema freeze gate**: schema là `0.x` (không hứa tương thích) tới hết M5; sau 5 bài soạn tay, freeze `1.0.0`, từ đó mọi thay đổi đi kèm migrate CLI. Viết `migrate` CLI ngay tại lúc freeze, không hoãn |
| **G-06** | AUT-KPI đo "median 5 bài cuối pilot" nhưng AUT-08 (công cụ đo) là **P2** | Cần một bản đo tối thiểu ở P1: `combviz stats` đọc log thời gian thủ công (file CSV owner tự ghi) — 2 giờ công, đủ để gate có răng |
| **G-07** | LOC-04 (analytics) là P1 nhưng không nói dùng tool gì | Đề xuất Plausible/Umami self-host hoặc **tắt hẳn ở P1** — cookieless + không PII dễ nhất bằng cách không thu gì. Quyết cùng OPQ-3 |
| **G-08** | SBX-05 export PNG cần render trong browser, REN-01 cần render trong Node — hai đường raster | Browser: `XMLSerializer` + `canvas.drawImage` từ SVG blob. Node: resvg. Cả hai ăn **cùng chuỗi SVG** từ D-03 ⇒ khác biệt chỉ ở rasterizer, chấp nhận được. Golden test so sánh ở mức SVG, không mức pixel |
| **G-11** ✅ *(đóng)* | Bài dạng "thao tác lặp" (lật dấu một hàng/cột, gộp đống sỏi) **không có sandbox được**: board engine không có thao tác nào ứng với "lật một hàng", và không validator nào diễn tả được ràng buộc của chúng. `sign-flip-4x4` vì vậy là bài đầu tiên trong kho không có sandbox | ✅ Đã thêm `board/flip-line` + công cụ "⇄ Lật hàng/cột" trong Sandbox. Ràng buộc của bài nằm trong **thao tác hợp lệ**, nên không có validator nào để thêm — bất biến không lách được vì người học không tô được từng ô. `coverage` vì vậy đọc DoD theo ý: sandbox phải cho phản hồi máy (validator **hoặc** goal), và in riêng số bài có validator |
| **G-12** ✅ *(đóng)* | Không có validator "không chứa tam giác" — cụm bài Turán/Ramsey chỉ kiểm được gián tiếp qua `bipartite` (mạnh hơn hẳn) hoặc `no-mono-triangle` (dành cho đồ thị đã tô hai màu) | ✅ Đã thêm `triangle-free`. Test ghim đúng chỗ nó khác `bipartite`: chu trình $5$ đỉnh không có tam giác nhưng **không** hai phía — `bipartite` cấm nhầm nó |
| **G-09** *(mới, M1)* | Quân cờ vẽ bằng ký tự Unicode (`♞`). Render headless bằng resvg **không có phông** ⇒ quân biến mất khỏi OG card trong khi player vẫn hiện — đúng loại lệch mà D-03 sinh ra để tránh | Nhúng phông vào bước raster, hoặc chuyển quân sang path. Quyết ở M6 cùng label atlas (D-07). Bài seed dùng quân phải render thử headless trước khi publish |
| **G-10** *(mới, M1)* | Theme khai độ dày nét bằng số tuyệt đối, nhưng mỗi engine có tỉ lệ toạ độ riêng ⇒ cùng token cho ra nét mảnh ở engine này, bè ở engine kia. Phát hiện khi halo anchor phủ kín cả quân domino | ✅ Chốt quy ước: **một ô / một khoảng cách đỉnh chuẩn = 10 đơn vị scene**, ghi trong `StrokeTokens`. Engine mới chọn tỉ lệ theo quy ước, không ngược lại |

---

## 6. Milestones

Ký hiệu: **[E]** track Engine · **[C]** track Content. Mỗi milestone có DoD kiểm được.

### M0 — Nền móng & khử rủi ro quyết định · Tuần 1 · [E] — ✅ **XONG**

- ✅ Monorepo pnpm, TS strict, eslint boundaries (D-17), CI workflow (typecheck + lint + test + validate toàn kho).
- ✅ `packages/theme`: tokens Okabe–Ito sắp lại cho tổ hợp (class 1/2 = cặp đậm/nhạt) + pattern dự phòng (NFR-A1, DAT-20).
- ✅ `packages/schema` v0.1.0: Problem/Solution/Step/Scene theo §4.2–4.4; whitelist đóng; parser anchor markup; engine registry.
- ✅ `packages/engines/board`: schema fragment + bound (NFR-P4) + luật đặt tile.
- ✅ `tools/pipeline`: `combviz validate` (schema → cấu trúc cây → anchor → bound → taxonomy) và `combviz schema`.
- ✅ Bài mẫu §4.7 dạng đầy đủ, validate sạch; 33 test xanh.
- ✅ Taxonomy YAML (CMS-01) + ràng buộc chéo techniques↔widget của lint AUT-10.
- ⬜ Prototype giấy tree navigator — chốt bố cục minimap (phương án đã chọn ở OPQ-2).

**DoD:** ✅ `pnpm check` xanh: typecheck, lint, 33 test, validate toàn kho 0 lỗi 0 cảnh báo.

### M1 — Walking skeleton (cược kiến trúc) · Tuần 2–3 · [E] — **code xong, chờ đo iPad**

Đây là milestone quan trọng nhất. Mục tiêu duy nhất: chứng minh 3 cược ở §0.

- ✅ `packages/render`: `render()` thuần, `diff()`, `interpolate()` (D-03/D-05), `serialize()`, `hash()` (A-03); lớp DOM (`patch`, `animate`) tách sang entry point `@combviz/render/dom`.
- ✅ `engines/board` renderer: bàn + ô + coloring preset + tile với xoay/lật + quân + region.
- ✅ `apps/player`: đọc JSON, Prev/Next, phím ←/→/Space, narrative KaTeX, anchor hai chiều (ANC-01), animation từ auto-diff, `prefers-reduced-motion`.
- ✅ `combviz render` — REN-01 chạy headless trong Node, **cùng renderer** mà Player dùng.
- ✅ Golden SVG snapshot + 82 test.
- ⬜ **Đo perf trên iPad Gen 9 thật** (R-3). Đây là phần duy nhất còn lại của gate G-A.

**Kết quả đo được tới giờ:**

| Cược | Trạng thái |
|---|---|
| 1. Auto-diff sinh animation đủ tốt (DAT-11/12) | ✅ Bước tô màu: `thêm 0 · mất 0 · đổi 62` — đúng 62 ô còn lại, không dựng lại bàn. Bước đặt quân: `thêm 3`. |
| 2. 55fps trên iPad (NFR-P1) | ⬜ Chưa đo. Bundle Player **143KB gzip** / trần 300KB (NFR-P3) — đạt, còn dư cho engine sau. |
| 3. Một renderer chạy cả browser lẫn headless (REN-01/04) | ✅ `combviz render` sinh SVG trong Node bằng đúng `boardRenderer`; eslint chặn DOM lọt vào `packages/render` (đã thử nghiệm cả hai chiều). |

**DoD:** bài §4.7 chạy end-to-end trên iPad thật, chuyển step ≤150ms p95, kéo timeline mượt. Nếu trượt → **dừng, đánh giá lại Canvas fallback trước khi đi tiếp**. Không viết engine thứ hai khi cược này chưa xong.

### M2 — DSL + validator + invariant · Tuần 4–5 · [E] — ✅ **XONG**

- ✅ `packages/dsl`: tokenizer, parser Pratt viết tay, interpreter sandboxed, ngân sách bước + đồng hồ (DSL-01/02).
- ✅ `deriveBoard(scene)` memo theo hash scene (A-03/A-04): `covered()`, `attacks()`, `adjacent()`.
- ✅ BD-04 validator built-in: `tiles-no-overlap`, `tiles-in-bounds`, `full-cover`, `no-attacks`, `pieces-per-row|col:<k>`.
- ✅ PLY-06 invariant strip + sparkline theo nhánh đang xem (G-04).
- ✅ `combviz validate` chạy đủ AUT-04 phần máy: schema → cấu trúc → anchor → bound → taxonomy → **eval invariant/validator mọi step**.
- ✅ 138 test, trong đó 30 test riêng cho DSL gồm sandbox và ngân sách.

**DoD:** ✅ Invariant `inv-bw` cho **−2** ở cả s1 và s2 — bất biến thật sự bất biến, hiện trên Player kèm nhãn "không đổi qua bước này". `validate` bắt được biểu thức hỏng ở *một* step cụ thể (`min` trên tập rỗng khi chưa có quân nào).

**Lỗ hổng sandbox tìm ra ở đây:** tra tên bằng `bindings[name]` rơi xuống `Object.prototype`, nên `constructor`, `toString`, `valueOf` trở thành tên hợp lệ trỏ vào nội tại của JS — và `constructor(...)` gọi được thật. Sửa bằng `Object.hasOwn` ở cả ba chỗ tra (tên, thuộc tính element, tên hàm). Đây đúng là loại lỗ mà NFR-S1 nhắm tới; test bắt được vì nó hỏi thẳng câu "nội dung có với tới global của JS không".

### M3 — Board engine đầy đủ + Sandbox · Tuần 5–7 · [E] — **phần lớn xong**

- ✅ ENG-00/01: `packages/editor` — command layer, undo/redo (trần 60 bước), selection.
- ✅ BD-01 (tô ô, kéo quét gom thành một lệnh, preset), BD-02 (đặt quân, attack overlay), BD-03 (đặt/xoay/lật/xoá tile, độ phủ), BD-06 (đếm theo color_class).
- ✅ Hit-test hình học thuần (A-05) — không dùng `elementFromPoint`.
- ✅ SBX-01 (sandbox theo problem) + SBX-02 (validator live, bật/tắt từng ràng buộc), PRN-01 (invariant live khi thao tác).
- ✅ PLY-05 "Thử từ đây" — fork scene sang Sandbox, đóng lại quay về đúng step.
- ✅ REN-03 watermark trong export.
- ⬜ **ENG-02 zoom/pan** — chưa làm.
- ⬜ **ENG-04 worker + cancel** — cố ý hoãn tới M4: board chưa có analyzer nào chạy quá 100ms, dựng worker cho việc không tồn tại là dựng thứ không test được. Graph engine mới thật sự cần.
- ⬜ **ANC-01 chiều ngược** (chạm element → sáng span) — hạ tầng hit-test đã có, còn phần nối vào narrative.
- ⬜ **SBX-01 cửa vào độc lập** (sandbox không cần problem, từ menu chính) — chờ định tuyến ở M6.
- ⬜ **SBX-05 export PNG** — mới có SVG.
- ⬜ **PRN-02 partition view.**

**DoD:** ✅ Kiểm bằng browser thật: đặt hai domino chồng nhau → "2 quân chồng lên nhau" + viền đỏ; invariant tụt từ −2 xuống −3 (cấu hình sai thì bất biến vỡ — đúng điều cần thấy); hoàn tác một lần khôi phục cả hai; kéo quét 5 ô đổi bảng đếm 30/32 → 28/29/5 và invariant sang −1.

### M4 — Mở cửa content + Graph engine · Tuần 6–9 · [E]+[C] — **track [E] xong**

**[C] từ tuần 6 — song song, ưu tiên cao hơn Graph khi xung đột:**

- Soạn **tay hoàn toàn 5 bài** (JSON thô + `combviz validate` + Player preview). Bắt buộc gồm cả bài §4.7 và ≥1 bài case-branching.
- Ghi lại mọi chỗ schema/khái niệm gây vướng → backlog sửa schema.
- **Style Guide v1** kết tinh từ 5 bài này (AUT-10), không viết trước.
- Bắt đầu đo thời gian soạn (G-06).

**[E]:** ✅

- ✅ `engines/graph`: schema (multigraph + khuyên), renderer, command, hit-test, môi trường DSL, validator.
- ✅ GR-02 layout circle/grid/bipartite/line, bake thành toạ độ tĩnh.
- ✅ GR-03 analyzer: bậc, liên thông, hai phía (kèm nhân chứng chu trình lẻ), chu trình, Euler (Hierholzer, trả cả đường đi cụ thể).
- ✅ GR-04 Hamilton backtracking, từ chối kèm lý do khi vượt 20 đỉnh.
- ✅ **ENG-04** (hoãn từ M3): analyzer chạy trong Web Worker, cache theo hash scene, huỷ được.
- ✅ Bài $R(3,3)=6$ — case-branching thật với `merge_ref`, 10 step, hai engine đã chạy song song trong Player.
- ✅ GR-08 nhãn LaTeX trong canvas — label atlas (D-07) làm ở **M18**: MathJax dựng path lúc build, `packages/content/labels.json` cam kết vào git, CI canh bằng `pnpm labels`.

**DoD:** ⬜ Còn track [C]. Graph engine đã chạy đủ analyzer trên $K_6$ và cho kết quả đúng: 1 thành phần, không hai phía (chu trình lẻ dài 3), Euler không tồn tại (6 đỉnh bậc lẻ), có chu trình Hamilton qua 6 đỉnh.

**Track [C] là việc của chính chủ, không phải của máy.** §16 nói rõ 3–5 bài đầu phải soạn tay để Style Guide kết tinh từ thực tế; một Style Guide chắt ra từ bài do máy viết cũng là Style Guide bịa, chỉ bịa tinh vi hơn. Bài $R(3,3)=6$ ở đây là **fixture kỹ thuật** — nó chứng minh engine chạy, không đặt chuẩn biên tập.

### M5 — Player hoàn chỉnh + **schema freeze** · Tuần 9–10 · [E] — **xong, trừ freeze**

- ✅ PLY-02 tree navigator: minimap cây đứng thu gọn được, breadcrumb, chọn nhánh ở case node, ✗ ở lá mâu thuẫn, ↰ ở merge_ref, nút "về điểm rẽ nhánh".
- ✅ PLY-01 đầy đủ: Play/Pause, tốc độ ×0.5/×1/×2, phím ←/→/Space/Esc, vuốt trái–phải trên cảm ứng.
- ✅ Auto-play **dừng** ở node rẽ nhánh — `nextStep` trả `null` ở đó, nên không cần luật riêng và không có đường nào lỡ chọn hộ người học.
- ✅ DAT-14 deep-link `?sol=&step=`, URL cập nhật theo từng bước; link trỏ tới step không tồn tại thì về gốc êm.
- ✅ NFR-A2 bàn phím đầy đủ, NFR-A3 `alt_text` kèm fallback tự sinh.
- ✅ `combviz migrate` + cửa sổ tương thích `isReadableVersion` (DAT-02).
- ⬜ **Schema freeze lên 1.0.0 — cố ý chưa làm.** Gate G-C buộc freeze *sau* 5 bài soạn tay, vì chỉ khi soạn thật mới lộ ra schema thiếu gì. Kho có 2 bài và chưa bài nào do chính chủ soạn. Freeze bây giờ là hứa tương thích cho một hợp đồng chưa được thử; bộ máy migrate thì đã sẵn, và nó cần có **trước** lúc freeze chứ không phải sau.

**DoD:** ✅ Kiểm bằng browser trên bài $R(3,3)=6$: ở điểm rẽ nhánh, Next và Play cùng tắt và hai nút chọn trường hợp hiện ra; đi 1 → 1a cho breadcrumb "Trường hợp 1 › 1a" và URL `step=s3`; qua merge_ref đáp xuống s7; "về điểm rẽ nhánh" từ s7 quay đúng về s1.

### M6 — Studio + pipeline + xuất bản · Tuần 10–12 · [E] — **xong, trừ raster OG**

- ✅ AUT-01 (nhân bản scene của cha → sửa → lưu), AUT-02 (anchor tool: bôi đen + chọn element → sinh `[[aN|…]]` và mục `anchors` **cùng lúc**), AUT-03 (thêm/xoá nhánh, xoá kéo theo cả cây con), AUT-05 (preview bằng đúng renderer thật + khung iPad 1024×768), AUT-06 (File System Access API, Ctrl/Cmd+S ghi thẳng vào repo).
- ✅ AUT-04 **một bộ kiểm** cho ba nơi: `packages/check` được Studio, CLI và CI cùng gọi. Trước đó bộ kiểm nằm trong `tools/pipeline` và Studio không với tới được — mà một Studio kiểm khác CI thì đúng bằng không có cổng nào. Lỗi click-to-jump: bấm vào issue nhảy tới step tương ứng.
- ✅ **AUT-09 draft pipeline**: `import-draft` ép `status=draft` và `verified=false` trên **mọi** step trước khi chạy validate + lint → chế độ duyệt từng step trong Studio → publish bị khoá khi còn step chưa duyệt. Không có nút "duyệt tất cả", và đó là chủ ý (R-8).
- ✅ **AUT-10 lint**: glossary, format `case_label`, step không neo vào hình, khoảng trắng thừa, narrative quá nhiều câu, nhánh `case` mồ côi, thiếu `alt_text`/`og_step_ref`/sandbox khi publish, file chưa `fmt`. Mọi thứ ở đây là **cảnh báo** — lint chặn được thì đã nằm ở validate.
- ✅ `docs/STYLE-GUIDE.md` (AUT-10) — cố ý chia "phần đã chốt" (những gì code đang ép) và "phần bỏ ngỏ" (chờ 5 bài soạn tay). Xem ghi chú dưới.
- ✅ CMS-01 taxonomy YAML, CMS-02 filter + tìm kiếm client-side trên chỉ mục build-time, CMS-03 lời giải che mặc định, CMS-06 license bắt buộc.
- ✅ REN-01 headless render, REN-02 OG card (`og_step_ref` từ G-01), REN-03 watermark.
- ✅ G-06 `combviz stats`.
- ⬜ **OG card mới ra SVG, chưa raster sang PNG.** Twitter/Facebook không đọc SVG, nên REN-02 chỉ **xong một nửa**: card đúng nhưng chưa dùng được ở đúng chỗ nó sinh ra để dùng. Bước raster là chỗ G-09 (phông cho ký tự quân cờ) đến hạn — hai việc này phải làm cùng nhau, vì raster mà thiếu phông thì quân cờ biến mất im lặng.
- ⬜ Không dùng MiniSearch. Ở quy mô ≤ 500 bài, so khớp con chuỗi trên text đã chuẩn hoá dấu là đủ, và nó cho luôn thứ MiniSearch không cho: gõ "ban co" tìm ra "bàn cờ".

**DoD:** ✅ Kiểm bằng browser: Studio mở file thật, báo `0 lỗi · 0 cảnh báo`, `Duyệt 10/10`; bỏ tick một step → hiện `publish/step-not-verified` và nút publish đổi thành "Còn 1 bước chưa duyệt"; sửa narrative → lint kêu `anchor/unused`, `lint/no-anchor`, `lint/too-many-sentences` ngay. Kho hiện 2 card, lọc theo kỹ thuật và tìm "ban co" đều đúng.

**Ba lỗi thật do test M6 lôi ra** — đáng ghi vì cả ba đều thuộc loại "xanh nhưng sai":

1. `\b` trong regex glossary chỉ biết `[A-Za-z0-9_]`, nên `\bô vuông nhỏ\b` **không bao giờ khớp** — quá nửa bảng glossary chết câm. Một linter im lặng thì không tự tố cáo.
2. Luật "step có hình mà không có anchor" đếm `elements.length > 0`, trong khi bàn cờ 8×8 sinh 64 ô từ `config` với `elements` rỗng (D-16) — tức là luật miễn trừ đúng những bài dùng engine board.
3. `nextStepId` hứa không tái dùng id đã xoá nhưng chỉ lấy max trên step **đang còn**: xoá step cuối rồi thêm bước mới sẽ cấp lại đúng id đó, và một `merge_target` đang treo sẽ lặng lẽ trỏ sang step khác — tệ hơn nữa, validate đang báo đỏ sẽ **xanh trở lại** trong khi bài đã sai.

### Ghi chú vận hành — "xanh ở local" không phải bằng chứng

CI đỏ suốt bốn milestone kể từ commit thêm job `e2e` và `perf`, trong khi mọi lần
chạy ở máy soạn đều xanh 14/14. Nguyên nhân không nằm trong test:

`playwright.config.ts` đặt `reuseExistingServer: !process.env.CI`. Ở máy soạn có
một `vite preview` còn sống từ lần chạy Playwright **đầu tiên**, nên mọi lần chạy
sau đó dùng lại nó — và `webServer.command`, đường duy nhất CI đi, chưa từng được
thực thi ở local lần nào. Con số "14/14" đúng, nhưng nó đo một cấu hình mà CI
không bao giờ chạy.

Trên runner, `vite preview` mặc định nghe ở `localhost`, phân giải ra `::1` trước;
Playwright gõ cửa `127.0.0.1` rồi chờ hết 180 giây. Tiến trình vẫn sống nên lỗi
hiện ra dưới dạng **timeout câm** — ba phút không một dòng log.

Ba việc rút ra, đã áp dụng:

1. Cổng và host khai trong `apps/player/vite.config.ts`, không truyền qua cờ dòng lệnh — cấu hình trong file thì chạy ở đâu cũng ra một kết quả.
2. `stdout`/`stderr` của webServer nối vào log. Một server không lên phải **nói** ra điều đó, không phải im ba phút rồi để lại một dòng "Timed out".
3. Khi một job chỉ đỏ ở CI, kiểm tra trước tiên xem **đường chạy ở local có thật sự là đường CI đi không** — trước khi đi tìm lỗi trong code.

### M19 — Công cụ sandbox theo engine · [E] — **xong**

Không phải hạng mục trong hàng đợi; đây là **lỗi chính chủ tìm ra khi bấm thử**:
sandbox bày ra những chức năng không thuộc engine đang mở.

**Chẩn đoán.** Thanh công cụ là một danh sách gõ cứng trong `apps/player`: tám ô
màu, bốn hình tile, "Xoá quân", "Lật hàng/cột" — và **mọi** nút đều dispatch lệnh
`board/*`. Nó hiện y hệt nhau ở cả bảy engine. Hậu quả đi cả hai chiều:

- **Nút thừa.** Ở graph, set, point, game, derivation thì `board/paint-cells`
  không nằm trong registry, `execute` trả "không áp được", và **không ai báo gì
  cả**. Người học bấm một nút trông dùng được rồi nhận lại sự im lặng.
- **Nút thiếu, và đây mới là phần tệ hơn.** Năm engine ấy có **13 lệnh** đã viết
  từ lâu — `graph/add-edge`, `graph/set-color`, `set/toggle-membership`,
  `point/toggle-segment`, `game/take`, `game/split`, `derivation/toggle-cancel`…
  — mà không có một cái nút nào gọi tới. Sandbox của chúng là khung chết.
- Phím tắt cũng thế: `Delete` luôn gọi `board/remove`, `R` luôn gọi
  `board/rotate-tile`.
- Và danh sách chép tay đã lệch khỏi engine: Player bày **3** luật gộp trong khi
  engine dãy có **5**, nhãn cũng viết khác.

**Sửa.** `SandboxTool` ở `packages/editor`: engine **tự khai** công cụ của nó, là
hàm của `scene` chứ không phải hằng số. Player chỉ biết bảy dạng tương tác
(`select`/`paint`/`one`/`two`/`stamp`/`line`/`run`/`count`) — toàn là hình thức
thao tác, không có nội dung toán nào. Cùng một lỗi gốc với "trường ma": hai nguồn
sự thật cho một câu hỏi. Giờ UI **hỏi** thay vì đoán.

Kết quả nhìn thấy được: sandbox game bày ra **mỗi nước đi hợp lệ là một nút**
("Bốc 1".."Bốc 7"), và số nút đổi theo thế — "bốc tối đa nửa đống" ở đống 7 có ba
nút, ở đống 3 có một nút. Thanh công cụ *là* luật chơi.

**Lưới canh:** `packages/editor/test/tool.test.ts` ép hai chiều — không nút nào
gọi lệnh engine không có, và engine có lệnh thì phải có nút. Cộng hai e2e: công
cụ đổi theo engine, và bấm một nước đi trong sandbox game **thật sự** đổi thế.

**Một cái bẫy tự tạo, bắt được ngay:** đổi công cụ mặc định từ "tô màu 1" sang
"Chọn" làm bài đo NFR-P1 **im lặng đo nhầm** — nó vẫn quét, vẫn ra con số đẹp,
chỉ là đo thao tác chọn. Nay bài đo tự bấm công cụ tô và **khẳng định hình có
đổi**; mỗi lượt quét dùng một màu khác, vì tô lại đúng màu cũ thì hình đứng yên.

Kho không đổi: **56 bài**. 822 test, e2e 36 xanh, perf trong ngân sách.

### M18 — Derivation engine + label atlas D-07 · [E] — **xong**

Hạng mục **cuối cùng** của hàng đợi §7 trong `docs/VIZ-COVERAGE.md`.

**Hai phần, và phần dưới là điều kiện của phần trên.**

**D-07 — label atlas.** Nhãn LaTeX *trong canvas* không thể dùng KaTeX như
narrative pane: KaTeX dựng ra HTML, nhét vào SVG phải qua `<foreignObject>`, mà
resvg (REN-01/02) không hỗ trợ thẻ đó. Nhãn sẽ hiện trong Player rồi **biến mất**
khỏi OG card — đúng loại lệch mà D-03 sinh ra để chặn, và G-02 đã ghi tên nó từ
đầu. Cách làm: MathJax dựng path một lần lúc build (`pnpm labels --write`), khoá
theo chính chuỗi LaTeX, ghi ra `packages/content/labels.json` và **cam kết vào
git** như golden SVG. Player nạp bảng theo `needsLabels` của engine, nên bài bàn
cờ không tải một byte nào (chunk riêng, 5.8KB gzip).

**Derivation engine.** Scene là các **dòng**; mỗi dòng là dãy **hạng tử**; mỗi
hạng tử có `id`, `tex`, `role`, `color_class`. Dòng gióng theo dấu quan hệ, và
`id` sống xuyên step — nên diff DAT-11/12 cho ra một *chuyển động* thay vì "xoá
cái này thêm cái kia".

**Luật đáng giá nhất của milestone: `derivation/silent-drop`.** Hạng tử biến mất
giữa hai bước mà không khai là **lỗi**. Lối ra: `cancelled: true` (triệt tiêu,
hình gạch chéo) hoặc `becomes: "<id>"` (bị thay thế — và id đích phải có thật ở
bước sau, nên lời khai vẫn kiểm được). Đánh rơi một hạng tử là lỗi đại số hay gặp
nhất khi soạn tay, và nó không lộ ra vì dòng dưới trông vẫn hợp lý.

Luật này chạy lần đầu báo **14 lỗi trên chính bài telescoping tôi vừa viết, và cả
14 đều không phải lỗi**. Đó là thông tin về *luật*, không về nội dung: nó cho
thấy hai lằn ranh phải cắt — dấu phép toán và dấu quan hệ được miễn (chúng là
chất kết dính, và mất một dấu trừ thì dòng công thức trông đã sai rồi), còn bước
thay hẳn cách trình bày (không id nào đi tiếp) thì không so được. Đến bài Pascal
nó lại báo tiếp, và lần này chỉ ra rằng **luật còn thiếu một lối ra**: một hạng
tử có thể mất vì bị *thay thế*, không chỉ vì triệt tiêu. Đó là chỗ `becomes` ra
đời.

**Ba lỗi hình, cả ba chỉ lộ khi render ra ảnh và nhìn:**

- **Dòng chồng lên nhau.** Chiều cao dòng để hằng số $10$; một $\sum$ dạng trưng
  bày cao gấp đôi thế. Nay chiều cao là cao–sâu **thật** của nhãn trong dòng.
- **`align: 'left'` dịch âm.** "Gióng về mốc $0$" làm dòng có dấu quan hệ đứng
  sau bị đẩy sang **trái** ra ngoài khung. Nay `left` nghĩa là dịch đúng $0$.
- **Công thức dạt sang một bên giữa hai mảng trắng.** CLI gọi `viewportOf(scene)`
  **thiếu ctx**, nên khung tính bằng bảng rỗng còn hình vẽ bằng bảng thật; tỉ lệ
  lệch, trình duyệt letterbox. Đây là cái bẫy do chính tôi tạo ra khi cho `ctx`
  thành tham số tuỳ chọn — đã rà lại **mọi** chỗ gọi (CLI, OG, Player, Sandbox,
  Studio, BijectionPanes) và có test khoá.

Ngoài ra: MathJax **không ném** khi gặp lệnh LaTeX sai — nó vẽ nguyên chuỗi ra
bằng chữ đỏ và trả về SVG hợp lệ. Phần sinh atlas bắt đúng chỗ đó, nếu không thì
một lệnh gõ nhầm đi thẳng vào kho.

**Mức phủ:** ~83% → **~85%** (cột "có hình mang thông tin": ~90% → **~97%**).
Kho: 54 → **56 bài** (`telescoping-sum-fractions`, `pascal-identity-two-ways`).
787 test, bundle 250.7KB gzip mỗi trang bài, e2e xanh.

**Hàng đợi §7 đã cạn.** Từ đây không còn hạng mục "thêm một engine nữa" nào có
lãi rõ ràng; phần thiếu còn lại là §6 (lập luận không mang nội dung không gian)
cộng mấy mảnh đã ghi tên: tô mặt đồ thị, PT-03 tô vùng, GM-01 rule script,
animation biến hình PRN-04.

### M17b — rà lại "engine game đã đủ mở chưa" · [E] — **xong**

Không phải milestone mới, là **kiểm lại lời mình vừa nói**. Câu trả lời hoá ra
có ba phần, và cả ba đều phải kiểm bằng máy chứ không bằng trí nhớ.

**Phần chạy được thì chạy đúng.** Năm họ game bốc đống kinh điển — Nim nhiều
đống, bốc $1..k$, bốc theo tập, trò Grundy chia đống, cùng bản misère — đều đối
chiếu vét cạn với định nghĩa gốc trên hơn 600 thế, và khớp.

**Phần không chạy được thì nhiều hơn tôi ghi.** Ranh giới thật nằm ở `Move`: một
nước là "một đống biến thành mấy đống". Wythoff (ăn hai đống), trò Euclid (đọc
đống kia), Nim Fibonacci (nhớ nước trước), Nim Lasker (hợp hai luật), Chomp, cờ
trên đồ thị, game bàn cờ, game partizan — tất cả nằm ngoài, và không phải vì
thiếu một luật nữa.

**Một dòng vá được ngay:** "bốc tối đa nửa đống" là cách phát biểu rất hay gặp mà
`subtract` không khai được (thế thua $2^m - 1$, không phải cấp số cộng). Thêm
thành viên thứ tư `subtract-fraction` vào họ luật đóng là đủ — không đụng DSL-03.
Kho: 53 → **54 bài** (`take-at-most-half`).

**Hai lỗi hình, cả hai chỉ lộ khi render ra ảnh và nhìn:**

- Đống $40$ viên vẽ đúng **24** chấm dưới cái nhãn ghi "40" — ai đếm sẽ ra 24, mà
  đếm chính là việc bài bốc sỏi bắt người đọc làm. Test cũ khẳng định
  `circles <= 24` nên nó **xanh trong lúc hình nói dối**. Nay: quá ngưỡng thì vẽ
  ký hiệu lược (ba viên, dấu ⋮, một viên đáy) — không mời ai đếm.
- Viewport view `piles` ước lượng bằng mấy hằng số cộng vào, chừa hơn một phần ba
  khung làm khoảng trắng; sỏi nằm lọt thỏm dưới đáy một khung dựng đứng. Nay
  viewport và renderer đọc **cùng một** hộp bao.

**Hạ số phủ họ trò chơi:** xem ngay dưới.

**Hạ số sau khi kiểm lại:** tôi ghi phủ họ trò chơi 65% ngay sau M17, rồi khi liệt
kê thật những game không khai được (Wythoff, trò Euclid, Nim Fibonacci, Chomp, cờ
trên đồ thị) thì thấy 65% không đứng vững — tập luật đóng chơi được **game bốc
đống**, và đó là một họ con. Hạ còn **57%** (55% trước khi thêm
`subtract-fraction`), tổng 83.8% → **83.3%**. Không có code nào bị gỡ giữa hai con
số; chỉ có tôi kiểm lại điều mình đã khẳng định. Chi tiết ranh giới ở
`docs/VIZ-COVERAGE.md` §4.

### M17 — Game engine · [E] — **xong một phần, và phần thiếu là có chủ ý**

Hạng mục 7, đắt nhất trong hàng đợi.

> **Không mở DSL-03.** SRS đòi GM-01 "định nghĩa game bằng rule script
> sandboxed" — một ngôn ngữ *có trạng thái*, chạy Web Worker với budget riêng
> (NFR-S2). Tôi dùng **tập luật đóng** thay thế, vì (a) R-2 trong sổ rủi ro là
> "DSL phình thành ngôn ngữ lập trình" và đối sách ghi rõ là grammar đóng,
> (b) `COMBINE_RULES` của engine dãy đã có tiền lệ đúng như vậy, (c) ba luật
> đóng phủ gần hết game thi đấu. **GM-01 vẫn còn nợ**, và game có luật riêng —
> cờ trên đồ thị, Chomp, trò tô màu — chưa khai được.

- ✅ Ba luật đóng có tham số: bốc theo khoảng (Nim là trường hợp không giới hạn), bốc theo tập cho trước, chia đống thành hai phần khác nhau.
- ✅ Solver: giá trị Grundy + XOR cho luật chơi thường; **duyệt lùi** cho misère, vì lý thuyết Grundy không áp dụng được ở đó. Vượt trần thì từ chối kèm lý do (GM-03).
- ✅ View `spectrum` — mọi thế một đống từ $0$ tới $N$, tô theo thắng/thua. Đây là view đắt giá hơn hẳn: phát biểu "thua đúng khi $n$ chia hết cho $k+1$" không phải câu để tin, nó là **một vệt sọc** hiện ra trên màn hình.
- ✅ Lệnh đi **tự kiểm luật** — gọi đúng hàm sinh nước mà solver dùng. Nếu để lệnh sửa số viên tuỳ ý thì người học "thắng" bằng một nước không tồn tại, và sandbox mất hết ý nghĩa.
- ✅ Hai bài: `take-stones-one-to-three`, `nim-three-piles-xor`.

**`claims` bắt hai lỗi của chính tôi trong milestone này** — và đó là lần đầu cơ
chế M14 trả cổ tức trên nội dung mới:

1. Tôi viết "người đi trước thắng" cho $20$ viên bốc $1..3$. Sai: $20 = 4 \times 5$
   là bội của $4$, nên người đi trước **thua**.
2. Tôi viết Nim$(3,5,7)$ có "đúng $1$ nước thắng". Sai: có **$3$** — bốc một viên
   từ bất kỳ đống nào đều đưa XOR về $0$.

Cả hai đều là loại lỗi mà đọc lại bằng mắt rất dễ trượt, và cả hai đều đỏ ngay ở
`validate`.

Solver đối chiếu **vét cạn** trên $5$ luật: hơn $500$ thế cho luật thường, hơn
$100$ cho misère, cộng kiểm rằng **mọi** nước được báo là thắng thật sự đưa đối
thủ vào thế thua. Lý thuyết Sprague–Grundy là một tầng gián tiếp (Grundy → XOR →
thắng/thua), và một lỗi ở `mex` vẫn cho ra những con số trông hoàn toàn hợp lý.

**Hai lỗi hình chỉ lộ khi nhìn:** đống $20$ viên vẽ thành một cột tỉ lệ $1:20$
(nay chồng thành khối $4\times6$), và nhãn các đống nằm so le theo chiều cao từng
cột nên một hàng "3, 5, 7" đọc ra như mấy con số rời rạc (nay chung một đường chân).

**Mức phủ:** ~80% → **~83%**. Kho: 51 → **53 bài**.

### M16 — Poset / sơ đồ Hasse · [E] — **xong**

Hạng mục 6, và là **hạng mục rẻ cuối cùng** của hàng đợi.

- ✅ `analyzePoset`: chiều cao (xích dài nhất), chiều rộng (phản xích lớn nhất), tối tiểu/tối đại, và **cạnh thừa** so với sơ đồ Hasse.
- ✅ Layout `hasse`: mỗi tầng một hàng, đọc từ dưới lên.
- ✅ Validator `hasse-diagram`; binding DSL `height`, `width`, `minimal`, `maximal`.
- ✅ Bài `dilworth-divisors-twelve` trên lưới ước của $12$.

**Điểm đắt giá nhất: Dilworth tính bằng *chính* lõi ghép cặp của GR-06.** Phủ
xích nhỏ nhất trên DAG là $n - |M|$ với $M$ là ghép cặp tối đa trên đồ thị "tách
đôi" của bao đóng bắc cầu, và nhân chứng phản xích lấy từ **phủ đỉnh König**:
$A = \{v : v^{out} \notin C,\ v^{in} \notin C\}$. Nên M12 trả cổ tức ở đây —
không viết lại thuật toán nào, chỉ tách lõi `solveBipartite` ra khỏi `matching()`
để hai chỗ dùng chung. Viết lần thứ hai là mời hai bản lệch nhau, và lệch ở một
thuật toán mà kết quả sai vẫn trông hợp lý. 64 test cũ của GR-06 vẫn xanh sau
refactor.

Chiều rộng đối chiếu **vét cạn** trên hơn $300$ DAG $5$ đỉnh, và nhân chứng phản
xích được kiểm là phản xích thật với đúng cỡ. Ba tầng gián tiếp (ghép cặp → phủ
König → phản xích) thì lỗi ở tầng nào cũng cho ra con số trông hợp lý; chỉ định
nghĩa gốc nói được.

**Mức phủ:** ~79% → **~80%**. Kho: 50 → **51 bài**.

**Hàng đợi nay chỉ còn hai hạng mục, cả hai đều đắt** — game engine (cần DSL-03)
và derivation engine (cần label atlas D-07). Phần "rẻ mà lãi" đã hết. *(M18 đã lấy nốt hạng mục này.)*

### M15 — Point/segment engine · [E] — **xong**

Hạng mục 4 của hàng đợi. Họ "hình học tổ hợp" chiếm 5% đề thi và trước milestone
này phủ đúng **5%** — gần như trắng.

- ✅ **`packages/engines/point`** (PT-01..02): điểm, đoạn, **đường thẳng**, đa giác; bao lồi, kiểm thẳng hàng, đếm giao điểm, lưới nền.
- ✅ Tách khỏi graph engine là quyết định trung tâm, và lý do nằm ở chỗ hai engine **mâu thuẫn nhau về ý nghĩa toạ độ**. Ở graph, vị trí đỉnh là nội dung *sư phạm* (GR-02) — xếp vòng tròn cho thấy đối xứng — và bài học của M4 là *layout biết nói dối*. Ở đây thì ngược lại: thẳng hàng, lồi, cắt nhau đều là **mệnh đề của bài toán**, và nhích một điểm là đổi đáp án. Gộp chung thì sẽ có ngày ai đó hỏi bao lồi của một đồ thị hai phía và nhận được câu trả lời trông rất hợp lý.
- ✅ Năm validator: `general-position`, `convex-position`, `no-crossings`, `hull-size:<k>`, `lattice`.
- ✅ Ba bài: `lattice-midpoint-five`, `happy-ending-five-points` (cây ba nhánh theo cỡ bao lồi), `hexagon-diagonal-crossings`.

**Bốn chỗ tự bắt được, ba trong số đó chỉ lộ ra khi nhìn hình:**

1. **`intersections` đếm *cặp đoạn* chứ không đếm *điểm*.** Hai con số ấy khác nhau đúng khi có ba đoạn **đồng quy** — và lục giác đều có ba đường chéo chính gặp nhau ở tâm, nên $15$ cặp chỉ cho $13$ điểm. Bài "đếm giao điểm" hỏi số điểm; hình vẽ ra $13$ chấm trong khi con số ghi $15$ là đúng lớp lỗi M14 vừa dựng máy để chặn. Tách thành `intersections` (điểm) và `crossing_pairs` (cặp), rồi lấy chính chỗ chênh đó làm nội dung bài.
2. **Thiếu hẳn khái niệm đường thẳng.** Bước "kéo dài đường qua $P_4$, $P_5$ — nó chia mặt phẳng làm hai nửa" vẽ ra một gạch ngắn nằm giữa hai chấm. Câu chữ nói *chia mặt phẳng*, hình không cho thấy gì. Thêm element `line`, kéo hết khung.
3. **Trường hợp khó nhất của Happy Ending chỉ được một câu chữ.** Bao lồi $3$ đỉnh là chỗ duy nhất phải nghĩ, mà bản đầu gộp nó vào một câu cùng hai trường hợp kia. Tách thành nhánh riêng có hình, và toạ độ chọn bằng cách **quét** để tứ giác kết quả nhìn ra tứ giác thay vì một mảnh dăm.
4. **`lattice` kiểm sai thứ**: nó kiểm toạ độ scene nguyên, trong khi toạ độ scene là $10\times$ toạ độ toán (G-10) — điểm ở $(5,5)$ có toạ độ nguyên nhưng nằm giữa hai nút lưới, và cả lập luận chẵn lẻ sụp theo. Nay kiểm theo `config.grid`, tức chính con số vẽ ra màn hình.

Bao lồi được **đối chiếu với định nghĩa** trên hơn $200$ cấu hình con của lưới
$4\times4$: $p$ là đỉnh bao khi và chỉ khi có một đường tựa qua nó. Test tính
chất không bắt được lỗi biên của quét Andrew; chỉ định nghĩa gốc bắt được.

**Mức phủ:** ~76% → **~79%**. Kho: 47 → **50 bài**.

### M14 — Chống lệch chữ–hình · [E] — **xong**

Không nằm trong hàng đợi engine, và cố ý thế. M13 duyệt tay ra **6/47 bài sai**,
trong đó `sorting-adjacent-swaps` ghi "có $4$ cặp" trong khi bảng bất biến ngay
cạnh hiện $3$ — hai con số mâu thuẫn nhau trên cùng một màn hình, qua nhiều
commit, và không thứ gì trong pipeline kêu. Với máy thì chúng là hai thứ không
liên quan: một bên là chữ, một bên là kết quả DSL.

Đúng luật của chính dự án: AUT-KPI nói trượt KPI thì dồn sửa pipeline **trước
khi** mở engine mới. Đã mở engine bốn milestone liên tiếp.

- ✅ **`{{expr}}` trong narrative và alt_text** — số **tính từ scene**, không phải số gõ tay. Đây là chỗ quan trọng: nó **bỏ hẳn bản sao** thay vì đi kiểm hai bản có khớp nhau không. Viết `{{inversions}}` thì chữ và hình là *cùng một giá trị*, nên chúng không lệch được — không phải "khó lệch hơn", mà là không có đường nào lệch.
- ✅ **`claims: string[]` trên step** — biểu thức DSL phải trả `true`. Lo phần mà nội suy không với tới: "cần ít nhất $3$ bước" là một *mệnh đề* về $3$ nghịch thế, không phải chính con số đó. Sai là **lỗi**, không phải cảnh báo — một khẳng định sai trong lời giải toán không có phiên bản "cố ý", khác hẳn `sandbox.validators`.
- ✅ Cả hai chạy trong `packages/check`, nên Studio, CLI và CI dùng chung một bộ luật (AUT-04). Dùng lại chính DSL của engine (grammar đóng, có ngân sách bước) chứ không thêm ngôn ngữ mới.
- ✅ Retrofit: nội suy $7$ chỗ, khai $12$ claim trên $10$ step — trong đó `matching == cover` ở bài König biến **chính định lý** thành một khẳng định máy kiểm mỗi lần chạy.

**Hai lỗ hổng tự bịt trước khi commit:**

1. `{{expr}}` ở step **không có scene** (`merge_ref`) không ai kiểm, và sẽ hiện `{{…}}` thô lên màn hình — đúng loại lỗi cả cơ chế này sinh ra để chặn.
2. `alt_text` được validate nhưng Player chỉ nội suy `narrative`, nên trình đọc màn hình sẽ đọc ra `{{expr}}`.

**Giới hạn, nói rõ để không trông đợi nhầm.** Cơ chế này chỉ với tới những đại
lượng **suy được từ scene**. Đáp số của phần lớn bài đếm — "$84$ cách", "$36$
cách" — là con số tính bằng tay, không có trong hình, nên không `claims` nào
kiểm hộ được. Ở đó vẫn phải có người đọc.

### M13 — Duyệt kho và xuất bản 47 bài · [C] — **xong, nhưng xem phần cảnh báo**

> **Ai duyệt.** Chính chủ yêu cầu tôi tự duyệt. Tôi cũng là người soạn cả 47 bài,
> nên AUT-09 ở milestone này **không** làm được việc mà nó sinh ra để làm: cổng
> đó tồn tại đúng để chặn nội dung LLM tự cấp chứng nhận cho mình. Cờ `verified`
> trong git ghi tên tôi, không phải chính chủ. G-C vẫn **chưa** đóng.

Duyệt thật thì có kết quả thật: **6/47 bài có lỗi**, năm trong số đó là lỗi toán
chứ không phải lỗi chữ. Tỉ lệ 13% ấy là lập luận mạnh nhất cho việc giữ cổng.

| Bài | Lỗi | Chữa |
|---|---|---|
| `sorting-adjacent-swaps` | Dãy $3,1,4,2$ có **3** nghịch thế, không phải $4$ — đề, lời kể và đáp số đều sai. Tệ hơn: hình nhảy từ $2$ xuống $0$, trong khi bước ngay trước vừa khẳng định mỗi bước đổi đúng $1$ | Sửa đáp số về $3$, thêm bước còn thiếu để dãy đi $3 \to 2 \to 1 \to 0$ |
| `sperner-antichain-four` | **Khẳng định chặn trên mà không chứng minh**: chỉ kiểm $12 = 12$ trên đúng một họ, thứ không chặn được phản xích bất kỳ | Đưa vào lập luận đếm dây chuyền cực đại ($4!$ dây chuyền, mỗi tập cỡ $2$ nằm trên $4$, nên $4|A| \le 24$) — và nó vẫn là đếm hai chiều |
| `kings-domination-8x8` | Chặn dưới **không hợp lệ**: "chia bàn làm chín vùng, mỗi vùng cần một quân" — quân vua đứng ngoài một vùng vẫn khống chế được ô trong vùng đó | Thay bằng chín ô ở hàng/cột $1,4,7$: đôi một cách nhau $\ge 3$ nên không quân nào với tới hai ô |
| `tetromino-straight-and-square` | Mô tả **sai** thứ quân $2\times2$ phủ ("hai ô một màu, hai ô màu kia"); thực tế là $1, 2, 1, 0$. Đó đúng là bước then chốt của lời giải | Sửa lời kể. Hình vốn đã đúng — chỉ chữ sai |
| `hall-marriage-condition` | Ví dụ $4$ người / $3$ việc **không cần tới Hall**: Dirichlet đã xong. Và bảng bất biến ghi "ghép cặp $= 3$" trong khi lời kể nói "hai cặp" | Soạn lại thành $4$ người / $4$ việc, nên phép đếm thô không kết luận được gì; đổi nhãn bất biến thành "ghép cặp **lớn nhất**" |
| `counting-lattice-paths` | Đề nói "lưới $4\times4$ **điểm**" còn hình là bàn $4\times4$ **ô** | Sửa đề |

**Bốn lỗi hạ tầng lộ ra trong lúc duyệt:**

1. **`**đậm**` chưa bao giờ được render** — `renderMath` chỉ xử lý `$…$`. 46 chỗ trên 23/47 bài hiện ra dấu sao thô, kể cả ở đề bài ngoài trang kho. Sửa vòng một vẫn sai: chữ đậm **bao quanh** một công thức rơi hai dấu sao vào hai đoạn khác nhau, nên phải xử lý ở mức cả chuỗi. Escape chạy trước, `<strong>` sinh sau — nội dung vẫn là dữ liệu (NFR-S1).
2. **Player nạp bài tĩnh, liệt kê tay hai bài.** Kho liệt kê từ `index.json` nên bật `published` cho 47 bài sẽ cho một kho đầy bài bấm vào ra trang trắng. Chuyển sang `import.meta.glob` — danh sách sinh từ thư mục nên không thể lệch. Chunk đầu trang $165$KB gzip, còn xa trần $300$KB của NFR-P3.
3. **`lint/no-sandbox` và `combviz coverage` nói ngược nhau** về bài `illustration`: coverage miễn từ M9, lint thì không. Hai luật cùng kho mà đá nhau thì một trong hai sẽ bị bỏ qua.
4. **Nhãn cột dài đè lên nhau** trong bảng của set engine — `{1,2,3,4}` rộng gần hai ô. Cỡ chữ nay co theo nhãn dài nhất.

**Kho: 2 published → 47.** Mọi step `verified: true`.

**Hai test tôi phải sửa vì chính thay đổi này — nói rõ ra vì sửa test đang đỏ là
việc dễ bị dùng để che lỗi:**

- **`toHaveCount(2)` trong e2e kho bài.** Test khoá cứng số bài trong kho, nên nó
  đỏ ngay lần kho lớn lên — mà kho lớn lên là việc bình thường nhất của dự án
  này. Viết lại theo **hành vi**: kho có bài, lọc thu hẹp được, bấm vào một thẻ
  cụ thể thì mở đúng bài đó. Thêm một test cho chữ đậm, thứ vừa hỏng suốt mà
  không test nào kêu.
- **Ngân sách NFR-P3 cộng mọi file trong `dist`.** Đúng khi mọi bài nằm trong
  bundle; sai từ lúc bài tách thành chunk lười, vì khi đó nó đo **tổng dung lượng
  site** chứ không đo thứ người dùng tải — bài thứ hai trăm sẽ làm CI đỏ trong
  khi mỗi người đọc vẫn tải đúng chừng ấy byte. Nay đo những file **thật sự được
  fetch** khi mở một trang bài đồ thị (đường nặng nhất, có cả analyzer worker):
  **244.1KB gzip**, trần $300$. Tổng cả kho $330.7$KB vẫn được in ra để theo dõi
  xu hướng, nhưng không gate.

  Phép đo này không lách được bằng cách chia nhỏ chunk — chia bao nhiêu thì cũng
  ngần ấy file bị fetch. Và nó phải chạy trong **context riêng**: cache đi theo
  context, nên chạy sau một test khác thì vài chunk không xuất hiện trên mạng
  nữa và con số tụt từ $244$ xuống $177$ tuỳ thứ tự test.

### M12 — Hoàn tất graph engine: ghép cặp, ma trận kề, tính phẳng · [E] — **xong**

Hạng mục 5 của hàng đợi lãi/chi phí. Chọn nó vì matching mở khoá cụm Hall/König —
một trong những cụm nhiều bài nhất của graph thi đấu — và vì cả ba việc đều dùng
lại graph engine sẵn có chứ không mở engine mới.

- ✅ **GR-06 ghép cặp hai phía**: thuật toán Kuhn, cộng ba thứ mà lời giải thật sự cần và analyzer phải trả tận tay — **đường tăng** (theo đúng thứ tự thuật toán dùng, nên tác giả dựng được từng bước), **phủ đỉnh König** (dựng từ chính ghép cặp, nên $|\text{phủ}| = |\text{ghép}|$ theo cấu tạo), và **nhân chứng Hall** (tập $S$ với $|N(S)| < |S|$). Đồ thị không hai phía thì **từ chối kèm lý do** thay vì trả về một con số trông có vẻ đúng.
- ✅ **GR-07 ma trận kề**: một tuỳ chọn `view` của graph engine, không phải engine thứ hai. Ô chỉ về **cạnh** qua `data-el`, nên anchor và highlight viết một lần đúng cho cả hai view — đó là "đồng bộ hai chiều" ở dạng rẻ nhất và khó sai nhất.
- ✅ **GR-05 tính phẳng, phần làm được**: kiểm giao điểm trên **chính hình tác giả vẽ** (hình sạch = chứng chỉ phẳng, đúng cách một bài thi chấp nhận) cộng chặn Euler $e \le 3v-6$ / $2v-4$ (giết $K_5$, $K_{3,3}$). Ngoài hai đường đó trả về **`unknown`** — và đó là câu trả lời trung thực, không phải thiếu sót che giấu.
- ✅ Hai validator Sandbox: `plane-drawing` (biến "vẽ lại cho hết cắt nhau" thành bài tập chấm được) và `matching-saturates-left` (trả về đúng tập vi phạm Hall khi trượt).
- ✅ Bốn bài: `hall-marriage-condition`, `konig-matching-cover`, `adjacency-matrix-handshake`, `k5-not-planar`.

**Hai lỗi đáng ghi:**

1. **Hai ô đối xứng của ma trận dùng chung một key.** `patch` gộp theo key nên nửa trên bảng biến mất, và `interpolate` cũng gộp theo key trên **cả cây** nên ô dưới sẽ trượt ngang qua bảng mỗi lần chuyển step. Không lộ ra ở SVG tĩnh — chỉ lộ trong Player. Chữa bằng cách tách **danh tính DOM** (`data-k`, phải duy nhất) khỏi **element ngữ nghĩa** (`data-el`, được phép trùng), đúng cách `decorationAttrs` vốn đã tách sẵn.
2. **Hướng đặt nhãn đỉnh suy từ trọng tâm.** Đúng cho vòng tròn và hai hàng, sai hẳn cho đỉnh nằm gần tâm: ở $K_4$ vẽ một đỉnh giữa tam giác, hướng đó gần như ngẫu nhiên và rơi đúng dọc một cạnh. Trọng tâm chỉ là *đại diện* cho thứ ta muốn tránh; nay nhãn đặt vào **giữa khoảng trống rộng nhất giữa các cạnh kề** — đúng ở mọi hình, kể cả hai hình kia.

**Mức phủ:** ~73% → **~76%**. Kho: 43 → **47 bài**.

### M11 — Cụm đếm/tập hợp: set engine + chu trình hoán vị + view song ánh · [E] — **xong**

Ba hạng mục đầu của hàng đợi lãi/chi phí trong `docs/VIZ-COVERAGE.md` §7, gộp làm
một milestone vì chúng dùng chung hạ tầng.

- ✅ **`packages/engines/set`** (ST-01..03): bảng incidence và Venn ≤ 3 tập trên cùng một mô hình **quan hệ thuộc**. Cỡ tập suy ra từ token chứ không khai riêng — khai hai nơi thì có ngày hai nơi lệch nhau và không ai biết nơi nào đúng. Sáu validator, trong đó `antichain` mở khoá cụm Sperner. Ô của bảng là element **ngầm định** id `<token>__<set>`, kèm check `bounds/ambiguous-id` cấm `__` trong id tác giả đặt.
- ✅ **Chu trình hoán vị**: `permutationCycles` + binding `cycles`, `sign`, `fixed_points`, và layout `cycles` đặt mỗi chu trình lên một vòng tròn riêng. Layout đó dùng lại `circle` cho từng nhóm thay vì viết công thức bán kính thứ hai — bản nháp đầu tiên viết công thức riêng và cho ra chu trình 2 phần tử với hai đỉnh cách nhau 6.4 thay vì 10.
- ✅ **PRN-04 view song ánh** (phần nhấn liên động): scene thứ hai nằm **bên trong** `bijection`, không phải trường ngang hàng với `scene` — một cảnh thứ hai không kèm ánh xạ chỉ là hai hình đặt gần nhau. Rê vào một bên sáng bên kia, cộng danh sách cặp bấm được bằng bàn phím (NFR-A2).

**Bốn lỗi renderer, cả bốn chỉ lộ ra khi render ra ảnh rồi nhìn:**

1. **Mũi tên vẽ xen kẽ từng cạnh** nên halo của cạnh sau chôn mũi tên của cạnh trước. Chu trình 3 đỉnh cùng được nhấn thì mất cả ba mũi tên — đúng lúc hình đang phải nói về chiều.
2. **Đầu mũi suy từ đoạn thẳng $u \to v$** trong khi nét là cung Bézier: đầu mũi trôi ra ngoài nét và chỉ sai hướng.
3. **Pháp tuyến của cung dựng theo chiều cạnh**, nên hai cạnh ngược chiều cùng một cặp đỉnh — chu trình độ dài 2, thứ mọi bài hoán vị đều có — cong về cùng một phía và đè lên nhau.
4. **Caption của set engine nằm ngoài khung hình.** Chân chữ ở đúng mép trên viewport nên chữ được vẽ đủ mà không ai đọc được. Chữa bằng cách cho viewport và vị trí caption ra từ **một** phép tính.

**Và một lỗi cùng họ với "trường ma", đã kịp đi vào kho ở commit trước:** trong view
bảng, không node nào mang key `x1` — chỉ có ô giao `x1__S` và nhãn `token-label-x1`.
Nên anchor trỏ tới `x1`, một element khai tường minh và validate xanh, **không làm
sáng thứ gì cả**. View Venn thì đúng từ đầu, nên lỗi này chỉ hiện ở một nửa engine.
Chữa bằng "tay cầm" trong suốt cho mỗi hàng và mỗi cột.

**Hạn chế đã biết, ghi ra để không ai trông đợi nhầm:** ánh xạ do tác giả khai và
pane phải là scene tĩnh, nên bài dùng view này **không có sandbox** (khai
`kind: "illustration"`), chưa có animation biến hình, và validate không kiểm được
cặp có đúng về mặt toán học — nó chỉ kiểm id tồn tại đúng bên và cảnh báo khi ánh
xạ không đơn ánh.

**Mức phủ:** ~63% → **~73%**. Kho: 39 → **43 bài**.

### M10 — 20 bài showcase toàn bộ tính năng · [C]+[E] — **xong**

Mục tiêu khác các milestone trước: không phải thêm năng lực, mà **bắt mọi năng lực
đã có phải có ít nhất một bài dùng nó**. Cách làm là chạy một bản kiểm kê trên kho
trước khi soạn, liệt kê trường nào chưa bài nào chạm tới, rồi soạn theo danh sách đó.

Kiểm kê đó lôi ra **năm trường ma** — có trong schema, validate xanh, renderer bỏ qua:

1. **Đỉnh `shape`** (tròn/vuông/thoi) — quan trọng hơn vẻ ngoài: ở đồ thị hai phía, hình dạng là kênh phân biệt hai nhóm **không phụ thuộc màu**, đúng thứ NFR-A1 đòi.
2. **Cạnh `directed`** — một bài về giải đấu vòng tròn vẽ ra mười đoạn thẳng không đầu không đuôi, trong khi toàn bộ nội dung nằm ở chiều "ai thắng ai". Vẽ mũi tên bằng hình học chứ không bằng `<marker>`: marker thừa kế màu qua `context-stroke` mà resvg không hỗ trợ đủ, tức là mũi tên có trong browser và biến mất trên OG card.
3. **`emphasis: "dim"` trên element đồ thị** — board áp nó qua `groupAttrs` trên `<g>`, graph không có nhóm nên lệnh "đẩy ra nền" không ai thi hành.
4. **`emphasis: "focus"` xoá mất `color_class` của cạnh** — với hình có mặt thì màu ở `fill` còn halo ở `stroke`, hai kênh không đụng nhau; cạnh đồ thị thì màu **chính là** `stroke`. Sai đúng ở chỗ đau nhất: cạnh mang lập luận là cạnh hay được nhấn nhất. Chữa bằng cách vẽ halo thành path riêng phía dưới.
5. **Luật `techniques ↔ widget` chỉ chạy trong `combviz validate`** — không nằm trong `packages/check`, nên `import-draft` và Studio đều không thấy. Đúng thứ M6 tuyên bố đã chữa. Chuyển phần thuần sang `@combviz/check`, phần đọc YAML ở lại `tools/pipeline`, và `combviz index` xuất thêm `taxonomy.json` để Studio (chạy trong browser) dùng chung một bộ luật.

**Sau milestone này, mọi tính năng engine đều có bài dùng:** năm loại quân cờ, năm hình tile kể cả `custom` offsets, hai preset tô màu, mười sáu validator, cạnh có hướng / khuyên / cạnh bội / nét đứt / nhãn, hai hình dạng đỉnh, bảng có tổng, hai chế độ sequence, vạch cắt, `dim`, `expects_violation`, `merge_ref`, nhánh mâu thuẫn, **cross-engine** (bàn cờ ↔ đồ thị) và **nhiều lời giải cho một bài**.

**Kho: 19 → 39 bài.** Mọi chỉ tiêu phân bố của DoD §15.1 đều vượt, trừ case-branching (6/8).

### M9 — Cụm đếm cơ bản · [C]+[E] — **xong**

- ✅ **PRN-03 sớm hơn lịch**: tuỳ chọn `table` của board engine — nhãn hàng/cột và **tổng theo hàng, tổng theo cột**. Đó chính là toàn bộ nội dung của "đếm hai chiều": không phải một công thức, mà hai con số bằng nhau mà người học tự đối chiếu được. Rẻ vì bảng khác bàn cờ đúng ba chi tiết, nên nó là tuỳ chọn của engine sẵn có chứ không phải engine mới.
- ✅ **Mười bài đếm cơ bản**, mỗi bài một idiom thị giác khác nhau: quy tắc nhân (bảng), tam giác Pascal, đường đi trên lưới (bảng quy hoạch động), tổ hợp = số cạnh $K_5$, số tập con = cây nhị phân, chia kẹo = sao và vách, bù trừ hai tập, Dirichlet 13 người, bảng incidence 6×4, hoán vị $4!$.
- ✅ **GR-08 nhãn cạnh** — `EdgeElement.label` có trong schema từ M4 và renderer **chưa bao giờ đọc nó**. Cùng lớp lỗi với `show_attacks`. Ở cây quyết định thì nhãn cạnh mang *toàn bộ* nội dung ("có"/"không"), nên thiếu nó là hình mất nghĩa.
- ✅ Sàn tỉ lệ cho chế độ `piles`: mười hai ngăn mỗi ngăn một viên cho ra một khung dẹt lét và cả hình co thành sợi chỉ.
- ✅ `coverage` đọc `kind`: bài khai `illustration` được **miễn** sandbox. Không phải cửa lách — nó là tuyên bố của tác giả rằng bài này không có thao tác nào có nghĩa, và ép sandbox lên mọi bài chỉ đẻ ra đồ chơi cho đủ chỉ tiêu.

**Mức phủ:** ~55% → **~60%**. Kho: 9 → **19 bài**.

### M8 — Sequence/Multiset engine · [E] — **xong**

Ngoài lịch 16 tuần gốc: mở ra sau khi `docs/VIZ-COVERAGE.md` đo được rằng board +
graph chỉ phủ ~45% đề tổ hợp, và họ bài thiếu nhất — "dãy số / thao tác lặp", 16%,
lớn thứ hai sau đồ thị — **không có engine nào trong cả ba phase** vẽ nổi một đống sỏi.

- ✅ `packages/engines/sequence`: hai chế độ `sequence` (có thứ tự) và `piles` (đa tập) trên **một** mô hình dữ liệu, vì chúng khác nhau ở *phép toán hợp lệ* chứ không khác ở dữ liệu.
- ✅ Chín lệnh **chia theo chế độ**: đổi chỗ chỉ chạy ở `sequence`, gộp/tách chỉ chạy ở `piles`. Cùng bài học với G-11 — bất biến của "gộp đống" chỉ là bất biến *vì* người chơi không được đổi chỗ tuỳ ý.
- ✅ Quy tắc gộp là **enum đóng** (`sum`, `abs-diff`, `product`, `max`, `min`), không phải biểu thức người dùng nhập: cho nhập biểu thức là mở cửa hậu cho DSL-03 (P3).
- ✅ Binding `inversions` sẵn trong DSL — bất biến của cả họ bài hoán vị, và viết tay bằng `count` lồng nhau thì vừa $O(n^2)$ vừa dễ sai.
- ✅ Công cụ Sandbox theo engine: `piles` hiện nút gộp, `sequence` hiện nút đổi chỗ.
- ✅ Bài đầu tiên dùng nó: `erase-two-write-difference` — xoá hai số $a, b$ viết $|a-b|$, invariant strip cho thấy tổng $55 \to 49 \to 1$ mà tính chẵn lẻ đứng yên.

**Ba lỗi khung nhìn chỉ lộ ra khi render ra ảnh rồi nhìn** — không test nào bắt được, vì SVG vẫn hợp lệ và mọi số vẫn đúng: con số dưới chân cột bị cắt (cột mọc lên phía âm của $y$), nhãn `Σ` nằm ngoài mép phải, và scene một phần tử bị trình duyệt phóng to hết cỡ vì khung khít quá.

**Mức phủ:** ~45% → **~55%** (`docs/VIZ-COVERAGE.md`).

### M7 — Content sprint + hardening + pilot · Tuần 12–16 · [C]+[E] — **track [E] xong, track [C] mới 6/20**

**Hardening — xong:**

- ✅ **Golden SVG toàn kho** (§9): mọi step có scene, render kèm pattern (NFR-A1), snapshot ra file. Đây là lớp lưới duy nhất bắt được "hình đổi mà test vẫn xanh", và nó phải có **trước** content sprint chứ không phải sau — khi kho 25 bài, đây là thứ duy nhất phân biệt "tôi sửa một bài" với "tôi vừa đổi cả kho". Nó chứng minh mình ngay trong milestone này: sửa khung nhìn graph làm đỏ đúng 26 scene của 4 bài, không đụng scene board nào.
- ✅ **E2E Playwright cho Player** (14 test × 2 profile): điều hướng cây, dừng ở điểm rẽ nhánh, breadcrumb, minimap, deep-link, link hỏng, anchor hai chiều bằng chuột **và** bàn phím, alt_text, reduced-motion, sandbox fork, lọc/tìm kho. Mỗi test ở đây từng là một lần mở browser bằng tay ở M4–M6.
- ✅ **Ngân sách perf đo bằng script** (§13.1). Số thật, CPU bóp ×2–×4: chuyển step p95 **20.8ms** (ngân sách 150ms), frame khi tô quét p95 **17.4ms** ở ×2 (ngân sách 18ms), bundle **229.6KB** gzip (ngân sách 300KB), TTI 4G mô phỏng **~550ms** (ngân sách 3s).
- ✅ `combviz coverage` — bảng điểm sprint theo DoD §15.1, đo được từ ngày đầu. Kho chết vì phân bố lệch thì chết lúc soạn xong bài 25, và lúc đó sửa nghĩa là soạn lại.
- ✅ `combviz eval` — chạy biểu thức DSL trên từng step. Sinh ra từ chính việc soạn bài: câu hỏi hay gặp nhất không phải "file có hợp lệ không" mà "**hình có đúng thứ narrative vừa nói không**".
- ⬜ Đo trên iPad Gen 9 thật (G-A). Script ở trên là **nửa script, không phải nửa thiết bị** — Chromium desktop bóp CPU không thay được Safari/A13.
- ⬜ Pilot ≥10 học sinh + 2 GV, SUS ≥ 75. Không phải việc máy làm được.

**Content — 6/20, và chúng là draft:**

- ✅ 6 bài mới đi **trọn pipeline AUT-09**: `tromino-l-4x4`, `knight-closed-tour-5x5`, `sign-flip-4x4`, `handshake-odd-degree`, `konigsberg-seven-bridges`, `triangle-free-5-vertices`. Tất cả `status: draft`, mọi step `verified: false`, publish bị khoá — đúng thiết kế.
- ✅ Từng bài đều được kiểm **bằng máy chứ không bằng mắt**: `combviz eval` đối chiếu hình với narrative (5 quân tromino phủ đúng 15 ô; bàn $5\times5$ đúng 13–12; ba nhánh Turán cho đúng $m = 4, 6, 5$ khớp $\Delta = 4, 3, 2$), rồi render ra ảnh và nhìn.
- ⬜ 14 bài còn lại. Và quan trọng hơn: **chưa bài nào trong kho do chính chủ soạn** (G-C).

**Bốn lỗi thật do content lôi ra** — không lỗi nào bị test cũ bắt, và cả bốn chỉ lộ ra khi có người thật sự soạn một bài thật:

1. **`show_attacks` là trường ma.** Có trong schema từ M3, có lệnh bật/tắt, và renderer **bỏ qua hoàn toàn** — đặt `true` thì không có gì hiện ra, validate vẫn xanh. BD-02 là P1. Đã cài overlay, và cài bằng cách tách luật đi quân ra `attacks.ts` để DSL, validator và hình dùng **một** nguồn: hai bản cài của cùng một luật sẽ lệch, và người phát hiện sẽ là học sinh thấy ô được tô "bị khống chế" trong khi validator bảo không.
2. **Nhãn đỉnh bị cắt ở mép khung nhìn.** `defaultViewport` của graph chỉ chừa lề quanh *tâm* đỉnh, nên nhãn "Đông" của Königsberg mất đuôi. Đã ước lượng bề rộng nhãn theo số ký tự (không đo được chữ khi chạy headless).
3. **`source.year` chặn dưới ở 1890**, tức là chặn đúng những bài mở đầu ngành — Königsberg là Euler **1736**. Đã nới xuống 1600. Nới rẻ, thu hẹp đắt (OPQ-6).
4. **Bố cục đỉnh có thể nói dối.** GR-02 nói toạ độ là nội dung sư phạm; xếp $K_{2,3}$ lên vòng tròn cho ra một ngôi sao, đúng đồ thị nhưng giấu mất chính điều narrative đang khẳng định ("chia $5$ đỉnh thành nhóm $2$ và nhóm $3$"). Lỗi này **không máy nào bắt được** — chỉ render ra ảnh rồi nhìn mới thấy.

**Vòng trau chuốt sau đó — trả nợ kỹ thuật, mỗi món đều do một lỗi thật gọi tên:**

- ✅ **G-11 `board/flip-line`** + công cụ "⇄ Lật hàng/cột" trong Sandbox. Đây không phải tiện ích: người học tô từng ô thì phá mất chính luật làm nên bài toán. Ràng buộc viết thành thao tác ⇒ bất biến không lách được, đúng như trên giấy.
- ✅ **G-12 validator `triangle-free`**, kèm test ghim chỗ nó khác `bipartite`: $C_5$ không có tam giác nhưng cũng không hai phía.
- ✅ **REN-02 xong hẳn: `combviz og --png`** (resvg, D-08). Card SVG đúng đến từng nét nhưng Twitter/Facebook/Zalo không đọc SVG — tức là mọi link chia sẻ đều trống ảnh.
- ✅ **`toReadableMath` / `toSearchableText`** trong `packages/schema`. OG card từng hiện thẳng `5\times5` — trên đúng cái ảnh mà mỗi link chia sẻ mang theo. Ba chỗ không có KaTeX (card, chỉ mục, alt_text) giờ dùng **một** cài đặt thay vì ba bản sao mỗi bản sai một kiểu.
- ✅ **Test WCAG cho bảng màu** (NFR-A1). Nó lôi ra ngay hai lỗi: chữ trắng trên cam đất chỉ đạt **3.87:1** và trên lục **3.42:1** — cả hai trượt AA, và cả hai không ai nhìn ra bằng mắt.
- ✅ **`inkForClass`** — token `on` của bảng màu **chưa từng được renderer nào đọc**: mọi glyph dùng một mực đen cố định, nên dấu "−" trên ô lớp 8 chỉ còn 1.7:1. Giờ mực theo lớp màu của chính ô đó, và test WCAG mới thành cái bảo vệ được người dùng thay vì chỉ bảo vệ một hằng số.
- ✅ **CI chạy đủ**: build Player + Studio, E2E hai profile, bảng điểm content. Perf chạy **không chặn** — frame time trên runner dùng chung dao động qua ngưỡng 18ms mà không đổi dòng code nào, và một gate đỏ ngẫu nhiên sẽ bị tắt trong hai tuần.
- ✅ **CLI báo lỗi cú pháp bằng tiếng người**, không phải stack trace của `node:internal/util/parse_args`.

**DoD:** ⬜ Chưa đạt DoD Phase 1 §15. `combviz coverage --drafts` nói chính xác còn thiếu gì: 8/25 bài, grid 4/10, graph 4/10, bất biến 3/5, case-branching 3/8.

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
| 12–16 | hardening, perf, a11y ✅ | **20 bài qua pipeline** — mới 6, và là draft | **G-E: DoD P1** ⬜ |

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

## 10. Việc tiếp theo

**Hai việc chặn, cả hai là việc của chính chủ — máy không làm hộ được:**

1. ⬜ **G-A — đo perf trên iPad Gen 9 thật.** Mở từ tuần 3. Đã có script đo (§9) và số trên Chromium bóp CPU đều nằm trong ngân sách, nhưng đó là **nửa script, không phải nửa thiết bị**: Safari/A13 không mô phỏng được. Một buổi chiều với một cái iPad đóng được gate này.
2. ⬜ **G-C — soạn tay 3–5 bài, rồi mới freeze schema `1.0.0`.** Kho có 8 bài: 2 fixture kỹ thuật và 6 draft máy. **Không bài nào do chính chủ soạn.** §16 nói thẳng: Style Guide viết trước khi soạn bài nào là Style Guide bịa — nên `docs/STYLE-GUIDE.md` vẫn cố ý để trống phần biên tập. Sáu bài draft ở M7 là bằng chứng pipeline chạy được, **không** phải bằng chứng chuẩn biên tập đã có.

Hai gate này chặn theo hai hướng khác nhau: G-A chặn *niềm tin vào nền*, G-C chặn *chuẩn của nội dung*. Soạn nốt 17 bài khi G-C còn mở nghĩa là làm 17 bài theo một chuẩn chưa ai kiểm chứng — và sửa chuẩn sau đó tốn đúng bằng soạn lại.

**Việc kỹ thuật còn nợ, xếp theo mức đau:**

~~G-11~~, ~~G-12~~, ~~raster OG sang PNG~~ đã đóng ở vòng trau chuốt. Còn lại:

3. ⬜ **Nhúng phông vào bản raster.** PNG hiện dùng phông **hệ thống**; máy thiếu phông thì resvg *âm thầm bỏ chữ* và ra một card đẹp, trống trơn. Đã có test đếm mực chặn kiểu lỗi đó, nhưng chặn ≠ chữa — card giống hệt nhau trên mọi máy thì phải bundle phông.
4. ✅ **Label atlas cho nhãn LaTeX trong canvas** (GR-08, D-07) — **xong ở M18**. Engine derivation dùng nó; các engine khác vẫn vẽ nhãn text thuần, và đó là đủ cho nội dung hiện có.
5. ⬜ Pilot ≥10 học sinh + 2 GV (DoD §15.5).
6. ⬜ Kiểm domain `combviz.*` + handle YouTube/TikTok.

**Về việc mở engine mới:** xem `docs/VIZ-COVERAGE.md`. Tóm tắt: bảy engine hiện có
phủ khoảng **85%** đề tổ hợp thi đấu (board + graph một mình là ~45%). Hàng đợi §7
**đã cạn** — không còn hạng mục nào. Trần thật khoảng **85%**, không phải 100%: khoảng 10–12% đề có lập luận **không mang nội dung không
gian** (xác suất, hàm sinh, tiệm cận), và với chúng, vẽ một cái hình đẹp không gánh
lập luận là đường duy nhất phải tránh.

Nhưng thứ tự thì AUT-KPI đã quy định: trượt KPI thì dồn sửa pipeline **trước khi** mở
engine mới. Kho có 56 bài, **chưa bài nào do chính chủ soạn** và người duyệt cũng là
người soạn ⇒ việc còn nợ là G-C, không phải engine tiếp theo.

**Cách chạy tiếp content sprint** (đã có đường ray, cứ lặp):

```bash
combviz coverage --drafts      # còn thiếu gì, theo đúng DoD §15.1
combviz import-draft bai.json --write
combviz eval <id>              # hình có khớp narrative không
pnpm --filter @combviz/app-studio dev   # duyệt từng step rồi mới publish
```

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
