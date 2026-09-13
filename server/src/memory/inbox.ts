import {
  parseJournal,
  SENSITIVITIES,
  type AiVerdict,
  type JournalEntry,
} from '@/features/inbox/journal';
import { splitTopic } from '@/features/inbox/topic';

import { invalid, newId, notFound, nowIso } from '../http';

/**
 * Journal entries and topics, in D1.
 *
 * The parser is the app's (`src/features/inbox/journal.ts`). That matters most
 * here: an entry pasted into the app and one sent straight from a Claude Code
 * skill must be read the same way, or the same text becomes two different
 * records depending on the route it took.
 */

const VERDICTS: readonly AiVerdict[] = ['accepted', 'rejected', 'undecided'];

export interface StoredJournal {
  id: string;
  entry: JournalEntry;
  createdAt: string;
}

export interface CreateJournalResult {
  id: string;
  entry: JournalEntry;
  problems: string[];
}

/**
 * Stores a journal entry.
 *
 * Accepts either the entry the app already parsed and the president checked, or
 * raw text alone, which the server parses itself. The second form is for routes
 * with no screen in between, such as a skill posting directly.
 *
 * `private` is refused: content-engine defines it as the part of life that is
 * never made into a record.
 */
export async function createJournal(
  db: D1Database,
  rawText: string,
  checked?: JournalEntry,
): Promise<CreateJournalResult> {
  if (!rawText.trim()) throw invalid('Journal の本文がありません。');
  const parsed = parseJournal(rawText);
  const entry = checked ?? parsed.entry;

  if (entry.sensitivity === 'private') {
    throw invalid('private の記録は保存しません。記録にしない領域です。');
  }
  if (!entry.topic) throw invalid('topic がありません。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw invalid('date が YYYY-MM-DD の形ではありません。');
  if (entry.sensitivity && !(SENSITIVITIES as readonly string[]).includes(entry.sensitivity)) {
    throw invalid('sensitivity が知らない値です。');
  }

  const id = newId('journal');
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO journal_entries
         (id, entry_date, topic, sensitivity, source, ai_verdict, entry_json, raw_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    )
    .bind(
      id,
      entry.date,
      entry.topic,
      entry.sensitivity,
      entry.source || null,
      entry.aiVerdict,
      JSON.stringify(entry),
      rawText,
      now,
      now,
    )
    .run();
  return { id, entry, problems: checked ? [] : parsed.problems };
}

export async function findSameJournal(db: D1Database, date: string, topic: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT id FROM journal_entries WHERE entry_date = ? AND topic = ? LIMIT 1;')
    .bind(date, topic)
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function listJournals(db: D1Database, limit = 100): Promise<StoredJournal[]> {
  const { results } = await db
    .prepare(
      `SELECT id, entry_json AS entryJson, created_at AS createdAt
       FROM journal_entries ORDER BY entry_date DESC, created_at DESC LIMIT ?;`,
    )
    .bind(limit)
    .all<{ id: string; entryJson: string; createdAt: string }>();
  return results.flatMap((row) => {
    try {
      return [{ id: row.id, entry: JSON.parse(row.entryJson) as JournalEntry, createdAt: row.createdAt }];
    } catch {
      return [];
    }
  });
}

export async function setJournalVerdict(
  db: D1Database,
  id: string,
  verdict: string,
  reason: string,
): Promise<void> {
  if (!(VERDICTS as readonly string[]).includes(verdict)) {
    throw invalid(`受け入れは ${VERDICTS.join(' / ')} のどれかです。`);
  }
  const row = await db
    .prepare('SELECT entry_json AS entryJson FROM journal_entries WHERE id = ?;')
    .bind(id)
    .first<{ entryJson: string }>();
  if (!row) throw notFound('その Journal はありません。');
  const entry = JSON.parse(row.entryJson) as JournalEntry;
  const updated: JournalEntry = { ...entry, aiVerdict: verdict as AiVerdict, aiReason: reason };
  await db
    .prepare('UPDATE journal_entries SET ai_verdict = ?, entry_json = ?, updated_at = ? WHERE id = ?;')
    .bind(verdict, JSON.stringify(updated), nowIso(), id)
    .run();
}

export interface StoredTopic {
  id: string;
  url: string | null;
  body: string | null;
  note: string | null;
  createdAt: string;
}

export async function createTopic(db: D1Database, pasted: string, note: string): Promise<string> {
  const { url, body } = splitTopic(pasted);
  if (!url && !body) throw invalid('リンクか本文を貼ってください。');
  const id = newId('topic');
  await db
    .prepare('INSERT INTO topics (id, url, body, note, created_at) VALUES (?, ?, ?, ?, ?);')
    .bind(id, url, body, note.trim() || null, nowIso())
    .run();
  return id;
}

export async function listTopics(db: D1Database, limit = 200): Promise<StoredTopic[]> {
  const { results } = await db
    .prepare(
      'SELECT id, url, body, note, created_at AS createdAt FROM topics ORDER BY created_at DESC LIMIT ?;',
    )
    .bind(limit)
    .all<StoredTopic>();
  return results;
}
