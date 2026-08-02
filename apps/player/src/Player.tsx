import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  branchPointAbove,
  buildTree,
  childrenOf,
  isBranchPoint,
  nextStep,
  pathTo,
} from '@combviz/schema';
import { renderValueMarkup } from '@combviz/schema';
import type { Problem, Scene, Solution, Step } from '@combviz/schema';
import { tryEvaluate, DETERMINISTIC_BUDGET } from '@combviz/dsl';
import {
  applyChoreography,
  createContext,
  createRenderer,
  diffNodes,
  sceneBoxStyle,
  widestWidth,
  type LabelAtlas,
  type NodeDiff,
  type SceneRenderer,
  type SvgNode,
} from '@combviz/render';
import { animate, patch, ELEMENT_ATTR, KEY_ATTR } from '@combviz/render/dom';
import { defaultTheme } from '@combviz/theme';
import type { GraphAnalysis } from '@combviz/engine-graph';
import { loadEngines, loadLabelAtlas, type LoadedEngine } from './engines.js';
import { Narrative } from './Narrative.jsx';
import { InvariantStrip } from './InvariantStrip.jsx';
import { TreeNavigator } from './TreeNavigator.jsx';
import { GraphFacts } from './GraphFacts.jsx';
import { PlayBoard } from './PlayBoard.jsx';
import { Sandbox } from './Sandbox.jsx';
import { BijectionPanes } from './BijectionPanes.jsx';
import { renderMath } from './math.js';
import { useAnalyzer } from './useAnalyzer.js';
import { Timeline } from './Timeline.jsx';
import { useChoreography } from './useChoreography.js';

const SPEEDS = [0.5, 1, 2] as const;

/** Một tập rỗng dùng chung: `createContext` chỉ đọc, và dựng `new Set()` mỗi khung
 *  làm `useMemo` của `ctx` mất tác dụng — cả scene render lại vì một object mới. */
const EMPTY_HIGHLIGHT: ReadonlySet<string> = new Set();

/**
 * Player (PLY-01..06).
 *
 * Điều hướng theo **cây**, không theo danh sách phẳng: `nextStep` trả `null` ở
 * node rẽ nhánh, nên auto-play tự dừng ở đó mà không cần luật riêng — đúng điều
 * PLY-02 đòi.
 */
