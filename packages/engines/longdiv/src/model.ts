import type { Scene } from '@combviz/schema';
import type { LongDivConfig } from './schema.js';

/**
 * Thuật toán chia dọc, **đúng nhịp người ta viết trên giấy**.
 *
 * Khác bảng hệ số tách rời ở một chỗ quan trọng: mỗi nhịp chỉ **hạ xuống một
 * hạng tử**. Cửa sổ đang chia luôn rộng đúng $\deg B + 1$ cột, và sau khi trừ thì
 * hạng tử kế tiếp của $A$ được kéo xuống — đó là lý do dòng hiệu thứ nhất của
 * $(x^4+2x^3-x^2+6x-2) \div (x^2-3)$ là $2x^3+2x^2+6x$ chứ không phải cả đuôi.
 *
 * Viết lại cả bảng thay vì chỉ trả thương và dư, vì **hình chính là cái bảng**:
 * sinh nó ở đây là cách duy nhất để hình không bao giờ lệch khỏi phép tính.
 */

export interface Term {
  readonly degree: number;
  readonly coefficient: number;
}

export interface LongDivRow {
  readonly id: string;
  readonly kind: 'divisor' | 'quotient' | 'dividend' | 'sub' | 'rest' | 'remainder';
  readonly terms: readonly Term[];
}

export interface Beat {
  /** Hạng tử của thương sinh ra ở nhịp này. */
  readonly quotient: Term;
  readonly sub: LongDivRow;
  readonly rest: LongDivRow;
  /** Bậc của hạng tử được hạ xuống sau khi trừ; `null` khi không còn gì để hạ. */
  readonly broughtDown: number | null;
}

export interface LongDivModel {
  readonly config: LongDivConfig;
  readonly variable: string;
  readonly degA: number;
  readonly degB: number;
  readonly divisor: LongDivRow;
  readonly dividend: LongDivRow;
  readonly quotient: LongDivRow;
  readonly beats: readonly Beat[];
  /** Dòng cuối cùng — dư $R$. Trùng với `beats.at(-1).rest` khi có nhịp nào. */
  readonly remainder: LongDivRow;
  /** Vì sao không chia được; rỗng nghĩa là chia được. */
  readonly refusal: string | null;
}

const terms = (coefficients: readonly number[], topDegree: number): Term[] =>
  coefficients
    .map((coefficient, i) => ({ degree: topDegree - i, coefficient }))
    .filter((t) => t.coefficient !== 0);

/** Bậc thật (bỏ hệ số $0$ ở đầu); $-1$ cho đa thức không. */
function realDegree(c: readonly number[]): number {
  const i = c.findIndex((v) => v !== 0);
  return i === -1 ? -1 : c.length - 1 - i;
}

export function readLongDiv(scene: Scene): LongDivModel {
  const config = (scene.config as LongDivConfig) ?? ({ dividend: [], divisor: [] } as never);
  const A = [...(config.dividend ?? [])];
  const B = [...(config.divisor ?? [])];
  const variable = config.variable ?? 'x';

  const degA = A.length - 1;
  const degB = B.length - 1;
  const empty: LongDivRow = { id: 'remainder', kind: 'remainder', terms: [] };
  const base = {
    config,
    variable,
    degA,
    degB,
    divisor: { id: 'divisor', kind: 'divisor', terms: terms(B, degB) } as LongDivRow,
    dividend: { id: 'dividend', kind: 'dividend', terms: terms(A, degA) } as LongDivRow,
    quotient: { id: 'quotient', kind: 'quotient', terms: [] } as LongDivRow,
    beats: [] as Beat[],
    remainder: empty,
  };

  const refuse = (refusal: string): LongDivModel => ({ ...base, refusal });

  if (A.length === 0 || B.length === 0) return refuse('thiếu đa thức');
  if (realDegree(B) < 0) return refuse('số chia bằng 0');
  if (B[0] === 0) return refuse('hệ số dẫn đầu của số chia bằng 0');

  const beats: Beat[] = [];
  const quotient: Term[] = [];

  // Cửa sổ đang chia: các hệ số từ bậc `hi` xuống `hi - degB`, lấy từ A rồi thay
  // dần bằng hiệu. Đúng cách tay người trượt dọc theo dòng.
  let hi = degA;
  let window = A.slice(0, degB + 1);
  let next = degB + 1; // chỉ số hạng tử kế tiếp của A, chờ được hạ xuống

  while (hi >= degB) {
    const lead = window[0] ?? 0;
    const divisorLead = B[0] as number;
    if (lead % divisorLead !== 0) {
      return refuse(`hệ số ${lead} không chia hết cho ${divisorLead} — thương không nguyên`);
    }
    const q = lead / divisorLead;
    const qTerm: Term = { degree: hi - degB, coefficient: q };
    quotient.push(qTerm);

    const subCoefficients = B.map((b) => b * q);
    const diff = window.map((c, i) => c - (subCoefficients[i] as number));
    if (diff[0] !== 0) return refuse('hạng tử dẫn đầu không triệt tiêu');

    const rest = diff.slice(1);
    const broughtDown = next < A.length ? degA - next : null;
    const carried = broughtDown === null ? rest : [...rest, A[next] as number];
    const isLast = hi - 1 < degB || broughtDown === null;

    beats.push({
      quotient: qTerm,
      sub: {
        id: `sub${beats.length + 1}`,
        kind: 'sub',
        terms: terms(subCoefficients, hi),
      },
      rest: {
        // Dòng hiệu cuối cùng **là** dư, nên nó mang tên ấy: một dòng, một tên,
        // và anchor `[[a1|dư]]` trỏ được vào đúng thứ nó nói.
        id: isLast ? 'remainder' : `rest${beats.length + 1}`,
        kind: isLast ? 'remainder' : 'rest',
        terms: terms(carried, hi - 1),
      },
      broughtDown,
    });

    if (broughtDown === null) break;
    window = carried;
    hi -= 1;
    next += 1;
  }

  const last = beats.at(-1);
  return {
    ...base,
    quotient: { id: 'quotient', kind: 'quotient', terms: quotient.filter((t) => t.coefficient !== 0) },
    beats,
    remainder: last ? last.rest : { id: 'remainder', kind: 'remainder', terms: terms(A, degA) },
    refusal: null,
  };
}

/** Mọi dòng được vẽ, theo thứ tự từ trên xuống. */
export function rowsOf(model: LongDivModel): readonly LongDivRow[] {
  const out: LongDivRow[] = [model.quotient, model.divisor, model.dividend];
  for (const beat of model.beats) out.push(beat.sub, beat.rest);
  if (model.beats.length === 0) out.push(model.remainder);
  return out;
}

/** Id của một hạng tử: dòng nào, bậc bao nhiêu. */
export const termId = (row: string, degree: number): string => `${row}-${degree}`;
