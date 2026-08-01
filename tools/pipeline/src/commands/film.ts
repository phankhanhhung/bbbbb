import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import {
  activePhases,
  applyChoreography,
  createContext,
  createRenderer,
  timelineLength,
  toSvgString,
  CELL_PX,
  UNITS_PER_CELL,
  type Choreography,
  type RenderContext,
  type SvgNode,
} from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import type { LabelAtlas } from '@combviz/render';
import type { Problem, Scene, Step } from '@combviz/schema';
import { algebraChoreography } from '@combviz/engine-algebra';
import { ENGINE_RENDERERS } from '../engines.js';
import { loadAtlas } from '../atlas.js';
import { fontOptions } from '../fonts.js';
import { toApng } from '../apng.js';

/**
 * `combviz film` — dựng thước phim của một step, chạy trong Node (REN-05).
 *
 * ## Món nợ nó trả
 *
 * CHO-08 hứa từ ngày đầu: *"không đọc giờ, không random, không trạng thái — Player gọi
 * mỗi rAF, render video gọi theo timestep cố định, và hai bên phải ra byte giống
 * nhau."* Vế thứ hai của câu ấy **chưa từng có ai chạy**. `applyChoreography` là hàm
 * thuần đúng như hứa, nhưng chỗ duy nhất gọi nó là Player, nên "byte giống nhau" là
 * một lời hứa không ai kiểm được — mà lời hứa chưa kiểm thì bằng không.
 *
 * Lệnh này là chỗ vế hai thành thật. Nó **không** dựng lại phép tính nào: cùng
 * renderer, cùng `applyChoreography`, cùng `toSvgString` mà Player và golden đang
 * dùng. Nếu một hôm renderer lén đọc `Date.now()` hay `Math.random()`, chốt canh
 * `film-deterministic` đỏ ngay, chứ không đợi tới lúc ai đó phàn nàn rằng hai lần
 * xuất cùng một bài ra hai clip khác nhau.
 *
 * ## Vì sao APNG chứ không mp4
 *
 * mp4 kéo theo ffmpeg — một binary hệ thống, không cài được bằng `pnpm install`, và
 * là thứ đầu tiên thiếu trên máy CI. APNG thì mọi browser đọc được, ghép được bằng
 * `node:buffer` thuần (xem `apng.ts`), và giữ đúng từng pixel resvg vẽ ra. Ai cần mp4
 * thì đã có dãy `frame-%04d.png` nằm sẵn cạnh đó, một dòng ffmpeg là xong — README
 * ghi dòng ấy. Không đưa ffmpeg vào repo.
 */
export interface FilmOptions {
  root: string;
  problemId: string;
  solutionId?: string;
  stepId?: string;
  out: string;
  /** Khung/giây của dãy ảnh xuất ra. */
  fps: number;
  /** Thời gian đứng hình ở mỗi mốc `hold` (và ở khung cuối), ms. */
  hold: number;
  width: number;
  apng: boolean;
}

export interface FilmResult {
  readonly frames: number;
  readonly fps: number;
  readonly length: number;
  readonly stepId: string;
}

