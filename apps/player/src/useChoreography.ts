import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { activePhases, timelineLength, type Choreography } from '@combviz/render';

/**
 * Đồng hồ của timeline choreography (CHO-02).
 *
 * Hook này **chỉ là đồng hồ** — cùng vai trò `animate()` đóng cho chuyển tiếp
 * giữa hai step. Toàn bộ "khung hình tại `ms` trông thế nào" nằm ở
 * `applyChoreography` thuần, và đó là lý do render headless dùng lại được đúng
 * phép tính này với timestep cố định thay vì rAF (CHO-08, REN-04).
 *
 * **Giảm chuyển động không phải là tua tới cuối (CHO-09).** Cám dỗ là trả về
 * `ms = timelineLength` rồi thôi: hình cuối cùng thì vẫn đúng. Nhưng pha muộn
 * ghi đè pha sớm — một pha `hide` ở giây thứ ba xoá sạch thứ mà pha `focus` ở
 * giây đầu vừa chỉ ra, nên khung cuối là khung **mất nhiều thông tin nhất**.
 * Thay vào đó ta biến timeline thành một bộ đếm pha: người dùng bấm qua từng
 * pha, mỗi pha dừng ở đúng lúc nó vừa kết thúc. Cùng một hàm thuần, chỉ khác ở
 * chỗ `ms` nhảy theo mốc thay vì chạy liên tục.
 */
export interface TimelineState {
  readonly ms: number;
  readonly length: number;
  readonly playing: boolean;
  /** Chế độ bộ đếm pha — bật khi người dùng chọn giảm chuyển động. */
  readonly stepwise: boolean;
  /** Chỉ số pha đang được giải thích, hoặc `-1` khi chưa pha nào bắt đầu. */
  readonly phaseIndex: number;
  /** Anchor của pha ấy — Player sáng đúng câu đang được nói (CHO-07). */
  readonly anchor: string | null;
  readonly setMs: (ms: number) => void;
  readonly setPlaying: (playing: boolean) => void;
  readonly replay: () => void;
  readonly goPhase: (delta: number) => void;
}

const NO_TIMELINE: readonly [] = [];

export function useChoreography(
  spec: Choreography | undefined,
  speed: number,
  reducedMotion?: boolean,
): TimelineState {
  const phases = useMemo(
    () => (spec ? [...spec.phases].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)) : NO_TIMELINE),
    [spec],
  );
  const length = useMemo(() => (spec ? timelineLength(spec) : 0), [spec]);
  const stepwise = reducedMotion ?? prefersReducedMotion();

  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Step đổi thì timeline phải về đầu. Không reset thì step mới mở ra ở giữa
  // chừng câu chuyện của step cũ, và không nút nào cho biết vì sao.
  useEffect(() => {
    setMs(0);
    setPlaying(!stepwise && length > 0);
  }, [spec, length, stepwise]);

  const frame = useRef(0);
  /**
   * Cờ **đồng bộ** cho vòng rAF, bên cạnh state.
   *
   * `setPlaying(false)` chỉ có hiệu lực ở lần render sau, nên một khung rAF đã
   * lên lịch vẫn kịp chạy thêm một nhịp — và vì nhịp ấy cộng dồn vào giá trị
   * hiện tại, nó ghi đè đúng cái mốc người dùng vừa tua tới.
   */
  const running = useRef(false);
  const halt = useCallback(() => {
    running.current = false;
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing || stepwise || length <= 0) return;
    running.current = true;

    let last: number | null = null;
    const tick = (now: number): void => {
      if (!running.current) return;
      const delta = last === null ? 0 : now - last;
      last = now;
      setMs((current) => {
        const next = current + delta * speed;
        if (next >= length) {
          halt();
          return length;
        }
        return next;
      });
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      running.current = false;
      cancelAnimationFrame(frame.current);
    };
  }, [playing, stepwise, length, speed, halt]);

  const phaseIndex = useMemo(() => {
    if (!spec) return -1;
    const started = activePhases(spec, ms);
    const last = started.at(-1);
    return last ? phases.findIndex((p) => p.id === last.id) : -1;
  }, [spec, phases, ms]);

  const goPhase = useCallback(
    (delta: number) => {
      if (phases.length === 0) return;
      const target = Math.min(Math.max(phaseIndex + delta, 0), phases.length - 1);
      const phase = phases[target];
      if (!phase) return;
      // Dừng ở lúc pha **vừa xong**, không phải lúc nó bắt đầu: bộ đếm pha phải
      // cho thấy kết quả của pha, chứ không phải khung hình ngay trước nó.
      halt();
      setMs(phase.at + phase.duration);
    },
    [phases, phaseIndex, halt],
  );

  const replay = useCallback(() => {
    running.current = false;
    setMs(0);
    setPlaying(!stepwise);
  }, [stepwise]);

  return {
    ms,
    length,
    playing,
    stepwise,
    phaseIndex,
    anchor: phases[phaseIndex]?.anchor ?? null,
    setMs: (value: number) => {
      halt();
      setMs(value);
    },
    setPlaying,
    replay,
    goPhase,
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
