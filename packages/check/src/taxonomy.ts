import type { Problem, ValidationIssue } from '@combviz/schema';

/**
 * Controlled vocabulary đã nạp sẵn (CMS-01).
 *
 * Chỉ phần **thuần** nằm ở đây; việc đọc file YAML nằm ở phía gọi. Đó là điều
 * kiện để cùng một luật chạy được ở cả ba nơi của AUT-04: CLI đọc từ đĩa, CI
 * cũng vậy, còn Studio chạy trong browser và nhận vocabulary đã bundle sẵn.
 *
 * Trước khi tách, luật này sống trong `tools/pipeline` và **chỉ `combviz
 * validate` chạy nó** — nên `import-draft` và Studio đều không thấy. Nó bị lộ
 * đúng theo cách tệ nhất: một bài đi qua cổng draft sạch sẽ, rồi CI mới báo đỏ.
 */
export interface VocabEntry {
  readonly id: string;
  readonly label: { readonly vi: string; readonly en?: string };
  readonly requires_widget?: string;
}

export interface Taxonomy {
  readonly topics: ReadonlyMap<string, VocabEntry>;
  readonly techniques: ReadonlyMap<string, VocabEntry>;
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
