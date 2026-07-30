import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  createContext,
  nodeBox,
  sceneBoxStyle,
  type AttrValue,
  type Box,
  type LabelAtlas,
  type SceneRenderer,
  type SvgNode,
} from '@combviz/render';
import { patch, KEY_ATTR, ELEMENT_ATTR } from '@combviz/render/dom';
import { defaultTheme } from '@combviz/theme';
import type { Step } from '@combviz/schema';

interface Props {
  readonly step: Step;
  readonly renderer: SceneRenderer;
  /** D-07 — bảng nhãn LaTeX; `null` khi bài không có công thức trong canvas. */
  readonly labels?: LabelAtlas | null;
}

/** Thời lượng một lượt biến hình, ms. Chậm hơn chuyển step vì đây *là* nội dung. */
const MORPH_MS = 1200;

// `Box` dùng chung với `nodeBox` ở tầng render thay vì khai lại: hai bản sao
// giống hệt nhau chỉ chờ ngày một bên thêm trường.

/**
 * Nới hai khung hình về **cùng kích thước**, mỗi khung nới quanh tâm của nó.
 *
 * Hai pane luôn được vẽ trong hai ô CSS bằng nhau, nên khung nào nhỏ hơn sẽ bị
 * phóng to hơn — và một ô bên trái hoá ra to gấp năm lần một ô bên phải. Với view
 * này thì đó không phải chuyện thẩm mỹ: toàn bộ nội dung là "cái này ứng với cái
 * kia", mà tỉ lệ lệch nhau thì mắt đọc thành "hai thứ chẳng liên quan".
 *
 * Nới được vì cả kho dùng chung một quy ước đơn vị (G-10: một ô, một khoảng cách
 * đỉnh = 10 đơn vị scene). Nhờ đó cân bằng khung là đủ để một ô bên trái to đúng
 * bằng một ô bên phải, kể cả khi hai pane chạy hai engine khác nhau.
 */
export function matchScale(a: Box, b: Box): [Box, Box] {
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const grow = (box: Box): Box => ({
    x: box.x - (width - box.width) / 2,
    y: box.y - (height - box.height) / 2,
    width,
    height,
  });
  return [grow(a), grow(b)];
}

