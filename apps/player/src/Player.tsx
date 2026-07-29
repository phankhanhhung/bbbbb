import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  branchPointAbove,
  buildTree,
  childrenOf,
  isBranchPoint,
  nextStep,
  pathTo,
} from '@combviz/schema';
import type { Problem, Scene, Solution, Step } from '@combviz/schema';
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
import type { GraphAnalysis } from '@combviz/engine-graph';
import { loadEngines, type LoadedEngine } from './engines.js';
import { Narrative } from './Narrative.jsx';
import { InvariantStrip } from './InvariantStrip.jsx';
import { TreeNavigator } from './TreeNavigator.jsx';
import { GraphFacts } from './GraphFacts.jsx';
import { Sandbox } from './Sandbox.jsx';
import { renderMath } from './math.js';
import { useAnalyzer } from './useAnalyzer.js';

const SPEEDS = [0.5, 1, 2] as const;

/**
 * Player (PLY-01..06).
 *
 * Điều hướng theo **cây**, không theo danh sách phẳng: `nextStep` trả `null` ở
 * node rẽ nhánh, nên auto-play tự dừng ở đó mà không cần luật riêng — đúng điều
 * PLY-02 đòi.
 */
export function Player({ problem }: { problem: Problem }) {
  const [engines, setEngines] = useState<ReadonlyMap<string, LoadedEngine> | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const [forkedScene, setForkedScene] = useState<Scene | null>(null);
  const [diff, setDiff] = useState<NodeDiff | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  const initial = useMemo(() => readLocation(problem), [problem]);
  // Chọn lời giải song song (CMS-03) đến ở M6 cùng trang problem; ở đây chỉ đọc
  // từ URL để deep-link vào đúng nhánh vẫn hoạt động (DAT-14).
  const solutionId = initial.solutionId;
  const [stepId, setStepId] = useState(initial.stepId);

  const solution =
    problem.solutions.find((s) => s.id === solutionId) ?? (problem.solutions[0] as Solution);
  const tree = useMemo(() => buildTree(solution), [solution]);
  const step = tree.steps.get(stepId) ?? (tree.root as Step);

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

  const path = useMemo(() => pathTo(tree, step.id), [tree, step]);
  const choices = childrenOf(tree, step.id);
  const branching = isBranchPoint(tree, step.id);
  const upstream = useMemo(() => branchPointAbove(tree, step.id), [tree, step]);

  const environmentFor = useMemo(
    () => (scene: Scene) => engines?.get(scene.engine)?.environment(scene) ?? null,
    [engines],
  );

  const analysis = useAnalyzer<GraphAnalysis>(
    step.scene?.engine === 'graph' ? step.scene : undefined,
  );

  // DAT-14: URL luôn phản ánh vị trí hiện tại, nên mọi bước đều chia sẻ được.
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('sol', solution.id);
    url.searchParams.set('step', step.id);
    history.replaceState(null, '', url);
  }, [solution, step]);

  const goTo = useCallback((id: string) => {
    setStepId(id);
    setActiveAnchor(null);
  }, []);

  const goNext = useCallback(() => {
    const next = nextStep(tree, step.id);
    if (next) goTo(next.id);
    else setPlaying(false);
  }, [tree, step, goTo]);

  const goPrev = useCallback(() => {
    if (step.parent) goTo(step.parent);
  }, [step, goTo]);

  useEffect(() => {
    if (!playing) return;
    const delay = (defaultTheme.motion.stepDurationMs + 1400) / speed;
    const timer = setTimeout(goNext, delay);
    return () => clearTimeout(timer);
  }, [playing, speed, goNext]);

  const ctx = useMemo(
    () =>
      createContext(defaultTheme, {
        highlight: new Set(activeAnchor ? (step.anchors?.[activeAnchor]?.ids ?? []) : []),
      }),
    [activeAnchor, step],
  );

  useEffect(() => {
    const container = svgRef.current;
    if (!renderer || !container || !step.scene) return;

    const next = renderer.render(step.scene, ctx);
    setDiff(diffNodes(previous.current, next));

    const isStepChange = previous.current.length > 0 && lastStepId.current !== step.id;
    const handle = animate(container, previous.current, next, {
      durationMs: isStepChange ? defaultTheme.motion.stepDurationMs / speed : 0,
    });

    previous.current = next;
    lastStepId.current = step.id;
    return () => handle.cancel();
  }, [renderer, step, ctx, speed]);

  // NFR-A2: mọi điều khiển tới được bằng bàn phím.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      } else if (event.key === ' ') {
        event.preventDefault();
        setPlaying((v) => !v);
      } else if (event.key === 'Escape') {
        setPlaying(false);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  const swipeStart = useRef<number | null>(null);
  const onCanvasPointerUp = (event: PointerEvent): void => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (start === null) return;

    // Ngưỡng 48px: dưới mức đó gần như luôn là chạm hụt chứ không phải vuốt, và
    // chuyển step vì một cú chạm hụt là cách nhanh nhất làm mất niềm tin.
    const delta = event.clientX - start;
    if (delta < -48) goNext();
    else if (delta > 48) goPrev();
  };

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
        <div
          class="canvas"
          onPointerDown={(event: PointerEvent) => {
            swipeStart.current = event.clientX;
          }}
          onPointerUp={onCanvasPointerUp}
        >
          <svg
            ref={svgRef}
            viewBox={
              viewport
                ? `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`
                : '0 0 100 100'
            }
            role="img"
            aria-label={step.alt_text?.vi ?? altFallback(step)}
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

          {branching ? (
            <section class="choices">
              <h3>Chọn trường hợp để đi tiếp</h3>
              {choices.map((child) => (
                <button key={child.id} class="choice" onClick={() => goTo(child.id)}>
                  {child.case_label?.vi ?? child.id}
                </button>
              ))}
            </section>
          ) : null}

          {step.edge_type === 'contradiction' ? (
            <p class="badge badge--contradiction">✗ Mâu thuẫn — nhánh đóng</p>
          ) : null}

          {step.edge_type === 'merge_ref' ? (
            <p class="badge badge--merge">↰ Quay về bước tổng hợp</p>
          ) : null}

          {problem.invariants?.length ? (
            <InvariantStrip
              invariants={problem.invariants}
              path={path}
              environmentFor={environmentFor}
            />
          ) : null}

          {step.scene?.engine === 'graph' ? <GraphFacts state={analysis} /> : null}

          <nav class="controls">
            <button onClick={goPrev} disabled={!step.parent} title="Phím ←">
              ← Trước
            </button>
            <button
              class="play"
              onClick={() => setPlaying((v) => !v)}
              disabled={branching}
              title="Phím Space"
            >
              {playing ? '❚❚ Dừng' : '▶ Chạy'}
            </button>
            <button onClick={goNext} disabled={!nextStep(tree, step.id)} title="Phím →">
              Sau →
            </button>
          </nav>

          <nav class="controls">
            {SPEEDS.map((value) => (
              <button
                key={value}
                class={`tool${speed === value ? ' tool--on' : ''}`}
                onClick={() => setSpeed(value)}
              >
                ×{value}
              </button>
            ))}
            <button
              class="tool"
              onClick={() => upstream && goTo(upstream.id)}
              disabled={!upstream}
            >
              ↑ Về điểm rẽ nhánh
            </button>
          </nav>

          <nav class="controls">
            <button
              class="try"
              onClick={() => step.scene && setForkedScene(step.scene)}
              disabled={!engine}
            >
              Thử từ đây
            </button>
          </nav>

          <TreeNavigator tree={tree} currentId={step.id} onSelect={goTo} />

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

