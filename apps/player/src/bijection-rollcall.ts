import type { Bijection } from '@combviz/schema';
import type { Choreography } from '@combviz/render';

type Phase = Choreography['phases'][number];

/**
 * `PRN-04` — **điểm danh từng cặp**: timeline lái view hai pane bằng đồng hồ.
 *
 * ## Nó khác phép biến hình ở chỗ nào
 *
 * Biến hình gộp hai pane vào **một** hệ toạ độ rồi cho hình bên trái bay sang chỗ
 * hình bên phải. Điểm danh thì không dời gì cả: hai pane đứng nguyên chỗ, cả hai
 * cùng hiện, và mỗi cặp được gọi tên theo bốn nhịp —
 *
 * 1. hình bên trái **sáng lên** (`focus`),
 * 2. ảnh của nó bên phải **hiện ra** (`show`),
 * 3. hình bên trái **rút đi** (`hide`),
 * 4. ảnh bên phải **ở lại** — miễn phí, vì `phaseProgress` kẹp về $1$ nên pha đã
 *    xong giữ nguyên trạng thái cuối.
 *
 * Ba chuyện được lợi, và không chuyện nào là chuyện thẩm mỹ:
 *
 * - **Không có đích vô hình.** Biến hình giữ pane phải ở `opacity: 0` tới tận pha
 *   đổi vai, nên $83\%$ thời lượng là các hình bay vào khoảng trắng. Ở đây bảng
 *   nằm sẵn bên cạnh từ khung đầu, và nó **được điền dần**.
 * - **Một cặp chạm được nhiều chỗ vẽ.** Phép dời buộc phải chọn *một* đích, vì một
 *   node chỉ ở được một chỗ — đó là lý do `nearestPair` tồn tại, và là lý do cạnh
 *   $v_1v_2$ chỉ bay tới một trong hai ô đối xứng của nó. Phép sáng lên không có
 *   ràng buộc ấy: gọi tên một cạnh thì **cả hai** ô cùng hiện. Với bài bổ đề bắt
 *   tay thì đúng cái thừa số $2$ ấy là toàn bộ nội dung.
 * - **Không còn một không gian id gộp.** Hai cây nằm trong hai `<svg>` riêng nên
 *   không cần tiền tố cho pane phải, và cả lớp lỗi "hai bên trùng danh tính" biến
 *   mất theo — nó từng làm ma trận kề vỡ vụn ở khung cuối.
 *
 * ## Vì sao ba spec chứ không một
 *
 * Một đồng hồ, hai cây, nên spec phải **chiếu** xuống từng pane: áp cả pha của bên
 * trái lên cây bên phải thì một pha `hide` nhắm vào `ev1v2` sẽ giấu luôn ô ma trận
 * mang `data-el = ev1v2`. Chiếu bằng cách lọc lúc áp, **không** bằng cách gộp cây
 * rồi đổi tên — đó đúng là con đường đã sinh ra lỗi lần trước.
 *
 * `spec` là bản hợp, và nó chỉ để `Timeline` đọc: bộ đếm pha, nhãn, thanh tua.
 *
 * Hàm **thuần** và không biết engine lẫn renderer: nó chỉ hỏi "id này có được vẽ
 * không". Nhờ vậy test được bằng vị từ giả, không cần dựng scene nào.
 */

export interface RollcallOptions {
  /** Anchor mà cả timeline giải thích (CHO-07). */
  readonly anchor: string;
  /** Nhịp 1 — hình bên trái sáng lên, ms. */
  readonly callMs?: number;
  /** Nhịp 2 — ảnh bên phải hiện ra, ms. */
  readonly fillMs?: number;
  /** Nhịp 3 — hình bên trái rút đi, ms. */
  readonly retireMs?: number;
}

export interface GeneratedRollcall {
  /** Bản hợp — **chỉ** dành cho `Timeline`: đếm pha, nhãn, độ dài thanh tua. */
  readonly spec: Choreography;
  /** Chiếu xuống pane trái. Áp lên cây phải là sai, xem chú thích trên. */
  readonly left: Choreography;
  /** Chiếu xuống pane phải. */
  readonly right: Choreography;
  /** Cặp có một đầu không được vẽ. */
  readonly skipped: readonly (readonly [string, string])[];
}

