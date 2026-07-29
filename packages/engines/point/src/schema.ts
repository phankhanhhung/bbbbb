import { Type, type Static } from '@sinclair/typebox';
import { defineElement, MAX_COLOR_CLASS } from '@combviz/schema';

/**
 * Bound của Point/Segment engine (NFR-P4, PT-02).
 *
 * `maxSegments` chặn theo thứ **đắt nhất**: đếm giao điểm là $O(s^2)$, và $300$
 * đoạn cho $44\,850$ cặp — vẫn dưới một phần trăm giây, còn $2000$ đoạn thì
 * không. Trần điểm lấy đúng con số SRS nói.
 */
export const POINT_LIMITS = {
  maxPoints: 200,
  maxSegments: 300,
  /** Bao lồi và kiểm thẳng hàng là $O(n^2)$–$O(n^3)$; chặn riêng cho cái sau. */
  maxCollinearScan: 60,
} as const;

/**
 * Toạ độ **thật**, không phải vị trí trình bày.
 *
 * Đây là toàn bộ lý do engine này tồn tại tách khỏi graph. Ở graph engine, toạ
 * độ đỉnh là **nội dung sư phạm** chứ không phải hình học (GR-02): xếp vòng
 * tròn để thấy đối xứng, xếp hai hàng để thấy đồ thị hai phía. Ở đó "ba đỉnh
 * thẳng hàng" không có nghĩa gì cả, và bài học của M4 là *layout biết nói dối*.
 *
 * Ở đây thì ngược lại hoàn toàn: thẳng hàng, lồi, cắt nhau, diện tích — tất cả
 * đều là **mệnh đề của bài toán**. Một điểm nhích đi một chút là đổi đáp án.
 * Hai thứ đó không thể ở chung một engine mà không có ngày ai đó hỏi bao lồi
 * của một đồ thị hai phía và nhận được câu trả lời trông rất hợp lý.
 *
 * Toạ độ để **số thực**, không ép nguyên: bài lưới điểm nguyên cần nguyên, còn
 * đa giác đều thì không có toạ độ nguyên nào. Quy ước đơn vị vẫn là G-10 —
 * khoảng cách $10$ là một "ô".
 */
const Coord = Type.Tuple([Type.Number(), Type.Number()]);

export const PointConfig = Type.Object(
  {
    /** Hiện nhãn điểm. */
    show_labels: Type.Optional(Type.Boolean({ default: true })),
    /**
     * Vẽ lưới nền theo bước này. Bài điểm nguyên gần như luôn cần nó: "hai điểm
     * có trung điểm nguyên" là mệnh đề về lưới, mà không vẽ lưới thì người đọc
     * không có gì để đối chiếu.
     */
    grid: Type.Optional(Type.Number({ minimum: 1 })),
    /** PT-02: tô bao lồi của **mọi** điểm thành một vùng mờ phía sau. */
    show_hull: Type.Optional(Type.Boolean({ default: false })),
    /** Chấm tròn tại mỗi chỗ hai đoạn cắt nhau. */
    show_intersections: Type.Optional(Type.Boolean({ default: false })),
    padding: Type.Optional(Type.Number({ minimum: 0, default: 6 })),
    caption: Type.Optional(Type.String({ maxLength: 48 })),
  },
  { additionalProperties: false },
);
export type PointConfig = Static<typeof PointConfig>;

export const PointElement = defineElement('point', {
  pos: Coord,
  label: Type.Optional(Type.String({ maxLength: 12 })),
});

/**
 * Đoạn thẳng nối hai điểm.
 *
 * Chỉ nhận id điểm, không nhận toạ độ rời: một đoạn phải **dính** vào điểm của
 * nó, nếu không thì kéo điểm đi sẽ để lại đoạn treo lơ lửng đúng chỗ cũ.
 */
export const SegmentElement = defineElement('segment', {
  a: Type.String(),
  b: Type.String(),
  style: Type.Optional(
    Type.Union([Type.Literal('solid'), Type.Literal('dashed'), Type.Literal('dotted')], {
      default: 'solid',
    }),
  ),
  label: Type.Optional(Type.String({ maxLength: 12 })),
});

/**
 * Đa giác qua một dãy điểm — vùng tô, không phải chỉ đường viền.
 *
 * Tách khỏi "một chuỗi đoạn" vì cái người ta muốn nói là **miền**: "tứ giác lồi
 * này", "tam giác chứa điểm kia". Vẽ bằng bốn đoạn thì hình trông giống nhau
 * nhưng không có vật thể nào để anchor trỏ vào.
 */
export const PolygonElement = defineElement('polygon', {
  points: Type.Array(Type.String(), { minItems: 3 }),
  label: Type.Optional(Type.String({ maxLength: 12 })),
});

/**
 * Đường thẳng **qua** hai điểm, kéo dài hết khung hình.
 *
 * Không phải đoạn thẳng dài hơn: cả một họ lập luận nói về *đường* chứ không về
 * đoạn — "đường qua $P$ và $Q$ chia mặt phẳng làm hai nửa", "mọi đường qua hai
 * điểm còn chứa điểm thứ ba" (Sylvester–Gallai). Vẽ bằng một đoạn nối hai điểm
 * thì câu chữ nói *chia mặt phẳng* còn hình chỉ có một gạch ngắn nằm giữa hai
 * chấm, và người đọc không thấy được cái mà lập luận dựa vào.
 */
export const LineElement = defineElement('line', {
  a: Type.String(),
  b: Type.String(),
  style: Type.Optional(
    Type.Union([Type.Literal('solid'), Type.Literal('dashed'), Type.Literal('dotted')], {
      default: 'dashed',
    }),
  ),
});

export const PointSceneElement = Type.Union([
  PointElement,
  SegmentElement,
  LineElement,
  PolygonElement,
]);

export const POINT_COLOR_MAX = MAX_COLOR_CLASS;
