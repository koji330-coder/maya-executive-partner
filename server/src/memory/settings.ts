import type { Env } from '../env';

/**
 * The cost rules, as the server actually applies them.
 *
 * They used to be read straight off `env`, so changing the daily ceiling meant
 * editing wrangler.jsonc and redeploying. The president asked to move the
 * ceiling into the settings screen (2026-09-14), so the wrangler values are now
 * the starting point and D1 holds any change made since. An empty table
 * therefore behaves exactly like the old code.
 */
export interface CostPolicy {
  /** Send to the free key first. */
  preferFree: boolean;
  /** Retry on the paid key when the free one hit its limit. */
  allowPaidFallback: boolean;
  /**
   * A local circuit breaker in yen, not Google's billing limit. Checked before
   * a paid request goes out, against a deliberately pessimistic estimate.
   */
  paidDailyLimitYen: number;
}

/** What the paid ceiling may be set to from the app. */
export const MIN_DAILY_LIMIT_YEN = 0;
export const MAX_DAILY_LIMIT_YEN = 10_000;

const KEYS = {
  preferFree: 'cost.preferFree',
  allowPaidFallback: 'cost.allowPaidFallback',
  paidDailyLimitYen: 'cost.paidDailyLimitYen',
} as const;

function envPolicy(env: Env): CostPolicy {
  const limit = Number(env.PAID_DAILY_LIMIT_YEN);
  return {
    preferFree: env.PREFER_FREE === 'true',
    allowPaidFallback: env.ALLOW_PAID_FALLBACK === 'true',
    paidDailyLimitYen: Number.isFinite(limit) && limit >= 0 ? limit : 0,
  };
}

/**
 * Clamps rather than rejects.
 *
 * A ceiling is a safety rail, so a nonsensical value should land on the safe
 * side instead of failing the save and leaving the old number in place.
 */
export function clampLimitYen(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_DAILY_LIMIT_YEN;
  }
  return Math.min(MAX_DAILY_LIMIT_YEN, Math.max(MIN_DAILY_LIMIT_YEN, Math.round(value)));
}

export async function loadCostPolicy(db: D1Database, env: Env): Promise<CostPolicy> {
  const base = envPolicy(env);
  let rows: { key: string; value: string }[] = [];
  try {
    const result = await db
      .prepare(`SELECT key, value FROM server_settings WHERE key LIKE 'cost.%';`)
      .all<{ key: string; value: string }>();
    rows = result.results ?? [];
  } catch {
    // Before the migration runs there is no table. The wrangler values still
    // describe the server correctly, so fall back rather than fail a
    // consultation over a settings read.
    return base;
  }

  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const bool = (key: string, fallback: boolean): boolean => {
    const value = stored.get(key);
    return value === undefined ? fallback : value === 'true';
  };
  const limit = stored.get(KEYS.paidDailyLimitYen);

  return {
    preferFree: bool(KEYS.preferFree, base.preferFree),
    allowPaidFallback: bool(KEYS.allowPaidFallback, base.allowPaidFallback),
    paidDailyLimitYen:
      limit === undefined ? base.paidDailyLimitYen : clampLimitYen(Number(limit)),
  };
}

/** Writes only the fields given, so the app can change one switch at a time. */
export async function saveCostPolicy(db: D1Database, patch: Partial<CostPolicy>): Promise<void> {
  const now = new Date().toISOString();
  const writes: D1PreparedStatement[] = [];
  const put = (key: string, value: string) => {
    writes.push(
      db
        .prepare(
          `INSERT INTO server_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        )
        .bind(key, value, now),
    );
  };

  if (patch.preferFree !== undefined) {
    put(KEYS.preferFree, String(patch.preferFree));
  }
  if (patch.allowPaidFallback !== undefined) {
    put(KEYS.allowPaidFallback, String(patch.allowPaidFallback));
  }
  if (patch.paidDailyLimitYen !== undefined) {
    put(KEYS.paidDailyLimitYen, String(clampLimitYen(patch.paidDailyLimitYen)));
  }
  if (writes.length > 0) {
    await db.batch(writes);
  }
}

/** Reads the patch out of a request body, ignoring anything else it carries. */
export function parseCostPatch(body: Record<string, unknown>): Partial<CostPolicy> {
  const patch: Partial<CostPolicy> = {};
  if (typeof body.preferFree === 'boolean') {
    patch.preferFree = body.preferFree;
  }
  if (typeof body.allowPaidFallback === 'boolean') {
    patch.allowPaidFallback = body.allowPaidFallback;
  }
  if (typeof body.paidDailyLimitYen === 'number') {
    patch.paidDailyLimitYen = body.paidDailyLimitYen;
  }
  return patch;
}
