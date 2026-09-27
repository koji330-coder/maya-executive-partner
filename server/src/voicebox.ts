import type { ToolCall, ToolDeclaration } from '@/services/llm/geminiClient';

import type { Env } from './env';
import { cleanCredential } from './fitlog';

/**
 * VoiceBox（音声メモ・会議録音アプリ）の会話を、MAYA が読みに行く。
 *
 * VoiceBox は独立したサービス（自分の Worker・D1・R2）で、MAYA には何も送ってこない。
 * MAYA は、必要なときだけ、VoiceBox の読み取り専用の窓（GET /v1/maya/*）を読む
 * （FIT LOG や HAKSAI と同じ）。窓が返すのは、採用中の要約・議事録だけ。
 * 原文と音声は、窓の向こうにも出てこない。MAYA の道具はすべて読み取り専用。
 */

const RECORDING_ID = /^[A-Za-z0-9._:\-]{1,160}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUEST_TIMEOUT_MS = 10_000;

export type VoiceKind = 'idea' | 'meeting';

export interface VoiceAction {
  task: string;
  owner: string;
  due: string;
}

export interface StoredVoiceDigest {
  recordingId: string;
  kind: VoiceKind;
  recordedAt: string;
  recordedDate: string;
  durationMs: number;
  title: string;
  summary: string[];
  decisions: string[];
  actions: VoiceAction[];
  participants: string[];
  topics: string[];
  preset: string;
  /** VoiceBox の保管庫に届いた時刻。古いとき、未着かもしれないと伝えるために使う。 */
  importedAt: string;
}

export interface VoiceQuery {
  from?: string;
  to?: string;
  kind?: VoiceKind;
  keywords?: string[];
  limit: number;
}

/** 会話の読み出し元。本番は VoiceBox の窓（vaultSource）。テストでは、偽物に差し替える。 */
export interface VoiceSource {
  list(query: VoiceQuery): Promise<StoredVoiceDigest[]>;
  get(recordingId: string): Promise<StoredVoiceDigest | null>;
  /** 最後に届いた時刻。無ければ null。 */
  latestImportedAt(): Promise<string | null>;
}

export class VoiceboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceboxError';
  }
}

/** VoiceBox への接続設定が揃っているか。揃うまで、道具は相談に出さない。 */
export function voiceConfigured(env: Env): boolean {
  return Boolean(env.VOICEBOX_VAULT_URL && env.VOICEBOX_VAULT_CLIENT_ID && env.VOICEBOX_VAULT_CLIENT_SECRET);
}

