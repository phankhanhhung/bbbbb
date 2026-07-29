import type { Scene } from '@combviz/schema';

/** Điểm trong hệ toạ độ **scene**, không phải pixel màn hình. */
export interface ScenePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Tìm element nằm dưới một điểm (A-05).
 *
 * Cố ý **không** dùng `document.elementFromPoint`: hình học thuần thì test được
 * bằng Vitest, chạy được trong Node, và không phụ thuộc vào việc element có đang
 * nằm trong DOM hay bị một lớp trong suốt che. Đó cũng là điều kiện để lớp
 * interaction tách khỏi renderer đúng như D-03 đòi.
 *
 * Trả về **trên trước dưới sau** — thứ tự vẽ đảo ngược, vì thứ người dùng thấy
 * trên cùng là thứ họ nghĩ mình đang chạm vào.
 */
export type HitTest = (scene: Scene, point: ScenePoint) => string[];
