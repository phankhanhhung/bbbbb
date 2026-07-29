import raw from '@combviz/content/taxonomy.json';
import type { Taxonomy, VocabEntry } from '@combviz/check';

/**
 * Controlled vocabulary cho Studio (CMS-01).
 *
 * Sinh lúc build bằng `combviz index` từ chính hai file YAML mà CLI đọc — không
 * phải một bản chép tay. Studio chạy trong browser nên không đọc YAML trên đĩa
 * được, và nếu để nó thiếu vocabulary thì nó lại thành nơi duy nhất không chạy
 * một lớp kiểm, đúng thứ AUT-04 sinh ra để chặn.
 */
const source = raw as { topics: VocabEntry[]; techniques: VocabEntry[] };

export const TAXONOMY: Taxonomy = {
  topics: new Map(source.topics.map((t) => [t.id, t])),
  techniques: new Map(source.techniques.map((t) => [t.id, t])),
};
