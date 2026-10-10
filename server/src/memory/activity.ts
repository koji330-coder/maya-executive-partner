import { invalid, notFound, nowIso } from '../http';

const SOURCE = 'content-hub';
export const ACTIVITY_CHUNK_LIMIT = 40;
const ENTRY_LIMIT = 5000;
const MAX_SECTIONS_JSON = 120_000;
const ALLOWED_SENSITIVITY = new Set(['home', 'business']);
const ALLOWED_PUBLISHABLE = new Set(['yes', 'likely', 'unclear', 'no']);
const SNAPSHOT_ID = /^[a-f0-9]{64}$/;
const CONTENT_HASH = /^[a-f0-9]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ActivitySyncStart {
  snapshotId: string;
  sourceGeneratedAt: string;
  entryCount: number;
}

export interface ActivityEntryInput {
  id: string;
  project: string;
  date: string;
  dateSort: string;
  datePrecision: string;
  tags: string[];
  sensitivity: 'home' | 'business';
  publishable: 'yes' | 'likely' | 'unclear' | 'no';
  category: string;
  sourceFile: string;
  sourceEntry: number;
  sources: string[];
  sections: Record<string, string>;
  contentHash: string;
}

export interface ActivitySyncStatus {
  configured: boolean;
  source: typeof SOURCE;
  snapshotId?: string;
  sourceGeneratedAt?: string;
  entryCount: number;
  completedAt?: string;
}

