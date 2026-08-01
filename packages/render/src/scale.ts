import type { Viewport } from '@combviz/schema';

/**
 * Tỉ lệ scene → màn hình (G-10).
 *
 * **Vấn đề lớp này sinh ra để dẹp.** Quy ước G-10 nói "một ô bàn cờ, một khoảng
 * cách giữa hai đỉnh = 10 đơn vị scene". Quy ước ấy tồn tại để đơn vị scene so
 * sánh được giữa các engine. Nhưng Player vẽ mỗi scene bằng một `viewBox` **vừa
 * khít nội dung** rồi kéo giãn cho đầy pane (`width: 100%`), nên tỉ lệ thật là
 * `bề rộng pane / viewport.width` — **đổi theo từng scene**. Đo trên kho 56 bài:
 *
 *   - trong **một** bài, cùng một đối tượng to nhỏ chênh tới **7,1×** giữa các
 *     step (14/56 bài có chênh lệch);
 *   - toàn kho, cùng "một ô" vẽ ra từ **39px tới 400px** — chênh **10,2×**.
 *
 * Nói cách khác: quy ước G-10 có trong tài liệu mà không ai thi hành, nên nó
 * không mua được gì. Đây đúng lớp lỗi mà kho này gặp nhiều lần — một luật viết ra
 * rồi để đó.
 *
 * **Luật thay thế, và nó chỉ có hai dòng.** Một ô luôn là `CELL_PX` pixel, trừ
 * khi scene rộng quá pane thì co lại — **chỉ co, không bao giờ giãn**. Và hệ số
 * co tính từ **step rộng nhất của cả bài**, nên không step nào đổi cỡ khi bấm
 * sang bước sau.
 */

/**
 * Một "ô" trên màn hình, tính bằng pixel.
 *
 * $44$px không phải số chọn cho đẹp: đó đúng là ngưỡng chạm tối thiểu mà NFR-A3
 * đòi và CSS của Player đã dùng cho mọi nút (`min-height: 44px`). Ô bàn cờ nhỏ
 * hơn ngón tay là ô không bấm được, nên hai con số ấy vốn phải là một.
 *
 * Đo trên kho: ở mức này **99%** scene vừa khít pane desktop mà không phải co —
 * chỉ 3 scene rộng nhất (dãy dài) phải thu lại.
 */
export const CELL_PX = 44;

/** Quy ước G-10: một ô / một khoảng cách đỉnh = 10 đơn vị scene. */
export const UNITS_PER_CELL = 10;

/** Pixel trên một đơn vị scene ở tỉ lệ đầy đủ. */
export const PREFERRED_SCALE = CELL_PX / UNITS_PER_CELL;

/**
 * Chiều cao tối đa của canvas, tính theo viewport màn hình.
 *
 * Trục ngang đã do `sceneBoxStyle` khoá chặt. Trục dọc cần một hàng rào riêng vì
 * một scene rất cao (bảng incidence nhiều phần tử) ở tỉ lệ đầy đủ sẽ đẩy phần
 * narrative ra khỏi màn hình — và lúc ấy người học mất chính thứ cần đọc cùng
 * hình.
 */
export const MAX_CANVAS_VH = 72;

/**
 * Kiểu mở để gán thẳng vào `style` của JSX.
 *
 * Chỉ số chuỗi là cố ý: `CSSProperties` của Preact đòi nó, và bọc thêm một lớp
 * chuyển đổi chỉ để giữ kiểu hẹp là thêm một chỗ có thể lệch.
 */
export interface SceneBoxStyle {
  readonly [property: string]: string;
  /** Bề rộng theo phần trăm pane — khoá **cùng một** tỉ lệ cho mọi step. */
  readonly width: string;
  /** Trần theo pixel — chặn không cho giãn quá tỉ lệ đầy đủ. */
  readonly maxWidth: string;
  readonly maxHeight: string;
  readonly marginInline: string;
}

