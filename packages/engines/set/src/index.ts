import { defineCommand, type CommandRegistry, type HitTest } from '@combviz/editor';
import type {
  EngineSchemaFragment,
  Scene,
  SceneElement,
  ValidationIssue,
} from '@combviz/schema';
import {
  CELL,
  VENN_R,
  INCIDENCE_SEP,
  deriveSet,
  incidenceId,
  vennCentres,
  vennRegionCentre,
  vennTooManySets,
} from './derive.js';
import { SetConfig, SetElement, TokenElement, SET_LIMITS } from './schema.js';
import { resolveSetValidator, SET_VALIDATOR_IDS } from './validators.js';

export * from './schema.js';
export * from './derive.js';
export * from './validators.js';
export { setEnvironment } from './dsl.js';
export { setRenderer } from './render.js';

/**
 * Bật/tắt quan hệ thuộc — thao tác **duy nhất** của sandbox tập hợp.
 *
 * Cả họ bài extremal set theory là "chọn họ tập con thoả điều kiện gì đó", và
 * thao tác hợp lệ duy nhất là thêm/bớt một phần tử khỏi một tập. Giữ tập lệnh
 * hẹp đúng bằng bài toán là cùng bài học với `board/flip-line` và
 * `sequence/combine`.
 */
const toggleMembership = defineCommand<{ token: string; set: string }>({
  type: 'set/toggle-membership',
  label: () => 'Đổi quan hệ thuộc',
  apply(scene, params) {
    const index = scene.elements.findIndex(
      (e) => e.id === params.token && e.type === 'token',
    );
    if (index === -1) return null;
    if (!scene.elements.some((e) => e.id === params.set && e.type === 'set')) return null;

    const token = scene.elements[index] as SceneElement;
    const sets = ((token['sets'] as string[] | undefined) ?? []).slice();
    const at = sets.indexOf(params.set);
    if (at === -1) sets.push(params.set);
    else sets.splice(at, 1);

    const elements = [...scene.elements];
    elements[index] = { ...token, sets };
    return { ...scene, elements };
  },
});

const addToken = defineCommand<{ id: string; label?: string }>({
  type: 'set/add-token',
  label: () => 'Thêm phần tử',
  apply(scene, params) {
    if (scene.elements.some((e) => e.id === params.id)) return null;
    return {
      ...scene,
      elements: [
        ...scene.elements,
        {
          id: params.id,
          type: 'token',
          sets: [],
          ...(params.label ? { label: params.label } : {}),
        },
      ],
    };
  },
});

const removeElements = defineCommand<{ ids: readonly string[] }>({
  type: 'set/remove',
  label: (params) => `Xoá ${params.ids.length} phần tử`,
  apply(scene, params) {
    const doomed = new Set(params.ids);
    const kept = scene.elements.filter((e) => !doomed.has(e.id));
    if (kept.length === scene.elements.length) return null;

    // Xoá một tập phải kéo theo mọi tham chiếu tới nó, nếu không token sẽ trỏ
    // vào tập đã biến mất — hợp lệ về JSON, vô nghĩa về toán.
    return {
      ...scene,
      elements: kept.map((e) =>
        e.type === 'token'
          ? { ...e, sets: ((e['sets'] as string[]) ?? []).filter((id) => !doomed.has(id)) }
          : e,
      ),
    };
  },
});

export const setCommands: CommandRegistry = {
  [toggleMembership.type]: toggleMembership,
  [addToken.type]: addToken,
  [removeElements.type]: removeElements,
};

