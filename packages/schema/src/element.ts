import { Type, type TProperties, type TSchema } from '@sinclair/typebox';
import { EntityId } from './common.js';
import { MAX_COLOR_CLASS } from './bounds.js';

/**
 * Thuộc tính chung của mọi Element, mọi engine (§4.4).
 *
 * DAT-20 — brand-lock: **không có** trường style tự do ở đây và cũng không engine
 * nào được thêm. Element chỉ mang **ngữ nghĩa**; toàn bộ hiển thị suy ra từ
 * theme tokens. Đó là lý do `color_class` là số chứ không phải mã màu.
 */
export const ElementBaseProps = {
  id: EntityId,
  type: Type.String({ minLength: 1 }),
  /** Lớp màu ngữ nghĩa 1..8. Ánh xạ sang màu thật ở packages/theme. */
  color_class: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_COLOR_CLASS })),
  emphasis: Type.Optional(
    Type.Union([Type.Literal('none'), Type.Literal('focus'), Type.Literal('dim')], {
      default: 'none',
    }),
  ),
  /** Thứ tự vẽ. Số lớn vẽ sau (nằm trên). */
  layer: Type.Optional(Type.Integer({ minimum: -8, maximum: 8, default: 0 })),
  /** Người học không kéo được trong Sandbox. */
  locked: Type.Optional(Type.Boolean({ default: false })),
} satisfies TProperties;

/**
 * Dựng schema cho một loại element của engine.
 *
 * Luôn đóng `additionalProperties` — đây là chỗ DAT-20 được enforce bằng máy
 * thay vì bằng kỷ luật cá nhân.
 */
export function defineElement<P extends TProperties>(
  typeLiteral: string,
  props: P,
): TSchema {
  return Type.Object(
    {
      ...ElementBaseProps,
      ...props,
      type: Type.Literal(typeLiteral),
    },
    { additionalProperties: false },
  );
}

/**
 * Tên trường bị cấm ở mọi element, kèm gợi ý thay thế.
 *
 * `additionalProperties: false` đã chặn được, nhưng thông báo mặc định của Ajv
 * ("must NOT have additional properties") không dạy được gì. Bảng này biến lỗi
 * thành câu trả lời.
 */
export const FORBIDDEN_STYLE_KEYS: Readonly<Record<string, string>> = {
  color: 'dùng `color_class` (1..8) — màu thật do theme quyết định (DAT-20)',
  fill: 'dùng `color_class` (1..8) — màu thật do theme quyết định (DAT-20)',
  stroke: 'nét vẽ do theme quyết định; muốn nhấn mạnh thì dùng `emphasis: "focus"`',
  strokeWidth: 'nét vẽ do theme quyết định (DAT-20)',
  stroke_width: 'nét vẽ do theme quyết định (DAT-20)',
  opacity: 'dùng `emphasis: "dim"` thay vì đặt độ mờ tay',
  font: 'phông do theme quyết định (DAT-20)',
  fontSize: 'cỡ chữ do theme quyết định (DAT-20)',
  font_size: 'cỡ chữ do theme quyết định (DAT-20)',
  size: 'kích thước hiển thị do theme và viewport quyết định',
  css: 'file problem là dữ liệu, không phải style (DAT-20, NFR-S1)',
  style: 'file problem là dữ liệu, không phải style (DAT-20, NFR-S1)',
  className: 'file problem là dữ liệu, không phải style (DAT-20, NFR-S1)',
};
