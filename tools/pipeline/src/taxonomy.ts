import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Problem, ValidationIssue } from '@combviz/schema';

interface VocabEntry {
  id: string;
  label: { vi: string; en?: string };
  requires_widget?: string;
}

export interface Taxonomy {
  topics: Map<string, VocabEntry>;
  techniques: Map<string, VocabEntry>;
}

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

/**
 * CMS-01 (không tag tự do) + phần ràng buộc chéo của lint AUT-10.
 *
 * Bộ lint đầy đủ (glossary, format case_label, giọng văn) đến ở M6 cùng Style
 * Guide — Style Guide phải kết tinh từ 5 bài soạn tay trước đã, viết luật trước
 * khi soạn bài nào là bịa (§16).
 */
export function checkTaxonomy(problem: Problem, taxonomy: Taxonomy): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  problem.topics.forEach((topic, i) => {
    if (!taxonomy.topics.has(topic)) {
      issues.push({
        code: 'taxonomy/unknown-topic',
        severity: 'error',
        message: `Topic "${topic}" không có trong controlled vocabulary`,
        path: `/topics/${i}`,
        hint: 'Thêm vào packages/content/taxonomy/topics.yaml bằng một commit riêng (CMS-01)',
      });
    }
  });

  problem.techniques.forEach((technique, i) => {
    const entry = taxonomy.techniques.get(technique);
    if (!entry) {
      issues.push({
        code: 'taxonomy/unknown-technique',
        severity: 'error',
        message: `Technique "${technique}" không có trong controlled vocabulary`,
        path: `/techniques/${i}`,
        hint: 'Thêm vào packages/content/taxonomy/techniques.yaml (CMS-01)',
      });
      return;
    }

    if (entry.requires_widget === 'invariants' && !problem.invariants?.length) {
      issues.push({
        code: 'lint/technique-widget-mismatch',
        severity: 'error',
        message: `Bài tag "${technique}" nhưng không khai invariants[]`,
        path: `/techniques/${i}`,
        hint: 'Hoặc tag sai, hoặc quên widget — cả hai đều nên chặn trước khi publish (AUT-10)',
      });
    }
  });

  return issues;
}
