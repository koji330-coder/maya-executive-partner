import type { ToolCall, ToolDeclaration } from '@/services/llm/geminiClient';

import { presidentDate } from '../clock';
import { invalid, notFound, nowIso } from '../http';
import { likePattern } from './search';

/**
 * VoiceBox（音声メモ・会議録音アプリ）から届く、会話の要約と議事録。
 *
 * ここにあるのは要約だけ。原文と音声は VoiceBox の端末に残り、MAYA には届かない。
 * 書き込みは VoiceBox からの POST だけで、MAYA の道具はすべて読み取り専用。
 */

export const VOICE_SCHEMA_VERSION = 1;
/** 1回の POST で受け取る最大件数。 */
export const VOICE_BATCH_LIMIT = 20;

const MAX_TITLE = 120;
const MAX_LINE = 300;
const MAX_LINES = 20;
const MAX_ACTIONS = 30;
const MAX_NAME = 60;
const RECORDING_ID = /^[A-Za-z0-9._:\-]{1,160}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type VoiceKind = 'idea' | 'meeting';

export interface VoiceAction {
  task: string;
  owner: string;
  due: string;
}

export interface VoiceDigest {
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
}

// ---- 受け取り（検証） -------------------------------------------------------

function textList(value: unknown, label: string, maxItems: number, maxChars: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid(`${label} が配列ではありません。`);
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/g, ' ').trim().slice(0, maxChars))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function actionList(value: unknown): VoiceAction[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid('actions が配列ではありません。');
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      task: typeof item.task === 'string' ? item.task.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE) : '',
      owner: typeof item.owner === 'string' ? item.owner.trim().slice(0, MAX_NAME) : '',
      due: typeof item.due === 'string' ? item.due.trim().slice(0, 40) : '',
    }))
    .filter((item) => item.task.length > 0)
    .slice(0, MAX_ACTIONS);
}

/**
 * VoiceBox から届いた1件を検証して、保存する形にする。
 * 届くものは信用しない入力として、長さ・形をすべて確かめる。
 */
export function readVoiceDigest(input: unknown): VoiceDigest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw invalid('要約が JSON のオブジェクトではありません。');
  }
  const body = input as Record<string, unknown>;

  if (body.schema !== undefined && body.schema !== VOICE_SCHEMA_VERSION) {
    throw invalid(`知らない schema です（${String(body.schema)}）。`);
  }
  const recordingId = typeof body.recordingId === 'string' ? body.recordingId : '';
  if (!RECORDING_ID.test(recordingId)) throw invalid('recordingId が正しくありません。');

  if (body.kind !== 'idea' && body.kind !== 'meeting') throw invalid('kind は idea か meeting です。');

  const recordedAt = typeof body.recordedAt === 'string' ? body.recordedAt : '';
  const recordedMs = Date.parse(recordedAt);
  if (!recordedAt || Number.isNaN(recordedMs)) throw invalid('recordedAt が日時の形ではありません。');

  const recordedDate =
    typeof body.recordedDate === 'string' && body.recordedDate
      ? body.recordedDate
      : presidentDate(recordedMs);
  if (!DATE.test(recordedDate)) throw invalid('recordedDate が YYYY-MM-DD の形ではありません。');

  const title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) : '';
  if (!title) throw invalid('title がありません。');

  const summary = textList(body.summary, 'summary', 5, MAX_LINE);
  if (summary.length === 0) throw invalid('summary が空です。');

  const durationMs = Number(body.durationMs);

  return {
    recordingId,
    kind: body.kind,
    recordedAt: new Date(recordedMs).toISOString(),
    recordedDate,
    durationMs: Number.isFinite(durationMs) && durationMs > 0 ? Math.min(Math.round(durationMs), 24 * 3_600_000) : 0,
    title,
    summary,
    decisions: textList(body.decisions, 'decisions', MAX_LINES, MAX_LINE),
    actions: actionList(body.actions),
    participants: textList(body.participants, 'participants', MAX_LINES, MAX_NAME),
    topics: textList(body.topics, 'topics', MAX_LINES, MAX_LINE),
    preset: typeof body.preset === 'string' ? body.preset.trim().slice(0, 40) : '',
  };
}

