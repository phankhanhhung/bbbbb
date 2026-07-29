/**
 * Bound nội dung (NFR-P4). Validate lúc soạn, không phải lúc chạy.
 *
 * Bound là công cụ minh hoạ lời giải thi đấu, không phải công cụ nghiên cứu
 * (NG-05). Nới bound thì rẻ, thu hẹp thì đắt vì bài đã soạn thành invalid —
 * nên khi phân vân, đặt rộng.
 */

export const MAX_COLOR_CLASS = 8;

export const GLOBAL_BOUNDS = {
  /** NFR-P4. */
  maxStepsPerSolution: 200,
  /** NFR-P4: file problem ≤ 1MB. */
  maxProblemFileBytes: 1_000_000,
  maxSolutionsPerProblem: 8,
  maxInvariantsPerProblem: 6,
  /**
   * Giới hạn **mềm** độ sâu cây lời giải (R-6). Vượt ngưỡng là warning, không
   * phải error: DAT-10 nói cây không giới hạn độ sâu, nhưng cây sâu hơn mức này
   * thì tree navigator rối và lời giải thường nên tách bài.
   */
  softMaxTreeDepth: 4,
  /** Cảnh báo mềm của AUT-10: narrative quá dài thì step nên tách đôi. */
  softMaxNarrativeChars: 420,
} as const;

export interface EngineBounds {
  readonly engine: string;
  readonly limits: Readonly<Record<string, number>>;
}
