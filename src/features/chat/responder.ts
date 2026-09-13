import { getApiKeys, type ApiTier } from '@/services/llm/apiKey';
import {
  eligibleForPaidRetry,
  generateMayaResponse,
  LlmError,
  type ChatExchange,
  type RequestAttachment,
} from '@/services/llm/geminiClient';
import { estimateRequestAttachmentTokens, freeTierAllowed } from '@/services/llm/policy';
import { loadLlmSettings } from '@/services/llm/settings';
import { ASSUMED_TOKENS_PER_TURN, paidLimitReached, recordUsage } from '@/services/llm/usage';

import { validateMayaResponse, type MayaResponse } from './mayaResponse';
import { respondTo as scriptedReply } from './mockResponder';
import { buildSystemPrompt, type CompanyContext, type DecisionContext } from './systemPrompt';

export interface Reply {
  response: MayaResponse;
  warnings: string[];
  /** Which key answered, or `mock` when no key is stored. */
  source: ApiTier | 'mock';
}

export interface AskOptions {
  message: string;
  history: ChatExchange[];
  company?: CompanyContext;
  /**
   * Decisions the president saved earlier. They ride in the prompt alongside
   * the company, so they fall under the same real-company gate below.
   */
  decisions?: DecisionContext[];
  /**
   * Set when the profile describes a real company. The company context goes out
   * with every message, so the free tier is closed off rather than left to the
   * user to remember. docs/LLM_INTEGRATION.md.
   */
  companyIsReal?: boolean;
  attachments?: RequestAttachment[];
  /** Forces a specific mock script. Development only. */
  scriptId?: string;
  signal?: AbortSignal;
}

/**
 * Answers one turn, from the model when a key is available and from the scripts
 * when it is not.
 *
 * The mock path is not a leftover. It is what the app falls back to before a key
 * is entered, and it exercises the same validator, so a first run is still a
 * working consultation.
 */
export async function ask(options: AskOptions): Promise<Reply> {
  const keys = await getApiKeys();
  if (!keys.free && !keys.paid) {
    const reply = scriptedReply(options.message, options.scriptId);
    return { response: reply.response, warnings: reply.warnings, source: 'mock' };
  }

  const settings = await loadLlmSettings();
  const freeAllowed = freeTierAllowed(options.companyIsReal ?? false);
  if (!freeAllowed && !keys.paid) {
    throw new LlmError(
      'no_key',
      '実在する会社の情報が登録されているため、無料APIキーは使いません。設定から有料APIキーを登録してください。',
    );
  }
  const systemPrompt = buildSystemPrompt(options.company, options.decisions);
  const request = {
    systemPrompt,
    history: options.history,
    message: options.message,
    attachments: options.attachments,
    model: settings.model,
    signal: options.signal,
  };

  const askPaid = async (): Promise<Reply> => {
    if (!keys.paid) {
      throw new LlmError('no_key', '有料APIキーが登録されていません。設定から登録してください。');
    }
    // An attached screenshot measured about 1,100 prompt tokens, so a turn with
    // files is charged against the daily ceiling at its real weight.
    const expected = ASSUMED_TOKENS_PER_TURN + estimateRequestAttachmentTokens(options.attachments);
    if (await paidLimitReached(settings.paidDailyLimitYen, expected)) {
      throw new LlmError(
        'limit_reached',
        `有料APIの1日の上限（${settings.paidDailyLimitYen}円）に達するため、送信を止めました。設定から上限を変更できます。`,
      );
    }
    const result = await generateMayaResponse({ ...request, apiKey: keys.paid });
    await recordUsage('paid', result.totalTokens);
    return finish(result.payload, 'paid');
  };

  if (freeAllowed && settings.preferFree && keys.free) {
    try {
      const result = await generateMayaResponse({ ...request, apiKey: keys.free });
      await recordUsage('free', result.totalTokens);
      return finish(result.payload, 'free');
    } catch (error) {
      if (!settings.allowPaidFallback || !keys.paid || !eligibleForPaidRetry(error)) {
        throw error;
      }
      return askPaid();
    }
  }

  return askPaid();
}

function finish(payload: unknown, source: ApiTier): Reply {
  const result = validateMayaResponse(payload);
  if (!result.ok) {
    throw new LlmError(
      'bad_response',
      `応答が契約を満たしていません。${result.errors.join(' ')}`,
    );
  }
  return { response: result.value, warnings: result.warnings, source };
}
