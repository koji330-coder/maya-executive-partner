/**
 * @jest-environment node
 */
import { buildSystemPrompt, VOICE_GUIDE } from '@/features/chat/systemPrompt';
import { VOICEBOX_TOOL } from '@/features/tools/catalog';

import type { Env } from '../env';
import {
  freshnessNote,
  minusDays,
  readConversation,
  readVoiceRecentArgs,
  readVoiceSearchArgs,
  refersToVoice,
  runVoiceActionsTool,
  runVoiceDetailTool,
  runVoiceRecentTool,
  runVoiceSearchTool,
  runVoiceTool,
  vaultSource,
  VOICE_TOOLS,
  voiceConfigured,
  type StoredVoiceDigest,
  type VoiceSource,
} from '../voicebox';

const idea: StoredVoiceDigest = {
  recordingId: 'idea-1790000000000-85000',
  kind: 'idea',
  recordedAt: '2026-09-26T08:15:00.000Z',
  recordedDate: '2026-09-26',
  durationMs: 85_000,
  title: '折りたたみ式ライトの企画',
  summary: ['折りたたみ式の卓上ライトを作る', '価格は3980円で検討'],
  decisions: [],
  actions: [{ task: '競合の価格を調べる', owner: '', due: '' }],
  participants: [],
  topics: [],
  preset: 'dev_memo',
  importedAt: '2026-09-27T01:00:00.000Z',
};

const meeting: StoredVoiceDigest = {
  recordingId: 'meeting-1790000000000-2538000',
  kind: 'meeting',
  recordedAt: '2026-09-25T05:02:00.000Z',
  recordedDate: '2026-09-25',
  durationMs: 2_538_000,
  title: 'A社との価格交渉',
  summary: ['価格を協議', '納期は2週間', '次回は来週'],
  decisions: ['単価は据え置き'],
  actions: [{ task: '見積書を送る', owner: '田中', due: '9/30' }],
  participants: ['田中さん', '佐藤さん'],
  topics: ['価格', '納期'],
  preset: 'negotiation',
  importedAt: '2026-09-27T01:00:00.000Z',
};

/** 窓の代わりになる、メモリ上の読み出し元。 */
function fakeSource(items: StoredVoiceDigest[], latest: string | null = '2026-09-27T01:00:00.000Z'): VoiceSource {
  return {
    async list(query) {
      return items
        .filter((d) => (!query.from || d.recordedDate >= query.from) && (!query.to || d.recordedDate <= query.to))
        .filter((d) => !query.kind || d.kind === query.kind)
        .filter((d) => (query.keywords ?? []).every((k) => JSON.stringify(d).includes(k)))
        .slice(0, query.limit);
    },
    async get(id) {
      return items.find((d) => d.recordingId === id) ?? null;
    },
    async latestImportedAt() {
      return latest;
    },
  };
}

const env = (extra: Partial<Env> = {}) =>
  ({
    VOICEBOX_VAULT_URL: 'https://vault.example.com/',
    VOICEBOX_VAULT_CLIENT_ID: 'id-1.access',
    VOICEBOX_VAULT_CLIENT_SECRET: 'secret-1',
    ...extra,
  }) as Env;

describe('voiceConfigured', () => {
  it('needs the address and both halves of the token', () => {
    expect(voiceConfigured(env())).toBe(true);
    expect(voiceConfigured(env({ VOICEBOX_VAULT_URL: '' }))).toBe(false);
    expect(voiceConfigured(env({ VOICEBOX_VAULT_CLIENT_ID: undefined }))).toBe(false);
    expect(voiceConfigured(env({ VOICEBOX_VAULT_CLIENT_SECRET: '' }))).toBe(false);
    expect(voiceConfigured({} as Env)).toBe(false);
  });
});