/** DAT-14: mở đúng step, đúng nhánh từ URL. */
function readLocation(problem: Problem): { solutionId: string; stepId: string } {
  const params = new URLSearchParams(location.search);
  const solution =
    problem.solutions.find((s) => s.id === params.get('sol')) ??
    (problem.solutions[0] as Solution);

  const wanted = params.get('step');
  const exists = wanted !== null && solution.steps.some((s) => s.id === wanted);
  const root = solution.steps.find((s) => s.parent === null)?.id ?? '';

  return {
    solutionId: solution.id,
    // Deep-link trỏ tới step không tồn tại thì về gốc thay vì trang trắng: link cũ
    // sẽ hỏng khi bài được sửa, và hỏng êm còn hơn hỏng ồn.
    stepId: exists ? wanted : root,
  };
}

/**
 * NFR-A3: `alt_text` do tác giả soạn; vắng thì tóm tắt đếm element theo loại.
 *
 * Fallback tự sinh không cố mô tả *ý nghĩa* — nó không biết. Nó chỉ nói trên hình
 * có gì, và điều đó vẫn hơn một canvas hoàn toàn câm.
 */
function altFallback(step: Step): string {
  if (!step.scene) return '';

  const counts = new Map<string, number>();
  for (const element of step.scene.elements) {
    counts.set(element.type, (counts.get(element.type) ?? 0) + 1);
  }

  const parts = [...counts.entries()].map(([type, count]) => `${count} ${type}`);
  return parts.length > 0 ? `Hình gồm ${parts.join(', ')}.` : 'Hình trống.';
}

export { SPEEDS };