export interface ActivityMemoryRow {
  entryId: string;
  project: string;
  date: string;
  dateSort: string;
  sensitivity: 'home' | 'business';
  sectionsJson: string;
  importedAt: string;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid('活動同期の本文がオブジェクトではありません。');
  }
  return value as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, key: string, max: number): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${key} がありません。`);
  if (value.length > max) throw invalid(`${key} が長すぎます。`);
  return value.trim();
}

function stringArray(value: unknown, key: string, limit = 40): string[] {
  if (!Array.isArray(value)) throw invalid(`${key} は配列で指定してください。`);
  const items = value.map((item) => {
    if (typeof item !== 'string' || !item.trim() || item.length > 500) {
      throw invalid(`${key} に不正な値があります。`);
    }
    return item.trim();
  });
  if (items.length > limit) throw invalid(`${key} の件数が多すぎます。`);
  return items;
}

export function readActivitySyncStart(value: unknown): ActivitySyncStart {
  const body = object(value);
  const snapshotId = requiredString(body, 'snapshotId', 64);
  if (!SNAPSHOT_ID.test(snapshotId)) throw invalid('snapshotId はSHA-256の16進文字列で指定してください。');
  const sourceGeneratedAt = requiredString(body, 'sourceGeneratedAt', 50);
  if (!Number.isFinite(Date.parse(sourceGeneratedAt))) throw invalid('sourceGeneratedAt が日時ではありません。');
  const entryCount = body.entryCount;
  if (!Number.isInteger(entryCount) || (entryCount as number) < 0 || (entryCount as number) > ENTRY_LIMIT) {
    throw invalid(`entryCount は0〜${ENTRY_LIMIT}の整数で指定してください。`);
  }
  return { snapshotId, sourceGeneratedAt, entryCount: entryCount as number };
}

export function readActivityEntry(value: unknown): ActivityEntryInput {
  const body = object(value);
  const sensitivity = requiredString(body, 'sensitivity', 20);
  if (!ALLOWED_SENSITIVITY.has(sensitivity)) {
    throw invalid('MAYAへ同期できるsensitivityは home / business だけです。');
  }
  const publishable = requiredString(body, 'publishable', 20);
  if (!ALLOWED_PUBLISHABLE.has(publishable)) throw invalid('publishable が不正です。');
  const dateSort = requiredString(body, 'dateSort', 10);
  if (!ISO_DATE.test(dateSort)) throw invalid('dateSort はYYYY-MM-DDで指定してください。');
  const contentHash = requiredString(body, 'contentHash', 64);
  if (!CONTENT_HASH.test(contentHash)) throw invalid('contentHash はSHA-256の16進文字列で指定してください。');

  const rawSections = object(body.sections);
  const sections: Record<string, string> = {};
  for (const [key, section] of Object.entries(rawSections)) {
    if (!key.trim() || key.length > 80 || typeof section !== 'string' || section.length > 30_000) {
      throw invalid('sections に不正な項目があります。');
    }
    sections[key.trim()] = section;
  }
  if (JSON.stringify(sections).length > MAX_SECTIONS_JSON) throw invalid('sections が大きすぎます。');

  const sourceEntry = body.sourceEntry;
  if (!Number.isInteger(sourceEntry) || (sourceEntry as number) < 1) throw invalid('sourceEntry が不正です。');

  return {
    id: requiredString(body, 'id', 400),
    project: requiredString(body, 'project', 200),
    date: requiredString(body, 'date', 300),
    dateSort,
    datePrecision: requiredString(body, 'datePrecision', 30),
    tags: stringArray(body.tags, 'tags'),
    sensitivity: sensitivity as ActivityEntryInput['sensitivity'],
    publishable: publishable as ActivityEntryInput['publishable'],
    category: requiredString(body, 'category', 100),
    sourceFile: requiredString(body, 'sourceFile', 500),
    sourceEntry: sourceEntry as number,
    sources: stringArray(body.sources, 'sources', 80),
    sections,
    contentHash,
  };
}

export function readActivityChunk(value: unknown): ActivityEntryInput[] {
  const body = object(value);
  if (!Array.isArray(body.entries) || body.entries.length === 0) throw invalid('entries がありません。');
  if (body.entries.length > ACTIVITY_CHUNK_LIMIT) {
    throw invalid(`1回に同期できる活動は${ACTIVITY_CHUNK_LIMIT}件までです。`);
  }
  return body.entries.map(readActivityEntry);
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function searchText(entry: ActivityEntryInput): string {
  return normalizeSearch(
    [entry.project, ...entry.tags, entry.category, entry.date, ...Object.values(entry.sections)].join('\n'),
  );
}

export async function startActivitySync(db: D1Database, input: ActivitySyncStart): Promise<void> {
  const existing = await db
    .prepare('SELECT source_generated_at AS generatedAt, expected_count AS expectedCount FROM activity_sync_runs WHERE snapshot_id = ?;')
    .bind(input.snapshotId)
    .first<{ generatedAt: string; expectedCount: number }>();
  if (existing && (existing.generatedAt !== input.sourceGeneratedAt || existing.expectedCount !== input.entryCount)) {
    throw invalid('同じsnapshotIdに異なる索引情報は登録できません。');
  }
  await db
    .prepare(
      `INSERT OR IGNORE INTO activity_sync_runs
         (snapshot_id, source_generated_at, expected_count, status, created_at)
       VALUES (?, ?, ?, 'uploading', ?);`,
    )
    .bind(input.snapshotId, input.sourceGeneratedAt, input.entryCount, nowIso())
    .run();
}

export async function writeActivityChunk(
  db: D1Database,
  snapshotId: string,
  entries: ActivityEntryInput[],
): Promise<number> {
  if (!SNAPSHOT_ID.test(snapshotId)) throw invalid('snapshotId が不正です。');
  const run = await db
    .prepare('SELECT status FROM activity_sync_runs WHERE snapshot_id = ?;')
    .bind(snapshotId)
    .first<{ status: string }>();
  if (!run) throw notFound('同期セッションがありません。先に開始してください。');
  if (run.status !== 'uploading') throw invalid('完了した同期セッションには追記できません。');
  const importedAt = nowIso();
  const statement = db.prepare(
    `INSERT OR REPLACE INTO activity_entries
       (snapshot_id, entry_id, project, activity_date, date_sort, date_precision,
        tags_json, sensitivity, publishable, category, source_file, source_entry,
        sources_json, sections_json, search_text, content_hash, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
  );
  await db.batch(
    entries.map((entry) =>
      statement.bind(
        snapshotId,
        entry.id,
        entry.project,
        entry.date,
        entry.dateSort,
        entry.datePrecision,
        JSON.stringify(entry.tags),
        entry.sensitivity,
        entry.publishable,
        entry.category,
        entry.sourceFile,
        entry.sourceEntry,
        JSON.stringify(entry.sources),
        JSON.stringify(entry.sections),
        searchText(entry),
        entry.contentHash,
        importedAt,
      ),
    ),
  );
  return entries.length;
}