describe('vaultSource (reads the VoiceBox window)', () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('sends the service token and only ever reads', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const source = vaultSource(env(), async (url, init) => {
      seen.push({ url, init });
      return json({ conversations: [] });
    });
    await source.list({ from: '2026-09-01', kind: 'meeting', keywords: ['価格', 'A社'], limit: 8 });
    expect(seen).toHaveLength(1);
    const call = seen[0]!;
    const url = new URL(call.url);
    expect(url.origin + url.pathname).toBe('https://vault.example.com/v1/maya/conversations');
    expect(url.searchParams.get('from')).toBe('2026-09-01');
    expect(url.searchParams.get('kind')).toBe('meeting');
    expect(url.searchParams.getAll('q')).toEqual(['価格', 'A社']);
    expect(url.searchParams.get('limit')).toBe('8');
    expect(call.init.method).toBe('GET');
    expect(call.init.redirect).toBe('manual');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['CF-Access-Client-Id']).toBe('id-1.access');
    expect(headers['CF-Access-Client-Secret']).toBe('secret-1');
  });

  it('turns the window’s answer into conversations, dropping malformed ones', async () => {
    const source = vaultSource(env(), async () =>
      json({ conversations: [meeting, { recordingId: '../bad', kind: 'idea' }, { recordingId: 'x', kind: 'other' }, 'text', null] }),
    );
    const list = await source.list({ limit: 10 });
    expect(list.map((d) => d.recordingId)).toEqual([meeting.recordingId]);
    expect(list[0]).toMatchObject({ title: 'A社との価格交渉', decisions: ['単価は据え置き'], importedAt: meeting.importedAt });
  });

  it('gets one conversation, and null when there is none', async () => {
    const found = vaultSource(env(), async (url) => {
      expect(url).toBe(`https://vault.example.com/v1/maya/conversations/${encodeURIComponent(meeting.recordingId)}`);
      return json({ conversation: meeting });
    });
    expect((await found.get(meeting.recordingId))?.title).toBe('A社との価格交渉');
    const missing = vaultSource(env(), async () => json({ error: { message: 'no' } }, 404));
    expect(await missing.get('nothing')).toBeNull();
  });

  it('reads the freshness', async () => {
    const source = vaultSource(env(), async (url) => {
      expect(url).toBe('https://vault.example.com/v1/maya/freshness');
      return json({ latestImportedAt: '2026-09-27T01:00:00.000Z', total: 2 });
    });
    expect(await source.latestImportedAt()).toBe('2026-09-27T01:00:00.000Z');
    expect(await vaultSource(env(), async () => json({ latestImportedAt: null, total: 0 })).latestImportedAt()).toBeNull();
  });

  it('says what went wrong without leaking the token', async () => {
    const attempt = async (fetchImpl: (url: string, init: RequestInit) => Promise<Response>) => {
      try {
        await vaultSource(env(), fetchImpl).list({ limit: 1 });
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(await attempt(async () => json({}, 403))).toContain('Access');
    expect(await attempt(async () => json({}, 401))).toContain('Access');
    expect(await attempt(async () => new Response(null, { status: 302, headers: { location: 'https://team.cloudflareaccess.com/login' } }))).toContain('Access');
    expect(await attempt(async () => json({}, 503))).toContain('503');
    expect(await attempt(async () => new Response('<html>', { status: 200 }))).toContain('読めません');
    const network = await attempt(async () => {
      throw new TypeError('connect ECONNREFUSED secret-1');
    });
    expect(network).toContain('つながりません');
    expect(network).not.toContain('secret-1');
  });

  it('refuses to start without a configuration', () => {
    expect(() => vaultSource({} as Env)).toThrow('設定されていません');
  });

  it('strips a pasted "CF-Access-Client-Id:" prefix from the credentials, as the other connections do', async () => {
    let headers: Record<string, string> = {};
    const source = vaultSource(
      env({ VOICEBOX_VAULT_CLIENT_ID: 'CF-Access-Client-Id: abc.access', VOICEBOX_VAULT_CLIENT_SECRET: ' s3 ' }),
      async (_url, init) => {
        headers = init.headers as Record<string, string>;
        return json({ conversations: [] });
      },
    );
    await source.list({ limit: 1 });
    expect(headers['CF-Access-Client-Id']).toBe('abc.access');
    expect(headers['CF-Access-Client-Secret']).toBe('s3');
  });
});

