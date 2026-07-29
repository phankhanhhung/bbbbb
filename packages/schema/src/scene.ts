import { Type, type Static } from '@sinclair/typebox';

/**
 * Khung nhìn trong hệ toạ độ của scene (DAT-21).
 *
 * Vắng mặt = **kế thừa từ step cha**. Player chỉ animate viewport khi tác giả đổi
 * chủ đích, nên "không khai báo" và "khai báo trùng cha" phải phân biệt được —
 * đó là lý do trường này optional chứ không có default cứng.
 */
export const Viewport = Type.Object(
  {
    x: Type.Number(),
    y: Type.Number(),
    width: Type.Number({ exclusiveMinimum: 0 }),
    height: Type.Number({ exclusiveMinimum: 0 }),
  },
  { additionalProperties: false },
);
export type Viewport = Static<typeof Viewport>;

/**
 * Vỏ Scene, không phụ thuộc engine cụ thể.
 *
 * `config` và `elements` cố ý để mở ở tầng này: chúng được validate ở lượt thứ
 * hai bằng fragment của engine tương ứng (xem `engine-registry.ts`). Nhờ vậy
 * `packages/schema` không import engine nào — điều kiện để engine lazy-load theo
 * `engines_used[]` (D-10) và để CLI nạp engine trong Node.
 */
export const Scene = Type.Object(
  {
    engine: Type.String({ minLength: 1 }),
    config: Type.Unknown(),
    elements: Type.Array(Type.Unknown()),
    viewport: Type.Optional(Viewport),
  },
  { additionalProperties: false },
);

export interface Scene {
  engine: string;
  config: unknown;
  elements: SceneElement[];
  viewport?: Viewport;
}

/** Hình dạng tối thiểu mà mọi element phải có, đủ để tầng core diff và anchor. */
export interface SceneElement {
  id: string;
  type: string;
  color_class?: number;
  emphasis?: 'none' | 'focus' | 'dim';
  layer?: number;
  locked?: boolean;
  [key: string]: unknown;
}
