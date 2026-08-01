import { Type } from '@sinclair/typebox';
import { EntityId, LangString, SEMVER_PATTERN, Slug } from './common.js';
import { Step } from './step.js';
import { GLOBAL_BOUNDS } from './bounds.js';

export const Solution = Type.Object(
  {
    id: Slug,
    label: Type.Optional(LangString),
    steps: Type.Array(Step, { minItems: 1, maxItems: GLOBAL_BOUNDS.maxStepsPerSolution }),
  },
  { additionalProperties: false },
);

/** Biểu thức DSL cho invariant/monovariant (PRN-01, PLY-06). */
export const Invariant = Type.Object(
  {
    id: Slug,
    label: LangString,
    expr: Type.String({ minLength: 1 }),
    /**
     * Monovariant: chiều đơn điệu khai báo. Sandbox cảnh báo khi thao tác của
     * người học làm giá trị đi ngược chiều này (PRN-01).
     */
    monotone: Type.Optional(
      Type.Union([Type.Literal('non-increasing'), Type.Literal('non-decreasing')]),
    ),
  },
  { additionalProperties: false },
);

export const SandboxConfig = Type.Object(
  {
    /**
     * `Optional` thật thay vì `default: []`: Ajv của kho không bật `useDefaults`,
     * nên cái default kia chưa từng chạy — nó chỉ làm trường *trông* như tuỳ chọn
     * trong khi validate đòi có mặt. Mọi chỗ đọc đã `?? []` sẵn.
     */
    validators: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    /** SBX-03: điều kiện "đã xong" cho challenge mode. */
    goal_expr: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

/**
 * Nguồn của **đề bài**.
 *
 * Đề bài từ kỳ thi không thuộc bản quyền của kho — `license` bên dưới chỉ áp cho
 * lời giải và hình minh hoạ do chính chủ viết. Tách hai thứ này ra là yêu cầu
 * của CMS-06 và là đối sách trực tiếp của R-5.
 */
export const ProblemSource = Type.Object(
  {
    contest: Type.String({ minLength: 1 }),
    /**
     * Cận dưới 1600, không phải 1890.
     *
     * 1890 (IMO đầu tiên còn muộn hơn) là con số đặt theo hình dung "kỳ thi hiện
     * đại", và nó chặn đúng những bài mở đầu ngành: Königsberg là Euler 1736.
     * Bài dân gian cổ điển chiếm phần đáng kể trong khung phân bố §16, nên cận
     * dưới phải đủ chỗ cho chúng. Nới rẻ, thu hẹp đắt (OPQ-6).
     */
    year: Type.Optional(Type.Integer({ minimum: 1600, maximum: 2100 })),
    slot: Type.Optional(Type.String()),
    /** Ghi chú trích dẫn hiển thị dưới đề bài. */
    note: Type.Optional(LangString),
    url: Type.Optional(Type.String({ format: 'uri' })),
  },
  { additionalProperties: false },
);

export const Problem = Type.Object(
  {
    schema_version: Type.String({ pattern: SEMVER_PATTERN }),
    id: Slug,

    statement: LangString,
    source: ProblemSource,

    topics: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    techniques: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    difficulty: Type.Object(
      {
        slot_proxy: Type.String({ minLength: 1 }),
        author_rating: Type.Integer({ minimum: 1, maximum: 10 }),
      },
      { additionalProperties: false },
    ),

    engines_used: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),

    /** Áp cho lời giải + hình minh hoạ, **không** áp cho đề bài (xem `source`). */
    license: Type.String({ minLength: 1 }),
    authors: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),

    status: Type.Union([
      Type.Literal('draft'),
      Type.Literal('published'),
      Type.Literal('archived'),
    ]),

    /** SBX-03: khai báo rõ bài thuộc loại nào để CMS lọc được. */
    kind: Type.Optional(
      Type.Union([
        Type.Literal('illustration'),
        Type.Literal('challenge'),
        Type.Literal('both'),
      ]),
    ),

    created: Type.Optional(Type.String({ format: 'date' })),
    updated: Type.Optional(Type.String({ format: 'date' })),

    invariants: Type.Optional(
      Type.Array(Invariant, { maxItems: GLOBAL_BOUNDS.maxInvariantsPerProblem }),
    ),
    solutions: Type.Array(Solution, {
      minItems: 1,
      maxItems: GLOBAL_BOUNDS.maxSolutionsPerProblem,
    }),
    sandbox: Type.Optional(SandboxConfig),

    /**
     * REN-02: step được chọn làm ảnh đại diện khi build OG card.
     * Vắng mặt thì pipeline lấy step cuối của nhánh chính solution đầu tiên.
     */
    og_step_ref: Type.Optional(
      Type.Object(
        { sol_id: Slug, step_id: EntityId },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false, $id: 'Problem' },
);

// ---------------------------------------------------------------------------
// Kiểu TypeScript đi kèm. Khai tay thay vì `Static<typeof …>` vì Scene cố ý để
// `config`/`elements` mở (engine validate ở lượt hai) — suy diễn tự động sẽ ra
// `unknown` và làm hỏng trải nghiệm dùng ở phía app.
// ---------------------------------------------------------------------------

export interface Invariant {
  id: string;
  label: LangString;
  expr: string;
  monotone?: 'non-increasing' | 'non-decreasing';
}

export interface Solution {
  id: string;
  label?: LangString;
  steps: Step[];
}

export interface ProblemSource {
  contest: string;
  year?: number;
  slot?: string;
  note?: LangString;
  url?: string;
}

export interface Problem {
  schema_version: string;
  id: string;
  statement: LangString;
  source: ProblemSource;
  topics: string[];
  techniques: string[];
  difficulty: { slot_proxy: string; author_rating: number };
  engines_used: string[];
  license: string;
  authors: string[];
  status: 'draft' | 'published' | 'archived';
  kind?: 'illustration' | 'challenge' | 'both';
  created?: string;
  updated?: string;
  invariants?: Invariant[];
  solutions: Solution[];
  sandbox?: { validators?: string[]; goal_expr?: string };
  og_step_ref?: { sol_id: string; step_id: string };
}
