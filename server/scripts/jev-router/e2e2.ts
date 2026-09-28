/**
 * E2E v2 runner. Every case runs `--reps` times (default 3) through the
 * current pipeline and the Jev v2 pipelines; the first rep's answers are also
 * scored by the judge. Rows are appended as they finish, so a stopped run
 * keeps what it measured, and `report2.ts` re-scores a saved run without
 * calling anything.
 *
 *   NODE_USE_ENV_PROXY=1 node --no-warnings --experimental-transform-types \
 *     --import ./server/scripts/jev-router/register.mjs server/scripts/jev-router/e2e2.ts \
 *     [--reps 3] [--cases A01,P01] [--threshold 0.9] [--budget-usd 12] [--no-judge]
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateMayaResponse } from '@/features/chat/mayaResponse';

import { CASES, type RouterCase } from './cases.ts';
import { judgeAbsolute, type AbsoluteVerdict } from './judge2.ts';
import { evalSystemPrompt, GEMINI_MODEL, GEMINI_USD_PER_INPUT_TOKEN, GEMINI_USD_PER_OUTPUT_TOKEN, type PipelineResult } from './pipelines.ts';
import { runTurnV2 } from './pipelines2.ts';
import { actualSpend, PIPELINES, resultFor, type PipelineName, type V2Row } from './v2shared.ts';
import { renderV2 } from './report2.ts';

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function messageOf(result: PipelineResult): { message: string; valid: boolean } {
  if (result.error || result.payload === null) return { message: '', valid: false };
  const validated = validateMayaResponse(result.payload);
  return validated.ok ? { message: validated.value.message, valid: true } : { message: '', valid: false };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  const reps = Number(arg('reps') ?? '3');
  const threshold = Number(arg('threshold') ?? '0.9');
  const budgetUsd = Number(arg('budget-usd') ?? '12');
  const useJudge = !process.argv.includes('--no-judge');
  const repeatJudges = Number(arg('judge-repeat') ?? '15');
  const only = arg('cases')?.split(',');
  const cases: RouterCase[] = only ? CASES.filter((c) => only.includes(c.id)) : CASES;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(here, 'results', `${stamp}-e2e2`);
  mkdirSync(outDir, { recursive: true });
  const rowsPath = path.join(outDir, 'rows.jsonl');
  const systemPrompt = evalSystemPrompt();

  const rows: V2Row[] = [];
  let spent = 0;
  let repeated = 0;
  let order = 0;
  outer: for (let rep = 1; rep <= reps; rep += 1) {
    for (const testCase of cases) {
      if (spent >= budgetUsd) {
        console.log(`予算 $${budgetUsd} に達したため、rep ${rep} の ${testCase.id} 以降を止めました。`);
        break outer;
      }
      order += 1;
      const turn = await runTurnV2({ apiKey }, testCase, threshold, order % 2 === 0);
      const row: V2Row = {
        case_id: testCase.id,
        rep,
        turn,
        messages: {} as Record<PipelineName, string>,
        valid: {} as Record<PipelineName, boolean>,
        judge: {},
        judgeRepeat: {},
      };
      for (const name of PIPELINES) {
        const { message, valid } = messageOf(resultFor(turn, name));
        row.messages[name] = message;
        row.valid[name] = valid;
      }
      spent += actualSpend(turn);

      if (useJudge && rep === 1) {
        const byMessage = new Map<string, AbsoluteVerdict>();
        for (const name of PIPELINES) {
          const message = row.messages[name];
          if (!message) continue;
          const cached = byMessage.get(message);
          if (cached) {
            row.judge[name] = cached;
            continue;
          }
          try {
            const verdict = await judgeAbsolute(apiKey, GEMINI_MODEL, systemPrompt, testCase, message, resultFor(turn, name).fetched);
            spent += verdict.promptTokens * GEMINI_USD_PER_INPUT_TOKEN + verdict.outputTokens * GEMINI_USD_PER_OUTPUT_TOKEN;
            byMessage.set(message, verdict);
            row.judge[name] = verdict;
            if (repeated < repeatJudges) {
              const again = await judgeAbsolute(apiKey, GEMINI_MODEL, systemPrompt, testCase, message, resultFor(turn, name).fetched);
              spent += again.promptTokens * GEMINI_USD_PER_INPUT_TOKEN + again.outputTokens * GEMINI_USD_PER_OUTPUT_TOKEN;
              row.judgeRepeat[name] = again;
              repeated += 1;
            }
          } catch (error) {
            console.log(`judge ${testCase.id} ${name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      rows.push(row);
      appendFileSync(rowsPath, JSON.stringify(row) + '\n');
      const direct = turn.direct ? `direct/${turn.direct.reason} ${turn.direct.toolsCalled.join('+') || '-'}` : turn.fallback ? `fallback topp[${turn.sets?.topp.join(',')}] floor[${turn.sets?.floor.join(',')}]` : `jev-error ${turn.jevError}`;
      console.log(
        `r${rep} ${testCase.id} current ${turn.current.latencyMs}ms ${turn.current.toolsCalled.join('+') || '-'} | ${direct} | $${spent.toFixed(3)}`,
      );
    }
  }

  writeFileSync(path.join(outDir, 'report.md'), renderV2(rows, threshold, outDir));
  console.log(`\n${path.relative(process.cwd(), outDir)}/report.md`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
