import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  applyChoreography,
  createContext,
  keyed,
  sceneBoxStyle,
  type LabelAtlas,
  type SceneRenderer,
  type SvgNode,
} from '@combviz/render';
import {
  MORPH_LEFT_GROUP,
  MORPH_RIGHT_GROUP,
  MORPH_RIGHT_PREFIX,
  morphChoreography,
} from './bijection-morph.js';
import { useChoreography } from './useChoreography.js';
import { Timeline } from './Timeline.jsx';
import { patch, KEY_ATTR, ELEMENT_ATTR } from '@combviz/render/dom';
import { defaultTheme } from '@combviz/theme';
import type { Step } from '@combviz/schema';

interface Props {
  readonly step: Step;
  readonly renderer: SceneRenderer;
  /** D-07 — bảng nhãn LaTeX; `null` khi bài không có công thức trong canvas. */
  readonly labels?: LabelAtlas | null;
  /**
   * Khoá anchor đang được nói tới (ANC-05, M66) — rê trên lời kể, hoặc pha đang chạy.
   *
   * Cần vì anchor của một step song ánh trỏ vào **cả hai** pane: một câu như *"$C_4^1$
   * ứng với các đường đi qua ô trái"* nói về một hạng tử bên trái **và** một vùng bên
   * phải cùng lúc. Trước M66 view này không nhận anchor nào, nên rê vào câu ấy chỉ
   * sáng được nửa mà Player vẽ — tức là mất đúng nửa mà song ánh sinh ra để nói.
   */
  readonly anchor?: string | null;
}

/**
 * Đổi key của cả một cây, để hai pane gộp được vào **một** cây mà không đụng nhau.
 *
 * Cần thiết vì key hai bên hoàn toàn có thể trùng: ở GR-07 đồ thị và ma trận kề
 * của nó là **cùng** một tập element vẽ hai kiểu, nên `pairs` là `[e, e]`. Hai
 * node cùng key trong một cây thì `patch` mất dấu cả hai.
 */