export function refusalHint(status: number): string {
  if (status === 401 || status === 403) return 'VoiceBox に入れませんでした（Cloudflare Access の認証）。トークンを確認してください。';
  if (status === 404) return 'VoiceBox の記録が見つかりません。';
  return `VoiceBox がエラー（HTTP ${status}）を返しました。`;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** 窓が返した1件を、道具が使う形にする。信用しない入力として、型を確かめる。 */
export function readConversation(input: unknown): StoredVoiceDigest | null {
  if (typeof input !== 'object' || input === null) return null;
  const item = input as Record<string, unknown>;
  const recordingId = typeof item.recordingId === 'string' ? item.recordingId : '';
  if (!RECORDING_ID.test(recordingId)) return null;
  if (item.kind !== 'idea' && item.kind !== 'meeting') return null;
  const strings = (value: unknown) => list<unknown>(value).filter((v): v is string => typeof v === 'string');
  return {
    recordingId,
    kind: item.kind,
    recordedAt: typeof item.recordedAt === 'string' ? item.recordedAt : '',
    recordedDate: typeof item.recordedDate === 'string' && DATE.test(item.recordedDate) ? item.recordedDate : '',
    durationMs: Number.isFinite(Number(item.durationMs)) ? Number(item.durationMs) : 0,
    title: typeof item.title === 'string' ? item.title : '',
    summary: strings(item.summary),
    decisions: strings(item.decisions),
    actions: list<Record<string, unknown>>(item.actions)
      .filter((a) => typeof a === 'object' && a !== null && typeof a.task === 'string')
      .map((a) => ({
        task: String(a.task),
        owner: typeof a.owner === 'string' ? a.owner : '',
        due: typeof a.due === 'string' ? a.due : '',
      })),
    participants: strings(item.participants),
    topics: strings(item.topics),
    preset: typeof item.preset === 'string' ? item.preset : '',
    importedAt: typeof item.importedAt === 'string' ? item.importedAt : '',
  };
}

/** VoiceBox の読み取り専用の窓を読む。別の Worker・別の Access アプリなので、専用のサービストークンで入る。 */
export function vaultSource(env: Env, fetchImpl: FetchLike = fetch): VoiceSource {
  if (!voiceConfigured(env)) throw new VoiceboxError('VoiceBox への接続が設定されていません。');
  const base = String(env.VOICEBOX_VAULT_URL).trim().replace(/\/+$/, '');
  const headers = {
    Accept: 'application/json',
    'CF-Access-Client-Id': cleanCredential(String(env.VOICEBOX_VAULT_CLIENT_ID)),
    'CF-Access-Client-Secret': cleanCredential(String(env.VOICEBOX_VAULT_CLIENT_SECRET)),
  };

  async function read(path: string): Promise<{ status: number; body: unknown }> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new VoiceboxError('VoiceBox につながりませんでした。');
    }
    // Access が認証を求めて別のページへ飛ばすとき（リダイレクト）も、入れなかったものとして扱う。
    if (response.status >= 300 && response.status < 400) throw new VoiceboxError(refusalHint(403));
    if (response.status === 404) return { status: 404, body: undefined };
    if (!response.ok) throw new VoiceboxError(refusalHint(response.status));
    const body: unknown = await response.json().catch(() => undefined);
    if (body === undefined) throw new VoiceboxError('VoiceBox の応答を読めませんでした。');
    return { status: response.status, body };
  }

  return {
    async list(query) {
      const params = new URLSearchParams();
      if (query.from) params.set('from', query.from);
      if (query.to) params.set('to', query.to);
      if (query.kind) params.set('kind', query.kind);
      for (const keyword of query.keywords ?? []) params.append('q', keyword);
      params.set('limit', String(query.limit));
      const { body } = await read(`/v1/maya/conversations?${params.toString()}`);
      const conversations = (body as { conversations?: unknown })?.conversations;
      return list<unknown>(conversations).flatMap((item) => {
        const conversation = readConversation(item);
        return conversation ? [conversation] : [];
      });
    },
    async get(recordingId) {
      const { status, body } = await read(`/v1/maya/conversations/${encodeURIComponent(recordingId)}`);
      if (status === 404) return null;
      return readConversation((body as { conversation?: unknown })?.conversation);
    },
    async latestImportedAt() {
      const { body } = await read('/v1/maya/freshness');
      const latest = (body as { latestImportedAt?: unknown })?.latestImportedAt;
      return typeof latest === 'string' ? latest : null;
    },
  };
}

// ---- MAYA の道具（読み取り専用） -------------------------------------------

/** 音声メモ・会議録音の話が出たか。強い語だけで判定し、「会議」一般の話では強制しない。 */
export function refersToVoice(message: string): boolean {
  return /議事録|録音|ボイスメモ|音声メモ|VoiceBox|ボイスボックス|(会議|打ち合わせ|打合せ|商談|ミーティング|セミナー)(で|の中で)(話|決|言)|さっきの(会議|打ち合わせ|商談|話)/i.test(
    message,
  );
}

const RECENT_DEFAULT_DAYS = 14;
const MAX_DAYS = 90;
const HIT_LIMIT = 8;
const RECENT_LIMIT = 15;
const ACTIONS_LIMIT = 40;
const STALE_HOURS = 48;
const KIND_LABEL: Record<VoiceKind, string> = { idea: 'アイデア', meeting: '会議' };

const KIND_ARG = {
  type: 'string',
  enum: ['idea', 'meeting'],
  description: 'idea（ひとりの音声メモ）か meeting（会議・商談・セミナー）。省略するとどちらも。',
};

export const VOICE_RECENT_TOOL: ToolDeclaration = {
  name: 'voice_recent',
  description:
    'VoiceBox（音声メモ・会議録音アプリ）に残っている、最近の会話の一覧を、題名・要点・参加者で調べます。' +
    '「最近の会議は？」「今週どんな話をした？」という相談で使います。要約と議事録だけで、原文・音声は持っていません。読み取り専用です。',
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'number', description: `さかのぼる日数。1〜${MAX_DAYS}。既定${RECENT_DEFAULT_DAYS}日。` },
      kind: KIND_ARG,
    },
  },
};

