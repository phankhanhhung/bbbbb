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
  /**
   * Chế độ đi **từng pha**.
   *
   * Trước đây chỉ bật theo `prefers-reduced-motion`, tức chỉ một nhóm người dùng có
   * cách dừng lại ở từng bước. Nhưng "chạy một mạch quá nhanh để hiểu" không phải
   * vấn đề của riêng người nhạy cảm với chuyển động — nên nay ai cũng bật được.
   */
  readonly stepwise: boolean;
  readonly setStepwise: (value: boolean) => void;
  /** Nhãn của pha đang được giải thích — hiện ở **mọi** chế độ. */
  readonly label: string | null;
  /** Đang dừng ở một mốc `hold` và vẫn còn pha phía sau. */
  readonly holding: boolean;
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

  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [stepwise, setStepwise] = useState(reducedMotion ?? prefersReducedMotion());

  /** Các mốc phải dừng lại: cuối những pha có `hold`. */
  const holds = useMemo(
    () =>
      phases
        .filter((p) => (p as { hold?: boolean }).hold === true)
        .map((p) => p.at + p.duration)
        .filter((t) => t < length)
        .sort((a, b) => a - b),
    [phases, length],
  );

  // Step đổi thì timeline về đầu **và đứng yên**. Không reset thì step mới mở ra ở
  // giữa chừng câu chuyện của step cũ, và không nút nào cho biết vì sao.
  //
  // Trước đây nó tự chạy. Nghĩa là người xem vừa mở một bước ra thì hình đã bắt đầu
  // đổi, trước cả khi họ kịp đọc câu đầu của lời kể — và lời kể mới là thứ nói cho
  // họ biết phải nhìn cái gì. Tự chạy tiết kiệm một cú bấm và đổi lại bằng việc mất
  // toàn bộ phần mở đầu.
  useEffect(() => {
    setMs(0);
    setPlaying(false);
  }, [spec, length]);

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

  /**
   * Vị trí hiện tại, giữ **ngoài** state.
   *
   * Bản đầu tính mốc dừng ngay trong hàm cập nhật của `setMs` rồi gọi `halt()` ở đó.
   * Hàm cập nhật phải **thuần**: Preact được phép gọi nó nhiều lần hoặc hoãn lại, nên
   * một `setPlaying(false)` nằm trong ấy có thể không bao giờ có hiệu lực — timeline
   * chạy thẳng qua mốc `hold` mà không dừng. Đọc từ ref rồi quyết định **trước khi**
   * đặt state thì không còn chỗ cho chuyện đó.
   */
  const msRef = useRef(0);
  msRef.current = ms;

  useEffect(() => {
    if (!playing || stepwise || length <= 0) return;
    running.current = true;

    let last: number | null = null;
    const tick = (now: number): void => {
      if (!running.current) return;
      const delta = last === null ? 0 : now - last;
      last = now;

      const current = msRef.current;
      const next = current + delta * speed;
      // Mốc `hold` chặn trước cả điểm cuối: tác giả nói "đọc cái này đã".
      const stop = holds.find((t) => t > current && t <= next);
      if (stop !== undefined) {
        msRef.current = stop;
        setMs(stop);
        halt();
        return;
      }
      if (next >= length) {
        msRef.current = length;
        setMs(length);
        halt();
        return;
      }
      msRef.current = next;
      setMs(next);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      running.current = false;
      cancelAnimationFrame(frame.current);
    };
  }, [playing, stepwise, length, speed, halt, holds]);

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
    setPlaying(false);
  }, []);

  const current = phases[phaseIndex];

  return {
    ms,
    length,
    playing,
    stepwise,
    setStepwise,
    label: current?.label?.vi ?? null,
    holding: !playing && ms > 0 && ms < length && holds.includes(Math.round(ms)),
    phaseIndex,
    anchor: current?.anchor ?? null,
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
