-- Local Content Hub observations for the read-only memory inspector.
--
-- This database is deliberately separate from MAYA_DB. The inspector may
-- compare the PC's latest index with MAYA's current activity snapshot, but it
-- cannot change MAYA's memory.

CREATE TABLE IF NOT EXISTS inspector_state (
  source TEXT PRIMARY KEY NOT NULL,
  snapshot_id TEXT NOT NULL,
  source_generated_at TEXT NOT NULL,
  entry_count INTEGER NOT NULL CHECK (entry_count >= 0 AND entry_count <= 5000),
  project_count INTEGER NOT NULL CHECK (project_count >= 0 AND project_count <= 1000),
  projects_json TEXT NOT NULL,
  observed_at TEXT NOT NULL
);
