import { useMemo } from 'preact/hooks';
import { compile, tryEvaluate, type DslEnvironment } from '@combviz/dsl';
import type { Invariant, Scene, Step } from '@combviz/schema';
import { renderMath } from './math.js';

/**
 * Invariant strip (PLY-06).
 *
 * Không phải một widget trang trí: với dạng bài bất biến, **con số đứng yên
 * chính là lời giải**. Vì vậy thanh này phải nói rõ giá trị *có đổi hay không*
 * qua mỗi bước, chứ không chỉ hiện giá trị hiện tại — người học cần thấy sự
 * đứng yên, mà sự đứng yên chỉ nhìn thấy được khi đặt cạnh bước trước.
 */
interface InvariantStripProps {
  invariants: readonly Invariant[];
  /** Đường đi từ gốc tới step hiện tại; giá trị cuối là của step đang xem. */
  path: readonly Step[];
  environmentFor: (scene: Scene) => DslEnvironment | null;
}

interface Series {
  readonly invariant: Invariant;
  readonly values: readonly (number | null)[];
  readonly error: string | null;
}

export function InvariantStrip({
  invariants,
  path,
  environmentFor,
}: InvariantStripProps) {
  const series = useMemo(
    () => invariants.map((invariant) => computeSeries(invariant, path, environmentFor)),
    [invariants, path, environmentFor],
  );

  if (series.length === 0) return null;

  return (
    <section class="invariants" aria-label="Đại lượng bất biến">
      {series.map((entry) => (
        <InvariantRow key={entry.invariant.id} series={entry} />
      ))}
    </section>
  );
}

function InvariantRow({ series }: { series: Series }) {
  const { invariant, values, error } = series;
  const current = values[values.length - 1];
  const previous = values.length > 1 ? values[values.length - 2] : undefined;

  const changed =
    previous === undefined || previous === null || current === null
      ? null
      : current !== previous;

  return (
    <div class="invariant">
      <div class="invariant__head">
        <span
          class="invariant__label"
          dangerouslySetInnerHTML={{ __html: renderMath(invariant.label.vi) }}
        />
        {error ? (
          <span class="invariant__error" title={error}>
            biểu thức lỗi
          </span>
        ) : (
          <span class="invariant__value">{formatValue(current)}</span>
        )}
      </div>

      {!error && values.length > 1 ? (
        <div class="invariant__trail">
          <Sparkline values={values} />
          {changed === false ? (
            <span class="invariant__badge invariant__badge--steady">
              không đổi qua bước này
            </span>
          ) : changed === true ? (
            <span class="invariant__badge invariant__badge--moved">
              đổi {formatDelta(previous as number, current as number)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sparkline theo tiến trình **nhánh đang xem** (G-04): đường đi từ gốc tới step
 * hiện tại theo `parent`, không phải toàn bộ solution.
 */
function Sparkline({ values }: { values: readonly (number | null)[] }) {
  const numbers = values.filter((v): v is number => v !== null);
  if (numbers.length < 2) return null;

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min || 1;
  const width = 96;
  const height = 20;

  const points = values.map((value, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = value === null ? height / 2 : height - ((value - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg class="sparkline" viewBox={`-2 -2 ${width + 4} ${height + 4}`} aria-hidden="true">
      <polyline points={points.join(' ')} fill="none" stroke="currentColor" stroke-width="1.5" />
      <circle
        cx={width}
        cy={points[points.length - 1]?.split(',')[1] ?? 0}
        r="2.5"
        fill="currentColor"
      />
    </svg>
  );
}

function computeSeries(
  invariant: Invariant,
  path: readonly Step[],
  environmentFor: (scene: Scene) => DslEnvironment | null,
): Series {
  let compiled;
  try {
    compiled = compile(invariant.expr);
  } catch (error) {
    return { invariant, values: [], error: (error as Error).message };
  }

  const values: (number | null)[] = [];
  let error: string | null = null;

  for (const step of path) {
    if (!step.scene) continue;
    const env = environmentFor(step.scene);
    if (!env) {
      values.push(null);
      continue;
    }

    // `tryEvaluate` chứ không phải `run`: một biểu thức hỏng phải làm hỏng đúng ô
    // này, không làm trắng cả trang (NFR-S1 — nội dung là dữ liệu không tin cậy,
    // kể cả draft máy ở AUT-09).
    const outcome = tryEvaluate(compiled, env);
    if (!outcome.ok) {
      error = outcome.error ?? 'lỗi không rõ';
      values.push(null);
    } else if (typeof outcome.value === 'number') {
      values.push(outcome.value);
    } else {
      values.push(null);
    }
  }

  return { invariant, values, error };
}

function formatValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatDelta(previous: number, current: number): string {
  const delta = current - previous;
  return delta > 0 ? `+${formatValue(delta)}` : formatValue(delta);
}
