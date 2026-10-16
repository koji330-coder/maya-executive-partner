/**
 * @jest-environment node
 */
import { buildSystemPrompt, KARAOKE_GUIDE } from '@/features/chat/systemPrompt';
import { KARAOKE_TOOL } from '@/features/tools/catalog';

import type { Env } from '../env';
import {
  karaokeConfigured,
  karaokeSource,
  KARAOKE_TOOLS,
  minusDays,
  refersToKaraoke,
  runKaraokeForgottenTool,
  runKaraokeOverviewTool,
  runKaraokeRecentTool,
  runKaraokeSearchTool,
  runKaraokeSongTool,
  runKaraokeTool,
  type KaraokeSource,
} from '../karaoke';

const env = (extra: Partial<Env> = {}) =>
  ({
    KARAOKE_URL: 'https://karaoke.example.com/',
    KARAOKE_CLIENT_ID: 'id-1.access',
    KARAOKE_CLIENT_SECRET: 'secret-1',
    ...extra,
  }) as Env;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** 窓の代わりになる、パスごとの固定の答え。 */
function fakeSource(answers: Record<string, unknown>) {
  const seen: { path: string; params?: Record<string, unknown> }[] = [];
  const source: KaraokeSource = {
    async get(path, params) {
      seen.push({ path, params });
      const key = Object.keys(answers).find((k) => path === k || path.startsWith(`${k}/`));
      return key ? answers[key] : null;
    },
  };
  return { source, seen };
}

const singing = {
  performanceId: 'p1',
  performedAt: '2026-10-15T23:50:33',
  songId: 'song-a',
  title: 'テスト曲A',
  artist: 'テスト歌手',
  score: '88.390',
  scoringMethod: '分析採点AI+',
  keyShiftSemitones: 2,
  octaveDown: false,
  keyChanged: true,
  feel: 'hard',
  memo: 'サビで声が裏返った',
  hasScoreBreakdown: true,
};

describe('karaokeConfigured', () => {
  it('needs the address and both halves of the token', () => {
    expect(karaokeConfigured(env())).toBe(true);
    expect(karaokeConfigured(env({ KARAOKE_URL: '' }))).toBe(false);
    expect(karaokeConfigured(env({ KARAOKE_CLIENT_ID: undefined }))).toBe(false);
    expect(karaokeConfigured(env({ KARAOKE_CLIENT_SECRET: '' }))).toBe(false);
    expect(karaokeConfigured({} as Env)).toBe(false);
  });
});

describe('karaokeSource (reads the Utalog window)', () => {
  it('sends the service token, only reads, and builds the query', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const source = karaokeSource(env(), async (url, init) => {
      seen.push({ url, init });
      return json({ ok: true });
    });
    await source.get('/recent', { from: '2026-10-01', limit: 30, memo: undefined, q: '' });
    const call = seen[0]!;
    const url = new URL(call.url);
    expect(url.origin + url.pathname).toBe('https://karaoke.example.com/v1/maya/recent');
    expect(url.searchParams.get('from')).toBe('2026-10-01');
    expect(url.searchParams.get('limit')).toBe('30');
    expect(url.searchParams.has('memo')).toBe(false);
    expect(call.init.method).toBe('GET');
    expect(call.init.redirect).toBe('manual');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['CF-Access-Client-Id']).toBe('id-1.access');
    expect(headers['CF-Access-Client-Secret']).toBe('secret-1');
  });

  it('treats 404 as nothing, redirects and errors as a refusal', async () => {
    expect(await karaokeSource(env(), async () => json({}, 404)).get('/songs/x')).toBeNull();
    await expect(karaokeSource(env(), async () => new Response(null, { status: 302 })).get('/overview')).rejects.toThrow(/Access/);
    await expect(karaokeSource(env(), async () => json({}, 500)).get('/overview')).rejects.toThrow(/500/);
    await expect(
      karaokeSource(env(), async () => {
        throw new Error('offline');
      }).get('/overview'),
    ).rejects.toThrow(/つながりませんでした/);
  });

  it('refuses to start without configuration', () => {
    expect(() => karaokeSource({} as Env)).toThrow(/設定されていません/);
  });
});

