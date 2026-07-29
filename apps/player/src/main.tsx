import { render } from 'preact';
import 'katex/dist/katex.min.css';
import './styles.css';
import type { Problem } from '@combviz/schema';
import { Player } from './Player.jsx';
import problem from '@combviz/content/problems/mutilated-chessboard.json';

/**
 * Điểm vào của walking skeleton.
 *
 * M1 nạp cứng một bài. Định tuyến, danh sách bài và deep-link (DAT-14) thuộc M5/M6
 * — chỗ này chỉ cần đủ để trả lời ba câu hỏi kiến trúc trên thiết bị thật.
 */
const root = document.getElementById('app');
if (root) render(<Player problem={problem as unknown as Problem} />, root);
