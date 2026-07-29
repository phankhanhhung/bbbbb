import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createContext, type LabelAtlas, type SceneRenderer } from '@combviz/render';
import { patch, KEY_ATTR, ELEMENT_ATTR } from '@combviz/render/dom';
import { defaultTheme } from '@combviz/theme';
import type { Step } from '@combviz/schema';

interface Props {
  readonly step: Step;
  readonly renderer: SceneRenderer;
  /** D-07 — bảng nhãn LaTeX; `null` khi bài không có công thức trong canvas. */
  readonly labels?: LabelAtlas | null;
}

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
  const highlight = useMemo(() => {
    if (active === null) return new Set<string>();
    return new Set([active, ...(partners.get(active) ?? [])]);
  }, [active, partners]);

  const ctx = useMemo(
    () => createContext(defaultTheme, { highlight, ...(labels ? { labels } : {}) }),
    [highlight, labels],
  );

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right || !step.scene || !bijection) return;

    patch(left, renderer.render(step.scene, ctx));
    patch(right, renderer.render(bijection.scene, ctx));
  }, [renderer, step, bijection, ctx]);

  if (!bijection || !step.scene) return null;

  const [leftBox, rightBox] = matchScale(
    renderer.viewportOf(step.scene, ctx),
    renderer.viewportOf(bijection.scene, ctx),
  );

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
        role="img"
        aria-label={altText}
        onPointerMove={onPoint}
        onPointerLeave={() => setActive(null)}
      />
      <figcaption>{label}</figcaption>
    </figure>
  );

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
