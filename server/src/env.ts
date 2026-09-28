import type { AccessEnv } from './access';

export interface Env extends AccessEnv {
  MAYA_DB: D1Database;
  /** Secrets. Set with `wrangler secret put`, or `.dev.vars` locally. */
  GEMINI_API_KEY_FREE?: string;
  GEMINI_API_KEY_PAID?: string;
  /** 32 random bytes, base64. Encrypts keys entered from the app (memory/apiKeys.ts). */
  KEY_ENCRYPTION_KEY?: string;
  /** HAKSAI Central の読み取り専用MCP。URL は秘密ではない（wrangler.jsonc）。 */
  HAKSAI_MCP_URL?: string;
  /** Access のサービストークン。秘密。電話には決して置かない（haksai.ts）。 */
  HAKSAI_MCP_CLIENT_ID?: string;
  HAKSAI_MCP_CLIENT_SECRET?: string;
  /**
   * Keepa をその場で取る入口（haksai-keepa。別のWorker、別のAccessアプリ）。URL は秘密ではない。
   * 未設定なら、取らずに「未取得」と答える。トークンは、読み取り用と同じものを使える。
   * 別のトークンにするときだけ、下の2つを `wrangler secret put` で置く。
   */
  HAKSAI_KEEPA_URL?: string;
  HAKSAI_KEEPA_CLIENT_ID?: string;
  HAKSAI_KEEPA_CLIENT_SECRET?: string;
  /** FIT LOG D1（筋トレ・体組成・食事管理）連携 */
  FITLOG_API_URL?: string;
  FITLOG_API_KEY?: string;
  /** Cloudflare Access を併用する場合のサービストークン（任意） */
  FITLOG_CLIENT_ID?: string;
  FITLOG_CLIENT_SECRET?: string;
  /** VoiceBox の保管庫（別のWorker、別のAccessアプリ）。URL は秘密ではない（wrangler.jsonc）。 */
  VOICEBOX_VAULT_URL?: string;
  /** VoiceBox の窓を読むためのサービストークン（読み取り専用）。秘密。`wrangler secret put` で置く。 */
  VOICEBOX_VAULT_CLIENT_ID?: string;
  VOICEBOX_VAULT_CLIENT_SECRET?: string;
  /** TypeSafe の Jev（道具の判定）。秘密。`wrangler secret put TYPESAFE_API_KEY` で置く。無ければ Jev は使わない。 */
  TYPESAFE_API_KEY?: string;
  /** Jev の経路判定の初期値。off / assist。設定画面で切り替えたら D1 の値が勝つ（memory/settings.ts）。 */
  JEV_ROUTER_MODE?: string;
  MODEL: string;
  /** How much one model round may write. A string because wrangler vars are; unset or invalid means the default. */
  MAX_OUTPUT_TOKENS?: string;
  PREFER_FREE: string;
  ALLOW_PAID_FALLBACK: string;
  PAID_DAILY_LIMIT_YEN: string;
}
