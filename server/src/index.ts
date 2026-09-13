import { LlmError, type LlmErrorKind } from '@/services/llm/geminiClient';

import { answer, parseChatRequest } from './chat';
import type { Env } from './env';

/**
 * The MAYA server.
 *
 * The app talks to this and nothing else (docs/PLATFORM_ARCHITECTURE.md). In
 * production it sits behind Cloudflare Access, so an unauthenticated request is
 * turned away before it reaches this code; the checks here are about the request
 * being well-formed, not about who sent it.
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** The app already shows `LlmError` messages; the kind lets it tell them apart. */
const STATUS_BY_KIND: Partial<Record<LlmErrorKind, number>> = {
  no_key: 503,
  auth: 502,
  quota: 429,
  rate_limit: 429,
  limit_reached: 429,
  safety: 422,
  bad_response: 400,
  network: 502,
  server: 503,
};

function failure(error: unknown): Response {
  if (error instanceof LlmError) {
    return json({ error: { kind: error.kind, message: error.message } }, STATUS_BY_KIND[error.kind] ?? 500);
  }
  return json({ error: { kind: 'unknown', message: 'サーバーで処理できませんでした。' } }, 500);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      // Says which keys exist, never what they are.
      return json({
        status: 'ok',
        model: env.MODEL,
        keys: { free: Boolean(env.GEMINI_API_KEY_FREE), paid: Boolean(env.GEMINI_API_KEY_PAID) },
      });
    }

    if (request.method === 'POST' && url.pathname === '/v1/chat') {
      try {
        const body: unknown = await request.json().catch(() => null);
        return json(await answer(env, parseChatRequest(body)));
      } catch (error) {
        return failure(error);
      }
    }

    return json({ error: { kind: 'not_found', message: 'Not found' } }, 404);
  },
} satisfies ExportedHandler<Env>;
