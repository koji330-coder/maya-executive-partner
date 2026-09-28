/**
 * Re-renders an E2E v2 report from a saved run, without calling anything.
 *   node --no-warnings --experimental-transform-types --import ./server/scripts/jev-router/register.mjs \
 *     server/scripts/jev-router/rerender2.ts <results/...-e2e2 directory> [threshold]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { renderV2 } from './report2.ts';
import type { V2Row } from './v2shared.ts';

const dir = process.argv[2];
if (!dir) throw new Error('結果のディレクトリを渡してください。');
const rows = readFileSync(path.join(dir, 'rows.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as V2Row);
writeFileSync(path.join(dir, 'report.md'), renderV2(rows, Number(process.argv[3] ?? '0.9'), dir));
console.log(path.join(dir, 'report.md'));
