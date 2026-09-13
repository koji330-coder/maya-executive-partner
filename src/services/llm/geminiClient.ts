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

/**
 * The default model.
 *
 * A newer flagship is not automatically the right default: a brand-new free-tier
 * key can be refused or throttled on one while an older model answers fine.
 * `MODEL_CHOICES` is what the settings screen offers, and `checkApiKey` reports
 * which of them the key can actually reach.
 */
export const DEFAULT_MODEL = 'gemini-3.6-flash';

/**
 * What the settings screen offers.
 *
 * Availability depends on the key, not just the model. `gemini-2.5-flash` is not
 * offered at all: Google returns NOT_FOUND for it on keys created recently, with
 * a message pointing at 3.6. A newly created free key therefore cannot use the
 * older models that work on an older project, which is easy to miss when testing
 * with a key you already had.
 *
 * Measured on 2026-09-11, three consultation turns each:
 *   3.6-flash       about 9s a turn. Does the arithmetic, which is the point
 *   3.5-flash-lite  about 2s a turn. Directionally right but skips the numbers
 *   3.8-flash       newest, and the one that returned 503 on a fresh free key
 */
export const MODEL_CHOICES = [
  { id: 'gemini-3.6-flash', label: '3.6 Flash', note: '既定。数字を検算する。約9秒' },
  { id: 'gemini-3.5-flash', label: '3.5 Flash', note: '中間' },
  { id: 'gemini-3.5-flash-lite', label: '3.5 Flash Lite', note: '約2秒。数字は弱い' },
  { id: 'gemini-3.8-flash', label: '3.8 Flash', note: '最新。無料枠では混みやすい' },
] as const;

/** How long to wait before giving up on one turn. */
export const REQUEST_TIMEOUT_MS = 45_000;

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface ChatExchange {
  role: 'user' | 'maya';
  text: string;
}

/** An image or text file sent with the question. */
export interface RequestAttachment {
  kind: 'image' | 'text';
  name: string;
  mimeType: string;
  data: string;
}

/** A function the model may call, in Gemini's declaration format. */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GenerateOptions {
  apiKey: string;
  systemPrompt: string;
  history: ChatExchange[];
  message: string;
  attachments?: RequestAttachment[];
  model?: string;
  signal?: AbortSignal;
  /** Offered to the model. Only the server passes these; it is the one with the data. */
  tools?: ToolDeclaration[];
  /** Runs a call the model made. Its return value goes back to the model as the result. */
  runTool?: (call: ToolCall) => Promise<unknown>;
}

export interface GenerateResult {
  /** The raw parsed JSON. It still has to go through the response validator. */
  payload: unknown;
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
  /** The tools the model called on the way to this answer, in order. */
  toolCalls: ToolCall[];
}

/**
 * How many rounds of tool calls one turn may take before the model must answer.
 *
 * Each round is another full request, measured at three to four times a plain
 * turn. Two lets her search, then narrow once; past that she is looping.
 */
export const MAX_TOOL_ROUNDS = 2;

