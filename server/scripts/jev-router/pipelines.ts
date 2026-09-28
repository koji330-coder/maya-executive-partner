/**
 * The two ways a turn can reach Gemini, run side by side on the same case.
 *
 * current — chat.ts as it is: the regex narrows the tools and may force a call,
 *   then Gemini decides and calls tools (usually 2 rounds when a tool is used).
 * jev — Jev decides first. When it is sure (confidence ≥ threshold):
 *   - none → Gemini answers in 1 round with no tools offered;
 *   - a tool whose arguments code can fill → the server runs it first and hands
 *     the result to Gemini, which answers in 1 round.
 *   Anything else (unsure, or a tool that needs a product name or keywords)
 *   falls back to current, with Jev's time and cost still counted.
 *
 * Both use the production prompt builder and Gemini client, and the same
 * made-up tool results (fixtures.ts). Nothing touches the MAYA server or D1.
 */
import { buildSystemPrompt, type CompanyContext } from '@/features/chat/systemPrompt';
import {
  generateMayaResponse,
  LlmError,
  type ChatExchange,
  type GenerateResult,
  type ToolCall,
  type ToolDeclaration,
} from '@/services/llm/geminiClient';

import { currentMayaSelection } from './baseline.ts';
import type { RouterCase } from './cases.ts';
import { EVAL_TODAY, runFixtureTool } from './fixtures.ts';
import { buildQuestion, buildState } from './prompts.ts';
import { NONE, TOOL_DECLARATIONS } from './tools.ts';
import { postSystemOne, USD_PER_INPUT_TOKEN } from './typesafe.ts';

export const GEMINI_MODEL = 'gemini-3.8-flash';
/** server/wrangler.jsonc MAX_OUTPUT_TOKENS. */
export const MAX_OUTPUT_TOKENS = 4096;
/**
 * gemini-3.8-flash, per 1M tokens, as recorded in server/wrangler.jsonc
 * (checked 2026-09-21 on ai.google.dev): $0.75 in / $3.75 out through
 * 2026-12-31. Thinking is billed as output.
 */
export const GEMINI_USD_PER_INPUT_TOKEN = 0.75 / 1_000_000;
export const GEMINI_USD_PER_OUTPUT_TOKEN = 3.75 / 1_000_000;

const COMPANY: CompanyContext = {
  name: 'テスト商事（架空）',
  industry: 'Amazon での日用雑貨の販売',
  employeeCount: 1,
  description: '評価用の架空の会社。社長が一人で運営している。',
};

// The eval's "now": fixed, so fixtures and "昨日" agree across runs.
const NOW = new Date(`${EVAL_TODAY}T10:00:00`);

export function evalSystemPrompt(): string {
  return buildSystemPrompt(COMPANY, [], NOW, { journals: [], topics: [] }, true, true, true, true);
}

export interface FetchedData {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

export type Path = 'current' | 'jev_none' | 'jev_prefetch' | 'jev_fallback';

export interface PipelineResult {
  path: Path;
  latencyMs: number;
  jevLatencyMs: number;
  jevChoice: string | null;
  jevConfidence: number | null;
  jevPeriod: string | null;
  jevInputTokens: number;
  geminiRounds: number;
  promptTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  toolsCalled: string[];
  fetched: FetchedData[];
  payload: unknown;
  error: string | null;
  costUsd: number;
}

export interface GeminiAuth {
  apiKey: string;
}

function geminiCostUsd(result: Pick<GenerateResult, 'promptTokens' | 'responseTokens' | 'thoughtsTokens'>): number {
  return (
    result.promptTokens * GEMINI_USD_PER_INPUT_TOKEN +
    (result.responseTokens + result.thoughtsTokens) * GEMINI_USD_PER_OUTPUT_TOKEN
  );
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  // chat.ts retries 503 (busy) the same way; 429 is waited out here because an
  // eval run has no paid fallback to switch to.
  const delays = [2000, 5000, 15000];
  for (const delay of delays) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof LlmError) || (error.status !== 503 && error.status !== 429)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return run();
}

function history(testCase: RouterCase): ChatExchange[] {
  return (testCase.context ?? []).map((turn) => ({ role: turn.role, text: turn.text }));
}

async function callGemini(
  auth: GeminiAuth,
  testCase: RouterCase,
  systemPrompt: string,
  tools: ToolDeclaration[],
  requireToolFirst: boolean,
  fetched: FetchedData[],
) {
  return withRetry(() =>
    generateMayaResponse({
      apiKey: auth.apiKey,
      systemPrompt,
      history: history(testCase),
      message: testCase.message,
      model: GEMINI_MODEL,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      tools,
      runTool: (call: ToolCall) => {
        const result = runFixtureTool(call);
        fetched.push({ tool: call.name, args: call.args ?? {}, result });
        return Promise.resolve(result);
      },
      requireToolFirst,
    }),
  );
}

function emptyResult(path: Path): PipelineResult {
  return {
    path,
    latencyMs: 0,
    jevLatencyMs: 0,
    jevChoice: null,
    jevConfidence: null,
    jevPeriod: null,
    jevInputTokens: 0,
    geminiRounds: 0,
    promptTokens: 0,
    outputTokens: 0,
    thoughtsTokens: 0,
    toolsCalled: [],
    fetched: [],
    payload: null,
    error: null,
    costUsd: 0,
  };
}

function absorb(target: PipelineResult, result: GenerateResult) {
  target.geminiRounds += result.rounds;
  target.promptTokens += result.promptTokens;
  target.outputTokens += result.responseTokens;
  target.thoughtsTokens += result.thoughtsTokens;
  target.toolsCalled.push(...result.toolCalls.map((call) => call.name));
  target.payload = result.payload;
  target.costUsd += geminiCostUsd(result);
}

