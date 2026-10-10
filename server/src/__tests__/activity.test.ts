import {
  ACTIVITY_CHUNK_LIMIT,
  activityMemoryText,
  readActivityChunk,
  readActivityEntry,
  readActivitySyncStart,
} from '../memory/activity';

const HASH = 'a'.repeat(64);

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'content-engine:2026-10-10:abc',
    project: 'content-engine',
    date: '2026-10-10',
    dateSort: '2026-10-10',
    datePrecision: 'day',
    tags: ['Content Hub'],
    sensitivity: 'business',
    publishable: 'unclear',
    category: 'dev',
    sourceFile: 'CONTENT_LOG.md',
    sourceEntry: 13,
    sources: ['tools/content_hub.py'],
    sections: {
      やったこと: 'CONTENT_LOGをD1へ同期できるようにした。',
      成果: '要確認。',
      学び: '全件をプロンプトへ入れず検索する。',
    },
    contentHash: HASH,
    ...overrides,
  };
}

describe('CONTENT_LOG activity import validation', () => {
  it('accepts a Content Hub entry without rewriting its facts', () => {
    expect(readActivityEntry(entry()).sections['やったこと']).toBe('CONTENT_LOGをD1へ同期できるようにした。');
  });

  it('hard-blocks company and private even if a client sends them', () => {
    expect(() => readActivityEntry(entry({ sensitivity: 'company' }))).toThrow('home / business');
    expect(() => readActivityEntry(entry({ sensitivity: 'private' }))).toThrow('home / business');
  });

  it('bounds each upload below the D1 free-plan subrequest limit', () => {
    expect(() => readActivityChunk({ entries: Array.from({ length: ACTIVITY_CHUNK_LIMIT + 1 }, () => entry()) })).toThrow(
      `${ACTIVITY_CHUNK_LIMIT}件まで`,
    );
  });

  it('requires a stable snapshot hash and count', () => {
    expect(readActivitySyncStart({ snapshotId: HASH, sourceGeneratedAt: '2026-10-10T00:00:00+09:00', entryCount: 254 })).toEqual({
      snapshotId: HASH,
      sourceGeneratedAt: '2026-10-10T00:00:00+09:00',
      entryCount: 254,
    });
    expect(() => readActivitySyncStart({ snapshotId: 'short', sourceGeneratedAt: 'today', entryCount: -1 })).toThrow();
  });
});

describe('activityMemoryText', () => {
  it('keeps evidence and omits bare 要確認 sections', () => {
    const text = activityMemoryText({
      entryId: 'entry-1',
      project: 'content-engine',
      date: '2026-10-10',
      dateSort: '2026-10-10',
      sensitivity: 'home',
      sectionsJson: JSON.stringify(entry().sections),
      importedAt: '2026-10-10T01:00:00Z',
    });
    expect(text).toContain('[content-engine] CONTENT_LOGをD1へ同期できるようにした。');
    expect(text).toContain('学び: 全件をプロンプトへ入れず検索する。');
    expect(text).not.toContain('成果: 要確認');
  });
});
