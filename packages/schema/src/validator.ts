import type { Scene } from './scene.js';

/**
 * Validator: ràng buộc trên một Scene, trả về đúng/sai **kèm phần tử vi phạm**
 * (§1.4, BD-04, SBX-02).
 *
 * `violations` không phải chi tiết phụ — nó là toàn bộ giá trị sư phạm. "Cách phủ
 * này sai" thì vô dụng; "hai quân này chồng nhau, ở đây" thì người học sửa được.
 * Đây cũng là điều phân biệt Validator với NG-01: nó kiểm một **cấu hình cụ thể**,
 * không kiểm chứng minh.
 */
export interface SceneValidator {
  readonly id: string;
  readonly label: string;
  check(scene: Scene): ValidatorOutcome;
}

export interface ValidatorOutcome {
  readonly ok: boolean;
  /** Id các element vi phạm — Sandbox tô đỏ đúng chúng. */
  readonly violations: readonly string[];
  /** Câu giải thích cụ thể, hiện cạnh chỗ sai. */
  readonly message?: string;
}

/**
 * Tách id validator có tham số: `pieces-per-row:2` → `{ name, arg: 2 }`.
 *
 * BD-04 yêu cầu built-in "mỗi hàng/cột có đúng k quân", nên k phải đi kèm id.
 * Giữ ở dạng chuỗi để `sandbox.validators` vẫn là một mảng chuỗi phẳng, đọc được
 * trong git diff.
 */
export function parseValidatorId(id: string): { name: string; arg?: number } {
  const colon = id.indexOf(':');
  if (colon === -1) return { name: id };

  const name = id.slice(0, colon);
  const raw = id.slice(colon + 1);
  const arg = Number(raw);
  return Number.isFinite(arg) ? { name, arg } : { name };
}
