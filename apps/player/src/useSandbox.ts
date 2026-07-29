import { useCallback, useMemo, useState } from 'preact/hooks';
import {
  canRedo,
  canUndo,
  createEditorState,
  execute,
  redo,
  undo,
  type Command,
  type CommandRegistry,
  type EditorState,
  type Selection,
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
}

export interface SandboxApi {
  readonly state: SandboxState;
  run(command: Command): boolean;
  setSelection(selection: Selection): void;
  toggleValidator(id: string): void;
  undo(): void;
  redo(): void;
  resetTo(scene: Scene): void;
}

export function useSandbox(options: SandboxOptions): SandboxApi {
  const [editor, setEditor] = useState<EditorState>(() =>
    createEditorState(options.initialScene),
  );
  const [selection, setSelection] = useState<Selection>(() => new Set<string>());

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
  }, []);

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
    },
    run,
    setSelection,
    toggleValidator,
    undo: () => setEditor(undo),
    redo: () => setEditor(redo),
    resetTo,
  };
}
