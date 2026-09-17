import { openDatabase } from './database';

/** Key-value store for local-only app settings (docs/DATA_MODEL.md). */
export async function getSetting(key: string): Promise<string | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?;',
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
    key,
    value,
    new Date().toISOString(),
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM app_settings;',
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
