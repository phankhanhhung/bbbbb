import type { Choreography, ChoreographyPhase } from '@combviz/schema';
import { clamp01, easeInOutCubic } from './easing.js';
import { lerpAttr } from './lerp.js';
import type { SceneBox } from './renderer.js';
import type { AttrValue, SvgNode } from './svg-node.js';

/**
 * Lớp choreography (CHO-01).
 *
 * **Vì sao nó không nằm trong renderer.** Renderer là `Scene → SvgNode[]` thuần và
 * phải ở nguyên như thế: đó là điều kiện để cùng một phép tính chạy trong browser
 * lẫn trong Node (REN-01/02/04). Nhét thời gian vào renderer là giết D-03. Nên lớp
 * này đứng *sau* renderer và đọc `(nodes, choreography, t)` — cũng thuần, cũng
 * không biết DOM.
 *
 * **Vì sao nó không phải animation giữa hai snapshot.** Cái đó đã có
 * (`interpolateNodes`) và vẫn còn, nhưng CHO-10 nói rõ nó là **fallback**: nó suy
 * chuyển động từ chênh lệch giữa hai hình, nên nó chỉ nói được "cái gì đổi", không
 * nói được "vì sao" hay "theo thứ tự nào". Choreography là chỗ tác giả nói ra thứ
 * tự ấy, và mỗi pha phải neo vào một câu trong lời giải (CHO-07).
 *
 * **Xác định (CHO-08).** Không đọc giờ, không random, không trạng thái. Cùng `t`
 * cho cùng khung ở mọi nơi — Player gọi mỗi rAF, render video gọi theo timestep
 * cố định, và hai bên phải ra byte giống nhau.
 */

/**
 * Kiểu pha lấy **thẳng từ schema**, không khai lại.
 *
 * Cám dỗ ở đây là định nghĩa một `Phase` riêng cho render "cho khỏi phụ thuộc".
 * Nhưng render đã phụ thuộc `@combviz/schema` sẵn (`Scene`, `Viewport`), và một
 * bản sao sẽ lặng lẽ lệch đúng vào ngày ai đó thêm một `kind` mới — đúng kiểu
 * lệch mà danh sách tile gõ tay ở `apps/player` từng mắc.
 */
export type Phase = ChoreographyPhase;
export type { Choreography };

/** Tổng thời lượng timeline, ms. Rỗng thì `0`. */
export function timelineLength(spec: Choreography): number {
  return spec.phases.reduce((end, phase) => Math.max(end, phase.at + phase.duration), 0);
}

/**
 * Tiến độ của một pha tại thời điểm `ms`, trong $[0,1]$.
 *
 * Pha có `duration: 0` là một cú lật tức thì: nó bằng $0$ **trước** mốc và $1$ từ
 * mốc trở đi. Chia cho 0 ở đây sẽ ra `NaN` và mọi thuộc tính nội suy thành rác,
 * mà `NaN` trong SVG thì không lỗi — nó chỉ làm hình biến mất.
 */
export function phaseProgress(phase: Phase, ms: number): number {
  // Thứ tự hai nhánh có ý nghĩa: pha tức thì đã **xong** ngay tại mốc, còn pha
  // có thời lượng thì tại mốc mới chỉ **bắt đầu** (tiến độ $0$).
  if (phase.duration <= 0) return ms >= phase.at ? 1 : 0;
  if (ms <= phase.at) return 0;
  const raw = clamp01((ms - phase.at) / phase.duration);
  return phase.easing === 'linear' ? raw : easeInOutCubic(raw);
}

/**
 * Các pha **đã bắt đầu** tại `ms`, theo thứ tự thời gian.
 *
 * Player dùng nó để biết đang giải thích câu nào (CHO-07): pha muộn nhất đã bắt
 * đầu là pha đang nói, và `anchor` của nó là đoạn narrative cần sáng lên.
 */