function prefixKeys(nodes: readonly SvgNode[], prefix: string): SvgNode[] {
  return nodes.map((node) => {
    const children = node.children ? prefixKeys(node.children, prefix) : undefined;
    const next = node.key === undefined ? node : { ...node, key: `${prefix}${node.key}` };
    return children ? { ...next, children } : next;
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Khung hình chữ nhật — `matchScale`/`unionBox` làm việc trên nó. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

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
export function BijectionPanes({
  step,
  renderer,
  labels,
  anchor = null,
}: Props): preact.JSX.Element | null {
  const [active, setActive] = useState<string | null>(null);
  // PRN-04 — có đang ở chế độ biến hình không. Tiến độ thì `useChoreography` giữ.
  const [morphing, setMorphing] = useState(false);
  const stepwise = prefersReducedMotion();
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
  /**
   * Hợp của hai nguồn, không phải một cái thắng cái kia.
   *
   * Khác chỗ ưu tiên của Player (`activeAnchor` › `tapped` › timeline) vì ở đó ba
   * nguồn **cạnh tranh cùng một chỗ**: cả ba đều nói "nhìn dòng nào". Ở đây rê chuột
   * nói về *một cặp*, còn anchor nói về *một câu* — hai câu khác nhau, và cùng đúng.
   * Ép chúng loại nhau thì rê vào một ô sẽ tắt mất chỗ mà lời kể đang chỉ.
   */
  const anchored = useMemo(
    () =>
      anchor !== null && step.anchors && Object.hasOwn(step.anchors, anchor)
        ? (step.anchors[anchor]?.ids ?? [])
        : [],
    [anchor, step],
  );

  const highlight = useMemo(() => {
    const out = new Set<string>(anchored);
    if (active !== null) {
      out.add(active);
      for (const partner of partners.get(active) ?? []) out.add(partner);
    }
    return out;
  }, [active, partners, anchored]);

  const ctx = useMemo(
    () => createContext(defaultTheme, { highlight, ...(labels ? { labels } : {}) }),
    [highlight, labels],
  );

  /**
   * Ctx **trần** cho hình học — không mang `highlight`.
   *
   * `boxesOf` chỉ hỏi chỗ mực nằm, mà highlight chỉ đổi nước sơn, không đổi
   * layout. Cho `generated` ăn theo `ctx` đầy đủ thì mỗi lần rê chuột qua một
   * anchor (M66 cố tình cho anchor chảy vào pane này) là một object spec mới,
   * và `useChoreography` reset `ms` về 0 — animation biến hình đang chạy giật
   * về đầu chỉ vì người xem *chỉ vào* thứ đang bay.
   */
  const geomCtx = useMemo(
    () => createContext(defaultTheme, labels ? { labels } : {}),
    [labels],
  );

  /**
   * Hai cây node của chế độ biến hình, trong **một** hệ toạ độ.
   *
   * Không dịch pane phải về chỗ pane trái: cả kho dùng chung quy ước đơn vị
   * (G-10), nên hai scene vốn đã nằm cùng một thước đo. Chồng chúng lên nhau
   * trong khung hợp là đủ, và phần tử nào thật sự phải *di chuyển* thì nó di
   * chuyển vì toạ độ của nó khác — không phải vì ta đẩy cả pane đi.
   */
  /**
   * Timeline biến hình, dựng từ `pairs` và hình học do **engine khai**.
   *
   * Không đo ngược từ cây đã render nữa: `elementBoxes` biết chính xác chỗ mực
   * nằm, kể cả ở những hình mà phép đoán từ thuộc tính SVG chịu thua.
   *
   * `null` nghĩa là quá nhiều cặp không đo được — Player **không hiện nút**. Một
   * animation mà một phần ba số cặp đứng im còn tệ hơn hai hình đặt cạnh nhau.
   */
  const generated = useMemo(() => {
    if (!step.scene || !bijection) return null;
    const anchor = Object.keys(step.anchors ?? {})[0];
    if (anchor === undefined) return null;
    return morphChoreography(
      bijection,
      (id) => renderer.boxesOf(step.scene!, id, geomCtx),
      (id) => renderer.boxesOf(bijection.scene, id, geomCtx),
      {
        anchor,
        // Chồng lấn **bằng 0** khi bấm từng pha: `goPhase` nhảy tới
        // `at + duration`, nên pha chồng nhau sẽ dừng ở chỗ cặp kế tiếp mới bay
        // được nửa đường — trông như hỏng.
        overlapMs: stepwise ? 0 : 380,
      },
    );
  }, [renderer, step, bijection, geomCtx, stepwise]);

  const timeline = useChoreography(generated?.spec, 1);

  /**
   * Hai cây gộp làm một, mỗi cây bọc trong **một nhóm có key**.
   *
   * Nhóm là chỗ pha đổi vai bám vào: đặt `opacity` lên `<g>` thì cả cây mờ đi
   * như một khối, kể cả nhãn và chú thích — thứ không thuộc cặp nào và vì thế
   * từng nằm lại chồng lên hình bên kia.
   *
   * Pane phải còn đeo tiền tố cho key: hai bên hoàn toàn có thể trùng key — ở
   * GR-07 đồ thị và ma trận kề của nó là **cùng** một tập element vẽ hai kiểu.
   */
  const morphNodes = useMemo(() => {
    if (!step.scene || !bijection) return [];
    return [
      keyed(MORPH_LEFT_GROUP, 'g', {}, renderer.render(step.scene, ctx)),
      keyed(
        MORPH_RIGHT_GROUP,
        'g',
        {},
        prefixKeys(renderer.render(bijection.scene, ctx), MORPH_RIGHT_PREFIX),
      ),
    ];
  }, [renderer, step, bijection, ctx]);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right || !step.scene || !bijection || morphing) return;

    patch(left, renderer.render(step.scene, ctx));
    patch(right, renderer.render(bijection.scene, ctx));
  }, [renderer, step, bijection, ctx, morphing]);

  useEffect(() => {
    const container = morphRef.current;
    if (!container || !morphing || !generated) return;
    patch(
      container,
      applyChoreography(morphNodes, generated.spec, timeline.ms, { boxOf: generated.boxOf }),
    );
  }, [morphing, generated, morphNodes, timeline.ms]);

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

  if (morphing && generated) {
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

        {/*
          Thanh timeline **dùng chung** với step có choreography (CHO-02), không
          phải một bản sao riêng. Nhờ đó chế độ giảm chuyển động — bộ đếm pha,
          bấm qua **từng cặp** — có ngay mà không viết thêm dòng nào, và nó đúng
          là thứ SRS đòi ở PRN-04: "biến hình theo từng cặp".
        */}
        <Timeline spec={generated.spec} state={timeline} />
        <nav class="timeline">
          <button onClick={() => setMorphing(false)}>Về hai hình</button>
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

      {/* Không có timeline đo được thì không hiện nút — xem `morphChoreography`. */}
      {generated ? (
        <nav class="timeline bijection__morph-toggle">
          <button onClick={() => setMorphing(true)}>▶ Biến hình</button>
        </nav>
      ) : null}

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
