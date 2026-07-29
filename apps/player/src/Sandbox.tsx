import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  allocateId,
  applySelection,
  command,
  modeFromEvent,
  type Selection,
} from '@combviz/editor';
import {
  createContext,
  createRenderer,
  toSvgString,
  watermarkNodes,
} from '@combviz/render';
import { patch } from '@combviz/render/dom';
import { colorClass, defaultTheme, MAX_COLOR_CLASS } from '@combviz/theme';
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
  onClose?: () => void;
}

type Tool =
  | { kind: 'select' }
  | { kind: 'paint'; colorClass: number | null }
  | { kind: 'tile'; shape: string }
  | { kind: 'erase' }
  /** G-11 — lật cả một hàng/cột, thao tác hợp lệ của họ bài "lật dấu". */
  | { kind: 'flip'; axis: 'row' | 'col' };

const TILE_SHAPES = ['domino', 'tromino-l', 'tetromino-o', 'tetromino-t'] as const;

export function Sandbox({
  scene,
  engine,
  validators,
  invariants,
  goalExpr,
  onClose,
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

  const [tool, setTool] = useState<Tool>({ kind: 'paint', colorClass: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const painting = useRef<Set<string> | null>(null);

  const { state } = sandbox;
  const viewport = renderer.viewportOf(state.scene);

  const ctx = useMemo(
    () =>
      createContext(defaultTheme, {
        highlight: state.selection,
        invalid: state.violations,
      }),
    [state.selection, state.violations],
  );

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

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      event.preventDefault();
      (event.currentTarget as Element).setPointerCapture(event.pointerId);

      const hits = hitsAt(event);
      const cell = hits.find((id) => id.startsWith('cell-'));
      const element = hits.find((id) => !id.startsWith('cell-'));

      if (tool.kind === 'paint') {
        // Gom cả nét quét thành **một** lệnh: undo phải hoàn tác cả vệt tô, không
        // phải từng ô một.
        painting.current = new Set(cell ? [cell] : []);
        return;
      }

      if (tool.kind === 'erase' && element) {
        sandbox.run(command('board/remove', { ids: [element] }));
        return;
      }

      // Bấm vào một ô để lật **cả** hàng/cột chứa nó. Người học không tô được
      // từng ô một ở đây — và đó chính là điều làm bất biến trở thành bất biến:
      // luật của bài nằm trong thao tác, không nằm trong lời dặn.
      if (tool.kind === 'flip' && cell) {
        const [row, col] = cell.slice('cell-'.length).split('-').map(Number);
        sandbox.run(
          command('board/flip-line', {
            axis: tool.axis,
            index: tool.axis === 'row' ? (row ?? 0) : (col ?? 0),
          }),
        );
        return;
      }

      if (tool.kind === 'tile' && cell) {
        const [row, col] = cell.slice('cell-'.length).split('-').map(Number);
        sandbox.run(
          command('board/place-tile', {
            id: allocateId(state.scene, 't'),
            shape: tool.shape,
            pos: [row ?? 0, col ?? 0],
          }),
        );
        return;
      }

      if (tool.kind === 'select') {
        const mode = modeFromEvent(event);
        sandbox.setSelection(
          applySelection(state.selection, element ? [element] : [], mode) as Selection,
        );
      }
    },
    [hitsAt, sandbox, state.scene, state.selection, tool],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!painting.current) return;
      const cell = hitsAt(event).find((id) => id.startsWith('cell-'));
      if (cell) painting.current.add(cell);
    },
    [hitsAt],
  );

  const onPointerUp = useCallback(() => {
    const cells = painting.current;
    painting.current = null;
    if (!cells || cells.size === 0 || tool.kind !== 'paint') return;

    sandbox.run(
      command('board/paint-cells', { cells: [...cells], color_class: tool.colorClass }),
    );
  }, [sandbox, tool]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) sandbox.redo();
        else sandbox.undo();
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selection.size === 0) return;
        event.preventDefault();
        sandbox.run(command('board/remove', { ids: [...state.selection] }));
      }
      if (event.key.toLowerCase() === 'r' && state.selection.size === 1) {
        sandbox.run(command('board/rotate-tile', { id: [...state.selection][0], delta: 90 }));
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [sandbox, state.selection]);

  const exportSvg = useCallback(() => {
    // REN-03: brand mark đóng vào mọi export và người học không tắt được.
    const svg = toSvgString(renderer.render(state.scene, createContext(defaultTheme)), {
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
          <ToolButton active={tool.kind === 'select'} onClick={() => setTool({ kind: 'select' })}>
            Chọn
          </ToolButton>

          {Array.from({ length: MAX_COLOR_CLASS }, (_, i) => i + 1).map((index) => (
            <button
              key={index}
              class={`swatch${
                tool.kind === 'paint' && tool.colorClass === index ? ' swatch--on' : ''
              }`}
              style={{ background: colorClass(index).fill }}
              title={`Tô màu ${index} (${colorClass(index).name})`}
              aria-label={`Tô màu ${index}`}
              onClick={() => setTool({ kind: 'paint', colorClass: index })}
            />
          ))}
          <ToolButton
            active={tool.kind === 'paint' && tool.colorClass === null}
            onClick={() => setTool({ kind: 'paint', colorClass: null })}
          >
            Xoá màu
          </ToolButton>

          {TILE_SHAPES.map((shape) => (
            <ToolButton
              key={shape}
              active={tool.kind === 'tile' && tool.shape === shape}
              onClick={() => setTool({ kind: 'tile', shape })}
            >
              {shape}
            </ToolButton>
          ))}

          <ToolButton active={tool.kind === 'erase'} onClick={() => setTool({ kind: 'erase' })}>
            Xoá quân
          </ToolButton>

          {(['row', 'col'] as const).map((axis) => (
            <ToolButton
              key={axis}
              active={tool.kind === 'flip' && tool.axis === axis}
              onClick={() => setTool({ kind: 'flip', axis })}
            >
              ⇄ Lật {axis === 'row' ? 'hàng' : 'cột'}
            </ToolButton>
          ))}
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

          {state.lastLabel ? <p class="diagnostics">vừa xong: {state.lastLabel}</p> : null}
        </aside>
      </div>
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
