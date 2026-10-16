import type { ToolCall, ToolDeclaration } from '@/services/llm/geminiClient';

import type { Env } from './env';
import { cleanCredential } from './fitlog';

/**
 * うたログ（Gakky のカラオケ履歴アプリ）を、MAYA が読みに行く。
 *
 * うたログは独立したサービス（自分の Worker と D1）で、MAYA には何も送ってこない。
 * MAYA は、必要なときだけ、うたログの読み取り専用の窓（GET /v1/maya/*）を読む
 * （VoiceBox や FIT LOG と同じ）。窓が返すのは、うたログ側で組み立てた要約で、
 * 書き込みの経路はない。入るのは、専用の Access アプリのサービストークン。
 * 窓の仕様は、うたログのリポジトリの docs/MAYA_WINDOW.md。
 */

const SONG_ID = /^[A-Za-z0-9._:\-]{1,160}$/;
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const RECENT_LIMIT = 30;
const SEARCH_LIMIT = 15;
const FORGOTTEN_LIMIT = 15;

export class KaraokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KaraokeError';
  }
}

/** うたログへの接続設定が揃っているか。揃うまで、道具は相談に出さない。 */
export function karaokeConfigured(env: Env): boolean {
  return Boolean(env.KARAOKE_URL && env.KARAOKE_CLIENT_ID && env.KARAOKE_CLIENT_SECRET);
}

/** カラオケの話が出たか。強い語だけで判定する（「歌」一般は含めない）。 */
export function refersToKaraoke(message: string): boolean {
  return /カラオケ|ヒトカラ|うたログ|歌スキ|うたスキ|JOYSOUND|ジョイサウンド|採点|選曲|十八番|オハコ|何を歌|次に歌|歌った(曲|歌)|歌いたい|歌えそう|(曲|歌)を(提案|おすすめ|勧め)/i.test(
    message,
  );
}

export function refusalHint(status: number): string {
  if (status === 401 || status === 403) return 'うたログに入れませんでした（Cloudflare Access の認証）。トークンを確認してください。';
  if (status === 404) return 'うたログの記録が見つかりません。';
  return `うたログがエラー（HTTP ${status}）を返しました。`;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** うたログの窓の読み出し元。本番は窓（karaokeSource）。テストでは、偽物に差し替える。 */
export interface KaraokeSource {
  /** 窓の GET。`path` は /v1/maya より後ろ。404 は null。 */
  get(path: string, params?: Record<string, string | number | undefined>): Promise<unknown | null>;
}

export function karaokeSource(env: Env, fetchImpl: FetchLike = fetch): KaraokeSource {
  if (!karaokeConfigured(env)) throw new KaraokeError('うたログへの接続が設定されていません。');
  const base = String(env.KARAOKE_URL).trim().replace(/\/+$/, '');
  const headers = {
    Accept: 'application/json',
    'CF-Access-Client-Id': cleanCredential(String(env.KARAOKE_CLIENT_ID)),
    'CF-Access-Client-Secret': cleanCredential(String(env.KARAOKE_CLIENT_SECRET)),
  };
  return {
    async get(path, params = {}) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') query.set(key, String(value));
      }
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      let response: Response;
      try {
        response = await fetchImpl(`${base}/v1/maya${path}${suffix}`, {
          method: 'GET',
          headers,
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new KaraokeError('うたログにつながりませんでした。');
      }
      // Access が認証を求めて別のページへ飛ばすとき（リダイレクト）も、入れなかったものとして扱う。
      if (response.status >= 300 && response.status < 400) throw new KaraokeError(refusalHint(403));
      if (response.status === 404) return null;
      if (!response.ok) throw new KaraokeError(refusalHint(response.status));
      const body: unknown = await response.json().catch(() => undefined);
      if (body === undefined) throw new KaraokeError('うたログの応答を読めませんでした。');
      return body;
    },
  };
}

// ---- MAYA の道具（読み取り専用） -------------------------------------------

export const KARAOKE_RECENT_TOOL: ToolDeclaration = {
  name: 'karaoke_recent',
  description:
    'うたログ（Gakky のカラオケ履歴）から、最近歌った曲を、新しい順に調べます。日時・曲名・歌手・点数・採点モード・キー・' +
    'Gakky 本人の感想メモを返します。「最近何歌った？」「あの時のメモは？」という相談で使います。' +
    'memo_only を true にすると、メモを書いた歌唱だけを返します。読み取り専用です。',
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'number', description: `さかのぼる日数。1〜${MAX_DAYS}。既定${DEFAULT_DAYS}日。` },
      memo_only: { type: 'boolean', description: 'true なら、Gakky が感想メモを書いた歌唱だけ。' },
    },
  },
};

