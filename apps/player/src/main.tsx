import { render } from 'preact';
import 'katex/dist/katex.min.css';
import './styles.css';
import type { Problem } from '@combviz/schema';
import { Player } from './Player.jsx';
import chessboard from '@combviz/content/problems/mutilated-chessboard.json';
import ramsey from '@combviz/content/problems/ramsey-3-3-six.json';

/**
 * Điểm vào tạm thời.
 *
 * Chọn bài bằng `?p=<id>` cho tới khi có định tuyến và danh sách bài thật (CMS-02,
 * DAT-14 ở M5/M6). Đủ để mở cả hai engine trên thiết bị thật, không hơn.
 */
const PROBLEMS: Record<string, unknown> = {
  'mutilated-chessboard': chessboard,
  'ramsey-3-3-six': ramsey,
};

const requested = new URLSearchParams(location.search).get('p') ?? 'mutilated-chessboard';
const problem = (PROBLEMS[requested] ?? chessboard) as Problem;

const root = document.getElementById('app');
if (root) render(<Player problem={problem} />, root);