/** 保存する内容の指紋。同じなら書き込みを省く。並び順を固定して計算する。 */
export async function contentHash(digest: VoiceDigest): Promise<string> {
  const canonical = JSON.stringify([
    digest.kind,
    digest.recordedAt,
    digest.recordedDate,
    digest.durationMs,
    digest.title,
    digest.summary,
    digest.decisions,
    digest.actions,
    digest.participants,
    digest.topics,
    digest.preset,
  ]);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- 保存・削除 ------------------------------------------------------------

export type UpsertStatus = 'created' | 'updated' | 'unchanged';

export interface UpsertResult {
  recordingId: string;
  status: UpsertStatus;
}

const UPSERT_SQL = `INSERT INTO voice_digests (
  recording_id, kind, recorded_at, recorded_date, duration_ms, title, summary_json,
  decisions_json, actions_json, participants_json, topics_json, preset, content_hash, imported_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(recording_id) DO UPDATE SET
  kind = excluded.kind, recorded_at = excluded.recorded_at, recorded_date = excluded.recorded_date,
  duration_ms = excluded.duration_ms, title = excluded.title, summary_json = excluded.summary_json,
  decisions_json = excluded.decisions_json, actions_json = excluded.actions_json,
  participants_json = excluded.participants_json, topics_json = excluded.topics_json,
  preset = excluded.preset, content_hash = excluded.content_hash, imported_at = excluded.imported_at;`;

/**
 * 要約を保存する。同じ recordingId は上書きで、内容が同じ（指紋が同じ）なら書かない。
 * 書き込みは1回の batch にまとめ、途中の状態を読まれないようにする。
 */
export async function upsertVoiceDigests(
  db: D1Database,
  digests: VoiceDigest[],
  now: string = nowIso(),
): Promise<UpsertResult[]> {
  if (digests.length === 0) throw invalid('要約が1件もありません。');
  if (digests.length > VOICE_BATCH_LIMIT) throw invalid(`一度に送れるのは ${VOICE_BATCH_LIMIT} 件までです。`);

  // 同じ ID が重なったら、後のものを採用する。
  const unique = [...new Map(digests.map((digest) => [digest.recordingId, digest])).values()];
  const hashes = await Promise.all(unique.map(contentHash));

  const placeholders = unique.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT recording_id, content_hash FROM voice_digests WHERE recording_id IN (${placeholders});`)
    .bind(...unique.map((digest) => digest.recordingId))
    .all<{ recording_id: string; content_hash: string }>();
  const existing = new Map(results.map((row) => [row.recording_id, row.content_hash]));

  const statements: D1PreparedStatement[] = [];
  const out: UpsertResult[] = unique.map((digest, index) => {
    const hash = hashes[index] ?? '';
    const before = existing.get(digest.recordingId);
    if (before === hash) return { recordingId: digest.recordingId, status: 'unchanged' as const };
    statements.push(
      db
        .prepare(UPSERT_SQL)
        .bind(
          digest.recordingId,
          digest.kind,
          digest.recordedAt,
          digest.recordedDate,
          digest.durationMs,
          digest.title,
          JSON.stringify(digest.summary),
          JSON.stringify(digest.decisions),
          JSON.stringify(digest.actions),
          JSON.stringify(digest.participants),
          JSON.stringify(digest.topics),
          digest.preset,
          hash,
          now,
        ),
    );
    return { recordingId: digest.recordingId, status: before === undefined ? ('created' as const) : ('updated' as const) };
  });

  if (statements.length > 0) await db.batch(statements);
  return out;
}

export async function deleteVoiceDigest(db: D1Database, recordingId: string): Promise<void> {
  const result = await db.prepare('DELETE FROM voice_digests WHERE recording_id = ?;').bind(recordingId).run();
  if (!result.meta.changes) throw notFound('その録音の要約はありません。');
}

// ---- 読み取り --------------------------------------------------------------

interface VoiceRow {
  recording_id: string;
  kind: VoiceKind;
  recorded_at: string;
  recorded_date: string;
  duration_ms: number;
  title: string;
  summary_json: string;
  decisions_json: string;
  actions_json: string;
  participants_json: string;
  topics_json: string;
  preset: string;
  content_hash: string;
  imported_at: string;
}

function parseList<T>(json: string): T[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export interface StoredVoiceDigest extends VoiceDigest {
  contentHash: string;
  importedAt: string;
}

function fromRow(row: VoiceRow): StoredVoiceDigest {
  return {
    recordingId: row.recording_id,
    kind: row.kind,
    recordedAt: row.recorded_at,
    recordedDate: row.recorded_date,
    durationMs: row.duration_ms,
    title: row.title,
    summary: parseList<string>(row.summary_json),
    decisions: parseList<string>(row.decisions_json),
    actions: parseList<VoiceAction>(row.actions_json),
    participants: parseList<string>(row.participants_json),
    topics: parseList<string>(row.topics_json),
    preset: row.preset,
    contentHash: row.content_hash,
    importedAt: row.imported_at,
  };
}

/** VoiceBox が「送信済みか」を確かめるための一覧。要約の中身は返さない。 */
export async function listVoiceDigestIndex(
  db: D1Database,
  limit = 200,
): Promise<{ recordingId: string; recordedDate: string; title: string; kind: VoiceKind; contentHash: string; importedAt: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT recording_id, recorded_date, title, kind, content_hash, imported_at
       FROM voice_digests ORDER BY recorded_at DESC LIMIT ?;`,
    )
    .bind(Math.min(Math.max(1, Math.floor(limit)), 500))
    .all<Pick<VoiceRow, 'recording_id' | 'recorded_date' | 'title' | 'kind' | 'content_hash' | 'imported_at'>>();
  return results.map((row) => ({
    recordingId: row.recording_id,
    recordedDate: row.recorded_date,
    title: row.title,
    kind: row.kind,
    contentHash: row.content_hash,
    importedAt: row.imported_at,
  }));
}

