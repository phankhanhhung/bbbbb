#!/usr/bin/env -S node --experimental-strip-types
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createValidator } from '@combviz/schema';
import { ENGINE_FRAGMENTS } from './engines.js';
import { runValidate } from './commands/validate.js';

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

Sẽ có ở các milestone sau: lint (M6), import-draft (M6), og (M6),
render (M6), migrate (M5), stats (M6).
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
