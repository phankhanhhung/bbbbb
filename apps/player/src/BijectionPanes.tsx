import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  applyChoreography,
  createContext,
  matchScale,
  sceneBoxStyle,
  type LabelAtlas,
  type SceneRenderer,
} from '@combviz/render';
import { rollcallChoreography } from './bijection-rollcall.js';
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
  // PRN-04 — có đang điểm danh không. Tiến độ thì `useChoreography` giữ.
  const [rollcall, setRollcall] = useState(false);
  const leftRef = useRef<SVGSVGElement>(null);
  const rightRef = useRef<SVGSVGElement>(null);

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
   * Timeline điểm danh, dựng từ `pairs`.
   *
   * Nó **không** cần hình học: không có gì dời chỗ, nên không hỏi `elementBoxes`
   * về toạ độ. Chỉ hỏi một câu — "id này có được vẽ không" — vì gọi tên một cặp
   * mà một đầu không có mực thì gọi xong không ai đáp.
   *
   * `null` nghĩa là quá nhiều cặp không vẽ được, và Player **không hiện nút**.
   */
  const generated = useMemo(() => {
    if (!step.scene || !bijection) return null;
    const anchor = Object.keys(step.anchors ?? {})[0];
    if (anchor === undefined) return null;
    const drawn = (scene: NonNullable<Step['scene']>) => (id: string) =>
      renderer.boxesOf(scene, id, geomCtx).length > 0;
    return rollcallChoreography(bijection, drawn(step.scene), drawn(bijection.scene), { anchor });
  }, [renderer, step, bijection, geomCtx]);

  const timeline = useChoreography(generated?.spec, 1);

  /**
   * **Một** effect cho cả hai pane, ở cả hai chế độ.
   *
   * Chế độ biến hình từng cần một effect riêng và một `<svg>` thứ ba, vì nó gộp
   * hai cây vào một hệ toạ độ. Điểm danh thì không dời gì: hai pane giữ nguyên
   * khung, nguyên tỉ lệ, nguyên chỗ — chỉ khác ở chỗ cây nào cũng đi qua
   * `applyChoreography` trước khi vào `patch`. Bố cục không nhúc nhích khi bấm
   * chạy, và đó là một phần của việc đọc được: cái bảng bên phải phải nằm sẵn ở
   * đúng chỗ ấy **trước** khi ô đầu tiên hiện ra.
   *
   * Spec chiếu xuống từng pane, không dùng chung: một pha `hide` nhắm vào
   * `ev1v2` mà áp lên cây phải sẽ giấu luôn ô ma trận mang `data-el = ev1v2`.
   */
  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right || !step.scene || !bijection) return;

    const leftTree = renderer.render(step.scene, ctx);
    const rightTree = renderer.render(bijection.scene, ctx);
    const run = rollcall && generated !== null;

    patch(left, run ? applyChoreography(leftTree, generated.left, timeline.ms) : leftTree);
    patch(right, run ? applyChoreography(rightTree, generated.right, timeline.ms) : rightTree);
  }, [renderer, step, bijection, ctx, rollcall, generated, timeline.ms]);

  if (!bijection || !step.scene) return null;

  const leftViewport = renderer.viewportOf(step.scene, ctx);
  const rightViewport = renderer.viewportOf(bijection.scene, ctx);
  const [leftBox, rightBox] = matchScale(leftViewport, rightViewport);

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

  return (
    <div class={rollcall ? 'bijection bijection--rollcall' : 'bijection'}>
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

      {/*
        Hai pane **ở nguyên đó** khi điểm danh chạy — thanh timeline chỉ mọc thêm
        bên dưới. Chế độ biến hình từng thay cả bố cục bằng một canvas gộp, và cái
        giá là người xem mất chỗ neo mắt đúng lúc cần nó nhất.

        Thanh timeline **dùng chung** với step có choreography (CHO-02), không
        phải một bản sao riêng. Nhờ đó chế độ giảm chuyển động — bộ đếm pha, bấm
        qua từng nhịp — có ngay mà không viết thêm dòng nào.

        Không có timeline nào dựng được thì không hiện nút; xem
        `rollcallChoreography`.
      */}
      {generated ? (
        rollcall ? (
          <div class="bijection__timeline">
            <Timeline spec={generated.spec} state={timeline} />
            <nav class="timeline">
              <button onClick={() => setRollcall(false)}>Về hai hình</button>
            </nav>
          </div>
        ) : (
          <nav class="timeline bijection__rollcall-toggle">
            <button onClick={() => setRollcall(true)}>▶ Điểm danh từng cặp</button>
          </nav>
        )
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