export async function runFilm(options: FilmOptions): Promise<FilmResult> {
  const path = join(options.root, 'problems', `${options.problemId}.json`);
  const problem = JSON.parse(await readFile(path, 'utf8')) as Problem;

  const solution =
    (options.solutionId
      ? problem.solutions.find((s) => s.id === options.solutionId)
      : problem.solutions[0]) ?? null;
  if (!solution) {
    throw new Error(`Không tìm thấy solution "${options.solutionId}" trong bài này`);
  }

  const step = pickStep(solution.steps, options.stepId);
  if (!step?.scene) {
    throw new Error(`Step "${options.stepId ?? '(mặc định)'}" không có scene để render`);
  }
  const scene = step.scene;

  const renderer = createRenderer(ENGINE_RENDERERS);
  if (!renderer.has(scene.engine)) {
    throw new Error(`Chưa có renderer cho engine "${scene.engine}"`);
  }

  const spec = effectiveChoreography(step);
  if (!spec) throw new Error(refusal(step));

  const labels = await loadAtlas(options.root);
  const times = frameTimes(spec, options.fps, options.hold);

  await mkdir(options.out, { recursive: true });
  const pngs: Buffer[] = [];
  for (const [i, ms] of times.entries()) {
    const svg = frameSvg(scene, spec, ms, {
      renderer,
      labels,
      width: options.width,
      anchors: step.anchors,
    });
    const png = rasterFrame(svg);
    pngs.push(png);
    await writeFile(join(options.out, `frame-${String(i + 1).padStart(4, '0')}.png`), png);
  }

  await writeFile(
    join(options.out, 'manifest.json'),
    `${JSON.stringify(
      {
        problem: problem.id,
        solution: solution.id,
        step: step.id,
        fps: options.fps,
        frames: times.length,
        length: timelineLength(spec),
        times,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  if (options.apng) {
    await writeFile(join(options.out, 'film.png'), toApng(collapse(pngs, 1000 / options.fps)));
  }

  return {
    frames: times.length,
    fps: options.fps,
    length: timelineLength(spec),
    stepId: step.id,
  };
}

/**
 * Choreography **hiệu lực** — chép đúng thứ tự của Player (`Player.tsx`).
 *
 * `step.choreography` luôn thắng; không có thì engine đại số tự sinh. Thứ tự này là
 * hợp đồng chứ không phải tiện tay: một bài muốn nhịp riêng vẫn viết được, còn engine
 * chỉ lấp chỗ trống. Lệch một chút ở đây thì clip xuất ra không còn là thứ người xem
 * thấy trong Player — mà đó chính là lý do lệnh này tồn tại.
 *
 * Engine khác **chỉ** nhận choreography tác giả khai. Không bịa một nhịp mặc định:
 * một timeline sinh bừa cho bàn cờ sẽ trông như có ý đồ trong khi không ai nghĩ ra nó.
 */
export function effectiveChoreography(step: Step): Choreography | undefined {
  if (step.choreography) return step.choreography;
  if (!step.scene) return undefined;
  if (step.scene.engine !== 'algebra') return undefined;
  return algebraChoreography(step.scene, {
    anchor: Object.keys(step.anchors ?? {})[0] ?? 'a1',
  });
}

function refusal(step: Step): string {
  const engine = step.scene?.engine ?? '(không có scene)';
  return (
    `Step "${step.id}" không có timeline để dựng phim.\n` +
    `  engine "${engine}" không tự sinh choreography, và step không khai \`choreography\`.\n` +
    '  Chỉ engine `algebra` suy được nhịp từ model (AL-06); các engine khác phải do tác giả viết.'
  );
}

/**
 * Mốc thời gian của từng khung — **tôn trọng `hold`**.
 *
 * Bản ngây thơ là `i / fps` chạy thẳng từ $0$ tới hết. Nó sai đúng chỗ mà CHO-11 sinh
 * ra để sửa: `hold` là chỗ tác giả nói *"đọc cái này đã rồi hãy đi tiếp"*, và trong
 * Player nó **dừng hẳn** để đợi người xem bấm. Một clip offline không có ai bấm, nên
 * cái thay cho cú bấm ấy là một quãng đứng hình — không thì bước lập luận nặng nhất
 * trôi qua đúng bằng tốc độ của một pha trang trí.
 *
 * Khung cuối cũng đứng lại đúng quãng ấy: APNG lặp vô hạn, và không có quãng nghỉ thì
 * dòng kết quả vừa hiện ra đã bị kéo về khung đầu.
 *
 * Mỗi mốc dừng được **rơi trúng**, không phải xấp xỉ: đồng hồ khởi động lại từ mốc.
 * Nhờ thế khung đứng hình là khung *ngay sau khi pha `hold` vừa xong*, đúng thứ
 * `goPhase` của Player dừng lại ở đó.
 */
export function frameTimes(
  spec: Choreography,
  fps: number,
  holdMs: number,
): number[] {
  const length = timelineLength(spec);
  const stepMs = 1000 / fps;
  const marks = [
    ...new Set(
      spec.phases
        .filter((p) => p.hold === true)
        .map((p) => p.at + p.duration)
        .filter((t) => t > 0 && t < length),
    ),
  ].sort((a, b) => a - b);

  const freeze = Math.max(0, Math.round(holdMs / stepMs));
  const times: number[] = [];
  let cursor = 0;

  for (const stop of [...marks, length]) {
    // Nhân chỉ số thay vì cộng dồn: cộng dồn số thực làm mốc trôi đi vài phần nghìn
    // mỗi khung, và với CHO-08 thì "vài phần nghìn" là byte khác nhau.
    for (let i = 0; cursor + i * stepMs < stop - 1e-9; i += 1) {
      times.push(round(cursor + i * stepMs));
    }
    for (let i = 0; i <= freeze; i += 1) times.push(round(stop));
    cursor = stop + stepMs;
  }

  return times;
}

