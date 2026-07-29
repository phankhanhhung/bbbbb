import type { Problem, Scene, Solution, Step, ValidationIssue } from '@combviz/schema';

/**
 * `derivation/silent-drop` — hạng tử **biến mất** giữa hai bước mà không khai.
 *
 * Đây là phần có răng của Derivation engine, và là lý do engine ấy đáng làm chứ
 * không chỉ là một bộ xếp chữ.
 *
 * Lỗi đại số hay gặp nhất khi soạn tay không phải tính sai, mà là **đánh rơi**:
 * một $\binom{n}{k}$ có ở dòng trên, dòng dưới không còn, và không ai để ý vì
 * dòng dưới trông vẫn hợp lý. Ở đây từng hạng tử có `id`, nên "đánh rơi" là thứ
 * máy đếm được: id nào có ở bước $k$ mà mất ở bước $k+1$.
 *
 * Cửa thoát là `cancelled: true` — tác giả **khai** rằng hạng tử ấy triệt tiêu,
 * và khai xong thì nó được gạch chéo trong hình. Nói cách khác: mọi hạng tử biến
 * mất đều phải có một lời giải thích **nhìn thấy được**. Đó chính là cùng một
 * luật với `claims` và `expects_violation`: chủ đích thì phải viết ra.
 *
 * Là **lỗi** chứ không phải cảnh báo, cùng lý do với `claims`: một hạng tử rơi
 * mất không có phiên bản "cố ý mà không nói".
 *
 * Hai chỗ luật **cố ý không với tới**, và cả hai đều phát hiện khi cho nó chạy
 * lần đầu trên chính bài telescoping — nó báo 14 lỗi, trong đó 14 đều không phải
 * lỗi:
 *
 *   - **Dấu phép toán và dấu quan hệ** (`role` khác `'term'`). Khi $\frac12$ và
 *     $\frac12$ khử nhau thì dấu $+$ giữa chúng cũng đi theo; bắt tác giả khai
 *     cho từng dấu cộng là biến một luật có ích thành thủ tục giấy tờ. Rủi ro bỏ
 *     sót ở đây nhỏ: mất một dấu trừ thì dòng công thức **trông** đã sai rồi.
 *   - **Bước thay hẳn cách trình bày.** Từ "phát biểu bài toán" sang "khai triển
 *     với $n = 4$" thì không hạng tử nào mang sang, và so hai bên là vô nghĩa.
 *     Dấu hiệu của tính liên tục là **có ít nhất một id đi tiếp**; không có id
 *     nào chung thì đây là hai cách trình bày khác nhau, không phải một phép
 *     biến đổi.
 *
 * Cái giá của lằn ranh thứ hai, nói thẳng: viết lại **toàn bộ** một dòng thì
 * luật không soi được. Đổi lại nó không bao giờ báo sai, và một luật hay báo sai
 * là luật sẽ bị tắt.
 */
export function checkDerivation(problem: Problem): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  problem.solutions.forEach((solution, si) => {
    solution.steps.forEach((step, i) => {
      const before = termsOf(step.scene);
      if (before === null) return;

      for (const child of childrenOf(solution, step)) {
        const after = termsOf(child.scene);
        // Bước sau đổi sang engine khác thì không so được — và cũng không nên:
        // chuyển từ chuỗi biến đổi sang một hình khác là chuyện hợp lệ.
        if (after === null) continue;

        // Không id nào đi tiếp ⇒ đây là đổi cách trình bày, không phải biến đổi.
        const continuous = [...before.keys()].some((id) => after.has(id));
        if (!continuous) continue;

        for (const [id, term] of before) {
          // Chỉ soi **hạng tử**; dấu phép toán và dấu quan hệ là chất kết dính.
          if (after.has(id) || term.role !== 'term') continue;
          if (term.cancelled) continue;

          if (term.becomes !== undefined) {
            // Khai phép thế thì phải khai **đúng**: id được trỏ tới có mặt thật.
            if (after.has(term.becomes)) continue;
            issues.push({
              code: 'derivation/becomes-missing',
              severity: 'error',
              message: `Hạng tử "${id}" khai biến thành "${term.becomes}", nhưng step "${child.id}" không có hạng tử ấy`,
              path: `/solutions/${si}/steps/${i}`,
              hint: 'Khai phép thế mà id đích không tồn tại thì lời khai ấy không kiểm được gì',
            });
            continue;
          }

          issues.push({
            code: 'derivation/silent-drop',
            severity: 'error',
            message: `Hạng tử "${id}" ($${term.tex}$) có ở step "${step.id}" nhưng mất ở step "${child.id}"`,
            path: `/solutions/${si}/steps/${i}`,
            hint: 'Khai `cancelled: true` (triệt tiêu, sẽ gạch chéo) hoặc `becomes: "<id>"` (bị thay thế)',
          });
        }
      }
    });
  });

  return issues;
}

interface TermInfo {
  readonly tex: string;
  readonly cancelled: boolean;
  readonly becomes: string | undefined;
  readonly role: string;
}

function termsOf(scene: Scene | undefined): Map<string, TermInfo> | null {
  if (!scene || scene.engine !== 'derivation') return null;
  const out = new Map<string, TermInfo>();
  for (const element of scene.elements ?? []) {
    if (element.type !== 'term') continue;
    const record = element as unknown as Record<string, unknown>;
    out.set(element.id, {
      tex: typeof record['tex'] === 'string' ? record['tex'] : '',
      cancelled: record['cancelled'] === true,
      role: typeof record['role'] === 'string' ? record['role'] : 'term',
      becomes: typeof record['becomes'] === 'string' ? record['becomes'] : undefined,
    });
  }
  return out;
}

/**
 * Các bước **nối tiếp** của một bước.
 *
 * Đọc theo `parent` chứ không theo thứ tự mảng: cây lời giải có nhánh (`case`,
 * `lemma`), và ở một nhánh rẽ thì "bước sau" là nhiều bước chứ không phải một.
 * So theo thứ tự mảng sẽ đối chiếu nhầm hai nhánh khác nhau với nhau.
 */
function childrenOf(solution: Solution, step: Step): Step[] {
  return solution.steps.filter((other) => other.parent === step.id);
}
