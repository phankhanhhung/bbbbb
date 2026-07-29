import type { MotionTokens } from '@combviz/theme';

/**
 * Easing thuần, tra theo tên trong theme tokens.
 *
 * Không dùng CSS easing: chuyển động phải tính được trong Node để render video
 * (REN-04) chứ không chỉ chạy được trong browser.
 */
export type EasingFn = (t: number) => number;

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

const EASINGS: Record<MotionTokens['easing'], EasingFn> = {
  'ease-in-out-cubic': easeInOutCubic,
};

export function easingOf(motion: MotionTokens): EasingFn {
  return EASINGS[motion.easing];
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