/**
 * Cây node của một khung — **trước** khi serialize.
 *
 * Tách ra vì danh tính element không phải lúc nào cũng đi vào chuỗi SVG: engine đại số
 * gắn `data-el` (một thuộc tính thật), còn engine bàn cờ gắn `key` — mà `key` là
 * **trường của node**, không phải thuộc tính, nên `toSvgString` không viết nó ra. Một
 * chốt canh tìm danh tính bằng cách dò chuỗi vì thế quét trúng $0$ node trên bàn cờ và
 * xanh mà chẳng kiểm gì — đúng lỗi ấy đã xảy ra ở M62 và chỉ lộ khi bẻ răng.
 */
export function frameNodes(
  scene: Scene,
  spec: Choreography,
  ms: number,
  options: FrameOptions,
): SvgNode[] {
  const { renderer, labels } = options;
  const ctx = frameContext(spec, ms, labels, options.anchors);
  return withFocusGlow(
    applyChoreography(renderer.render(scene, ctx), spec, ms, {
      boxOf: (id) => renderer.boxesOf(scene, id, ctx),
    }),
  );
}

export interface FrameOptions {
  readonly renderer: ReturnType<typeof createRenderer>;
  readonly labels: LabelAtlas;
  readonly width: number;
  readonly anchors?: Step['anchors'];
}

/**
 * Một khung, dưới dạng chuỗi SVG.
 *
 * Tách khỏi phần ghi đĩa vì đây là chỗ CHO-08 sống: chốt canh gọi thẳng hàm này hai
 * lần với cùng `ms` rồi so chuỗi. Raster hoá đứng ngoài — resvg là thư viện của người
 * khác, còn thứ ta hứa tất định là **phép tính của mình**.
 */
export function frameSvg(
  scene: Scene,
  spec: Choreography,
  ms: number,
  options: FrameOptions,
): string {
  const { renderer, labels, width } = options;
  const ctx = frameContext(spec, ms, labels, options.anchors);
  const nodes = frameNodes(scene, spec, ms, options);
  const viewport = renderer.viewportOf(scene, ctx);

  return toSvgString(nodes, {
    viewport,
    width,
    height: Math.round((width * viewport.height) / viewport.width),
    background: defaultTheme.surface.canvas,
  });
}

/**
 * `ctx` của một khung — highlight đi theo **pha đang nói** (CHO-07).
 *
 * Player nướng highlight vào render chứ không phủ một lớp DOM lên trên
 * (`Player.tsx`), nên nó phụ thuộc `ms` và cả scene phải vẽ lại mỗi khung. Đắt, và
 * đúng: một clip mà anchor không sáng theo lời kể thì mất đúng thứ CHO-07 dựng ra.
 *
 * `explain: true` vì ở đây **có** timeline — cùng điều kiện Player dùng, và cũng là
 * lý do golden (`explain: false`) không đổi một byte nào vì lệnh này.
 */
function frameContext(
  spec: Choreography,
  ms: number,
  labels: LabelAtlas,
  anchors: Step['anchors'],
): RenderContext {
  const key = activePhases(spec, ms).at(-1)?.anchor ?? null;
  const ids = key && anchors && Object.hasOwn(anchors, key) ? anchors[key]?.ids ?? [] : [];
  return createContext(defaultTheme, {
    highlight: new Set(ids),
    labels,
    explain: true,
  });
}

/**
 * Pha `focus` **nhìn thấy được** khi không có CSS.
 *
 * Đây là lỗi đầu tiên lượt nhìn PNG bắt được ở M62, và nó thuộc đúng họ lỗi mà lượt
 * nhìn sinh ra để bắt: không có gì đỏ, không có gì cảnh báo, clip chạy đủ 4180ms —
 * chỉ có 1,2 giây đầu là **không có chuyện gì xảy ra**. `applyChoreography` cố ý
 * không chọn màu: nó gắn `data-phase` rồi thôi, "để lớp DOM hoặc CSS quyết định
 * *được nhấn* trông thế nào". Trong Player lớp ấy là `styles.css`
 * (`.canvas [data-phase] { filter: drop-shadow(...) }`). Trong resvg **không có lớp
 * ấy**, nên `data-phase` là một thuộc tính không ai đọc, và mọi pha `focus` — thứ
 * mang cả mốc `hold`, tức khoảnh khắc quan trọng nhất của mỗi bước — trôi qua câm.
 *
 * Nên chỗ này là **anh em song sinh của `styles.css`**, không phải một tính năng mới:
 * cùng một quyết định thị giác, phát biểu bằng thứ tiếng thứ hai. Hai bản sẽ lệch
 * nhau nếu ai đó đổi một bên — rủi ro có thật, và cái giá phải trả để giữ
 * `applyChoreography` mù theme (điều kiện để nó chạy y hệt ở Node lẫn browser).
 * Dùng đúng `theme.emphasis.anchorHalo`, đúng màu `--halo` mà CSS đang dùng.
 *
 * **Bán kính tính theo tỉ lệ của Player, không theo bề rộng xuất ra.** CSS nói `3px`
 * ở tỉ lệ hiển thị của Player ($44$px mỗi $10$ đơn vị scene, G-10), nên quy về đơn vị
 * scene là $3 / 4{,}4$. Lấy theo `--width` của lệnh thì cùng một clip xuất ở 1440 sẽ
 * có quầng sáng bằng nửa bản 720 — quầng phải to bằng chữ, không bằng file.
 *
 * `data-phase` mang **tiến độ** $0..1$; CSS bỏ qua giá trị ấy và mượn `transition` để
 * sáng dần. Ở đây không có transition, nên tiến độ đi thẳng vào `flood-opacity` —
 * lượng tử hoá thành 8 mức để số filter còn đếm được và mỗi khung vẫn tất định.
 */
