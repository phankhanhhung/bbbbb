import { describe, expect, it } from 'vitest';
import type { Scene } from '@combviz/schema';
import {
  allocateId,
  applySelection,
  canRedo,
  canUndo,
  command,
  createEditorState,
  defineCommand,
  execute,
  HISTORY_LIMIT,
  redo,
  undo,
  type CommandRegistry,
} from '../src/index.js';

const base: Scene = { engine: 'test', config: { n: 0 }, elements: [] };

const bump = defineCommand<{ by: number }>({
  type: 'test/bump',
  label: (p) => `Tăng ${p.by}`,
  apply(scene, params) {
    const n = (scene.config as { n: number }).n + params.by;
    return { ...scene, config: { n } };
  },
});

const refuse = defineCommand<Record<string, never>>({
  type: 'test/refuse',
  label: () => 'Không làm gì',
  apply: () => null,
});

const registry: CommandRegistry = { [bump.type]: bump, [refuse.type]: refuse };
const n = (scene: Scene): number => (scene.config as { n: number }).n;

describe('command layer (ENG-01)', () => {
  it('lệnh trả về scene mới, không mutate scene cũ', () => {
    const state = createEditorState(base);
    const next = execute(state, registry, command('test/bump', { by: 3 })).state;

    expect(n(next.scene)).toBe(3);
    expect(n(state.scene)).toBe(0);
    expect(next.scene).not.toBe(state.scene);
  });

  it('lệnh không áp được thì không ghi vào lịch sử', () => {
    const state = createEditorState(base);
    const result = execute(state, registry, command('test/refuse', {}));

    // `null` không phải lỗi — nó là "thao tác này không có nghĩa ở đây". Ghi vào
    // lịch sử sẽ tạo ra những bước undo không làm gì cả.
    expect(result.applied).toBe(false);
    expect(result.state).toBe(state);
    expect(canUndo(result.state)).toBe(false);
  });

  it('lệnh lạ bị bỏ qua, không ném', () => {
    const state = createEditorState(base);
    expect(execute(state, registry, command('khong-co', {})).applied).toBe(false);
  });

  it('không tra được lệnh qua Object.prototype', () => {
    const state = createEditorState(base);
    expect(execute(state, registry, command('constructor', {})).applied).toBe(false);
    expect(execute(state, registry, command('toString', {})).applied).toBe(false);
  });
});

describe('undo/redo (ENG-00)', () => {
  const run = (times: number) => {
    let state = createEditorState(base);
    for (let i = 0; i < times; i += 1) {
      state = execute(state, registry, command('test/bump', { by: 1 })).state;
    }
    return state;
  };

  it('undo rồi redo về đúng chỗ cũ', () => {
    const state = run(3);

    expect(n(state.scene)).toBe(3);
    expect(n(undo(state).scene)).toBe(2);
    expect(n(undo(undo(state)).scene)).toBe(1);
    expect(n(redo(undo(state)).scene)).toBe(3);
  });

  it('làm việc mới thì nhánh redo cũ mất', () => {
    const back = undo(run(3));
    expect(canRedo(back)).toBe(true);

    const forked = execute(back, registry, command('test/bump', { by: 10 })).state;

    expect(n(forked.scene)).toBe(12);
    expect(canRedo(forked)).toBe(false);
  });

  it('undo ở đầu lịch sử không làm gì', () => {
    const state = createEditorState(base);
    expect(undo(state)).toBe(state);
    expect(redo(state)).toBe(state);
  });

  it('giữ được ít nhất 50 bước (ENG-00)', () => {
    const state = run(50);

    let cursor = state;
    for (let i = 0; i < 50; i += 1) cursor = undo(cursor);

    expect(n(cursor.scene)).toBe(0);
  });

  it('lịch sử bị chặn trần, không lớn vô hạn', () => {
    const state = run(HISTORY_LIMIT + 20);
    expect(state.past.length).toBe(HISTORY_LIMIT);
  });

  it('nhãn đi theo đúng bước đang đứng', () => {
    const state = run(2);
    expect(state.lastLabel).toBe('Tăng 1');
    expect(undo(undo(state)).lastLabel).toBe('');
  });
});

describe('cấp id (A-02)', () => {
  const scene = (ids: string[]): Scene => ({
    ...base,
    elements: ids.map((id) => ({ id, type: 'tile' })),
  });

  it('lấy hậu tố lớn nhất rồi cộng một', () => {
    expect(allocateId(scene(['t1', 't2', 't7']), 't')).toBe('t8');
  });

  it('bỏ qua id không khớp tiền tố', () => {
    expect(allocateId(scene(['piece3', 'cell-0-0']), 't')).toBe('t1');
  });

  it('scene rỗng bắt đầu từ 1', () => {
    expect(allocateId(base, 't')).toBe('t1');
  });
});

describe('lựa chọn', () => {
  it('replace thay hẳn, add cộng dồn, toggle bật tắt', () => {
    const current = new Set(['a', 'b']);

    expect([...applySelection(current, ['c'], 'replace')]).toEqual(['c']);
    expect([...applySelection(current, ['c'], 'add')].sort()).toEqual(['a', 'b', 'c']);
    expect([...applySelection(current, ['a'], 'toggle')]).toEqual(['b']);
  });

  it('chọn vào chỗ trống ở chế độ replace thì bỏ chọn hết', () => {
    expect(applySelection(new Set(['a']), [], 'replace').size).toBe(0);
  });
});
