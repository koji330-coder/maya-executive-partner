import { validateMayaResponse } from '@/features/chat/mayaResponse';
import { buildSystemPrompt, type CompanyContext } from '@/features/chat/systemPrompt';
import type { ApiTier } from '@/services/llm/apiKey';
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  eligibleForPaidRetry,
  generateMayaResponse,
  LlmError,
  type ChatExchange,
  type GenerateOptions,
  type GenerateResult,
  type RequestAttachment,
} from '@/services/llm/geminiClient';
import {
  ASSUMED_TOKENS_PER_TURN,
  estimateRequestAttachmentTokens,
  freeTierAllowed,
} from '@/services/llm/policy';

import { presidentDate, presidentNow } from './clock';
import type { Env } from './env';
import {
  fitlogConfigured,
  FITLOG_DAY_TOOL,
  FITLOG_EXERCISE_TOOL,
  FITLOG_PROGRESS_TOOL,
  FITLOG_TOOLS,
  FITLOG_WEEKLY_TOOL,
  refersToFitness,
  runFitlogDayTool,
  runFitlogExerciseTool,
  runFitlogProgressTool,
  runFitlogWeeklyTool,
} from './fitlog';
import {
  haksaiConfigured,
  HAKSAI_INVENTORY_TOOL,
  HAKSAI_MARKET_TOOL,
  HAKSAI_SALES_TOOL,
  runHaksaiInventoryTool,
  runHaksaiMarketTool,
  refersToAmazon,
  runHaksaiSalesTool,
} from './haksai';
import { decisionsForPrompt } from './memory/decisions';
import { activityForPrompt } from './memory/inbox';
import { refersToPast, runMemoryTool, SEARCH_MEMORY_TOOL } from './memory/search';
import { resolveKeys } from './memory/apiKeys';
import { loadCostPolicy } from './memory/settings';
import { paidLimitReached, recordUsage } from './usage';

/** What the app sends. Mirrors `AskOptions` in `src/features/chat/responder.ts`. */
export interface ChatRequest {
  message: string;
  history: ChatExchange[];
  company?: CompanyContext;
  companyIsReal?: boolean;
  attachments?: RequestAttachment[];
}

export interface ChatReply {
  response: unknown;
  warnings: string[];
  source: ApiTier;
  /** The tool calls made for this answer (memory, Amazon stock). For checking how often she looks. */
  searches: number;
}

/** The cap from the environment, or the default when it is missing, not a number, or not sensible. */
export function readMaxOutputTokens(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 256 && parsed <= 65_536 ? parsed : DEFAULT_MAX_OUTPUT_TOKENS;
}

const messageLength = (payload: unknown): number | null => {
  const message = (payload as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message.length : null;
};

/** Waits before each retry of a busy model. Measured: the second try got through. */
export const BUSY_RETRY_DELAYS_MS = [8_000, 20_000];

/**
 * Retries a model that said it was busy.
 *
 * Only a 503. Everything else fails the same way the second time, and a retry
 * would only make the president wait longer for the same error.
 */
export async function withBusyRetry<T>(
  run: () => Promise<T>,
  delays: number[] = BUSY_RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (const delay of delays) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof LlmError) || error.status !== 503) {
        throw error;
      }
      await sleep(delay);
    }
  }
  return run();
}

/** Throws `LlmError('bad_response')` when the body is not a chat request. */
export function parseChatRequest(body: unknown): ChatRequest {
  if (typeof body !== 'object' || body === null) {
    throw new LlmError('bad_response', '相談の形式が正しくありません。');
  }
  const b = body as Record<string, unknown>;
  if (typeof b.message !== 'string' || !b.message.trim()) {
    throw new LlmError('bad_response', '相談の本文がありません。');
  }
  if (!Array.isArray(b.history)) {
    throw new LlmError('bad_response', '会話の履歴がありません。');
  }
  return {
    message: b.message,
    history: b.history as ChatExchange[],
    company: b.company as CompanyContext | undefined,
    companyIsReal: b.companyIsReal === true,
    attachments: Array.isArray(b.attachments) ? (b.attachments as RequestAttachment[]) : undefined,
  };
}

/**
 * One consultation turn on the server.
 *
 * The same routing the app does today (`src/features/chat/responder.ts`), with
 * the keys moved from the phone's keychain into Worker secrets: free first,
 * paid only when allowed, real company data never on the free key, and the paid
 * key stopped at the daily ceiling before the request goes out.
 */
