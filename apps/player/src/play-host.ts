import type { Move, PlayPlayer, SolveResult } from '@combviz/editor';
import type { Scene } from '@combviz/schema';

/**
 * **Chủ của Worker chơi** — chỗ cái hạn giờ thật sự có răng (NFR-S2, NFR-P5, M78.6).
 *
 * Tách khỏi hook Preact và khỏi `Worker` của trình duyệt, vì thứ đáng kiểm ở đây không
 * phải là "gửi thông điệp đi được không" mà là **giết được mã không chịu dừng không**.
 * Câu ấy chỉ trả lời được bằng một worker giả không bao giờ trả lời, và một worker giả
 * thì chỉ nhét vào được nếu chỗ này nhận một hàm dựng chứ không tự `new Worker`.
 *
 * ## Vì sao đồng hồ **ngoài** tiến trình, khi trong tiến trình đã có một cái
 *
 * `interpreter.ts` đã đếm bước và soát hạn — nhưng nó soát mỗi `steps & 2047` bước. Một
 * builtin duyệt cấu trúc khổng lồ **trong một bước** thì không bao giờ chạm tới chỗ
 * soát ấy, và không ai cắt được nó từ bên trong. Đó chính xác là lỗ mà `terminate()`
 * bịt, và là lý do duy nhất Worker có mặt ở nhánh script.
 *
 * ## Hai loại việc, hai cái hạn
 *
 * Áp một hạn chung là giết đúng thứ vừa xây: solver M78.5 **được phép** chạy vài giây
 * (bàn Chomp $6\times6$ mất $0{,}83$ s) vì nó là một phép phân tích có trần riêng đếm
 * được, còn một lượt gọi script thì NFR-S2 cho $100$ ms.
 */

/** Trần một lượt gọi script (NFR-S2). */
export const PLAY_SCRIPT_MS = 100;

/**
 * Trần một lượt giải.
 *
 * Không phải $100$ ms: solver có trần riêng đếm bằng số thế và số cạnh, tất định, và
 * nó là thứ quyết định solver dừng ở đâu. Đồng hồ này chỉ là lưới cuối cho trường hợp
 * bệnh lý — một họ luật nhánh rộng bất ngờ — nên nó rộng, và nó **không** được là thứ
 * cắt trước trong lúc chạy bình thường.
 */
export const PLAY_SOLVE_MS = 15_000;

export type PlayRequest =
  | {
      readonly id: number;
      readonly kind: 'solve';
      readonly engine: string;
      readonly rule: string;
      readonly scene: Scene;
      readonly toMove: PlayPlayer;
      readonly misere: boolean;
      readonly bound?: number;
      /**
       * Bắt buộc khi `rule === 'script'`.
       *
       * Không có nó thì cửa thoát cho tác giả mở đúng một nửa: viết được luật mà không
       * hỏi được *"ai thắng thế này"* — và câu ấy là một phần ba của GM-03.
       */
      readonly script?: string;
    }
  | {
      readonly id: number;
      readonly kind: 'moves';
      readonly engine: string;
      readonly script: string;
      readonly scene: Scene;
      readonly player: PlayPlayer;
    };

export interface PlayResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly result?: SolveResult | readonly Move[];
  readonly error?: string;
}

/** Đúng phần `Worker` mà chỗ này dùng — không hơn, để test nhét vào được cái giả. */
export interface PlayWorkerLike {
  postMessage(message: PlayRequest): void;
  terminate(): void;
  onmessage: ((event: { data: PlayResponse }) => void) | null;
}

interface Pending {
  readonly resolve: (value: PlayResponse) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class PlayHost {
  private worker: PlayWorkerLike | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 0;

  constructor(private readonly spawn: () => PlayWorkerLike) {}

  private get live(): PlayWorkerLike {
    if (this.worker) return this.worker;
    const instance = this.spawn();
    instance.onmessage = (event) => this.settle(event.data);
    this.worker = instance;
    return instance;
  }

  private settle(response: PlayResponse): void {
    const waiting = this.pending.get(response.id);
    // Trả lời cho một yêu cầu đã bỏ (người học nhảy sang thế khác) là chuyện thường,
    // không phải lỗi: bỏ qua, đừng ném.
    if (!waiting) return;
    clearTimeout(waiting.timer);
    this.pending.delete(response.id);
    waiting.resolve(response);
  }

  /**
   * Giết worker và **đóng mọi yêu cầu đang chờ**, không chỉ cái quá hạn.
   *
   * Chỗ này dễ làm sai theo hướng im lặng: giết worker rồi chỉ báo lỗi cho yêu cầu vừa
   * hết giờ thì những yêu cầu còn lại treo mãi — chúng đang đợi một tiến trình không
   * còn tồn tại. Triệu chứng là một spinner quay vĩnh viễn mà không có lỗi nào, tức là
   * đúng cái mà NFR-S2 bắt phải tránh.
   */
  private kill(reason: string): void {
    this.worker?.terminate();
    this.worker = null;
    const waiting = [...this.pending.entries()];
    this.pending.clear();
    for (const [id, entry] of waiting) {
      clearTimeout(entry.timer);
      entry.resolve({ id, ok: false, error: reason });
    }
  }

  request(
    payload: Omit<Extract<PlayRequest, { kind: 'solve' }>, 'id'> | Omit<Extract<PlayRequest, { kind: 'moves' }>, 'id'>,
  ): Promise<PlayResponse> {
    const id = (this.nextId += 1);
    const request = { ...payload, id } as PlayRequest;
    const limit = request.kind === 'moves' ? PLAY_SCRIPT_MS : PLAY_SOLVE_MS;

    return new Promise<PlayResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.kill(
          request.kind === 'moves'
            ? `Luật chơi chạy quá ${PLAY_SCRIPT_MS}ms nên đã bị dừng — nhiều khả năng script đang duyệt một tập quá lớn`
            : `Phép giải chạy quá ${PLAY_SOLVE_MS}ms nên đã bị dừng`,
        );
      }, limit);
      this.pending.set(id, { resolve, timer });
      this.live.postMessage(request);
    });
  }

  dispose(): void {
    this.kill('Đã đóng bảng chơi');
  }
}