export function activePhases(spec: Choreography, ms: number): readonly Phase[] {
  return [...spec.phases]
    .filter((phase) => ms >= phase.at)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/**
 * Áp choreography lên cây SVG đã render, tại thời điểm `ms`.
 *
 * Thứ tự áp là **thứ tự thời gian**, không phải thứ tự khai trong file: hai pha
 * cùng chạm một element thì pha muộn hơn ghi đè, và đó là điều tác giả mong đợi
 * khi họ xếp chúng theo thời gian.
 */
export function applyChoreography(
  nodes: readonly SvgNode[],
  spec: Choreography,
  ms: number,
  options: { readonly positionOf?: PositionLookup; readonly boxOf?: BoxLookup } = {},
): SvgNode[] {
  const ordered = [...spec.phases].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const effects = new Map<string, Effect>();

  for (const phase of ordered) {
    const progress = phaseProgress(phase, ms);
    if (progress <= 0) {
      // Pha chưa bắt đầu vẫn có tác dụng: `show` nghĩa là **trước đó nó ẩn**. Nếu
      // bỏ qua hẳn, element hiện sẵn từ khung đầu và pha "hiện ra" không hiện gì.
      if (phase.kind === 'show') {
        for (const id of phase.targets) merge(effects, id, { opacity: 0 });
      }
      continue;
    }

    for (const id of phase.targets) {
      switch (phase.kind) {
        case 'focus':
          merge(effects, id, { emphasis: progress });
          break;
        case 'dim':
          merge(effects, id, { opacity: 1 - 0.75 * progress });
          break;
        case 'show':
          merge(effects, id, { opacity: progress });
          break;
        case 'hide':
          merge(effects, id, { opacity: 1 - progress });
          break;
        case 'move':
        case 'morph':
          merge(effects, id, {
            towards: phase.to,
            amount: progress,
            shape: phase.kind === 'morph',
          });
          break;
      }
    }
  }

  if (effects.size === 0) return [...nodes];
  return rewrite(nodes, effects, options.positionOf ?? collectPositions(nodes), options.boxOf);
}

/** Vị trí và hình dạng của một element, tra theo key — nguồn cho `move`/`morph`. */
export type PositionLookup = (id: string) => Readonly<Record<string, AttrValue>> | undefined;

/**
 * Chỗ mực của một element nằm — đường **thứ hai** cho `move`/`morph`.
 *
 * Đường thứ nhất (`positionOf`) sao chép giá trị thuộc tính của đích, và nó chỉ
 * chạy khi hai element có **cùng bộ thuộc tính** — tức là cùng engine. Morph
 * xuyên engine thì không: nguồn là `<rect x y width height>`, đích là một `<g>`
 * **rỗng thuộc tính**, nên vòng lặp sao chép bỏ qua sạch và không gì chuyển
 * động. Không lỗi, không cảnh báo, chạy đủ thời lượng, màn hình đứng im.
 *
 * Đường này nói bằng thứ duy nhất mọi engine dùng chung — **toạ độ scene**
 * (G-10): lấy hiệu hai tâm rồi chèn `translate`. Có `boxOf` và tra được cả hai
 * đầu thì đi đường này; không thì giữ nguyên hành vi cũ.
 */
export type BoxLookup = (id: string) => readonly SceneBox[] | undefined;

interface Effect {
  opacity?: number;
  emphasis?: number;
  towards?: string;
  amount?: number;
  shape?: boolean;
}

function merge(map: Map<string, Effect>, id: string, patch: Effect): void {
  map.set(id, { ...(map.get(id) ?? {}), ...patch });
}

/**
 * Thu thập thuộc tính hình học của mọi node có key.
 *
 * `move` cần biết đích **ở đâu**, và câu trả lời nằm trong chính cây đã render —
 * không phải trong scene. Đọc từ cây thì lớp này không cần biết engine nào đang
 * vẽ, đúng như `BijectionPanes` đã học: hình học thì mỗi engine một kiểu, còn key
 * thì renderer nào cũng gắn.
 */
function collectPositions(nodes: readonly SvgNode[]): PositionLookup {
  const found = new Map<string, Readonly<Record<string, AttrValue>>>();
  const walk = (list: readonly SvgNode[]): void => {
    for (const node of list) {
      if (node.key !== undefined && !found.has(node.key)) found.set(node.key, node.attrs);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return (id) => found.get(id);
}

/** Thuộc tính hình học được nội suy khi `move`/`morph`. */
const GEOMETRY = ['x', 'y', 'cx', 'cy', 'width', 'height', 'r', 'transform', 'points', 'd'];

function rewrite(
  nodes: readonly SvgNode[],
  effects: ReadonlyMap<string, Effect>,
  positionOf: PositionLookup,
  boxOf?: BoxLookup,
): SvgNode[] {
  return nodes.map((node) => {
    // `data-el` **trước** `key`: một element được vẽ thành nhiều node, và node
    // đeo `key = x1` có thể là một hình trong suốt làm chỗ bám cho con trỏ trong
    // khi mực thật nằm ở `x1__S`. Chỉ nhìn `key` thì một pha `move` dời cái tay
    // cầm vô hình ấy — chạy đủ thời lượng mà màn hình đứng im.
    const owner = node.attrs['data-el'];
    const id = typeof owner === 'string' ? owner : node.key;
    const effect = id === undefined ? undefined : effects.get(id);
    const children = node.children
      ? rewrite(node.children, effects, positionOf, boxOf)
      : undefined;
    if (!effect) return children ? { ...node, children } : node;

    const attrs: Record<string, AttrValue> = { ...node.attrs };

    if (effect.opacity !== undefined) {
      // Nhân vào độ mờ **sẵn có** thay vì đè: nền mặt của GR-05 vốn đã ở 0.5, và
      // đè thành 1 sẽ khiến một pha `dim` làm mặt ấy **đậm lên**.
      const base = Number(attrs['opacity'] ?? 1);
      attrs['opacity'] = round(base * effect.opacity);
    }

    if (effect.emphasis !== undefined && effect.emphasis > 0) {
      // Không tự chọn màu: lớp này không biết theme. Nó gắn một cờ, và lớp DOM
      // hoặc CSS quyết định "được nhấn" trông thế nào — cùng cách `data-el` đang
      // dùng để nối anchor với hình.
      attrs['data-phase'] = round(effect.emphasis);
    }

    if (effect.towards !== undefined && effect.amount !== undefined && boxOf && id !== undefined) {
      // Hiệu hai tâm rồi chèn `translate` **vào trước** transform sẵn có, giữ
      // nguyên phép biến đổi cũ của node.
      const from = nearestPair(boxOf(id), boxOf(effect.towards));
      if (from) {
        const dx = round(from.to.x - from.at.x);
        const dy = round(from.to.y - from.at.y);
        // `t = 0` phải trả về cây **y nguyên**, không kèm `translate(0 0)`:
        // cùng bất biến D-05 mà `interpolateNodes` giữ.
        if (effect.amount > 0) {
          const shift = `translate(${round(dx * effect.amount)} ${round(dy * effect.amount)})`;
          const existing = attrs['transform'];
          attrs['transform'] = existing === undefined ? shift : `${shift} ${String(existing)}`;
        }
        return children ? { ...node, attrs, children } : { ...node, attrs };
      }
    }

    if (effect.towards !== undefined && effect.amount !== undefined) {
      const target = positionOf(effect.towards);
      if (target) {
        for (const key of GEOMETRY) {
          const from = attrs[key];
          const to = target[key];
          if (from === undefined || to === undefined) continue;
          // `morph` nội suy cả hình (`d`, `points`); `move` chỉ dời chỗ. Tách hai
          // loại vì nội suy `d` giữa hai path khác số đoạn cho ra hình rác, và
          // tác giả phải chủ động nói "hai hình này morph được".
          if (!effect.shape && (key === 'd' || key === 'points')) continue;
          attrs[key] = lerpAttr(key, from, to, effect.amount);
        }
      }
    }

    return children ? { ...node, attrs, children } : { ...node, attrs };
  });
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Cặp (tâm nguồn, tâm đích) **gần nhau nhất**.
 *
 * Một element có thể được vẽ ở nhiều chỗ, và ma trận kề là ví dụ sắc nhất: cạnh
 * $v_1v_2$ hiện ở hai ô đối xứng. Lấy tâm của cả cụm sẽ ném nó vào ô nằm *trên*
 * đường chéo — một ô mang nghĩa hoàn toàn khác. Bay tới bản gần nhất thì nó đáp
 * xuống đúng một trong hai ô của chính nó.
 */
function nearestPair(
  from: readonly SceneBox[] | undefined,
  to: readonly SceneBox[] | undefined,
): { at: { x: number; y: number }; to: { x: number; y: number } } | null {
  if (!from?.length || !to?.length) return null;
  const centre = (b: SceneBox): { x: number; y: number } => ({
    x: b.x + b.width / 2,
    y: b.y + b.height / 2,
  });

  let best: { at: { x: number; y: number }; to: { x: number; y: number } } | null = null;
  let bestDistance = Infinity;
  for (const a of from) {
    for (const b of to) {
      const at = centre(a);
      const target = centre(b);
      const d = (at.x - target.x) ** 2 + (at.y - target.y) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = { at, to: target };
      }
    }
  }
  return best;
}
