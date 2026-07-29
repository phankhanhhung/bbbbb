import { canonicalStringify } from './hash.js';
import { walk, type SvgNode } from './svg-node.js';

/**
 * Diff hai cây SVG theo key (DAT-12).
 *
 * Đây là cơ chế "soạn trạng thái, được tặng chuyển động": tác giả chỉ lưu snapshot
 * đầy đủ của từng step (DAT-11), runtime tự nhận ra element nào thêm, mất, đổi
 * chỗ, đổi màu — không ai phải khai báo animation tay.
 *
 * Vì vậy **id ổn định là điều kiện tiên quyết**, không phải lời khuyên: xoá rồi
 * thêm lại một element với id mới sẽ biến "di chuyển" thành "nhấp nháy", và
 * không có gì báo lỗi.
 */
export interface NodeDiff {
  /** Có ở sau, không có ở trước. */
  readonly entered: readonly string[];
  /** Có ở trước, không có ở sau. */
  readonly exited: readonly string[];
  /** Có ở cả hai, thuộc tính đổi. */
  readonly changed: readonly string[];
  /** Có ở cả hai, giống hệt. */
  readonly unchanged: readonly string[];
}

function indexByKey(nodes: readonly SvgNode[]): Map<string, SvgNode> {
  const map = new Map<string, SvgNode>();
  walk(nodes, (node) => {
    if (node.key !== undefined) map.set(node.key, node);
  });
  return map;
}

export function diffNodes(
  before: readonly SvgNode[],
  after: readonly SvgNode[],
): NodeDiff {
  const a = indexByKey(before);
  const b = indexByKey(after);

  const entered: string[] = [];
  const exited: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];

  for (const [key, node] of b) {
    const prev = a.get(key);
    if (!prev) {
      entered.push(key);
    } else if (canonicalStringify(prev) === canonicalStringify(node)) {
      unchanged.push(key);
    } else {
      changed.push(key);
    }
  }

  for (const key of a.keys()) {
    if (!b.has(key)) exited.push(key);
  }

  return {
    entered: entered.sort(),
    exited: exited.sort(),
    changed: changed.sort(),
    unchanged: unchanged.sort(),
  };
}

export function isEmptyDiff(diff: NodeDiff): boolean {
  return (
    diff.entered.length === 0 && diff.exited.length === 0 && diff.changed.length === 0
  );
}
