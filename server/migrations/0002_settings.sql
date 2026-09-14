-- Server-side settings the president can change from the app.
--
-- The cost rules used to live only in wrangler.jsonc, which meant changing the
-- daily ceiling needed a redeploy. They start from the wrangler values and are
-- overridden by whatever is stored here, so an empty table behaves exactly as
-- before.
CREATE TABLE IF NOT EXISTS server_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
