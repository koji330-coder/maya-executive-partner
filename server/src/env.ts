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
  MODEL: string;
  PREFER_FREE: string;
  ALLOW_PAID_FALLBACK: string;
  PAID_DAILY_LIMIT_YEN: string;
}