/** 要約が1件でもあるか。無ければ、道具を相談に出さない。 */
export async function voiceConfigured(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare('SELECT 1 AS found FROM voice_digests LIMIT 1;').first<{ found: number }>();
    return row !== null;
  } catch {
    // マイグレーション前は表が無い。読み取りの失敗で相談を止めない。
    return false;
  }
}

export interface VoiceQuery {
  from?: string;
  to?: string;
  kind?: VoiceKind;
  keywords?: string[];
  limit: number;
}

const SEARCH_COLUMNS = ['title', 'summary_json', 'decisions_json', 'actions_json', 'participants_json', 'topics_json'];

export async function queryVoiceDigests(db: D1Database, query: VoiceQuery): Promise<StoredVoiceDigest[]> {
  const clauses: string[] = [];
  const binds: (string | number)[] = [];
  if (query.from) {
    clauses.push('recorded_date >= ?');
    binds.push(query.from);
  }
  if (query.to) {
    clauses.push('recorded_date <= ?');
    binds.push(query.to);
  }
  if (query.kind) {
    clauses.push('kind = ?');
    binds.push(query.kind);
  }
  for (const keyword of query.keywords ?? []) {
    clauses.push(`(${SEARCH_COLUMNS.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
    SEARCH_COLUMNS.forEach(() => binds.push(likePattern(keyword)));
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { results } = await db
    .prepare(`SELECT * FROM voice_digests ${where} ORDER BY recorded_at DESC LIMIT ?;`)
    .bind(...binds, query.limit)
    .all<VoiceRow>();
  return results.map(fromRow);
}

export async function findVoiceDigest(db: D1Database, recordingId: string): Promise<StoredVoiceDigest | null> {
  const row = await db
    .prepare('SELECT * FROM voice_digests WHERE recording_id = ?;')
    .bind(recordingId)
    .first<VoiceRow>();
  return row ? fromRow(row) : null;
}

async function latestImportedAt(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare('SELECT MAX(imported_at) AS latest FROM voice_digests;')
    .first<{ latest: string | null }>();
  return row?.latest ?? null;
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
  } catch {
    return { error: 'VoiceBox の記録を読めませんでした。少し待ってから、もう一度試してください。' };
  }
}

export async function runVoiceRecentTool(db: D1Database, call: ToolCall, today: string, now?: number) {
  const args = readVoiceRecentArgs(call.args);
  const from = minusDays(today, args.days);
  return readOrFail(async () => {
    const digests = await queryVoiceDigests(db, { from, to: today, kind: args.kind, limit: RECENT_LIMIT });
    const note = freshnessNote(await latestImportedAt(db), now);
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

export async function runVoiceSearchTool(db: D1Database, call: ToolCall, now?: number) {
  const args = readVoiceSearchArgs(call.args);
  return readOrFail(async () => {
    const digests = await queryVoiceDigests(db, { ...args, limit: HIT_LIMIT });
    const note = freshnessNote(await latestImportedAt(db), now);
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

export async function runVoiceDetailTool(db: D1Database, call: ToolCall) {
  const id = typeof call.args.recording_id === 'string' ? call.args.recording_id.trim() : '';
  if (!RECORDING_ID.test(id)) return { error: 'recording_id が正しくありません。voice_recent か voice_search で見つけたものを渡してください。' };
  return readOrFail(async () => {
    const digest = await findVoiceDigest(db, id);
    if (!digest) return { 該当なし: 'その recording_id の会話はありません。', 注意: SOURCE_NOTE };
    return { 会話: full(digest), 注意: SOURCE_NOTE };
  });
}

export async function runVoiceActionsTool(db: D1Database, call: ToolCall, today: string, now?: number) {
  const args = readVoiceRecentArgs(call.args);
  const from = minusDays(today, args.days);
  return readOrFail(async () => {
    const digests = await queryVoiceDigests(db, { from, to: today, kind: args.kind, limit: RECENT_LIMIT * 2 });
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
    const note = freshnessNote(await latestImportedAt(db), now);
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
export async function runVoiceTool(db: D1Database, call: ToolCall, today: string): Promise<unknown> {
  switch (call.name) {
    case VOICE_RECENT_TOOL.name:
      return runVoiceRecentTool(db, call, today);
    case VOICE_SEARCH_TOOL.name:
      return runVoiceSearchTool(db, call);
    case VOICE_DETAIL_TOOL.name:
      return runVoiceDetailTool(db, call);
    case VOICE_ACTIONS_TOOL.name:
      return runVoiceActionsTool(db, call, today);
    default:
      return { error: `知らない道具です: ${call.name}` };
  }
}
