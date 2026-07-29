#!/usr/bin/env -S node --experimental-strip-types
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createValidator } from '@combviz/schema';
import { ENGINE_FRAGMENTS } from './engines.js';
import { runValidate } from './commands/validate.js';
import { runRender } from './commands/render.js';
import { runMigrate } from './commands/migrate.js';
import { runFmt } from './commands/fmt.js';
import { runImportDraft } from './commands/import-draft.js';
import { runOg } from './commands/og.js';
import { runStats } from './commands/stats.js';
import { runIndex } from './commands/index-bank.js';
import { runCoverage } from './commands/coverage.js';
import { runEval } from './commands/eval-expr.js';

/**
 * CLI của xưởng in (D-13).
 *
 * Studio, CLI và CI chạy **cùng một bộ luật** (AUT-04) — mọi check sống trong
 * `packages/schema` và các engine fragment, ở đây chỉ là vỏ gọi. Bất kỳ check nào
 * viết riêng cho CLI là mầm của tình trạng "CI xanh mà Studio đỏ".
 */

const USAGE = `combviz — công cụ soạn/duyệt kho bài

  combviz validate [đường-dẫn-content] [--strict]
      Validate toàn kho: schema, cấu trúc cây, anchor, bound, taxonomy.
      Mặc định content root = packages/content.
      --strict: coi cảnh báo là lỗi (dùng trong CI khi kho đã sạch).

  combviz schema [--out <file>]
      In JSON Schema của Problem (DAT-01). Không có --out thì in ra stdout.

  combviz render <problem-id> [--sol <id>] [--step <id>] [--out <file.svg>]
                              [--patterns] [--width <px>]
      Render một scene ra SVG, chạy trong Node, không cần browser (REN-01).
      Không chỉ --step thì lấy step cuối của nhánh chính.

  combviz fmt [--root <content>] [--write]
      Đưa file bài về định dạng chuẩn tắc (DAT-03). Mặc định chỉ kiểm.

  combviz migrate [--root <content>] [--write]
      Nâng toàn kho lên schema hiện tại (DAT-02). Mặc định chạy khô.

  combviz import-draft <file.json> [--root <content>] [--write]
      Nhận một draft (AUT-09): ép status=draft và verified=false trên mọi step,
      chạy đủ validate + lint. Chỉ đạt mới vào hàng đợi duyệt.

  combviz og [--root <content>] [--out <dir>] [--problem <id>]
      Sinh OG/social card cho từng bài (REN-02).

  combviz index [--root <content>] [--out <file.json>]
      Sinh chỉ mục kho cho tìm kiếm client-side (CMS-02).

  combviz stats [--log <file.jsonl>]
      Thời gian soạn/duyệt theo bài, đối chiếu AUT-KPI.

  combviz eval <problem-id> [biểu-thức…] [--root <content>]
      Chạy biểu thức DSL trên từng step. Không truyền biểu thức thì chạy các
      invariant của bài — cách nhanh nhất kiểm hình có khớp narrative không.

  combviz coverage [--root <content>] [--drafts] [--strict]
      Bảng điểm content sprint theo DoD Phase 1 §15.1: phân bố grid/graph/
      bất biến/case-branching, sandbox, lint, OG card.
      --drafts: tính cả bài chưa published.
`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case 'validate': {
      const { values, positionals } = parseArgs({
        args: rest,
        options: { strict: { type: 'boolean', default: false } },
        allowPositionals: true,
      });
      const root = resolve(positionals[0] ?? 'packages/content');
      const report = await runValidate({ root, strict: values.strict });
      return report.errors > 0 || (values.strict && report.warnings > 0) ? 1 : 0;
    }

    case 'schema': {
      const { values } = parseArgs({
        args: rest,
        options: { out: { type: 'string' } },
      });
      const json = JSON.stringify(createValidator(ENGINE_FRAGMENTS).jsonSchema, null, 2);
      if (values.out) {
        await writeFile(resolve(values.out), `${json}\n`, 'utf8');
        console.log(`Đã ghi JSON Schema → ${values.out}`);
      } else {
        console.log(json);
      }
      return 0;
    }

    case 'render': {
      const { values, positionals } = parseArgs({
        args: rest,
        options: {
          sol: { type: 'string' },
          step: { type: 'string' },
          out: { type: 'string' },
          root: { type: 'string', default: 'packages/content' },
          width: { type: 'string' },
          patterns: { type: 'boolean', default: false },
        },
        allowPositionals: true,
      });

      const problemId = positionals[0];
      if (!problemId) {
        console.error('Thiếu <problem-id>.\n');
        console.error(USAGE);
        return 2;
      }

      const svg = await runRender({
        root: resolve(values.root),
        problemId,
        ...(values.sol ? { solutionId: values.sol } : {}),
        ...(values.step ? { stepId: values.step } : {}),
        ...(values.out ? { out: resolve(values.out) } : {}),
        ...(values.width ? { width: Number(values.width) } : {}),
        patterns: values.patterns,
      });

      if (values.out) console.log(`Đã ghi SVG → ${values.out}`);
      else console.log(svg);
      return 0;
    }

    case 'fmt': {
      const { values } = parseArgs({
        args: rest,
        options: {
          root: { type: 'string', default: 'packages/content' },
          write: { type: 'boolean', default: false },
        },
      });

      const report = await runFmt({ root: resolve(values.root), write: values.write });
      return !values.write && report.changed > 0 ? 1 : 0;
    }

    case 'import-draft': {
      const { values, positionals } = parseArgs({
        args: rest,
        options: {
          root: { type: 'string', default: 'packages/content' },
          write: { type: 'boolean', default: false },
        },
        allowPositionals: true,
      });

      const file = positionals[0];
      if (!file) {
        console.error('Thiếu <file.json>.\n');
        console.error(USAGE);
        return 2;
      }

      const report = await runImportDraft({
        file: resolve(file),
        root: resolve(values.root),
        write: values.write,
      });
      return report.errors > 0 ? 1 : 0;
    }

    case 'og': {
      const { values } = parseArgs({
        args: rest,
        options: {
          root: { type: 'string', default: 'packages/content' },
          out: { type: 'string', default: 'packages/content/.og' },
          problem: { type: 'string' },
        },
      });

      await runOg({
        root: resolve(values.root),
        out: resolve(values.out),
        ...(values.problem ? { problemId: values.problem } : {}),
      });
      return 0;
    }

    case 'index': {
      const { values } = parseArgs({
        args: rest,
        options: {
          root: { type: 'string', default: 'packages/content' },
          out: { type: 'string', default: 'packages/content/index.json' },
        },
      });

      await runIndex({ root: resolve(values.root), out: resolve(values.out) });
      return 0;
    }

    case 'eval': {
      const { values, positionals } = parseArgs({
        args: rest,
        options: { root: { type: 'string', default: 'packages/content' } },
        allowPositionals: true,
      });

      const [problemId, ...expressions] = positionals;
      if (!problemId) {
        console.error('Thiếu <problem-id>.\n');
        console.error(USAGE);
        return 2;
      }

      const failures = await runEval({
        root: resolve(values.root),
        problemId,
        expressions,
      });
      return failures > 0 ? 1 : 0;
    }

    case 'coverage': {
      const { values } = parseArgs({
        args: rest,
        options: {
          root: { type: 'string', default: 'packages/content' },
          drafts: { type: 'boolean', default: false },
          strict: { type: 'boolean', default: false },
        },
      });

      const met = await runCoverage({
        root: resolve(values.root),
        includeDrafts: values.drafts,
      });
      return values.strict && !met ? 1 : 0;
    }

    case 'stats': {
      const { values } = parseArgs({
        args: rest,
        options: { log: { type: 'string', default: 'packages/content/.authoring-log.jsonl' } },
      });

      return (await runStats({ log: resolve(values.log) })) ? 0 : 1;
    }

    case 'migrate': {
      const { values } = parseArgs({
        args: rest,
        options: {
          root: { type: 'string', default: 'packages/content' },
          write: { type: 'boolean', default: false },
        },
      });

      const report = await runMigrate({
        root: resolve(values.root),
        write: values.write,
      });
      return report.failed > 0 ? 1 : 0;
    }

    case undefined:
    case '--help':
    case '-h':
    case 'help':
      console.log(USAGE);
      return 0;

    default:
      console.error(`Không có lệnh "${command}".\n`);
      console.error(USAGE);
      return 2;
  }
}

process.exitCode = await main(process.argv.slice(2));
