import type { Choreography, Scene } from '@combviz/schema';
import { nodeAt, walk, type Expr, type TermId } from './expr.js';
import { elementId, evidenceId, layout, noteId, type Layout } from './layout.js';
import { readAlgebra, type AlgebraModel } from './model.js';

/**
 * Choreography **sinh ra từ model** (AL-06) — không do tác giả gõ.
 *
 * Đặc tả §10 khai mục này từ đầu và nó chưa từng được cài. Hậu quả đo được: 39/39
 * step dùng engine đại số **không có một pha nào**, tức mọi hình đại số trong kho là
 * ảnh tĩnh — cả bộ máy timeline, nhãn pha và `hold` của M48 chưa chạm tới engine mới
 * nhất. Tác giả gõ tay thì cũng vô lý: chuỗi biến đổi là thứ engine *tính ra*, nên
 * nhịp của nó cũng phải suy ra từ đó, không thì hai bên lệch nhau ngay lần sửa đầu.
 *
 * ## Suy từ **hình dạng kết quả**, không từ bảng tên luật
 *
 * `model` đã ghi sẵn mọi thứ cần để kể chuyện, và ghi bằng cấu trúc chứ không bằng
 * tên: `at` là cây con bị áp luật, `trace` nói nút cũ đi đâu (rỗng = biến mất, một =
 * đi tiếp, nhiều = **tách ra**), `born` là nút mới. Một bảng `rule.id → kiểu chuyển
 * động` sẽ quên luật thứ 42; đọc cấu trúc thì luật mới có nhịp đúng ngay hôm nó ra
 * đời. Cùng bài học với `out.guard`/`out.binding` ở chốt canh M50.
 *
 * ## `move` phải lật chiều mới dùng được (CHO-12)
 *
 * Trong một chuỗi biến đổi **mọi dòng đều ở lại trên màn hình**. `move` bản đầu chỉ
 * biết "bay **tới**" một đích rồi đậu ở đó, nên cho hạng tử dòng $k$ bay xuống dòng
 * $k+1$ sẽ đục một lỗ vào dòng $k$. M51 vì thế bỏ hẳn `move` và kể bằng `focus` đồng
 * thời ở hai dòng.
 *
 * M53 thêm `from` vào lược đồ pha — một đổi thay ở tầng **dùng chung cho chín
 * engine**, nên nó là quyết định của chính chủ chứ không phải việc lén nhét vào một
 * engine. Với `from` thì bản ở dòng dưới xuất phát từ chỗ của bản dòng trên rồi về chỗ
 * của mình: không ai mất gì, và lời hứa của `TermId` bền (DAT-11/12) — "$e_2$ ở dòng
 * ba đúng là nút $e_2$ của dòng một" — được nói ra thành chuyển động.
 */

const STEP_MS = 1400;
const FOCUS_MS = 420;
const REVEAL_MS = 420;

/** Mọi danh tính vẽ ra trong một dòng. */
function idsOfRow(box: Layout, rowIndex: number): string[] {
  const line = box.lines[rowIndex];
  if (line === undefined) return [];
  return [...new Set(line.boxes.map((b) => b.id))];
}

/**
 * Cùng danh sách ấy nhưng **theo thứ tự đọc** — trái sang phải.
 *
 * Để dòng tự viết ra thì thứ tự bật phải là thứ tự mắt đi. Sắp theo mép trái của hộp
 * bao; nút cha bao trùm nút con nên nó bật trước, và thế là đúng: cái ngoặc hiện trước
 * ruột của nó.
 */
function orderedIds(box: Layout, rowIndex: number): string[] {
  const line = box.lines[rowIndex];
  if (line === undefined) return [];
  const seen = new Set<string>();
  return [...line.boxes]
    .sort((a, b) => a.x - b.x || b.width - a.width)
    .filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
    .map((b) => b.id);
}

/** Hạng tử này có được vẽ ở dòng ấy không. */
const boxIn = (box: Layout, rowIndex: number, term: string): boolean =>
  box.lines[rowIndex]?.boxes.some((b) => b.id === elementId(rowIndex, term)) ?? false;

/** `TermId` của mọi nút trong một cây con. */
function termsIn(e: Expr): Set<TermId> {
  const out = new Set<TermId>();
  walk(e, (n) => out.add(n.id));
  return out;
}