/** Khung nhỏ nhất chứa cả hai — hệ toạ độ chung của chế độ biến hình. */
export function unionBox(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/**
 * Tâm hình học của từng element trong một cây đã render.
 *
 * Gộp theo **`data-el` trước, key sau** — cùng thứ tự ưu tiên mà phép tra ngược
 * từ con trỏ ở dưới đã dùng, và vì cùng một lý do: khi một element được vẽ thành
 * nhiều node, chỉ `data-el` nói được node này thuộc về ai. Riêng ở đây bỏ qua
 * thứ tự ấy thì hỏng lặng lẽ: bảng incidence đeo key `x1` lên một hình chữ nhật
 * **trong suốt** làm tay cầm cho con trỏ, còn mực thật nằm ở các ô `x1__S`. Dời
 * tay cầm thì không ai thấy gì, và phép biến hình trông như bị hỏng.
 */
export function centresByElement(
  nodes: readonly SvgNode[],
): Map<string, readonly { x: number; y: number }[]> {
  // Hai bảng riêng, không một bảng gộp: mực (`data-el`) **thay thế** tay cầm
  // (key) chứ không cộng vào nó. Cộng vào sẽ kéo tâm của `x1` ra giữa nguyên một
  // hàng rộng — tức là ra chỗ chẳng có gì.
  const ink = new Map<string, { x: number; y: number }[]>();
  const handle = new Map<string, { x: number; y: number }[]>();

  const add = (into: Map<string, { x: number; y: number }[]>, id: string, box: Box | null): void => {
    if (!box) return;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const seen = into.get(id);
    if (seen) seen.push(centre);
    else into.set(id, [centre]);
  };

  const walk = (list: readonly SvgNode[]): void => {
    for (const node of list) {
      const owner = node.attrs[ELEMENT_ATTR];
      if (typeof owner === 'string') add(ink, owner, nodeBox(node));
      else if (node.key !== undefined) add(handle, node.key, nodeBox(node));
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);

  return new Map([...handle, ...ink]);
}

/**
 * PRN-04 / CHO-05 — khung hình tại tiến độ `t` của phép biến hình.
 *
 * **Không** nội suy hai cây theo key, dù thoạt nhìn đó là đường ngắn nhất: gán
 * cho phần tử bên phải cái key của ảnh ngược rồi ném vào `interpolateNodes` thì
 * chạy được ở bài mà hai pane cùng engine, và hỏng lặng lẽ ở bài mà hai pane
 * khác engine — mà đó lại là dạng phổ biến nhất của chứng minh song ánh. Lý do
 * hỏng: `interpolateNodes` khớp theo **dáng cây**, và mỗi engine dựng một dáng
 * khác nhau, nên nó lật ở $t = 0.5$ thay vì chuyển động.
 *
 * Đường đúng là nói bằng thứ duy nhất hai engine dùng chung: **toạ độ scene**
 * (G-10). Mỗi phần tử bên trái trượt tới tâm ảnh của nó, rồi ở đoạn cuối mới
 * đổi vai cho phần tử bên phải. Tách hai chuyện — bay xong mới đổi mặt — vì hai
 * thứ nửa trong suốt chồng lên nhau suốt quãng đường đọc thành một đống nhoè.
 */
export function morphFrame(
  left: readonly SvgNode[],
  right: readonly SvgNode[],
  pairs: readonly (readonly [string, string])[],
  t: number,
): SvgNode[] {
  const targets = centresByElement(right);
  const sources = centresByElement(left);

  const move = new Map<string, { dx: number; dy: number }>();
  for (const [a, b] of pairs) {
    const from = sources.get(a)?.[0];
    const to = nearest(targets.get(b), from);
    // Đo không được thì không đẩy: `nodeBox` trả `null` cho hình mà nó không đọc
    // nổi (đường đi lệnh tương đối, cung), và đoán một hộp bao sai sẽ ném element
    // ra chỗ vô lý — tệ hơn hẳn so với việc nó đứng yên.
    if (!from || !to || move.has(a)) continue;
    move.set(a, { dx: to.x - from.x, dy: to.y - from.y });
  }

  const fadeOut = 1 - ramp(t, SWAP_AT);
  const fadeIn = ramp(t, SWAP_AT);

  const shift = (list: readonly SvgNode[]): SvgNode[] =>
    list.map((node) => {
      const children = node.children ? shift(node.children) : undefined;
      // `t = 0` phải trả về cây trái **y nguyên**, không kèm `translate(0 0)`.
      // Cùng bất biến mà `interpolateNodes` giữ (D-05): một thuộc tính vô hại về
      // mặt thị giác vẫn phá khẳng định "khung đầu bằng đúng cây nguồn", và
      // chính khẳng định ấy là thứ bảo đảm clip render ra khớp player.
      // Tra chủ sở hữu theo `data-el` **trước** key, y như lúc đo hộp bao. Bỏ
      // qua chuyện này là cách hỏng tinh vi nhất của cả tính năng: `move` lập
      // chỉ mục theo id element (`x1`), còn node mang mực lại đeo key riêng của
      // renderer (`x1__S`) — nên thứ duy nhất khớp là cái tay cầm trong suốt, và
      // phép biến hình chạy đủ thời lượng mà màn hình đứng im.
      const owner = node.attrs[ELEMENT_ATTR];
      const id = typeof owner === 'string' ? owner : node.key;
      const delta = id === undefined || t <= 0 ? undefined : move.get(id);
      if (!delta && fadeOut >= 1) return children ? { ...node, children } : node;

      const attrs: Record<string, AttrValue> = { ...node.attrs };
      if (delta) {
        const prefix = `translate(${round(delta.dx * t)} ${round(delta.dy * t)})`;
        const existing = attrs['transform'];
        attrs['transform'] = existing === undefined ? prefix : `${prefix} ${String(existing)}`;
      }
      if (fadeOut < 1) attrs['opacity'] = round(Number(attrs['opacity'] ?? 1) * fadeOut);
      return children ? { ...node, attrs, children } : { ...node, attrs };
    });

  const enter = (list: readonly SvgNode[]): SvgNode[] =>
    list.map((node) => {
      const children = node.children ? enter(node.children) : undefined;
      const attrs = { ...node.attrs, opacity: round(Number(node.attrs['opacity'] ?? 1) * fadeIn) };
      return children ? { ...node, attrs, children } : { ...node, attrs };
    });

  // Key hai bên có thể trùng nhau (GR-07: đồ thị và ma trận kề của nó là **cùng**
  // một tập element vẽ hai kiểu), nên pane phải phải đeo tiền tố — hai node cùng
  // key trong một cây thì `patch` mất dấu cả hai.
  const tagged = (list: readonly SvgNode[]): SvgNode[] =>
    list.map((node) => {
      const children = node.children ? tagged(node.children) : undefined;
      const next = node.key === undefined ? node : { ...node, key: `${RIGHT_PREFIX}${node.key}` };
      return children ? { ...next, children } : next;
    });

  const out: SvgNode[] = [];
  if (fadeOut > 0) out.push(...shift(left));
  if (fadeIn > 0) out.push(...tagged(enter(right)));
  return out;
}

/**
 * Bản sao **gần nhất** của ảnh, không phải tâm của cả cụm.
 *
 * Một element có thể được vẽ ở nhiều chỗ, và ma trận kề là ví dụ sắc nhất: cạnh
 * $v_1v_2$ hiện ở **hai** ô đối xứng qua đường chéo — chính là chuyện mà bổ đề
 * bắt tay nói. Lấy tâm của cả cụm sẽ ném cạnh ấy vào ô nằm *trên* đường chéo,
 * tức là một ô mang nghĩa hoàn toàn khác. Bay tới bản gần nhất thì cạnh đáp
 * xuống đúng một trong hai ô của nó.
 */
function nearest(
  options: readonly { x: number; y: number }[] | undefined,
  from: { x: number; y: number } | undefined,
): { x: number; y: number } | undefined {
  if (!options || options.length === 0) return undefined;
  if (!from || options.length === 1) return options[0];
  return options.reduce((best, candidate) =>
    hypot(candidate, from) < hypot(best, from) ? candidate : best,
  );
}

function hypot(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

/** Đoạn cuối timeline dành cho việc đổi vai; trước mốc này chỉ có chuyển động. */
const SWAP_AT = 0.65;
const RIGHT_PREFIX = 'r:';

function ramp(t: number, from: number): number {
  if (t <= from) return 0;
  return Math.min(1, (t - from) / (1 - from));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * PRN-04 — hai cấu hình cạnh nhau, rê vào một bên thì bên kia sáng lên.
 *
 * Đây là điều **duy nhất** phân biệt view này với hai hình đặt gần nhau, và cũng
 * là toàn bộ nội dung sư phạm của một chứng minh bằng song ánh: "cái này ứng với
 * cái kia" không phải câu để đọc, nó là thứ để chỉ tay vào.
 *
 * Tra ngược từ DOM về id element (`closest([data-k])`) chứ không gọi `hitTest`
 * của engine: view này phải chạy với **mọi** engine, kể cả khi hai pane dùng hai
 * engine khác nhau — xâu nhị phân bên trái, đường đi trên lưới bên phải là đúng
 * cặp mà bài đếm song ánh hay dùng. Hình học thì mỗi engine một kiểu, còn cái
 * key thì renderer nào cũng gắn.
 */
export function BijectionPanes({ step, renderer, labels }: Props): preact.JSX.Element | null {
  const [active, setActive] = useState<string | null>(null);
  // PRN-04 — `null` là chế độ hai pane; số là tiến độ biến hình trong $[0,1]$.
  const [morph, setMorph] = useState<number | null>(null);
  const leftRef = useRef<SVGSVGElement>(null);
  const rightRef = useRef<SVGSVGElement>(null);
  const morphRef = useRef<SVGSVGElement>(null);

  const bijection = step.bijection;

  // Tra cứu hai chiều: rê bên nào cũng sáng được bên kia.
  const partners = useMemo(() => {
    const map = new Map<string, string[]>();
    const add = (from: string, to: string): void => {
      const list = map.get(from);
      if (list) list.push(to);
      else map.set(from, [to]);
    };
    for (const [a, b] of bijection?.pairs ?? []) {
      add(a, b);
      add(b, a);
    }
    return map;
  }, [bijection]);

  // Cả phần tử đang trỏ **và** ảnh của nó đều được nhấn. Chỉ nhấn một bên thì
  // người đọc mất dấu chính thứ mình đang chỉ vào.
  const highlight = useMemo(() => {
    if (active === null) return new Set<string>();
    return new Set([active, ...(partners.get(active) ?? [])]);
  }, [active, partners]);

  const ctx = useMemo(
    () => createContext(defaultTheme, { highlight, ...(labels ? { labels } : {}) }),
    [highlight, labels],
  );

  /**
   * Hai cây node của chế độ biến hình, trong **một** hệ toạ độ.
   *
   * Không dịch pane phải về chỗ pane trái: cả kho dùng chung quy ước đơn vị
   * (G-10), nên hai scene vốn đã nằm cùng một thước đo. Chồng chúng lên nhau
   * trong khung hợp là đủ, và phần tử nào thật sự phải *di chuyển* thì nó di
   * chuyển vì toạ độ của nó khác — không phải vì ta đẩy cả pane đi.
   */
  const morphPair = useMemo(() => {
    if (!step.scene || !bijection) return null;
    return {
      left: renderer.render(step.scene, ctx),
      right: renderer.render(bijection.scene, ctx),
      pairs: bijection.pairs,
    };
  }, [renderer, step, bijection, ctx]);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right || !step.scene || !bijection || morph !== null) return;

    patch(left, renderer.render(step.scene, ctx));
    patch(right, renderer.render(bijection.scene, ctx));
  }, [renderer, step, bijection, ctx, morph]);

  useEffect(() => {
    const container = morphRef.current;
    if (!container || morph === null || !morphPair) return;
    patch(container, morphFrame(morphPair.left, morphPair.right, morphPair.pairs, morph));
  }, [morph, morphPair]);

  const [playing, setPlaying] = useState(false);
  /**
   * Cờ **đồng bộ** cho vòng rAF, bên cạnh state.
   *
   * `setPlaying(false)` chỉ có hiệu lực ở lần render sau, nên khung rAF đã lên
   * lịch vẫn kịp chạy thêm một nhịp — và vì nhịp ấy *cộng dồn* vào giá trị hiện
   * tại, nó ghi đè đúng cái vị trí người dùng vừa kéo tới. Triệu chứng là kéo về
   * $0$ mà hình nhích một tí: `translate(0 0.035)` thay vì đứng yên.
   */
  const running = useRef(false);
  const stop = (): void => {
    running.current = false;
    setPlaying(false);
  };

  useEffect(() => {
    if (!playing) return;
    running.current = true;
    let last: number | null = null;
    let frame = requestAnimationFrame(function tick(now: number) {
      if (!running.current) return;
      const delta = last === null ? 0 : now - last;
      last = now;
      setMorph((value) => {
        const next = (value ?? 0) + delta / MORPH_MS;
        if (next >= 1) {
          stop();
          return 1;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    });
    return () => {
      running.current = false;
      cancelAnimationFrame(frame);
    };
  }, [playing]);

  if (!bijection || !step.scene) return null;

  const leftViewport = renderer.viewportOf(step.scene, ctx);
  const rightViewport = renderer.viewportOf(bijection.scene, ctx);
  const [leftBox, rightBox] = matchScale(leftViewport, rightViewport);
  const morphBox = unionBox(leftViewport, rightViewport);

  /**
   * Leo hết chuỗi tổ tiên, lấy key **đầu tiên có cặp**, không lấy key gần nhất.
   *
   * Thứ nằm dưới con trỏ thường không phải thứ được ghép cặp: trong bảng
   * incidence, ô người ta trỏ vào là `x1__S`, còn cặp khai theo phần tử `x1` —
   * và `closest()` dừng ngay ở ô. Kết quả là rê đúng chỗ mà không có gì sáng
   * lên, im lặng hoàn toàn.
   */
  const onPoint = (event: Event): void => {
    let node = event.target as Element | null;
    while (node) {
      // `data-el` trước `data-k`: khi một element được vẽ thành nhiều node, chỉ
      // `data-el` nói được node này thuộc về ai.
      for (const attr of [ELEMENT_ATTR, KEY_ATTR]) {
        const id = node.getAttribute?.(attr);
        if (id !== null && id !== undefined && partners.has(id)) {
          setActive(id);
          return;
        }
      }
      node = node.parentElement;
    }
    setActive(null);
  };

  const pane = (
    side: 'left' | 'right',
    label: string,
    ref: typeof leftRef,
    box: { x: number; y: number; width: number; height: number },
    altText: string,
  ): preact.JSX.Element => (
    <figure class={`bijection__pane bijection__pane--${side}`}>
      <svg
        ref={ref}
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
        // `matchScale` đã cho hai pane cùng một khung, nên `share` = 100% và trần
        // 44px/ô là thứ quyết định: hai pane luôn cùng tỉ lệ, và không pane nào
        // vượt tỉ lệ chung của cả kho.
        style={sceneBoxStyle(box, box.width)}
        role="img"
        aria-label={altText}
        onPointerMove={onPoint}
        onPointerLeave={() => setActive(null)}
      />
      <figcaption>{label}</figcaption>
    </figure>
  );

  if (morph !== null) {
    return (
      <div class="bijection bijection--morph">
        <figure class="bijection__pane">
          <svg
            ref={morphRef}
            viewBox={`${morphBox.x} ${morphBox.y} ${morphBox.width} ${morphBox.height}`}
            style={sceneBoxStyle(morphBox, morphBox.width)}
            role="img"
            aria-label={`Biến hình từ ${bijection.label_left?.vi ?? 'cấu hình bên trái'} sang ${
              bijection.label_right?.vi ?? 'cấu hình bên phải'
            }`}
          />
          <figcaption>
            {bijection.label_left?.vi ?? 'Bên trái'} → {bijection.label_right?.vi ?? 'Bên phải'}
          </figcaption>
        </figure>

        <nav class="timeline" aria-label="Biến hình">
          <button onClick={() => setPlaying(!playing)} aria-label={playing ? 'Tạm dừng' : 'Chạy'}>
            {playing ? '❙❙' : '▶'}
          </button>
          {/*
            Thanh kéo **không** phải phần thêm cho đẹp: nó là kênh duy nhất dùng
            được bằng bàn phím (NFR-A2) và là cách người tắt chuyển động vẫn xem
            được từng chặng của phép biến hình thay vì chỉ thấy hai đầu (NFR-A4).
          */}
          <input
            class="timeline__scrub"
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(morph * 1000)}
            onInput={(event) => {
              stop();
              setMorph(Number((event.currentTarget as HTMLInputElement).value) / 1000);
            }}
            aria-label="Tiến độ biến hình"
            aria-valuetext={`${Math.round(morph * 100)}%`}
          />
          <button
            onClick={() => {
              stop();
              setMorph(null);
            }}
          >
            Về hai hình
          </button>
        </nav>
      </div>
    );
  }

  return (
    <div class="bijection">
      {pane(
        'left',
        bijection.label_left?.vi ?? 'Bên trái',
        leftRef,
        leftBox,
        step.alt_text?.vi ?? 'Cấu hình bên trái',
      )}
      <div class="bijection__link" aria-hidden="true">
        ↔
      </div>
      {pane(
        'right',
        bijection.label_right?.vi ?? 'Bên phải',
        rightRef,
        rightBox,
        'Cấu hình bên phải, ứng một-một với bên trái',
      )}

      <nav class="timeline bijection__morph-toggle">
        <button
          onClick={() => {
            setMorph(0);
            setPlaying(true);
          }}
        >
          ▶ Biến hình
        </button>
      </nav>

      {/*
        NFR-A2: rê chuột không phải là kênh duy nhất. Danh sách cặp đọc được bằng
        bàn phím và bằng trình đọc màn hình; focus vào một cặp thì cả hai pane
        sáng đúng như khi rê chuột.
      */}
      <ul class="bijection__pairs">
        {bijection.pairs.map(([a, b]) => (
          <li key={`${a}~${b}`}>
            <button
              type="button"
              class={active === a || active === b ? 'is-active' : ''}
              onFocus={() => setActive(a)}
              onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(a)}
              onMouseLeave={() => setActive(null)}
            >
              {/*
                Hai vế trùng id là chuyện thường và có nghĩa: đồ thị và ma trận kề
                của nó là **cùng** một tập element vẽ hai kiểu (GR-07), nên cặp
                đúng là "e ứng với chính e". Hiện "e ↔ e" thì đọc như một lỗi.
              */}
              {a === b ? a : `${a} ↔ ${b}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
