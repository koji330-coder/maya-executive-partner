/**
 * Local SQLite cache schema (docs/DATA_MODEL.md, "Local SQLite").
 *
 * The backend is the source of truth once authentication exists; these tables
 * exist so the app opens instantly and survives being offline. Sync is
 * deliberately not designed yet.
 *
 * Migrations are applied in order and tracked with PRAGMA user_version. Never
 * edit a shipped migration — append a new one.
 */
export interface Migration {
  version: number;
  statements: string[];
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS cached_company (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT,
        industry TEXT,
        employee_count INTEGER,
        revenue_range TEXT,
        description TEXT,
        goals_json TEXT,
        issues_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS cached_conversations (
        id TEXT PRIMARY KEY NOT NULL,
        company_id TEXT,
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS cached_messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'maya', 'system')),
        text TEXT NOT NULL,
        emotion TEXT,
        pose TEXT,
        scene TEXT,
        voice_key TEXT,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_cached_messages_conversation
        ON cached_messages (conversation_id, created_at);`,
      `CREATE TABLE IF NOT EXISTS cached_decisions (
        id TEXT PRIMARY KEY NOT NULL,
        company_id TEXT,
        conversation_id TEXT,
        title TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'reconsider')),
        follow_up_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_cached_decisions_status
        ON cached_decisions (status, updated_at);`,
    ],
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, migration) => Math.max(max, migration.version),
  0,
);
