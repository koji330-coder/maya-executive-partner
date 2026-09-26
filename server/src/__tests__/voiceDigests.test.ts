/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { buildSystemPrompt, VOICE_GUIDE } from '@/features/chat/systemPrompt';

import {
  contentHash,
  deleteVoiceDigest,
  findVoiceDigest,
  freshnessNote,
  listVoiceDigestIndex,
  minusDays,
  queryVoiceDigests,
  readVoiceDigest,
  readVoiceRecentArgs,
  readVoiceSearchArgs,
  refersToVoice,
  runVoiceActionsTool,
  runVoiceDetailTool,
  runVoiceRecentTool,
  runVoiceSearchTool,
  runVoiceTool,
  upsertVoiceDigests,
  VOICE_BATCH_LIMIT,
  VOICE_TOOLS,
  voiceConfigured,
  type VoiceDigest,
} from '../memory/voiceDigests';

// 本物の SQLite（Node 標準）を D1 の形にして使う。SQL の誤りをテストで拾うため。
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => any };

class FakeStatement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: any, readonly sql: string, private readonly params: unknown[] = []) {}
  bind(...params: unknown[]) {
    return new FakeStatement(this.db, this.sql, params);
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[] };
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.params) ?? null) as T | null;
  }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(result.changes) } };
  }
}

