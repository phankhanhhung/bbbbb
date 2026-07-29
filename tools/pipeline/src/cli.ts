#!/usr/bin/env -S node --experimental-strip-types
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createValidator } from '@combviz/schema';
import { ENGINE_FRAGMENTS } from './engines.js';
import { runValidate } from './commands/validate.js';
import { runRender } from './commands/render.js';

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

Sẽ có ở các milestone sau: lint (M6), import-draft (M6), og (M6),
migrate (M5), stats (M6).
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
