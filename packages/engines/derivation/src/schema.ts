import { Type, type Static } from '@sinclair/typebox';
import { defineElement, EntityId } from '@combviz/schema';

/**
 * Bound của Derivation engine (NFR-P4).
 *
 * `maxTexLength` không phải để tiết kiệm bộ nhớ mà để giữ **hạng tử là hạng tử**.
 * Một chuỗi LaTeX dài 300 ký tự nghĩa là tác giả đang nhét cả dòng vào một
 * element — và thế thì mất sạch thứ engine này sinh ra để có: từng hạng tử một
 * danh tính riêng, neo được, tô được, theo dõi được qua các bước.
 */
export const DERIVATION_LIMITS = {
  maxRows: 10,
  maxTerms: 60,
  maxTexLength: 120,
} as const;

export const DerivationConfig = Type.Object(
  {
    /**
     * `relation`: mọi dòng gióng theo **dấu quan hệ đầu tiên** của nó.
     *
     * Đây là cách sách toán xếp một chuỗi biến đổi, và nó không phải chuyện thẩm
     * mỹ: khi các dấu $=$ thẳng cột, mắt đọc *theo cột* để thấy vế nào đứng yên
     * và vế nào đang đổi. Gióng trái thì thông tin ấy mất.
     */
    align: Type.Optional(
      Type.Union([Type.Literal('relation'), Type.Literal('left')], { default: 'relation' }),
    ),
    caption: Type.Optional(Type.String({ maxLength: 48 })),
  },
  { additionalProperties: false },
);
export type DerivationConfig = Static<typeof DerivationConfig>;

/** Một dòng của chuỗi biến đổi. Thứ tự dòng là thứ tự trong `elements[]`. */
export const RowElement = defineElement('row', {
  /** Ghi chú ngắn bên phải dòng ("theo giả thiết", "đổi chỉ số"). */
  note: Type.Optional(Type.String({ maxLength: 32 })),
});

/**
 * Một hạng tử — **đơn vị mang danh tính** của cả engine này.
 *
 * `id` sống xuyên các step, và đó là toàn bộ ý tưởng: cùng một $\binom{n}{k}$
 * giữ nguyên id khi nó chuyển từ vế trái sang vế phải, nên diff của DAT-11/12
 * cho ra một **chuyển động** thay vì "xoá một cái, thêm một cái". Phép biến đổi
 * đại số trở thành thứ nhìn thấy được, chứ không phải thứ phải tin.
 */
export const TermElement = defineElement('term', {
  row: EntityId,
  /** LaTeX của riêng hạng tử này. Phải có trong label atlas (D-07). */
  tex: Type.String({ minLength: 1, maxLength: DERIVATION_LIMITS.maxTexLength }),
  /**
   * Vai trò, quyết định khoảng cách hai bên và chỗ gióng cột.
   *
   * Không suy ra từ chuỗi LaTeX: `-` là dấu trừ hai ngôi hay dấu âm một ngôi thì
   * chỉ tác giả biết, và đoán sai thì khoảng cách sai ở mọi dòng.
   */
  role: Type.Optional(
    Type.Union([Type.Literal('term'), Type.Literal('op'), Type.Literal('relation')], {
      default: 'term',
    }),
  ),
  /**
   * Hạng tử này **triệt tiêu ở dòng đây** và sẽ biến mất ở bước sau.
   *
   * Phải khai tường minh. Một hạng tử tự dưng biến mất giữa hai bước là lỗi đại
   * số hay gặp nhất khi soạn tay, và check bundle biến đúng chỗ đó thành lỗi
   * (`derivation/silent-drop`). Gạch chéo là *lời khai*, không phải trang trí.
   */
  cancelled: Type.Optional(Type.Boolean({ default: false })),
  /**
   * Hạng tử này **bị thay bởi** hạng tử kia ở bước sau.
   *
   * Lối ra thứ hai cho một hạng tử, bên cạnh triệt tiêu: phép thế. Trong chứng
   * minh đếm hai chiều, $\#\{S : n \in S\}$ không triệt tiêu với ai cả — nó
   * *trở thành* $\binom{n-1}{k-1}$. Gạch chéo nó là sai nghĩa.
   *
   * Khác `cancelled` ở chỗ đây không phải lời khai suông: check bundle đòi id
   * được trỏ tới **có mặt thật** ở bước sau. Khai bừa thì vẫn đỏ.
   */
  becomes: Type.Optional(EntityId),
});

export const DerivationSceneElement = Type.Union([RowElement, TermElement]);
