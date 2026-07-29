/**
 * Lựa chọn hiện tại trên canvas (ENG-00).
 *
 * Tách khỏi `EditorState` vì nó **không** thuộc lịch sử undo: hoàn tác một thao
 * tác không nên khôi phục lại việc ta từng chọn những gì. Trộn hai thứ này là
 * cách nhanh nhất để undo có cảm giác giật cục và khó đoán.
 */
export type Selection = ReadonlySet<string>;

export const EMPTY_SELECTION: Selection = new Set();

export type SelectMode = 'replace' | 'toggle' | 'add';

export function applySelection(
  current: Selection,
  ids: readonly string[],
  mode: SelectMode,
): Selection {
  if (mode === 'replace') return new Set(ids);

  const next = new Set(current);
  for (const id of ids) {
    if (mode === 'toggle' && next.has(id)) next.delete(id);
    else next.add(id);
  }
  return next;
}

/**
 * Chế độ chọn suy ra từ phím bổ trợ.
 *
 * NFR-C2: chạm là công dân hạng nhất. Trên thiết bị cảm ứng không có phím bổ trợ,
 * nên `touchMultiSelect` cho phép UI bật chế độ chọn-nhiều bằng một nút bấm —
 * tap lần lượt để cộng dồn, đúng như §5.0 mô tả.
 */
export function modeFromEvent(
  event: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
  touchMultiSelect = false,
): SelectMode {
  if (touchMultiSelect) return 'toggle';
  if (event.shiftKey) return 'add';
  if (event.metaKey || event.ctrlKey) return 'toggle';
  return 'replace';
}
