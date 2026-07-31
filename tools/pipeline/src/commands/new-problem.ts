import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SCHEMA_VERSION, formatProblem, type Problem, type Scene } from '@combviz/schema';
import { ENGINE_FRAGMENTS } from '../engines.js';

/**
 * `combviz new` — dựng khung một bài **soạn tay** (AUT-01, và trực tiếp phục vụ G-C).
 *
 * Lý do có lệnh này, nói bằng con số: trước nó, muốn soạn tay một bài thì phải gõ
 * khoảng **hai mươi trường boilerplate** — `schema_version`, `source`, `topics`,
 * `techniques`, `difficulty`, `engines_used`, `license`, `authors`, `status`,
 * `kind`, ngày tháng, rồi cây lời giải với `parent`/`edge_type`/`anchors`/
 * `alt_text`/`verified` — **trước** dòng toán đầu tiên. Gate G-C đòi chính chủ
 * soạn tay 3–5 bài rồi mới đóng băng schema; hai mươi trường ấy là thuế thu ngay
 * ở bước đầu, mỗi lần.
 *
 * Ba luật của khung sinh ra, và cả ba đều là chốt canh chứ không phải tiện lợi:
 *
 *   - **Phải qua được `validate` ngay lập tức.** Một khung mà chạy lên là đỏ thì
 *     tệ hơn không có khung: nó bắt người soạn debug thứ mình chưa viết. Có test
 *     ép điều này cho **cả bảy** engine.
 *   - **`status: 'draft'` và `verified: false`.** Khung có chỗ điền sẵn dạng
 *     placeholder, nên nó **không được** publish nổi — AUT-09 khoá publish khi
 *     còn step chưa verified, và đó đúng là hàng rào cần ở đây.
 *   - **Không ghi đè.** Trùng id thì từ chối, không hỏi lại.
 */
export interface NewProblemOptions {
  root: string;
  id: string;
  engine: string;
  kind: 'illustration' | 'challenge' | 'both';
  /** Ngày ghi vào `created`/`updated`. Truyền từ ngoài để lệnh vẫn xác định. */
  today: string;
  write: boolean;
}

export interface NewProblemResult {
  readonly path: string;
  readonly problem: Problem;
  readonly wrote: boolean;
}

/**
 * Scene tối thiểu **hợp lệ** của từng engine.
 *
 * Đây là phần dễ sai nhất của cả lệnh, và nó không phải chuyện gõ cho đúng cú
 * pháp: mỗi engine có bound riêng, có trường bắt buộc riêng, và có những chỗ mà
 * "rỗng" là **không hợp lệ** (engine game thiếu `rule` là lỗi, không phải mặc
 * định êm; engine derivation có hạng tử mà không có dòng cũng là lỗi). Bảng dưới
 * đây được test ép qua đúng bộ kiểm mà CI dùng.
 */
const STARTER_SCENES: Readonly<Record<string, Scene>> = {
  board: {
    engine: 'board',
    config: { rows: 4, cols: 4 },
    elements: [],
  },
  graph: {
    engine: 'graph',
    config: {},
    elements: [
      { id: 'v1', type: 'vertex', pos: [0, 0], label: 'a' },
      { id: 'v2', type: 'vertex', pos: [20, 0], label: 'b' },
      { id: 'e1', type: 'edge', u: 'v1', v: 'v2' },
    ],
  },
  sequence: {
    engine: 'sequence',
    config: { mode: 'sequence' },
    elements: [
      { id: 'i0', type: 'item', value: 1, pos: 0 },
      { id: 'i1', type: 'item', value: 2, pos: 1 },
      { id: 'i2', type: 'item', value: 3, pos: 2 },
    ],
  },
  set: {
    engine: 'set',
    config: { view: 'matrix' },
    elements: [
      { id: 's1', type: 'set', order: 0, label: 'A' },
      { id: 's2', type: 'set', order: 1, label: 'B' },
      { id: 't1', type: 'token', sets: ['s1'] },
      { id: 't2', type: 'token', sets: ['s1', 's2'] },
    ],
  },
  point: {
    engine: 'point',
    config: {},
    elements: [
      { id: 'p1', type: 'point', pos: [0, 0], label: 'A' },
      { id: 'p2', type: 'point', pos: [30, 0], label: 'B' },
      { id: 'p3', type: 'point', pos: [15, 25], label: 'C' },
    ],
  },
  game: {
    engine: 'game',
    // `rule` bắt buộc: thiếu nó là `bounds/missing-rule`, không phải Nim mặc định.
    config: { rule: { type: 'subtract', min: 1, max: 3 } },
    elements: [{ id: 'p0', type: 'pile', count: 12 }],
  },
  longdiv: {
    engine: 'longdiv',
    // Khai element là **lỗi** ở engine này (`bounds/longdiv-no-elements`): cả bảng
    // suy ra từ hai dãy hệ số, nên chỗ duy nhất người soạn sửa là chúng.
    config: { dividend: [1, 5, 6], divisor: [1, 2] },
    elements: [],
  },
  derivation: {
    engine: 'derivation',
    config: { align: 'relation' },
    elements: [
      { id: 'r1', type: 'row' },
      // Chỉ dùng nhãn **đã có trong atlas**: khung phải qua được `pnpm labels`
      // mà không buộc người soạn chạy MathJax trước khi xem được hình.
      { id: 't-l', type: 'term', row: 'r1', tex: '1' },
      { id: 't-eq', type: 'term', row: 'r1', tex: '=', role: 'relation' },
      { id: 't-r', type: 'term', row: 'r1', tex: '1' },
    ],
  },
};

