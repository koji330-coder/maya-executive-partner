/**
 * End-to-end eval: the same made-up cases through the current pipeline and the
 * Jev pipeline, measuring speed, Gemini tokens, cost and answer quality.
 *
 *   NODE_USE_ENV_PROXY=1 node --no-warnings --import ./server/scripts/jev-router/register.mjs \
 *     server/scripts/jev-router/e2e.ts [--cases A01,B01] [--limit N] [--threshold 0.9] [--budget-usd 1] [--no-judge]
 *
 * Keys come from the cloud environment's API credentials (attached on the way
 * out), or GEMINI_API_KEY / TYPESAFE_API_KEY when run elsewhere. Nothing here
 * calls the MAYA server, D1, or a real tool.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateMayaResponse } from '@/features/chat/mayaResponse';

import { CASES, type RouterCase } from './cases.ts';
import { judge, type JudgeVerdict } from './judge.ts';
import { percentile } from './metrics.ts';
import {
  GEMINI_MODEL,
  GEMINI_USD_PER_INPUT_TOKEN,
  GEMINI_USD_PER_OUTPUT_TOKEN,
  runCurrent,
  runJev,
  type PipelineResult,
} from './pipelines.ts';
import { NONE } from './tools.ts';

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

export interface E2ERow {
  case_id: string;
  category: string;
  user_message: string;
  context: { role: string; text: string }[];
  expected_tool: string;
  acceptable_tools: string[];
  ambiguous: boolean;
  current: PipelineResult & { valid: boolean; tool_ok: boolean; message: string };
  jev: PipelineResult & { valid: boolean; tool_ok: boolean; message: string };
  judge: JudgeVerdict | null;
  judge_error: string | null;
}

function toolOk(testCase: RouterCase, result: PipelineResult): boolean {
  const fetched = new Set(result.fetched.map((item) => item.tool));
  const allowed = [testCase.expected, ...(testCase.acceptable ?? [])];
  if (fetched.size === 0) return allowed.includes(NONE);
  return allowed.some((tool) => tool !== NONE && fetched.has(tool));
}

function graded(testCase: RouterCase, result: PipelineResult) {
  const validated = result.payload === null ? null : validateMayaResponse(result.payload);
  return {
    ...result,
    valid: Boolean(validated?.ok) && result.error === null,
    tool_ok: result.error === null && toolOk(testCase, result),
    message: validated?.ok ? validated.value.message : '',
  };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  const threshold = Number(arg('threshold') ?? '0.9');
  const budgetUsd = Number(arg('budget-usd') ?? '1');
  const useJudge = !process.argv.includes('--no-judge');
  const only = arg('cases')?.split(',');
  let cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;
  const limit = arg('limit');
  if (limit) cases = cases.slice(0, Number(limit));

  const rows: E2ERow[] = [];
  let spent = 0;
  for (const [index, testCase] of cases.entries()) {
    if (spent >= budgetUsd) {
      console.log(`予算 $${budgetUsd} に達したため ${testCase.id} 以降を止めました。`);
      break;
    }
    // Alternate which pipeline goes first, so Gemini's own prompt caching does
    // not always favour the same side.
    const jevFirst = index % 2 === 1;
    let current: PipelineResult;
    let jev: PipelineResult;
    if (jevFirst) {
      jev = await runJev({ apiKey }, testCase, threshold);
      current = await runCurrent({ apiKey }, testCase);
    } else {
      current = await runCurrent({ apiKey }, testCase);
      jev = await runJev({ apiKey }, testCase, threshold);
    }
    const row: E2ERow = {
      case_id: testCase.id,
      category: testCase.category,
      user_message: testCase.message,
      context: testCase.context ?? [],
      expected_tool: testCase.expected,
      acceptable_tools: testCase.acceptable ?? [],
      ambiguous: testCase.ambiguous ?? false,
      current: graded(testCase, current),
      jev: graded(testCase, jev),
      judge: null,
      judge_error: null,
    };
    spent += current.costUsd + jev.costUsd;
    if (useJudge && row.current.valid && row.jev.valid) {
      try {
        row.judge = await judge(
          apiKey,
          GEMINI_MODEL,
          testCase,
          { message: row.current.message, fetched: current.fetched },
          { message: row.jev.message, fetched: jev.fetched },
        );
        spent +=
          row.judge.promptTokens * GEMINI_USD_PER_INPUT_TOKEN + row.judge.outputTokens * GEMINI_USD_PER_OUTPUT_TOKEN;
      } catch (error) {
        row.judge_error = error instanceof Error ? error.message : String(error);
      }
    }
    rows.push(row);
    console.log(
      `${testCase.id} current ${row.current.latencyMs}ms ${row.current.toolsCalled.join('+') || '-'}${row.current.error ? ' ERR' : ''}` +
        ` | jev ${row.jev.path} ${row.jev.latencyMs}ms ${row.jev.toolsCalled.join('+') || '-'}${row.jev.error ? ' ERR' : ''}` +
        ` | judge ${row.judge?.winner ?? row.judge_error ?? '-'} | $${spent.toFixed(4)}`,
    );
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(here, 'results', `${stamp}-e2e`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'rows.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  writeFileSync(path.join(outDir, 'report.md'), renderE2EReport(rows, threshold));
  console.log(`\n${path.relative(process.cwd(), outDir)}/report.md`);
}

// --- report ------------------------------------------------------------------

function avg(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

function fmt(value: number | null, digits = 0): string {
  return value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function share(count: number, total: number): string {
  return total === 0 ? '—' : `${((count / total) * 100).toFixed(1)}% (${count}/${total})`;
}

export function renderE2EReport(rows: E2ERow[], threshold: number): string {
  const lines: string[] = [
    '# Jev 組み込み E2E 評価（Gemini 接続）',
    '',
    `- 実行: ${new Date().toISOString()}`,
    `- Gemini: ${GEMINI_MODEL}（$0.75 / $3.75 per 1M、思考は出力扱い）/ Jev: jev-1.13.0 Minimal / しきい値 ${threshold}`,
    `- ケース数: ${rows.length}`,
    '- 道具の結果はすべて架空（fixtures.ts）。採点は Gemini によるブラインド比較で、参考意見。',
    '',
  ];

  const side = (name: 'current' | 'jev') => {
    const results = rows.map((row) => row[name]);
    const ok = results.filter((result) => result.error === null);
    const latency = ok.map((result) => result.latencyMs);
    return {
      errors: results.length - ok.length,
      latencyAvg: avg(latency),
      p50: percentile(latency, 50),
      p95: percentile(latency, 95),
      rounds: avg(ok.map((result) => result.geminiRounds)),
      prompt: avg(ok.map((result) => result.promptTokens)),
      output: avg(ok.map((result) => result.outputTokens)),
      thoughts: avg(ok.map((result) => result.thoughtsTokens)),
      cost: results.reduce((sum, result) => sum + result.costUsd, 0),
      valid: results.filter((result) => result.valid).length,
      toolOk: results.filter((result) => result.tool_ok).length,
      total: results.length,
    };
  };
  const current = side('current');
  const jev = side('jev');
  const delta = (a: number | null, b: number | null) =>
    a === null || b === null || a === 0 ? '—' : `${(((b - a) / a) * 100).toFixed(0)}%`;

  lines.push('## 全体', '', '| | current | jev | 差 |', '|---|---|---|---|');
  lines.push(`| 応答時間 平均 | ${fmt(current.latencyAvg)} ms | ${fmt(jev.latencyAvg)} ms | ${delta(current.latencyAvg, jev.latencyAvg)} |`);
  lines.push(`| 応答時間 p50 | ${fmt(current.p50)} ms | ${fmt(jev.p50)} ms | ${delta(current.p50, jev.p50)} |`);
  lines.push(`| 応答時間 p95 | ${fmt(current.p95)} ms | ${fmt(jev.p95)} ms | ${delta(current.p95, jev.p95)} |`);
  lines.push(`| Gemini 往復 平均 | ${fmt(current.rounds, 2)} | ${fmt(jev.rounds, 2)} | ${delta(current.rounds, jev.rounds)} |`);
  lines.push(`| 入力トークン 平均 | ${fmt(current.prompt)} | ${fmt(jev.prompt)} | ${delta(current.prompt, jev.prompt)} |`);
  lines.push(`| 出力トークン 平均 | ${fmt(current.output)} | ${fmt(jev.output)} | ${delta(current.output, jev.output)} |`);
  lines.push(`| 思考トークン 平均 | ${fmt(current.thoughts)} | ${fmt(jev.thoughts)} | ${delta(current.thoughts, jev.thoughts)} |`);
  lines.push(`| 費用 合計（Jev 込み） | $${current.cost.toFixed(4)} | $${jev.cost.toFixed(4)} | ${delta(current.cost, jev.cost)} |`);
  lines.push(`| 1ターンあたり費用 | $${(current.cost / Math.max(1, current.total)).toFixed(5)} | $${(jev.cost / Math.max(1, jev.total)).toFixed(5)} | |`);
  lines.push(`| 返事の形が正しい | ${share(current.valid, current.total)} | ${share(jev.valid, jev.total)} | |`);
  lines.push(`| 正しいデータを取った（none は取らない） | ${share(current.toolOk, current.total)} | ${share(jev.toolOk, jev.total)} | |`);
  lines.push(`| エラー | ${current.errors} | ${jev.errors} | |`);
  lines.push('');

  const judged = rows.filter((row) => row.judge);
  const wins = (who: string) => judged.filter((row) => row.judge!.winner === who).length;
  lines.push('## 品質（ブラインド比較）', '');
  lines.push(`- 採点できた件数: ${judged.length}`);
  lines.push(`- jev の勝ち ${wins('jev')} / 引き分け ${wins('tie')} / current の勝ち ${wins('current')}`);
  lines.push(
    `- 根拠のない数字を含まない: current ${share(judged.filter((r) => r.judge!.currentGrounded).length, judged.length)} / jev ${share(judged.filter((r) => r.judge!.jevGrounded).length, judged.length)}`,
  );
  lines.push(
    `- 質問に答えている: current ${share(judged.filter((r) => r.judge!.currentAnswers).length, judged.length)} / jev ${share(judged.filter((r) => r.judge!.jevAnswers).length, judged.length)}`,
  );
  lines.push('');

  const paths = ['jev_none', 'jev_prefetch', 'jev_fallback'] as const;
  lines.push('## Jev の経路別', '', '| 経路 | 件数 | 応答時間 平均 | 往復 平均 | 入力トークン 平均 | 正しいデータ | current 比 勝/分/負 |', '|---|---|---|---|---|---|---|');
  for (const p of paths) {
    const inPath = rows.filter((row) => row.jev.path === p);
    const pj = inPath.filter((row) => row.judge);
    lines.push(
      `| ${p} | ${inPath.length} | ${fmt(avg(inPath.map((r) => r.jev.latencyMs)))} ms（current ${fmt(avg(inPath.map((r) => r.current.latencyMs)))}） | ${fmt(avg(inPath.map((r) => r.jev.geminiRounds)), 2)} | ${fmt(avg(inPath.map((r) => r.jev.promptTokens)))}（current ${fmt(avg(inPath.map((r) => r.current.promptTokens)))}） | ${share(inPath.filter((r) => r.jev.tool_ok).length, inPath.length)} | ${pj.filter((r) => r.judge!.winner === 'jev').length}/${pj.filter((r) => r.judge!.winner === 'tie').length}/${pj.filter((r) => r.judge!.winner === 'current').length} |`,
    );
  }
  lines.push('');

  lines.push('## ケース別', '', '| case | 発話 | expected | current 道具 | current ms | jev 経路 | jev 道具 | jev ms | 判定 | 理由 |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const row of rows) {
    const reason = (row.judge?.reason ?? row.judge_error ?? row.current.error ?? row.jev.error ?? '').replace(/\|/g, '／').replace(/\n/g, ' ');
    lines.push(
      `| ${row.case_id} | ${row.user_message}${row.context.length ? '（文脈あり）' : ''} | ${row.expected_tool} | ${row.current.toolsCalled.join('+') || '-'}${row.current.tool_ok ? '' : ' ✗'} | ${row.current.latencyMs} | ${row.jev.path} | ${row.jev.toolsCalled.join('+') || '-'}${row.jev.tool_ok ? '' : ' ✗'} | ${row.jev.latencyMs} | ${row.judge?.winner ?? '-'} | ${reason.slice(0, 120)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
