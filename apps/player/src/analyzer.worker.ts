/// <reference lib="webworker" />
import { analyzeGraph } from '@combviz/engine-graph';
import type { Scene } from '@combviz/schema';

/**
 * Worker chạy analyzer nặng ngoài UI thread (ENG-04).
 *
 * Chỉ đồ thị mới cần: Hamilton là backtracking NP, và ngay trong bound 20 đỉnh
 * nó vẫn có thể chạy vài trăm ms — đủ để bàn phím và cuộn trang khựng nếu chạy
 * trên luồng chính.
 *
 * Worker **không** giữ trạng thái giữa các lần gọi: mỗi thông điệp mang theo
 * scene đầy đủ. Cache sống ở phía chính, nơi biết được scene nào đang hiển thị.
 */
export interface AnalyzeRequest {
  readonly id: number;
  readonly engine: string;
  readonly scene: Scene;
}

export interface AnalyzeResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

self.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  const { id, engine, scene } = event.data;

  try {
    if (engine !== 'graph') {
      throw new Error(`Chưa có analyzer cho engine "${engine}"`);
    }
    const result = analyzeGraph(scene);
    (self as unknown as Worker).postMessage({ id, ok: true, result } satisfies AnalyzeResponse);
  } catch (error) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: (error as Error).message,
    } satisfies AnalyzeResponse);
  }
};