export async function completeActivitySync(db: D1Database, snapshotId: string): Promise<ActivitySyncStatus> {
  if (!SNAPSHOT_ID.test(snapshotId)) throw invalid('snapshotId が不正です。');
  const run = await db
    .prepare(
      `SELECT source_generated_at AS sourceGeneratedAt, expected_count AS expectedCount, status
       FROM activity_sync_runs WHERE snapshot_id = ?;`,
    )
    .bind(snapshotId)
    .first<{ sourceGeneratedAt: string; expectedCount: number; status: string }>();
  if (!run) throw notFound('同期セッションがありません。');
  const countRow = await db
    .prepare('SELECT COUNT(*) AS count FROM activity_entries WHERE snapshot_id = ?;')
    .bind(snapshotId)
    .first<{ count: number }>();
  const count = Number(countRow?.count ?? 0);
  if (count !== run.expectedCount) {
    throw invalid(`同期件数が一致しません。予定 ${run.expectedCount}件 / 受信 ${count}件。`);
  }
  const completedAt = nowIso();
  await db.batch([
    db
      .prepare("UPDATE activity_sync_runs SET status = 'complete', completed_at = ? WHERE snapshot_id = ?;")
      .bind(completedAt, snapshotId),
    db
      .prepare(
        `INSERT INTO activity_sync_state
           (source, current_snapshot_id, source_generated_at, entry_count, completed_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(source) DO UPDATE SET
           current_snapshot_id = excluded.current_snapshot_id,
           source_generated_at = excluded.source_generated_at,
           entry_count = excluded.entry_count,
           completed_at = excluded.completed_at;`,
      )
      .bind(SOURCE, snapshotId, run.sourceGeneratedAt, count, completedAt),
    db.prepare('DELETE FROM activity_entries WHERE snapshot_id <> ?;').bind(snapshotId),
    db.prepare('DELETE FROM activity_sync_runs WHERE snapshot_id <> ?;').bind(snapshotId),
  ]);
  return {
    configured: true,
    source: SOURCE,
    snapshotId,
    sourceGeneratedAt: run.sourceGeneratedAt,
    entryCount: count,
    completedAt,
  };
}

export async function activitySyncStatus(db: D1Database): Promise<ActivitySyncStatus> {
  const row = await db
    .prepare(
      `SELECT current_snapshot_id AS snapshotId, source_generated_at AS sourceGeneratedAt,
              entry_count AS entryCount, completed_at AS completedAt
       FROM activity_sync_state WHERE source = ?;`,
    )
    .bind(SOURCE)
    .first<Omit<ActivitySyncStatus, 'configured' | 'source'>>();
  if (!row) return { configured: false, source: SOURCE, entryCount: 0 };
  return { configured: true, source: SOURCE, ...row, entryCount: Number(row.entryCount) };
}

export function activityMemoryText(row: ActivityMemoryRow): string {
  let sections: Record<string, string> = {};
  try {
    sections = JSON.parse(row.sectionsJson) as Record<string, string>;
  } catch {
    // The synchronizer validates JSON. A damaged row is still identifiable by project/date.
  }
  const parts = [`[${row.project}] ${sections['やったこと'] || '活動記録'}`];
  for (const [label, key] of [
    ['なぜ', 'なぜやった'],
    ['成果', '成果'],
    ['失敗・苦労', '苦労・失敗'],
    ['学び', '学び'],
  ] as const) {
    const value = sections[key]?.trim();
    if (value && !/^要確認[。]?$/.test(value)) parts.push(`${label}: ${value}`);
  }
  return parts.join('\n');
}