function createDb(withTable = true): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  if (withTable) {
    sqlite.exec(readFileSync(join(__dirname, '../../migrations/0004_voice_digests.sql'), 'utf8'));
  }
  const fake = {
    prepare: (sql: string) => new FakeStatement(sqlite, sql),
    batch: async (statements: FakeStatement[]) => {
      sqlite.exec('BEGIN');
      try {
        for (const statement of statements) await statement.run();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return fake as unknown as D1Database;
}

const base = {
  schema: 1,
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
};

const meeting = {
  ...base,
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
};

const digest = (input: unknown): VoiceDigest => readVoiceDigest(input);

describe('readVoiceDigest', () => {
  it('accepts what VoiceBox sends', () => {
    const value = digest(base);
    expect(value.recordingId).toBe('idea-1790000000000-85000');
    expect(value.title).toBe('折りたたみ式ライトの企画');
    expect(value.recordedDate).toBe('2026-09-26');
    expect(value.actions).toEqual([{ task: '競合の価格を調べる', owner: '', due: '' }]);
  });

  it('works out the date in the president’s calendar when the sender leaves it out', () => {
    // 2026-09-26 16:30 UTC は、日本では 27日の朝。
    const { recordedDate: _omitted, ...rest } = base;
    expect(digest({ ...rest, recordedAt: '2026-09-26T16:30:00Z' }).recordedDate).toBe('2026-09-27');
  });

  it('trims, collapses whitespace and caps lengths', () => {
    const value = digest({
      ...base,
      title: `  ${'あ'.repeat(300)}  `,
      summary: ['  一行目\n改行あり ', '', 3, 'a', 'b', 'c', 'd'],
      participants: Array.from({ length: 50 }, (_, i) => `人${i}`),
    });
    expect(value.title).toHaveLength(120);
    expect(value.summary).toEqual(['一行目 改行あり', 'a', 'b', 'c', 'd']);
    expect(value.participants).toHaveLength(20);
  });

  it.each([
    ['not an object', 'x'],
    ['bad schema', { ...base, schema: 2 }],
    ['bad id', { ...base, recordingId: 'a/b' }],
    ['no id', { ...base, recordingId: '' }],
    ['bad kind', { ...base, kind: 'memo' }],
    ['bad date', { ...base, recordedAt: 'yesterday' }],
    ['bad recordedDate', { ...base, recordedDate: '9/26' }],
    ['no title', { ...base, title: '  ' }],
    ['empty summary', { ...base, summary: [] }],
    ['summary not an array', { ...base, summary: 'x' }],
  ])('refuses %s', (_name, input) => {
    expect(() => readVoiceDigest(input)).toThrow();
  });
});

describe('contentHash', () => {
  it('is the same for the same content and different when anything changes', async () => {
    const a = await contentHash(digest(base));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await contentHash(digest({ ...base }))).toBe(a);
    expect(await contentHash(digest({ ...base, title: '別の題名' }))).not.toBe(a);
    expect(await contentHash(digest({ ...base, summary: ['違う要点'] }))).not.toBe(a);
  });
});

describe('upsertVoiceDigests', () => {
  it('creates, then leaves identical content alone, then updates a change', async () => {
    const db = createDb();
    expect(await upsertVoiceDigests(db, [digest(base)], '2026-09-26T09:00:00.000Z')).toEqual([
      { recordingId: base.recordingId, status: 'created' },
    ]);
    // 同じ内容は書かない（取り込み時刻も変わらない）。
    expect((await upsertVoiceDigests(db, [digest(base)], '2026-09-27T09:00:00.000Z'))[0]?.status).toBe('unchanged');
    expect((await findVoiceDigest(db, base.recordingId))?.importedAt).toBe('2026-09-26T09:00:00.000Z');
    // 変わったら上書きし、取り込み時刻を進める。
    expect(
      (await upsertVoiceDigests(db, [digest({ ...base, title: '題名を変えた' })], '2026-09-28T09:00:00.000Z'))[0]?.status,
    ).toBe('updated');
    const stored = await findVoiceDigest(db, base.recordingId);
    expect(stored?.title).toBe('題名を変えた');
    expect(stored?.importedAt).toBe('2026-09-28T09:00:00.000Z');
  });

  it('takes several at once and reports each', async () => {
    const db = createDb();
    const results = await upsertVoiceDigests(db, [digest(base), digest(meeting)]);
    expect(results.map((r) => r.status)).toEqual(['created', 'created']);
    expect((await listVoiceDigestIndex(db)).map((row) => row.recordingId)).toEqual([
      base.recordingId,
      meeting.recordingId,
    ]);
  });

  it('keeps the last of the same recording sent twice in one batch', async () => {
    const db = createDb();
    const results = await upsertVoiceDigests(db, [digest(base), digest({ ...base, title: '後の題名' })]);
    expect(results).toHaveLength(1);
    expect((await findVoiceDigest(db, base.recordingId))?.title).toBe('後の題名');
  });

  it('refuses an empty batch and one over the limit', async () => {
    const db = createDb();
    await expect(upsertVoiceDigests(db, [])).rejects.toThrow();
    const many = Array.from({ length: VOICE_BATCH_LIMIT + 1 }, (_, i) => digest({ ...base, recordingId: `idea-${i}` }));
    await expect(upsertVoiceDigests(db, many)).rejects.toThrow();
  });

  it('stores lists as data and returns them intact', async () => {
    const db = createDb();
    await upsertVoiceDigests(db, [digest(meeting)]);
    const stored = await findVoiceDigest(db, meeting.recordingId);
    expect(stored?.participants).toEqual(['田中さん', '佐藤さん']);
    expect(stored?.actions).toEqual([{ task: '見積書を送る', owner: '田中', due: '9/30' }]);
    expect(stored?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('deleteVoiceDigest', () => {
  it('removes one, and says so when there is nothing to remove', async () => {
    const db = createDb();
    await upsertVoiceDigests(db, [digest(base)]);
    await deleteVoiceDigest(db, base.recordingId);
    expect(await findVoiceDigest(db, base.recordingId)).toBeNull();
    await expect(deleteVoiceDigest(db, base.recordingId)).rejects.toThrow();
  });
});

describe('queryVoiceDigests', () => {
  async function seeded() {
    const db = createDb();
    await upsertVoiceDigests(db, [
      digest(base),
      digest(meeting),
      digest({ ...base, recordingId: 'idea-old', recordedAt: '2026-08-01T00:00:00Z', recordedDate: '2026-08-01', title: '割引率は50%まで', summary: ['割引の上限'] }),
    ]);
    return db;
  }
  const ids = (rows: { recordingId: string }[]) => rows.map((row) => row.recordingId);

  it('newest first, limited by date and kind', async () => {
    const db = await seeded();
    expect(ids(await queryVoiceDigests(db, { limit: 10 }))).toEqual([base.recordingId, meeting.recordingId, 'idea-old']);
    expect(ids(await queryVoiceDigests(db, { limit: 10, from: '2026-09-01' }))).toEqual([base.recordingId, meeting.recordingId]);
    expect(ids(await queryVoiceDigests(db, { limit: 10, to: '2026-09-25' }))).toEqual([meeting.recordingId, 'idea-old']);
    expect(ids(await queryVoiceDigests(db, { limit: 10, kind: 'meeting' }))).toEqual([meeting.recordingId]);
    expect(await queryVoiceDigests(db, { limit: 1 })).toHaveLength(1);
  });

  it('needs every keyword, across title, points, decisions, actions, people and topics', async () => {
    const db = await seeded();
    // 古い録音のやること（競合の価格を調べる）にも「価格」があるので、3件。
    expect(ids(await queryVoiceDigests(db, { limit: 10, keywords: ['価格'] }))).toEqual([base.recordingId, meeting.recordingId, 'idea-old']);
    expect(ids(await queryVoiceDigests(db, { limit: 10, keywords: ['価格', '田中'] }))).toEqual([meeting.recordingId]);
    expect(ids(await queryVoiceDigests(db, { limit: 10, keywords: ['単価'] }))).toEqual([meeting.recordingId]);
    expect(ids(await queryVoiceDigests(db, { limit: 10, keywords: ['見積書'] }))).toEqual([meeting.recordingId]);
    expect(ids(await queryVoiceDigests(db, { limit: 10, keywords: ['納期'] }))).toEqual([meeting.recordingId]);
    expect(ids(await queryVoiceDigests(db, { limit: 10, keywords: ['存在しない語'] }))).toEqual([]);
  });

  it('reads % and _ as the characters they are', async () => {
    const db = await seeded();
    expect(ids(await queryVoiceDigests(db, { limit: 10, keywords: ['50%'] }))).toEqual(['idea-old']);
    expect(ids(await queryVoiceDigests(db, { limit: 10, keywords: ['%'] }))).toEqual(['idea-old']);
    expect(ids(await queryVoiceDigests(db, { limit: 10, keywords: ['_'] }))).toEqual([]);
  });
});

describe('voiceConfigured', () => {
  it('is false with no table (before the migration) or no rows, true once something arrived', async () => {
    expect(await voiceConfigured(createDb(false))).toBe(false);
    const db = createDb();
    expect(await voiceConfigured(db)).toBe(false);
    await upsertVoiceDigests(db, [digest(base)]);
    expect(await voiceConfigured(db)).toBe(true);
  });
});

describe('the four tools', () => {
  const NOW = Date.parse('2026-09-27T03:00:00Z');
  const TODAY = '2026-09-27';

  async function seeded() {
    const db = createDb();
    await upsertVoiceDigests(db, [digest(base), digest(meeting)], '2026-09-27T01:00:00.000Z');
    return db;
  }

  it('declares four read-only tools', () => {
    expect(VOICE_TOOLS.map((tool) => tool.name)).toEqual(['voice_recent', 'voice_search', 'voice_detail', 'voice_actions']);
    for (const tool of VOICE_TOOLS) expect(tool.description).toContain('読み取り専用');
  });

  it('voice_recent lists the latest conversations with the period and a reminder of what is held', async () => {
    const result = (await runVoiceRecentTool(await seeded(), { name: 'voice_recent', args: { days: 7 } }, TODAY, NOW)) as Record<string, any>;
    expect(result.期間).toEqual({ from: '2026-09-20', to: '2026-09-27' });
    expect(result.件数).toBe(2);
    expect(result.会話[0]).toMatchObject({ recording_id: base.recordingId, 種類: 'アイデア', 題名: '折りたたみ式ライトの企画' });
    expect(result.会話[1]).toMatchObject({ 種類: '会議', 参加者: ['田中さん', '佐藤さん'] });
    expect(result.注意).toContain('原文（文字起こし）と音声は持っていません');
    expect(result.鮮度の注意).toBeUndefined();
  });

  it('voice_recent says so when nothing arrived in the period, and when the last import is old', async () => {
    const db = await seeded();
    const result = (await runVoiceRecentTool(db, { name: 'voice_recent', args: { days: 1, kind: 'meeting' } }, TODAY, Date.parse('2026-10-05T00:00:00Z'))) as Record<string, any>;
    expect(result.件数).toBe(0);
    expect(result.該当なし).toContain('届いていません');
    expect(result.鮮度の注意).toContain('日前');
  });

  it('voice_search finds by words and says when there is nothing', async () => {
    const db = await seeded();
    const hit = (await runVoiceSearchTool(db, { name: 'voice_search', args: { keywords: ['価格', 'A社'] } }, NOW)) as Record<string, any>;
    expect(hit.件数).toBe(1);
    expect(hit.会話[0].recording_id).toBe(meeting.recordingId);
    const none = (await runVoiceSearchTool(db, { name: 'voice_search', args: { keywords: ['存在しない'] } }, NOW)) as Record<string, any>;
    expect(none.件数).toBe(0);
    expect(none.該当なし).toContain('該当する会話はありませんでした');
  });

  it('voice_detail returns everything for one conversation, and refuses a bad id', async () => {
    const db = await seeded();
    const found = (await runVoiceDetailTool(db, { name: 'voice_detail', args: { recording_id: meeting.recordingId } })) as Record<string, any>;
    expect(found.会話.決定事項).toEqual(['単価は据え置き']);
    expect(found.会話.やること).toEqual([{ 内容: '見積書を送る', 担当: '田中', 期限: '9/30' }]);
    expect(found.会話.論点).toEqual(['価格', '納期']);
    expect(found.会話.長さ分).toBe(42);
    expect(found.会話.取り込み日時).toBe('2026-09-27T01:00:00.000Z');
    expect(((await runVoiceDetailTool(db, { name: 'voice_detail', args: { recording_id: 'nothing' } })) as Record<string, any>).該当なし).toContain('ありません');
    expect(((await runVoiceDetailTool(db, { name: 'voice_detail', args: { recording_id: '../x' } })) as Record<string, any>).error).toBeDefined();
    expect(((await runVoiceDetailTool(db, { name: 'voice_detail', args: {} })) as Record<string, any>).error).toBeDefined();
  });

  it('voice_actions flattens actions with their conversation, and says completion is unknown', async () => {
    const result = (await runVoiceActionsTool(await seeded(), { name: 'voice_actions', args: {} }, TODAY, NOW)) as Record<string, any>;
    expect(result.件数).toBe(2);
    expect(result.やること).toContainEqual({ 日付: '2026-09-25', 会話: 'A社との価格交渉', 種類: '会議', recording_id: meeting.recordingId, 内容: '見積書を送る', 担当: '田中', 期限: '9/30' });
    expect(result.完了の記録).toContain('ありません');
  });

  it('turns a failed read into a message the model can relay, not an exception', async () => {
    const db = createDb(false);
    const result = (await runVoiceRecentTool(db, { name: 'voice_recent', args: {} }, TODAY, NOW)) as Record<string, any>;
    expect(result.error).toContain('読めませんでした');
  });

  it('reports an unknown tool instead of throwing', async () => {
    expect(await runVoiceTool(createDb(), { name: 'nope', args: {} }, TODAY)).toEqual({ error: '知らない道具です: nope' });
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
  it('appears only when the server has conversations to read', () => {
    const today = new Date(2026, 8, 27);
    expect(buildSystemPrompt(undefined, [], today, undefined, true, false, false, false)).not.toContain('voice_recent');
    const withVoice = buildSystemPrompt(undefined, [], today, undefined, true, false, false, true);
    expect(withVoice).toContain(VOICE_GUIDE);
    expect(VOICE_GUIDE).toContain('原文（文字起こし）も音声も持っていません');
  });
});
