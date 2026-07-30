import type { Scene } from '@combviz/schema';

/**
 * Công cụ sandbox mà **engine tự khai** (SBX-01).
 *
 * Trước lớp này, thanh công cụ của Sandbox là một danh sách gõ cứng trong
 * `apps/player`: tám ô màu, năm hình tile, "xoá quân", "lật hàng/cột" — tất cả
 * đều dispatch lệnh `board/*`. Nó hiện ra **giống hệt nhau ở cả bảy engine**, nên:
 *
 *   - Ở đồ thị, tập hợp, điểm, game, chuỗi biến đổi: bấm vào không có gì xảy ra.
 *     Lệnh `board/paint-cells` không nằm trong registry của engine ấy, `execute`
 *     trả về "không áp được", và **không ai báo gì cả**. Người học bấm một nút
 *     có vẻ dùng được và nhận lại sự im lặng.
 *   - Ngược lại, những engine ấy có lệnh thật — `set/toggle-membership`,
 *     `game/take`, `derivation/toggle-cancel`, `graph/add-edge` — mà **không có
 *     một nút nào** để gọi. Sandbox của chúng là một cái khung chết.
 *
 * Cùng một lỗi gốc với "trường ma" mà kho này đã gặp nhiều lần: hai nguồn sự
 * thật cho cùng một câu hỏi. Engine biết nó làm được gì (registry lệnh), còn UI
 * thì đoán. Ở đây UI **hỏi**.
 *
 * Danh sách là hàm của `scene` chứ không phải hằng số, vì thao tác hợp lệ phụ
 * thuộc cấu hình: đa tập thì gộp được, dãy có thứ tự thì đổi chỗ được, và hai
 * chuyện đó không bao giờ cùng đúng.
 */
export interface SandboxTool {
  /** Định danh trong UI; cũng là khoá React. */
  readonly id: string;
  readonly label: string;
  /** Ô màu vẽ theo `color_class` thay vì hiện chữ. */
  readonly swatch?: number;
  readonly action: ToolAction;
}

export type ToolAction =
  /** Chỉ chọn, không đổi scene. Engine nào cũng có. */
  | { readonly type: 'select' }
  /**
   * Quét qua nhiều element rồi gộp thành **một** lệnh khi nhả tay.
   *
   * Một nét quét là một thao tác trong đầu người dùng, nên undo phải hoàn tác cả
   * vệt chứ không phải từng ô.
   */
  | {
      readonly type: 'paint';
      readonly command: string;
      /** Tên tham số nhận mảng id. */
      readonly idsParam: string;
      /** Tham số cố định kèm theo, ví dụ `{ color_class: 3 }`. */
      readonly params?: Readonly<Record<string, unknown>>;
      /** Chỉ nhận element có id bắt đầu bằng tiền tố này (ô bàn cờ: `cell-`). */
      readonly prefix?: string;
      /**
       * Nét quét **tạo ra một element mới** (BD-05: khoanh vùng tuỳ ý).
       *
       * Khai cả hai thì phía gọi cấp id trước khi chạy lệnh, y như `stamp`. Lệnh
       * không tự sinh id — đó là điều kiện replay được của ENG-01, và nó không có
       * ngoại lệ cho thao tác kéo.
       */
      readonly idParam?: string;
      readonly idPrefix?: string;
    }
  /** Bấm **một** element → chạy lệnh với id của nó. */
  | {
      readonly type: 'one';
      readonly command: string;
      readonly idParam: string;
      /** Lệnh nhận **mảng** id (`board/remove` xoá được nhiều thứ một lúc). */
      readonly asList?: boolean;
      readonly params?: Readonly<Record<string, unknown>>;
      readonly prefix?: string;
    }
  /**
   * Bấm **hai** element liên tiếp → chạy lệnh với cả hai.
   *
   * Không kéo-thả: trên cảm ứng, kéo một đống sỏi sang đống khác rất dễ trượt
   * tay, mà lỡ tay ở đây nghĩa là gộp nhầm và mất mạch lập luận đang thử.
   */
  | {
      readonly type: 'two';
      readonly command: string;
      readonly params: readonly [string, string];
      readonly extra?: Readonly<Record<string, unknown>>;
      /** Lệnh cần một id mới (thêm cạnh): cấp ở phía gọi, không để lệnh tự sinh. */
      readonly idParam?: string;
      readonly idPrefix?: string;
    }
  /**
   * Bấm một element → chạy lệnh với **id mới cấp** cộng vị trí của element đó.
   *
   * Id do phía gọi cấp, không do lệnh tự sinh — đó là điều kiện replay được của
   * ENG-01.
   */
  | {
      readonly type: 'stamp';
      readonly command: string;
      readonly idParam: string;
      readonly idPrefix: string;
      /** Tên tham số nhận `[row, col]` bóc từ id ô. */
      readonly posParam: string;
      readonly params?: Readonly<Record<string, unknown>>;
      readonly prefix?: string;
    }
  /** Bấm một ô → chạy lệnh trên **cả hàng/cột** chứa nó. */
  | {
      readonly type: 'line';
      readonly command: string;
      readonly axis: 'row' | 'col';
    }
  /**
   * Chạy ngay khi bấm nút, không cần chọn element nào.
   *
   * Dành cho thao tác trên **toàn cảnh** — sắp lại đồ thị chẳng hạn. Nó không
   * phải một "công cụ" đang bật; bấm là xong.
   */
  | {
      readonly type: 'run';
      readonly command: string;
      readonly params?: Readonly<Record<string, unknown>>;
    }
  /**
   * Bấm một element, kèm **một con số** chọn sẵn trên thanh công cụ.
   *
   * Đây là dạng của nước đi trong game: "bốc $k$ viên từ đống này". Con số nằm
   * trong công cụ chứ không hỏi bằng hộp thoại — mỗi giá trị là một nút, nên
   * nước đi hợp lệ hiện ra thành một hàng nút và người học đọc luật bằng mắt.
   */
  | {
      readonly type: 'count';
      readonly command: string;
      readonly idParam: string;
      readonly countParam: string;
      readonly count: number;
    };

/** Engine nào cũng có công cụ chọn; gom về một chỗ để bảy engine không viết lại. */
export const SELECT_TOOL: SandboxTool = {
  id: 'select',
  label: 'Chọn',
  action: { type: 'select' },
};

export type SandboxToolsFn = (scene: Scene) => readonly SandboxTool[];
