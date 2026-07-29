import { render } from 'preact';
import { useState } from 'preact/hooks';
import 'katex/dist/katex.min.css';
import './styles.css';
import type { Problem } from '@combviz/schema';
import { Player } from './Player.jsx';
import { Bank } from './Bank.jsx';
import type { IndexEntry } from './bank-index.js';
import index from '@combviz/content/index.json';
import chessboard from '@combviz/content/problems/mutilated-chessboard.json';
import ramsey from '@combviz/content/problems/ramsey-3-3-six.json';

/**
 * Điểm vào.
 *
 * Định tuyến bằng `?p=<id>`: không có bài thì hiện kho (CMS-02), có thì mở trang
 * bài (CMS-03). Router thật và prerender per-problem (D-09) đến khi kho đủ lớn để
 * SEO có nghĩa — hiện tại thêm một router là thêm một phụ thuộc cho hai bài.
 *
 * Bài nạp tĩnh cho tới lúc đó; ở 25 bài thì chuyển sang `fetch` theo id.
 */
const PROBLEMS: Record<string, unknown> = {
  'mutilated-chessboard': chessboard,
  'ramsey-3-3-six': ramsey,
};

function Root() {
  const [openId, setOpenId] = useState<string | null>(
    new URLSearchParams(location.search).get('p'),
  );

  const problem = openId ? (PROBLEMS[openId] as Problem | undefined) : undefined;

  if (!problem) {
    return (
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
    );
  }

  return <Player problem={problem} onBack={() => {
    const url = new URL(location.href);
    url.searchParams.delete('p');
    url.searchParams.delete('step');
    url.searchParams.delete('sol');
    history.pushState(null, '', url);
    setOpenId(null);
  }} />;
}

const root = document.getElementById('app');
if (root) render(<Root />, root);