describe('tools', () => {
  it('recent: turns a singing into labelled facts, memo included in full', async () => {
    const { source, seen } = fakeSource({ '/recent': { singings: [singing] }, '/freshness': { latestPerformedAt: '2026-10-16T09:43:51' } });
    const result = (await runKaraokeRecentTool(source, { name: 'karaoke_recent', args: { days: 10, memo_only: true } }, '2026-10-16')) as any;
    expect(seen[0]!.params).toMatchObject({ from: '2026-10-06', to: '2026-10-16', memo: 1 });
    expect(result.件数).toBe(1);
    expect(result.歌唱[0]).toMatchObject({
      曲: 'テスト曲A',
      点数: '88.390',
      採点モード: '分析採点AI+',
      キー: '+2・曲中でキー変更あり',
      感触: 'きつかった',
      本人のメモ: 'サビで声が裏返った',
    });
    expect(result.最後に記録された歌唱).toBe('2026-10-16T09:43:51');
    expect(result.注意).toContain('歌声は聴いていません');
  });

  it('recent: says so when there is nothing, and still works if freshness fails', async () => {
    const source: KaraokeSource = {
      async get(path) {
        if (path === '/freshness') throw new Error('x');
        return { singings: [] };
      },
    };
    const result = (await runKaraokeRecentTool(source, { name: 'karaoke_recent', args: {} }, '2026-10-16')) as any;
    expect(result.該当なし).toBeDefined();
    expect(result.最後に記録された歌唱).toBeUndefined();
  });

  it('search: passes the keyword and tag, returns song summaries', async () => {
    const { source, seen } = fakeSource({
      '/songs': { songs: [{ songId: 's1', title: '曲', artist: '歌手', singCount: 5, bestScore: '91.000', tags: ['十八番'], songMemo: 'キー+2' }] },
    });
    const result = (await runKaraokeSearchTool(source, { name: 'karaoke_search', args: { keyword: ' 歌手 ', tag: '十八番' } })) as any;
    expect(seen[0]!.params).toMatchObject({ q: '歌手', tag: '十八番' });
    expect(result.曲[0]).toMatchObject({ song_id: 's1', 歌った回数: 5, 最高点: '91.000', タグ: ['十八番'], 曲のメモ: 'キー+2' });
  });

  it('song: includes the score breakdown and rejects a bad id without calling the window', async () => {
    const { source, seen } = fakeSource({
      '/songs': {
        title: 'テスト曲A',
        artist: 'テスト歌手',
        singings: [{ ...singing, scoreBreakdown: { pitch: 88.5, stability: 70.25, vibratoCount: 3, machineComment: 'テスト用の総評', nationalAverage: 85.1 } }],
      },
    });
    const result = (await runKaraokeSongTool(source, { name: 'karaoke_song', args: { song_id: 'song-a' } })) as any;
    expect(seen[0]!.path).toBe('/songs/song-a');
    expect(result.歌唱[0].採点明細).toMatchObject({ 音程: 88.5, 安定感: 70.25, ビブラート回数: 3, 機械の総評: 'テスト用の総評', 全国平均: 85.1 });
    const bad = (await runKaraokeSongTool(source, { name: 'karaoke_song', args: { song_id: '../x' } })) as any;
    expect(bad.error).toContain('song_id');
    expect(seen).toHaveLength(1);
    const missing = (await runKaraokeSongTool(fakeSource({}).source, { name: 'karaoke_song', args: { song_id: 'nope' } })) as any;
    expect(missing.該当なし).toBeDefined();
  });

  it('forgotten and overview', async () => {
    const { source } = fakeSource({
      '/forgotten': { songs: [{ songId: 's2', title: '古い曲', artist: '歌手', singCount: 3, bestScore: '90.000', lastSungAt: '2026-01-01T10:00:00' }] },
      '/overview': {
        totals: { singings: 321, distinctSongs: 114, singingDays: 30, scoredSingings: 220, lastSungAt: '2026-10-16T09:43:51' },
        scoreByMethod: [{ method: '分析採点AI+', count: 200, average: '89.5', best: '95.8' }],
        mostSungSongs: [{ songId: 's1', title: '曲', artist: '歌手', count: 26, bestScore: '95.8' }],
        mostSungArtists: [{ artist: '歌手', singings: 80, distinctSongs: 20 }],
      },
      '/freshness': {},
    });
    const forgotten = (await runKaraokeForgottenTool(source)) as any;
    expect(forgotten.しばらく歌っていない曲[0]).toMatchObject({ 曲: '古い曲', 最後に歌った日: '2026-01-01T10:00:00' });
    const overview = (await runKaraokeOverviewTool(source)) as any;
    expect(overview.全体).toMatchObject({ 歌った回数: 321, 曲数: 114 });
    expect(overview.採点モード別[0]).toMatchObject({ モード: '分析採点AI+', 平均: '89.5' });
    expect(overview.よく歌う曲[0].回数).toBe(26);
  });

  it('a window failure becomes an error result, not a throw', async () => {
    const source: KaraokeSource = {
      async get() {
        throw new Error('boom');
      },
    };
    const result = (await runKaraokeOverviewTool(source)) as any;
    expect(result.error).toContain('うたログの記録を読めませんでした');
  });

  it('runKaraokeTool dispatches by name and returns unknown names instead of throwing', async () => {
    const { source } = fakeSource({ '/overview': { totals: {} }, '/freshness': {} });
    expect(await runKaraokeTool(source, { name: 'karaoke_overview', args: {} }, '2026-10-16')).toHaveProperty('全体');
    expect(await runKaraokeTool(source, { name: 'karaoke_write', args: {} }, '2026-10-16')).toHaveProperty('error');
  });

  it('every tool is read-only and named karaoke_*', () => {
    expect(KARAOKE_TOOLS.map((t) => t.name)).toEqual(['karaoke_recent', 'karaoke_search', 'karaoke_song', 'karaoke_forgotten', 'karaoke_overview']);
    for (const tool of KARAOKE_TOOLS) expect(tool.description).toContain('読み取り専用');
    expect(KARAOKE_TOOL.serverTools).toEqual(KARAOKE_TOOLS.map((t) => t.name));
  });
});

