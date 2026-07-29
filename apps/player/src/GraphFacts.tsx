import type { GraphAnalysis } from '@combviz/engine-graph';
import type { AnalyzerState } from './useAnalyzer.js';

/**
 * Kết quả analyzer đồ thị (GR-03/GR-04).
 *
 * Hiện cả trường hợp **từ chối vì vượt bound**: người học phải biết vì sao không
 * có câu trả lời, chứ không phải nhìn một ô trống và tự đoán rằng đồ thị không
 * có chu trình Hamilton.
 */
export function GraphFacts({ state }: { state: AnalyzerState<GraphAnalysis> }) {
  if (state.error) return <p class="diagnostics">Analyzer lỗi: {state.error}</p>;
  if (state.pending) return <p class="diagnostics">Đang phân tích…</p>;
  if (!state.value) return null;

  const { components, bipartite, cycle, euler, hamilton } = state.value;

  return (
    <section class="constraints">
      <h3>Đồ thị nói gì</h3>

      <Fact label="Thành phần liên thông" value={String(components.count)} />
      <Fact
        label="Hai phía"
        value={
          bipartite.bipartite
            ? 'có'
            : `không — chu trình lẻ dài ${bipartite.oddCycle.length}`
        }
      />
      <Fact label="Chu trình" value={cycle.length > 0 ? `có, dài ${cycle.length}` : 'không có'} />
      <Fact
        label="Euler"
        value={
          euler.kind === 'circuit'
            ? `chu trình, qua ${euler.trail.length} cạnh`
            : euler.kind === 'path'
              ? `đường đi, qua ${euler.trail.length} cạnh`
              : (euler.reason ?? 'không có')
        }
      />
      <Fact
        label="Hamilton"
        value={
          hamilton.refused
            ? hamilton.refused
            : hamilton.value?.kind === 'none'
              ? 'không có'
              : `${hamilton.value?.kind === 'cycle' ? 'chu trình' : 'đường đi'} qua ${hamilton.value?.order.length} đỉnh`
        }
      />
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div class="constraint">
      <span class="constraint__label">{label}</span>
      <span class="constraint__state">{value}</span>
    </div>
  );
}
