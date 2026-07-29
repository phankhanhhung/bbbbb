import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  createContext,
  createRenderer,
  diffNodes,
  type NodeDiff,
  type SceneRenderer,
  type SvgNode,
} from '@combviz/render';
import { animate } from '@combviz/render/dom';
import { defaultTheme } from '@combviz/theme';
import type { Problem, Scene, Step } from '@combviz/schema';
import type { GraphAnalysis } from '@combviz/engine-graph';
import { loadEngines, type LoadedEngine } from './engines.js';
import { Narrative } from './Narrative.jsx';
import { InvariantStrip } from './InvariantStrip.jsx';
import { Sandbox } from './Sandbox.jsx';
import { renderMath } from './math.js';
import { useAnalyzer } from './useAnalyzer.js';
import { GraphFacts } from './GraphFacts.jsx';

/**
 * Walking skeleton của Player (M1).
 *
 * Phạm vi cố ý hẹp: PLY-01 điều khiển cơ bản, PLY-03 narrative + anchor, PLY-04
 * animation sinh từ auto-diff. **Chưa có** tree navigator (PLY-02 ở M5) — ở đây
 * đi theo thứ tự duyệt trước của cây, đủ cho lời giải tuyến tính.
 *
 * Milestone này tồn tại để trả lời ba câu hỏi kiến trúc, không phải để đẹp.
 */
