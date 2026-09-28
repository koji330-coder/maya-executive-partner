/**
 * Jev routing: ask TypeSafe's Jev which tool the turn needs before Gemini runs,
 * and take a shortcut when it is sure.
 *
 * Measured on made-up cases before it was built (server/scripts/jev-router,
 * reports/2026-09-28-e2e2.md): with the shortcut and, when Jev is unsure, only
 * its likeliest tools shown to Gemini, needless tool reads fell from 36% to
 * 20% of turns, Gemini input tokens by about 35%, and cost by about 27%, with
 * every required tool still read. Jev was right on all 119 answers it gave at
 * 90% or more.
 *
 * Off by default. When on, the president's message and the last few turns go
 * to TypeSafe on every consultation; that is the president's decision to make
 * in the settings screen, not the code's. Any failure (no key, over a second,
 * a 5xx, an answer we cannot read) falls back to the regex routing as it was,
 * so the consultation carries on.
 *
 * The questions and their wording are the ones measured. Change them and the
 * numbers above no longer describe what runs.
 */
import type { ChatExchange, ToolDeclaration } from '@/services/llm/geminiClient';
import type { JevRouteDecision, RouteKind } from '@/features/chat/routeInfo';

import { matchRule } from './jevRules';

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
/** Pinned so a new release behind jev-latest cannot move the thresholds under us. */
export const JEV_MODEL = 'jev-1.13.0';
export const JEV_TIMEOUT_MS = 1000;
/** Jev's confidence at or above which its answer is acted on. */
export const JEV_THRESHOLD = 0.9;
/** When Jev is unsure: offer its likeliest tools until they hold this much of the tool probability. */
export const TOPP_MASS = 0.9;
/** $ per input token, jev-1.13 (docs.typesafe.ai/models, 2026-09-28). Output is free. */
export const JEV_USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

/** How much of the conversation goes to Jev: the recent turns, each clipped. */
const CONTEXT_TURNS = 6;
const CONTEXT_CHARS = 600;

const NONE = 'none';

export const PERIOD_CRITERIA: Record<string, string> = {
  today: '今日',
  yesterday: '昨日',
  this_month: '今月',
  last_month: '先月',
  not_stated: '期間・日付の指定が無い',
  other: 'それ以外の期間や日付（先週、9月3日、3か月前など）',
};

export type JevErrorKind = 'no_key' | 'timeout' | 'http_5xx' | 'http_4xx' | 'invalid' | 'network';

