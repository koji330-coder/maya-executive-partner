import { driver } from './driver';
import type { LocalDatabase } from './localDatabase';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';

const DATABASE_NAME = 'maya.db';

export type DatabaseStatus =
  | { state: 'idle' }
  | { state: 'ready'; version: number }
  | { state: 'unavailable'; reason: string }
  | { state: 'error'; reason: string };

let database: LocalDatabase | null = null;
let openPromise: Promise<LocalDatabase> | null = null;
let status: DatabaseStatus = { state: 'idle' };

export function getDatabaseStatus(): DatabaseStatus {
  return status;
}

export function isDatabaseSupported(): boolean {
  return driver.isSupported;
}

/**
 * Opens the local database and applies pending migrations.
 *
 * Safe to call repeatedly: concurrent callers share one open promise. Where the
 * platform has no SQLite driver this resolves to an unavailable status instead
 * of throwing, so the screens still render.
 */
export async function initializeDatabase(): Promise<DatabaseStatus> {
  if (!driver.isSupported) {
    status = {
      state: 'unavailable',
      reason: driver.unsupportedReason ?? 'No local database driver on this platform.',
    };
    return status;
  }
  try {
    await openDatabase();
    return status;
  } catch (error) {
    status = { state: 'error', reason: error instanceof Error ? error.message : String(error) };
    return status;
  }
}

export async function openDatabase(): Promise<LocalDatabase> {
  if (database) {
    return database;
  }
  if (!openPromise) {
    openPromise = (async () => {
      const db = await driver.open(DATABASE_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await migrate(db);
      database = db;
      status = { state: 'ready', version: LATEST_SCHEMA_VERSION };
      return db;
    })();
    openPromise.catch(() => {
      openPromise = null;
    });
  }
  return openPromise;
}

async function migrate(db: LocalDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let current = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) {
      continue;
    }
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
    });
    // PRAGMA cannot be parameterised, and the value comes from our own constant.
    await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    current = migration.version;
  }
}

/** Test/teardown helper. Not used by app code. */
export async function closeDatabase(): Promise<void> {
  await database?.closeAsync();
  database = null;
  openPromise = null;
  status = { state: 'idle' };
}