export const STARTER_ENGINES: readonly string[] = Object.keys(STARTER_SCENES);

export function starterScene(engine: string): Scene | null {
  return Object.hasOwn(STARTER_SCENES, engine) ? (STARTER_SCENES[engine] as Scene) : null;
}

/**
 * Chủ đề và kỹ thuật gợi ý theo engine.
 *
 * Lấy từ controlled vocabulary (CMS-01) — gõ tay một tag ngoài từ vựng là lỗi
 * `taxonomy/*`, và đó là lỗi rất dễ mắc khi bắt đầu một bài mới.
 */
interface StarterTags {
  readonly topics: readonly string[];
  readonly techniques: readonly string[];
  /**
   * Biểu thức invariant khởi điểm.
   *
   * Bắt buộc có khi kỹ thuật là `invariant`: luật `lint/technique-widget-mismatch`
   * biến "tag invariant mà không khai `invariants[]`" thành **lỗi**, và luật ấy
   * đúng — tag mà không có widget thì hoặc tag sai, hoặc quên widget. Khung sinh
   * ra phải tự thoả luật của chính kho, nếu không nó dạy người soạn bỏ qua lỗi
   * đầu tiên mình gặp.
   */
  readonly invariant?: { readonly expr: string; readonly label: string };
}

const STARTER_TAGS: Readonly<Record<string, StarterTags>> = {
  board: {
    topics: ['tiling'],
    techniques: ['invariant'],
    invariant: { expr: 'count(cells, c => c.color_class == 1)', label: 'Số ô màu 1' },
  },
  graph: { topics: ['graph-basics'], techniques: ['double-counting'] },
  sequence: {
    topics: ['sequences'],
    techniques: ['invariant'],
    invariant: { expr: 'total', label: 'Tổng các phần tử' },
  },
  set: { topics: ['counting'], techniques: ['double-counting'] },
  point: { topics: ['counting'], techniques: ['extremal'] },
  game: { topics: ['games'], techniques: ['parity'] },
  derivation: { topics: ['counting'], techniques: ['double-counting'] },
  longdiv: { topics: ['algebra'], techniques: ['construction'] },
};

export function buildNewProblem(options: NewProblemOptions): Problem {
  const scene = starterScene(options.engine);
  if (scene === null) {
    throw new Error(
      `Engine "${options.engine}" không có khung mẫu. Có: ${STARTER_ENGINES.join(', ')}`,
    );
  }
  const tags = STARTER_TAGS[options.engine] as StarterTags;

  return {
    schema_version: SCHEMA_VERSION,
    id: options.id,
    statement: { vi: 'TODO — viết đề bài ở đây.' },
    source: { contest: 'TODO', note: { vi: 'TODO — ghi nguồn đề.' } },
    topics: [...tags.topics],
    techniques: [...tags.techniques],
    difficulty: { author_rating: 3, slot_proxy: 'P1' },
    engines_used: [options.engine],
    license: 'CC-BY-SA-4.0',
    authors: ['owner'],
    // Khung có placeholder ⇒ không được publish nổi. AUT-09 khoá ở `verified`.
    status: 'draft',
    kind: options.kind,
    created: options.today,
    updated: options.today,
    ...(tags.invariant
      ? {
          invariants: [
            {
              id: 'inv-1',
              expr: tags.invariant.expr,
              label: { vi: tags.invariant.label },
            },
          ],
        }
      : {}),
    solutions: [
      {
        id: 'sol',
        label: { vi: 'Lời giải' },
        steps: [
          {
            id: 's0',
            parent: null,
            edge_type: 'seq',
            narrative: {
              vi: 'TODO — bước đầu tiên. Neo vào hình bằng [[a1|cụm chữ này]].',
            },
            anchors: { a1: { ids: [firstAnchorId(scene)] } },
            scene,
            alt_text: { vi: 'TODO — tả hình cho người dùng trình đọc.' },
            verified: false,
          },
        ],
      },
    ],
  } as Problem;
}

/**
 * Id để neo thử.
 *
 * Có engine không khai element nào mà vẫn neo được, vì id của nó **ngầm định**
 * (D-16): bàn cờ có `cell-0-0`, chia dọc có `quotient`, `dividend`, từng hạng tử.
 * Nên chỗ này hỏi thẳng fragment thay vì gõ sẵn một id — gõ sẵn `cell-0-0` là
 * đúng cho bàn cờ và là `structure/unknown-element` cho mọi engine khác cùng dạng.
 */
function firstAnchorId(scene: Scene): string {
  const element = scene.elements.find((e) => e.type !== 'row');
  if (element !== undefined) return element.id;

  const fragment = ENGINE_FRAGMENTS.find((f) => f.id === scene.engine);
  const implicit = fragment?.implicitElementIds?.(scene);
  const first = implicit === undefined ? undefined : [...implicit][0];
  if (first === undefined) {
    throw new Error(`Engine "${scene.engine}": khung mẫu không có id nào để neo`);
  }
  return first;
}

export async function runNewProblem(
  options: NewProblemOptions,
): Promise<NewProblemResult> {
  const problem = buildNewProblem(options);
  const path = join(options.root, 'problems', `${options.id}.json`);

  // Không ghi đè, và kiểm trước khi dựng nội dung: mất một bài đang soạn vì một
  // lệnh gõ nhanh là loại tai nạn không có undo.
  try {
    await readFile(path, 'utf8');
    throw new Error(`Đã có bài "${options.id}" ở ${path} — lệnh này không ghi đè`);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }

  if (options.write) {
    await writeFile(path, formatProblem(problem), 'utf8');
  }

  return { path, problem, wrote: options.write };
}
