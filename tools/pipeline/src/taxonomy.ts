import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

import type { Taxonomy, VocabEntry } from '@combviz/check';

/**
 * Đọc controlled vocabulary từ đĩa.
 *
 * Chỉ còn phần I/O ở đây — bản thân luật nằm trong `@combviz/check` để Studio
 * dùng chung được (AUT-04).
 */
export async function loadTaxonomy(contentRoot: string): Promise<Taxonomy> {
  const [topicsRaw, techniquesRaw] = await Promise.all([
    readFile(join(contentRoot, 'taxonomy', 'topics.yaml'), 'utf8'),
    readFile(join(contentRoot, 'taxonomy', 'techniques.yaml'), 'utf8'),
  ]);

  const topics = parse(topicsRaw) as { topics: VocabEntry[] };
  const techniques = parse(techniquesRaw) as { techniques: VocabEntry[] };

  return {
    topics: new Map(topics.topics.map((t) => [t.id, t])),
    techniques: new Map(techniques.techniques.map((t) => [t.id, t])),
  };
}
