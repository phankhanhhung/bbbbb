import { formatProblem, parseAnchorMarkup, stripAnchorMarkup } from '@combviz/schema';
import type { Problem, Step, ValidationIssue } from '@combviz/schema';

/**
 * Lint biên tập (AUT-10).
 *
 * Chia hai tầng, và ranh giới giữa chúng là có chủ đích:
 *   - **Nhất quán thị giác** do engine ép (DAT-20): file không chứa màu, nên
 *     không bài nào lệch được.
 *   - **Nhất quán biên tập** do Style Guide + lint ép. Lint chỉ enforce phần máy
 *     kiểm được — format nhãn, thuật ngữ, ràng buộc chéo. Giọng văn và độ dài
 *     một ý thì con người chịu trách nhiệm, và lint chỉ *nhắc*, không chặn.
 *
 * Quy tắc: lint chặn (error) khi sai là **sai khách quan**; cảnh báo khi sai là
 * *có thể* sai. Đặt nhầm chỗ này thì hoặc lint cản trở, hoặc lint bị bỏ qua.
 */
export function lintProblem(problem: Problem, raw?: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  issues.push(...checkFormatting(problem, raw));
  issues.push(...checkGlossary(problem));
  issues.push(...checkPublishReadiness(problem));

  problem.solutions.forEach((solution, si) => {
    solution.steps.forEach((step, i) => {
      issues.push(...checkStep(step, `/solutions/${si}/steps/${i}`, problem));
    });
    issues.push(...checkCaseSiblings(solution.steps, `/solutions/${si}`));
  });

  return issues;
}

/** DAT-03: file trong kho phải ở định dạng chuẩn tắc. */
function checkFormatting(problem: Problem, raw?: string): ValidationIssue[] {
  if (raw === undefined) return [];
  if (formatProblem(problem) === raw) return [];

  return [
    {
      code: 'lint/not-formatted',
      severity: 'warning',
      message: 'File chưa ở định dạng chuẩn tắc',
      path: '',
      hint: 'Chạy `combviz fmt --write` — diff git là công cụ review chính (§4.1)',
    },
  ];
}

/**
 * Glossary: thuật ngữ có nhiều cách viết thì kho chọn **một**.
 *
 * Không phải chuyện đúng sai chính tả — cả hai cách viết đều đúng tiếng Việt.
 * Nhưng một kho dùng lẫn "đồ thị hai phía" và "đồ thị lưỡng phân" bắt người học
 * phải tự nhận ra đó là một khái niệm, và đó là thuế nhận thức đánh vào đúng
 * người ít có khả năng trả nhất.
 */
/**
 * Ranh giới từ **không** dùng `\b`.
 *
 * `\b` của JS chỉ biết `[A-Za-z0-9_]`, nên `\bô vuông nhỏ\b` không bao giờ khớp:
 * "ô" không phải word char, khoảng trắng trước nó cũng không, nên vị trí đó
 * chẳng có ranh giới nào. Cả một nửa bảng glossary từng chết câm vì lý do này —
 * đúng loại lỗi mà một linter im lặng không bao giờ tự tố cáo.
 */
