import * as SecureStore from 'expo-secure-store';

/**
 * Two keys, from two different Google Cloud projects.
 *
 * The free key belongs to a project with no billing, the paid key to one with
 * billing enabled. Keeping them in separate projects is what actually guarantees
 * which tier a request lands on; a single key with a flag would not.
 *
 * Keys live in the device keychain and nowhere else. They are never logged, put
 * in app state that gets serialised, or sent anywhere except Google.
 */
export type ApiTier = 'free' | 'paid';

const KEY_NAMES: Record<ApiTier, string> = {
  free: 'maya.gemini.freeApiKey',
  paid: 'maya.gemini.paidApiKey',
};

export async function getApiKey(tier: ApiTier): Promise<string | null> {
  const stored = await SecureStore.getItemAsync(KEY_NAMES[tier]);
  return stored?.trim() || null;
}

export async function hasApiKey(tier: ApiTier): Promise<boolean> {
  return Boolean(await getApiKey(tier));
}

export async function getApiKeys(): Promise<Record<ApiTier, string | null>> {
  const [free, paid] = await Promise.all([getApiKey('free'), getApiKey('paid')]);
  return { free, paid };
}

export async function saveApiKey(tier: ApiTier, apiKey: string): Promise<void> {
  const normalized = apiKey.trim();
  if (!normalized) {
    throw new Error('APIキーを入力してください。');
  }
  await SecureStore.setItemAsync(KEY_NAMES[tier], normalized);
}

export async function deleteApiKey(tier: ApiTier): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAMES[tier]);
}
