/**
 * Định dạng chuẩn tắc cho file problem (DAT-03, DAT-04).
 *
 * DAT-03 đòi "thứ tự key ổn định, pretty-print, id nội bộ ổn định qua các lần
 * save". Không có định dạng chuẩn tắc thì Studio ghi lại một bài đã sửa một chữ
 * cũng có thể xáo trộn toàn bộ thứ tự khoá, và diff git — thứ đang đóng vai trò
 * lịch sử review (§4.1) — trở thành vô dụng.
 *
 * DAT-04 đòi round-trip không mất dữ liệu: `format(parse(format(x))) === format(x)`.
 * Đó là bất biến test được, và nó là thứ duy nhất bảo đảm import/export an toàn.
 */

/**
 * Thứ tự khoá, xếp theo **thứ tự người đọc cần**, không theo bảng chữ cái.
 *
 * Đọc một file bài trong PR nên giống đọc một bài: đề trước, nguồn và phân loại
 * sau, rồi mới tới lời giải. Sắp theo alphabet sẽ nhét `authors` lên trước
 * `statement` và biến mỗi lần review thành một cuộc săn tìm.
 */
const KEY_ORDER: Readonly<Record<string, readonly string[]>> = {
  problem: [
    'schema_version',
    'id',
    'statement',
    'source',
    'topics',
    'techniques',
    'difficulty',
    'engines_used',
    'license',
    'authors',
    'status',
    'kind',
    'created',
    'updated',
    'invariants',
    'solutions',
    'sandbox',
    'assets',
    'og_step_ref',
  ],
  solution: ['id', 'label', 'steps'],
  step: [
    'id',
    'parent',
    'edge_type',
    'case_label',
    'merge_target',
    'narrative',
    'anchors',
    'scene',
    'widget_state',
    'alt_text',
    'author_notes',
    'expects_violation',
    'verified',
  ],
  scene: ['engine', 'config', 'elements', 'viewport'],
  element: ['id', 'type', 'color_class', 'emphasis', 'layer', 'locked'],
};

export function formatProblem(problem: unknown): string {
  return `${stringify(order(problem, 'problem'), 0)}\n`;
}

function order(value: unknown, shape: keyof typeof KEY_ORDER | null): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => order(item, childShape(shape)));
  }
  if (value === null || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const preferred = shape ? (KEY_ORDER[shape] ?? []) : [];
  const rest = Object.keys(source)
    .filter((key) => !preferred.includes(key))
    .sort();

  const out: Record<string, unknown> = {};
  for (const key of [...preferred, ...rest]) {
    if (!Object.hasOwn(source, key) || source[key] === undefined) continue;
    out[key] = order(source[key], nestedShape(shape, key));
  }
  return out;
}

function childShape(shape: keyof typeof KEY_ORDER | null): keyof typeof KEY_ORDER | null {
  if (shape === 'problem') return null;
  return shape;
}

function nestedShape(
  shape: keyof typeof KEY_ORDER | null,
  key: string,
): keyof typeof KEY_ORDER | null {
  if (shape === 'problem' && key === 'solutions') return 'solution';
  if (shape === 'solution' && key === 'steps') return 'step';
  if (shape === 'step' && key === 'scene') return 'scene';
  if (shape === 'scene' && key === 'elements') return 'element';
  return null;
}

const INDENT = '  ';

/**
 * Serialize với một luật riêng: **mảng số ngắn nằm trên một dòng**.
 *
 * `"pos": [3, 4]` xuống bốn dòng thì một bàn cờ 40 quân thành 160 dòng nhiễu, và
 * diff của một nước đi trở nên không đọc được. Đây là chỗ duy nhất định dạng đi
 * chệch khỏi `JSON.stringify(x, null, 2)`, và nó tồn tại vì diff git là công cụ
 * review chính (§4.1).
 */
function stringify(value: unknown, depth: number): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);

  const pad = INDENT.repeat(depth);
  const inner = INDENT.repeat(depth + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (isShortNumberArray(value)) {
      return `[${value.map((item) => stringify(item, 0)).join(', ')}]`;
    }
    const items = value.map((item) => `${inner}${stringify(item, depth + 1)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';

  const lines = entries.map(
    ([key, item]) => `${inner}${JSON.stringify(key)}: ${stringify(item, depth + 1)}`,
  );
  return `{\n${lines.join(',\n')}\n${pad}}`;
}

function isShortNumberArray(value: readonly unknown[]): boolean {
  if (value.length > 4) return false;
  return value.every(
    (item) =>
      typeof item === 'number' ||
      (Array.isArray(item) && item.length <= 2 && item.every((n) => typeof n === 'number')),
  );
}
