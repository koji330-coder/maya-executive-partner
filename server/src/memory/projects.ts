import { invalid, newId, notFound, nowIso } from '../http';

/**
 * Projects, defined by the president.
 *
 * Not derived from repositories. Counting the git folders on the PC found that
 * one business spans thirty of them, one app spans three, and some projects
 * have no code at all (docs/PLATFORM_ARCHITECTURE.md). MAYA may propose
 * candidates; the list itself is his.
 */

export type ProjectStatus = 'active' | 'paused' | 'done';
export type SourceKind = 'github' | 'folder' | 'dataset';

const STATUSES: readonly ProjectStatus[] = ['active', 'paused', 'done'];
const SOURCE_KINDS: readonly SourceKind[] = ['github', 'folder', 'dataset'];

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  description: string | null;
  aliases: string[];
  sources: { kind: SourceKind; ref: string }[];
  createdAt: string;
}

/**
 * How a name is compared.
 *
 * Case, width and spacing are what differ between "MAYA", "maya" and
 * "ＭＡＹＡ " when the president types them; none of them change what he means.
 */
export function normalizeName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

export async function createProject(
  db: D1Database,
  input: { name: string; description?: string; aliases?: string[] },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw invalid('プロジェクトの名前がありません。');
  const id = newId('project');
  const now = nowIso();
  const aliases = [...new Set((input.aliases ?? []).map((a) => a.trim()).filter(Boolean))];
  await db.batch([
    db
      .prepare(
        `INSERT INTO projects (id, name, status, description, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?, ?);`,
      )
      .bind(id, name, input.description?.trim() || null, now, now),
    ...aliases.map((alias) =>
      db.prepare('INSERT OR IGNORE INTO project_aliases (project_id, alias) VALUES (?, ?);').bind(id, alias),
    ),
  ]);
  return id;
}

export async function listProjects(db: D1Database): Promise<Project[]> {
  const [projects, aliases, sources] = await db.batch([
    db.prepare(
      `SELECT id, name, status, description, created_at AS createdAt
       FROM projects ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, name;`,
    ),
    db.prepare('SELECT project_id AS projectId, alias FROM project_aliases ORDER BY alias;'),
    db.prepare('SELECT project_id AS projectId, kind, ref FROM project_sources ORDER BY kind, ref;'),
  ]);
  const aliasRows = (aliases?.results ?? []) as { projectId: string; alias: string }[];
  const sourceRows = (sources?.results ?? []) as { projectId: string; kind: SourceKind; ref: string }[];
  return ((projects?.results ?? []) as Omit<Project, 'aliases' | 'sources'>[]).map((project) => ({
    ...project,
    aliases: aliasRows.filter((row) => row.projectId === project.id).map((row) => row.alias),
    sources: sourceRows
      .filter((row) => row.projectId === project.id)
      .map((row) => ({ kind: row.kind, ref: row.ref })),
  }));
}

export async function updateProject(
  db: D1Database,
  id: string,
  patch: { name?: string; status?: string; description?: string },
): Promise<void> {
  if (patch.status !== undefined && !(STATUSES as readonly string[]).includes(patch.status)) {
    throw invalid(`状態は ${STATUSES.join(' / ')} のどれかです。`);
  }
  if (patch.name !== undefined && !patch.name.trim()) throw invalid('名前を空にはできません。');
  const current = await db
    .prepare('SELECT name, status, description FROM projects WHERE id = ?;')
    .bind(id)
    .first<{ name: string; status: string; description: string | null }>();
  if (!current) throw notFound('そのプロジェクトはありません。');
  await db
    .prepare('UPDATE projects SET name = ?, status = ?, description = ?, updated_at = ? WHERE id = ?;')
    .bind(
      patch.name?.trim() ?? current.name,
      patch.status ?? current.status,
      patch.description !== undefined ? patch.description.trim() || null : current.description,
      nowIso(),
      id,
    )
    .run();
}

async function requireProject(db: D1Database, id: string): Promise<void> {
  const row = await db.prepare('SELECT 1 AS ok FROM projects WHERE id = ?;').bind(id).first();
  if (!row) throw notFound('そのプロジェクトはありません。');
}

export async function addAlias(db: D1Database, id: string, alias: string): Promise<void> {
  if (!alias.trim()) throw invalid('別名が空です。');
  await requireProject(db, id);
  await db
    .prepare('INSERT OR IGNORE INTO project_aliases (project_id, alias) VALUES (?, ?);')
    .bind(id, alias.trim())
    .run();
}

export async function removeAlias(db: D1Database, id: string, alias: string): Promise<void> {
  await db.prepare('DELETE FROM project_aliases WHERE project_id = ? AND alias = ?;').bind(id, alias).run();
}

export async function addSource(db: D1Database, id: string, kind: string, ref: string): Promise<void> {
  if (!(SOURCE_KINDS as readonly string[]).includes(kind)) {
    throw invalid(`情報源の種類は ${SOURCE_KINDS.join(' / ')} のどれかです。`);
  }
  if (!ref.trim()) throw invalid('情報源の指定が空です。');
  await requireProject(db, id);
  await db
    .prepare('INSERT OR IGNORE INTO project_sources (project_id, kind, ref) VALUES (?, ?, ?);')
    .bind(id, kind, ref.trim())
    .run();
}

/**
 * Finds projects by name or alias.
 *
 * Exact after normalising, then containment. Enough for "maya" and "キャラ動かす"
 * without vector search, which the architecture defers until this falls short.
 */
export function matchProjects(projects: Project[], query: string): Project[] {
  const q = normalizeName(query);
  if (!q) return [];
  const names = (p: Project) => [p.name, ...p.aliases].map(normalizeName);
  const exact = projects.filter((p) => names(p).includes(q));
  if (exact.length > 0) return exact;
  return projects.filter((p) => names(p).some((name) => name.includes(q) || q.includes(name)));
}
