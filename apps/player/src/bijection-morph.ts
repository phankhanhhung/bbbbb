import type { Bijection } from '@combviz/schema';
import type { BoxLookup, Choreography, SceneBox } from '@combviz/render';

type Phase = Choreography['phases'][number];

/**
 * `PRN-04` — dựng timeline biến hình **theo từng cặp** từ `bijection.pairs`.
 *
 * SRS §257 nói rõ *animation "biến hình" **theo từng cặp***, và chữ ấy là cả nội
 * dung sư phạm: dời tất cả cùng lúc thì người đọc thấy một đám hình bay, không
 * thấy "cái này ứng với cái kia". Một pha cho một cặp là cách duy nhất mắt theo
 * kịp từng phép ứng.
 *
 * Hàm **thuần**, và cố ý không biết engine lẫn renderer: nó nhận hộp đã đo sẵn.
 * Nhờ vậy nó test được bằng hộp giả, không cần dựng scene nào.
 */

/** Hai pane gộp thành một không gian id; pane phải đeo tiền tố. */
const RIGHT = 'r:';

/**
 * Id của **cả cây** mỗi pane, để pha đổi vai chạm được toàn bộ.
 *
 * Bản đầu cho pha `hide`/`show` nhắm vào từng phần tử đã ghép cặp, và khung cuối
 * lộ ngay chỗ hổng: nhãn hàng, tiêu đề, chú thích của pane trái **không** thuộc
 * cặp nào nên chúng nằm lại, chồng lên xâu nhị phân vừa hiện ra. Nhắm vào nhóm
 * thì `applyChoreography` đặt `opacity` lên chính `<g>` ấy và cả cây mờ đi như
 * một khối — đúng nghĩa "đổi vai hai hình".
 */
export const MORPH_LEFT_GROUP = 'morph-pane-left';
export const MORPH_RIGHT_GROUP = 'morph-pane-right';

export interface MorphOptions {
  /** Anchor mà cả timeline giải thích (CHO-07). */
  readonly anchor: string;
  /** Thời lượng một cặp, ms. */
  readonly perPairMs?: number;
  /**
   * Chồng lấn giữa hai pha liên tiếp, ms.
   *
   * **Bằng $0$ khi bấm từng pha.** `goPhase` nhảy tới `at + duration` của pha
   * đang chọn; nếu các pha chồng nhau thì dừng ở đó để lại cặp kế tiếp bay dở
   * nửa đường — trông như hỏng. Chạy mượt thì chồng lấn cho ra cảm giác dòng
   * chảy; bấm từng pha thì nối đuôi mới đọc được. Hai chế độ, hai timeline.
   */
  readonly overlapMs?: number;
  /** Thời lượng pha đổi vai ở cuối. */
  readonly swapMs?: number;
}

export interface GeneratedMorph {
  /**
   * Timeline sinh ra.
   *
   * **Cố ý không hợp lệ theo schema của chính nó**, và điều đó an toàn vì nó
   * không bao giờ được ghi ra file: id pane phải đeo tiền tố `r:`, mà `:` không
   * nằm trong `ENTITY_ID_PATTERN`. Đó là chủ ý — một tiền tố *hợp lệ* (`R__b1`)
   * có thể đụng một element thật tên `R__b1` và hỏng lặng lẽ, trong khi tiền tố
   * không hợp lệ thì không bao giờ va phải id do tác giả đặt.
   */
  readonly spec: Choreography;
  /** Tra hộp cho **cả hai** pane. Đi liền với `spec`, tách ra là vô nghĩa. */
  readonly boxOf: BoxLookup;
  /** Cặp không đo được hộp ở một trong hai đầu. */
  readonly skipped: readonly (readonly [string, string])[];
}

/**
 * Bỏ cuộc khi quá **một phần ba** số cặp không đo được.
 *
 * Một animation mà một phần ba số cặp đứng im còn tệ hơn hai hình đặt cạnh nhau:
 * đứng im đọc thành "cái này không có ảnh", một lời nói dối đúng về điều mà bài
 * toán đang chứng minh. Từ chối là câu trả lời đúng.
 */
const GIVE_UP_RATIO = 1 / 3;