/**
 * Hạng tử ở dòng `rowIndex` **thật sự được vẽ** mang tên nào.
 *
 * Lọc qua `boxes` chứ không dựng tên từ `TermId`: nút có trong cây mà không có mực
 * (hệ số $1$ bị bỏ ở tầng hiển thị chẳng hạn) thì tên nó không trỏ vào đâu, và một
 * pha nhắm vào đó là một pha im lặng không làm gì — đúng loại lỗi mà chốt canh
 * `element-identity` sinh ra để chặn.
 */
function drawnAmong(box: Layout, rowIndex: number, terms: ReadonlySet<TermId>): string[] {
  const drawn = new Set(idsOfRow(box, rowIndex));
  return [...terms].map((t) => elementId(rowIndex, t)).filter((id) => drawn.has(id));
}

export interface AlgebraChoreographyOptions {
  /** Khoá anchor để mọi pha neo vào (CHO-07). Kho hiện dùng `a1` ở 39/39 step. */
  readonly anchor?: string;
}

/**
 * Sinh timeline cho một scene đại số. `undefined` khi không có gì để kể.
 */
export function algebraChoreography(
  scene: Scene,
  options: AlgebraChoreographyOptions = {},
): Choreography | undefined {
  const model = readAlgebra(scene);
  if (model.refusal !== null || model.rows.length < 2) return undefined;
  return choreographyOf(model, layout(model), options.anchor ?? 'a1');
}

