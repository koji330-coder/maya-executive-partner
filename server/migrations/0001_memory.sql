-- MAYA's memory and the ledger that keeps the paid key honest.
--
-- Conversations are deliberately absent. They stay on the device
-- (docs/PLATFORM_ARCHITECTURE.md, decided 2026-09-13). What moves here is what
-- has to outlive a conversation and be reachable when the server builds a
-- prompt: decisions, their actions, projects, journal entries and topics.

PRAGMA foreign_keys = ON;

-- Projects are defined by the president, not derived from repositories:
-- one business spans thirty folders, and some projects have no code at all.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'done')),
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- What the president actually calls a project. "あのキャラ動かすやつ" is found
-- through an alias, before anything as heavy as vector search is needed.
CREATE TABLE IF NOT EXISTS project_aliases (
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  PRIMARY KEY (project_id, alias)
);

-- Where a project's activity comes from.
CREATE TABLE IF NOT EXISTS project_sources (
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('github', 'folder', 'dataset')),
  ref TEXT NOT NULL,
  PRIMARY KEY (project_id, kind, ref)
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT REFERENCES projects (id) ON DELETE SET NULL,
  conversation_id TEXT,
  source_message_id TEXT,
  title TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'reconsider')),
  follow_up_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions (status, created_at);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY NOT NULL,
  decision_id TEXT REFERENCES decisions (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'done', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_actions_decision ON actions (decision_id);

-- The source of truth for journal entries from every route.
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY NOT NULL,
  entry_date TEXT NOT NULL,
  topic TEXT NOT NULL,
  sensitivity TEXT CHECK (sensitivity IN ('home', 'business', 'company')),
  source TEXT,
  ai_verdict TEXT NOT NULL CHECK (ai_verdict IN ('accepted', 'rejected', 'undecided')),
  entry_json TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries (entry_date);

-- Kept forever, by decision on 2026-09-13.
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT,
  body TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

-- One row per model call. Drives the paid daily ceiling, which is a circuit
-- breaker on this side and not an invoice prediction.
CREATE TABLE IF NOT EXISTS llm_usage (
  id TEXT PRIMARY KEY NOT NULL,
  -- The president's calendar date in Tokyo, not UTC. A ceiling that reset at
  -- 9am would let a late night and the next morning share one day's budget.
  date TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'paid')),
  tokens INTEGER NOT NULL DEFAULT 0,
  estimated_yen REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_date ON llm_usage (date);