/**
 * Bỏ cuộc khi quá **một phần ba** số cặp không vẽ được.
 *
 * Cùng ngưỡng và cùng lý lẽ với phép biến hình: một lượt điểm danh mà một phần ba
 * số cặp gọi tên rồi không ai đáp thì đọc thành "cái này không có ảnh" — một lời
 * nói dối đúng về điều mà bài toán đang chứng minh. Từ chối là câu trả lời đúng,
 * và Player **không hiện nút**.
 */
const GIVE_UP_RATIO = 1 / 3;

export function rollcallChoreography(
  bijection: Bijection,
  drawnLeft: (id: string) => boolean,
  drawnRight: (id: string) => boolean,
  options: RollcallOptions,
): GeneratedRollcall | null {
  const callMs = options.callMs ?? 420;
  const fillMs = options.fillMs ?? 420;
  const retireMs = options.retireMs ?? 300;

  // Gom theo **vế phải**, cùng lý lẽ với phép biến hình: đếm $k$-về-$1$ khai $k$
  // cặp cùng trỏ về một hình, và đó là một ý ("mỗi hình bên phải ứng với đúng $k$
  // hình bên trái"), không phải $k$ ý. Gọi tên $k$ hình cùng một nhịp là cách duy
  // nhất người xem **thấy** được con số $k$.
  const groups: { to: string; targets: string[] }[] = [];
  const byTarget = new Map<string, { to: string; targets: string[] }>();
  const skipped: (readonly [string, string])[] = [];
  const claimed = new Set<string>();
  let unmeasured = 0;

  for (const [a, b] of bijection.pairs) {
    if (!drawnLeft(a) || !drawnRight(b)) {
      skipped.push([a, b]);
      unmeasured += 1;
      continue;
    }
    // Một hình bên trái chỉ rút đi được **một** lần. Cặp sau cùng vế trái thì nhịp
    // muộn gọi tên một cái tên đã bị gạch — nói ra thay vì để im.
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

  // **Không** có chốt "không cặp nào dịch chỗ thì thôi" như phép biến hình. Ở đó
  // câu hỏi là "có gì để bay không", và hai pane cùng engine cùng view thì câu trả
  // lời là không. Ở đây câu hỏi khác hẳn: *"cái này ứng với cái kia"* vẫn là một
  // điều đáng chỉ tay vào **kể cả khi** hai hình nằm đúng một chỗ — bài "tập con ↔
  // phần bù" là như thế, và nó vẫn cần được điểm danh.

  const left: Phase[] = [];
  const right: Phase[] = [];
  const spec: Phase[] = [];

  const pad = (i: number): string => String(i).padStart(2, '0');
  let at = 0;

  groups.forEach((group, i) => {
    // Đệm số: `activePhases` sắp theo `at` rồi `id.localeCompare`, nên không đệm
    // thì `call-10` đứng trước `call-2`.
    const names = group.targets.join(', ');
    const targets = group.targets.slice(0, 200);

    const call: Phase = {
      id: `call-${pad(i)}`,
      kind: 'focus',
      targets,
      at,
      duration: callMs,
      anchor: options.anchor,
      // Nhãn **bắt buộc**, không tuỳ chọn: cả bảy step song ánh trong kho có đúng
      // một anchor, nên mọi pha chung anchor và bộ đếm pha sẽ in ra $3N$ dòng
      // giống hệt nhau. Nhãn là thứ phân biệt chúng.
      label: { vi: `${names} sáng lên` },
    };
    const fill: Phase = {
      id: `fill-${pad(i)}`,
      kind: 'show',
      targets: [group.to],
      at: at + callMs,
      duration: fillMs,
      anchor: options.anchor,
      label: { vi: `ảnh của ${names} hiện ra` },
    };
    const retire: Phase = {
      id: `retire-${pad(i)}`,
      kind: 'hide',
      targets,
      at: at + callMs + fillMs,
      duration: retireMs,
      anchor: options.anchor,
      label: { vi: `${names} rút đi` },
    };

    left.push(call, retire);
    right.push(fill);
    spec.push(call, fill, retire);
    // Nối đuôi, **không** chồng lấn. Bốn nhịp là một câu có thứ tự — gọi tên, đáp
    // lời, gạch tên — và chồng chúng lên nhau thì câu ấy đọc thành một tiếng ồn.
    // Cũng là điều kiện để `goPhase` (bấm từng pha) dừng đúng chỗ.
    at += callMs + fillMs + retireMs;
  });

  return {
    spec: { phases: spec } as Choreography,
    left: { phases: left } as Choreography,
    right: { phases: right } as Choreography,
    skipped,
  };
}
