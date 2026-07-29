import { Type, type Static } from '@sinclair/typebox';
import { defineElement, MAX_COLOR_CLASS } from '@combviz/schema';

/**
 * Bound của Grid/Board engine (NFR-P4).
 *
 * `maxTiles` = 400 và bàn 40×40 nhất quán với nhau: bài tromino L phủ bàn
 * $2^n \times 2^n$ khuyết 1 ô cần $(4^n-1)/3$ quân, nên cả hai bound cùng chặn
 * đúng ở n = 5 (32×32, 341 quân). Demo quy nạp trong seed list dừng ở n = 4.
 */
export const BOARD_LIMITS = {
  maxRows: 40,
  maxCols: 40,
  maxCells: 1600,
  maxTiles: 400,
  maxPieces: 200,
  maxRegions: 32,
} as const;

/** BD-01: preset tham số hoá — công cụ chứng minh chủ lực của dạng tiling. */
export const ColoringPreset = Type.Union([
  Type.Object(
    {
      type: Type.Literal('checkerboard'),
      /** Pha: đổi ô (0,0) sang màu còn lại. */
      phase: Type.Optional(Type.Integer({ minimum: 0, maximum: 1, default: 0 })),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal('stripes'),
      orientation: Type.Union([
        Type.Literal('row'),
        Type.Literal('col'),
        Type.Literal('diag-right'),
        Type.Literal('diag-left'),
      ]),
      k: Type.Integer({ minimum: 2, maximum: MAX_COLOR_CLASS }),
      phase: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
    },
    { additionalProperties: false },
  ),
]);
export type ColoringPreset = Static<typeof ColoringPreset>;

const Coord = Type.Tuple([
  Type.Integer({ minimum: 0 }),
  Type.Integer({ minimum: 0 }),
]);

/**
 * Ô bàn cờ là element **ngầm định**, sinh từ `rows`/`cols`/`holes`.
 *
 * Không materialize 1600 ô vào `elements[]`: file sẽ phình, diff git thành vô
 * dụng (DAT-03) và ngưỡng 1MB của NFR-P4 bị đốt vào thứ suy ra được. Tô tay từng
 * ô đi vào `cell_overrides` dạng thưa; preset lo phần còn lại.
 */
export const BoardConfig = Type.Object(
  {
    rows: Type.Integer({ minimum: 1, maximum: BOARD_LIMITS.maxRows }),
    cols: Type.Integer({ minimum: 1, maximum: BOARD_LIMITS.maxCols }),
    /** Ô khuyết: bàn cờ bỏ góc, bàn hình chữ L... */
    holes: Type.Optional(Type.Array(Coord)),
    coloring_preset: Type.Optional(ColoringPreset),
    /**
     * PRN-03 — biến bàn thành **bảng có nhãn và tổng**.
     *
     * Đếm hai chiều là kỹ thuật nền của gần như mọi bài đếm, và hình của nó luôn
     * là cùng một thứ: một bảng, đếm theo hàng, đếm theo cột, hai con số bằng
     * nhau. Cái bảng đó khác bàn cờ đúng ba chi tiết — nhãn hàng, nhãn cột, và
     * dòng tổng — nên nó là **tuỳ chọn của board engine**, không phải engine mới.
     *
     * `show_sums` đếm số ô **đã tô** trong mỗi hàng/cột. Đó là phép đếm mà bảng
     * incidence cần: ô tô = "có quan hệ". Bảng chứa số (tam giác Pascal, bảng
     * quy hoạch động) thì đơn giản là không bật nó.
     */
    table: Type.Optional(
      Type.Object(
        {
          row_labels: Type.Optional(Type.Array(Type.String({ maxLength: 10 }))),
          col_labels: Type.Optional(Type.Array(Type.String({ maxLength: 10 }))),
          show_sums: Type.Optional(Type.Boolean({ default: false })),
          /** Nhãn cho dòng/cột tổng. Mặc định "Σ". */
          sum_label: Type.Optional(Type.String({ maxLength: 10 })),
        },
        { additionalProperties: false },
      ),
    ),
    /** Tô tay đè lên preset. Khoá là id ô: `cell-<r>-<c>`. */
    cell_overrides: Type.Optional(
      Type.Record(
        Type.String({ pattern: '^cell-\\d+-\\d+$' }),
        Type.Object(
          {
            color_class: Type.Optional(
              Type.Integer({ minimum: 1, maximum: MAX_COLOR_CLASS }),
            ),
            glyph: Type.Optional(Type.String({ maxLength: 4 })),
          },
          { additionalProperties: false },
        ),
      ),
    ),
  },
  { additionalProperties: false },
);
export type BoardConfig = Static<typeof BoardConfig>;

const PieceKind = Type.Union([
  Type.Literal('king'),
  Type.Literal('queen'),
  Type.Literal('rook'),
  Type.Literal('bishop'),
  Type.Literal('knight'),
  Type.Literal('pawn'),
  Type.Literal('custom'),
]);

export const PieceElement = defineElement('piece', {
  kind: PieceKind,
  /** Chỉ dùng khi `kind: "custom"`. */
  glyph: Type.Optional(Type.String({ maxLength: 4 })),
  pos: Coord,
  /** BD-02: bật overlay vùng khống chế cho riêng quân này. */
  show_attacks: Type.Optional(Type.Boolean({ default: false })),
});

const TileShape = Type.Union([
  Type.Literal('domino'),
  Type.Literal('tromino-i'),
  Type.Literal('tromino-l'),
  Type.Literal('tetromino-i'),
  Type.Literal('tetromino-o'),
  Type.Literal('tetromino-t'),
  Type.Literal('tetromino-s'),
  Type.Literal('tetromino-l'),
  Type.Literal('custom'),
]);

export const TileElement = defineElement('tile', {
  shape: TileShape,
  /** Bắt buộc khi `shape: "custom"`: danh sách offset so với `pos`. */
  offsets: Type.Optional(Type.Array(Coord)),
  pos: Coord,
  rot: Type.Union([
    Type.Literal(0),
    Type.Literal(90),
    Type.Literal(180),
    Type.Literal(270),
  ]),
  flip: Type.Optional(Type.Boolean({ default: false })),
});

/** Nhóm ô có viền đậm — dùng để khoanh "vùng đang xét" trong lập luận. */
export const RegionElement = defineElement('region', {
  cells: Type.Array(Coord, { minItems: 1 }),
  label: Type.Optional(Type.String({ maxLength: 32 })),
});

export const BoardElement = Type.Union([PieceElement, TileElement, RegionElement]);
