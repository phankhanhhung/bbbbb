import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createChecker } from '@combviz/check';
import {
  createContext,
  createRenderer,
  sceneBoxStyle,
  widestWidth,
  type LabelAtlas,
} from '@combviz/render';
import ATLAS_JSON from '../../../packages/content/labels.json';
import { patch } from '@combviz/render/dom';
import { defaultTheme } from '@combviz/theme';
import { buildTree, preorder, type Step } from '@combviz/schema';
import { ENGINE_DSL, ENGINE_FRAGMENTS, ENGINE_RENDERERS } from './engines.js';
import { TAXONOMY } from './taxonomy.js';
import { FILE_SYSTEM_SUPPORTED, useProblemFile } from './useProblemFile.js';
import { IssuePanel, pointerToStep } from './IssuePanel.jsx';
import { ReviewPanel } from './ReviewPanel.jsx';
import {
  addChild,
  branchSize,
  createAnchor,
  mapSolution,
  mapStep,
  removeBranch,
} from './edits.js';

/**
 * Studio (AUT-01..06, AUT-09).
 *
 * Phục vụ **đúng một power user**: JSON là first-class, keyboard-first, tối ưu
 * throughput chứ không tối ưu learnability. Không có wizard, không có onboarding
 * — người dùng duy nhất của công cụ này viết ra chính schema mà nó biên tập.
 */
