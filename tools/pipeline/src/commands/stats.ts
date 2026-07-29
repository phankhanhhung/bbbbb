import { readFile } from 'node:fs/promises';

/**
 * `combviz stats` — số của AUT-KPI (G-06).
 *
 * AUT-KPI là gate có răng: median ≤ 1.5h qua pipeline, ≤ 4h soạn tay, trượt thì
 * dồn sửa pipeline **trước khi** mở engine mới. Nhưng công cụ đo (AUT-08) lại là
 * P2 — nên nếu không có bản tối thiểu này, gate P1 không có số để cắn.
 *
 * Đầu vào là JSONL do chính chủ tự ghi: một dòng một phiên làm việc. Thô, nhưng
 * đó là điểm — một cái log tay được ghi thật vẫn hơn một hệ telemetry không ai
 * bật.
 */
export interface StatsOptions {
  log: string;
}

interface Session {
  problem: string;
  minutes: number;
  /** `pipeline` = qua AUT-09; `hand` = soạn tay hoàn toàn. */
  mode?: 'pipeline' | 'hand';
}

const KPI_MINUTES = { pipeline: 90, hand: 240 } as const;

export async function runStats(options: StatsOptions): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(options.log, 'utf8');
  } catch {
    console.log(`Chưa có log tại ${options.log}.`);
    console.log('Mỗi dòng một phiên, ví dụ:');
    console.log('  {"problem":"mutilated-chessboard","minutes":75,"mode":"hand"}');
    return true;
  }

  const sessions = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Session);

  if (sessions.length === 0) {
    console.log('Log rỗng.');
    return true;
  }

  // Cộng dồn theo bài: một bài thường soạn qua nhiều phiên, và KPI nói về **bài**
  // chứ không về phiên.
  const perProblem = new Map<string, { minutes: number; mode: 'pipeline' | 'hand' }>();
  for (const session of sessions) {
    const current = perProblem.get(session.problem);
    perProblem.set(session.problem, {
      minutes: (current?.minutes ?? 0) + session.minutes,
      mode: session.mode ?? current?.mode ?? 'hand',
    });
  }

  let allPass = true;

  for (const mode of ['pipeline', 'hand'] as const) {
    const values = [...perProblem.values()]
      .filter((entry) => entry.mode === mode)
      .map((entry) => entry.minutes)
      .sort((a, b) => a - b);

    if (values.length === 0) {
      console.log(`${label(mode)}: chưa có bài nào`);
      continue;
    }

    // AUT-KPI đo trên **5 bài cuối**, không phải toàn bộ: những bài đầu tiên đo cả
    // thời gian học công cụ, và đó không phải thứ gate muốn nói tới.
    const recent = values.slice(-5);
    const median = medianOf(recent);
    const pass = median <= KPI_MINUTES[mode];
    if (!pass) allPass = false;

    console.log(
      `${label(mode)}: ${perProblem.size} bài, median 5 bài cuối = ${median.toFixed(0)} phút ` +
        `(trần ${KPI_MINUTES[mode]}) ${pass ? '✓' : '✗'}`,
    );
  }

  if (!allPass) {
    console.log(
      '\nAUT-KPI trượt. Đối sách đã định trước: dồn sửa pipeline/Studio **trước khi** mở engine mới (R-1).',
    );
  }

  return allPass;
}

function label(mode: 'pipeline' | 'hand'): string {
  return mode === 'pipeline' ? 'Qua pipeline' : 'Soạn tay';
}

function medianOf(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
