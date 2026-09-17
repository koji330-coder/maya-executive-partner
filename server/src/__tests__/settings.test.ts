import type { Env } from '../env';
import {
  clampLimitYen,
  loadCostPolicy,
  MAX_DAILY_LIMIT_YEN,
  parseCostPatch,
  saveCostPolicy,
} from '../memory/settings';

/**
 * A D1 stand-in holding one table's worth of rows.
 *
 * Only the three statements `settings.ts` issues are understood. Anything else
 * throws, so a query that changes shape fails here rather than passing by
 * accident.
 */
function fakeDb(rows: Record<string, string> = {}, broken = false) {
  const store = new Map(Object.entries(rows));
  const writes: { key: string; value: string }[] = [];

  const prepare = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      all: async () => {
        if (broken) throw new Error('no such table: server_settings');
        if (!sql.includes('SELECT')) throw new Error(`unexpected: ${sql}`);
        return { results: [...store].map(([key, value]) => ({ key, value })) };
      },
      run: async () => {
        const [key, value] = args as [string, string];
        store.set(key, value);
        writes.push({ key, value });
      },
    }),
    all: async () => {
      if (broken) throw new Error('no such table: server_settings');
      return { results: [...store].map(([key, value]) => ({ key, value })) };
    },
  });

  return {
    db: {
      prepare,
      batch: async (statements: { run: () => Promise<void> }[]) => {
        for (const statement of statements) await statement.run();
      },
    } as unknown as D1Database,
    store,
    writes,
  };
}

const ENV = {
  PREFER_FREE: 'true',
  ALLOW_PAID_FALLBACK: 'true',
  PAID_DAILY_LIMIT_YEN: '50',
} as unknown as Env;

describe('clampLimitYen', () => {
  it('keeps a sensible amount as it is', () => {
    expect(clampLimitYen(200)).toBe(200);
  });

  it('lands on the safe side of nonsense rather than rejecting it', () => {
    // A ceiling is a safety rail. Refusing the save would leave the old number
    // in place, which is the opposite of what someone typing 0 wants.
    expect(clampLimitYen(-5)).toBe(0);
    expect(clampLimitYen(Number.NaN)).toBe(0);
    expect(clampLimitYen(99_999)).toBe(MAX_DAILY_LIMIT_YEN);
  });

  it('rounds, because yen are whole', () => {
    expect(clampLimitYen(120.6)).toBe(121);
  });
});

describe('loadCostPolicy', () => {
  it('uses the wrangler values when nothing has been saved', async () => {
    const { db } = fakeDb();
    await expect(loadCostPolicy(db, ENV)).resolves.toEqual({
      preferFree: true,
      allowPaidFallback: true,
      paidDailyLimitYen: 50,
    });
  });

  it('lets a saved value win over the wrangler one', async () => {
    const { db } = fakeDb({ 'cost.paidDailyLimitYen': '200', 'cost.preferFree': 'false' });
    await expect(loadCostPolicy(db, ENV)).resolves.toEqual({
      preferFree: false,
      allowPaidFallback: true,
      paidDailyLimitYen: 200,
    });
  });

  it('falls back to the wrangler values when the table is not there yet', async () => {
    // Deploying the code before running the migration must not break a
    // consultation over a settings read.
    const { db } = fakeDb({}, true);
    await expect(loadCostPolicy(db, ENV)).resolves.toEqual({
      preferFree: true,
      allowPaidFallback: true,
      paidDailyLimitYen: 50,
    });
  });

  it('clamps a stored value that is out of range', async () => {
    const { db } = fakeDb({ 'cost.paidDailyLimitYen': '999999' });
    await expect(loadCostPolicy(db, ENV)).resolves.toMatchObject({
      paidDailyLimitYen: MAX_DAILY_LIMIT_YEN,
    });
  });
});

describe('saveCostPolicy', () => {
  it('writes only the field given, so one switch does not reset the others', async () => {
    const { db, writes } = fakeDb();
    await saveCostPolicy(db, { allowPaidFallback: false });
    expect(writes).toEqual([{ key: 'cost.allowPaidFallback', value: 'false' }]);
  });

  it('stores the clamped ceiling, not what was typed', async () => {
    const { db, store } = fakeDb();
    await saveCostPolicy(db, { paidDailyLimitYen: -20 });
    expect(store.get('cost.paidDailyLimitYen')).toBe('0');
  });

  it('writes nothing for an empty patch', async () => {
    const { db, writes } = fakeDb();
    await saveCostPolicy(db, {});
    expect(writes).toEqual([]);
  });

  it('round-trips through load', async () => {
    const { db } = fakeDb();
    await saveCostPolicy(db, { preferFree: false, paidDailyLimitYen: 300 });
    await expect(loadCostPolicy(db, ENV)).resolves.toEqual({
      preferFree: false,
      allowPaidFallback: true,
      paidDailyLimitYen: 300,
    });
  });
});

describe('parseCostPatch', () => {
  it('takes the three fields it knows', () => {
    expect(parseCostPatch({ preferFree: false, allowPaidFallback: true, paidDailyLimitYen: 120 })).toEqual({
      preferFree: false,
      allowPaidFallback: true,
      paidDailyLimitYen: 120,
    });
  });

  it('ignores anything else the body carries', () => {
    expect(parseCostPatch({ model: 'gemini-3.6-flash', GEMINI_API_KEY_PAID: 'x' })).toEqual({});
  });

  it('ignores a value of the wrong type rather than coercing it', () => {
    // '200' from a text field must not become the ceiling by accident.
    expect(parseCostPatch({ paidDailyLimitYen: '200', preferFree: 'false' })).toEqual({});
  });
});
