import * as SecureStore from 'expo-secure-store';

import type { ApiTier } from './apiKey';
import { DEFAULT_MODEL, MODEL_CHOICES } from './geminiClient';

const SETTINGS_KEY = 'maya.gemini.routerSettings';

export interface LlmSettings {
  /** Send to the free key first when one is stored. */
  preferFree: boolean;
  /**
   * Retry on the paid key when the free one is rate limited. Off by default:
   * spending money should be something the user turned on, not a surprise.
   */
  allowPaidFallback: boolean;
  /**
   * A local circuit breaker, in yen, not Google's billing limit. The estimate is
   * deliberately pessimistic and is checked before a request goes out.
   */
  paidDailyLimitYen: number;
  /** Which Gemini model to ask. Availability differs by key. */
  model: string;
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  preferFree: true,
  allowPaidFallback: false,
  paidDailyLimitYen: 50,
  model: DEFAULT_MODEL,
};

export async function loadLlmSettings(): Promise<LlmSettings> {
  const stored = await SecureStore.getItemAsync(SETTINGS_KEY);
  if (!stored) {
    return DEFAULT_LLM_SETTINGS;
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) {
      return DEFAULT_LLM_SETTINGS;
    }
    const value = parsed as Partial<LlmSettings>;
    return {
      preferFree: value.preferFree ?? DEFAULT_LLM_SETTINGS.preferFree,
      allowPaidFallback: value.allowPaidFallback ?? DEFAULT_LLM_SETTINGS.allowPaidFallback,
      paidDailyLimitYen:
        typeof value.paidDailyLimitYen === 'number' && value.paidDailyLimitYen >= 0
          ? value.paidDailyLimitYen
          : DEFAULT_LLM_SETTINGS.paidDailyLimitYen,
      model:
        typeof value.model === 'string' && MODEL_CHOICES.some((choice) => choice.id === value.model)
          ? value.model
          : DEFAULT_LLM_SETTINGS.model,
    };
  } catch {
    return DEFAULT_LLM_SETTINGS;
  }
}

export async function saveLlmSettings(settings: LlmSettings): Promise<void> {
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings));
}

export { freeTierAllowed } from './policy';

export function tierLabel(tier: ApiTier): string {
  return tier === 'free' ? '無料' : '有料';
}
