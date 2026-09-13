export interface Env {
  MAYA_DB: D1Database;
  /** Secrets. Set with `wrangler secret put`, or `.dev.vars` locally. */
  GEMINI_API_KEY_FREE?: string;
  GEMINI_API_KEY_PAID?: string;
  MODEL: string;
  PREFER_FREE: string;
  ALLOW_PAID_FALLBACK: string;
  PAID_DAILY_LIMIT_YEN: string;
}
