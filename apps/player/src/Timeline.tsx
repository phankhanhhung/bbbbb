import type { Choreography } from '@combviz/render';
import type { TimelineState } from './useChoreography.js';

/**
 * Thanh timeline của một step có choreography (CHO-02, CHO-11).
 *
 * Ba thứ ở đây từng chỉ dành cho một nhóm người dùng, và cả ba nay dành cho tất cả:
 *
 * - **Nhãn pha hiện ra.** Trước đây chỉ bộ đếm pha (giảm chuyển động) in nó; chế độ
 *   thường chỉ nhét vào `aria-valuetext`. Nghĩa là người sáng mắt xem chuyển động mà
 *   không có chữ nào giải thích — trong khi chữ **đã viết sẵn** cho cả 87 pha của kho.
 * - **Đi từng pha.** "Chạy một mạch quá nhanh để hiểu" không phải vấn đề của riêng
 *   người nhạy cảm với chuyển động, nên nút bật nằm ngay cạnh nút chạy.
 * - **Dừng ở mốc `hold`.** Tác giả nói "đọc cái này đã rồi hãy đi tiếp"; nút chạy
 *   lúc ấy đổi chữ thành "Tiếp" để nói rõ nó đang đợi.
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
  const caption = state.label ?? PHASE_KIND[current?.kind ?? 'focus'] ?? '';
  const counter = current ? `${state.phaseIndex + 1}/${phases.length}` : `0/${phases.length}`;

  /** Chữ dưới thanh — thứ duy nhất nói vì sao hình vừa đổi. */
  const say = (
    <p class="timeline__phase" aria-live="polite">
      <span class="timeline__count">Pha {counter}</span>
      {current ? <span class="timeline__label">{caption}</span> : null}
    </p>
  );

  const modeToggle = (
    <button
      class={state.stepwise ? 'timeline__mode timeline__mode--on' : 'timeline__mode'}
      onClick={() => state.setStepwise(!state.stepwise)}
      aria-pressed={state.stepwise}
    >
      Từng pha
    </button>
  );

  if (state.stepwise) {
    return (
      <div class="timeline timeline--stepwise">
        <nav aria-label="Các pha của bước này">
          <button
            onClick={() => state.goPhase(-1)}
            disabled={state.phaseIndex <= 0}
            aria-label="Pha trước"
          >
            ←
          </button>
          <button
            onClick={() => state.goPhase(1)}
            disabled={state.phaseIndex >= phases.length - 1}
            aria-label="Pha sau"
          >
            →
          </button>
          {modeToggle}
        </nav>
        {say}
      </div>
    );
  }

  return (
    <div class="timeline">
      <nav aria-label="Timeline của bước này">
        <button
          onClick={() => state.setPlaying(!state.playing)}
          aria-label={state.playing ? 'Tạm dừng' : state.holding ? 'Tiếp' : 'Chạy'}
        >
          {state.playing ? '❙❙' : state.holding ? 'Tiếp ▶' : '▶'}
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
        {modeToggle}
      </nav>
      {say}
    </div>
  );
}

/** Nhãn dự phòng khi tác giả không đặt `label` cho pha (`lint/phase-no-label` kêu). */
const PHASE_KIND: Readonly<Record<string, string>> = {
  focus: 'nhấn mạnh',
  dim: 'làm mờ phần còn lại',
  show: 'hiện ra',
  hide: 'ẩn đi',
  move: 'di chuyển',
  morph: 'biến hình',
};