export const KARAOKE_SEARCH_TOOL: ToolDeclaration = {
  name: 'karaoke_search',
  description:
    'うたログで、歌った曲を曲名・歌手の語や、タグで探します。曲ごとの歌った回数・最高点・最後に歌った日・タグ・曲のメモを返します。' +
    '「この歌手の曲は何を歌った？」「〇〇は歌ったことある？」という相談、次に歌う曲の提案の材料集めで使います。' +
    '返った song_id は karaoke_song に渡せます。読み取り専用です。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '曲名または歌手名に含まれる語。省略すると、最近歌った順に返します。' },
      tag: { type: 'string', description: 'Gakky が付けたタグの名前（完全一致）。省略可。' },
    },
  },
};

export const KARAOKE_SONG_TOOL: ToolDeclaration = {
  name: 'karaoke_song',
  description:
    'うたログで、1曲の全歌唱の履歴を調べます。歌うたびの日時・点数・採点モード・キー・オク下・感触・Gakky の感想メモと、' +
    '採点明細（音程・安定感・抑揚・ロングトーン・技術・AIボーナス・ビブラートやこぶしの回数・機械の総評・全国平均）があれば返します。' +
    '点数アップの相談や、その曲の思い出話で使います。song_id は karaoke_search / karaoke_recent の結果から渡します。読み取り専用です。',
  parameters: {
    type: 'object',
    properties: { song_id: { type: 'string', description: '見つけた曲の song_id。' } },
    required: ['song_id'],
  },
};

export const KARAOKE_FORGOTTEN_TOOL: ToolDeclaration = {
  name: 'karaoke_forgotten',
  description:
    'うたログで、2回以上歌ったのに、しばらく歌っていない曲を、最後に歌った日が古い順に返します。' +
    '「忘れてた曲は？」「久しぶりに歌う曲を選びたい」という相談で使います。読み取り専用です。',
  parameters: { type: 'object', properties: {} },
};

export const KARAOKE_OVERVIEW_TOOL: ToolDeclaration = {
  name: 'karaoke_overview',
  description:
    'うたログの全体像を調べます。歌った回数・曲数・日数、採点モード別の平均点と最高点、よく歌う曲と歌手、最後に記録された日。' +
    '「カラオケの傾向は？」「どんな歌手が多い？」という相談、次に歌う曲を提案する前の下調べで使います。読み取り専用です。',
  parameters: { type: 'object', properties: {} },
};

export const KARAOKE_TOOLS: ToolDeclaration[] = [
  KARAOKE_RECENT_TOOL,
  KARAOKE_SEARCH_TOOL,
  KARAOKE_SONG_TOOL,
  KARAOKE_FORGOTTEN_TOOL,
  KARAOKE_OVERVIEW_TOOL,
];

export const KARAOKE_TOOL_NAMES = KARAOKE_TOOLS.map((tool) => tool.name);

const SOURCE_NOTE =
  'これは、うたログに記録された点数と採点明細（数字）、Gakky 本人が書いたメモだけです。歌声は聴いていません。' +
  '記録に無いことを作らないでください。採点モードが違う点数は、比べません。';

const FEEL_LABEL: Record<string, string> = { good: '気持ちよく歌えた', ok: 'ふつう', hard: 'きつかった' };

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.filter((v): v is Row => typeof v === 'object' && v !== null) : []);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const clean = <T extends Record<string, unknown>>(object: T): Partial<T> =>
  Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;

/** YYYY-MM-DD から日数を引く（暦の計算だけ）。 */
export function minusDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

function readDays(value: unknown): number {
  const days = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : DEFAULT_DAYS;
  return Math.min(Math.max(1, days), MAX_DAYS);
}