describe('readConversation (untrusted input)', () => {
  it('fills what is missing and keeps only the right types', () => {
    const result = readConversation({
      recordingId: 'idea-1',
      kind: 'idea',
      recordedDate: '先月',
      summary: ['a', 3, 'b'],
      actions: [{ task: 'やる', owner: 5 }, { nothing: true }, 'x'],
      participants: 'nobody',
    });
    expect(result).toMatchObject({ recordingId: 'idea-1', recordedDate: '', summary: ['a', 'b'], participants: [], durationMs: 0 });
    expect(result?.actions).toEqual([{ task: 'やる', owner: '', due: '' }]);
  });
});

describe('the four tools', () => {
  const NOW = Date.parse('2026-09-27T03:00:00Z');
  const TODAY = '2026-09-27';
  const source = fakeSource([idea, meeting]);

  it('declares four read-only tools', () => {
    expect(VOICE_TOOLS.map((tool) => tool.name)).toEqual(['voice_recent', 'voice_search', 'voice_detail', 'voice_actions']);
    expect(VOICEBOX_TOOL.serverTools).toEqual(VOICE_TOOLS.map((tool) => tool.name));
    for (const tool of VOICE_TOOLS) expect(tool.description).toContain('読み取り専用');
    for (const question of VOICEBOX_TOOL.ask) expect(refersToVoice(question)).toBe(true);
  });

  it('voice_recent lists the latest conversations with the period and a reminder of what is held', async () => {
    const result = (await runVoiceRecentTool(source, { name: 'voice_recent', args: { days: 7 } }, TODAY, NOW)) as Record<string, any>;
    expect(result.期間).toEqual({ from: '2026-09-20', to: '2026-09-27' });
    expect(result.件数).toBe(2);
    expect(result.会話[0]).toMatchObject({ recording_id: idea.recordingId, 種類: 'アイデア', 題名: '折りたたみ式ライトの企画' });
    expect(result.会話[1]).toMatchObject({ 種類: '会議', 参加者: ['田中さん', '佐藤さん'] });
    expect(result.注意).toContain('原文（文字起こし）と音声は持っていません');
    expect(result.鮮度の注意).toBeUndefined();
  });

  it('voice_recent says so when nothing is in the period, and when the last import is old', async () => {
    const result = (await runVoiceRecentTool(source, { name: 'voice_recent', args: { days: 1, kind: 'meeting' } }, TODAY, Date.parse('2026-10-05T00:00:00Z'))) as Record<string, any>;
    expect(result.件数).toBe(0);
    expect(result.該当なし).toContain('届いていません');
    expect(result.鮮度の注意).toContain('日前');
  });

  it('voice_search finds by words and says when there is nothing', async () => {
    const hit = (await runVoiceSearchTool(source, { name: 'voice_search', args: { keywords: ['価格', 'A社'] } }, NOW)) as Record<string, any>;
    expect(hit.件数).toBe(1);
    expect(hit.会話[0].recording_id).toBe(meeting.recordingId);
    const none = (await runVoiceSearchTool(source, { name: 'voice_search', args: { keywords: ['存在しない'] } }, NOW)) as Record<string, any>;
    expect(none.件数).toBe(0);
    expect(none.該当なし).toContain('該当する会話はありませんでした');
  });

  it('voice_detail returns everything for one conversation, and refuses a bad id', async () => {
    const found = (await runVoiceDetailTool(source, { name: 'voice_detail', args: { recording_id: meeting.recordingId } })) as Record<string, any>;
    expect(found.会話.決定事項).toEqual(['単価は据え置き']);
    expect(found.会話.やること).toEqual([{ 内容: '見積書を送る', 担当: '田中', 期限: '9/30' }]);
    expect(found.会話.論点).toEqual(['価格', '納期']);
    expect(found.会話.長さ分).toBe(42);
    expect(found.会話.取り込み日時).toBe('2026-09-27T01:00:00.000Z');
    expect(((await runVoiceDetailTool(source, { name: 'voice_detail', args: { recording_id: 'nothing' } })) as Record<string, any>).該当なし).toContain('ありません');
    expect(((await runVoiceDetailTool(source, { name: 'voice_detail', args: { recording_id: '../x' } })) as Record<string, any>).error).toBeDefined();
    expect(((await runVoiceDetailTool(source, { name: 'voice_detail', args: {} })) as Record<string, any>).error).toBeDefined();
  });

  it('voice_actions flattens actions with their conversation, and says completion is unknown', async () => {
    const result = (await runVoiceActionsTool(source, { name: 'voice_actions', args: {} }, TODAY, NOW)) as Record<string, any>;
    expect(result.件数).toBe(2);
    expect(result.やること).toContainEqual({ 日付: '2026-09-25', 会話: 'A社との価格交渉', 種類: '会議', recording_id: meeting.recordingId, 内容: '見積書を送る', 担当: '田中', 期限: '9/30' });
    expect(result.完了の記録).toContain('ありません');
  });

  it('turns a failed read into a message the model can relay, not an exception', async () => {
    const broken: VoiceSource = {
      list: async () => {
        throw new Error('boom');
      },
      get: async () => null,
      latestImportedAt: async () => null,
    };
    const result = (await runVoiceRecentTool(broken, { name: 'voice_recent', args: {} }, TODAY, NOW)) as Record<string, any>;
    expect(result.error).toContain('読めませんでした');
  });

  it('relays why the window could not be read (for example an Access refusal)', async () => {
    const refused = vaultSource(env(), async () => new Response('no', { status: 403 }));
    const result = (await runVoiceRecentTool(refused, { name: 'voice_recent', args: {} }, TODAY, NOW)) as Record<string, any>;
    expect(result.error).toContain('Access');
  });

  it('reports an unknown tool instead of throwing', async () => {
    expect(await runVoiceTool(source, { name: 'nope', args: {} }, TODAY)).toEqual({ error: '知らない道具です: nope' });
  });
});