export async function answer(env: Env, request: ChatRequest): Promise<ChatReply> {
  // Keys entered in the app win over the Worker secrets (memory/apiKeys.ts).
  const { free, paid } = await resolveKeys(env.MAYA_DB, env);
  const freeAllowed = freeTierAllowed(request.companyIsReal ?? false);

  if (!free && !paid) {
    throw new LlmError('no_key', 'サーバーに Gemini のキーが設定されていません。');
  }
  if (!freeAllowed && !paid) {
    throw new LlmError(
      'no_key',
      '実在する会社の情報が登録されているため、無料キーは使いません。サーバーに有料キーを設定してください。',
    );
  }

  // Decisions are read here, not sent by the app. From v0.2 they live in D1, so
  // every route into the server remembers the same decisions.
  const now = presidentNow();
  const [decisions, activity, cost] = await Promise.all([
    decisionsForPrompt(env.MAYA_DB),
    activityForPrompt(env.MAYA_DB, presidentDate()),
    // The wrangler values are the starting point; the settings screen can move
    // them without a redeploy (memory/settings.ts).
    loadCostPolicy(env.MAYA_DB, env),
  ]);

  const amazonReady = haksaiConfigured(env);
  const fitlogReady = fitlogConfigured(env);
  const askingAboutAmazon = amazonReady && refersToAmazon(request.message);
  // 「じゃあ先週は？」のような短い続きだけは、直近の会話も判定に含める。
  const recentFitnessContext = request.history.slice(-4).some((exchange) => refersToFitness(exchange.text));
  const fitnessFollowUp = /^(じゃあ|では|それ|その|先週|今週|昨日|最近|前回|どう|もっと|詳しく)/.test(request.message.trim());
  const askingAboutFitness = fitlogReady && (refersToFitness(request.message) || (fitnessFollowUp && recentFitnessContext));
  const askingAboutRememberedConversation = /覚えて|話した|言ってた|決めた|決めてた|経緯/.test(request.message);

  // 利用可能なツール群を準備（未接続の道具は見せない）
  const allAvailableTools = [SEARCH_MEMORY_TOOL];
  if (amazonReady) {
    allAvailableTools.push(HAKSAI_INVENTORY_TOOL, HAKSAI_SALES_TOOL, HAKSAI_MARKET_TOOL);
  }
  if (fitlogReady) {
    allAvailableTools.push(...FITLOG_TOOLS);
  }

  let selectedTools = allAvailableTools;
  if (askingAboutFitness && !askingAboutRememberedConversation && !askingAboutAmazon) {
    selectedTools = [...FITLOG_TOOLS];
  } else if (askingAboutAmazon && !refersToPast(request.message) && !askingAboutFitness) {
    selectedTools = [HAKSAI_INVENTORY_TOOL, HAKSAI_SALES_TOOL, HAKSAI_MARKET_TOOL];
  }

  const base: Omit<GenerateOptions, 'apiKey'> = {
    systemPrompt: buildSystemPrompt(request.company, decisions, now, activity, true, amazonReady, fitlogReady),
    history: request.history,
    message: request.message,
    attachments: request.attachments,
    model: env.MODEL,
    maxOutputTokens: readMaxOutputTokens(env.MAX_OUTPUT_TOKENS),
    tools: selectedTools,
    runTool: (call) => {
      if (call.name === HAKSAI_INVENTORY_TOOL.name) return runHaksaiInventoryTool(env, call);
      if (call.name === HAKSAI_SALES_TOOL.name) return runHaksaiSalesTool(env, call, presidentDate());
      if (call.name === HAKSAI_MARKET_TOOL.name) return runHaksaiMarketTool(env, call);
      if (call.name === FITLOG_DAY_TOOL.name) return runFitlogDayTool(env, call, presidentDate());
      if (call.name === FITLOG_PROGRESS_TOOL.name) return runFitlogProgressTool(env, call, presidentDate());
      if (call.name === FITLOG_WEEKLY_TOOL.name) return runFitlogWeeklyTool(env, call, presidentDate());
      if (call.name === FITLOG_EXERCISE_TOOL.name) return runFitlogExerciseTool(env, call);
      return runMemoryTool(env.MAYA_DB, call);
    },
    requireToolFirst: refersToPast(request.message) || askingAboutAmazon || askingAboutFitness,
  };

  const run = async (tier: ApiTier, apiKey: string): Promise<ChatReply> => {
    const result: GenerateResult = await withBusyRetry(() => generateMayaResponse({ ...base, apiKey }));
    await recordUsage(env.MAYA_DB, tier, result.totalTokens);
    // One line per turn, for `wrangler tail`. When an answer comes back short this
    // says whether the cap cut it, the model thought its way through the budget, or
    // it simply chose to be brief. Numbers only: nothing the president said is logged.
    console.log(
      JSON.stringify({
        evt: 'maya_turn',
        tier,
        model: env.MODEL,
        rounds: result.rounds,
        tools: result.toolCalls.map((call) => call.name),
        finishReason: result.finishReason,
        cap: base.maxOutputTokens,
        outputTokens: result.responseTokens,
        thoughtsTokens: result.thoughtsTokens,
        messageChars: messageLength(result.payload),
      }),
    );
    const validated = validateMayaResponse(result.payload);
    if (!validated.ok) {
      throw new LlmError('bad_response', `応答が契約を満たしていません。${validated.errors.join(' ')}`);
    }
    return {
      response: validated.value,
      warnings: validated.warnings,
      source: tier,
      searches: result.toolCalls.length,
    };
  };

  const askPaid = async (): Promise<ChatReply> => {
    if (!paid) {
      throw new LlmError('no_key', 'サーバーに有料キーが設定されていません。');
    }
    const limitYen = cost.paidDailyLimitYen;
    const expected = ASSUMED_TOKENS_PER_TURN + estimateRequestAttachmentTokens(request.attachments);
    if (await paidLimitReached(env.MAYA_DB, limitYen, expected)) {
      throw new LlmError(
        'limit_reached',
        `有料キーの1日の上限（${limitYen}円）に達するため、送信を止めました。`,
      );
    }
    return run('paid', paid);
  };

  if (freeAllowed && cost.preferFree && free) {
    try {
      return await run('free', free);
    } catch (error) {
      if (!cost.allowPaidFallback || !paid || !eligibleForPaidRetry(error)) {
        throw error;
      }
      return askPaid();
    }
  }
  return askPaid();
}
