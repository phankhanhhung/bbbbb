import type { Viewport } from '@combviz/schema';
import {
  decorationAttrs,
  decorationForAny,
  fillForClass,
  keyed,
  text,
  type RenderContext,
  type SvgNode,
} from '@combviz/render';
import { SPACING, type GraphModel } from './graph.js';

/** Cạnh ô ma trận. Bằng khoảng cách đỉnh chuẩn (G-10) nên hai view cùng tỉ lệ. */
export const MATRIX_CELL = SPACING;

/**
 * Id của một ô ma trận (GR-07).
 *
 * Ô là chỗ **vẽ** của một cặp đỉnh, và cặp ấy tồn tại dù có cạnh nối hay không —
 * nên ô phải có id riêng, khác id cạnh. Nhờ vậy narrative neo được vào "ô $(2,3)$
 * đang trống" (ANC-01), và sandbox bấm được vào một ô chưa có cạnh để **thêm**
 * cạnh: đó là chiều còn thiếu của "đồng bộ hai chiều".
 */
/**
 * Khoá tra ô trong bảng `at`, **không** phải id của ô.
 *
 * Tồn tại vì bản trước ghép chuỗi bằng một ký tự NUL viết thẳng trong template.
 * Nó chạy đúng, nhưng nó **vô hình**: `grep` coi cả file là nhị phân, và ai gõ
 * lại `${u} ${v}` bằng dấu cách sẽ tra trượt im lặng — trả `undefined` như thể
 * cặp đỉnh ấy không có cạnh. Đã mất một vòng gỡ lỗi vì đúng chuyện đó.
 *
 * Ký tự phân tách chỉ cần khác mọi ký tự hợp lệ trong `EntityId`
 * (`^[A-Za-z][A-Za-z0-9_-]*$`), nên dấu cách vừa đủ mà lại đọc được.
 */
export function matrixCellKey(u: string, v: string): string {
  return `${u} ${v}`;
}

export function matrixCellId(u: string, v: string): string {
  return `mx-${u}-${v}`;
}

/** Ô ma trận nằm dưới một điểm, hoặc `null` nếu điểm rơi ngoài bảng. */
export function matrixCellAt(
  graph: GraphModel,
  point: { x: number; y: number },
): { u: string; v: string } | null {
  const ids = graph.vertices.map((v) => v.id);
  const row = Math.floor(point.y / MATRIX_CELL);
  const col = Math.floor(point.x / MATRIX_CELL);
  if (row < 0 || col < 0 || row >= ids.length || col >= ids.length) return null;
  return { u: ids[row] as string, v: ids[col] as string };
}
const PADDING = 4;
/** Chỗ cho nhãn hàng và nhãn cột. */
const LABEL_ROOM = MATRIX_CELL * 1.4;

/**
 * Ma trận kề (GR-07).
 *
 * Ô $(u,v)$ chỉ về **cạnh** nối chúng qua `data-el`, không mang một id tổng hợp
 * riêng. Nhờ vậy anchor, highlight và `emphasis` viết một lần là đúng cho cả hai
 * view — và một bài có thể đặt hai view cạnh nhau (PRN-04) mà không khai thêm
 * ánh xạ nào, vì hai bên vốn cùng một tập element.
 *
 * Cạnh bội: ô hiện **số cạnh**, không phải một dấu tick. Đồ thị bội là thứ engine
 * này cố ý giữ (§5.1), nên ma trận của nó phải nói được điều đó; ô mang id của
 * cạnh **đầu tiên** giữa hai đỉnh, đủ để trỏ tới, và con số nói phần còn lại.
 */
export function matrixCells(graph: GraphModel): {
  readonly ids: readonly string[];
  /** `matrixCellKey(u, v)` → { count, edge } cho mọi cặp có cạnh. */
  readonly at: ReadonlyMap<string, { count: number; edge: string }>;
  readonly degree: ReadonlyMap<string, number>;
} {
  const ids = graph.vertices.map((v) => v.id);
  const at = new Map<string, { count: number; edge: string }>();

  const bump = (a: string, b: string, edge: string): void => {
    const key = matrixCellKey(a, b);
    const cell = at.get(key);
    if (cell) cell.count += 1;
    else at.set(key, { count: 1, edge });
  };

  for (const edge of graph.edges) {
    bump(edge.u, edge.v, edge.id);
    // Đồ thị vô hướng cho ma trận đối xứng; khuyên chỉ đếm một lần ở ô chéo,
    // vì hai lần sẽ làm tổng hàng khác bậc đỉnh đúng ở chỗ khuyên.
    if (edge.u !== edge.v && !edge.directed) bump(edge.v, edge.u, edge.id);
  }

  return { ids, at, degree: graph.degree };
}

