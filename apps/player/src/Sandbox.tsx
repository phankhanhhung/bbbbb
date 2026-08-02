import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  allocateId,
  applySelection,
  command,
  modeFromEvent,
  SELECT_TOOL,
  trailFull,
  trailRows,
  type Selection,
  type Trail,
} from '@combviz/editor';
import {
  createContext,
  sceneBoxStyle,
  type LabelAtlas,
  createRenderer,
  toSvgString,
  watermarkNodes,
} from '@combviz/render';
import { patch } from '@combviz/render/dom';
import { colorClass, defaultTheme } from '@combviz/theme';
import type { Invariant, Scene, SceneValidator } from '@combviz/schema';
import type { LoadedEngine } from './engines.js';
import { useSandbox } from './useSandbox.js';
import { renderMath } from './math.js';

/**
 * Sandbox (SBX-01/02, PRN-01, BD-01..03, BD-06).
 *
 * Chế độ tự do thao tác: người học đặt quân, tô ô, và **thấy ngay** ràng buộc nào
 * bị vi phạm và đại lượng bất biến có đứng yên không. Đây là tính năng phân biệt
 * chính so với đọc lời giải tĩnh — nên nó phải phản hồi từng thao tác, không phải
 * từng lần bấm "kiểm tra".
 */
interface SandboxProps {
  scene: Scene;
  engine: LoadedEngine;
  validators: readonly SceneValidator[];
  invariants: readonly Invariant[];
  goalExpr?: string;
  /** D-07 — bảng nhãn LaTeX; `null` khi bài không có công thức trong canvas. */
  labels?: LabelAtlas | null;
  onClose?: () => void;
  /**
   * Báo ra **số thế đã thử** mỗi khi vết chân dài thêm.
   *
   * Sandbox thay cả màn hình (`Player` return sớm), nên bản đồ lời giải và bản đồ
   * vết chân **chưa bao giờ cùng ở trên màn** — đó là chỗ đề xuất "một bản đồ, hai
   * lớp" vấp phải. Cách nối rẻ và trung thực: sandbox kể lại chuyến đi bằng một
   * con số, `Player` giữ nó, và bản đồ lời giải mọc một **nhánh ma** ở đúng bước
   * đã bấm "Thử từ đây". Không chép 40 chấm sang một bản đồ 7 chấm — chỗ này cả
   * lượt vẫn giữ một luật: một tín hiệu, không phải một hoa văn.
   */
  onTrail?: (states: number) => void;
}

/**
 * Công cụ đang bật — chỉ giữ **id**; mọi thứ khác đọc từ danh sách engine khai.
 *
 * Trước đây chỗ này là một union gõ cứng (`paint`/`tile`/`flip`/`combine`/…) và
 * thanh công cụ hiện y hệt nhau ở cả bảy engine — trong đó năm engine không có
 * lệnh nào khớp, nên bấm vào là im lặng không xảy ra gì. Xem
 * `packages/editor/src/tool.ts`.
 */
type ToolState = { readonly id: string };