export const VOICE_SEARCH_TOOL: ToolDeclaration = {
  name: 'voice_search',
  description:
    'VoiceBox の会話の要約・議事録から、語で探します（題名、要点、決定事項、やること、参加者、論点が対象）。' +
    '「〇〇の件は何と決めた？」「あの商談で何が出た？」という相談で使います。読み取り専用です。',
  parameters: {
    type: 'object',
    properties: {
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: '探す語。すべて含む会話を返します。「価格」「A社」のような短い語に分けてください。',
      },
      from: { type: 'string', description: 'この日以降（YYYY-MM-DD）。省略可。' },
      to: { type: 'string', description: 'この日まで（YYYY-MM-DD）。省略可。' },
      kind: KIND_ARG,
    },
  },
};

export const VOICE_DETAIL_TOOL: ToolDeclaration = {
  name: 'voice_detail',
  description:
    'VoiceBox の会話1件の、要点・決定事項・やること・参加者・論点を、すべて調べます。' +
    'voice_recent か voice_search で見つけた会話の recording_id を渡します。読み取り専用です。',
  parameters: {
    type: 'object',
    properties: { recording_id: { type: 'string', description: '見つけた会話の recording_id。' } },
    required: ['recording_id'],
  },
};

export const VOICE_ACTIONS_TOOL: ToolDeclaration = {
  name: 'voice_actions',
  description:
    'VoiceBox の会話から出た「やること」を、期間でまとめて調べます。担当・期限も返します。' +
    '「会議で出たやることは？」「宿題は？」という相談で使います。完了したかどうかの記録はありません。読み取り専用です。',
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'number', description: `さかのぼる日数。1〜${MAX_DAYS}。既定${RECENT_DEFAULT_DAYS}日。` },
      kind: KIND_ARG,
    },
  },
};

export const VOICE_TOOLS: ToolDeclaration[] = [
  VOICE_RECENT_TOOL,
  VOICE_SEARCH_TOOL,
  VOICE_DETAIL_TOOL,
  VOICE_ACTIONS_TOOL,
];

const isDate = (value: unknown): value is string => typeof value === 'string' && DATE.test(value);

function readDays(value: unknown): number {
  const days = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : RECENT_DEFAULT_DAYS;
  return Math.min(Math.max(1, days), MAX_DAYS);
}

function readKind(value: unknown): VoiceKind | undefined {
  return value === 'idea' || value === 'meeting' ? value : undefined;
}

/** YYYY-MM-DD から日数を引く（暦の計算だけ。時刻・時差は扱わない）。 */
export function minusDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

export interface VoiceRecentArgs {
  days: number;
  kind?: VoiceKind;
}

export function readVoiceRecentArgs(args: Record<string, unknown>): VoiceRecentArgs {
  const kind = readKind(args.kind);
  return { days: readDays(args.days), ...(kind ? { kind } : {}) };
}

export interface VoiceSearchArgs {
  keywords: string[];
  from?: string;
  to?: string;
  kind?: VoiceKind;
}

export function readVoiceSearchArgs(args: Record<string, unknown>): VoiceSearchArgs {
  const keywords = Array.isArray(args.keywords)
    ? args.keywords
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const kind = readKind(args.kind);
  return {
    keywords,
    ...(isDate(args.from) ? { from: args.from } : {}),
    ...(isDate(args.to) ? { to: args.to } : {}),
    ...(kind ? { kind } : {}),
  };
}

const SOURCE_NOTE = '持っているのは、VoiceBox で採用した要約と議事録だけです。原文（文字起こし）と音声は持っていません。記録に無いことを作らないでください。';

/** 最後の取り込みが古いとき、それより新しい会話が未着かもしれないと伝える。 */
export function freshnessNote(latest: string | null, now: number = Date.now()): string | undefined {
  if (!latest) return undefined;
  const ageHours = (now - Date.parse(latest)) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < STALE_HOURS) return undefined;
  return `最後に取り込んだのは ${Math.floor(ageHours / 24)} 日前です。それより新しい会話は、まだ届いていない可能性があります。`;
}

function brief(digest: StoredVoiceDigest) {
  return {
    recording_id: digest.recordingId,
    日付: digest.recordedDate,
    種類: KIND_LABEL[digest.kind],
    題名: digest.title,
    要点: digest.summary,
    ...(digest.participants.length ? { 参加者: digest.participants } : {}),
  };
}

function full(digest: StoredVoiceDigest) {
  return {
    ...brief(digest),
    長さ分: Math.round(digest.durationMs / 60_000),
    決定事項: digest.decisions,
    やること: digest.actions.map((a) => ({
      内容: a.task,
      ...(a.owner ? { 担当: a.owner } : {}),
      ...(a.due ? { 期限: a.due } : {}),
    })),
    論点: digest.topics,
    取り込み日時: digest.importedAt,
  };
}