export function App() {
  const file = useProblemFile();
  const problem = file.problem;

  const [solutionId, setSolutionId] = useState<string | null>(null);
  const [stepId, setStepId] = useState<string | null>(null);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [ipadFrame, setIpadFrame] = useState(false);

  const checker = useMemo(
    () => createChecker({ fragments: ENGINE_FRAGMENTS, dsl: ENGINE_DSL, taxonomy: TAXONOMY }),
    [],
  );
  const renderer = useMemo(() => createRenderer(ENGINE_RENDERERS), []);
  // Studio nạp cả bộ, kể cả bảng nhãn: tác giả đang soạn thì phải thấy đúng thứ
  // người học sẽ thấy, không phải một khung "thiếu atlas".
  const ctx = useMemo(
    () =>
      createContext(defaultTheme, {
        highlight: new Set(picked),
        labels: ATLAS_JSON as unknown as LabelAtlas,
      }),
    [picked],
  );

  const solution =
    problem?.solutions.find((s) => s.id === solutionId) ?? problem?.solutions[0];
  const steps = useMemo(
    () => (solution ? preorder(buildTree(solution)) : []),
    [solution],
  );
  const step = steps.find((s) => s.id === stepId) ?? steps[0];

  const issues = useMemo(
    () => (problem ? checker.check(problem) : []),
    [checker, problem],
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const narrativeRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const container = svgRef.current;
    if (!container || !step?.scene) return;
    patch(container, renderer.render(step.scene, ctx));
  }, [renderer, step, ctx]);

  useEffect(() => {
    if (solution && !solutionId) setSolutionId(solution.id);
    if (step && !stepId) setStepId(step.id);
  }, [solution, solutionId, step, stepId]);

  // AUT-06: Ctrl/Cmd+S ghi thẳng vào file trên đĩa.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void file.save();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [file]);

  if (!problem || !solution || !step) {
    return (
      <main class="empty">
        <h1>CombViz Studio</h1>
        <p>
          Công cụ soạn–duyệt, chạy local. Cùng bộ kiểm mà CI chạy (AUT-04).
        </p>
        {FILE_SYSTEM_SUPPORTED ? (
          <button class="primary" onClick={() => void file.open()}>
            Mở file bài…
          </button>
        ) : (
          <>
            <p class="hint">
              Browser này không có File System Access API, nên không ghi thẳng vào
              repo được. Studio dự kiến chạy trên Chrome/Edge desktop (A-2).
            </p>
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const chosen = (event.currentTarget as HTMLInputElement).files?.[0];
                if (chosen) void file.openUpload(chosen);
              }}
            />
          </>
        )}
        {file.error ? <p class="error">{file.error}</p> : null}
      </main>
    );
  }

  const viewport = step.scene ? renderer.viewportOf(step.scene, ctx) : null;

  /** Scene rộng nhất của bài đang soạn — mẫu số của tỉ lệ dùng chung (G-10). */
  const widest = useMemo(
    () =>
      widestWidth(
        (problem?.solutions ?? []).flatMap((solution) =>
          solution.steps
            .map((s) => s.scene)
            .filter((scene): scene is NonNullable<typeof scene> => scene !== undefined)
            .filter((scene) => renderer.has(scene.engine))
            .map((scene) => renderer.viewportOf(scene, ctx)),
        ),
      ),
    [problem, renderer, ctx],
  );
  const elementIds = step.scene?.elements.map((e) => e.id) ?? [];

  const editStep = (fn: (current: Step) => Step): void => {
    file.update(mapStep(problem, solution.id, step.id, fn));
  };

  return (
    <div class="studio">
      <header class="bar">
        <strong>{problem.id}</strong>
        <span class={`chip chip--${problem.status}`}>{problem.status}</span>
        <span class="grow" />
        <span class="filename">
          {file.name}
          {file.dirty ? ' •' : ''}
        </span>
        <button onClick={() => void file.open()}>Mở…</button>
        <button
          class="primary"
          onClick={() => void file.save()}
          disabled={!file.canWriteBack || !file.dirty}
          title="Ctrl/Cmd+S"
        >
          Lưu
        </button>
        <button onClick={file.download}>Tải về</button>
      </header>

      <div class="studio__body">
        <section class="pane pane--canvas">
          {/* AUT-05: preview dùng đúng renderer thật, kèm khung giả lập iPad. */}
          <div class={`frame${ipadFrame ? ' frame--ipad' : ''}`}>
            <svg
              ref={svgRef}
              viewBox={
                viewport
                  ? `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`
                  : '0 0 100 100'
              }
              style={viewport ? sceneBoxStyle(viewport, widest) : undefined}
            />
          </div>
          <label class="toggle">
            <input
              type="checkbox"
              checked={ipadFrame}
              onChange={() => setIpadFrame((v) => !v)}
            />
            Khung iPad 1024×768
          </label>

          <div class="elements">
            <h3>Element trong scene</h3>
            {elementIds.length === 0 ? (
              <p class="hint">Scene chưa có element tường minh.</p>
            ) : (
              <div class="chips">
                {elementIds.map((id) => (
                  <button
                    key={id}
                    class={`chip${picked.includes(id) ? ' chip--on' : ''}`}
                    onClick={() =>
                      setPicked((current) =>
                        current.includes(id)
                          ? current.filter((x) => x !== id)
                          : [...current, id],
                      )
                    }
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section class="pane pane--edit">
          <h2>
            Bước <code>{step.id}</code>{' '}
            <span class="count">{step.edge_type}</span>
          </h2>

          <label class="field">
            <span>Narrative</span>
            <textarea
              ref={narrativeRef}
              rows={6}
              value={step.narrative?.vi ?? ''}
              onInput={(event) =>
                editStep((current) => ({
                  ...current,
                  narrative: { ...current.narrative, vi: (event.currentTarget as HTMLTextAreaElement).value },
                }))
              }
            />
          </label>

          {/* AUT-02: bôi đen đoạn văn, chọn element, tạo anchor. */}
          <button
            disabled={picked.length === 0}
            onClick={() => {
              const area = narrativeRef.current;
              if (!area) return;
              editStep((current) =>
                createAnchor(current, area.selectionStart, area.selectionEnd, picked),
              );
              setPicked([]);
            }}
          >
            Tạo anchor từ đoạn bôi đen ({picked.length} element)
          </button>

          {step.edge_type === 'case' ? (
            <label class="field">
              <span>case_label</span>
              <input
                value={step.case_label?.vi ?? ''}
                placeholder="Trường hợp 2: …"
                onInput={(event) =>
                  editStep((current) => ({
                    ...current,
                    case_label: { vi: (event.currentTarget as HTMLInputElement).value },
                  }))
                }
              />
            </label>
          ) : null}

          <label class="field">
            <span>alt_text</span>
            <input
              value={step.alt_text?.vi ?? ''}
              onInput={(event) =>
                editStep((current) => ({
                  ...current,
                  alt_text: { vi: (event.currentTarget as HTMLInputElement).value },
                }))
              }
            />
          </label>

          {/* AUT-03: thao tác cây. */}
          <div class="ops">
            {(['seq', 'case', 'contradiction', 'merge_ref'] as const).map((kind) => (
              <button
                key={kind}
                onClick={() => {
                  const result = addChild(problem, solution.id, step.id, kind);
                  file.update(result.problem);
                  setStepId(result.stepId);
                }}
              >
                + {kind}
              </button>
            ))}
            <button
              class="danger"
              disabled={step.parent === null}
              onClick={() => {
                const size = branchSize(solution, step.id);
                if (!confirm(`Xoá nhánh này? Mất ${size} bước.`)) return;
                file.update(removeBranch(problem, solution.id, step.id));
                setStepId(step.parent);
              }}
            >
              Xoá nhánh
            </button>
          </div>

          <nav class="steps">
            {steps.map((s) => (
              <button
                key={s.id}
                class={`step${s.id === step.id ? ' step--on' : ''}${
                  s.verified ? ' step--ok' : ''
                }`}
                onClick={() => setStepId(s.id)}
              >
                {s.id}
              </button>
            ))}
          </nav>
        </section>

        <section class="pane pane--check">
          <IssuePanel
            issues={issues}
            onJump={(pointer) => {
              const target = pointerToStep(pointer);
              if (!target) return;
              const targetSolution = problem.solutions[target.solutionIndex];
              const targetStep = targetSolution?.steps[target.stepIndex];
              if (targetSolution && targetStep) {
                setSolutionId(targetSolution.id);
                setStepId(targetStep.id);
              }
            }}
          />

          <ReviewPanel
            problem={problem}
            currentStepId={step.id}
            onSelect={(sol, id) => {
              setSolutionId(sol);
              setStepId(id);
            }}
            onToggleVerified={(sol, id, verified) =>
              file.update(mapStep(problem, sol, id, (current) => ({ ...current, verified })))
            }
            onPublish={() => file.update({ ...problem, status: 'published' })}
          />

          <section class="panel">
            <h2>Solution</h2>
            {problem.solutions.map((s) => (
              <button
                key={s.id}
                class={`step${s.id === solution.id ? ' step--on' : ''}`}
                onClick={() => {
                  setSolutionId(s.id);
                  setStepId(s.steps[0]?.id ?? null);
                }}
              >
                {s.id}
              </button>
            ))}
            <button
              onClick={() =>
                file.update(
                  mapSolution(problem, solution.id, (s) => ({
                    ...s,
                    label: { vi: s.label?.vi ?? s.id },
                  })),
                )
              }
              hidden
            />
          </section>
        </section>
      </div>
    </div>
  );
}