/**
 * Style cho thẻ `<svg>` của một step, khoá tỉ lệ theo **cả bài**.
 *
 * Hai dòng CSS làm hết việc, và không cần đo pane bằng JavaScript:
 *
 *   - `width: (box / widest) * 100%` — mọi step chia nhau **một** hệ số
 *     `pane / widest`, nên đối tượng không đổi cỡ giữa các bước. Step hẹp hơn thì
 *     thẻ svg hẹp hơn, chứ không phải nội dung to hơn.
 *   - `max-width: box * PREFERRED_SCALE px` — trần tuyệt đối. Bài nhỏ không bị
 *     thổi phồng cho đầy pane; nó dừng ở đúng $44$px một ô và nằm giữa.
 *
 * Nhánh nào thắng cũng cho ra **một** tỉ lệ dùng chung cho mọi step: pane rộng
 * thì cả bài ở tỉ lệ đầy đủ, pane hẹp thì cả bài co cùng một hệ số.
 */
export function sceneBoxStyle(box: Viewport, widestWidth: number): SceneBoxStyle {
  const widest = widestWidth > 0 ? widestWidth : Math.max(1, box.width);
  const share = (box.width / widest) * 100;

  return {
    // Sáu chữ số thập phân, không phải hai: phần trăm là **mẫu số của tỉ lệ dùng
    // chung**, nên làm tròn thô ở đây khiến hai step lệch nhau một chút — vô hình
    // trên màn hình, nhưng nó biến một bất biến đúng hẳn thành một bất biến gần
    // đúng, và loại "gần đúng" ấy không kiểm được bằng test.
    width: `${round(share, 6)}%`,
    maxWidth: `${round(box.width * PREFERRED_SCALE, 2)}px`,
    maxHeight: `${MAX_CANVAS_VH}vh`,
    // Bài nhỏ nằm **giữa** pane. Dồn sang trái thì một bài 4×4 trông như bị lỗi
    // bố cục chứ không như một bài nhỏ.
    marginInline: 'auto',
  };
}

/**
 * Bề rộng scene lớn nhất trong một tập step — mẫu số của tỉ lệ dùng chung.
 *
 * Lấy **rộng nhất** chứ không phải hợp của các khung: hợp khung nghĩa là một step
 * chỉ có một đống sỏi cũng phải mang theo khung của step vẽ cả phổ 40 ô, và đống
 * sỏi ấy sẽ nằm lọt thỏm trong một mảng trắng. Ở đây khung vẫn khít từng step,
 * chỉ **tỉ lệ** là dùng chung.
 */
export function widestWidth(viewports: readonly Viewport[]): number {
  return viewports.reduce((max, v) => Math.max(max, v.width), 0);
}

/**
 * Nới hai khung hình về **cùng kích thước**, mỗi khung nới quanh tâm của nó.
 *
 * Hai pane của một view song ánh luôn được vẽ trong hai ô bằng nhau, nên khung
 * nào nhỏ hơn sẽ bị phóng to hơn — và một ô bên trái hoá ra to gấp năm lần một ô
 * bên phải. Với view ấy thì đó không phải chuyện thẩm mỹ: toàn bộ nội dung là
 * "cái này ứng với cái kia", mà tỉ lệ lệch nhau thì mắt đọc thành "hai thứ chẳng
 * liên quan".
 *
 * Nới được vì cả kho dùng chung một quy ước đơn vị (G-10). Nhờ đó cân bằng khung
 * là đủ để một ô bên trái to đúng bằng một ô bên phải, kể cả khi hai pane chạy
 * hai engine khác nhau.
 *
 * Sống ở đây chứ không ở Player: từ M69 nó có **hai** người dùng — Player vẽ hai
 * pane cạnh nhau, và `combviz og` ghép đúng hai pane ấy vào card. Một bản chép
 * tay thứ hai thì bản thứ hai sẽ lệch, và lệch ở đúng chỗ không ai nhìn.
 */
export function matchScale<T extends Viewport>(a: T, b: T): [Viewport, Viewport] {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const grow = (box: Viewport): Viewport => ({
    x: box.x - (width - box.width) / 2,
    y: box.y - (height - box.height) / 2,
    width,
    height,
  });
  return [grow(a), grow(b)];
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor + 0;
}