async function readOrFail<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (error) {
    const reason = error instanceof VoiceboxError ? `（${error.message}）` : '';
    return { error: `VoiceBox の記録を読めませんでした${reason}。少し待ってから、もう一度試してください。` };
  }
}

export async function runVoiceRecentTool(source: VoiceSource, call: ToolCall, today: string, now?: number) {
  const args = readVoiceRecentArgs(call.args);
  const from = minusDays(today, args.days);
  return readOrFail(async () => {
    const digests = await source.list( { from, to: today, kind: args.kind, limit: RECENT_LIMIT });
    const note = freshnessNote(await source.latestImportedAt(), now);
    return {
      期間: { from, to: today },
      件数: digests.length,
      会話: digests.map(brief),
      ...(digests.length === 0 ? { 該当なし: 'この期間の会話は、VoiceBox から届いていません。' } : {}),
      ...(note ? { 鮮度の注意: note } : {}),
      注意: SOURCE_NOTE,
    };
  });
}

export async function runVoiceSearchTool(source: VoiceSource, call: ToolCall, now?: number) {
  const args = readVoiceSearchArgs(call.args);
  return readOrFail(async () => {
    const digests = await source.list( { ...args, limit: HIT_LIMIT });
    const note = freshnessNote(await source.latestImportedAt(), now);
    return {
      探した条件: args,
      件数: digests.length,
      会話: digests.map(brief),
      ...(digests.length === 0
        ? { 該当なし: '該当する会話はありませんでした。語を変えるか、期間を広げて、もう一度だけ探せます。' }
        : {}),
      ...(note ? { 鮮度の注意: note } : {}),
      注意: SOURCE_NOTE,
    };
  });
}

export async function runVoiceDetailTool(source: VoiceSource, call: ToolCall) {
  const id = typeof call.args.recording_id === 'string' ? call.args.recording_id.trim() : '';
  if (!RECORDING_ID.test(id)) return { error: 'recording_id が正しくありません。voice_recent か voice_search で見つけたものを渡してください。' };
  return readOrFail(async () => {
    const digest = await source.get(id);
    if (!digest) return { 該当なし: 'その recording_id の会話はありません。', 注意: SOURCE_NOTE };
    return { 会話: full(digest), 注意: SOURCE_NOTE };
  });
}

export async function runVoiceActionsTool(source: VoiceSource, call: ToolCall, today: string, now?: number) {
  const args = readVoiceRecentArgs(call.args);
  const from = minusDays(today, args.days);
  return readOrFail(async () => {
    const digests = await source.list( { from, to: today, kind: args.kind, limit: RECENT_LIMIT * 2 });
    const items = digests.flatMap((digest) =>
      digest.actions.map((action) => ({
        日付: digest.recordedDate,
        会話: digest.title,
        種類: KIND_LABEL[digest.kind],
        recording_id: digest.recordingId,
        内容: action.task,
        ...(action.owner ? { 担当: action.owner } : {}),
        ...(action.due ? { 期限: action.due } : {}),
      })),
    );
    const note = freshnessNote(await source.latestImportedAt(), now);
    return {
      期間: { from, to: today },
      件数: Math.min(items.length, ACTIONS_LIMIT),
      やること: items.slice(0, ACTIONS_LIMIT),
      ...(items.length === 0 ? { 該当なし: 'この期間の会話から出た「やること」はありません。' } : {}),
      完了の記録: 'ありません。完了したかどうかは分からないので、決めつけないでください。',
      ...(note ? { 鮮度の注意: note } : {}),
      注意: SOURCE_NOTE,
    };
  });
}

/** モデルの道具呼び出しを実行する。知らない道具は、投げずに返す。 */
export async function runVoiceTool(source: VoiceSource, call: ToolCall, today: string): Promise<unknown> {
  switch (call.name) {
    case VOICE_RECENT_TOOL.name:
      return runVoiceRecentTool(source, call, today);
    case VOICE_SEARCH_TOOL.name:
      return runVoiceSearchTool(source, call);
    case VOICE_DETAIL_TOOL.name:
      return runVoiceDetailTool(source, call);
    case VOICE_ACTIONS_TOOL.name:
      return runVoiceActionsTool(source, call, today);
    default:
      return { error: `知らない道具です: ${call.name}` };
  }
}
