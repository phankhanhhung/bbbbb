import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import 'katex/dist/katex.min.css';
import './styles.css';
import type { Problem } from '@combviz/schema';
import { Player } from './Player.jsx';
import { Bank } from './Bank.jsx';
import type { IndexEntry } from './bank-index.js';
import index from '@combviz/content/index.json';

/**
 * Điểm vào.
 *
 * Định tuyến bằng `?p=<id>`: không có bài thì hiện kho (CMS-02), có thì mở trang
 * bài (CMS-03). Router thật và prerender per-problem (D-09) đến khi kho đủ lớn để
 * SEO có nghĩa.
 *
 * Bài nạp **theo yêu cầu**, mỗi bài một chunk riêng. Trước đây chúng được import
 * tĩnh và liệt kê tay — đúng cho hai bài, và file này ghi sẵn ngưỡng phải đổi.
 * Kho nay có bốn mươi bảy bài: nạp tĩnh hết thì bundle đầu trang cõng theo mọi
 * bài người đọc không mở (NFR-P3), còn giữ danh sách tay thì kho liệt kê một bài
 * mà bấm vào ra trang trắng — im lặng, vì không ai đối chiếu hai danh sách.
 *
 * `import.meta.glob` sinh danh sách đó từ **thư mục**, nên nó không thể lệch.
 */
const LOADERS = import.meta.glob<{ default: Problem }>(
  '../../../packages/content/problems/*.json',
);

const loaderFor = (id: string): (() => Promise<{ default: Problem }>) | undefined =>
  LOADERS[
    Object.keys(LOADERS).find((path) => path.endsWith(`/${id}.json`)) ?? ''
  ];

function Root() {
  const [openId, setOpenId] = useState<string | null>(
    new URLSearchParams(location.search).get('p'),
  );
  const [problem, setProblem] = useState<Problem | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (openId === null) {
      setProblem(null);
      setMissing(false);
      return;
    }

    const load = loaderFor(openId);
    if (!load) {
      setMissing(true);
      return;
    }

    let live = true;
    setMissing(false);
    void load().then((module) => {
      if (live) setProblem(module.default);
    });
    return () => {
      live = false;
    };
  }, [openId]);

  const toBank = (): void => {
    const url = new URL(location.href);
    for (const key of ['p', 'step', 'sol']) url.searchParams.delete(key);
    history.pushState(null, '', url);
    setOpenId(null);
  };

  if (openId !== null && !missing) {
    // Chưa nạp xong thì **không** rơi về kho: nhấp một cái sang trang kho rồi
    // quay lại là thứ đọc như một lỗi.
    if (!problem) return <p class="hint">Đang tải bài…</p>;
    return <Player problem={problem} onBack={toBank} />;
  }

  return (
    <>
      {missing ? <p class="hint">Không tìm thấy bài “{openId}”.</p> : null}
      <Bank
        entries={index as IndexEntry[]}
        onOpen={(id) => {
          const url = new URL(location.href);
          url.searchParams.set('p', id);
          url.searchParams.delete('step');
          history.pushState(null, '', url);
          setOpenId(id);
        }}
      />
    </>
  );
}

const root = document.getElementById('app');
if (root) render(<Root />, root);
