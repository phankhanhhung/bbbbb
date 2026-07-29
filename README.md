# CombViz

Nền tảng minh hoạ tương tác lời giải Tổ hợp Olympiad — lời giải trình diễn từng bước
trên canvas tương tác, văn bản ↔ hình liên kết hai chiều, sandbox thử phản ví dụ.

Vận hành theo mô hình **single-author brand engine**: engine là xưởng in riêng của
một tác giả; sản phẩm công chúng là kho bài đã curate. Xem `docs/SRS-v1.0.md`.

**Trạng thái:** Phase 1, M1 code xong (renderer thuần + Player + render headless), chờ đo perf trên iPad. Xem `docs/PLAN-P1.md`.

## Bắt đầu

```bash
pnpm install
pnpm check          # typecheck + lint + test + validate toàn kho
```

Từng phần:

```bash
pnpm typecheck
pnpm lint           # gồm luật phụ thuộc giữa các package
pnpm test
pnpm validate       # validate toàn kho bài
```

## CLI

```bash
npx tsx tools/pipeline/src/cli.ts validate packages/content [--strict]
npx tsx tools/pipeline/src/cli.ts schema --out schema.json
npx tsx tools/pipeline/src/cli.ts render mutilated-chessboard --step s2 --out s2.svg
```

`validate` chạy đúng bộ luật mà Studio và CI dùng (AUT-04): schema → cấu trúc cây →
anchor → bound → taxonomy. `--strict` coi cảnh báo là lỗi.

`render` chạy trong Node, không cần browser (REN-01), bằng **đúng renderer** mà
Player dùng — không có bản sao nào.

## Player

```bash
pnpm --filter @combviz/app-player dev
```

## Bố cục

```
packages/
  schema/            JSON Schema + kiểm cấu trúc — hợp đồng trung tâm
  theme/             Theme tokens — nguồn brand visual duy nhất (DAT-20)
  render/            Scene → SvgNode[] thuần, diff, interpolate, serialize
  render/src/dom/    Lớp DOM duy nhất: patch + animate (entry point riêng)
  engines/board/     Grid/Board engine: schema fragment, bound, renderer
  content/           Kho bài JSON + controlled vocabulary
apps/
  player/            SPA cho người học (Preact + Vite)
tools/
  pipeline/          CLI: validate, schema, render (lint/import-draft/og ở M6)
docs/
  SRS-v1.0.md        Đặc tả yêu cầu — nguồn của mọi ID requirement
  PLAN-P1.md         Kế hoạch triển khai Phase 1
```

Luật phụ thuộc giữa các package được enforce bằng eslint (`eslint.config.js`) chứ
không bằng quy ước: `render` không biết DOM, `schema` không biết engine nào tồn tại,
LLM chỉ sống trong `tools/pipeline`. Ba ràng buộc đó là kiến trúc của dự án.

## License

- **Code** — MIT, xem `LICENSE`.
- **Nội dung** (bài, lời giải, hình, clip) — CC BY-SA 4.0, xem `packages/content/LICENSE`.
- **Đề bài** trích từ các kỳ thi không thuộc bản quyền của kho; mỗi bài ghi nguồn
  trong trường `source`.
