import type { Scene, SceneElement } from '@combviz/schema';
import type { DerivationConfig } from './schema.js';

export interface Term {
  readonly id: string;
  readonly row: string;
  readonly tex: string;
  readonly role: 'term' | 'op' | 'relation';
  readonly cancelled: boolean;
  readonly becomes: string | undefined;
  readonly colorClass: number;
  readonly emphasis: string | undefined;
}

export interface Row {
  readonly id: string;
  readonly note: string | undefined;
  readonly terms: readonly Term[];
}

export interface DerivationModel {
  readonly rows: readonly Row[];
  readonly config: DerivationConfig;
  /** Hạng tử trỏ vào dòng không tồn tại — validate bắt, renderer bỏ qua. */
  readonly orphans: readonly Term[];
}

export function readDerivation(scene: Scene): DerivationModel {
  const config = (scene.config as DerivationConfig) ?? ({} as DerivationConfig);
  const order: string[] = [];
  const notes = new Map<string, string | undefined>();
  const byRow = new Map<string, Term[]>();
  const orphans: Term[] = [];

  for (const element of scene.elements) {
    if (element.type !== 'row') continue;
    order.push(element.id);
    const note = element['note'];
    notes.set(element.id, typeof note === 'string' ? note : undefined);
    byRow.set(element.id, []);
  }

  for (const element of scene.elements) {
    if (element.type !== 'term') continue;
    const term = toTerm(element);
    const bucket = byRow.get(term.row);
    if (bucket) bucket.push(term);
    else orphans.push(term);
  }

  return {
    rows: order.map((id) => ({
      id,
      note: notes.get(id),
      terms: byRow.get(id) ?? [],
    })),
    config,
    orphans,
  };
}

function toTerm(element: SceneElement): Term {
  const row = element['row'];
  const tex = element['tex'];
  const role = element['role'];
  const colorClass = element['color_class'];
  const emphasis = element['emphasis'];

  return {
    id: element.id,
    row: typeof row === 'string' ? row : '',
    tex: typeof tex === 'string' ? tex : '',
    role: role === 'op' || role === 'relation' ? role : 'term',
    cancelled: element['cancelled'] === true,
    becomes: typeof element['becomes'] === 'string' ? element['becomes'] : undefined,
    colorClass: typeof colorClass === 'number' ? colorClass : 0,
    emphasis: typeof emphasis === 'string' ? emphasis : undefined,
  };
}

/** Mọi chuỗi LaTeX của một scene — cái mà atlas phải chứa. */
export function texOf(scene: Scene): string[] {
  const out: string[] = [];
  for (const element of scene.elements) {
    if (element.type !== 'term') continue;
    const tex = element['tex'];
    if (typeof tex === 'string' && tex.length > 0) out.push(tex);
  }
  return out;
}