describe('when to look', () => {
  it('refersToKaraoke picks karaoke talk but not other topics', () => {
    expect(refersToKaraoke('次に歌う曲を提案して')).toBe(true);
    expect(refersToKaraoke('カラオケのメモで笑いたい')).toBe(true);
    expect(refersToKaraoke('真夜中マーメイドの採点を上げたい')).toBe(true);
    expect(refersToKaraoke('今日の売上は？')).toBe(false);
    expect(refersToKaraoke('価格改定の件')).toBe(false);
  });

  it('minusDays counts calendar days', () => {
    expect(minusDays('2026-10-16', 10)).toBe('2026-10-06');
    expect(minusDays('2026-03-01', 1)).toBe('2026-02-28');
  });
});

describe('prompt', () => {
  it('includes the karaoke guide only when the tools are available', () => {
    expect(buildSystemPrompt(undefined, [], new Date(), undefined, true, false, false, false, true)).toContain(KARAOKE_GUIDE);
    expect(buildSystemPrompt(undefined, [], new Date(), undefined, true, false, false, false, false)).not.toContain(KARAOKE_GUIDE);
  });

  it('says the voice was not heard, advice is a game, and modes are not compared', () => {
    expect(KARAOKE_GUIDE).toContain('歌声は聴いていません');
    expect(KARAOKE_GUIDE).toContain('お遊び');
    expect(KARAOKE_GUIDE).toContain('採点モードが違う点数');
  });
});
