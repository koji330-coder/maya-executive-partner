import { MAYA_RESPONSE_SCHEMA } from '@/features/chat/responseSchema';

export type LlmErrorKind =
  | 'no_key'
  | 'auth'
  | 'quota'
  | 'rate_limit'
  | 'safety'
  | 'bad_response'
  | 'network'
  | 'server'
  | 'limit_reached'
  | 'unknown';

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/**
 * Only a rate limit is worth retrying on the other key. An auth failure, a
 * refusal, a malformed reply or a network problem will fail the same way twice,
 * and spending money to prove that is the wrong trade.
 */
export function eligibleForPaidRetry(error: unknown): boolean {
  return error instanceof LlmError && (error.kind === 'rate_limit' || error.kind === 'quota');
}

export const DEFAULT_MODEL = 'gemini-3.8-flash';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface ChatExchange {
  role: 'user' | 'maya';
  text: string;
}

export interface GenerateOptions {
  apiKey: string;
  systemPrompt: string;
  history: ChatExchange[];
  message: string;
  model?: string;
  signal?: AbortSignal;
}

export interface GenerateResult {
  /** The raw parsed JSON. It still has to go through the response validator. */
  payload: unknown;
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
}

function describeHttpError(status: number, body: unknown): LlmError {
  const message =
    typeof body === 'object' && body !== null && 'error' in body
      ? String((body as { error?: { message?: string } }).error?.message ?? '')
      : '';

  if (status === 400 && /api key/i.test(message)) {
    return new LlmError('auth', 'APIキーが正しくありません。設定を確認してください。', status);
  }
  if (status === 401 || status === 403) {
    return new LlmError(
      'auth',
      'APIキーが拒否されました。キーの状態と、プロジェクトの利用条件を確認してください。',
      status,
    );
  }
  if (status === 429) {
    return new LlmError(
      'rate_limit',
      '無料枠の上限に達しました。しばらく待つか、設定で有料キーへの切り替えを許可してください。',
      status,
    );
  }
  if (status >= 500) {
    return new LlmError('server', 'モデル側で問題が起きています。少し待ってからもう一度お試しください。', status);
  }
  return new LlmError('unknown', message || `応答を取得できませんでした（HTTP ${status}）。`, status);
}

/**
 * One turn against Gemini, returning the parsed JSON without judging it.
 *
 * Note on architecture: `docs/TECH_ARCHITECTURE.md` §9 says not to call model
 * providers from the client in production. This calls Google directly with a key
 * the user supplied and the device keychain holds, which is the Voicebox pattern
 * and is deliberate for a single-operator build. It is not the shape to ship if
 * MAYA is ever distributed; see `docs/LLM_INTEGRATION.md`.
 */
export async function generateMayaResponse(options: GenerateOptions): Promise<GenerateResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const contents = [
    ...options.history.map((turn) => ({
      role: turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.text }],
    })),
    { role: 'user', parts: [{ text: options.message }] },
  ];

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': options.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.systemPrompt }] },
        contents,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: MAYA_RESPONSE_SCHEMA,
          temperature: 0.8,
          // A consultation answer needs a few hundred tokens. The cap is here so
          // a model that starts repeating itself stops cheaply instead of
          // running to the ceiling and returning JSON cut off mid-string, which
          // is a failure this actually hit in testing.
          maxOutputTokens: 2048,
        },
      }),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    throw new LlmError('network', '通信できませんでした。接続を確認してもう一度お試しください。');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw describeHttpError(response.status, body);
  }

  const candidate = (body as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] })
    ?.candidates?.[0];
  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
    throw new LlmError('safety', 'この内容には回答できないと判断されました。表現を変えてお試しください。');
  }
  if (candidate?.finishReason === 'MAX_TOKENS') {
    // Say what happened. Truncated JSON would otherwise surface as a parse
    // error, which sends the reader looking in the wrong place.
    throw new LlmError('bad_response', '応答が長くなりすぎて途中で切れました。もう一度お試しください。');
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    throw new LlmError('bad_response', '応答が空でした。もう一度お試しください。');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new LlmError('bad_response', '応答の形式が壊れていました。もう一度お試しください。');
  }

  const usage = (body as { usageMetadata?: Record<string, number> })?.usageMetadata ?? {};
  return {
    payload,
    promptTokens: usage.promptTokenCount ?? 0,
    responseTokens: usage.candidatesTokenCount ?? 0,
    totalTokens: usage.totalTokenCount ?? 0,
  };
}
