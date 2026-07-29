import { useEffect, useRef, useState } from 'preact/hooks';
import { hashScene } from '@combviz/render';
import type { Scene } from '@combviz/schema';
import type { AnalyzeResponse } from './analyzer.worker.js';

/**
 * Chạy analyzer trong worker, cache theo hash scene, huỷ được (ENG-04).
 *
 * Ba tính chất, ba lý do khác nhau:
 *   - **worker**: Hamilton có thể chạy vài trăm ms ngay trong bound 20 đỉnh
 *     (NFR-P5 đòi worker khi > 100ms);
 *   - **cache theo hash**: đi tới rồi quay lại một step không được tính lại từ
 *     đầu — người học kéo timeline qua lại liên tục;
 *   - **huỷ**: nhảy nhanh qua nhiều step sẽ xếp hàng nhiều yêu cầu, và chỉ kết
 *     quả của step *đang xem* mới có nghĩa. Không huỷ thì màn hình nháy kết quả
 *     của step trước.
 */
export interface AnalyzerState<T> {
  readonly value: T | null;
  readonly pending: boolean;
  readonly error: string | null;
}

const cache = new Map<string, unknown>();
const CACHE_LIMIT = 64;

export function useAnalyzer<T>(scene: Scene | undefined): AnalyzerState<T> {
  const [state, setState] = useState<AnalyzerState<T>>({
    value: null,
    pending: false,
    error: null,
  });

  const worker = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const awaiting = useRef<number | null>(null);

  useEffect(() => {
    const instance = new Worker(new URL('./analyzer.worker.js', import.meta.url), {
      type: 'module',
    });

    instance.onmessage = (event: MessageEvent<AnalyzeResponse>) => {
      // Bỏ qua kết quả của yêu cầu đã cũ: đây chính là "huỷ" nhìn từ phía nhận.
      // Worker vẫn chạy nốt, nhưng kết quả không bao giờ chạm tới màn hình.
      if (event.data.id !== awaiting.current) return;

      if (event.data.ok) {
        setState({ value: event.data.result as T, pending: false, error: null });
      } else {
        setState({ value: null, pending: false, error: event.data.error ?? 'lỗi không rõ' });
      }
    };

    worker.current = instance;
    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    if (!scene) {
      setState({ value: null, pending: false, error: null });
      return;
    }

    const key = `${scene.engine}:${hashScene(scene)}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      awaiting.current = null;
      setState({ value: cached as T, pending: false, error: null });
      return;
    }

    const instance = worker.current;
    if (!instance) return;

    const id = (nextId.current += 1);
    awaiting.current = id;
    setState((current) => ({ ...current, pending: true }));

    const onDone = (event: MessageEvent<AnalyzeResponse>): void => {
      if (event.data.id !== id || !event.data.ok) return;
      if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, event.data.result);
    };

    instance.addEventListener('message', onDone);
    instance.postMessage({ id, engine: scene.engine, scene });

    return () => instance.removeEventListener('message', onDone);
  }, [scene]);

  return state;
}