export function Player({ problem }: { problem: Problem }) {
  const [engines, setEngines] = useState<ReadonlyMap<string, LoadedEngine> | null>(null);
  const [index, setIndex] = useState(0);
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const [forkedScene, setForkedScene] = useState<Scene | null>(null);

  const solution = problem.solutions[0]!;
  const steps = useMemo(() => preorder(solution.steps), [solution]);
  const step = steps[index] ?? steps[0]!;

  const svgRef = useRef<SVGSVGElement>(null);
  const previous = useRef<SvgNode[]>([]);
  const lastStepId = useRef<string | null>(null);

  useEffect(() => {
    void loadEngines(problem.engines_used).then(setEngines);
  }, [problem]);

  const renderer = useMemo<SceneRenderer | null>(
    () => (engines ? createRenderer([...engines.values()].map((e) => e.renderer)) : null),
    [engines],
  );

  // Đường đi từ gốc tới step hiện tại — cơ sở của sparkline (G-04): invariant
  // được đọc dọc theo *nhánh đang xem*, không phải toàn bộ solution.
  const path = useMemo(() => pathTo(solution.steps, step.id), [solution, step]);

  const environmentFor = useMemo(
    () => (scene: Scene) => engines?.get(scene.engine)?.environment(scene) ?? null,
    [engines],
  );

  const [diff, setDiff] = useState<NodeDiff | null>(null);

  // ENG-04: analyzer nặng chạy trong worker, cache theo hash scene, huỷ được.
  const analysis = useAnalyzer<GraphAnalysis>(
    step.scene?.engine === 'graph' ? step.scene : undefined,
  );

  // Highlight là **đầu vào của render**, không phải lớp sửa DOM sau đó (ANC-01).
  // Nhờ vậy nó sống sót qua mọi khung animation và không có hai nguồn sự thật.
  const ctx = useMemo(
    () =>
      createContext(defaultTheme, {
        highlight: new Set(
          activeAnchor ? (step.anchors?.[activeAnchor]?.ids ?? []) : [],
        ),
      }),
    [activeAnchor, step],
  );

  useEffect(() => {
    const container = svgRef.current;
    if (!renderer || !container || !step.scene) return;

    const next = renderer.render(step.scene, ctx);
    setDiff(diffNodes(previous.current, next));

    // Chỉ animate khi *step* đổi. Bật/tắt highlight thì patch thẳng: chuyển tiếp
    // 360ms cho một cái viền làm anchor có cảm giác trễ và dính.
    const isStepChange = previous.current.length > 0 && lastStepId.current !== step.id;
    const handle = animate(container, previous.current, next, {
      durationMs: isStepChange ? defaultTheme.motion.stepDurationMs : 0,
    });

    previous.current = next;
    lastStepId.current = step.id;

    return () => handle.cancel();
  }, [renderer, step, ctx]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        setIndex((i) => Math.min(i + 1, steps.length - 1));
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [steps.length]);

  const viewport = renderer && step.scene ? renderer.viewportOf(step.scene) : null;

  const engine = step.scene ? engines?.get(step.scene.engine) : undefined;
  const sandboxValidators = useMemo(
    () =>
      engine
        ? (problem.sandbox?.validators ?? [])
            .map((id) => engine.resolveValidator(id))
            .filter((v): v is NonNullable<typeof v> => v !== null)
        : [],
    [engine, problem],
  );

  // PLY-05 "Thử từ đây": fork scene hiện tại sang Sandbox **mà không phá trạng
  // thái Player** — đóng lại là quay về đúng step đang xem. Đây là cầu nối
  // học-bằng-nghịch, và nó chỉ có nghĩa nếu đường quay lại không mất gì.
  if (forkedScene && engine) {
    return (
      <div class="player">
        <header class="player__head">
          <h1 dangerouslySetInnerHTML={{ __html: renderMath(problem.statement.vi) }} />
          <p class="source">Thử từ bước {step.id} — thao tác ở đây không đổi lời giải</p>
        </header>
        <Sandbox
          scene={forkedScene}
          engine={engine}
          validators={sandboxValidators}
          invariants={problem.invariants ?? []}
          {...(problem.sandbox?.goal_expr ? { goalExpr: problem.sandbox.goal_expr } : {})}
          onClose={() => setForkedScene(null)}
        />
      </div>
    );
  }

  return (
    <div class="player">
      <header class="player__head">
        <h1 dangerouslySetInnerHTML={{ __html: renderMath(problem.statement.vi) }} />
        <p class="source">
          {problem.source.contest}
          {problem.source.year ? ` ${problem.source.year}` : ''} · {problem.license}
        </p>
      </header>

      <div class="player__body">
        <div class="canvas">
          <svg
            ref={svgRef}
            viewBox={
              viewport
                ? `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`
                : '0 0 100 100'
            }
            role="img"
            aria-label={step.alt_text?.vi ?? ''}
          />
        </div>

        <aside class="side">
          {step.narrative ? (
            <Narrative
              text={step.narrative.vi}
              activeAnchor={activeAnchor}
              onAnchor={setActiveAnchor}
            />
          ) : null}

          {problem.invariants?.length ? (
            <InvariantStrip
              invariants={problem.invariants}
              path={path}
              environmentFor={environmentFor}
            />
          ) : null}

          {step.scene?.engine === 'graph' ? <GraphFacts state={analysis} /> : null}

          {step.edge_type === 'contradiction' ? (
            <p class="badge badge--contradiction">✗ Mâu thuẫn — nhánh đóng</p>
          ) : null}

          <nav class="controls">
            <button
              class="try"
              onClick={() => step.scene && setForkedScene(step.scene)}
              disabled={!engine}
            >
              Thử từ đây
            </button>
          </nav>

          <nav class="controls">
            <button onClick={() => setIndex((i) => Math.max(i - 1, 0))} disabled={index === 0}>
              ← Trước
            </button>
            <span class="counter">
              {index + 1} / {steps.length}
            </span>
            <button
              onClick={() => setIndex((i) => Math.min(i + 1, steps.length - 1))}
              disabled={index === steps.length - 1}
            >
              Sau →
            </button>
          </nav>

          {/* Bảng đo của M1: mỗi bước phải cho thấy auto-diff thật sự nhận ra
              chuyện gì đã xảy ra, chứ không vẽ lại cả bàn. */}
          {diff ? (
            <p class="diagnostics">
              auto-diff: thêm {diff.entered.length} · mất {diff.exited.length} · đổi{' '}
              {diff.changed.length}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/**
 * Đường đi từ gốc tới một step, theo `parent`.
 *
 * Bỏ qua `merge_ref` (G-04): nó là con trỏ quay lại, không phải một bước trên
 * đường đi — tính nó vào sẽ làm sparkline lặp lại một giá trị đã vẽ.
 */
function pathTo(steps: readonly Step[], targetId: string): Step[] {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const chain: Step[] = [];

  let cursor = byId.get(targetId);
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    if (cursor.edge_type !== 'merge_ref') chain.unshift(cursor);
    cursor = cursor.parent ? byId.get(cursor.parent) : undefined;
  }

  return chain;
}

/**
 * Duyệt trước cây lời giải.
 *
 * Tạm thời thay cho tree navigator (PLY-02, M5): với lời giải tuyến tính nó cho
 * đúng thứ tự đọc, còn với lời giải phân nhánh nó cho một thứ tự *hợp lệ* nhưng
 * chưa phải trải nghiệm đúng — người học chưa được chọn nhánh.
 */
function preorder(steps: readonly Step[]): Step[] {
  const children = new Map<string | null, Step[]>();
  for (const step of steps) {
    const list = children.get(step.parent) ?? [];
    list.push(step);
    children.set(step.parent, list);
  }

  const out: Step[] = [];
  const visit = (parent: string | null): void => {
    for (const step of children.get(parent) ?? []) {
      out.push(step);
      visit(step.id);
    }
  };
  visit(null);

  return out;
}
