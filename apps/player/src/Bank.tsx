import { useMemo, useState } from 'preact/hooks';
import type { IndexEntry } from './bank-index.js';
import { renderMath } from './math.js';

/**
 * Danh sách + lọc + tìm kiếm kho bài (CMS-02).
 *
 * Tìm kiếm client-side trên chỉ mục sinh lúc build: ở quy mô ≤ 500 bài, gửi cả
 * chỉ mục xuống rẻ hơn dựng backend — mà NG-08 cấm backend hẳn.
 *
 * Không dùng thư viện tìm kiếm: ở quy mô này, so khớp con chuỗi trên text đã
 * chuẩn hoá dấu là đủ và nhanh, còn một index engine đầy đủ tốn thêm vài KB
 * bundle để giải một bài toán ta chưa có.
 */
interface BankProps {
  entries: readonly IndexEntry[];
  onOpen: (id: string) => void;
}

export function Bank({ entries, onOpen }: BankProps) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');
  const [technique, setTechnique] = useState('');
  const [engine, setEngine] = useState('');

  const topics = useMemo(() => unique(entries.flatMap((e) => e.topics)), [entries]);
  const techniques = useMemo(() => unique(entries.flatMap((e) => e.techniques)), [entries]);
  const engines = useMemo(() => unique(entries.flatMap((e) => e.engines)), [entries]);

  const results = useMemo(() => {
    const needle = fold(query);
    return entries.filter(
      (entry) =>
        (needle === '' || fold(entry.text).includes(needle)) &&
        (topic === '' || entry.topics.includes(topic)) &&
        (technique === '' || entry.techniques.includes(technique)) &&
        (engine === '' || entry.engines.includes(engine)),
    );
  }, [entries, query, topic, technique, engine]);

  return (
    <div class="player">
      <header class="player__head">
        <h1>Kho bài</h1>
        <p class="source">{entries.length} bài đã xuất bản</p>
      </header>

      <div class="bank__filters">
        <input
          type="search"
          placeholder="Tìm trong đề bài và lời giải…"
          value={query}
          onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
        />
        <Select label="Chủ đề" value={topic} options={topics} onChange={setTopic} />
        <Select label="Kỹ thuật" value={technique} options={techniques} onChange={setTechnique} />
        <Select label="Engine" value={engine} options={engines} onChange={setEngine} />
      </div>

      {results.length === 0 ? (
        <p class="hint">Không có bài nào khớp.</p>
      ) : (
        <ul class="bank">
          {results.map((entry) => (
            <li key={entry.id}>
              <button class="bank__card" onClick={() => onOpen(entry.id)}>
                {/* Tiêu đề là đề bài, và đề bài combinatorics gần như luôn có
                    ký hiệu toán. Hiện thô thì thẻ bài đọc ra "8 times8". */}
                <span
                  class="bank__title"
                  dangerouslySetInnerHTML={{ __html: renderMath(entry.title) }}
                />
                <span class="bank__meta">
                  {entry.contest}
                  {entry.year ? ` ${entry.year}` : ''} · {entry.slot} · {entry.steps} bước
                </span>
                <span class="bank__tags">
                  {entry.topics.map((t) => (
                    <span key={t} class="tag">{t}</span>
                  ))}
                  {entry.hasBranching ? <span class="tag tag--feature">phân nhánh</span> : null}
                  {entry.hasInvariants ? <span class="tag tag--feature">bất biến</span> : null}
                  {entry.hasSandbox ? <span class="tag tag--feature">sandbox</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
}) {
  return (
    <label class="bank__select">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange((event.currentTarget as HTMLSelectElement).value)}
      >
        <option value="">tất cả</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Chuẩn hoá dấu tiếng Việt để gõ "ban co" cũng tìm ra "bàn cờ".
 *
 * Học sinh gõ trên bàn phím điện thoại rất hay bỏ dấu, và bắt họ gõ đúng dấu mới
 * ra kết quả là bắt sai người trả giá.
 */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}
