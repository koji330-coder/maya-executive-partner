/**
 * Routers the eval can run. Each returns a distribution over OPTIONS; nothing
 * here calls a tool, Gemini, D1 or any MAYA endpoint.
 */
import type { RouterQuestion, RouterState } from './prompts.ts';

export interface RouterDecision {
  selected: string;
  /** Probability per option, as the router reports it. */
  probabilities: Record<string, number>;
  /** The router's own confidence (0–1), when it reports one. */
  confidence: number | null;
  inputTokens?: number | null;
  costUsd?: number | null;
  /** The model version that answered, when the router reports it. */
  model?: string | null;
  /** The unparsed response, kept so the fields can be re-checked later. */
  raw?: unknown;
}

export interface Router {
  name: string;
  /** Whether it sends the state outside this machine. */
  remote: boolean;
  decide(state: RouterState, question: RouterQuestion): Promise<RouterDecision>;
}

/**
 * Confidence as TypeSafe describes it: (n · p_max − 1) / (n − 1). Computed here
 * only as a cross-check on the value the API returns, never in its place.
 */
export function confidenceFromProbabilities(probabilities: Record<string, number>): number | null {
  const values = Object.values(probabilities);
  if (values.length < 2) return null;
  const n = values.length;
  return (n * Math.max(...values) - 1) / (n - 1);
}

/**
 * Offline stand-in that always picks the first keyword hit, with certainty.
 * Exists so the harness, the log and the report can be exercised without a key
 * or a network — its numbers say nothing about Jev.
 */
export const dryRunRouter: Router = {
  name: 'dry-run',
  remote: false,
  async decide(state, question) {
    const text = [...state.conversation_context.map((turn) => turn.text), state.user_message].join(' ');
    const pick =
      /会議|商談|録音/.test(text) ? 'voice_recent'
      : /決め|前に|以前/.test(text) ? 'search_memory'
      : /在庫|発注/.test(text) ? 'haksai_inventory'
      : /売|Amazon/.test(text) ? 'haksai_sales'
      : /体重|体脂肪|食|眠/.test(text) ? 'fitlog_day'
      : 'none';
    const probabilities = Object.fromEntries(Object.keys(question.criteria).map((option) => [option, option === pick ? 1 : 0]));
    return { selected: pick, probabilities, confidence: 1 };
  },
};
