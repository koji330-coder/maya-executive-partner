import type { JournalEntry } from '@/features/inbox/journal';
import type { ToolCall, ToolDeclaration } from '@/services/llm/geminiClient';

/**
 * The tool MAYA uses to look further back than the prompt carries.
 *
 * The prompt holds a fixed-size slice of recent activity, so it costs the same
 * however much piles up. Anything older is found here, only on the turns that
 * need it.
 */

export const SEARCH_MEMORY_TOOL: ToolDeclaration = {
  name: 'search_memory',
  description:
    'Gakky の過去の記録を探します。Journal（活動と、そのとき決めたこと・考え）、保存した話題、記録した判断が対象です。' +
    'プロンプトにある最近の分より前のこと、または最近の分に無い細部が相談に必要なときだけ使います。',
  parameters: {
    type: 'object',
    properties: {
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description:
          '探す語。すべて含む記録を返します。日本語は文にせず、「値上げ」「採用」のような短い語に分けてください。空なら期間だけで探します。',
      },
      from: { type: 'string', description: 'この日以降（YYYY-MM-DD）。省略可。' },
      to: { type: 'string', description: 'この日まで（YYYY-MM-DD）。省略可。' },
      kinds: {
        type: 'array',
        items: { type: 'string', enum: ['journal', 'topic', 'decision'] },
        description: '対象。省略するとすべて。',
      },
    },
  },
};

export interface SearchArgs {
  keywords: string[];
  from?: string;
  to?: string;
  kinds: Kind[];
}

type Kind = 'journal' | 'topic' | 'decision';
const KINDS: readonly Kind[] = ['journal', 'topic', 'decision'];

export interface MemoryHit {
  kind: Kind;
  date: string;
  text: string;
}

/** How many records one search returns, and how long each may be. */
export const SEARCH_LIMIT = 8;
const HIT_CHARS = 400;
const MAX_KEYWORDS = 5;

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Reads the model's arguments defensively: it is untrusted input like any other. */
export function readSearchArgs(args: Record<string, unknown>): SearchArgs {
  const keywords = Array.isArray(args.keywords)
    ? args.keywords
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, MAX_KEYWORDS)
    : [];
  const kinds = Array.isArray(args.kinds)
    ? args.kinds.filter((k): k is Kind => (KINDS as readonly unknown[]).includes(k))
    : [];
  return {
    keywords,
    ...(isDate(args.from) ? { from: args.from } : {}),
    ...(isDate(args.to) ? { to: args.to } : {}),
    kinds: kinds.length ? kinds : [...KINDS],
  };
}

