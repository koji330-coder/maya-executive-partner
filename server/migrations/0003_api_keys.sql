-- Gemini keys entered from the app's settings screen.
--
-- Encrypted with AES-GCM under KEY_ENCRYPTION_KEY, a Worker secret, so a copy of
-- this database alone does not give the keys away. The last four characters are
-- kept in the clear so the screen can say which key is registered without ever
-- sending the key back.
CREATE TABLE IF NOT EXISTS api_keys (
  tier       TEXT PRIMARY KEY NOT NULL CHECK (tier IN ('free', 'paid')),
  iv         TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  last4      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
