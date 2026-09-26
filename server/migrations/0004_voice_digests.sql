-- VoiceBox（音声メモ・会議録音アプリ）から届く、会話の要約と議事録。
--
-- 届くのは、VoiceBox で「採用」された要約・議事録だけ。原文（文字起こし）と音声は
-- 届かず、ここにも置かない（VoiceBox 側の方針: MAYA には要約だけ）。
-- recording_id は VoiceBox の録音 ID。同じ ID の再送は上書きで、内容が同じなら
-- content_hash で書き込みを省く。imported_at は MAYA にも渡し、同期が止まっていても
-- 古い内容を「今」と言わせないために使う（docs/PLATFORM_ARCHITECTURE.md）。
CREATE TABLE IF NOT EXISTS voice_digests (
  recording_id      TEXT PRIMARY KEY NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('idea', 'meeting')),
  recorded_at       TEXT NOT NULL,
  -- Gakky の暦の日付（YYYY-MM-DD）。期間の絞り込みはこちらで行う。
  recorded_date     TEXT NOT NULL,
  duration_ms       INTEGER NOT NULL DEFAULT 0,
  title             TEXT NOT NULL,
  summary_json      TEXT NOT NULL,
  decisions_json    TEXT NOT NULL DEFAULT '[]',
  actions_json      TEXT NOT NULL DEFAULT '[]',
  participants_json TEXT NOT NULL DEFAULT '[]',
  topics_json       TEXT NOT NULL DEFAULT '[]',
  preset            TEXT NOT NULL DEFAULT '',
  content_hash      TEXT NOT NULL,
  imported_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_voice_digests_date ON voice_digests (recorded_date DESC, recorded_at DESC);
