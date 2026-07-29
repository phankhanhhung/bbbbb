# CombViz

Nền tảng minh hoạ tương tác lời giải Tổ hợp Olympiad — lời giải trình diễn từng bước
trên canvas tương tác, văn bản ↔ hình liên kết hai chiều, sandbox thử phản ví dụ.

Vận hành theo mô hình **single-author brand engine**: engine là xưởng in riêng của
một tác giả; sản phẩm công chúng là kho bài đã curate. Xem `docs/SRS-v1.0.md`.

**Trạng thái:** Phase 1, M0 xong (nền móng + schema + validate). Xem `docs/PLAN-P1.md`.

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
```

`validate` chạy đúng bộ luật mà Studio và CI dùng (AUT-04): schema → cấu trúc cây →
anchor → bound → taxonomy. `--strict` coi cảnh báo là lỗi.

## Bố cục

```
packages/
  schema/            JSON Schema + kiểm cấu trúc — hợp đồng trung tâm
  theme/             Theme tokens — nguồn brand visual duy nhất (DAT-20)
  engines/board/     Grid/Board engine: schema fragment, bound
  content/           Kho bài JSON + controlled vocabulary
tools/
  pipeline/          CLI: validate, schema (lint/import-draft/og/render sẽ đến ở M6)
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
