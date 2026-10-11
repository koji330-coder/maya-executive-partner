import { ApiError, invalid, nowIso } from '../http';
import { activitySyncStatus } from './activity';
import { readSearchArgs, searchMemory, type SearchArgs } from './search';

const SOURCE = 'content-hub';
const HASH = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PROJECTS = 1000;

export interface ObservedProject {
  project: string;
  entryCount: number;
  latestDate?: string;
  fingerprint: string;
}

export interface InspectorObservation {
  snapshotId: string;
  sourceGeneratedAt: string;
  entryCount: number;
  projects: ObservedProject[];
}

interface StoredObservation extends InspectorObservation {
  observedAt: string;
}

interface ActivityEntryDigestRow {
  entryId: string;
  project: string;
  dateSort: string;
  contentHash: string;
}

export interface ProjectComparison {
  project: string;
  state: 'synced' | 'different' | 'local_only' | 'd1_only';
  localEntryCount: number;
  d1EntryCount: number;
  localLatestDate?: string;
  d1LatestDate?: string;
}

export function snapshotComparisonState(
  local: Pick<StoredObservation, 'snapshotId' | 'sourceGeneratedAt'> | undefined,
  d1: { configured: boolean; snapshotId?: string; sourceGeneratedAt?: string },
): 'unobserved' | 'd1_empty' | 'synced' | 'local_ahead' | 'd1_ahead' | 'diverged' {
  if (!local) return 'unobserved';
  if (!d1.configured) return 'd1_empty';
  if (local.snapshotId === d1.snapshotId) return 'synced';
  const localTime = Date.parse(local.sourceGeneratedAt);
  const d1Time = Date.parse(d1.sourceGeneratedAt ?? '');
  if (localTime > d1Time) return 'local_ahead';
  if (localTime < d1Time) return 'd1_ahead';
  return 'diverged';
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid('観測結果はJSONオブジェクトで指定してください。');
  }
  return value as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, key: string, max: number): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${key} がありません。`);
  if (value.length > max) throw invalid(`${key} が長すぎます。`);
  return value.trim();
}

function count(body: Record<string, unknown>, key: string, max: number): number {
  const value = body[key];
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw invalid(`${key} が不正です。`);
  }
  return value as number;
}

export function readInspectorObservation(value: unknown): InspectorObservation {
  const body = record(value);
  const snapshotId = requiredString(body, 'snapshotId', 64);
  if (!HASH.test(snapshotId)) throw invalid('snapshotId が不正です。');
  const sourceGeneratedAt = requiredString(body, 'sourceGeneratedAt', 50);
  if (!Number.isFinite(Date.parse(sourceGeneratedAt))) throw invalid('sourceGeneratedAt が日時ではありません。');
  const entryCount = count(body, 'entryCount', 5000);
  if (!Array.isArray(body.projects) || body.projects.length > MAX_PROJECTS) {
    throw invalid('projects が不正です。');
  }
  const names = new Set<string>();
  const projects = body.projects.map((raw) => {
    const projectBody = record(raw);
    const project = requiredString(projectBody, 'project', 200);
    if (names.has(project)) throw invalid(`projects に重複があります: ${project}`);
    names.add(project);
    const fingerprint = requiredString(projectBody, 'fingerprint', 64);
    if (!HASH.test(fingerprint)) throw invalid(`fingerprint が不正です: ${project}`);
    const latestDateValue = projectBody.latestDate;
    const latestDate = typeof latestDateValue === 'string' && DATE.test(latestDateValue) ? latestDateValue : undefined;
    return {
      project,
      entryCount: count(projectBody, 'entryCount', 5000),
      ...(latestDate ? { latestDate } : {}),
      fingerprint,
    };
  });
  if (projects.reduce((sum, project) => sum + project.entryCount, 0) !== entryCount) {
    throw invalid('projects の合計件数と entryCount が一致しません。');
  }
  return { snapshotId, sourceGeneratedAt, entryCount, projects };
}

export function requireInspectorDb(db?: D1Database): D1Database {
  if (!db) throw new ApiError(503, 'inspector_not_configured', '記憶インスペクターはまだ設定されていません。');
  return db;
}

export async function saveInspectorObservation(db: D1Database, observation: InspectorObservation): Promise<StoredObservation> {
  const observedAt = nowIso();
  await db
    .prepare(
      `INSERT INTO inspector_state
         (source, snapshot_id, source_generated_at, entry_count, project_count, projects_json, observed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET
         snapshot_id = excluded.snapshot_id,
         source_generated_at = excluded.source_generated_at,
         entry_count = excluded.entry_count,
         project_count = excluded.project_count,
         projects_json = excluded.projects_json,
         observed_at = excluded.observed_at;`,
    )
    .bind(
      SOURCE,
      observation.snapshotId,
      observation.sourceGeneratedAt,
      observation.entryCount,
      observation.projects.length,
      JSON.stringify(observation.projects),
      observedAt,
    )
    .run();
  return { ...observation, observedAt };
}

async function loadObservation(db: D1Database): Promise<StoredObservation | undefined> {
  const row = await db
    .prepare(
      `SELECT snapshot_id AS snapshotId, source_generated_at AS sourceGeneratedAt,
              entry_count AS entryCount, projects_json AS projectsJson, observed_at AS observedAt
       FROM inspector_state WHERE source = ?;`,
    )
    .bind(SOURCE)
    .first<{
      snapshotId: string;
      sourceGeneratedAt: string;
      entryCount: number;
      projectsJson: string;
      observedAt: string;
    }>();
  if (!row) return undefined;
  let projects: ObservedProject[] = [];
  try {
    projects = JSON.parse(row.projectsJson) as ObservedProject[];
  } catch {
    // A malformed inspector row must not affect MAYA. Show it as no project detail.
  }
  return { ...row, entryCount: Number(row.entryCount), projects };
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function d1Projects(db: D1Database): Promise<ObservedProject[]> {
  const { results } = await db
    .prepare(
      `SELECT entry_id AS entryId, project, date_sort AS dateSort, content_hash AS contentHash
       FROM activity_entries
       WHERE snapshot_id = (SELECT current_snapshot_id FROM activity_sync_state WHERE source = ?)
       ORDER BY project, entry_id;`,
    )
    .bind(SOURCE)
    .all<ActivityEntryDigestRow>();
  const grouped = new Map<string, ActivityEntryDigestRow[]>();
  for (const row of results) grouped.set(row.project, [...(grouped.get(row.project) ?? []), row]);
  return Promise.all(
    [...grouped.entries()].map(async ([project, rows]) => ({
      project,
      entryCount: rows.length,
      latestDate: rows.reduce((latest, row) => (row.dateSort > latest ? row.dateSort : latest), ''),
      fingerprint: await sha256(rows.map((row) => `${row.entryId}\0${row.contentHash}\n`).join('')),
    })),
  );
}

export function compareProjects(local: ObservedProject[], remote: ObservedProject[]): ProjectComparison[] {
  const localMap = new Map(local.map((project) => [project.project, project]));
  const remoteMap = new Map(remote.map((project) => [project.project, project]));
  return [...new Set([...localMap.keys(), ...remoteMap.keys()])]
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .map((project) => {
      const localProject = localMap.get(project);
      const remoteProject = remoteMap.get(project);
      const state = !localProject
        ? 'd1_only'
        : !remoteProject
          ? 'local_only'
          : localProject.entryCount === remoteProject.entryCount && localProject.fingerprint === remoteProject.fingerprint
            ? 'synced'
            : 'different';
      return {
        project,
        state,
        localEntryCount: localProject?.entryCount ?? 0,
        d1EntryCount: remoteProject?.entryCount ?? 0,
        ...(localProject?.latestDate ? { localLatestDate: localProject.latestDate } : {}),
        ...(remoteProject?.latestDate ? { d1LatestDate: remoteProject.latestDate } : {}),
      };
    });
}

export async function inspectorSummary(mayaDb: D1Database, inspectorDb: D1Database) {
  const [d1, local, remoteProjects] = await Promise.all([
    activitySyncStatus(mayaDb),
    loadObservation(inspectorDb),
    d1Projects(mayaDb),
  ]);
  const state = snapshotComparisonState(local, d1);
  return {
    state,
    local: local
      ? {
          snapshotId: local.snapshotId,
          sourceGeneratedAt: local.sourceGeneratedAt,
          entryCount: local.entryCount,
          projectCount: local.projects.length,
          observedAt: local.observedAt,
        }
      : null,
    d1: { ...d1, projectCount: remoteProjects.length },
  };
}

export async function inspectorProjects(mayaDb: D1Database, inspectorDb: D1Database) {
  const [local, remote] = await Promise.all([loadObservation(inspectorDb), d1Projects(mayaDb)]);
  const projects = compareProjects(local?.projects ?? [], remote);
  return {
    counts: projects.reduce(
      (totals, project) => ({ ...totals, [project.state]: totals[project.state] + 1 }),
      { synced: 0, different: 0, local_only: 0, d1_only: 0 },
    ),
    projects,
  };
}

export function readInspectorSearch(url: URL): SearchArgs {
  const keywords = url.searchParams
    .getAll('keyword')
    .flatMap((value) => value.split(/[\s,、]+/))
    .filter(Boolean);
  const kinds = url.searchParams.getAll('kind');
  return readSearchArgs({ keywords, kinds, from: url.searchParams.get('from'), to: url.searchParams.get('to') });
}

export async function inspectorSearch(db: D1Database, url: URL) {
  const searched = readInspectorSearch(url);
  const [hits, activitySource] = await Promise.all([searchMemory(db, searched), activitySyncStatus(db)]);
  return { searched, count: hits.length, hits, activitySource };
}
