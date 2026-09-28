/**
 * Jev tool-router eval. Standalone: it does not import chat.ts's request path,
 * touch D1, call Gemini or run any tool. It asks a router "which tool next?"
 * for each made-up case and logs the answer.
 *
 *   node --import ./server/scripts/jev-router/register.mjs \
 *     server/scripts/jev-router/eval.ts [--router dry-run|typesafe] [--variant minimal|explicit|both]
 *
 * --router typesafe sends the cases to TypeSafe and needs TYPESAFE_API_KEY in
 * the environment. Output goes to server/scripts/jev-router/results/ (ignored
 * by git).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { currentMayaSelection } from './baseline.ts';
import { CASES, type RouterCase } from './cases.ts';
import { buildQuestion, buildState, VARIANTS, type Variant } from './prompts.ts';
import { renderReport } from './report.ts';
import { confidenceFromProbabilities, dryRunRouter, type Router } from './routers.ts';
import { summarize, type EvalRow } from './metrics.ts';
import { typesafeRouter } from './typesafe.ts';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

async function runCase(router: Router, variant: Variant, testCase: RouterCase): Promise<EvalRow> {
  const state = buildState(variant, testCase);
  const question = buildQuestion(variant);
  const acceptable = [testCase.expected, ...(testCase.acceptable ?? [])];
  const base = {
    case_id: testCase.id,
    category: testCase.category,
    variant,
    router: router.name,
    user_message: testCase.message,
    context: testCase.context ?? [],
    expected_tool: testCase.expected,
    acceptable_tools: testCase.acceptable ?? [],
    ambiguous: testCase.ambiguous ?? false,
  };
  const started = performance.now();
  try {
    const decision = await router.decide(state, question);
    const latency = Math.round(performance.now() - started);
    return {
      ...base,
      jev_selected_tool: decision.selected,
      probabilities: decision.probabilities,
      confidence: decision.confidence,
      confidence_derived: confidenceFromProbabilities(decision.probabilities),
      correct: decision.selected === testCase.expected,
      correct_lenient: acceptable.includes(decision.selected),
      latency_ms: latency,
      input_tokens: decision.inputTokens ?? null,
      estimated_cost_usd: decision.costUsd ?? null,
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      jev_selected_tool: null,
      probabilities: {},
      confidence: null,
      confidence_derived: null,
      correct: false,
      correct_lenient: false,
      latency_ms: Math.round(performance.now() - started),
      input_tokens: null,
      estimated_cost_usd: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const routerName = arg('router', 'dry-run');
  const variantArg = arg('variant', 'both');
  const variants: Variant[] = variantArg === 'both' ? VARIANTS : [variantArg as Variant];
  if (!variants.every((variant) => VARIANTS.includes(variant))) {
    throw new Error(`--variant は minimal / explicit / both のどれか: ${variantArg}`);
  }
  const router = routerName === 'typesafe' ? typesafeRouter() : routerName === 'dry-run' ? dryRunRouter : null;
  if (!router) throw new Error(`--router は dry-run / typesafe のどちらか: ${routerName}`);

  const rows: EvalRow[] = [];
  for (const variant of variants) {
    for (const testCase of CASES) {
      // One at a time: latency is part of what is measured, and a quota error
      // should stop a run early rather than fan out.
      const row = await runCase(router, variant, testCase);
      rows.push(row);
      const mark = row.error ? 'ERR' : row.correct ? 'ok ' : 'NG ';
      console.log(`${mark} ${variant.padEnd(8)} ${row.case_id} ${row.expected_tool} → ${row.jev_selected_tool ?? row.error}`);
    }
  }

  const summaries = Object.fromEntries(
    variants.map((variant) => [variant, summarize(rows.filter((row) => row.variant === variant))]),
  );
  const baseline = CASES.map((testCase) => ({ testCase, selection: currentMayaSelection(testCase) }));

  const here = path.dirname(fileURLToPath(import.meta.url));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(here, 'results', `${stamp}-${router.name}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'rows.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summaries, null, 2));
  writeFileSync(path.join(outDir, 'report.md'), renderReport(router, summaries, baseline));
  console.log(`\n${path.relative(process.cwd(), outDir)}/report.md`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