function keyLabel(row: Row): string | undefined {
  const parts: string[] = [];
  const key = num(row.keyShiftSemitones);
  if (key !== undefined) parts.push(key === 0 ? '原曲キー' : `${key > 0 ? '+' : ''}${key}`);
  if (row.octaveDown === true) parts.push('オク下');
  if (row.keyChanged === true) parts.push('曲中でキー変更あり');
  return parts.length ? parts.join('・') : undefined;
}

function singing(row: Row) {
  return clean({
    日時: text(row.performedAt),
    曲: text(row.title),
    歌手: text(row.artist),
    song_id: text(row.songId),
    点数: text(row.score),
    採点モード: text(row.scoringMethod),
    キー: keyLabel(row),
    感触: typeof row.feel === 'string' ? FEEL_LABEL[row.feel] : undefined,
    本人のメモ: text(row.memo),
    採点明細あり: row.hasScoreBreakdown === true ? true : undefined,
  });
}

function breakdown(value: unknown) {
  if (typeof value !== 'object' || value === null) return undefined;
  const b = value as Row;
  return clean({
    音程: num(b.pitch),
    安定感: num(b.stability),
    抑揚: num(b.dynamics),
    ロングトーン: num(b.longTone),
    技術: num(b.technique),
    AIボーナス: num(b.aiBonus),
    こぶし: num(b.kobushiCount),
    しゃくり: num(b.shakuriCount),
    ビブラート回数: num(b.vibratoCount),
    ビブラートの種類: text(b.vibratoSpeed),
    ビブラートの深さ: text(b.vibratoDepth),
    リズムの位置: text(b.rhythmPosition),
    機械の総評: text(b.machineComment),
    全国平均: num(b.nationalAverage),
    全国順位: text(b.nationalRank) ?? num(b.nationalRank),
  });
}

function songSummary(row: Row) {
  return clean({
    song_id: text(row.songId),
    曲: text(row.title),
    歌手: text(row.artist),
    歌った回数: num(row.singCount),
    採点つき回数: num(row.scoredCount),
    最高点: text(row.bestScore),
    最初に歌った日: text(row.firstSungAt),
    最後に歌った日: text(row.lastSungAt),
    タグ: Array.isArray(row.tags) && row.tags.length ? row.tags : undefined,
    曲のメモ: text(row.songMemo),
    お気に入り: row.favorite === true ? true : undefined,
    設定キー: num(row.preferredKeyShift),
  });
}

async function readOrFail<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (error) {
    const reason = error instanceof KaraokeError ? `（${error.message}）` : '';
    return { error: `うたログの記録を読めませんでした${reason}。少し待ってから、もう一度試してください。` };
  }
}

/** 最後に記録された歌唱の日時。新しい歌唱が未着かもしれないと伝えるために添える。 */
async function lastRecorded(source: KaraokeSource): Promise<string | undefined> {
  try {
    const body = (await source.get('/freshness')) as Row | null;
    return text(body?.latestPerformedAt);
  } catch {
    return undefined;
  }
}

export async function runKaraokeRecentTool(source: KaraokeSource, call: ToolCall, today: string) {
  const days = readDays(call.args.days);
  const memoOnly = call.args.memo_only === true;
  const from = minusDays(today, days);
  return readOrFail(async () => {
    const body = (await source.get('/recent', { from, to: today, limit: RECENT_LIMIT, memo: memoOnly ? 1 : undefined })) as Row | null;
    const list = rows(body?.singings).map(singing);
    const last = await lastRecorded(source);
    return {
      期間: { from, to: today },
      件数: list.length,
      歌唱: list,
      ...(list.length === 0 ? { 該当なし: 'この期間に記録された歌唱は、うたログにありません。' } : {}),
      ...(last ? { 最後に記録された歌唱: last } : {}),
      注意: SOURCE_NOTE,
    };
  });
}

