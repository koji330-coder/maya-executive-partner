import { LlmError, type LlmErrorKind } from '@/services/llm/geminiClient';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** A request the server understood and turned down. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly kind: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const invalid = (message: string) => new ApiError(400, 'invalid', message);
export const notFound = (message = '見つかりません。') => new ApiError(404, 'not_found', message);

/** The app already shows these messages; the kind lets it tell them apart. */
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

export function failure(error: unknown): Response {
  if (error instanceof ApiError) {
    return json({ error: { kind: error.kind, message: error.message } }, error.status);
  }
  if (error instanceof LlmError) {
    return json({ error: { kind: error.kind, message: error.message } }, STATUS_BY_KIND[error.kind] ?? 500);
  }
  return json({ error: { kind: 'unknown', message: 'サーバーで処理できませんでした。' } }, 500);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalid('本文が JSON のオブジェクトではありません。');
  }
  return body as Record<string, unknown>;
}

export function str(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
