-- VoiceBox は独立したサービスになり、MAYA が読みに行く方式に変わった（0004 の「届いた要約を置く表」は不要）。
-- 表は、まだ本番で使われていない（受け口は公開したが、VoiceBox 側は送信していない）。
DROP INDEX IF EXISTS idx_voice_digests_date;
DROP TABLE IF EXISTS voice_digests;
