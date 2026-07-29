/**
 * Markup anchor trong narrative (§4.5): `[[a3|đỉnh $v_1$ và các cạnh kề]]`.
 *
 * Player, Studio và validator đều phải hiểu đúng một cách như nhau, nên parser
 * sống ở `packages/schema` chứ không nằm rải trong từng app.
 *
 * Cố ý **không** NLP, không suy diễn: anchor là thủ công (NG-06).
 */

const ANCHOR_RE = /\[\[([a-z][a-z0-9_]*)\|([\s\S]*?)\]\]/g;

export interface AnchorSpan {
  readonly key: string;
  readonly label: string;
  /** Vị trí trong chuỗi narrative gốc, để Studio bôi đen đúng chỗ. */
  readonly start: number;
  readonly end: number;
}

export function parseAnchorMarkup(narrative: string): AnchorSpan[] {
  const spans: AnchorSpan[] = [];
  ANCHOR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANCHOR_RE.exec(narrative)) !== null) {
    spans.push({
      key: match[1] as string,
      label: match[2] as string,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return spans;
}

/** Bỏ markup, giữ phần nhãn — dùng cho search index và alt_text fallback. */
export function stripAnchorMarkup(narrative: string): string {
  return narrative.replace(ANCHOR_RE, (_full, _key, label: string) => label);
}
