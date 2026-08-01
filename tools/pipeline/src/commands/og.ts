import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { join, relative } from 'node:path';
import {
  createContext,
  createRenderer,
  el,
  matchScale,
  text,
  toSvgString,
  watermarkNodes,
  type SvgNode,
} from '@combviz/render';
import { defaultTheme } from '@combviz/theme';
import {
  stripAnchorMarkup,
  stripBoldMarkup,
  toReadableMath,
  type Problem,
  type Scene,
  type Step,
  type Viewport,
} from '@combviz/schema';
import { loadAtlas } from '../atlas.js';
import { fontOptions } from '../fonts.js';
import { ENGINE_RENDERERS } from '../engines.js';

/**
 * `combviz og` — sinh OG/social card cho từng bài (REN-02).
 *
 * Chạy trong build, không làm tay. Với một content brand thì đây là **kênh
 * growth chính** chứ không phải phụ kiện (§11): mỗi link chia sẻ là một lần
 * thương hiệu xuất hiện, và làm tay 25 lần thì tới bài thứ tám sẽ có bài không
 * có card.
 */
export interface OgOptions {
  root: string;
  out: string;
  problemId?: string;
  /** REN-02: raster ra PNG. SVG đúng nhưng Twitter/Facebook không đọc được nó. */
  png?: boolean;
}

export async function runOg(options: OgOptions): Promise<number> {
  const dir = join(options.root, 'problems');
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => join(e.parentPath ?? dir, e.name))
    .sort();

  await mkdir(options.out, { recursive: true });
  const renderer = createRenderer(ENGINE_RENDERERS);
  const ctx = createContext(defaultTheme, { labels: await loadAtlas(options.root) });
  let made = 0;

  for (const file of files) {
    const problem = JSON.parse(await readFile(file, 'utf8')) as Problem;
    if (options.problemId && problem.id !== options.problemId) continue;

    const step = pickOgStep(problem);
    if (!step?.scene || !renderer.has(step.scene.engine)) {
      console.log(`· ${problem.id} — không có scene render được`);
      continue;
    }

    // Pane phải của song ánh lên card cùng pane trái (M69). Card của một bài mà
    // điểm bán **là** song ánh mà chỉ có một nửa thì nó quảng cáo sai món hàng.
    const right =
      step.bijection && renderer.has(step.bijection.scene.engine)
        ? step.bijection.scene
        : undefined;
    const svg = composeCard(problem, step.scene, renderer, ctx, right);
    const target = join(options.out, `${problem.id}.svg`);
    await writeFile(target, `${svg}\n`, 'utf8');

    if (options.png) {
      const pngTarget = join(options.out, `${problem.id}.png`);
      await writeFile(pngTarget, rasterize(svg));
    }

    made += 1;
    console.log(
      `✓ ${problem.id} → ${relative(process.cwd(), target)}${options.png ? ' (+png)' : ''} (step ${step.id})`,
    );
  }

  console.log(`\n${made} card`);
  return made;
}

/**
 * Step làm ảnh đại diện: `og_step_ref` nếu tác giả đã chọn, không thì step cuối
 * của **nhánh chính** (G-01).
 *
 * Không lấy step cuối mảng: với lời giải phân nhánh, step cuối mảng thường là một
 * nhánh phản chứng nào đó tình cờ đứng cuối, và lấy nó làm bộ mặt của bài là
 * quảng cáo bằng ngõ cụt.
 */
function pickOgStep(problem: Problem): Step | undefined {
  const ref = problem.og_step_ref;
  if (ref) {
    const solution = problem.solutions.find((s) => s.id === ref.sol_id);
    const step = solution?.steps.find((s) => s.id === ref.step_id);
    if (step) return step;
  }

  const solution = problem.solutions[0];
  if (!solution) return undefined;

  let current = solution.steps.find((s) => s.parent === null);
  while (current) {
    const next = solution.steps.find(
      (s) => s.parent === current!.id && s.edge_type === 'seq',
    );
    if (!next) break;
    current = next;
  }
  return current;
}

/**
 * REN-02 nửa sau — raster SVG thành PNG (D-08: resvg, không cần browser).
 *
 * Card SVG đúng đến từng nét nhưng **không dùng được ở đúng chỗ nó sinh ra để
 * dùng**: Twitter, Facebook, Zalo đều không render `og:image` dạng SVG. Một card
 * chỉ có bản SVG tức là mọi link chia sẻ đều trống ảnh — mà §11 xem OG card là
 * kênh growth chính.
 *
 * Phông giao diện lấy từ hệ thống (G-09), phông toán lấy từ katex — xem `fonts.ts`
 * cho hai lỗi mà lựa chọn ấy sửa. Đây là chỗ mỏng nhất của đường này: máy không có
 * phông thì resvg **âm thầm bỏ chữ**, ra một card đẹp mà trống trơn — nên có
 * test riêng rasterize chữ tiếng Việt và ký tự quân cờ rồi soi xem có mực không.
 */
export function rasterize(svg: string): Buffer {
  return new Resvg(svg, {
    // Phông toán lấy từ katex, không phó mặc phông hệ thống — xem `fonts.ts`. Card
    // của bài đại số/derivation trước đây vẽ công thức bằng một serif thay thế, tức
    // là rộng hơn hộp mà layout đã tính.
    font: fontOptions(),
    background: defaultTheme.surface.canvas,
  })
    .render()
    .asPng();
}

const CARD_PADDING = 48;

