import { useCallback, useMemo, useState } from 'preact/hooks';
import {
  canRedo,
  canUndo,
  createEditorState,
  createTrail,
  execute,
  moveTrail,
  positionKey,
  redo,
  stepTrail,
  undo,
  type Command,
  type CommandRegistry,
  type EditorState,
  type Selection,
  type Trail,
} from '@combviz/editor';
import { tryEvaluate, type DslEnvironment } from '@combviz/dsl';
import type { Invariant, Scene, SceneValidator, ValidatorOutcome } from '@combviz/schema';

/**
 * Trạng thái của một phiên Sandbox (SBX-01/02, PRN-01).
 *
 * Validator và invariant được tính **lại sau mỗi lệnh**, không phải khi bấm
 * "kiểm tra". Đó là toàn bộ giá trị sư phạm: học sinh thấy đại lượng đứng yên
 * *trong lúc* mình nghịch, chứ không phải sau khi nộp bài.
 */
export interface SandboxOptions {
  readonly initialScene: Scene;
  readonly commands: CommandRegistry;
  readonly validators: readonly SceneValidator[];
  readonly invariants: readonly Invariant[];
  readonly environmentFor: (scene: Scene) => DslEnvironment | null;
  readonly goalExpr?: string;
}

export interface ValidatorState {
  readonly validator: SceneValidator;
  readonly enabled: boolean;
  readonly outcome: ValidatorOutcome;
}

export interface SandboxState {
  readonly scene: Scene;
  readonly selection: Selection;
  readonly validators: readonly ValidatorState[];
  /** Id các element đang vi phạm ràng buộc **đang bật**. */
  readonly violations: ReadonlySet<string>;
  readonly invariantValues: readonly { invariant: Invariant; value: number | null }[];
  readonly goalReached: boolean | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly lastLabel: string;
  /** SBX-06 — những chỗ người học đã đặt chân. Không hơn. */
  readonly trail: Trail;
}

export interface SandboxApi {
  readonly state: SandboxState;
  run(command: Command): boolean;
  setSelection(selection: Selection): void;
  toggleValidator(id: string): void;
  undo(): void;
  redo(): void;
  /** Đứng về một chỗ **đã tới**. Chạm một chấm trên bản đồ đi qua đây. */
  jumpTo(nodeId: string): void;
  resetTo(scene: Scene): void;
}

export function useSandbox(options: SandboxOptions): SandboxApi {
  const [editor, setEditor] = useState<EditorState>(() =>
    createEditorState(options.initialScene),
  );
  const [selection, setSelection] = useState<Selection>(() => new Set<string>());
  const [trail, setTrail] = useState<Trail>(() => createTrail(options.initialScene));

  // SBX-02: bật/tắt từng ràng buộc để "nới luật" khi thí nghiệm. Mặc định bật
  // hết — người học phải chủ động tắt, chứ không phải chủ động bật.
  const [disabled, setDisabled] = useState<ReadonlySet<string>>(() => new Set<string>());

  const scene = editor.scene;
  const environment = useMemo(
    () => options.environmentFor(scene),
    [options, scene],
  );

  const validators = useMemo<ValidatorState[]>(
    () =>
      options.validators.map((validator) => ({
        validator,
        enabled: !disabled.has(validator.id),
        outcome: validator.check(scene),
      })),
    [options.validators, scene, disabled],
  );

  const violations = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of validators) {
      if (!entry.enabled) continue;
      for (const id of entry.outcome.violations) ids.add(id);
    }
    return ids;
  }, [validators]);

  const invariantValues = useMemo(
    () =>
      options.invariants.map((invariant) => {
        if (!environment) return { invariant, value: null };
        const outcome = tryEvaluate(invariant.expr, environment);
        return {
          invariant,
          value: outcome.ok && typeof outcome.value === 'number' ? outcome.value : null,
        };
      }),
    [options.invariants, environment],
  );

  const goalReached = useMemo(() => {
    if (!options.goalExpr || !environment) return null;
    const outcome = tryEvaluate(options.goalExpr, environment);
    return outcome.ok && typeof outcome.value === 'boolean' ? outcome.value : null;
  }, [options.goalExpr, environment]);

  const run = useCallback(
    (cmd: Command): boolean => {
      let applied = false;
      setEditor((current) => {
        const result = execute(current, options.commands, cmd);
        applied = result.applied;
        // Chỉ lệnh **áp được** mới để lại vết: một lệnh bị từ chối không đưa
        // người học đi đâu cả, và ghi nó vào bản đồ là vẽ một chỗ họ chưa tới.
        if (result.applied) {
          setTrail((t) => stepTrail(t, result.state.scene, result.state.lastLabel));
        }
        return result.state;
      });
      return applied;
    },
    [options.commands],
  );

  const toggleValidator = useCallback((id: string) => {
    setDisabled((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const resetTo = useCallback((next: Scene) => {
    setEditor(createEditorState(next));
    setSelection(new Set<string>());
    setTrail(createTrail(next));
  }, []);

  /**
   * Undo/redo/nhảy đều là **đứng sang chỗ khác**, không phải đi một bước.
   *
   * Một chỗ duy nhất tính lại `at` từ scene mới, thay vì ba chỗ tự đoán mình vừa
   * đi đâu — ba chỗ thì chỗ thứ ba sẽ lệch, và lệch ở đây nghĩa là chấm "đang
   * đứng" trên bản đồ trỏ sai.
   */
  const walk = useCallback((next: (current: EditorState) => EditorState) => {
    setEditor((current) => {
      const after = next(current);
      setTrail((t) => moveTrail(t, positionKey(after.scene)));
      return after;
    });
  }, []);

  const jumpTo = useCallback(
    (nodeId: string) => {
      setTrail((t) => {
        const node = t.nodes.get(nodeId);
        // Nhảy **không** đi qua `execute`: nó không phải một lệnh, nên lịch sử
        // undo nhận nó như một lần đặt lại — đúng, vì cây và dòng là hai cách ghi
        // khác nhau và cây mới là cái giữ được nhánh bỏ dở.
        if (node) setEditor(createEditorState(node.scene));
        return node ? moveTrail(t, nodeId) : t;
      });
      setSelection(new Set<string>());
    },
    [],
  );

  return {
    state: {
      scene,
      selection,
      validators,
      violations,
      invariantValues,
      goalReached,
      canUndo: canUndo(editor),
      canRedo: canRedo(editor),
      lastLabel: editor.lastLabel,
      trail,
    },
    run,
    setSelection,
    toggleValidator,
    undo: () => walk(undo),
    redo: () => walk(redo),
    jumpTo,
    resetTo,
  };
}