export function morphChoreography(
  bijection: Bijection,
  leftBoxes: (id: string) => readonly SceneBox[],
  rightBoxes: (id: string) => readonly SceneBox[],
  options: MorphOptions,
): GeneratedMorph | null {
  const perPairMs = options.perPairMs ?? 700;
  const overlapMs = Math.min(options.overlapMs ?? 0, perPairMs - 1);
  const swapMs = options.swapMs ?? 400;

  const boxOf: BoxLookup = (id: string) =>
    id.startsWith(RIGHT) ? rightBoxes(id.slice(RIGHT.length)) : leftBoxes(id);

  // Gom theo **vế phải**: đếm $k$-về-$1$ khai $k$ cặp cùng trỏ về một hình, và
  // đó là một ý ("mỗi hình bên phải ứng với đúng $k$ hình bên trái"), không phải
  // $k$ ý. Cho $k$ hình cùng bay về một chỗ là cách duy nhất người xem **thấy**
  // được con số $k$.
  const groups: { to: string; targets: string[] }[] = [];
  const byTarget = new Map<string, { to: string; targets: string[] }>();
  const skipped: (readonly [string, string])[] = [];
  const claimed = new Set<string>();
  // Đếm riêng: "đo không được" là engine chưa khai hình học, còn "trùng vế trái"
  // là tác giả khai một quan hệ mạnh hơn song ánh. Chỉ cái đầu mới là dấu hiệu
  // rằng cả phép biến hình sẽ trông như hỏng.
  let unmeasured = 0;

  for (const [a, b] of bijection.pairs) {
    if (leftBoxes(a).length === 0 || rightBoxes(b).length === 0) {
      skipped.push([a, b]);
      unmeasured += 1;
      continue;
    }
    // Một hình bên trái chỉ bay được tới **một** chỗ. Cặp sau cùng vế trái thì
    // pha muộn ghi đè pha sớm và nó lặng lẽ bay tới đích cuối — nói ra thay vì
    // để im.
    if (claimed.has(a)) {
      skipped.push([a, b]);
      continue;
    }
    claimed.add(a);

    const found = byTarget.get(b);
    if (found) {
      found.targets.push(a);
      continue;
    }
    const group = { to: b, targets: [a] };
    byTarget.set(b, group);
    groups.push(group);
  }

  if (groups.length === 0) return null;
  if (unmeasured > bijection.pairs.length * GIVE_UP_RATIO) return null;

  const step = Math.max(1, perPairMs - overlapMs);
  const phases: Phase[] = groups.map((group, i) => ({
    // Đệm số: `activePhases` sắp theo `at` rồi `id.localeCompare`, nên không đệm
    // thì `morph-10` đứng trước `morph-2`.
    id: `morph-${String(i).padStart(2, '0')}`,
    kind: 'morph',
    targets: group.targets.slice(0, 200),
    to: `${RIGHT}${group.to}`,
    at: i * step,
    duration: perPairMs,
    anchor: options.anchor,
    // Nhãn **bắt buộc**, không tuỳ chọn: cả bảy step song ánh trong kho có đúng
    // một anchor, nên mọi pha sẽ chung anchor và bộ đếm pha ở chế độ giảm chuyển
    // động sẽ in ra $N$ dòng giống hệt nhau. Nhãn là thứ phân biệt chúng.
    label: { vi: group.targets.length === 1 ? `${group.targets[0]} → ${group.to}` : `${group.targets.join(', ')} → ${group.to}` },
  }));

  // Đổi vai ở cuối: hình bên trái mờ đi, hình bên phải hiện ra — **cùng lúc**,
  // sau khi mọi thứ đã bay xong. Tách hai chuyện (bay trước, đổi mặt sau) vì hai
  // thứ nửa trong suốt chồng lên nhau suốt quãng đường đọc thành một đống nhoè.
  //
  // `show` còn gánh một việc nữa mà `applyChoreography` lo sẵn: pha `show` **chưa
  // bắt đầu** giữ target ở `opacity: 0`, nên pane phải ẩn từ khung đầu tiên mà
  // không cần pha phụ nào.
  const end = (groups.length - 1) * step + perPairMs;
  phases.push(
    {
      id: 'morph-swap-out',
      kind: 'hide',
      targets: [MORPH_LEFT_GROUP],
      at: end,
      duration: swapMs,
      anchor: options.anchor,
      label: { vi: 'đổi vai hai hình' },
    },
    {
      id: 'morph-swap-in',
      kind: 'show',
      targets: [MORPH_RIGHT_GROUP],
      at: end,
      duration: swapMs,
      anchor: options.anchor,
      // Nhãn khác `morph-swap-out` để bộ đếm pha không in hai dòng giống nhau.
      label: { vi: 'hình bên phải hiện ra' },
    },
  );

  return { spec: { phases } as Choreography, boxOf, skipped };
}

/** Tổng thời lượng của một timeline sinh ra — Player dùng để đặt thanh tua. */
export const MORPH_RIGHT_PREFIX = RIGHT;
