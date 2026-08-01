import { Type, type Static } from '@sinclair/typebox';

/** Slug ổn định, dùng cho problem id và solution id. */
export const SLUG_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$';

/** Id của Step và Element. Ổn định xuyên các step (DAT-12) và qua các lần save (DAT-03). */
export const ENTITY_ID_PATTERN = '^[A-Za-z][A-Za-z0-9_-]*$';

/** Khoá anchor trong narrative: `[[a3|...]]`. */
export const ANCHOR_KEY_PATTERN = '^[a-z][a-z0-9_]*$';

export const SEMVER_PATTERN = '^\\d+\\.\\d+\\.\\d+$';

/**
 * Nội dung đa ngôn ngữ per-field (NFR-I1). `vi` bắt buộc ở P1 (OPQ-5);
 * `en` để sẵn cho đường ra quốc tế mà không phải nâng major schema.
 */
export const LangString = Type.Object(
  {
    vi: Type.String({ minLength: 1 }),
    en: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type LangString = Static<typeof LangString>;

/**
 * **Mọi** bản ngôn ngữ có mặt, kèm tên trường để lỗi chỉ đúng chỗ.
 *
 * Có vì mọi lớp kiểm markup trong kho đều viết `narrative.vi` — mười sáu chỗ, đếm
 * bằng máy — nên một bản dịch `en` mang `[[khoá-không-tồn-tại]]` hay `{{biểu-thức-
 * hỏng}}` đi thẳng ra màn hình của người đọc tiếng Anh mà không lớp nào kêu.
 *
 * Kho hôm nay có **0** bản dịch, và đó chính là lý do bịt lỗ bây giờ: không có
 * nội dung nào phải sửa, nên cái giá đúng bằng không. Đợi tới lúc có bản dịch thì
 * lớp kiểm sẽ đỏ hàng loạt ngay ở commit đầu tiên của người dịch — và người ta sẽ
 * tắt nó đi thay vì sửa.
 */
export function langValues(
  value: LangString | undefined,
): readonly (readonly [lang: 'vi' | 'en', text: string])[] {
  if (!value) return [];
  const out: (readonly ['vi' | 'en', string])[] = [['vi', value.vi]];
  if (value.en !== undefined) out.push(['en', value.en]);
  return out;
}

export const Slug = Type.String({ pattern: SLUG_PATTERN });
export const EntityId = Type.String({ pattern: ENTITY_ID_PATTERN });

/** Toạ độ trong hệ của scene, không phải pixel màn hình. */
export const Point = Type.Object(
  {
    x: Type.Number(),
    y: Type.Number(),
  },
  { additionalProperties: false },
);
export type Point = Static<typeof Point>;