describe('tool arguments (untrusted input)', () => {
  it('keeps days within 1-90 and drops an unknown kind', () => {
    expect(readVoiceRecentArgs({ days: 500 })).toEqual({ days: 90 });
    expect(readVoiceRecentArgs({ days: 0, kind: 'meeting' })).toEqual({ days: 1, kind: 'meeting' });
    expect(readVoiceRecentArgs({ days: 'many', kind: 'secret' })).toEqual({ days: 14 });
  });

  it('keeps well-formed search arguments only', () => {
    expect(
      readVoiceSearchArgs({ keywords: [' 価格 ', '', 3, 'a', 'b', 'c', 'd', 'e'], from: '2026-09-01', to: '先月', kind: 'idea' }),
    ).toEqual({ keywords: ['価格', 'a', 'b', 'c', 'd'], from: '2026-09-01', kind: 'idea' });
  });
});

describe('helpers', () => {
  it('minusDays crosses month and year boundaries', () => {
    expect(minusDays('2026-09-27', 7)).toBe('2026-09-20');
    expect(minusDays('2026-03-01', 1)).toBe('2026-02-28');
    expect(minusDays('2026-01-05', 10)).toBe('2025-12-26');
  });

  it('freshnessNote only speaks once the last import is old', () => {
    const now = Date.parse('2026-09-27T00:00:00Z');
    expect(freshnessNote(null, now)).toBeUndefined();
    expect(freshnessNote('2026-09-26T12:00:00Z', now)).toBeUndefined();
    expect(freshnessNote('2026-09-20T00:00:00Z', now)).toContain('7 日前');
  });

  it('refersToVoice reacts to recordings and minutes, not to the word "meeting" alone', () => {
    expect(refersToVoice('さっきの議事録を見せて')).toBe(true);
    expect(refersToVoice('ボイスメモに何て入れてたっけ')).toBe(true);
    expect(refersToVoice('A社との商談で決めたことは？')).toBe(true);
    expect(refersToVoice('録音した会議の要点は？')).toBe(true);
    expect(refersToVoice('会議の進め方のコツを教えて')).toBe(false);
    expect(refersToVoice('今日の売上は？')).toBe(false);
  });
});

describe('voice guide in the prompt', () => {
  it('appears only when VoiceBox is connected', () => {
    const today = new Date(2026, 8, 27);
    expect(buildSystemPrompt(undefined, [], today, undefined, true, false, false, false)).not.toContain('voice_recent');
    const withVoice = buildSystemPrompt(undefined, [], today, undefined, true, false, false, true);
    expect(withVoice).toContain(VOICE_GUIDE);
    expect(VOICE_GUIDE).toContain('原文（文字起こし）も音声も持っていません');
  });
});