export class JevError extends Error {
  constructor(
    readonly kind: JevErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface JevDecision extends JevRouteDecision {
  /** Probability per option for the required tool, none included. */
  requiredProbabilities: Record<string, number>;
}

export function jevState(message: string, history: ChatExchange[]) {
  return {
    conversation_context: history.slice(-CONTEXT_TURNS).map((turn) => ({
      role: turn.role,
      text: turn.text.length > CONTEXT_CHARS ? `${turn.text.slice(0, CONTEXT_CHARS)}…` : turn.text,
    })),
    known_facts: {},
    user_message: message,
  };
}

function toolCriteria(tools: ToolDeclaration[], noneMeaning: string): Record<string, string> {
  return { ...Object.fromEntries(tools.map((tool) => [tool.name, tool.description])), [NONE]: noneMeaning };
}

export function jevRequest(message: string, history: ChatExchange[], tools: ToolDeclaration[]) {
  return {
    state: jevState(message, history),
    model: JEV_MODEL,
    questions: {
      required_tool: {
        type: 'choice',
        instructions:
          '`user_message` に正確に答えるために、必ず取得しなければならないデータの Tool を1つ選んでください。一般知識や意見で答えられる場合、または必要な事実が会話の中にある場合は none を選んでください。',
        criteria: toolCriteria(tools, 'データを取得しなくても正確に答えられる。'),
      },
      period: {
        type: 'choice',
        instructions: '`user_message` が指している期間・日付はどれですか。直前の会話から引き継がれている場合はそれも含めます。',
        criteria: PERIOD_CRITERIA,
      },
      // The two below are recorded, not acted on: neither held up in the eval.
      context_sufficient: {
        type: 'noul',
        instructions:
          '`conversation_context` と `known_facts` に、`user_message` に正確に答えるために必要な事実（数字や内容）が、すでにそろっていますか。',
        criteria: {
          true: '答えの根拠になる事実が会話の中にある。新しくデータを取らなくても答えられる。',
          false: '必要な事実が会話の中に無い。会話が無い場合もこちら。',
        },
      },
      useful_tool: {
        type: 'choice',
        instructions:
          '答えるのに必須ではないが、取得するとユーザー本人の状況に合わせた、明らかに良い回答になる Tool を1つ選んでください。当てはまらなければ none を選んでください。',
        criteria: toolCriteria(tools, '本人のデータを足しても、回答は良くならない。'),
      },
    },
  };
}

type Answer = Record<string, unknown>;

/** Reads Jev's answers; throws JevError('invalid') when any part is missing or malformed. */
export function readJevResponse(body: unknown, latencyMs: number): JevDecision {
  const answers = (body as { answers?: Record<string, Answer> } | null)?.answers;
  const usage = (body as { usage?: { input_tokens?: unknown } } | null)?.usage;
  const choice = (id: string) => {
    const answer = answers?.[id];
    if (
      !answer ||
      answer.type !== 'choice' ||
      typeof answer.choice !== 'string' ||
      typeof answer.confidence !== 'number' ||
      typeof answer.probabilities !== 'object' ||
      answer.probabilities === null
    ) {
      throw new JevError('invalid', `Jev の答え ${id} が読めません。`);
    }
    return answer as { choice: string; confidence: number; probabilities: Record<string, number> };
  };
  const required = choice('required_tool');
  const period = choice('period');
  const useful = choice('useful_tool');
  const context = answers?.context_sufficient;
  if (!context || context.type !== 'noul' || typeof context.noul !== 'number') {
    throw new JevError('invalid', 'Jev の答え context_sufficient が読めません。');
  }
  return {
    required: required.choice,
    confidence: required.confidence,
    requiredProbabilities: required.probabilities,
    period: period.choice,
    useful: useful.choice,
    usefulConfidence: useful.confidence,
    contextSufficient: context.noul,
    latencyMs,
    inputTokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0,
  };
}

/** One call to Jev, abandoned after JEV_TIMEOUT_MS. Never retried: the turn cannot wait. */
export async function askJev(
  apiKey: string | undefined,
  message: string,
  history: ChatExchange[],
  tools: ToolDeclaration[],
  fetchImpl: typeof fetch = fetch,
  timeoutMs = JEV_TIMEOUT_MS,
): Promise<JevDecision> {
  if (!apiKey) throw new JevError('no_key', 'TYPESAFE_API_KEY がありません。');
  const started = Date.now();
  let response: Response;
  try {
    response = await fetchImpl(JEV_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(jevRequest(message, history, tools)),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new JevError('timeout', 'Jev が時間内に答えませんでした。');
    throw new JevError('network', 'Jev に届きませんでした。');
  }
  if (!response.ok) {
    throw new JevError(response.status >= 500 ? 'http_5xx' : 'http_4xx', `Jev ${response.status}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new JevError('invalid', 'Jev の応答が JSON ではありません。');
  }
  return readJevResponse(body, Date.now() - started);
}

// --- deciding the route ---------------------------------------------------------

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function previousMonth(day: string): string {
  const [year, month] = day.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

/**
 * Arguments code can fill from Jev's period, or null when the tool needs
 * something only the model can write (a product name, search words, an id).
 */
export function argumentsFor(tool: string, period: string, today: string): Record<string, unknown> | null {
  switch (tool) {
    case 'fitlog_day':
      if (period === 'today' || period === 'not_stated') return {};
      if (period === 'yesterday') return { date: shiftDay(today, -1) };
      return null;
    case 'haksai_sales':
      if (period === 'this_month' || period === 'not_stated') return {};
      if (period === 'last_month') return { month: previousMonth(today) };
      return null;
    case 'fitlog_progress':
    case 'fitlog_weekly':
    case 'voice_recent':
    case 'voice_actions':
      return {};
    default:
      return null;
  }
}

/** Tools (never none) by descending probability until they hold `mass` of the tool probability. */
export function toppSet(probabilities: Record<string, number>, available: string[], mass = TOPP_MASS): string[] {
  const tools = Object.entries(probabilities)
    .filter(([name]) => name !== NONE && available.includes(name))
    .sort((a, b) => b[1] - a[1]);
  const total = tools.reduce((sum, [, p]) => sum + p, 0);
  if (total === 0) return tools.slice(0, 1).map(([name]) => name);
  const picked: string[] = [];
  let held = 0;
  for (const [name, p] of tools) {
    picked.push(name);
    held += p / total;
    if (held >= mass) break;
  }
  return picked;
}

export interface RoutePlan {
  route: Extract<RouteKind, 'direct_none' | 'direct_rule' | 'direct_prefetch' | 'fallback_topp'>;
  /** Tools Gemini is offered. Empty on the direct routes. */
  offered: string[];
  requireToolFirst: boolean;
  /** Tools the server reads before Gemini runs. */
  prefetch: { tool: string; args: Record<string, unknown> }[];
  rule?: { id: string; title: string };
}

/**
 * Where Jev's answer sends the turn. `legacyForce` is whether the regex routing
 * would force a first tool call; the unsure route keeps it, as measured.
 */
export function planRoute(input: {
  decision: JevDecision;
  message: string;
  today: string;
  available: string[];
  legacyForce: boolean;
}): RoutePlan {
  const { decision, message, today, available, legacyForce } = input;
  const sure = decision.confidence >= JEV_THRESHOLD;
  if (sure && decision.required === NONE) {
    const rule = matchRule({ message, period: decision.period, today, available });
    if (rule) {
      return {
        route: 'direct_rule',
        offered: [],
        requireToolFirst: false,
        prefetch: [{ tool: rule.rule.tool, args: rule.args }],
        rule: { id: rule.rule.id, title: rule.rule.title },
      };
    }
    return { route: 'direct_none', offered: [], requireToolFirst: false, prefetch: [] };
  }
  if (sure && available.includes(decision.required)) {
    const args = argumentsFor(decision.required, decision.period, today);
    if (args) {
      return { route: 'direct_prefetch', offered: [], requireToolFirst: false, prefetch: [{ tool: decision.required, args }] };
    }
  }
  return {
    route: 'fallback_topp',
    offered: toppSet(decision.requiredProbabilities, available),
    requireToolFirst: legacyForce,
    prefetch: [],
  };
}