function composeCard(
  problem: Problem,
  scene: Scene,
  renderer: ReturnType<typeof createRenderer>,
  ctx: ReturnType<typeof createContext>,
  rightScene?: Scene,
): string {
  const { ogWidth, ogHeight } = defaultTheme.brand;

  // Hình chiếm nửa trái, chữ nửa phải. Nhúng scene qua `<svg>` lồng với viewBox
  // riêng: nhờ vậy không phải scale toạ độ tay, và hình giữ nguyên tỉ lệ dù bàn
  // cờ vuông hay đồ thị dẹt.
  const figureSize = ogHeight - CARD_PADDING * 2;
  const pane = (s: Scene, box: SvgNode['attrs'], view: Viewport): SvgNode => ({
    tag: 'svg',
    attrs: {
      ...box,
      viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`,
      preserveAspectRatio: 'xMidYMid meet',
    },
    children: renderer.render(s, ctx),
  });

  /**
   * Song ánh: **hai** pane cạnh nhau trong đúng ô hình ấy, cân tỉ lệ bằng
   * `matchScale` — cùng hàm Player dùng, không phải một bản chép tay thứ hai.
   *
   * Chia đôi chiều ngang chứ không nới ô hình sang phần chữ: card có đúng một
   * bố cục, và đổi bố cục theo loại bài thì kho sẽ có hai loại card mà chỉ một
   * loại từng được nhìn.
   */
  const figures: SvgNode[] = [];
  if (rightScene) {
    const [leftView, rightView] = matchScale(
      renderer.viewportOf(scene, ctx),
      renderer.viewportOf(rightScene, ctx),
    );
    const GAP = 16;
    const half = (figureSize - GAP) / 2;

    /**
     * Cạnh nhau hay chồng lên nhau — chọn theo **hình nào to hơn**, không chọn
     * theo thói quen. Hai pane chia đôi một ô vuông thì mỗi nửa dẹt đứng; scene
     * của kho phần lớn dẹt ngang (bàn cờ 6×6 cạnh chuỗi biến đổi), nên xếp dọc
     * cho hình lớn gần gấp đôi. Đo bằng chính hệ số `meet` mà SVG sẽ dùng.
     */
    const fit = (w: number, h: number): number =>
      Math.min(w / leftView.width, h / leftView.height);
    const sideBySide = fit(half, figureSize) >= fit(figureSize, half);

    figures.push(
      pane(
        scene,
        { x: CARD_PADDING, y: CARD_PADDING, width: sideBySide ? half : figureSize, height: sideBySide ? figureSize : half },
        leftView,
      ),
      pane(
        rightScene,
        {
          x: CARD_PADDING + (sideBySide ? half + GAP : 0),
          y: CARD_PADDING + (sideBySide ? 0 : half + GAP),
          width: sideBySide ? half : figureSize,
          height: sideBySide ? figureSize : half,
        },
        rightView,
      ),
    );
  } else {
    figures.push(
      pane(
        scene,
        { x: CARD_PADDING, y: CARD_PADDING, width: figureSize, height: figureSize },
        renderer.viewportOf(scene, ctx),
      ),
    );
  }

  const textX = CARD_PADDING * 2 + figureSize;
  const textWidth = ogWidth - textX - CARD_PADDING;

  return toSvgString(
    [
      el('rect', { width: ogWidth, height: ogHeight, fill: defaultTheme.surface.canvas }),
      ...figures,
      ...titleLines(problem, textX, textWidth),
      text(
        'text',
        {
          x: textX,
          y: ogHeight - CARD_PADDING,
          'font-family': defaultTheme.type.uiFamily,
          'font-size': 22,
          fill: defaultTheme.surface.guide,
        },
        [problem.source.contest, ...problem.topics].join(' · '),
      ),
    ],
    {
      viewport: { x: 0, y: 0, width: ogWidth, height: ogHeight },
      width: ogWidth,
      height: ogHeight,
      background: defaultTheme.surface.canvas,
      overlay: watermarkNodes(defaultTheme, {
        x: 0,
        y: 0,
        width: ogWidth,
        height: ogHeight,
      }),
    },
  );
}

/**
 * Đề bài xuống dòng thủ công.
 *
 * SVG không tự ngắt dòng, và render headless thì không đo được bề rộng chữ. Ước
 * lượng theo số ký tự: thà cắt hơi sớm còn hơn để chữ tràn ra khỏi card — tràn
 * thì hỏng hẳn, ngắn thì chỉ là thừa chỗ.
 */
function titleLines(problem: Problem, x: number, width: number): SvgNode[] {
  const FONT = 34;
  const perLine = Math.floor(width / (FONT * 0.5));
  // resvg không có KaTeX. Không đổi ký hiệu sang Unicode ở đây thì card — thứ
  // duy nhất người ta thấy khi ai đó chia sẻ link — hiện thẳng "5\times5".
  const words = toReadableMath(stripBoldMarkup(stripAnchorMarkup(problem.statement.vi))).split(/\s+/);

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > perLine) {
      lines.push(current);
      current = word;
      if (lines.length === 5) break;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current && lines.length < 5) lines.push(current);
  if (lines.length === 5) lines[4] = `${(lines[4] as string).slice(0, perLine - 1)}…`;

  return lines.map((line, i) =>
    text(
      'text',
      {
        x,
        y: 120 + i * (FONT * 1.35),
        'font-family': defaultTheme.type.uiFamily,
        'font-size': FONT,
        'font-weight': 500,
        fill: defaultTheme.emphasis.focusHalo,
      },
      line,
    ),
  );
}
