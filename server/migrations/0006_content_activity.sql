-- Read-only CONTENT_LOG snapshots imported from the local Content Hub.
--
-- Uploads are versioned. MAYA reads only the snapshot named by
-- activity_sync_state, so an interrupted PC upload never exposes a partial set.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS activity_sync_runs (
  snapshot_id TEXT PRIMARY KEY NOT NULL,
  source_generated_at TEXT NOT NULL,
  expected_count INTEGER NOT NULL CHECK (expected_count >= 0 AND expected_count <= 5000),
  status TEXT NOT NULL CHECK (status IN ('uploading', 'complete')),
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS activity_entries (
  snapshot_id TEXT NOT NULL REFERENCES activity_sync_runs (snapshot_id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL,
  project TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  date_sort TEXT NOT NULL,
  date_precision TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('home', 'business')),
  publishable TEXT NOT NULL CHECK (publishable IN ('yes', 'likely', 'unclear', 'no')),
  category TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_entry INTEGER NOT NULL,
  sources_json TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  search_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_snapshot_date
  ON activity_entries (snapshot_id, date_sort DESC);
CREATE INDEX IF NOT EXISTS idx_activity_snapshot_project
  ON activity_entries (snapshot_id, project, date_sort DESC);

CREATE TABLE IF NOT EXISTS activity_sync_state (
  source TEXT PRIMARY KEY NOT NULL,
  current_snapshot_id TEXT NOT NULL,
  source_generated_at TEXT NOT NULL,
  entry_count INTEGER NOT NULL,
  completed_at TEXT NOT NULL
);
