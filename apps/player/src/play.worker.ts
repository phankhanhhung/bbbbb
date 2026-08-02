/// <reference lib="webworker" />
import { DEFAULT_BUDGET, type DslEnvironment } from '@combviz/dsl';
import {
  parseMoves,
  runMoves,
  scriptPlayRules,
  solveGame,
  type CommandRegistry,
  type PlayRules,
} from '@combviz/editor';
import type { Scene } from '@combviz/schema';
import type { PlayRequest, PlayResponse } from './play-host.js';

/**
 * Worker chở **hai** loại việc của lớp ván (NFR-S2, NFR-P5, M78.6).
 *
 * `moves` là một lượt gọi luật do tác giả viết — nó ở đây vì cách ly, và vì chỉ ở ngoài
 * luồng chính mới giết được mã không chịu dừng (xem `play-host.ts`). `solve` ở đây vì
 * lý do khác hẳn: Chomp $6\times6$ mất $0{,}83$ s, và NFR-P5 đòi worker cho mọi thứ
 * chạy quá $100$ ms. Trộn hai lý do vào một cái tên thì cái hạn giờ sẽ bị áp nhầm chỗ.
 *
 * Worker **không giữ trạng thái** giữa các lần gọi, cùng lý do đã ghi ở
 * `analyzer.worker.ts`: mỗi thông điệp mang theo scene đầy đủ, nên nó bị giết lúc nào
 * cũng được mà không mất gì. Đó là điều kiện để `terminate()` là một cách xử lý bình
 * thường chứ không phải một tai nạn.
 */

interface PlayEngine {
  playRules(rule: string): PlayRules | null;
  environment(scene: Scene): DslEnvironment;
  commands: CommandRegistry;
}

const LOADERS: Record<string, () => Promise<PlayEngine>> = {
  board: async () => {
    const m = await import('@combviz/engine-board');
    return { playRules: m.boardPlayRules, environment: m.boardEnvironment, commands: m.boardCommands };
  },
  game: async () => {
    const m = await import('@combviz/engine-game');
    return { playRules: m.gamePlayRules, environment: m.gameEnvironment, commands: m.gameCommands };
  },
  graph: async () => {
    const m = await import('@combviz/engine-graph');
    return { playRules: m.graphPlayRules, environment: m.graphEnvironment, commands: m.graphCommands };
  },
};

async function handle(request: PlayRequest): Promise<PlayResponse['result']> {
  const loader = Object.hasOwn(LOADERS, request.engine) ? LOADERS[request.engine] : undefined;
  if (!loader) throw new Error(`Engine "${request.engine}" chưa có lớp ván`);
  const engine = await loader();

  if (request.kind === 'moves') {
    const out = runMoves(
      parseMoves(request.script),
      request.scene,
      request.player,
      engine.environment(request.scene),
      engine.commands,
      DEFAULT_BUDGET,
    );
    // Lời từ chối của script là **lỗi** nhìn từ đây, không phải "không có nước nào":
    // trả về danh sách rỗng thì giao diện vẽ ra một ván đã kết thúc.
    if (out.refusal !== null) throw new Error(out.refusal);
    return out.moves;
  }

  // Luật của tác giả cũng **giải được**. Không thì cửa thoát mở đúng một nửa: viết được
  // luật mà không hỏi được "ai thắng thế này", và câu ấy là một phần ba của GM-03.
  const rules =
    request.rule === 'script'
      ? request.script === undefined
        ? null
        : scriptPlayRules(parseMoves(request.script), engine.environment, engine.commands, {
            budget: DEFAULT_BUDGET,
          })
      : engine.playRules(request.rule);
  if (!rules) throw new Error(`Engine "${request.engine}" không có họ luật "${request.rule}"`);
  return solveGame(request.scene, request.toMove, rules, engine.commands, {
    misere: request.misere,
    ...(request.bound === undefined ? {} : { bound: request.bound }),
  });
}

self.onmessage = (event: MessageEvent<PlayRequest>) => {
  const { id } = event.data;
  handle(event.data).then(
    (result) => (self as unknown as Worker).postMessage({ id, ok: true, result } satisfies PlayResponse),
    (error: unknown) =>
      (self as unknown as Worker).postMessage({
        id,
        ok: false,
        error: (error as Error).message,
      } satisfies PlayResponse),
  );
};
