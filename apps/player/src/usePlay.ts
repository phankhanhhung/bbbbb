import { useEffect, useRef, useState } from 'preact/hooks';
import { hashScene } from '@combviz/render';
import type { Move, PlayPlayer, SolveResult } from '@combviz/editor';
import type { Scene } from '@combviz/schema';
import { PlayHost, type PlayWorkerLike } from './play-host.js';

/**
 * Lớp ván nhìn từ giao diện: hỏi worker, nhớ câu trả lời, và **nói khi hỏng**.
 *
 * Khuôn lấy từ `useAnalyzer.ts` và ba tính chất ở đó giữ nguyên nguyên nhân: worker vì
 * việc chạy quá $100$ ms (NFR-P5), cache theo hash scene vì người học đi tới rồi quay
 * lại liên tục, huỷ theo id vì nhảy nhanh sẽ xếp hàng nhiều yêu cầu mà chỉ kết quả của
 * thế *đang xem* mới có nghĩa.
 *
 * Cái thêm vào so với khuôn ấy là `error` **luôn có đường ra màn hình**. Analyzer im
 * lặng thì cùng lắm mất một dòng thông tin phụ; luật chơi im lặng thì người học thấy
 * một ván đã kết thúc và không ai nói cho họ biết là nó gãy.
 */
export interface PlayState<T> {
  readonly value: T | null;
  readonly pending: boolean;
  readonly error: string | null;
}

const IDLE = { value: null, pending: false, error: null } as const;

const cache = new Map<string, unknown>();
const CACHE_LIMIT = 64;

function remember(key: string, value: unknown): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

function useHost(): PlayHost | null {
  const host = useRef<PlayHost | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    const instance = new PlayHost(
      () =>
        new Worker(new URL('./play.worker.js', import.meta.url), {
          type: 'module',
        }) as unknown as PlayWorkerLike,
    );
    host.current = instance;
    force((n) => n + 1);
    return () => {
      instance.dispose();
      host.current = null;
    };
  }, []);

  return host.current;
}

/** Ai thắng thế này (GM-03). `null` khi chưa hỏi xong hoặc không giải được. */
export function useSolve(
  scene: Scene | undefined,
  rule: string | undefined,
  toMove: PlayPlayer,
  misere: boolean,
  bound?: number,
): PlayState<SolveResult> {
  const host = useHost();
  const [state, setState] = useState<PlayState<SolveResult>>(IDLE);

  useEffect(() => {
    if (!scene || !rule || !host) {
      setState(IDLE);
      return;
    }

    const key = `solve:${scene.engine}:${rule}:${hashScene(scene)}:${toMove}:${misere}:${bound ?? ''}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      setState({ value: cached as SolveResult, pending: false, error: null });
      return;
    }

    let live = true;
    setState({ value: null, pending: true, error: null });
    void host
      .request({
        kind: 'solve',
        engine: scene.engine,
        rule,
        scene,
        toMove,
        misere,
        ...(bound === undefined ? {} : { bound }),
      })
      .then((response) => {
        // Huỷ nhìn từ phía nhận, y như `useAnalyzer`: worker chạy nốt, nhưng kết quả
        // của một thế đã rời đi thì không bao giờ chạm màn hình.
        if (!live) return;
        if (response.ok) {
          remember(key, response.result);
          setState({ value: response.result as SolveResult, pending: false, error: null });
        } else {
          setState({ value: null, pending: false, error: response.error ?? 'lỗi không rõ' });
        }
      });

    return () => {
      live = false;
    };
  }, [scene, rule, toMove, misere, bound, host]);

  return state;
}

/** Nước đi ở thế này, khi luật do **tác giả** viết (DSL-03). */
export function useScriptMoves(
  scene: Scene | undefined,
  script: string | undefined,
  player: PlayPlayer,
): PlayState<readonly Move[]> {
  const host = useHost();
  const [state, setState] = useState<PlayState<readonly Move[]>>(IDLE);

  useEffect(() => {
    if (!scene || !script || !host) {
      setState(IDLE);
      return;
    }

    const key = `moves:${scene.engine}:${hashScene(scene)}:${player}:${script}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      setState({ value: cached as readonly Move[], pending: false, error: null });
      return;
    }

    let live = true;
    setState({ value: null, pending: true, error: null });
    void host
      .request({ kind: 'moves', engine: scene.engine, script, scene, player })
      .then((response) => {
        if (!live) return;
        if (response.ok) {
          remember(key, response.result);
          setState({ value: response.result as readonly Move[], pending: false, error: null });
        } else {
          setState({ value: null, pending: false, error: response.error ?? 'lỗi không rõ' });
        }
      });

    return () => {
      live = false;
    };
  }, [scene, script, player, host]);

  return state;
}