/** Bản nhận sẵn model và layout — để chốt canh khỏi dựng lại hai lần. */
export function choreographyOf(
  model: AlgebraModel,
  box: Layout,
  anchor: string,
): Choreography | undefined {
  const phases: NonNullable<Choreography>['phases'][number][] = [];
  const push = (p: (typeof phases)[number]): void => {
    phases.push(p);
  };

  for (let k = 1; k < model.rows.length; k += 1) {
    const row = model.rows[k] as (typeof model.rows)[number];
    const prev = model.rows[k - 1] as (typeof model.rows)[number];
    const t = (k - 1) * STEP_MS;

    // 1. **Chỗ sắp đổi**, sáng lên ở dòng trên — và dừng lại ở đây.
    //
    // `hold` đặt đúng chỗ này chứ không rải đều: đây là khoảnh khắc người đọc cần để
    // nhìn ra *vì sao* luật áp được. Bấm tiếp thì dòng mới mới hiện. Không bao giờ
    // rơi vào pha cuối (luôn còn pha "hiện dòng" phía sau), nên không mắc lỗi
    // `hold-at-end` mà M48 đã đặt luật.
    const target = nodeAt(prev.expr, row.at);
    const changing = target === null ? [] : drawnAmong(box, k - 1, termsIn(target));
    if (changing.length > 0) {
      push({
        id: `s${k}-focus`,
        kind: 'focus',
        targets: changing.slice(0, 200),
        at: t,
        duration: FOCUS_MS,
        anchor,
        label: { vi: row.note ?? row.ruleLabel ?? 'biến đổi' },
        hold: true,
      });
    }

    // 2. Nút **biến mất** thì mờ đi trước khi dòng mới hiện — nếu không thì người đọc
    //    chỉ thấy dòng sau ngắn hơn mà không biết cái gì đã đi.
    const gone = drawnAmong(
      box,
      k - 1,
      new Set([...row.trace].filter(([, to]) => to.length === 0).map(([from]) => from)),
    );
    if (gone.length > 0) {
      push({
        id: `s${k}-gone`,
        kind: 'dim',
        targets: gone.slice(0, 200),
        at: t + FOCUS_MS,
        duration: 260,
        anchor,
      });
    }

    // 2a. **Mờ phần không đổi** của dòng trên. Mắt khỏi phải đi tìm: chỗ nào còn sáng
    //     là chỗ luật đang chạm vào.
    //
    //     Chúng **ở lại mờ** — và đó là chủ ý, không phải thiếu sót. Không có `show`
    //     để bật lại: một pha `show` ép độ hiện về $0$ ở mọi khung *trước* mốc của nó
    //     (đó là cách `applyChoreography` làm cho "hiện ra" có nghĩa), nên dùng nó để
    //     khôi phục sẽ xoá sạch dòng ấy khỏi khung đầu. Để nguyên thì các dòng đã xong
    //     nhạt dần về phía trên, và sự chú ý đi xuống theo lời giải.
    const changingSet = new Set(changing);
    const goneSet = new Set(gone);
    const settled = idsOfRow(box, k - 1).filter((id) => !changingSet.has(id) && !goneSet.has(id));
    if (settled.length > 0 && changing.length > 0) {
      push({
        id: `s${k}-rest`,
        kind: 'dim',
        targets: settled.slice(0, 200),
        at: t,
        duration: FOCUS_MS,
        anchor,
      });
    }

    // 2b. **Ngoặc nhóm và gạch triệt tiêu** hiện cùng lúc với chỗ sắp đổi — chúng nói
    //     về dòng trên, nên phải có mặt *trước* khi dòng dưới xuất hiện.
    const marks = [
      ...box.explain.braces.filter((g) => g.step === k).map((g) => g.id),
      ...box.explain.strikes.filter((s) => s.step === k).map((s) => s.id),
    ];
    if (marks.length > 0) {
      push({
        id: `s${k}-mark`,
        kind: 'show',
        targets: marks.slice(0, 200),
        at: t + FOCUS_MS * 0.5,
        duration: 300,
        anchor,
      });
    }

    // 3. Dòng mới **tự viết ra**: chia thành nhiều pha lệch nhau theo thứ tự đọc thay
    //    vì bật cả dòng một lượt. Không cần primitive mới — chỉ là mấy pha `show` so
    //    le — mà cảm giác khác hẳn: mắt đi theo nét viết thay vì bị dội một mảng chữ.
    //
    //    **Kèm tên dòng** ở lô đầu, vì nhãn luật đeo danh tính ấy; thiếu nó thì khung
    //    đầu bày sẵn tên mọi phép biến đổi trong khi mới có một dòng.
    const arriving = orderedIds(box, k);
    if (arriving.length > 0) {
      const batches = Math.min(4, arriving.length);
      const size = Math.ceil(arriving.length / batches);
      for (let b = 0; b < batches; b += 1) {
        const slice = arriving.slice(b * size, (b + 1) * size);
        if (slice.length === 0) continue;
        push({
          id: `s${k}-line${b}`,
          kind: 'show',
          // Lô đầu kéo theo **tên dòng** (nhãn luật đeo danh tính ấy) và **chấm chứng
          // cứ** (M64). Thiếu một trong hai thì khung đầu bày sẵn thứ thuộc về một
          // dòng chưa tồn tại — lỗi đã xảy ra hai lần, cùng một hình dạng, và cả hai
          // lần chỉ lộ ở lượt nhìn khung 0 chứ không ở test nào.
          targets: (b === 0
            ? [
                box.lines[k]?.box.id ?? `row${k}`,
                // Chỉ khi chấm ấy **thật sự được vẽ**: dòng không có nhãn luật, hoặc
                // bước không hợp đồng kiểm nào chạy, thì không có chấm nào — và một
                // pha nhắm vào tên không tồn tại là một pha im lặng không làm gì.
                ...(box.explain.evidence.some((d) => d.step === k) ? [evidenceId(k)] : []),
                ...slice,
              ]
            : slice
          ).slice(0, 200),
          at: t + FOCUS_MS + 180 + b * 90,
          duration: REVEAL_MS,
          anchor,
          ...(b === 0 ? { label: { vi: `dòng ${k + 1}` } } : {}),
        });
      }
    }

    // 3a. **Hạng tử đi tiếp thì bay xuống từ chỗ cũ của nó** (CHO-12).
    //
    //     Đây là thứ M51 phải bỏ vì `move` khi ấy chỉ biết "bay **tới**": lấy bản ở
    //     dòng trên đi thì dòng trên thủng một lỗ, mà trong một chuỗi biến đổi mọi
    //     dòng đều ở lại. `from` lật đúng chiều — bản ở dòng dưới xuất phát từ chỗ của
    //     bản dòng trên rồi về chỗ của mình, và không ai mất gì.
    //
    //     Chỉ những hạng tử **giữ nguyên danh tính** mới bay: đó chính là lời hứa của
    //     `TermId` bền (DAT-11/12), và bay là cách nói lời hứa ấy ra thành hình.
    const carried = idsOfRow(box, k)
      .map((id) => ({ id, term: id.slice(id.indexOf('-') + 1) }))
      .filter(({ term }) => boxIn(box, k - 1, term))
      .map(({ id, term }) => ({ id, from: elementId(k - 1, term) }));
    for (const [i, c] of carried.slice(0, 60).entries()) {
      push({
        id: `s${k}-fly${i}`,
        kind: 'move',
        targets: [c.id],
        from: c.from,
        at: t + FOCUS_MS + 180,
        duration: REVEAL_MS + 160,
        anchor,
      });
    }

    // 3b. Sợi nối hiện **sau** dòng mới: chúng nối hai đầu, nên đầu kia phải có mặt đã.
    const threads = box.explain.threads.filter((th) => th.step === k).map((th) => th.id);
    if (threads.length > 0) {
      push({
        id: `s${k}-thread`,
        kind: 'show',
        targets: threads.slice(0, 200),
        at: t + FOCUS_MS + 180 + REVEAL_MS,
        duration: 320,
        anchor,
      });
    }

    // 4. Chuyện riêng của bước này, đọc từ **cấu trúc** `trace`:
    //    một nút ra nhiều bản ⇒ nhân bản; nhiều nút về một ⇒ nhập lại; còn lại ⇒ mới.
    //    Cả ba đều tô sáng **đồng thời** nguồn ở dòng trên và đích ở dòng dưới, vì đó
    //    là cách duy nhất nói "hai chỗ này là một vật" khi không có `move`.
    const split = [...row.trace].filter(([, to]) => to.length > 1);
    const joined = [...row.trace].filter(([, to]) => to.length === 1);

    const highlight: string[] = [];
    let story: string | null = null;
    if (split.length > 0) {
      story = 'nhân bản';
      for (const [from, to] of split) {
        highlight.push(...drawnAmong(box, k - 1, new Set([from])));
        highlight.push(...drawnAmong(box, k, new Set(to)));
      }
    } else if (joined.length > 1) {
      story = 'gộp lại';
      for (const [from, to] of joined) {
        highlight.push(...drawnAmong(box, k - 1, new Set([from])));
        highlight.push(...drawnAmong(box, k, new Set(to)));
      }
    } else if (row.born.length > 0) {
      story = 'phần mới';
      highlight.push(...drawnAmong(box, k, new Set(row.born)));
    }

    const unique = [...new Set(highlight)];
    if (story !== null && unique.length > 0) {
      push({
        id: `s${k}-story`,
        kind: 'focus',
        targets: unique.slice(0, 200),
        at: t + FOCUS_MS + 180 + REVEAL_MS,
        duration: 360,
        anchor,
        label: { vi: story },
      });
    }
  }

  // Dòng chữ đỏ hiện **sau cùng** cùng sợi nối của nó. Chúng tóm tắt cả chuỗi — điều
  // kiện của một bước, hay món nợ nghiệm ngoại lai — nên bày ra ngay khung đầu là đọc
  // kết luận trước khi nghe kể.
  const noteTargets = box.notes.map((_, i) => noteId(i));

  // Sợi nối dòng điều kiện hiện **sau cùng**: nó nói về cả chuỗi, không về một bước.
  // Trước M52 dòng đỏ ấy lơ lửng dưới hình không dính vào gì — người đọc phải tự đoán
  // "$x - 1 \\ne 0$" đang ràng buộc cái mẫu số nào.
  const links = box.explain.conditionLinks.map((c) => c.id);
  const tail = [...noteTargets, ...links];
  if (tail.length > 0 && phases.length > 0) {
    const end = Math.max(...phases.map((p) => p.at + p.duration));
    push({
      id: 'cond-link',
      kind: 'show',
      targets: tail.slice(0, 200),
      at: end,
      duration: 300,
      anchor,
      label: { vi: 'điều kiện kèm theo' },
    });
  }

  return phases.length === 0 ? undefined : { phases };
}

/** Mọi danh tính mà bộ sinh có thể nhắm tới — dùng cho chốt canh. */
export function choreographyTargets(spec: Choreography): Set<string> {
  const out = new Set<string>();
  for (const p of spec.phases) for (const t of p.targets) out.add(t);
  return out;
}
