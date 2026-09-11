import { getApiKeys, type ApiTier } from '@/services/llm/apiKey';
import {
  eligibleForPaidRetry,
  generateMayaResponse,
  LlmError,
  type ChatExchange,
} from '@/services/llm/geminiClient';
import { loadLlmSettings } from '@/services/llm/settings';
import { paidLimitReached, recordUsage } from '@/services/llm/usage';

import { validateMayaResponse, type MayaResponse } from './mayaResponse';
import { respondTo as scriptedReply } from './mockResponder';
import { buildSystemPrompt, type CompanyContext } from './systemPrompt';

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
  const systemPrompt = buildSystemPrompt(options.company);
  const request = {
    systemPrompt,
    history: options.history,
    message: options.message,
    signal: options.signal,
  };

  const askPaid = async (): Promise<Reply> => {
    if (!keys.paid) {
      throw new LlmError('no_key', '有料APIキーが登録されていません。設定から登録してください。');
    }
    if (await paidLimitReached(settings.paidDailyLimitYen)) {
      throw new LlmError(
        'limit_reached',
        `有料APIの1日の上限（${settings.paidDailyLimitYen}円）に達するため、送信を止めました。設定から上限を変更できます。`,
      );
    }
    const result = await generateMayaResponse({ ...request, apiKey: keys.paid });
    await recordUsage('paid', result.totalTokens);
    return finish(result.payload, 'paid');
  };

  if (settings.preferFree && keys.free) {
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