export function Player({
  problem,
  onBack,
}: {
  problem: Problem;
  onBack?: () => void;
}) {
  const [engines, setEngines] = useState<ReadonlyMap<string, LoadedEngine> | null>(null);
  const [atlas, setAtlas] = useState<LabelAtlas | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  /** AL-13 — phả hệ của hạng tử vừa chạm; `null` là chưa chạm gì. */
  const [tapped, setTapped] = useState<ReadonlySet<string> | null>(null);
  /** AL-14 — điểm vi phạm của điều kiện vừa chạm. */
  const [incident, setIncident] = useState<string | null>(null);
  const [forkedScene, setForkedScene] = useState<Scene | null>(null);
  /**
   * GM-02 — đang **chơi** thế của step nào (M78.7).
   *
   * Tách khỏi `forkedScene` chứ không dùng chung một cờ: sandbox và bàn chơi là hai chế
   * độ khác nhau về cả ba mặt (nước hợp lệ, undo, lượt), và một biến mang hai nghĩa là
   * chỗ để chúng lẫn nhau vào ngày ai đó mở cái này trong lúc cái kia còn bật.
   */
  const [played, setPlayed] = useState<{ scene: Scene; play: NonNullable<Step['play']> } | null>(
    null,
  );
  // CMS-03: lời giải **che mặc định**. Trang bài mở ra là đề bài và sandbox —
  // người học nên có cơ hội tự nghĩ trước khi thấy lời giải, và một cú bấm là
  // ranh giới đủ để biến việc xem lời giải thành một lựa chọn có ý thức.
  const [revealed, setRevealed] = useState(false);
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
    void loadEngines(problem.engines_used).then(async (loaded) => {
      // Atlas nạp **sau** engine và chỉ khi cần: `loadLabelAtlas` hỏi chính các
      // engine vừa nạp xem có ai vẽ công thức trong canvas không.
      setAtlas(await loadLabelAtlas(loaded));
      setEngines(loaded);
    });
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

  /**
   * Thay `{{expr}}` bằng giá trị tính từ chính scene của step.
   *
   * Làm ở đây chứ không trong `Narrative`: component đó không biết engine nào,
   * và không nên biết. Tính hỏng thì `renderValueMarkup` giữ nguyên markup —
   * `{{expr}}` còn nguyên trên màn hình đập vào mắt ngay, trong khi một câu bị
   * khuyết mất con số đọc như câu bình thường.
   */
  const interpolate = useMemo(() => {
    const env = step.scene ? environmentFor(step.scene) : null;
    return (text: string): string => {
      if (!env) return text;
      return renderValueMarkup(text, (expr) => {
        const outcome = tryEvaluate(expr, env, DETERMINISTIC_BUDGET);
        return outcome.ok && outcome.value !== null && typeof outcome.value !== 'object'
          ? String(outcome.value)
          : null;
      });
    };
  }, [step, environmentFor]);

  const interpolated = interpolate(step.narrative?.vi ?? '');

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
    // Phả hệ nói về **hạng tử của step này**. Mang nó sang step sau thì nó trỏ vào
    // những id không còn tồn tại — một vệt sáng trống, im lặng và vô nghĩa.
    setTapped(null);
    setIncident(null);
  }, []);

  const goNext = useCallback(() => {
    const next = nextStep(tree, step.id);
    if (next) goTo(next.id);
    else setPlaying(false);
  }, [tree, step, goTo]);

  /**
   * Fork sang sandbox dọn nhà y như `goTo`: dừng autoplay và xoá phả hệ/sự cố
   * đang hiện. Không dọn thì hai chuyện xảy ra sau lưng sandbox — autoplay đổi
   * step ngầm, và lúc Đóng, vệt lineage + banner incident của ngữ cảnh cũ hiện
   * lại nguyên xi, nói về một chỗ người dùng đã rời từ lâu.
   */
  const fork = useCallback((scene: Scene) => {
    setPlaying(false);
    setTapped(null);
    setIncident(null);
    setPlayed(null);
    setForkedScene(scene);
  }, []);

  /** Mở bàn chơi. Dọn nhà y hệt `fork`, và cùng lý do. */
  const startPlay = useCallback((scene: Scene, play: NonNullable<Step['play']>) => {
    setPlaying(false);
    setTapped(null);
    setIncident(null);
    setForkedScene(null);
    setPlayed({ scene, play });
  }, []);

  const goPrev = useCallback(() => {
    if (step.parent) goTo(step.parent);
  }, [step, goTo]);

  useEffect(() => {
    if (!playing) return;
    const delay = (defaultTheme.motion.stepDurationMs + 1400) / speed;
    const timer = setTimeout(goNext, delay);
    return () => clearTimeout(timer);
  }, [playing, speed, goNext]);

  /**
   * Timeline **hiệu lực**: tác giả viết tay thì dùng cái ấy, không thì hỏi engine.
   *
   * Thứ tự này là hợp đồng: `step.choreography` luôn thắng, nên một bài muốn nhịp
   * riêng vẫn viết được. Engine chỉ lấp chỗ trống — mà chỗ trống ấy hiện là **39/39**
   * step đại số, tức toàn bộ engine mới nhất đang là ảnh tĩnh.
   */
  const choreography = useMemo(() => {
    if (step.choreography) return step.choreography;
    if (!step.scene) return undefined;
    const engine = engines?.get(step.scene.engine);
    if (!engine?.choreography) return undefined;
    return engine.choreography(step.scene, Object.keys(step.anchors ?? {})[0] ?? 'a1');
  }, [step, engines]);

  const timeline = useChoreography(choreography, speed);

  /**
   * CHO-07 — pha đang chạy sáng đúng câu nó giải thích.
   *
   * Rê chuột thắng timeline: người đọc chủ động chỉ vào một chỗ thì họ đang hỏi
   * về chỗ ấy, và để timeline giật câu sáng đi chỗ khác giữa lúc đó là cướp con
   * trỏ khỏi tay họ.
   */
  const shownAnchor = activeAnchor ?? timeline.anchor;

  /**
   * Ba nguồn cùng nói "nhìn chỗ này", và thứ tự ưu tiên là một quyết định (AL-13).
   *
   * 1. **Rê chuột trên lời kể** — người đọc đang chủ động chỉ vào một câu.
   * 2. **Hạng tử vừa chạm** — họ vừa hỏi "cái này từ đâu ra".
   * 3. **Pha đang chạy** — timeline tự kể.
   *
   * Cùng lý lẽ đã dùng cho `shownAnchor`: thứ người dùng *vừa làm* thắng thứ máy đang
   * tự chạy, vì để timeline giật vệt sáng đi chỗ khác giữa lúc họ đang chỉ là cướp con
   * trỏ khỏi tay họ. Và cả ba đổ vào **cùng một** `ctx.highlight` — không thêm đường
   * render thứ hai, nên vẫn đúng một chỗ quyết định "được nhấn" trông thế nào.
   */
  const highlight = useMemo(() => {
    const ofAnchor = (key: string | null): ReadonlySet<string> | null =>
      key && step.anchors && Object.hasOwn(step.anchors, key)
        ? new Set(step.anchors[key]!.ids)
        : null;
    return ofAnchor(activeAnchor) ?? tapped ?? ofAnchor(timeline.anchor) ?? EMPTY_HIGHLIGHT;
  }, [activeAnchor, tapped, timeline.anchor, step]);

  const ctx = useMemo(
    () =>
      createContext(defaultTheme, {
        highlight,
        ...(atlas ? { labels: atlas } : {}),
        // Mực giải thích chỉ có nghĩa ở chỗ có timeline. Player có; golden và OG card
        // render **không qua** choreography nên ở đó nó sẽ hiện luôn và làm rối ảnh
        // tĩnh của cả kho — vì thế nó là một sự thật về *nơi vẽ*, không phải về scene.
        explain: choreography !== undefined,
      }),
    [highlight, atlas, choreography],
  );

  /**
   * Cây SVG gốc của step — **trước** choreography.
   *
   * Memo hoá vì effect dưới chạy lại mỗi khung rAF khi timeline đang chạy, và
   * render lại cả scene 60 lần một giây chỉ để rồi áp một lớp thuộc tính lên nó
   * là đúng thứ NFR-P2 sẽ bắt được trên iPad chứ không phải trên máy này.
   */
  const baseNodes = useMemo(
    () => (renderer && step.scene ? renderer.render(step.scene, ctx) : null),
    [renderer, step, ctx],
  );

  useEffect(() => {
    const container = svgRef.current;

    // Step song ánh vẽ ở component riêng, canvas chính không tồn tại lúc đó.
    // Phải xoá **ký ức** của nó: giữ lại cây node cũ thì step thường kế tiếp sẽ
    // được nội suy từ một scene chẳng liên quan gì — hình biến dạng từ cấu hình
    // của hai step trước, một animation vô nghĩa mà không có lỗi nào báo.
    if (step.bijection) {
      previous.current = [];
      lastStepId.current = step.id;
      setDiff(null);
      return;
    }

    if (!renderer || !container || !baseNodes) return;

    // `boxOf` là **đường duy nhất** cho `move`/`morph` xuyên engine, và Player chưa
    // bao giờ truyền nó: đường còn lại sao chép thuộc tính hình học, nên hai `<g>`
    // rỗng thuộc tính thì không có gì để chép và pha chạy đủ thời lượng trong khi màn
    // hình đứng im. `from` (CHO-12) thì **chỉ** có đường này.
    const next = choreography
      ? applyChoreography(baseNodes, choreography, timeline.ms, {
          boxOf: (id) => (step.scene ? renderer?.boxesOf(step.scene, id, ctx) : undefined),
        })
      : baseNodes;

    const isStepChange = previous.current.length > 0 && lastStepId.current !== step.id;

    // Timeline đang chạy thì **không** `animate` và **không** `setDiff`.
    // Choreography *chính là* animation, nên chồng thêm một phép nội suy 260ms
    // lên mỗi khung rAF sẽ làm mọi thứ trễ đúng một nhịp; còn `setDiff` mỗi
    // khung thì so một khung với khung liền trước — luôn khác nhau chút ít, và
    // dải "vừa đổi" ở lời giải sẽ nhấp nháy suốt timeline.
    if (!isStepChange && choreography) {
      patch(container, next);
      previous.current = next;
      return;
    }

    setDiff(diffNodes(previous.current, next));

    const handle = animate(container, previous.current, next, {
      durationMs: isStepChange ? defaultTheme.motion.stepDurationMs / speed : 0,
    });

    previous.current = next;
    lastStepId.current = step.id;
    return () => handle.cancel();
  }, [renderer, baseNodes, step, choreography, ctx, speed, timeline.ms]);

  // NFR-A2: mọi điều khiển tới được bằng bàn phím.
  //
  // **Gỡ hẳn** listener khi đã fork sang Sandbox, không chỉ đổi JSX: return sớm
  // ở nhánh render không gỡ được một listener trên window. Để nguyên thì Space
  // gõ trong ô nhập tham số của panel "Nước đi tại đây" bị preventDefault +
  // toggle autoplay chạy sau lưng sandbox, còn mũi tên lái một player vô hình.
  useEffect(() => {
    if (forkedScene) return;
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
        setTapped(null);
        setIncident(null);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [goNext, goPrev, forkedScene]);

  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  /**
   * Một cú chạm, hai nghĩa — và **khoảng giữa** phải không làm gì cả.
   *
   * Vuốt ngang đổi step (ngưỡng 48px, có từ trước). Chạm tại chỗ hỏi phả hệ (ngưỡng
   * 8px). Giữa hai ngưỡng ấy là vùng chết, và nó là chủ ý: một ngón tay dịch 20px là
   * một cử chỉ **mập mờ**, và đoán bừa nghĩa của nó thì một nửa số lần sẽ đoán sai.
   * Thà không phản ứng — người dùng thử lại, chứ không phải hoàn tác.
   *
   * Đo cả `y`: bản đầu chỉ theo `clientX`, nên cuộn trang một đoạn dài rồi nhấc tay
   * cũng tính là "chạm tại chỗ" và làm sáng bừa một hạng tử ngẫu nhiên dưới ngón.
   */
  const onCanvasPointerUp = (event: PointerEvent): void => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (start === null) return;

    // Ngưỡng 48px: dưới mức đó gần như luôn là chạm hụt chứ không phải vuốt, và
    // chuyển step vì một cú chạm hụt là cách nhanh nhất làm mất niềm tin.
    //
    // Vuốt chỉ tính khi trục ngang **trội** (|dx| > |dy|): canvas đặt
    // `touch-action: none` nên một cú kéo dọc không cuộn trang mà giao trọn
    // pointerup cho ta — kéo dọc 300px lệch ngang 50px mà đổi step thì người
    // dùng không hiểu chuyện gì vừa xảy ra. Bài học đo-cả-y của nhánh tap,
    // áp nốt cho nhánh swipe.
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < -48) return goNext();
      if (dx > 48) return goPrev();
    }
    if (Math.abs(dx) >= 8 || Math.abs(dy) >= 8) return;

    // Phả hệ và sự cố là công cụ ĐỌC lời giải — trước khi "Xem lời giải" thì
    // không có gì để hỏi, và trả lời lúc ấy là rò rỉ nội dung đang che.
    if (!revealed) return;

    // Hai câu hỏi, **một** chỗ chạm, và thứ tự là chuyện của cái nào hẹp hơn: phả hệ
    // hỏi về một hạng tử, sự cố hỏi về một dòng cảnh báo, và hai loại danh tính ấy
    // không giao nhau — nên thử lần lượt là đủ, không cần ai phân xử.
    const found = probeAt(event.target, step.scene, engines);
    setTapped(found?.lineage ?? null);
    setIncident(found?.incident ?? null);
  };

  const viewport = renderer && step.scene ? renderer.viewportOf(step.scene, ctx) : null;

  /**
   * Bề rộng scene lớn nhất **của cả bài** — mẫu số của tỉ lệ dùng chung (G-10).
   *
   * Tính trên mọi step có hình, không chỉ đường đang đi: nhảy nhánh không được
   * làm đối tượng đổi cỡ. Đo trên kho trước khi có lớp này, cùng một đối tượng
   * chênh tới 7,1× giữa các step của **một** bài.
   */
  const widest = useMemo(() => {
    if (!renderer) return 0;
    const boxes = problem.solutions.flatMap((solution) =>
      solution.steps
        .filter((s): s is Step & { scene: Scene } => s.scene !== undefined)
        .filter((s) => renderer.has(s.scene.engine))
        .map((s) => renderer.viewportOf(s.scene, ctx)),
    );
    return widestWidth(boxes);
  }, [renderer, problem, ctx]);
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

  if (played && engine) {
    return (
      <div class="player">
        <header class="player__head">
          <h1 dangerouslySetInnerHTML={{ __html: renderMath(problem.statement.vi) }} />
          <p class="source">Ván chơi từ bước {step.id} — hai người luân phiên trên cùng một máy</p>
        </header>
        <PlayBoard
          scene={played.scene}
          engine={engine}
          play={played.play}
          labels={atlas}
          onClose={() => setPlayed(null)}
        />
      </div>
    );
  }

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
          labels={atlas}
          {...(problem.sandbox?.goal_expr ? { goalExpr: problem.sandbox.goal_expr } : {})}
          onClose={() => setForkedScene(null)}
        />
      </div>
    );
  }

  return (
    <div class="player">
      <header class="player__head">
        {onBack ? (
          <button class="tool" onClick={onBack}>
            ← Kho bài
          </button>
        ) : null}
        <h1 dangerouslySetInnerHTML={{ __html: renderMath(problem.statement.vi) }} />
        <p class="source">
          {problem.source.contest}
          {problem.source.year ? ` ${problem.source.year}` : ''} · {problem.license}
          {problem.source.note ? (
            // `note` đi qua **cùng bộ sắp chữ với statement**. Trước đây nó bị nội suy
            // thẳng vào chuỗi, nên `$R(3,3)=6$` hiện ra đúng mười ba ký tự và `**mọi**`
            // hiện ra kèm bốn dấu sao — ở **21 bài** trong kho. Ghi chú nguồn là chỗ
            // hay có công thức nhất sau narrative, nên sửa chỗ vẽ đúng hơn là bắt 21
            // ghi chú viết lại thành chữ trơn.
            <span dangerouslySetInnerHTML={{ __html: ` · ${renderMath(problem.source.note.vi)}` }} />
          ) : null}
        </p>
      </header>

      {!revealed ? (
        <div class="reveal">
          <p>Thử tự nghĩ hoặc nghịch sandbox trước đã.</p>
          {step.play && step.scene ? (
            <button
              class="try"
              onClick={() => step.scene && step.play && startPlay(step.scene, step.play)}
            >
              Chơi thử
            </button>
          ) : null}{' '}
          <button class="try" onClick={() => step.scene && fork(step.scene)}>
            Mở sandbox
          </button>{' '}
          <button onClick={() => setRevealed(true)}>Xem lời giải</button>
        </div>
      ) : null}

      <div class="player__body">
        {step.bijection && renderer ? (
          <BijectionPanes step={step} renderer={renderer} labels={atlas} anchor={shownAnchor} />
        ) : (
          <div
            class={choreography ? 'canvas canvas--choreo' : 'canvas'}
            onPointerDown={(event: PointerEvent) => {
              swipeStart.current = { x: event.clientX, y: event.clientY };
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
              style={viewport ? sceneBoxStyle(viewport, widest) : undefined}
              role="img"
              aria-label={interpolate(step.alt_text?.vi ?? altFallback(step))}
            />
            {revealed && choreography ? (
              <Timeline spec={choreography} state={timeline} />
            ) : null}
            {incident ? (
              <p class="incident" aria-live="polite">
                {incident}
              </p>
            ) : null}
          </div>
        )}

        <aside class="side">
          {!revealed ? (
            <p class="hint">Lời giải đang ẩn.</p>
          ) : null}

          {revealed && step.narrative ? (
            <Narrative
              text={interpolated}
              activeAnchor={shownAnchor}
              onAnchor={setActiveAnchor}
            />
          ) : null}

          {revealed && branching ? (
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

          <nav class="controls" hidden={!revealed}>
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

          <nav class="controls" hidden={!revealed}>
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
            {/* Bài chơi được thì **chơi** là đường chính, không phải sandbox: cả M78
                sinh ra để câu "thử đi" có nghĩa là chơi một ván chứ không phải nghịch
                một hình. */}
            {step.play && step.scene ? (
              <button
                class="try"
                onClick={() => step.scene && step.play && startPlay(step.scene, step.play)}
                disabled={!engine}
              >
                Chơi thử từ đây
              </button>
            ) : null}
            <button
              class="try"
              onClick={() => step.scene && fork(step.scene)}
              disabled={!engine}
            >
              Thử từ đây
            </button>
          </nav>

          {revealed ? (
            <TreeNavigator tree={tree} currentId={step.id} onSelect={goTo} />
          ) : null}

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
/**
 * Từ node DOM dưới ngón tay ngược về **thứ engine có để kể** ở chỗ ấy.
 *
 * Đi ngược DOM theo đúng mẫu `BijectionPanes.onPoint`: leo hết chuỗi tổ tiên, `data-el`
 * **trước** `data-k`. Thứ tự ấy không phải tuỳ tiện — một element được vẽ thành nhiều
 * node, và node đeo `data-k` có thể là một hình trong suốt làm chỗ bám cho con trỏ
 * trong khi mực thật nằm ở node khác; chỉ `data-el` nói được node này thuộc về ai.
 *
 * Không gọi `hitTest`: toạ độ scene phải quy đổi qua `getScreenCTM`, mà cây DOM **đã**
 * mang sẵn câu trả lời. Cùng lý lẽ M37 đã ghi cho song ánh.
 *
 * `null` khi engine không có khái niệm phả hệ, khi chạm vào chỗ trống, hay khi id dưới
 * ngón không phải một hạng tử (nhãn luật, hộp dòng). Ba trường hợp ấy đều là "chạm
 * hụt", và chạm hụt thì **xoá** vệt đang sáng — đó là cách người ta bỏ chọn.
 */
function probeAt(
  target: EventTarget | null,
  scene: Scene | undefined,
  engines: ReadonlyMap<string, LoadedEngine> | null,
): { lineage?: ReadonlySet<string>; incident?: string } | null {
  const engine = scene ? engines?.get(scene.engine) : undefined;
  if (!engine || !scene) return null;

  let node = target as Element | null;
  while (node) {
    for (const attr of [ELEMENT_ATTR, KEY_ATTR]) {
      const id = node.getAttribute?.(attr);
      if (id === null || id === undefined) continue;
      const lineage = engine.lineage?.(scene, id);
      if (lineage) return { lineage };
      const incident = engine.incident?.(scene, id);
      if (incident) return { incident: incident.text };
    }
    node = node.parentElement;
  }
  return null;
}

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
