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
  {
    version: 2,
    statements: [
      // The contract's structured half — options, the next action, a detected
      // decision, the follow-up question — had nowhere to live, so a reloaded or
      // exported conversation showed only the prose. The validated response is
      // kept whole rather than given a column each, because the contract will
      // keep changing and a JSON blob does not need a migration every time.
      `ALTER TABLE cached_messages ADD COLUMN response_json TEXT;`,
    ],
  },
  {
    version: 3,
    statements: [
      // Phase 5. A decision without its next action is a note; the action is
      // what gets checked on. `docs/DATA_MODEL.md` has defined `actions` from
      // the start, but nothing needed it until decisions were actually saved.
      `CREATE TABLE IF NOT EXISTS cached_actions (
        id TEXT PRIMARY KEY NOT NULL,
        decision_id TEXT,
        company_id TEXT,
        title TEXT NOT NULL,
        due_date TEXT,
        status TEXT NOT NULL CHECK (status IN ('open', 'done', 'cancelled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_cached_actions_decision
        ON cached_actions (decision_id);`,
      // Which reply a decision was saved from. Without it, reopening the app
      // shows every past decision card as unsaved again and invites a second
      // copy of the same decision.
      `ALTER TABLE cached_decisions ADD COLUMN source_message_id TEXT;`,
      `CREATE INDEX IF NOT EXISTS idx_cached_decisions_source
        ON cached_decisions (source_message_id);`,
    ],
  },
  {
    version: 4,
    statements: [
      // The inbox: things brought in from outside MAYA. Journal entries written
      // by chat skills had nowhere to land, which is why the journal stopped
      // after its first day. This table is where they land until v0.2 moves it
      // to D1 (docs/PLATFORM_ARCHITECTURE.md).
      //
      // The parsed entry is kept whole as JSON, for the same reason replies are:
      // the skill carries a journal_version and will grow fields. The raw paste
      // is kept too, so a parser bug can be repaired later from what was
      // actually sent.
      `CREATE TABLE IF NOT EXISTS cached_journal_entries (
        id TEXT PRIMARY KEY NOT NULL,
        entry_date TEXT NOT NULL,
        topic TEXT NOT NULL,
        sensitivity TEXT,
        source TEXT,
        ai_verdict TEXT NOT NULL CHECK (ai_verdict IN ('accepted', 'rejected', 'undecided')),
        entry_json TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_cached_journal_date
        ON cached_journal_entries (entry_date);`,
      // Topics from X and elsewhere. Kept forever, by decision on 2026-09-13.
      `CREATE TABLE IF NOT EXISTS cached_topics (
        id TEXT PRIMARY KEY NOT NULL,
        url TEXT,
        body TEXT,
        note TEXT,
        created_at TEXT NOT NULL
      );`,
    ],
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, migration) => Math.max(max, migration.version),
  0,
);
