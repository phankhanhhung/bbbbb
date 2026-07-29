import { clamp01, easeInOutCubic, type EasingFn } from '../easing.js';
import { interpolateNodes } from '../interpolate.js';
import type { SvgNode } from '../svg-node.js';
import { patch } from './patch.js';

/**
 * Chạy chuyển tiếp giữa hai cây SVG bằng rAF.
 *
 * Chỗ này **không** chứa logic animation — nó chỉ là đồng hồ. Toàn bộ "khung
 * hình tại thời điểm t trông thế nào" nằm ở `interpolateNodes` thuần (D-05), nên
 * render video sẽ dùng lại đúng phép tính đó với timestep cố định thay vì rAF.
 *
 * Tôn trọng `prefers-reduced-motion` ngay tại đây (NFR-A4, PLY-04): nhảy thẳng
 * tới trạng thái đích, không phải rút ngắn thời lượng.
 */
export interface AnimationHandle {
  cancel(): void;
  readonly finished: Promise<void>;
}

export interface AnimateOptions {
  readonly durationMs: number;
  readonly easing?: EasingFn;
  /** Ép bỏ qua animation. Vắng thì tự đọc `prefers-reduced-motion`. */
  readonly reducedMotion?: boolean;
}

export function animate(
  container: Element,
  from: readonly SvgNode[],
  to: readonly SvgNode[],
  options: AnimateOptions,
): AnimationHandle {
  const easing = options.easing ?? easeInOutCubic;
  const reduced = options.reducedMotion ?? prefersReducedMotion();

  if (reduced || options.durationMs <= 0) {
    patch(container, to);
    return { cancel: () => {}, finished: Promise.resolve() };
  }

  let frame = 0;
  let cancelled = false;
  let start: number | null = null;

  const finished = new Promise<void>((resolve) => {
    const step = (now: number): void => {
      if (cancelled) return resolve();
      if (start === null) start = now;

      const t = clamp01((now - start) / options.durationMs);
      patch(container, interpolateNodes(from, to, easing(t)));

      if (t >= 1) return resolve();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  });

  return {
    cancel(): void {
      cancelled = true;
      cancelAnimationFrame(frame);
      patch(container, to);
    },
    finished,
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
