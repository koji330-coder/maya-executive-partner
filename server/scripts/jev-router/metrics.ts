/**
 * Scores a run. Pure functions over the logged rows, so a saved JSONL can be
 * re-scored without calling the router again.
 */
import type { Category } from './cases.ts';
import { NONE } from './tools.ts';

export interface EvalRow {
  case_id: string;
  category: Category;
  variant: string;
  router: string;
  user_message: string;
  context: { role: string; text: string }[];
  expected_tool: string;
  acceptable_tools: string[];
  ambiguous: boolean;
  jev_selected_tool: string | null;
  probabilities: Record<string, number>;
  /** 0–1. The router's own value when it gives one. */
  confidence: number | null;
  /** 0–1, from the probabilities by TypeSafe's documented formula. Cross-check only. */
  confidence_derived: number | null;
  correct: boolean;
  correct_lenient: boolean;
  latency_ms: number;
  input_tokens: number | null;
  estimated_cost_usd: number | null;
  /** The model version that answered (e.g. jev-1.13.0). */
  model_version: string | null;
  error: string | null;
}

export const HIGH_CONFIDENCE = 0.9;

export const CONFIDENCE_BANDS = [
  { label: '0–50', min: 0, max: 0.5 },
  { label: '50–70', min: 0.5, max: 0.7 },
  { label: '70–90', min: 0.7, max: 0.9 },
  { label: '90–100', min: 0.9, max: 1.0001 },
] as const;

export interface Rate {
  correct: number;
  total: number;
  rate: number | null;
}

function rate(correct: number, total: number): Rate {
  return { correct, total, rate: total === 0 ? null : correct / total };
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank: the smallest value with at least p% of the data at or below it.
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

export interface Summary {
  total: number;
  errors: number;
  top1: Rate;
  top1Lenient: Rate;
  top1Unambiguous: Rate;
  perTool: Record<string, Rate>;
  perCategory: Record<string, Rate>;
  confusion: Record<string, Record<string, number>>;
  /** Wrong answers where none was either the expected or the chosen option. */
  noneMisjudged: Rate;
  /** Expected a tool, chose none. */
  toolNeededButNone: Rate;
  /** Expected none, chose a tool. */
  noneNeededButTool: Rate;
  highConfidenceWrong: EvalRow[];
  /** Ambiguous cases where a tool (not none) was chosen with high confidence. */
  highConfidenceOnAmbiguous: EvalRow[];
  bands: { label: string; rate: Rate }[];
  latency: { average: number | null; p50: number | null; p95: number | null };
  inputTokens: number | null;
  costUsd: number | null;
  modelVersions: string[];
}

export function summarize(rows: EvalRow[]): Summary {
  const answered = rows.filter((row) => row.error === null && row.jev_selected_tool !== null);
  const count = (filter: (row: EvalRow) => boolean, list = answered) => list.filter(filter).length;

  const perTool: Record<string, Rate> = {};
  const perCategory: Record<string, Rate> = {};
  const confusion: Record<string, Record<string, number>> = {};
  for (const row of answered) {
    const selected = row.jev_selected_tool as string;
    const tool = (perTool[row.expected_tool] ??= rate(0, 0));
    tool.total += 1;
    tool.correct += row.correct ? 1 : 0;
    const category = (perCategory[row.category] ??= rate(0, 0));
    category.total += 1;
    category.correct += row.correct ? 1 : 0;
    const line = (confusion[row.expected_tool] ??= {});
    line[selected] = (line[selected] ?? 0) + 1;
  }
  for (const entry of [...Object.values(perTool), ...Object.values(perCategory)]) {
    entry.rate = entry.total === 0 ? null : entry.correct / entry.total;
  }

  const expectsTool = answered.filter((row) => row.expected_tool !== NONE);
  const expectsNone = answered.filter((row) => row.expected_tool === NONE);
  const noneInvolved = answered.filter((row) => row.expected_tool === NONE || row.jev_selected_tool === NONE);
  const unambiguous = answered.filter((row) => !row.ambiguous);

  const confidenceOf = (row: EvalRow) => row.confidence ?? row.confidence_derived;
  const bands = CONFIDENCE_BANDS.map((band) => {
    const inBand = answered.filter((row) => {
      const value = confidenceOf(row);
      return value !== null && value >= band.min && value < band.max;
    });
    return { label: band.label, rate: rate(count((row) => row.correct, inBand), inBand.length) };
  });

  const latencies = answered.map((row) => row.latency_ms);
  const tokens = answered.map((row) => row.input_tokens).filter((value): value is number => value !== null);
  const costs = answered.map((row) => row.estimated_cost_usd).filter((value): value is number => value !== null);

  return {
    total: rows.length,
    errors: rows.length - answered.length,
    top1: rate(count((row) => row.correct), answered.length),
    top1Lenient: rate(count((row) => row.correct_lenient), answered.length),
    top1Unambiguous: rate(count((row) => row.correct, unambiguous), unambiguous.length),
    perTool,
    perCategory,
    confusion,
    noneMisjudged: rate(count((row) => !row.correct, noneInvolved), noneInvolved.length),
    toolNeededButNone: rate(count((row) => row.jev_selected_tool === NONE, expectsTool), expectsTool.length),
    noneNeededButTool: rate(count((row) => row.jev_selected_tool !== NONE, expectsNone), expectsNone.length),
    highConfidenceWrong: answered.filter((row) => !row.correct && (confidenceOf(row) ?? 0) >= HIGH_CONFIDENCE),
    highConfidenceOnAmbiguous: answered.filter(
      (row) => row.ambiguous && row.jev_selected_tool !== NONE && (confidenceOf(row) ?? 0) >= HIGH_CONFIDENCE,
    ),
    bands,
    latency: {
      average: latencies.length === 0 ? null : latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
    },
    inputTokens: tokens.length === 0 ? null : tokens.reduce((a, b) => a + b, 0),
    costUsd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0),
    modelVersions: [...new Set(answered.map((row) => row.model_version).filter((v): v is string => v !== null))],
  };
}