export const setHitTest: HitTest = (scene, point) => {
  const derived = deriveSet(scene);

  if (derived.view === 'venn' && !vennTooManySets(derived)) {
    const hits: string[] = [];
    for (const token of derived.tokens) {
      const c = vennRegionCentre(token.sets, derived.sets);
      if (Math.hypot(c.x - point.x, c.y - point.y) <= 3) hits.push(token.id);
    }
    const centres = vennCentres(derived.sets.length);
    derived.sets.forEach((set, i) => {
      const c = centres[i] as { x: number; y: number };
      if (Math.hypot(c.x - point.x, c.y - point.y) <= VENN_R) hits.push(set.id);
    });
    return hits;
  }

  const col = Math.floor(point.x / CELL);
  const row = Math.floor(point.y / CELL);
  const token = derived.tokens[row];
  const set = derived.sets[col];
  // Ô của bảng incidence mang id ghép `token~set`: chạm vào ô **là** chạm vào
  // quan hệ thuộc, đúng thứ người học muốn bật/tắt.
  return token && set && col >= 0 && row >= 0
    ? [incidenceId(token.id, set.id), token.id, set.id]
    : [];
};

export const setSchemaFragment: EngineSchemaFragment = {
  id: 'set',
  configSchema: SetConfig,
  elementSchemas: { token: TokenElement, set: SetElement },
  bounds: { engine: 'set', limits: SET_LIMITS },
  resolveValidator: resolveSetValidator,
  validatorIds: SET_VALIDATOR_IDS,

  /**
   * Ô của bảng incidence là element **ngầm định**: `token~set` cho mỗi cặp.
   *
   * Nhờ vậy anchor trỏ thẳng vào một ô ("[[a1|bạn 3 có chọn CLB B]]") mà ANC-02
   * không báo rot — cùng cơ chế với ô bàn cờ (D-16).
   */
  implicitElementIds(scene: Scene): Set<string> {
    const derived = deriveSet(scene);
    const ids = new Set<string>();
    for (const token of derived.tokens) {
      for (const set of derived.sets) ids.add(incidenceId(token.id, set.id));
    }
    return ids;
  },

  checkBounds(scene: Scene, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const derived = deriveSet(scene);

    if (derived.tokens.length > SET_LIMITS.maxTokens) {
      issues.push({
        code: 'bounds/too-many-tokens',
        severity: 'error',
        message: `${derived.tokens.length} phần tử, vượt trần ${SET_LIMITS.maxTokens}`,
        path: `${path}/elements`,
      });
    }

    if (derived.sets.length > SET_LIMITS.maxSets) {
      issues.push({
        code: 'bounds/too-many-sets',
        severity: 'error',
        message: `${derived.sets.length} tập, vượt trần ${SET_LIMITS.maxSets}`,
        path: `${path}/elements`,
      });
    }

    // Venn quá 3 tập là **sự thật hình học**, không phải giới hạn cài đặt: bốn
    // hình tròn không tạo đủ 15 vùng giao. Báo ở đây thay vì vẽ ra một hình sai.
    if ((scene.config as { view?: string })?.view === 'venn' && vennTooManySets(derived)) {
      issues.push({
        code: 'bounds/venn-too-many-sets',
        severity: 'error',
        message: `Sơ đồ Venn chỉ vẽ được tối đa ${SET_LIMITS.maxVennSets} tập, bài này có ${derived.sets.length}`,
        path: `${path}/config/view`,
        hint: 'Dùng view "matrix" — bảng incidence đọc được ở mọi số tập',
      });
    }

    for (const element of scene.elements) {
      if (element.id.includes(INCIDENCE_SEP)) {
        issues.push({
          code: 'bounds/ambiguous-id',
          severity: 'error',
          message: `Id "${element.id}" chứa "${INCIDENCE_SEP}"`,
          path: `${path}/elements`,
          hint: 'Dấu đó dành riêng cho id ô bảng incidence; chứa nó thì anchor có thể trỏ nhầm ô',
        });
      }
    }

    // Tham chiếu tới tập không tồn tại: token vẫn vẽ ra, cột thì không, và bài
    // trông vẫn đúng cho tới khi có người đếm.
    const known = new Set(derived.sets.map((s) => s.id));
    for (const element of scene.elements) {
      if (element.type !== 'token') continue;
      for (const id of (element['sets'] as string[] | undefined) ?? []) {
        if (!known.has(id)) {
          issues.push({
            code: 'bounds/unknown-set-ref',
            severity: 'error',
            message: `"${element.id}" thuộc tập "${id}" không tồn tại`,
            path: `${path}/elements`,
          });
        }
      }
    }

    return issues;
  },
};