export async function runKaraokeSearchTool(source: KaraokeSource, call: ToolCall) {
  const keyword = typeof call.args.keyword === 'string' ? call.args.keyword.trim().slice(0, 60) : '';
  const tag = typeof call.args.tag === 'string' ? call.args.tag.trim().slice(0, 20) : '';
  return readOrFail(async () => {
    const body = (await source.get('/songs', { q: keyword, tag, limit: SEARCH_LIMIT })) as Row | null;
    const list = rows(body?.songs).map(songSummary);
    return {
      探した条件: clean({ 語: keyword || undefined, タグ: tag || undefined }),
      件数: list.length,
      曲: list,
      ...(list.length === 0 ? { 該当なし: '該当する曲を歌った記録は、うたログにありません。' } : {}),
      注意: SOURCE_NOTE,
    };
  });
}

export async function runKaraokeSongTool(source: KaraokeSource, call: ToolCall) {
  const id = typeof call.args.song_id === 'string' ? call.args.song_id.trim() : '';
  if (!SONG_ID.test(id)) return { error: 'song_id が正しくありません。karaoke_search か karaoke_recent で見つけたものを渡してください。' };
  return readOrFail(async () => {
    const body = (await source.get(`/songs/${encodeURIComponent(id)}`)) as Row | null;
    if (!body) return { 該当なし: 'その song_id の曲は、うたログにありません。', 注意: SOURCE_NOTE };
    return {
      曲: text(body.title),
      歌手: text(body.artist),
      タグ: Array.isArray(body.tags) && body.tags.length ? body.tags : undefined,
      曲のメモ: text(body.songMemo),
      お気に入り: body.favorite === true ? true : undefined,
      歌唱: rows(body.singings).map((row) => ({ ...singing(row), 採点明細: breakdown(row.scoreBreakdown) })),
      注意: SOURCE_NOTE,
    };
  });
}

export async function runKaraokeForgottenTool(source: KaraokeSource) {
  return readOrFail(async () => {
    const body = (await source.get('/forgotten', { limit: FORGOTTEN_LIMIT })) as Row | null;
    const list = rows(body?.songs).map(songSummary);
    return {
      件数: list.length,
      しばらく歌っていない曲: list,
      ...(list.length === 0 ? { 該当なし: '2回以上歌った曲が、まだありません。' } : {}),
      注意: SOURCE_NOTE,
    };
  });
}

export async function runKaraokeOverviewTool(source: KaraokeSource) {
  return readOrFail(async () => {
    const body = (await source.get('/overview')) as Row | null;
    if (!body) return { 該当なし: 'うたログに記録がありません。', 注意: SOURCE_NOTE };
    const totals = (body.totals ?? {}) as Row;
    const last = await lastRecorded(source);
    return {
      全体: clean({
        歌った回数: num(totals.singings),
        曲数: num(totals.distinctSongs),
        歌った日数: num(totals.singingDays),
        採点つき回数: num(totals.scoredSingings),
        最初の記録: text(totals.firstSungAt),
        最後の記録: text(totals.lastSungAt) ?? last,
      }),
      採点モード別: rows(body.scoreByMethod).map((m) => clean({ モード: text(m.method), 回数: num(m.count), 平均: text(m.average), 最高: text(m.best) })),
      よく歌う曲: rows(body.mostSungSongs).map((s) => clean({ song_id: text(s.songId), 曲: text(s.title), 歌手: text(s.artist), 回数: num(s.count), 最高点: text(s.bestScore) })),
      よく歌う歌手: rows(body.mostSungArtists).map((a) => clean({ 歌手: text(a.artist), 歌った回数: num(a.singings), 曲数: num(a.distinctSongs) })),
      注意: SOURCE_NOTE,
    };
  });
}

/** モデルの道具呼び出しを実行する。知らない道具は、投げずに返す。 */
export async function runKaraokeTool(source: KaraokeSource, call: ToolCall, today: string): Promise<unknown> {
  switch (call.name) {
    case KARAOKE_RECENT_TOOL.name:
      return runKaraokeRecentTool(source, call, today);
    case KARAOKE_SEARCH_TOOL.name:
      return runKaraokeSearchTool(source, call);
    case KARAOKE_SONG_TOOL.name:
      return runKaraokeSongTool(source, call);
    case KARAOKE_FORGOTTEN_TOOL.name:
      return runKaraokeForgottenTool(source);
    case KARAOKE_OVERVIEW_TOOL.name:
      return runKaraokeOverviewTool(source);
    default:
      return { error: `知らない道具です: ${call.name}` };
  }
}
