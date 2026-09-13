import { ServerError, serverRequest, usingServer } from '@/services/api/server';
import { openDatabase } from '@/services/storage';

import type { AiVerdict, JournalEntry } from './journal';
import { splitTopic } from './topic';

// Moved to ./topic so the server can share them; re-exported for existing imports.
export { isXLink, linkLabel, splitTopic } from './topic';

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export interface StoredJournal {
  id: string;
  entry: JournalEntry;
  createdAt: string;
}

export class InboxError extends Error {}

/**
 * The server's refusals carry a message meant for the president (a private entry,
 * an empty topic). Surfaced as `InboxError` so the inbox screen shows them as-is.
 */
function asInboxError(error: unknown): unknown {
  return error instanceof ServerError && error.status === 400 ? new InboxError(error.message) : error;
}

/**
 * Stores a journal entry the president has checked.
 *
 * `private` is refused rather than stored. content-engine defines it as the
 * part of life that is never turned into a record at all, and a journal entry
 * marked that way reaching a database is exactly what the label exists to stop.
 */
export async function saveJournal(entry: JournalEntry, rawText: string): Promise<string> {
  if (entry.sensitivity === 'private') {
    throw new InboxError('private の記録は保存しません。content-engine の決まりで、記録にしない領域です。');
  }
  if (await usingServer()) {
    try {
      const { id } = await serverRequest<{ id: string }>('/v1/journal', {
        method: 'POST',
        body: { entry, rawText },
      });
      return id;
    } catch (error) {
      throw asInboxError(error);
    }
  }
  const db = await openDatabase();
  const now = new Date().toISOString();
  const id = newId('journal');
  await db.runAsync(
    `INSERT INTO cached_journal_entries
       (id, entry_date, topic, sensitivity, source, ai_verdict, entry_json, raw_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
  );
  return id;
}

/**
 * An entry already stored with the same date and topic.
 *
 * The same chat output tends to get pasted twice: once to try, once for real.
 * Warned about, not blocked, because two different entries can share a topic.
 */
export async function findSameJournal(date: string, topic: string): Promise<string | null> {
  if (await usingServer()) {
    const { id } = await serverRequest<{ id: string | null }>(
      `/v1/journal/duplicate?date=${encodeURIComponent(date)}&topic=${encodeURIComponent(topic)}`,
    );
    return id;
  }
  try {
    const db = await openDatabase();
    const row = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM cached_journal_entries WHERE entry_date = ? AND topic = ? LIMIT 1;',
      date,
      topic,
    );
    return row?.id ?? null;
  } catch {
    return null;
  }
}

export async function listJournals(limit = 100): Promise<StoredJournal[]> {
  if (await usingServer()) {
    const { entries } = await serverRequest<{ entries: StoredJournal[] }>('/v1/journal');
    return entries.slice(0, limit);
  }
  try {
    const db = await openDatabase();
    const rows = await db.getAllAsync<{ id: string; entryJson: string; createdAt: string }>(
      `SELECT id, entry_json AS entryJson, created_at AS createdAt
       FROM cached_journal_entries ORDER BY entry_date DESC, created_at DESC LIMIT ?;`,
      limit,
    );
    return rows.flatMap((row) => {
      try {
        return [{ id: row.id, entry: JSON.parse(row.entryJson) as JournalEntry, createdAt: row.createdAt }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/** Records whether the president took the AI's reading, after the fact too. */
export async function setJournalVerdict(
  id: string,
  entry: JournalEntry,
  verdict: AiVerdict,
  reason: string,
): Promise<void> {
  if (await usingServer()) {
    await serverRequest(`/v1/journal/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { verdict, reason },
    });
    return;
  }
  const db = await openDatabase();
  const updated: JournalEntry = { ...entry, aiVerdict: verdict, aiReason: reason };
  await db.runAsync(
    'UPDATE cached_journal_entries SET ai_verdict = ?, entry_json = ?, updated_at = ? WHERE id = ?;',
    verdict,
    JSON.stringify(updated),
    new Date().toISOString(),
    id,
  );
}

export interface StoredTopic {
  id: string;
  url: string | null;
  body: string | null;
  note: string | null;
  createdAt: string;
}

export async function saveTopic(pasted: string, note: string): Promise<string> {
  const { url, body } = splitTopic(pasted);
  if (!url && !body) {
    throw new InboxError('リンクか本文を貼ってください。');
  }
  if (await usingServer()) {
    try {
      const { id } = await serverRequest<{ id: string }>('/v1/topics', { method: 'POST', body: { pasted, note } });
      return id;
    } catch (error) {
      throw asInboxError(error);
    }
  }
  const db = await openDatabase();
  const id = newId('topic');
  await db.runAsync(
    'INSERT INTO cached_topics (id, url, body, note, created_at) VALUES (?, ?, ?, ?, ?);',
    id,
    url,
    body,
    note.trim() || null,
    new Date().toISOString(),
  );
  return id;
}

export async function listTopics(limit = 200): Promise<StoredTopic[]> {
  if (await usingServer()) {
    const { topics } = await serverRequest<{ topics: StoredTopic[] }>('/v1/topics');
    return topics.slice(0, limit);
  }
  try {
    const db = await openDatabase();
    return await db.getAllAsync<StoredTopic>(
      'SELECT id, url, body, note, created_at AS createdAt FROM cached_topics ORDER BY created_at DESC LIMIT ?;',
      limit,
    );
  } catch {
    return [];
  }
}
