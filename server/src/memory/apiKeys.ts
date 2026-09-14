import type { ApiTier } from '@/services/llm/apiKey';

import type { Env } from '../env';
import { ApiError, invalid, nowIso } from '../http';

/**
 * The Gemini keys, as the server uses them.
 *
 * A key entered in the app is stored here, encrypted, and wins. The Worker
 * secrets (`GEMINI_API_KEY_FREE` / `_PAID`) are the fallback for a tier with
 * nothing entered, which is how the server ran before the settings screen could
 * set keys.
 *
 * Keys only ever travel inward. No route returns one; the screen sees whether a
 * key is set, where it came from, and its last four characters.
 */

export const TIERS: readonly ApiTier[] = ['free', 'paid'];

export interface KeyStatus {
  set: boolean;
  /** `app`: entered in the settings screen. `secret`: the Worker secret. */
  source: 'app' | 'secret' | null;
  last4: string | null;
}

export type KeyStatuses = Record<ApiTier, KeyStatus>;

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** Throws a 503 that says what to set, rather than storing a key in the clear. */
async function encryptionKey(env: Env, subtle: SubtleCrypto): Promise<CryptoKey> {
  const raw = env.KEY_ENCRYPTION_KEY ? unb64(env.KEY_ENCRYPTION_KEY) : null;
  if (!raw || raw.length !== 32) {
    throw new ApiError(
      503,
      'not_configured',
      'サーバーに暗号化の鍵（KEY_ENCRYPTION_KEY）が設定されていないため、キーを保存できません。',
    );
  }
  return subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptKey(env: Env, plain: string, subtle: SubtleCrypto = crypto.subtle) {
  const key = await encryptionKey(env, subtle);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return { iv: b64(iv), ciphertext: b64(ciphertext) };
}

export async function decryptKey(
  env: Env,
  stored: { iv: string; ciphertext: string },
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  const key = await encryptionKey(env, subtle);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(stored.iv) }, key, unb64(stored.ciphertext));
  return new TextDecoder().decode(plain);
}

export function readTier(value: string | undefined): ApiTier {
  if (value !== 'free' && value !== 'paid') {
    throw invalid('キーの種類は free か paid です。');
  }
  return value;
}

/** A Gemini key is a single token of printable characters. Anything else is a paste mistake. */
export function readKeyText(value: unknown): string {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!/^[\x21-\x7e]{20,200}$/.test(key)) {
    throw invalid('キーの形が正しくありません。前後の空白や改行が入っていないか確かめてください。');
  }
  return key;
}

interface Row {
  tier: ApiTier;
  iv: string;
  ciphertext: string;
  last4: string;
}

async function storedRows(db: D1Database): Promise<Row[]> {
  try {
    const { results } = await db.prepare('SELECT tier, iv, ciphertext, last4 FROM api_keys;').all<Row>();
    return results ?? [];
  } catch {
    // Before migration 0003 there is no table; the Worker secrets still work.
    return [];
  }
}

const secretFor = (env: Env, tier: ApiTier) =>
  (tier === 'free' ? env.GEMINI_API_KEY_FREE : env.GEMINI_API_KEY_PAID) || undefined;

/**
 * The keys to call Gemini with.
 *
 * A stored key that cannot be decrypted (the encryption key was replaced) is
 * treated as absent rather than failing every consultation, and the Worker
 * secret takes over.
 */
export async function resolveKeys(db: D1Database, env: Env): Promise<Record<ApiTier, string | undefined>> {
  const rows = await storedRows(db);
  const result: Record<ApiTier, string | undefined> = { free: secretFor(env, 'free'), paid: secretFor(env, 'paid') };
  for (const row of rows) {
    try {
      result[row.tier] = await decryptKey(env, row);
    } catch {
      // Keep the secret fallback.
    }
  }
  return result;
}

export async function keyStatuses(db: D1Database, env: Env): Promise<KeyStatuses> {
  const rows = await storedRows(db);
  const status = (tier: ApiTier): KeyStatus => {
    const row = rows.find((r) => r.tier === tier);
    if (row) return { set: true, source: 'app', last4: row.last4 };
    const secret = secretFor(env, tier);
    return secret ? { set: true, source: 'secret', last4: secret.slice(-4) } : { set: false, source: null, last4: null };
  };
  return { free: status('free'), paid: status('paid') };
}

export async function saveKey(db: D1Database, env: Env, tier: ApiTier, key: string): Promise<void> {
  const { iv, ciphertext } = await encryptKey(env, key);
  await db
    .prepare(
      `INSERT INTO api_keys (tier, iv, ciphertext, last4, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tier) DO UPDATE SET iv = excluded.iv, ciphertext = excluded.ciphertext,
         last4 = excluded.last4, updated_at = excluded.updated_at;`,
    )
    .bind(tier, iv, ciphertext, key.slice(-4), nowIso())
    .run();
}

export async function deleteKey(db: D1Database, tier: ApiTier): Promise<void> {
  await db.prepare('DELETE FROM api_keys WHERE tier = ?;').bind(tier).run();
}