/** `%` and `_` in a keyword are meant literally, not as wildcards. */
export function likePattern(keyword: string): string {
  return `%${keyword.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const clip = (text: string) => (text.length > HIT_CHARS ? `${text.slice(0, HIT_CHARS)}…` : text);

/** A journal entry as the model reads it: the president's words, not the AI interpretation. */
export function journalText(entry: JournalEntry): string {
  const lines = [entry.topic];
  if (entry.context?.length) lines.push(`状況: ${entry.context.join(' / ')}`);
  if (entry.decisions?.length) lines.push(`決めたこと: ${entry.decisions.join(' / ')}`);
  if (entry.userPerspective?.length) lines.push(`Gakky の考え: ${entry.userPerspective.join(' / ')}`);
  if (entry.relatedProjects?.length) lines.push(`関連: ${entry.relatedProjects.join(', ')}`);
  return clip(lines.join('\n'));
}

/**
 * Searches journal entries, topics and decisions.
 *
 * Plain `LIKE`, every keyword required. For one president's records, thousands
 * of rows, that is milliseconds, and it matches Japanese without a tokenizer,
 * which SQLite's full-text search does not have. Full-text search is the next
 * step if this ever shows up in the response time.
 */
export async function searchMemory(db: D1Database, args: SearchArgs): Promise<MemoryHit[]> {
  const where = (dateColumn: string, textColumns: string[]) => {
    const clauses: string[] = [];
    const binds: string[] = [];
    if (args.from) {
      clauses.push(`${dateColumn} >= ?`);
      binds.push(args.from);
    }
    if (args.to) {
      // Dates stored with a time still count on the last day.
      clauses.push(`substr(${dateColumn}, 1, 10) <= ?`);
      binds.push(args.to);
    }
    for (const keyword of args.keywords) {
      clauses.push(`(${textColumns.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
      textColumns.forEach(() => binds.push(likePattern(keyword)));
    }
    return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', binds };
  };

  const queries: Promise<MemoryHit[]>[] = [];

  if (args.kinds.includes('journal')) {
    const { sql, binds } = where('entry_date', ['entry_json']);
    queries.push(
      db
        .prepare(
          `SELECT entry_date AS date, entry_json AS json FROM journal_entries ${sql}
           ORDER BY entry_date DESC, created_at DESC LIMIT ?;`,
        )
        .bind(...binds, SEARCH_LIMIT)
        .all<{ date: string; json: string }>()
        .then(({ results }) =>
          results.flatMap((row) => {
            try {
              return [{ kind: 'journal' as const, date: row.date, text: journalText(JSON.parse(row.json)) }];
            } catch {
              return [];
            }
          }),
        ),
    );
  }

  if (args.kinds.includes('topic')) {
    const { sql, binds } = where('created_at', ['body', 'note', 'url']);
    queries.push(
      db
        .prepare(`SELECT created_at AS at, url, body, note FROM topics ${sql} ORDER BY created_at DESC LIMIT ?;`)
        .bind(...binds, SEARCH_LIMIT)
        .all<{ at: string; url: string | null; body: string | null; note: string | null }>()
        .then(({ results }) =>
          results.map((row) => ({
            kind: 'topic' as const,
            date: row.at.slice(0, 10),
            text: clip([row.body, row.url, row.note ? `メモ: ${row.note}` : null].filter(Boolean).join('\n')),
          })),
        ),
    );
  }

  if (args.kinds.includes('decision')) {
    const { sql, binds } = where('created_at', ['title', 'reason']);
    queries.push(
      db
        .prepare(`SELECT created_at AS at, title, reason, status FROM decisions ${sql} ORDER BY created_at DESC LIMIT ?;`)
        .bind(...binds, SEARCH_LIMIT)
        .all<{ at: string; title: string; reason: string | null; status: string }>()
        .then(({ results }) =>
          results.map((row) => ({
            kind: 'decision' as const,
            date: row.at.slice(0, 10),
            text: clip(`${row.title}（${row.status}）${row.reason ? `\n理由: ${row.reason}` : ''}`),
          })),
        ),
    );
  }

  const hits = (await Promise.all(queries)).flat();
  hits.sort((a, b) => b.date.localeCompare(a.date));
  return hits.slice(0, SEARCH_LIMIT);
}

/** Runs a tool call from the model. Unknown tools are reported back, not thrown. */
export async function runMemoryTool(db: D1Database, call: ToolCall): Promise<unknown> {
  if (call.name !== SEARCH_MEMORY_TOOL.name) {
    return { error: `知らない道具です: ${call.name}` };
  }
  const args = readSearchArgs(call.args);
  const hits = await searchMemory(db, args);
  return {
    searched: args,
    count: hits.length,
    hits,
    ...(hits.length === 0 ? { note: '該当する記録はありませんでした。記録に無いことを作らないでください。' } : {}),
  };
}

/**
 * Whether the president is pointing at the past.
 *
 * Deliberately a word list, not a model's judgement: Flash-Lite, asked whether
 * to search, never did. A false positive costs one search, about a second; a
 * miss costs an invented or refused answer about something that is on record.
 */
const PAST_MARKERS =
  /前に|以前|去年|昨年|先月|先週|先日|この前|あの時|あのとき|当時|覚えて|決めてた|決めた(?:っけ|よね|けど)|言ってた|話した|だっけ|っけ|振り返|経緯|いつ(?:から|頃)/;

export function refersToPast(message: string): boolean {
  return PAST_MARKERS.test(message);
}