const term = (source: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])${source}(?![\\p{L}\\p{N}])`, 'giu');

const GLOSSARY: readonly { readonly wrong: RegExp; readonly right: string }[] = [
  { wrong: term('lưỡng phân'), right: 'hai phía' },
  { wrong: term('song ánh học'), right: 'song ánh' },
  { wrong: term('nguyên lý chuồng bồ câu'), right: 'nguyên lý Dirichlet' },
  { wrong: term('pigeonhole'), right: 'Dirichlet' },
  { wrong: term('bất biến số'), right: 'bất biến' },
  { wrong: term('ô vuông nhỏ'), right: 'ô' },
  { wrong: term('hình vuông đơn vị'), right: 'ô' },
];

/**
 * Chỉ soi bản **tiếng Việt**, và đó là một quyết định chứ không phải bỏ sót (M69).
 *
 * Lằn ranh của cả kho: luật **markup phải giải được** (anchor `[[…]]`, giá trị
 * `{{…}}`) chạy trên *mọi* bản ngôn ngữ, vì một khoá hỏng là một khoá hỏng bất kể
 * thứ tiếng. Luật **văn phong** thì không: bảng dưới đây là các cách gọi tiếng
 * Việt mà kho đã thống nhất, và Style Guide v1.0 đo độ dài, số câu, mật độ anchor
 * trên $114$ bài **tiếng Việt**. Đem thước ấy đo văn tiếng Anh là đo bằng cái
 * thước của ngôn ngữ khác.
 */
function checkGlossary(problem: Problem): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const scan = (text: string, path: string): void => {
    for (const entry of GLOSSARY) {
      entry.wrong.lastIndex = 0;
      const match = entry.wrong.exec(text);
      if (!match) continue;
      issues.push({
        code: 'lint/glossary',
        severity: 'warning',
        message: `Dùng "${match[0]}"; kho thống nhất dùng "${entry.right}"`,
        path,
        hint: 'Một khái niệm, một cách gọi — xem docs/STYLE-GUIDE.md',
      });
    }
  };

  scan(problem.statement.vi, '/statement/vi');
  problem.solutions.forEach((solution, si) => {
    solution.steps.forEach((step, i) => {
      if (step.narrative) scan(step.narrative.vi, `/solutions/${si}/steps/${i}/narrative/vi`);
    });
  });

  return issues;
}

/**
 * Format `case_label`: `Trường hợp N: …` cho mức một, `Na: …` cho mức hai.
 *
 * Breadcrumb ghép các nhãn này lại bằng "›", nên chúng phải đọc được khi đứng
 * cạnh nhau. Nhãn tự do sẽ cho ra những chuỗi như "nếu nó chẵn › còn nếu lẻ thì".
 */
const CASE_LABEL = /^(Trường hợp \d+|[0-9]+[a-z]|[a-z]\))\s*[:.]\s*\S/;

/**
 * Nhãn ngắn là **chữ trơn**, không phải LaTeX.
 *
 * `case_label` và `label` của pha đi thẳng vào DOM dưới dạng text: Player in
 * `child.case_label?.vi` nguyên văn ở breadcrumb và ở `TreeNavigator`, còn nhãn pha
 * thành `aria-valuetext` của thanh tua. Không chỗ nào trong hai chỗ ấy chạy KaTeX,
 * nên `$1$` hiện ra đúng bốn ký tự `$1$` — và với người dùng trình đọc màn hình thì
 * nó được đọc thành "đô la một đô la".
 *
 * Chỉ narrative và statement mới qua bộ sắp chữ. Ranh giới ấy không đọc ra được từ
 * schema (cả hai đều là `{ vi: string }`), nên nó phải nằm ở lint — cả hai lỗi này
 * đều đã lọt vào kho một lần trước khi có luật.
 */
function checkPlainLabels(step: Step, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const flag = (value: string, at: string, what: string): void => {
    if (!/\$[^$]*\$/.test(value)) return;
    issues.push({
      code: 'lint/label-not-plain',
      severity: 'warning',
      message: `${what} "${value}" chứa LaTeX mà chỗ hiện nó không sắp chữ`,
      path: at,
      hint: 'Viết bằng chữ trơn — nhãn này in nguyên văn vào giao diện và vào trình đọc màn hình',
    });
  };

  if (step.case_label) flag(step.case_label.vi, `${path}/case_label/vi`, 'case_label');

  /**
   * `config.caption` — **bảy** engine có trường này và **không** engine nào cho nó
   * đi qua label atlas (D-07): nó là chữ vẽ thẳng vào SVG.
   *
   * Lớp lỗi này sống thật và tái phát: M69 bắt được hai caption in nguyên văn
   * `$\\sigma$` và `$RRRUUU$` ra hình — bắt bằng **lượt nhìn**, sau khi chúng đã
   * xuất bản một thời gian. Rồi ngay ở M73 nó lại xuất hiện lần thứ ba trên một
   * bài vừa soạn. Ba lần là đủ để thôi bắt bằng mắt.
   */
  for (const scene of [step.scene, step.bijection?.scene]) {
    const caption = (scene?.config as { caption?: unknown } | undefined)?.caption;
    if (typeof caption === 'string') flag(caption, `${path}/scene/config/caption`, 'caption');
  }

  const phases = [...(step.choreography?.phases ?? [])].sort(
    (a, b) => a.at + a.duration - (b.at + b.duration),
  );
  const lastPhase = phases.at(-1);

  // Bốn thay đổi liên tiếp không một chỗ nghỉ là đúng thứ làm timeline "chạy vù vù
  // khó hiểu". Ngưỡng đặt ở **bốn** chứ không phải hai: hai ba pha ngắn thì mạch
  // liền vẫn đọc được, và ép nghỉ ở đó chỉ tổ thêm một cú bấm.
  if (phases.length >= 4 && !phases.some((p) => p.hold === true)) {
    issues.push({
      code: 'lint/timeline-no-hold',
      severity: 'warning',
      message: `Timeline ${phases.length} pha mà không có mốc dừng nào`,
      path: `${path}/choreography/phases`,
      hint: 'Đặt `hold: true` ở cuối mỗi nhịp người đọc cần hấp thụ (CHO-11)',
    });
  }

  // `hold` ở pha cuối không làm gì: phát lại đằng nào cũng dừng ở đó.
  if (lastPhase?.hold === true) {
    issues.push({
      code: 'lint/hold-at-end',
      severity: 'warning',
      message: `Pha cuối "${lastPhase.id}" đặt hold — phát lại đằng nào cũng dừng ở đó`,
      path: `${path}/choreography/phases`,
    });
  }

  step.choreography?.phases.forEach((phase, i) => {
    // **Mỗi pha phải có chữ.** Nhãn nay hiện ở mọi chế độ, nên một pha không nhãn là
    // một đoạn hình đổi mà không ai nói vì sao — đúng thứ làm timeline khó theo. Cả
    // 87 pha trong kho đều đã có nhãn khi luật này ra đời, nên nó không đòi sửa gì;
    // nó giữ cho pha thứ 88 không lọt.
    if (!phase.label) {
      issues.push({
        code: 'lint/phase-no-label',
        severity: 'warning',
        message: `Pha "${phase.id}" không có nhãn — người xem thấy hình đổi mà không biết vì sao`,
        path: `${path}/choreography/phases/${i}`,
        hint: 'Nhãn hiện ngay dưới thanh tua, và là thứ duy nhất giải thích pha ấy',
      });
    }
    if (phase.hold === true && !phase.label) {
      issues.push({
        code: 'lint/phase-hold-no-label',
        severity: 'warning',
        message: `Pha "${phase.id}" dừng lại mà không có gì để đọc`,
        path: `${path}/choreography/phases/${i}/hold`,
        hint: 'Dừng mà không có chữ là kẹt, không phải nghỉ',
      });
    }
  });
  step.choreography?.phases.forEach((phase, i) => {
    if (phase.label) {
      flag(phase.label.vi, `${path}/choreography/phases/${i}/label/vi`, `Nhãn pha "${phase.id}"`);
    }
  });

  return issues;
}

function checkStep(step: Step, path: string, problem: Problem): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (step.edge_type === 'case' && step.case_label && !CASE_LABEL.test(step.case_label.vi)) {
    issues.push({
      code: 'lint/case-label-format',
      severity: 'warning',
      message: `case_label "${step.case_label.vi}" không theo mẫu`,
      path: `${path}/case_label/vi`,
      hint: 'Mẫu: "Trường hợp 2: …" ở mức một, "2a: …" ở mức hai',
    });
  }

  issues.push(...checkPlainLabels(step, path));

  if (step.narrative) {
    const spans = parseAnchorMarkup(step.narrative.vi);
    const plain = stripAnchorMarkup(step.narrative.vi);

    // Step có hình mà narrative không trỏ vào hình nào là dấu hiệu văn bản và
    // hình đang chạy song song mà không gặp nhau — mất đúng cái ANC-01 tồn tại vì.
    //
    // Điều kiện là "có scene", không phải "có element": bàn cờ 8×8 sinh 64 ô từ
    // `config` với `elements` rỗng (D-16), nên đếm element sẽ miễn trừ đúng
    // những bài dùng engine board. Step `merge_ref` không có scene nên tự khỏi.
    if (spans.length === 0 && step.scene) {
      issues.push({
        code: 'lint/no-anchor',
        severity: 'warning',
        message: `Step "${step.id}" có element trong hình nhưng narrative không neo vào cái nào`,
        path,
        hint: 'Neo hai chiều (ANC-01) là điểm khác biệt so với đọc lời giải tĩnh',
      });
    }

    if (/\s{2,}/.test(plain) || plain !== plain.trim()) {
      issues.push({
        code: 'lint/whitespace',
        severity: 'warning',
        message: 'Narrative có khoảng trắng thừa',
        path: `${path}/narrative/vi`,
      });
    }

    const sentences = plain.split(/[.!?…]\s+/).filter((s) => s.trim().length > 0);
    if (sentences.length > 4) {
      issues.push({
        code: 'lint/too-many-sentences',
        severity: 'warning',
        message: `Step "${step.id}" có ${sentences.length} câu`,
        path: `${path}/narrative/vi`,
        hint: 'Style Guide: một ý một step — cân nhắc tách',
      });
    }
  }

  if (problem.status === 'published' && step.scene && !step.alt_text) {
    issues.push({
      code: 'lint/missing-alt-text',
      severity: 'warning',
      message: `Step "${step.id}" chưa có alt_text`,
      path,
      hint: 'NFR-A3. Fallback tự sinh chỉ đếm element, không nói được ý nghĩa',
    });
  }

  return issues;
}

/**
 * Nhánh `case` phải có ít nhất hai anh em.
 *
 * Một trường hợp duy nhất thì không phải xét trường hợp — hoặc tác giả quên
 * nhánh còn lại, hoặc `case` này lẽ ra là `seq`. Cả hai đều là lỗi soạn bài, và
 * cả hai đều làm tree navigator hiện một điểm rẽ nhánh chỉ có một lựa chọn.
 */
function checkCaseSiblings(steps: readonly Step[], basePath: string): ValidationIssue[] {
  const byParent = new Map<string, Step[]>();
  for (const step of steps) {
    if (step.edge_type !== 'case' || step.parent === null) continue;
    byParent.set(step.parent, [...(byParent.get(step.parent) ?? []), step]);
  }

  const issues: ValidationIssue[] = [];
  for (const [parent, siblings] of byParent) {
    if (siblings.length >= 2) continue;
    const index = steps.findIndex((s) => s.id === siblings[0]?.id);
    issues.push({
      code: 'lint/lone-case',
      severity: 'warning',
      message: `Chỉ có một nhánh case dưới step "${parent}"`,
      path: `${basePath}/steps/${index}`,
      hint: 'Thiếu nhánh còn lại, hoặc bước này lẽ ra là "seq"',
    });
  }

  return issues;
}

function checkPublishReadiness(problem: Problem): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (problem.status !== 'published') return issues;

  // REN-02 chọn được step tiêu biểu thì OG card nói đúng về bài; không thì nó lấy
  // step cuối nhánh chính, mà step cuối thường là kết luận chứ không phải hình
  // đẹp nhất.
  if (!problem.og_step_ref) {
    issues.push({
      code: 'lint/no-og-step',
      severity: 'warning',
      message: 'Chưa chọn step tiêu biểu cho OG card',
      path: '/og_step_ref',
      hint: 'REN-02; vắng thì lấy step cuối nhánh chính',
    });
  }

  /**
   * Bài khai `illustration` **được miễn** sandbox, đúng như `combviz coverage`
   * đã miễn từ M9.
   *
   * Hai luật cùng một kho mà nói ngược nhau thì một trong hai sẽ bị bỏ qua, và
   * luật hay bị bỏ qua nhất là luật cảnh báo về thứ tác giả **cố ý** làm. Miễn ở
   * đây không phải cửa lách: `illustration` là tuyên bố rằng bài này không có
   * thao tác nào có nghĩa, và ép sandbox lên nó chỉ đẻ ra đồ chơi cho đủ chỉ tiêu.
   */
  if (!problem.sandbox && (problem.kind ?? 'illustration') !== 'illustration') {
    issues.push({
      code: 'lint/no-sandbox',
      severity: 'warning',
      message: 'Bài published nhưng không có sandbox',
      path: '/sandbox',
      hint: 'DoD Phase 1: 100% bài có sandbox + validator; bài không có thao tác nào có nghĩa thì khai `kind: "illustration"`',
    });
  }

  return issues;
}
