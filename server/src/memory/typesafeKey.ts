import type { Env } from '../env';

import { decryptKey, encryptKey, type KeyStatus } from './apiKeys';

/**
 * The TypeSafe (Jev) key, entered from the settings screen.
 *
 * Same rules as the Gemini keys (apiKeys.ts): encrypted under
 * KEY_ENCRYPTION_KEY, tried against TypeSafe before it is stored, never sent
 * back, and the Worker secret TYPESAFE_API_KEY is the fallback when nothing has
 * been entered. It lives in server_settings rather than api_keys because that
 * table only admits the two Gemini tiers, and this way no migration is needed.
 */

const KEY = 'secret.typesafe';

interface Stored {
  iv: string;
  ciphertext: string;
  last4: string;
}

async function stored(db: D1Database): Promise<Stored | null> {
  try {
    const row = await db.prepare(`SELECT value FROM server_settings WHERE key = ?;`).bind(KEY).first<{ value: string }>();
    if (!row) return null;
    const parsed = JSON.parse(row.value) as Partial<Stored>;
    return typeof parsed.iv === 'string' && typeof parsed.ciphertext === 'string' && typeof parsed.last4 === 'string'
      ? (parsed as Stored)
      : null;
  } catch {
    return null;
  }
}

/**
 * The key to call Jev with. A stored key that cannot be decrypted (the
 * encryption key was replaced) counts as absent, so the Worker secret takes
 * over; with neither, Jev routing falls back to the regex (no_key).
 */
export async function resolveTypesafeKey(db: D1Database, env: Env): Promise<string | undefined> {
  const row = await stored(db);
  if (row) {
    try {
      return await decryptKey(env, row);
    } catch {
      // Fall through to the secret.
    }
  }
  return env.TYPESAFE_API_KEY || undefined;
}

export async function typesafeKeyStatus(db: D1Database, env: Env): Promise<KeyStatus> {
  const row = await stored(db);
  if (row) return { set: true, source: 'app', last4: row.last4 };
  const secret = env.TYPESAFE_API_KEY;
  return secret ? { set: true, source: 'secret', last4: secret.slice(-4) } : { set: false, source: null, last4: null };
}

export async function saveTypesafeKey(db: D1Database, env: Env, key: string): Promise<void> {
  const { iv, ciphertext } = await encryptKey(env, key);
  const value = JSON.stringify({ iv, ciphertext, last4: key.slice(-4) } satisfies Stored);
  await db
    .prepare(
      `INSERT INTO server_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
    )
    .bind(KEY, value, new Date().toISOString())
    .run();
}

export async function deleteTypesafeKey(db: D1Database): Promise<void> {
  await db.prepare(`DELETE FROM server_settings WHERE key = ?;`).bind(KEY).run();
}

export type TypesafeKeyCheck = { ok: true } | { ok: false; detail: string };

/**
 * Tries a key before it is stored, so a mistyped key fails on the settings
 * screen and not in the middle of a consultation. Lists the models, which costs
 * nothing (only evaluations are billed).
 */
export async function checkTypesafeKey(key: string, fetchImpl: typeof fetch = fetch): Promise<TypesafeKeyCheck> {
  let response: Response;
  try {
    response = await fetchImpl('https://api.typesafe.ai/v1/models', {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, detail: 'TypeSafe に届きませんでした。時間をおいて試してください。' };
  }
  if (response.ok) return { ok: true };
  if (response.status === 401 || response.status === 403) {
    return { ok: false, detail: 'TypeSafe がこのキーを受け付けませんでした。' };
  }
  return { ok: false, detail: `TypeSafe が ${response.status} を返しました。` };
}
