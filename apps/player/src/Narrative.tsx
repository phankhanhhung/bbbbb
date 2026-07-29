import { useMemo } from 'preact/hooks';
import { parseAnchorMarkup } from '@combviz/schema';
import { renderMath } from './math.js';

/**
 * Narrative pane: LaTeX + anchor hai chiều (PLY-03, ANC-01).
 *
 * KaTeX chạy với `trust: false` (NFR-S1): nội dung problem là **dữ liệu**, và
 * `\href{javascript:…}` trong một file bài phải không làm được gì.
 */
interface NarrativeProps {
  text: string;
  activeAnchor: string | null;
  onAnchor: (key: string | null) => void;
}

interface Segment {
  kind: 'text' | 'anchor';
  content: string;
  key?: string;
}

export function Narrative({ text, activeAnchor, onAnchor }: NarrativeProps) {
  const segments = useMemo(() => splitSegments(text), [text]);

  return (
    <p class="narrative">
      {segments.map((segment, i) =>
        segment.kind === 'text' ? (
          <span key={i} dangerouslySetInnerHTML={{ __html: renderMath(segment.content) }} />
        ) : (
          <span
            key={i}
            class={`anchor${activeAnchor === segment.key ? ' anchor--active' : ''}`}
            // NFR-C2: không có affordance chỉ-hover. Tap trên touch và hover trên
            // chuột cùng dẫn tới một hành vi; `tabIndex` để bàn phím cũng tới được
            // (NFR-A2).
            tabIndex={0}
            role="button"
            onMouseEnter={() => onAnchor(segment.key ?? null)}
            onMouseLeave={() => onAnchor(null)}
            onFocus={() => onAnchor(segment.key ?? null)}
            onBlur={() => onAnchor(null)}
            onClick={() =>
              onAnchor(activeAnchor === segment.key ? null : (segment.key ?? null))
            }
            dangerouslySetInnerHTML={{ __html: renderMath(segment.content) }}
          />
        ),
      )}
    </p>
  );
}

function splitSegments(text: string): Segment[] {
  const spans = parseAnchorMarkup(text);
  const segments: Segment[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start > cursor) {
      segments.push({ kind: 'text', content: text.slice(cursor, span.start) });
    }
    segments.push({ kind: 'anchor', content: span.label, key: span.key });
    cursor = span.end;
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', content: text.slice(cursor) });
  }

  return segments;
}
