import { openDatabase } from '@/services/storage';

import type { ApiTier } from './apiKey';

/**
 * What the paid tier is assumed to cost, in yen per 1000 tokens.
 *
 * Deliberately pessimistic. This drives a local circuit breaker, not an invoice
 * prediction, so being wrong in the expensive direction is the safe failure.
 * Google's real price is lower; check it before relaxing this.
 */
export const ASSUMED_YEN_PER_1K_TOKENS = 0.4;

/** A consultation turn runs a few thousand tokens once thinking is counted. */
export const ASSUMED_TOKENS_PER_TURN = 4000;

export function estimateTurnYen(tokens = ASSUMED_TOKENS_PER_TURN): number {
  return Math.max(0.01, (tokens / 1000) * ASSUMED_YEN_PER_1K_TOKENS);
}

export function today(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface DailyUsage {
  date: string;
  freeTurns: number;
  paidTurns: number;
  paidEstimatedYen: number;
  totalTokens: number;
}

const EMPTY: Omit<DailyUsage, 'date'> = {
  freeTurns: 0,
  paidTurns: 0,
  paidEstimatedYen: 0,
  totalTokens: 0,
};

export async function ensureUsageTable(): Promise<void> {
  const db = await openDatabase();
  await db.execAsync(`CREATE TABLE IF NOT EXISTS llm_usage (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('free', 'paid')),
    tokens INTEGER NOT NULL DEFAULT 0,
    estimated_yen REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`);
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_llm_usage_date ON llm_usage (date);');
}

export async function getUsage(date = today()): Promise<DailyUsage> {
  try {
    await ensureUsageTable();
    const db = await openDatabase();
    const rows = await db.getAllAsync<{ tier: ApiTier; turns: number; tokens: number; yen: number }>(
      `SELECT tier, COUNT(*) AS turns, SUM(tokens) AS tokens, SUM(estimated_yen) AS yen
       FROM llm_usage WHERE date = ? GROUP BY tier;`,
      date,
    );
    const usage: DailyUsage = { date, ...EMPTY };
    for (const row of rows) {
      usage.totalTokens += row.tokens ?? 0;
      if (row.tier === 'paid') {
        usage.paidTurns = row.turns;
        usage.paidEstimatedYen = row.yen ?? 0;
      } else {
        usage.freeTurns = row.turns;
      }
    }
    return usage;
  } catch {
    // Usage tracking must never be the reason a consultation fails.
    return { date, ...EMPTY };
  }
}

export async function recordUsage(tier: ApiTier, tokens: number): Promise<void> {
  try {
    await ensureUsageTable();
    const db = await openDatabase();
    const now = new Date();
    await db.runAsync(
      `INSERT INTO llm_usage (id, date, tier, tokens, estimated_yen, created_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      `${now.getTime()}-${tier}-${Math.random().toString(36).slice(2, 8)}`,
      today(now),
      tier,
      tokens,
      tier === 'paid' ? estimateTurnYen(tokens) : 0,
      now.toISOString(),
    );
  } catch {
    // Same: a failed write is not worth losing the reply over.
  }
}

/**
 * Checked before a paid request goes out, using the assumed cost of a turn we
 * have not made yet. Blocking one turn early is better than discovering the
 * overspend afterwards.
 */
export async function paidLimitReached(
  limitYen: number,
  expectedTokens = ASSUMED_TOKENS_PER_TURN,
): Promise<boolean> {
  const usage = await getUsage();
  return usage.paidEstimatedYen + estimateTurnYen(expectedTokens) > limitYen;
}