export async function runCurrent(auth: GeminiAuth, testCase: RouterCase): Promise<PipelineResult> {
  const out = emptyResult('current');
  const started = performance.now();
  try {
    const selection = currentMayaSelection(testCase);
    const tools = TOOL_DECLARATIONS.filter((tool) => selection.offered.includes(tool.name));
    absorb(out, await callGemini(auth, testCase, evalSystemPrompt(), tools, selection.forceTool, out.fetched));
  } catch (error) {
    out.error = error instanceof Error ? error.message : String(error);
  }
  out.latencyMs = Math.round(performance.now() - started);
  return out;
}

// --- Jev -------------------------------------------------------------------

/** Periods Jev can pick; code turns them into tool arguments. */
const PERIOD_CRITERIA: Record<string, string> = {
  today: '今日',
  yesterday: '昨日',
  this_month: '今月',
  last_month: '先月',
  not_stated: '期間・日付の指定が無い',
  other: 'それ以外の期間や日付（先週、9月3日、3か月前など）',
};

interface JevDecision {
  choice: string;
  confidence: number;
  period: string;
  inputTokens: number;
}

async function askJev(testCase: RouterCase): Promise<JevDecision> {
  // The Minimal router: in the router-only eval it made no mistake at ≥90%.
  const question = buildQuestion('minimal');
  const body = await postSystemOne({
    state: buildState('minimal', testCase),
    model: 'jev-1.13.0',
    questions: {
      next_tool: { type: 'choice', instructions: question.instructions, criteria: question.criteria },
      // Dates are extraction over a closed set, as TypeSafe recommends; the
      // arithmetic stays in code.
      period: {
        type: 'choice',
        instructions: '`user_message` が指している期間・日付はどれですか。直前の会話から引き継がれている場合はそれも含めます。',
        criteria: PERIOD_CRITERIA,
      },
    },
  });
  const tool = body.answers.next_tool;
  const period = body.answers.period;
  if (!tool || !period) throw new Error('Jev の応答に答えが足りません。');
  return { choice: tool.choice, confidence: tool.confidence, period: period.choice, inputTokens: body.usage.input_tokens };
}

function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * Arguments code can fill from Jev's answers, or null when the tool needs
 * something only the model can write (a product name, search words).
 */
export function argumentsFor(tool: string, period: string, testCase: RouterCase): Record<string, unknown> | null {
  const thisMonth = EVAL_TODAY.slice(0, 7);
  switch (tool) {
    case 'fitlog_day':
      if (period === 'today' || period === 'not_stated') return {};
      if (period === 'yesterday') return { date: shiftDay(EVAL_TODAY, -1) };
      return null;
    case 'haksai_sales':
      if (period === 'this_month' || period === 'not_stated') return {};
      if (period === 'last_month') return { month: shiftMonth(thisMonth, -1) };
      return null;
    case 'fitlog_progress':
    case 'fitlog_weekly':
    case 'voice_recent':
    case 'voice_actions':
      return {};
    case 'voice_detail':
      return testCase.known?.recording_id ? { recording_id: testCase.known.recording_id } : null;
    default:
      return null;
  }
}

function withPrefetched(systemPrompt: string, data: FetchedData): string {
  return (
    `${systemPrompt}\n\n## この質問のために取得済みのデータ\n` +
    `サーバーが道具 ${data.tool}（引数 ${JSON.stringify(data.args)}）で取得した結果です。これを根拠に答えてください。\n` +
    '```json\n' +
    JSON.stringify(data.result, null, 2) +
    '\n```'
  );
}

export async function runJev(auth: GeminiAuth, testCase: RouterCase, threshold: number): Promise<PipelineResult> {
  const started = performance.now();
  let decision: JevDecision;
  try {
    decision = await askJev(testCase);
  } catch (error) {
    const out = emptyResult('jev_fallback');
    out.error = error instanceof Error ? error.message : String(error);
    out.latencyMs = Math.round(performance.now() - started);
    return out;
  }
  const jevLatencyMs = Math.round(performance.now() - started);
  const jevFields = {
    jevLatencyMs,
    jevChoice: decision.choice,
    jevConfidence: decision.confidence,
    jevPeriod: decision.period,
    jevInputTokens: decision.inputTokens,
  };

  const sure = decision.confidence >= threshold;
  const args = sure && decision.choice !== NONE ? argumentsFor(decision.choice, decision.period, testCase) : null;

  if (sure && (decision.choice === NONE || args !== null)) {
    const out: PipelineResult = { ...emptyResult(decision.choice === NONE ? 'jev_none' : 'jev_prefetch'), ...jevFields };
    try {
      let systemPrompt = evalSystemPrompt();
      if (args !== null) {
        const data = { tool: decision.choice, args, result: runFixtureTool({ name: decision.choice, args }) };
        out.fetched.push(data);
        out.toolsCalled.push(data.tool);
        systemPrompt = withPrefetched(systemPrompt, data);
      }
      // No tools offered: the point is one round. If the data is not enough,
      // MAYA has to say so, and the quality check catches it.
      absorb(out, await callGemini(auth, testCase, systemPrompt, [], false, out.fetched));
    } catch (error) {
      out.error = error instanceof Error ? error.message : String(error);
    }
    out.costUsd += decision.inputTokens * USD_PER_INPUT_TOKEN;
    out.latencyMs = Math.round(performance.now() - started);
    return out;
  }

  const fallback = await runCurrent(auth, testCase);
  return {
    ...fallback,
    ...jevFields,
    path: 'jev_fallback',
    costUsd: fallback.costUsd + decision.inputTokens * USD_PER_INPUT_TOKEN,
    latencyMs: Math.round(performance.now() - started),
  };
}
