import type { Choreography } from '@combviz/render';
import type { TimelineState } from './useChoreography.js';

/**
 * Thanh timeline của một step có choreography (CHO-02).
 *
 * Hai giao diện, không phải một giao diện bị tắt bớt:
 *
 * - Bình thường: play / pause / replay / scrub.
 * - Giảm chuyển động: **bộ đếm pha**. Không có thanh kéo, không có đồng hồ; chỉ
 *   "pha 2/5" kèm nhãn của pha, và hai nút đi tới đi lui. CHO-09 nói bỏ chuyển
 *   động không được làm mất thông tin (NFR-A4), và cách duy nhất giữ đủ thông
 *   tin là cho người dùng dừng ở **từng** pha — khung cuối cùng của timeline là
 *   khung mất mát nhiều nhất, vì pha muộn ghi đè pha sớm.
 */
export function Timeline({
  spec,
  state,
}: {
  spec: Choreography;
  state: TimelineState;
}) {
  const phases = [...spec.phases].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const current = phases[state.phaseIndex];
  const caption = current?.label?.vi ?? PHASE_KIND[current?.kind ?? 'focus'];

  if (state.stepwise) {
    return (
      <nav class="timeline timeline--stepwise" aria-label="Các pha của bước này">
        <button
          onClick={() => state.goPhase(-1)}
          disabled={state.phaseIndex <= 0}
          aria-label="Pha trước"
        >
          ←
        </button>
        <p class="timeline__phase" aria-live="polite">
          <span class="timeline__count">
            Pha {state.phaseIndex + 1}/{phases.length}
          </span>
          {current ? <span class="timeline__label">{caption}</span> : null}
        </p>
        <button
          onClick={() => state.goPhase(1)}
          disabled={state.phaseIndex >= phases.length - 1}
          aria-label="Pha sau"
        >
          →
        </button>
      </nav>
    );
  }

  return (
    <nav class="timeline" aria-label="Timeline của bước này">
      <button
        onClick={() => state.setPlaying(!state.playing)}
        aria-label={state.playing ? 'Tạm dừng' : 'Chạy'}
      >
        {state.playing ? '❙❙' : '▶'}
      </button>
      <button onClick={state.replay} aria-label="Chạy lại">
        ↺
      </button>
      <input
        class="timeline__scrub"
        type="range"
        min={0}
        max={state.length}
        // Bước 1ms chứ không phải 1%: `applyChoreography` nhận ms tuyệt đối, và
        // một thanh kéo tính theo phần trăm sẽ làm cùng một vị trí kéo cho ra
        // khung khác nhau giữa hai step có độ dài khác nhau.
        step={1}
        value={Math.round(state.ms)}
        onInput={(event) => {
          state.setPlaying(false);
          state.setMs(Number((event.currentTarget as HTMLInputElement).value));
        }}
        aria-label="Tua trong bước"
        aria-valuetext={current ? `Pha ${state.phaseIndex + 1}: ${caption}` : 'Chưa bắt đầu'}
      />
      <span class="timeline__count">
        {current ? `${state.phaseIndex + 1}/${phases.length}` : `0/${phases.length}`}
      </span>
    </nav>
  );
}

/** Nhãn dự phòng khi tác giả không đặt `label` cho pha. */
const PHASE_KIND: Readonly<Record<string, string>> = {
  focus: 'nhấn mạnh',
  dim: 'làm mờ phần còn lại',
  show: 'hiện ra',
  hide: 'ẩn đi',
  move: 'di chuyển',
  morph: 'biến hình',
};
