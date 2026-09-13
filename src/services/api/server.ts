import * as SecureStore from 'expo-secure-store';

import { apiBaseUrl } from './config';

/**
 * The MAYA server, as the app sees it.
 *
 * When a server address is set, consultations and memory go through the server
 * (`server/`, docs/PLATFORM_ARCHITECTURE.md). When it is empty, the app works as
 * before: it calls Gemini itself and keeps memory on the phone. Clearing the
 * address is the way back.
 *
 * There is deliberately no automatic fallback from one to the other. Falling
 * back when the server is unreachable would split memory in two, with half the
 * decisions on the phone and half on the server, and MAYA remembering whichever
 * half the last request happened to reach.
 */

const URL_KEY = 'maya.server.url';
const ACCESS_ID_KEY = 'maya.server.accessClientId';
const ACCESS_SECRET_KEY = 'maya.server.accessClientSecret';

/** A consultation can include a model call and a retry on a busy model. */
export const SERVER_TIMEOUT_MS = 90_000;
const MEMORY_TIMEOUT_MS = 15_000;

export interface ServerConfig {
  baseUrl: string;
  headers: Record<string, string>;
}

export type ServerErrorKind = 'unreachable' | 'timeout' | 'rejected' | 'bad_reply';

export class ServerError extends Error {
  constructor(
    readonly kind: ServerErrorKind,
    message: string,
    readonly status?: number,
    /** The server's own error kind, when it sent one. */
    readonly serverKind?: string,
  ) {
    super(message);
    this.name = 'ServerError';
  }
}

/**
 * Trims and checks an address typed on a phone keyboard.
 *
 * Returns null for empty, which means "no server". Throws for anything that is
 * not an http(s) address, so a typo is caught when it is saved rather than on
 * the first consultation.
 */
export function normalizeServerUrl(input: string): string | null {
  const value = input.trim().replace(/\/+$/, '');
  if (!value) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ServerError('rejected', 'アドレスの形が正しくありません。http:// か https:// から入力してください。');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ServerError('rejected', 'アドレスは http:// か https:// で始めてください。');
  }
  return value;
}

let cached: ServerConfig | null | undefined;

/** Null when the app should work without a server. Cached until a setting changes. */
export async function getServerConfig(): Promise<ServerConfig | null> {
  if (cached !== undefined) {
    return cached;
  }
  const [stored, accessId, accessSecret] = await Promise.all([
    SecureStore.getItemAsync(URL_KEY),
    SecureStore.getItemAsync(ACCESS_ID_KEY),
    SecureStore.getItemAsync(ACCESS_SECRET_KEY),
  ]);
  const baseUrl = stored?.trim() || apiBaseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    cached = null;
    return cached;
  }
  const headers: Record<string, string> = {};
  // Cloudflare Access service token. Only needed once the server is deployed
  // behind Access (v0.2 step 4); the local dev server has no lock on it.
  if (accessId && accessSecret) {
    headers['CF-Access-Client-Id'] = accessId;
    headers['CF-Access-Client-Secret'] = accessSecret;
  }
  cached = { baseUrl, headers };
  return cached;
}

export async function usingServer(): Promise<boolean> {
  return (await getServerConfig()) !== null;
}

export async function saveServerUrl(input: string): Promise<string | null> {
  const url = normalizeServerUrl(input);
  if (url) {
    await SecureStore.setItemAsync(URL_KEY, url);
  } else {
    await SecureStore.deleteItemAsync(URL_KEY);
  }
  cached = undefined;
  return url;
}

/**
 * The Cloudflare Access service token, for the deployed server.
 *
 * Both halves live in the keychain, like the Gemini keys did. The id alone is
 * not enough to get in, but the pair is, so neither is logged or shown back in
 * full.
 */
export async function saveAccessToken(clientId: string, clientSecret: string): Promise<void> {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (!id || !secret) {
    throw new ServerError('rejected', 'Client ID と Client Secret の両方を入力してください。');
  }
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_ID_KEY, id),
    SecureStore.setItemAsync(ACCESS_SECRET_KEY, secret),
  ]);
  cached = undefined;
}

export async function clearAccessToken(): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(ACCESS_ID_KEY), SecureStore.deleteItemAsync(ACCESS_SECRET_KEY)]);
  cached = undefined;
}

/** Whether a token is stored, and the end of its id so it can be recognised. Never the secret. */
export async function describeAccessToken(): Promise<string | null> {
  const [id, secret] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_ID_KEY),
    SecureStore.getItemAsync(ACCESS_SECRET_KEY),
  ]);
  return id && secret ? `…${id.slice(-6)}` : null;
}

export async function getStoredServerUrl(): Promise<string> {
  return (await SecureStore.getItemAsync(URL_KEY)) ?? '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Calls the server and returns its JSON, or throws a `ServerError` whose message
 * is fit to show the president.
 */
export async function serverRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const config = await getServerConfig();
  if (!config) {
    throw new ServerError('unreachable', 'MAYAサーバーのアドレスが設定されていません。');
  }

  const controller = new AbortController();
  const timeout = options.timeoutMs ?? MEMORY_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener('abort', forwardAbort);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...config.headers,
        ...(options.body !== undefined ? { 'content-type': 'application/json; charset=utf-8' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      // The president pressed cancel. Re-thrown as-is so the caller treats it
      // as a cancel, not as the server being down.
      throw error;
    }
    if (timedOut) {
      throw new ServerError('timeout', 'MAYAサーバーの応答が遅すぎます。しばらく待ってからもう一度お試しください。');
    }
    throw new ServerError(
      'unreachable',
      // Worded for both the PC dev server and the deployed one: the president
      // uses both, and a message about Wi-Fi would mislead him on the second.
      'MAYAサーバーにつながりません。通信状況と、設定のアドレスを確かめてください。PCの開発用サーバーなら、PCで動いているかと、同じWi-Fiにいるかも確かめてください。',
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', forwardAbort);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw toServerError(response.status, data);
  }
  if (data === null) {
    throw new ServerError('bad_reply', 'MAYAサーバーの応答を読めませんでした。');
  }
  return data as T;
}

/** Turns an error body from the server into something to show. */
export function toServerError(status: number, data: unknown): ServerError {
  const error =
    typeof data === 'object' && data !== null && 'error' in data
      ? (data as { error?: { kind?: unknown; message?: unknown } }).error
      : undefined;
  const message = typeof error?.message === 'string' ? error.message : undefined;
  const kind = typeof error?.kind === 'string' ? error.kind : undefined;
  if (status === 401 || status === 403) {
    return new ServerError('rejected', 'MAYAサーバーに入れませんでした。設定の認証情報を確かめてください。', status, kind);
  }
  return new ServerError('rejected', message ?? `MAYAサーバーがエラーを返しました（${status}）。`, status, kind);
}

export interface ServerHealth {
  status: string;
  model: string;
  keys: { free: boolean; paid: boolean };
}

export function checkServer(): Promise<ServerHealth> {
  return serverRequest<ServerHealth>('/health', { timeoutMs: 8_000 });
}
