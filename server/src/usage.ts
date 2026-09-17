import type { ApiTier } from '@/services/llm/apiKey';
import { ASSUMED_TOKENS_PER_TURN, estimateTurnYen } from '@/services/llm/policy';

import { presidentDate } from './clock';

/**
 * The paid ceiling, kept in D1.
 *
 * Same rule as the app's SQLite ledger (`src/services/llm/usage.ts`) and the same
 * pricing, imported rather than copied: a server that priced a turn differently
 * from the app would break the ceiling without anyone noticing.
 */

export async function recordUsage(db: D1Database, tier: ApiTier, tokens: number): Promise<void> {
  try {
    const now = Date.now();
    await db
      .prepare(
        `INSERT INTO llm_usage (id, date, tier, tokens, estimated_yen, created_at)
         VALUES (?, ?, ?, ?, ?, ?);`,
      )
      .bind(
        `${now}-${tier}-${crypto.randomUUID().slice(0, 8)}`,
        presidentDate(now),
        tier,
        tokens,
        tier === 'paid' ? estimateTurnYen(tokens) : 0,
        new Date(now).toISOString(),
      )
      .run();
  } catch {
    // A failed ledger write is not worth losing the reply over.
  }
}

/**
 * Checked before a paid request goes out, using the assumed cost of a turn not
 * yet made. Blocking one turn early is better than finding the overspend after.
 */
export async function paidLimitReached(
  db: D1Database,
  limitYen: number,
  expectedTokens = ASSUMED_TOKENS_PER_TURN,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT COALESCE(SUM(estimated_yen), 0) AS yen FROM llm_usage WHERE date = ? AND tier = 'paid';`)
    .bind(presidentDate())
    .first<{ yen: number }>();
  return (row?.yen ?? 0) + estimateTurnYen(expectedTokens) > limitYen;
}