const GLOW_LEVELS = 8;

/** px → đơn vị scene, theo đúng tỉ lệ Player hiển thị (G-10). */
const PX = UNITS_PER_CELL / CELL_PX;

function withFocusGlow(nodes: readonly SvgNode[]): SvgNode[] {
  const levels = new Set<number>();

  const mark = (list: readonly SvgNode[]): SvgNode[] =>
    list.map((node) => {
      const children = node.children ? mark(node.children) : undefined;
      const phase = Number(node.attrs['data-phase'] ?? 0);
      if (!Number.isFinite(phase) || phase <= 0) {
        return children ? { ...node, children } : node;
      }
      const level = Math.max(1, Math.min(GLOW_LEVELS, Math.round(phase * GLOW_LEVELS)));
      levels.add(level);
      const attrs = { ...node.attrs, filter: `url(#focus-${level})` };
      return children ? { ...node, attrs, children } : { ...node, attrs };
    });

  const marked = mark(nodes);
  if (levels.size === 0) return marked;

  const filters = [...levels]
    .sort((a, b) => a - b)
    .map((level) => ({
      tag: 'filter',
      attrs: { id: `focus-${level}`, x: '-50%', y: '-50%', width: '200%', height: '200%' },
      children: [1.5, 3].map((blurPx) => ({
        tag: 'feDropShadow',
        attrs: {
          dx: 0,
          dy: 0,
          stdDeviation: round(blurPx * PX),
          'flood-color': defaultTheme.emphasis.anchorHalo,
          'flood-opacity': round(level / GLOW_LEVELS),
        },
      })),
    }));

  return [{ tag: 'defs', attrs: {}, children: filters }, ...marked];
}

/**
 * Raster hoá. Cùng đường của OG card (`og.ts`) — phông hệ thống, nền canvas.
 *
 * Không truyền `fitTo`: SVG đã mang `width`/`height` pixel, và để resvg tự co lần nữa
 * là mở đường cho hai nguồn kích thước lệch nhau.
 */
export function rasterFrame(svg: string): Buffer {
  return new Resvg(svg, {
    font: fontOptions(),
    background: defaultTheme.surface.canvas,
  })
    .render()
    .asPng();
}

/**
 * Gộp các khung **giống hệt nhau liền kề** thành một khung dài hơn.
 *
 * Quãng đứng hình ở mốc `hold` sinh ra hàng chục khung byte-identical. Ghi cả ra đĩa
 * thì vô hại (dãy PNG phải đều nhịp để ffmpeg dùng được), nhưng nhét cả vào APNG thì
 * file phình lên vài lần mà không thêm một pixel thông tin nào.
 *
 * Chỉ gộp khi **bytes bằng nhau tuyệt đối** — không so xấp xỉ. Hai khung khác nhau
 * một pixel là hai khung khác nhau, và đoán rằng "chắc giống" là cách đánh mất đúng
 * cái chuyển động chậm mà người ta cần nhìn kỹ.
 */
export function collapse(pngs: readonly Buffer[], stepMs: number): { png: Buffer; delayMs: number }[] {
  const out: { png: Buffer; delayMs: number }[] = [];
  for (const png of pngs) {
    const last = out.at(-1);
    if (last && last.png.equals(png)) last.delayMs += stepMs;
    else out.push({ png, delayMs: stepMs });
  }
  return out;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Cùng quy tắc `render`/`og`: step cuối của **nhánh chính** (G-01). */
function pickStep(steps: readonly Step[], stepId?: string): Step | undefined {
  if (stepId) return steps.find((s) => s.id === stepId);

  let current = steps.find((s) => s.parent === null);
  while (current) {
    const next = steps.find((s) => s.parent === current?.id && s.edge_type === 'seq');
    if (!next) break;
    current = next;
  }
  return current;
}