export function matrixViewport(graph: GraphModel, showSums: boolean): Viewport {
  const n = Math.max(1, graph.vertices.length);
  const sumRoom = showSums ? MATRIX_CELL * 1.2 : 0;
  return {
    x: -PADDING - LABEL_ROOM,
    y: -PADDING - LABEL_ROOM,
    width: n * MATRIX_CELL + LABEL_ROOM + sumRoom + PADDING * 2,
    height: n * MATRIX_CELL + LABEL_ROOM + sumRoom + PADDING * 2,
  };
}

export function renderMatrix(
  graph: GraphModel,
  ctx: RenderContext,
  showSums: boolean,
): SvgNode[] {
  const { ids, at } = matrixCells(graph);
  const nodes: SvgNode[] = [];
  const labelOf = (id: string): string => graph.byId.get(id)?.label ?? id;

  ids.forEach((id, i) => {
    nodes.push(
      cellLabel(i * MATRIX_CELL + MATRIX_CELL / 2, -MATRIX_CELL * 0.45, labelOf(id), 'middle', ctx),
      cellLabel(-MATRIX_CELL * 0.35, i * MATRIX_CELL + MATRIX_CELL / 2, labelOf(id), 'end', ctx),
    );
  });

  ids.forEach((u, r) => {
    ids.forEach((v, c) => {
      const cell = at.get(matrixCellKey(u, v));
      const box = {
        x: c * MATRIX_CELL,
        y: r * MATRIX_CELL,
        width: MATRIX_CELL,
        height: MATRIX_CELL,
        stroke: ctx.theme.surface.guide,
        'stroke-width': ctx.theme.stroke.hairline,
      };

      if (!cell) {
        // Ô trống **có** key kể từ GR-07: nó là chỗ vẽ của một cặp đỉnh, và cặp ấy
        // tồn tại dù chưa có cạnh. Trước đó nó vô danh, nên sandbox không bấm vào
        // được và narrative không neo vào được — mà "ô này trống" là đúng thứ mà
        // một lập luận đếm hai chiều cần chỉ ra.
        nodes.push(
          keyed(matrixCellId(u, v), 'rect', {
            ...box,
            fill: ctx.theme.surface.neutral,
            // "Ô này trống" là một khẳng định mà lập luận đếm hai chiều cần chỉ
            // tay vào, nên ô trống phải neo được y như ô có cạnh. Trước đây nó có
            // key mà không có trang trí — neo vào thì im lặng.
            ...decorationAttrs(ctx, matrixCellId(u, v)),
          }),
        );
        return;
      }

      // Nền cho ô **có** cạnh, vẽ trước rồi mới phủ màu lên.
      //
      // Trông thừa ở khung tĩnh — ô màu che kín nó — nhưng màu ô là thứ **tắt
      // được**: chế độ điểm danh giữ ô ở `opacity: 0` cho tới lượt cặp ấy được
      // gọi. Không có nền thì mỗi ô chưa tới lượt là một lỗ trắng không viền, và
      // cái lưới trông như thủng chứ không như đang chờ được điền. Nền không đeo
      // `data-el` nên không pha nào chạm tới nó — lưới đứng yên suốt lượt.
      nodes.push(keyed(`${matrixCellId(u, v)}__bg`, 'rect', { ...box, fill: ctx.theme.surface.neutral }));

      const edge = graph.edges.find((e) => e.id === cell.edge);
      // Key **duy nhất** cho từng ô, nhưng `data-el` chỉ về cùng một cạnh: ô
      // $(u,v)$ và ô $(v,u)$ là hai chỗ vẽ của một element. Trùng key thì diff
      // và nội suy gộp chúng làm một, và ô dưới sẽ trượt ngang qua bảng mỗi lần
      // chuyển step. Tra trang trí theo `cell.edge` nên nhấn một cạnh vẫn sáng
      // **cả hai** ô — đó là "đồng bộ hai chiều" mà GR-07 đòi.
      // Key là id **ô**, `data-el` là id **cạnh**. Hai vai khác nhau: key giữ cho
      // diff và nội suy không gộp ô $(u,v)$ với ô $(v,u)$ làm một (gộp thì ô dưới
      // trượt ngang qua bảng mỗi lần chuyển step), còn `data-el` khiến nhấn một
      // cạnh sáng **cả hai** ô — chiều "cạnh → ma trận" của GR-07.
      nodes.push(
        keyed(matrixCellId(u, v), 'rect', {
          ...box,
          fill: fillForClass(ctx, edge && edge.colorClass > 0 ? edge.colorClass : 1),
          'data-el': cell.edge,
          // **Cả hai** danh tính, không phải chọn một: neo vào cạnh thì sáng cả
          // hai ô đối xứng (chiều "cạnh → ma trận" của GR-07), neo vào ô thì
          // sáng đúng ô ấy ("ô $(2,3)$ tô đậm"). Trước đây chỉ id cạnh có tác
          // dụng, và id ô — thứ mà `implicitElementIds` khai ra để anchor trỏ
          // vào — im lặng.
          ...decorationForAny(ctx, [cell.edge, matrixCellId(u, v)], edge?.emphasis),
        }),
      );

      if (cell.count > 1) {
        nodes.push(
          cellLabel(
            c * MATRIX_CELL + MATRIX_CELL / 2,
            r * MATRIX_CELL + MATRIX_CELL / 2,
            String(cell.count),
            'middle',
            ctx,
            ctx.theme.surface.canvas,
          ),
        );
      }
    });
  });

  if (showSums) {
    let total = 0;
    ids.forEach((id, i) => {
      const degree = graph.degree.get(id) ?? 0;
      total += degree;
      nodes.push(
        cellLabel(
          ids.length * MATRIX_CELL + MATRIX_CELL * 0.4,
          i * MATRIX_CELL + MATRIX_CELL / 2,
          String(degree),
          'start',
          ctx,
        ),
      );
    });

    // Tổng cả bảng = $2|E|$. Bổ đề bắt tay, hiện ra thành một con số đọc được
    // thay vì một công thức phải tin.
    nodes.push(
      cellLabel(
        ids.length * MATRIX_CELL + MATRIX_CELL * 0.4,
        ids.length * MATRIX_CELL + MATRIX_CELL * 0.5,
        `Σ ${total}`,
        'start',
        ctx,
      ),
    );
  }

  // Tay cầm cho **đỉnh**: một dải phủ hàng, một dải phủ cột.
  //
  // Ở view này đỉnh không có hình riêng — nó chỉ là hai chữ ngoài lề, mà chữ ấy
  // là `text()` trần. Hệ quả: anchor trỏ vào `v1` không làm sáng gì, và
  // `adjacency-matrix-handshake` s2 neo đúng vào đó ("Tổng theo **hàng** $i$ đếm
  // số cạnh chạm đỉnh $i$"). Câu ấy nói về cả hàng, nên cả hàng phải sáng —
  // viền quanh mỗi chữ số thì đúng kỹ thuật mà trật ý.
  //
  // Hàng **và** cột, không phải chỉ hàng: ma trận đối xứng, và "mỗi cạnh hiện ra
  // ở hai ô" là chính điều bài này chứng minh. Sáng cả hai dải nói ra điều đó.
  //
  // `fill: 'none'` chứ không `'transparent'` — khác chỗ `set` cố ý chọn ngược
  // lại. Tay cầm ở đó cần **nhận con trỏ**; ở đây thì không, vì một hình trong
  // suốt nằm đè lên bảng sẽ nuốt mọi cú rê chuột vào ô và làm hỏng phép tra
  // ngược của view song ánh. Nó chỉ cần mang được halo.
  const span = ids.length * MATRIX_CELL;
  ids.forEach((id, i) => {
    nodes.push(
      keyed(id, 'rect', {
        x: 0,
        y: i * MATRIX_CELL,
        width: span,
        height: MATRIX_CELL,
        fill: 'none',
        ...decorationAttrs(ctx, id, graph.byId.get(id)?.emphasis),
      }),
      keyed(`mx-col-${id}`, 'rect', {
        x: i * MATRIX_CELL,
        y: 0,
        width: MATRIX_CELL,
        height: span,
        fill: 'none',
        'data-el': id,
        ...decorationAttrs(ctx, id, graph.byId.get(id)?.emphasis),
      }),
    );
  });

  return nodes;
}

function cellLabel(
  x: number,
  y: number,
  content: string,
  anchor: 'start' | 'middle' | 'end',
  ctx: RenderContext,
  fill?: string,
): SvgNode {
  return text(
    'text',
    {
      x,
      y,
      'text-anchor': anchor,
      'dominant-baseline': 'middle',
      'font-family': ctx.theme.type.mathFamily,
      'font-size': MATRIX_CELL * 0.38,
      'font-style': 'italic',
      fill: fill ?? ctx.theme.emphasis.focusHalo,
    },
    content,
  );
}