function describeHttpError(status: number, body: unknown): LlmError {
  const error =
    typeof body === 'object' && body !== null && 'error' in body
      ? (body as { error?: { message?: string; status?: string } }).error
      : undefined;
  const message = String(error?.message ?? '');
  // Google's own wording, trimmed. An opaque "something went wrong" hides
  // whether the key is rejected, the quota is spent, or the service is down,
  // and the user is the only one who can see this screen.
  const detail = message ? `（${error?.status ?? status}: ${message.slice(0, 160)}）` : `（HTTP ${status}）`;

  if (status === 400 && /api key/i.test(message)) {
    return new LlmError('auth', `APIキーが正しくありません。設定を確認してください。${detail}`, status);
  }
  if (status === 401 || status === 403) {
    return new LlmError(
      'auth',
      `APIキーが拒否されました。キーの状態と、プロジェクトの利用条件を確認してください。${detail}`,
      status,
    );
  }
  if (status === 429) {
    return new LlmError(
      'rate_limit',
      `無料枠の上限に達しました。しばらく待つか、設定で有料キーへの切り替えを許可してください。${detail}`,
      status,
    );
  }
  if (status === 503) {
    return new LlmError('server', `モデルが混み合っています。少し待ってお試しください。${detail}`, status);
  }
  if (status >= 500) {
    return new LlmError(
      'server',
      `モデル側が応答を返せませんでした。${detail}`,
      status,
    );
  }
  return new LlmError('unknown', `応答を取得できませんでした。${detail}`, status);
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
  // Attachments ride with the current question only. Re-sending them on every
  // later turn would multiply the cost for no gain; what MAYA concluded from
  // them is already in her replies.
  const parts: Record<string, unknown>[] = [{ text: options.message }];
  for (const attachment of options.attachments ?? []) {
    if (attachment.kind === 'image') {
      parts.push({ inlineData: { mimeType: attachment.mimeType, data: attachment.data } });
    } else {
      parts.push({ text: `

--- 添付: ${attachment.name} ---
${attachment.data}` });
    }
  }

  const contents: Record<string, unknown>[] = [
    ...options.history.map((turn) => ({
      role: turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.text }],
    })),
    { role: 'user', parts },
  ];

  const usage = { prompt: 0, response: 0, total: 0 };
  const toolCalls: ToolCall[] = [];
  const canUseTools = Boolean(options.tools?.length && options.runTool);

  for (let round = 0; ; round += 1) {
    // After the last allowed round the tools are withdrawn, so the model has no
    // way left but to answer with what it found.
    const offerTools = canUseTools && round < MAX_TOOL_ROUNDS;
    const body = await postGenerate(model, options, {
      systemInstruction: { parts: [{ text: options.systemPrompt }] },
      contents,
      ...(offerTools ? { tools: [{ functionDeclarations: options.tools }] } : {}),
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
    });

    const metadata = (body as { usageMetadata?: Record<string, number> })?.usageMetadata ?? {};
    usage.prompt += metadata.promptTokenCount ?? 0;
    usage.response += metadata.candidatesTokenCount ?? 0;
    usage.total += metadata.totalTokenCount ?? 0;

    const candidate = (
      body as {
        candidates?: {
          content?: { role?: string; parts?: { text?: string; functionCall?: ToolCall }[] };
          finishReason?: string;
        }[];
      }
    )?.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
      throw new LlmError('safety', 'この内容には回答できないと判断されました。表現を変えてお試しください。');
    }
    if (candidate?.finishReason === 'MAX_TOKENS') {
      // Say what happened. Truncated JSON would otherwise surface as a parse
      // error, which sends the reader looking in the wrong place.
      throw new LlmError('bad_response', '応答が長くなりすぎて途中で切れました。もう一度お試しください。');
    }

    const calls = (candidate?.content?.parts ?? [])
      .map((part) => part.functionCall)
      .filter((call): call is ToolCall => Boolean(call?.name));
    if (calls.length > 0 && offerTools && options.runTool) {
      // The model's turn goes back exactly as it came. Gemini 3 attaches thought
      // signatures to it, and a rebuilt turn without them is rejected.
      contents.push(candidate?.content as Record<string, unknown>);
      const results = await Promise.all(
        calls.map(async (call) => {
          toolCalls.push({ name: call.name, args: call.args ?? {} });
          let result: unknown;
          try {
            result = await options.runTool!({ name: call.name, args: call.args ?? {} });
          } catch (error) {
            // Told to the model rather than thrown: a failed search should make
            // her say she could not look, not lose the whole consultation.
            result = { error: error instanceof Error ? error.message : '道具の実行に失敗しました。' };
          }
          return { functionResponse: { name: call.name, response: { result } } };
        }),
      );
      contents.push({ role: 'user', parts: results });
      continue;
    }

    const text = candidate?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
    if (!text) {
      throw new LlmError('bad_response', '応答が空でした。もう一度お試しください。');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new LlmError('bad_response', '応答の形式が壊れていました。もう一度お試しください。');
    }

    return {
      payload,
      promptTokens: usage.prompt,
      responseTokens: usage.response,
      totalTokens: usage.total,
      toolCalls,
    };
  }
}

/** One request to Gemini, with the deadline and error mapping every round needs. */
async function postGenerate(
  model: string,
  options: GenerateOptions,
  requestBody: Record<string, unknown>,
): Promise<unknown> {
  // The caller's signal and a deadline both have to be able to end the request.
  // Without the deadline a stalled turn sits on "考えています…" indefinitely.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onCallerAbort);

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': options.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (options.signal?.aborted) {
        throw error;
      }
      throw new LlmError(
        'network',
        `応答が${Math.round(REQUEST_TIMEOUT_MS / 1000)}秒待っても返らなかったので中断しました。設定でモデルを軽いものに変えると通ることがあります。`,
      );
    }
    throw new LlmError('network', '通信できませんでした。接続を確認してもう一度お試しください。');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw describeHttpError(response.status, body);
  }
  return body;
}

export interface KeyCheckResult {
  ok: boolean;
  detail: string;
  /** Which of `MODEL_CHOICES` this key can list. Empty when the listing failed. */
  availableModels: string[];
}

/**
 * The smallest real call that proves a key works.
 *
 * A key can be present and still be refused, out of quota, or attached to a
 * project without access. Finding that out by composing a consultation and
 * watching it fail is a poor way to learn it, so this asks the model for one
 * word and reports what came back.
 */
export async function checkApiKey(apiKey: string, model = DEFAULT_MODEL): Promise<KeyCheckResult> {
  const availableModels = await listUsableModels(apiKey);
  try {
    const response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ok とだけ返してください。' }] }],
        generationConfig: { maxOutputTokens: 16, temperature: 0 },
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = describeHttpError(response.status, body);
      return { ok: false, detail: error.message, availableModels };
    }
    const usage = (body as { usageMetadata?: { totalTokenCount?: number } })?.usageMetadata;
    return {
      ok: true,
      detail: `疎通しました（${model} / ${usage?.totalTokenCount ?? 0} トークン）。`,
      availableModels,
    };
  } catch {
    return { ok: false, detail: '通信できませんでした。接続を確認してください。', availableModels };
  }
}

/**
 * Which of the offered models this key can see.
 *
 * Listing is free and answers the question a failed consultation cannot: whether
 * the model is simply not available to this key.
 */
async function listUsableModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch(`${ENDPOINT}?pageSize=200`, {
      headers: { 'x-goog-api-key': apiKey },
    });
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const names = new Set(
      (body.models ?? [])
        .filter((entry) => entry.supportedGenerationMethods?.includes('generateContent'))
        .map((entry) => (entry.name ?? '').replace('models/', '')),
    );
    return MODEL_CHOICES.map((choice) => choice.id).filter((id) => names.has(id));
  } catch {
    return [];
  }
}
