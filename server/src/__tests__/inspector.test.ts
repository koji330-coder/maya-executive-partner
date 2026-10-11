import {
  compareProjects,
  readInspectorObservation,
  readInspectorSearch,
  snapshotComparisonState,
} from '../memory/inspector';
import { memorySite } from '../memory/inspectorSite';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('memory inspector observation', () => {
  it('accepts a compact per-project manifest', () => {
    const observation = readInspectorObservation({
      snapshotId: HASH_A,
      sourceGeneratedAt: '2026-10-11T10:00:00+09:00',
      entryCount: 3,
      projects: [
        { project: 'MAYA', entryCount: 2, latestDate: '2026-10-11', fingerprint: HASH_A },
        { project: 'Content Hub', entryCount: 1, latestDate: '2026-10-10', fingerprint: HASH_B },
      ],
    });
    expect(observation.entryCount).toBe(3);
    expect(observation.projects).toHaveLength(2);
  });

  it('rejects a manifest whose project counts do not add up', () => {
    expect(() =>
      readInspectorObservation({
        snapshotId: HASH_A,
        sourceGeneratedAt: '2026-10-11T10:00:00+09:00',
        entryCount: 2,
        projects: [{ project: 'MAYA', entryCount: 1, fingerprint: HASH_A }],
      }),
    ).toThrow('一致しません');
  });
});

describe('memory inspector comparison', () => {
  it('distinguishes a newer local index from a stale local observation', () => {
    const d1 = { configured: true, snapshotId: HASH_A, sourceGeneratedAt: '2026-10-11T10:00:00Z' };
    expect(
      snapshotComparisonState(
        { snapshotId: HASH_B, sourceGeneratedAt: '2026-10-11T11:00:00Z' },
        d1,
      ),
    ).toBe('local_ahead');
    expect(
      snapshotComparisonState(
        { snapshotId: HASH_B, sourceGeneratedAt: '2026-10-11T09:00:00Z' },
        d1,
      ),
    ).toBe('d1_ahead');
  });

  it('shows exact matches, changed projects, and one-sided projects', () => {
    expect(
      compareProjects(
        [
          { project: 'same', entryCount: 1, fingerprint: HASH_A },
          { project: 'changed', entryCount: 2, fingerprint: HASH_A },
          { project: 'local', entryCount: 1, fingerprint: HASH_A },
        ],
        [
          { project: 'same', entryCount: 1, fingerprint: HASH_A },
          { project: 'changed', entryCount: 2, fingerprint: HASH_B },
          { project: 'remote', entryCount: 1, fingerprint: HASH_A },
        ],
      ).map(({ project, state }) => [project, state]),
    ).toEqual([
      ['changed', 'different'],
      ['local', 'local_only'],
      ['remote', 'd1_only'],
      ['same', 'synced'],
    ]);
  });

  it('parses browser search filters through the same defensive search arguments', () => {
    const url = new URL(
      'https://maya.example/memory/search?keyword=CardScan%20%E9%96%8B%E7%99%BA&kind=activity&from=2026-01-01',
    );
    expect(readInspectorSearch(url)).toEqual({
      keywords: ['CardScan', '開発'],
      from: '2026-01-01',
      kinds: ['activity'],
    });
  });
});

describe('memory inspector PWA', () => {
  it('serves an installable shell with no inline script', async () => {
    const response = memorySite('/memory/');
    expect(response?.headers.get('content-type')).toContain('text/html');
    const html = await response?.text();
    expect(html).toContain('/memory/manifest.webmanifest');
    expect(html).toContain('<script src="/memory/app.js" defer></script>');
    expect(html).not.toContain('<script>');
  });

  it('does not handle unrelated routes', () => {
    expect(memorySite('/v1/chat')).toBeUndefined();
  });
});