export function Sandbox({
  scene,
  engine,
  validators,
  invariants,
  goalExpr,
  labels,
  onClose,
  onTrail,
}: SandboxProps) {
  const renderer = useMemo(() => createRenderer([engine.renderer]), [engine]);

  const sandbox = useSandbox({
    initialScene: scene,
    commands: engine.commands,
    validators,
    invariants,
    goalExpr,
    environmentFor: engine.environment,
  });

  const [tool, setTool] = useState<ToolState>({ id: SELECT_TOOL.id });
  const svgRef = useRef<SVGSVGElement>(null);
  const painting = useRef<Set<string> | null>(null);
  /** Phần tử đã chọn cho thao tác cần **hai** đối tượng (gộp, nối cạnh, đổi chỗ). */
  const pending = useRef<string | null>(null);

  const { state } = sandbox;

  // Báo ra sau **mỗi** lần vết chân dài thêm, không phải lúc đóng: người học có thể
  // rời sandbox bằng nút back của trình duyệt, và một tín hiệu chỉ phát lúc đóng
  // đúng cách là một tín hiệu mất đúng lúc cần nhất.
  const states = state.trail.nodes.size;
  useEffect(() => onTrail?.(states), [states, onTrail]);

  // Danh sách công cụ là hàm của **scene hiện tại**, không phải của bài: bốc hết
  // một đống thì nước "bốc 5" biến mất khỏi thanh công cụ ngay lúc đó.
  const tools = useMemo(
    () => engine.sandboxTools(state.scene),
    [engine, state.scene],
  );
  const action = useMemo(
    () => tools.find((t) => t.id === tool.id)?.action ?? SELECT_TOOL.action,
    [tools, tool],
  );

  // Công cụ đang bật biến mất khỏi danh sách thì rơi về "Chọn". Giữ lại một id
  // không còn tồn tại nghĩa là mọi cú bấm sau đó rơi vào hư không — đúng cái lỗi
  // mà cả lớp này sinh ra để dẹp.
  useEffect(() => {
    if (!tools.some((t) => t.id === tool.id)) {
      pending.current = null;
      setTool({ id: SELECT_TOOL.id });
    }
  }, [tools, tool]);

  const ctx = useMemo(
    () =>
      createContext(defaultTheme, {
        highlight: state.selection,
        invalid: state.violations,
        ...(labels ? { labels } : {}),
      }),
    [state.selection, state.violations, labels],
  );

  const viewport = renderer.viewportOf(state.scene, ctx);

  useEffect(() => {
    const container = svgRef.current;
    if (!container) return;
    // Sandbox patch thẳng, không animate: thao tác của chính mình phải phản hồi
    // tức thì. Animation 360ms ở đây làm kéo thả có cảm giác trượt và trễ.
    patch(container, renderer.render(state.scene, ctx));
  }, [renderer, state.scene, ctx]);

  const toScenePoint = useCallback((event: PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: viewport.x + ((event.clientX - rect.left) / rect.width) * viewport.width,
      y: viewport.y + ((event.clientY - rect.top) / rect.height) * viewport.height,
    };
  }, [viewport]);

  const hitsAt = useCallback(
    (event: PointerEvent): string[] => {
      const point = toScenePoint(event);
      return point ? engine.hitTest(state.scene, point) : [];
    },
    [engine, state.scene, toScenePoint],
  );

  /**
   * Điều phối **một** cú bấm theo `action` mà engine khai.
   *
   * Toàn bộ tri thức riêng của từng engine — tên lệnh, tên tham số, tiền tố id —
   * nằm ở phía engine. Chỗ này chỉ biết bảy dạng tương tác, và cả bảy đều là
   * hình thức thao tác chứ không phải nội dung toán.
   */
  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      event.preventDefault();
      (event.currentTarget as Element).setPointerCapture(event.pointerId);

      const hits = hitsAt(event);
      const pick = (prefix?: string): string | undefined =>
        prefix === undefined
          ? hits.find((id) => !id.startsWith('cell-')) ?? hits[0]
          : hits.find((id) => id.startsWith(prefix));

      if (action.type === 'select') {
        const mode = modeFromEvent(event);
        const hit = pick();
        sandbox.setSelection(
          applySelection(state.selection, hit ? [hit] : [], mode) as Selection,
        );
        return;
      }

      if (action.type === 'paint') {
        // Gom cả nét quét thành **một** lệnh: undo phải hoàn tác cả vệt tô, không
        // phải từng ô một.
        const hit = pick(action.prefix);
        painting.current = new Set(hit ? [hit] : []);
        return;
      }

      const target = pick(
        action.type === 'one' || action.type === 'stamp' ? action.prefix : undefined,
      );

      if (action.type === 'one' && target) {
        sandbox.run(
          command(action.command, {
            ...(action.params ?? {}),
            // Id cấp ở đây, không để lệnh tự sinh (ENG-01) — kể cả khi cú bấm này
            // hoá ra là một cú **xoá** và id không được dùng tới.
            ...(action.allocParam && action.allocPrefix
              ? { [action.allocParam]: allocateId(sandbox.state.scene, action.allocPrefix) }
              : {}),
            [action.idParam]: action.asList ? [target] : target,
          }),
        );
        return;
      }

      if (action.type === 'count' && target) {
        sandbox.run(
          command(action.command, {
            [action.idParam]: target,
            [action.countParam]: action.count,
          }),
        );
        return;
      }

      if (action.type === 'stamp' && target) {
        const [row, col] = target.slice('cell-'.length).split('-').map(Number);
        sandbox.run(
          command(action.command, {
            ...(action.params ?? {}),
            [action.idParam]: allocateId(state.scene, action.idPrefix),
            [action.posParam]: [row ?? 0, col ?? 0],
          }),
        );
        return;
      }

      // Bấm vào một ô để lật **cả** hàng/cột chứa nó. Người học không tô được
      // từng ô một ở đây — và đó chính là điều làm bất biến trở thành bất biến:
      // luật của bài nằm trong thao tác, không nằm trong lời dặn.
      if (action.type === 'line') {
        const cell = pick('cell-');
        if (!cell) return;
        const [row, col] = cell.slice('cell-'.length).split('-').map(Number);
        sandbox.run(
          command(action.command, {
            axis: action.axis,
            index: action.axis === 'row' ? (row ?? 0) : (col ?? 0),
          }),
        );
        return;
      }

      // Thao tác hai bước: bấm phần tử thứ nhất, rồi phần tử thứ hai. Không
      // kéo-thả, vì trên cảm ứng kéo một đống sỏi sang đống khác là cử chỉ rất dễ
      // trượt tay — mà lỡ tay ở đây nghĩa là gộp nhầm và mất mạch lập luận.
      // Hai chạm: lần đầu chọn vật, lần sau chọn ô đích. Vật và ô đích lọc bằng
      // **hai** tiêu chí khác nhau, nên không dùng chung `target` ở trên được.
      if (action.type === 'move') {
        const holding = pending.current;
        if (holding === null) {
          const picked = hits.find((id) => !id.startsWith(action.prefix));
          if (!picked) return;
          pending.current = picked;
          sandbox.setSelection(new Set([picked]) as Selection);
          return;
        }
        const destination = hits.find((id) => id.startsWith(action.prefix));
        pending.current = null;
        sandbox.setSelection(new Set() as Selection);
        if (!destination) return;
        const [row, col] = destination.slice(action.prefix.length).split('-').map(Number);
        sandbox.run(
          command(action.command, {
            [action.idParam]: holding,
            [action.posParam]: [row ?? 0, col ?? 0],
          }),
        );
        return;
      }

      if (action.type === 'two' && target) {
        const first = pending.current;
        if (first === null) {
          pending.current = target;
          sandbox.setSelection(new Set([target]) as Selection);
          return;
        }
        pending.current = null;
        sandbox.setSelection(new Set() as Selection);
        if (first === target) return;

        sandbox.run(
          command(action.command, {
            ...(action.extra ?? {}),
            ...(action.idParam
              ? { [action.idParam]: allocateId(state.scene, action.idPrefix ?? 'x') }
              : {}),
            [action.params[0]]: first,
            [action.params[1]]: target,
          }),
        );
      }
    },
    [action, hitsAt, sandbox, state.scene, state.selection],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!painting.current || action.type !== 'paint') return;
      const prefix = action.prefix;
      const hit = hitsAt(event).find((id) =>
        prefix === undefined ? !id.startsWith('cell-') : id.startsWith(prefix),
      );
      if (hit) painting.current.add(hit);
    },
    [action, hitsAt],
  );

  const onPointerUp = useCallback(() => {
    const picked = painting.current;
    painting.current = null;
    if (!picked || picked.size === 0 || action.type !== 'paint') return;

    sandbox.run(
      command(action.command, {
        ...(action.params ?? {}),
        // Nét quét tạo element mới thì id cấp ở đây, không để lệnh tự sinh (ENG-01).
        ...(action.idParam && action.idPrefix
          ? { [action.idParam]: allocateId(sandbox.state.scene, action.idPrefix) }
          : {}),
        [action.idsParam]: [...picked],
      }),
    );
  }, [action, sandbox]);

  /**
   * SBX-01 — **bảng nước đi tại chỗ đang chọn** (M65).
   *
   * Không phải một công cụ trên thanh: thanh công cụ là danh sách *cố định theo scene*,
   * còn nước đi đại số phụ thuộc **nút đang chọn** — $(x+1)^2$ khai triển được, $x+1$
   * thì không. Nhét 72 luật lên thanh là bày 70 nút bấm vào không làm gì.
   *
   * Dựng trên chính cơ chế **chọn** sẵn có, nên không thêm một cử chỉ nào: bấm một cây
   * con là đã có bảng. Engine không khai `moves` thì panel không mọc ra.
   */
  const selectedId = state.selection.size === 1 ? ([...state.selection][0] as string) : null;
  const moves = useMemo(
    () => (engine.moves && selectedId !== null ? engine.moves(state.scene, selectedId) : []),
    [engine, state.scene, selectedId],
  );
  /** Luật đang chờ tham số, và chữ người học đang gõ. */
  const [argFor, setArgFor] = useState<string | null>(null);
  const [argText, setArgText] = useState('');
  /** Lời từ chối **nguyên văn** của lần thử gần nhất. */
  const [refusal, setRefusal] = useState<string | null>(null);

  // Đổi chỗ chọn thì bỏ cả ô nhập lẫn lời từ chối: chúng nói về nút cũ.
  useEffect(() => {
    setArgFor(null);
    setArgText('');
    setRefusal(null);
  }, [selectedId, state.scene]);

  const runMove = useCallback(
    (rule: string, arg?: string) => {
      const at = selectedId === null ? null : (engine.pathOf?.(state.scene, selectedId) ?? null);
      if (at === null || !engine.moveCommand) return;
      const params = { at, rule, ...(arg !== undefined && arg !== '' ? { arg } : {}) };

      // Hỏi **trước** rồi mới chạy: `CommandDef.apply` trả `null` khi hỏng và `null`
      // không mang chữ, mà chữ ở đây chính là phần dạy học. Hai đường cùng gọi một hàm
      // thuần trong engine nên không lệch nhau được.
      const why = engine.moveRefusal?.(state.scene, params) ?? null;
      setRefusal(why);
      if (why !== null) return;

      setArgFor(null);
      setArgText('');
      sandbox.run(command(engine.moveCommand, params));
    },
    [engine, sandbox, selectedId, state.scene],
  );

  /** Lệnh xoá của engine này, đọc từ công cụ nó khai — không đoán tên `board/*`. */
  const removeCommand = useMemo(() => {
    for (const item of tools) {
      if (item.action.type === 'one' && item.action.asList && /remove/.test(item.action.command)) {
        return item.action.command;
      }
    }
    return null;
  }, [tools]);

  /** Lệnh xoay của engine này, đọc từ công cụ nó khai — không đoán tên `board/*`. */
  const rotateCommand = useMemo(() => {
    for (const item of tools) {
      if (item.action.type === 'one' && /rotate/.test(item.action.command)) {
        return item.action.command;
      }
    }
    return null;
  }, [tools]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // Đang gõ trong một ô nhập (panel "Nước đi tại đây" có ô tham số) thì mọi
      // phím thuộc về ô đó: Ctrl+Z là undo *văn bản*, không phải undo sandbox —
      // undo sandbox đổi scene, effect dọn `argFor/argText`, và form biến mất
      // ngay giữa lúc đang gõ.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) sandbox.redo();
        else sandbox.undo();
      }
      // Phím tắt cũng phải hỏi engine. Trước đây `Delete` luôn gọi `board/remove`
      // và `R` luôn gọi `board/rotate-tile`, kể cả trên đồ thị hay chuỗi biến đổi
      // — nơi hai lệnh ấy không tồn tại, nên phím bấm xong không có gì xảy ra.
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selection.size === 0 || !removeCommand) return;
        event.preventDefault();
        sandbox.run(command(removeCommand, { ids: [...state.selection] }));
      }
      // …và phím `R` cũng vậy. Chú thích ngay trên nói phím tắt "phải hỏi engine",
      // nhưng chỉ `Delete` được sửa; `R` vẫn gõ cứng `board/rotate-tile` suốt từ
      // đó. Nay nó tra trong danh sách công cụ, đúng như câu chú thích hứa.
      if (event.key.toLowerCase() === 'r' && state.selection.size === 1 && rotateCommand) {
        sandbox.run(command(rotateCommand, { id: [...state.selection][0], delta: 90 }));
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [engine, removeCommand, rotateCommand, sandbox, state.selection]);

  const exportSvg = useCallback(() => {
    // REN-03: brand mark đóng vào mọi export và người học không tắt được.
    // Xuất SVG (SBX-06) phải dùng **cùng ngữ cảnh** đang hiển thị, nếu không thì
    // file tải về thiếu hẳn công thức mà màn hình đang có.
    const svg = toSvgString(renderer.render(state.scene, ctx), {
      viewport,
      background: defaultTheme.surface.canvas,
      overlay: watermarkNodes(defaultTheme, viewport),
    });
    download(new Blob([svg], { type: 'image/svg+xml' }), 'combviz-sandbox.svg');
  }, [renderer, state.scene, viewport]);

  const summary = engine.colorSummary?.(state.scene) ?? new Map<number, number>();
  const cover = engine.coverage?.(state.scene);

  return (
    <section class="sandbox">
      <header class="sandbox__bar">
        <div class="tools">
          {/* Thanh công cụ **là** danh sách engine khai, không phải bản chép tay.
              Nút nào hiện ra thì lệnh sau nó chắc chắn nằm trong registry của
              engine đang mở — đó là toàn bộ điểm của `SandboxTool`. */}
          {tools.map((item) =>
            item.swatch === undefined ? (
              <ToolButton
                key={item.id}
                active={item.action.type !== 'run' && tool.id === item.id}
                onClick={() => {
                  pending.current = null;
                  // `run` chạy ngay và **không** trở thành công cụ đang bật: nó
                  // là một thao tác, không phải một chế độ.
                  if (item.action.type === 'run') {
                    sandbox.run(command(item.action.command, item.action.params ?? {}));
                    return;
                  }
                  setTool({ id: item.id });
                }}
              >
                {item.label}
              </ToolButton>
            ) : (
              <button
                key={item.id}
                class={`swatch${tool.id === item.id ? ' swatch--on' : ''}`}
                style={{ background: colorClass(item.swatch).fill }}
                title={`${item.label} (${colorClass(item.swatch).name})`}
                aria-label={item.label}
                onClick={() => {
                  pending.current = null;
                  setTool({ id: item.id });
                }}
              />
            ),
          )}
        </div>

        <div class="tools">
          <ToolButton onClick={sandbox.undo} disabled={!state.canUndo}>
            ↶ Hoàn tác
          </ToolButton>
          <ToolButton onClick={sandbox.redo} disabled={!state.canRedo}>
            ↷ Làm lại
          </ToolButton>
          <ToolButton onClick={exportSvg}>Xuất SVG</ToolButton>
          {onClose ? <ToolButton onClick={onClose}>Đóng</ToolButton> : null}
        </div>
      </header>

      <div class="sandbox__body">
        <div class="canvas">
          <svg
            ref={svgRef}
            viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
            // Sandbox chỉ có **một** scene, nên nó là scene rộng nhất của chính
            // nó — tỉ lệ vẫn là 44px một ô, khớp đúng cỡ mà step gốc đang hiện.
            style={sceneBoxStyle(viewport, viewport.width)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>

        <aside class="sandbox__side">
          {state.goalReached !== null ? (
            <p class={`badge ${state.goalReached ? 'badge--done' : 'badge--todo'}`}>
              {state.goalReached ? '✓ Đạt mục tiêu' : 'Chưa đạt mục tiêu'}
            </p>
          ) : null}

          {engine.moves ? (
            <section class="moves">
              <h3>Nước đi tại đây</h3>
              {selectedId === null ? (
                <p class="moves__hint">Chạm một phần của dòng cuối để xem áp được luật nào.</p>
              ) : moves.length === 0 ? (
                <p class="moves__hint">Không luật nào áp được ở đây.</p>
              ) : (
                <ul class="moves__list">
                  {moves.map((move) => (
                    <li key={move.id}>
                      <button
                        class="moves__item"
                        onClick={() => {
                          if (move.needsArg) {
                            setArgFor(argFor === move.id ? null : move.id);
                            setArgText('');
                            setRefusal(null);
                          } else {
                            runMove(move.id);
                          }
                        }}
                      >
                        {move.label}
                        {move.needsArg ? ' …' : ''}
                      </button>
                      {argFor === move.id ? (
                        <form
                          class="moves__arg"
                          onSubmit={(event: Event) => {
                            event.preventDefault();
                            runMove(move.id, argText);
                          }}
                        >
                          <input
                            autoFocus
                            value={argText}
                            aria-label={`Tham số cho ${move.label}`}
                            onInput={(event: Event) =>
                              setArgText((event.target as HTMLInputElement).value)
                            }
                          />
                          <button type="submit">Chạy</button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {refusal !== null ? <p class="moves__refusal">{refusal}</p> : null}
            </section>
          ) : null}

          {/* SBX-02: ràng buộc đang áp, bật/tắt được để "nới luật" khi thí nghiệm. */}
          <section class="constraints">
            <h3>Ràng buộc</h3>
            {state.validators.map(({ validator, enabled, outcome }) => (
              <label key={validator.id} class="constraint">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => sandbox.toggleValidator(validator.id)}
                />
                <span class="constraint__label">{validator.label}</span>
                <span
                  class={`constraint__state${
                    !enabled ? ' is-off' : outcome.ok ? ' is-ok' : ' is-bad'
                  }`}
                >
                  {!enabled ? 'tắt' : outcome.ok ? '✓' : (outcome.message ?? '✗')}
                </span>
              </label>
            ))}
          </section>

          {/* PRN-01: đại lượng bất biến chạy live *trong lúc* người học nghịch. */}
          {state.invariantValues.length > 0 ? (
            <section class="constraints">
              <h3>Bất biến</h3>
              {state.invariantValues.map(({ invariant, value }) => (
                <div key={invariant.id} class="constraint">
                  <span
                    class="constraint__label"
                    dangerouslySetInnerHTML={{ __html: renderMath(invariant.label.vi) }}
                  />
                  <span class="constraint__value">{value ?? '—'}</span>
                </div>
              ))}
            </section>
          ) : null}

          {/* BD-06 + BD-03: đếm theo màu và độ phủ, cập nhật theo từng thao tác. */}
          <section class="constraints">
            <h3>Đếm</h3>
            {cover ? (
              <div class="constraint">
                <span class="constraint__label">Đã phủ</span>
                <span class="constraint__value">
                  {cover.covered} / {cover.total}
                </span>
              </div>
            ) : null}
            {[...summary.entries()].sort(([a], [b]) => a - b).map(([index, count]) => (
              <div key={index} class="constraint">
                <span class="constraint__label">
                  <span class="dot" style={{ background: colorClass(index).fill }} /> màu{' '}
                  {index}
                </span>
                <span class="constraint__value">{count}</span>
              </div>
            ))}
          </section>

          <TrailMap trail={state.trail} onJump={sandbox.jumpTo} />

          {state.lastLabel ? <p class="diagnostics">vừa xong: {state.lastLabel}</p> : null}
        </aside>
      </div>
    </section>
  );
}

/** Bán kính một chấm, và khoảng cách giữa hai chấm — cả bản đồ chỉ có hai số này. */
const DOT = 5;
const GAP = 22;

/**
 * SBX-06 — **bản đồ vết chân** (M75).
 *
 * Mỗi chấm là một thế người học đã đứng; mỗi nét là một nước đi họ đã làm. Chấm
 * viền đậm là chỗ đang đứng, chấm tô đặc là chỗ đã quay lại (`visits > 1`), chạm
 * một chấm là **đứng về đó**.
 *
 * Nó cố ý nghèo thông tin. Không màu nào nghĩa là "gần lời giải", không nhãn nào
 * nói "ngõ cụt", không mũi tên nào gợi ý đi tiếp đâu — NG-03 nguyên vẹn. Mọi thứ
 * trên hình này là thứ chính người học vừa tạo ra, và nó trả lời đúng một câu:
 * *"chỗ này mình thử rồi à?"*
 *
 * Vẽ bằng SVG thô chứ không qua `createRenderer`: đây không phải một scene, không
 * có element nào, không có anchor nào trỏ vào. Kéo cả bộ máy render vào để vẽ mười
 * cái chấm là trả một cái giá cho một thứ không dùng.
 */
function TrailMap({ trail, onJump }: { trail: Trail; onJump: (id: string) => void }) {
  const rows = trailRows(trail);
  if (rows.length <= 1) return null;

  const width = Math.max(...rows.map((row) => row.length));
  const at = new Map<string, { x: number; y: number }>();
  rows.forEach((row, depth) => {
    row.forEach((node, i) => {
      // Căn giữa từng hàng: một cây rẽ hai nhánh mà dồn trái thì đọc thành một
      // dòng có gai, không thành một chỗ rẽ.
      at.set(node.id, {
        x: (i - (row.length - 1) / 2) * GAP + ((width - 1) / 2) * GAP + DOT * 2,
        y: depth * GAP + DOT * 2,
      });
    });
  });

  const w = (width - 1) * GAP + DOT * 4;
  const h = (rows.length - 1) * GAP + DOT * 4;

  return (
    <section class="constraints trail">
      <h3>Đã đi qua</h3>
      <svg class="trail__map" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img"
        aria-label={`Bản đồ vết chân: ${trail.nodes.size} thế đã tới`}>
        {[...trail.nodes.values()].flatMap((node) =>
          node.out.map((edge) => {
            const a = at.get(node.id);
            const b = at.get(edge.to);
            if (!a || !b) return null;
            return (
              <line
                key={`${node.id}-${edge.to}`}
                class="trail__edge"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
              />
            );
          }),
        )}
        {[...trail.nodes.values()].map((node) => {
          const p = at.get(node.id) as { x: number; y: number };
          const here = node.id === trail.at;
          return (
            <circle
              key={node.id}
              class={`trail__dot${here ? ' is-here' : ''}${node.visits > 1 ? ' is-again' : ''}`}
              cx={p.x}
              cy={p.y}
              r={DOT}
              role="button"
              tabIndex={0}
              aria-label={
                here
                  ? 'đang ở đây'
                  : node.visits > 1
                    ? `đã tới ${node.visits} lần — quay về`
                    : 'quay về chỗ này'
              }
              onClick={() => onJump(node.id)}
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') onJump(node.id);
              }}
            />
          );
        })}
      </svg>
      {trailFull(trail) ? (
        <p class="trail__note">Bản đồ đã đầy — vẫn nghịch tiếp được, chỉ không ghi thêm.</p>
      ) : null}
    </section>
  );
}

function ToolButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: unknown;
}) {
  return (
    <button
      class={`tool${active ? ' tool--on' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children as never}
    </button>
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
