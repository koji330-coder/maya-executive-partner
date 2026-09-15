/**
 * Journal entries, as they arrive from chat and as they are stored.
 *
 * A journal skill in ChatGPT or Claude writes an entry into the chat. Nothing
 * collected those entries, which is why the journal stopped after its first day:
 * writing one was easy, but it had nowhere to go. MAYA is now that place.
 *
 * Copying out of a chat mangles the format. Rendered markdown turns `-` list
 * markers into `*` and pushes the next key under the previous list, so the text
 * is no longer valid YAML. The parser here is tolerant on purpose: it recovers
 * the structure from known keys instead of trusting indentation.
 *
 * It repairs the form and leaves the words alone. Rewriting the content with a
 * model would turn the president's own account into the model's, and a journal
 * exists precisely to keep what he said.
 */

export type Sensitivity = 'home' | 'business' | 'company' | 'private';

export const SENSITIVITIES: readonly Sensitivity[] = ['home', 'business', 'company', 'private'];

/** Whether the president took the AI's reading of the conversation. */
export type AiVerdict = 'accepted' | 'rejected' | 'undecided';

export interface JournalEntry {
  journalVersion: number | null;
  date: string;
  topic: string;
  relatedProjects: string[];
  sourceType: string;
  source: string;
  sensitivity: Sensitivity | null;
  context: string[];
  motivation: string[];
  decisions: string[];
  userPerspective: string[];
  aiInterpretation: string;
  aiVerdict: AiVerdict;
  aiReason: string;
  contentAngles: string[];
  notes: string;
  /**
   * Keys this version does not know yet. Kept rather than dropped, because the
   * skill carries a `journal_version` and will grow fields before this app does.
   */
  extra: Record<string, string | string[]>;
}

const LIST_KEYS = {
  related_projects: 'relatedProjects',
  context: 'context',
  motivation: 'motivation',
  decisions: 'decisions',
  user_perspective: 'userPerspective',
  content_angles: 'contentAngles',
} as const;

const SCALAR_KEYS = {
  journal_version: 'journalVersion',
  date: 'date',
  topic: 'topic',
  source_type: 'sourceType',
  source: 'source',
  sensitivity: 'sensitivity',
} as const;

const AI_KEYS = ['interpretation', 'accepted', 'reason'] as const;

type ListField = (typeof LIST_KEYS)[keyof typeof LIST_KEYS];

export function emptyEntry(): JournalEntry {
  return {
    journalVersion: null,
    date: '',
    topic: '',
    relatedProjects: [],
    sourceType: '',
    source: '',
    sensitivity: null,
    context: [],
    motivation: [],
    decisions: [],
    userPerspective: [],
    aiInterpretation: '',
    aiVerdict: 'undecided',
    aiReason: '',
    contentAngles: [],
    notes: '',
    extra: {},
  };
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  return v;
}

function verdictFrom(value: string): AiVerdict {
  const v = unquote(value).toLowerCase();
  if (v === 'true' || v === 'yes' || v === '受け入れ' || v === 'accepted') return 'accepted';
  if (v === 'false' || v === 'no' || v === '却下' || v === 'rejected') return 'rejected';
  return 'undecided';
}

/** Splits `---` front matter from the body that follows it. */
function splitFrontMatter(text: string): { head: string; body: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const fences = lines.flatMap((line, index) => (/^\s*---\s*$/.test(line) ? [index] : []));
  const [open, close] = fences;
  if (open !== undefined && close !== undefined) {
    return {
      head: lines.slice(open + 1, close).join('\n'),
      body: lines.slice(close + 1).join('\n'),
    };
  }
  // No fences: everything up to the first markdown heading is the header.
  const heading = lines.findIndex((line) => /^#\s/.test(line));
  return heading === -1
    ? { head: lines.join('\n'), body: '' }
    : { head: lines.slice(0, heading).join('\n'), body: lines.slice(heading).join('\n') };
}

/** The `# Notes` section, without its heading. */
function notesFrom(body: string): string {
  return body
    .replace(/^\s*#\s*Notes\s*\n/i, '')
    .trim();
}

export interface ParseResult {
  entry: JournalEntry;
  /** Things the president should look at before saving. Never fatal. */
  problems: string[];
}

export function parseJournal(text: string): ParseResult {
  const entry = emptyEntry();
  const problems: string[] = [];
  const { head, body } = splitFrontMatter(text);

  let listTarget: ListField | 'extra' | null = null;
  let extraKey: string | null = null;
  let inAi = false;

  for (const raw of head.split('\n')) {
    if (!raw.trim()) {
      continue;
    }

    const bullet = raw.match(/^\s*[-*•]\s+(.*)$/);
    const keyed = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);

    // A known key wins over indentation. That is the whole repair: the chat
    // indents `source_type:` under a list item, but it is still a top-level key.
    if (keyed && !bullet) {
      const key = keyed[1] ?? '';
      const value = keyed[2] ?? '';
      if (key === 'ai_feedback') {
        inAi = true;
        listTarget = null;
        continue;
      }
      if (inAi && (AI_KEYS as readonly string[]).includes(key)) {
        if (key === 'interpretation') entry.aiInterpretation = unquote(value);
        if (key === 'accepted') entry.aiVerdict = verdictFrom(value);
        if (key === 'reason') entry.aiReason = unquote(value);
        continue;
      }
      inAi = false;
      if (key in LIST_KEYS) {
        listTarget = LIST_KEYS[key as keyof typeof LIST_KEYS];
        // `related_projects: [a, b]` on one line.
        const inline = value.trim().match(/^\[(.*)\]$/);
        if (inline) {
          entry[listTarget].push(...(inline[1] ?? '').split(',').map(unquote).filter(Boolean));
        } else if (value.trim()) {
          entry[listTarget].push(unquote(value));
        }
        continue;
      }
      if (key in SCALAR_KEYS) {
        listTarget = null;
        const field = SCALAR_KEYS[key as keyof typeof SCALAR_KEYS];
        const v = unquote(value);
        if (field === 'journalVersion') {
          entry.journalVersion = Number.isFinite(Number(v)) && v !== '' ? Number(v) : null;
        } else if (field === 'sensitivity') {
          entry.sensitivity = (SENSITIVITIES as readonly string[]).includes(v) ? (v as Sensitivity) : null;
          if (v && !entry.sensitivity) problems.push(`sensitivity「${v}」は知らない値です。`);
        } else {
          entry[field] = v;
        }
        continue;
      }
      // Unknown key: keep it, and treat what follows as its list.
      listTarget = 'extra';
      extraKey = key;
      entry.extra[key] = value.trim() ? unquote(value) : [];
      continue;
    }

    if (bullet) {
      const item = unquote(bullet[1] ?? '');
      if (listTarget === 'extra' && extraKey) {
        const current = entry.extra[extraKey];
        entry.extra[extraKey] = Array.isArray(current) ? [...current, item] : [String(current), item];
      } else if (listTarget && listTarget !== 'extra') {
        entry[listTarget].push(item);
      } else {
        problems.push(`どの項目にも属さない行を見つけました: ${item.slice(0, 30)}`);
      }
      continue;
    }

    // A wrapped line with no marker continues whatever came last.
    const continuation = unquote(raw);
    if (inAi && entry.aiInterpretation) {
      entry.aiInterpretation += continuation;
    } else if (listTarget && listTarget !== 'extra' && entry[listTarget].length > 0) {
      const list = entry[listTarget];
      list[list.length - 1] += continuation;
    }
  }

  entry.notes = notesFrom(body);

  if (!entry.topic) problems.push('topic がありません。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) problems.push('date が YYYY-MM-DD の形ではありません。');
  if (!entry.sensitivity) problems.push('sensitivity がありません。');
  if (
    entry.context.length +
      entry.motivation.length +
      entry.decisions.length +
      entry.userPerspective.length ===
    0
  ) {
    problems.push('context / motivation / decisions / user_perspective が1つも読めませんでした。');
  }

  return { entry, problems };
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function listBlock(key: string, items: string[]): string[] {
  return items.length === 0 ? [`${key}: []`] : [`${key}:`, ...items.map((item) => `  - ${quote(item)}`)];
}

/**
 * The entry as clean front matter.
 *
 * What goes back out to content-engine, or anywhere else: `-` markers, two-space
 * indentation, every string quoted. The shape the skill meant to produce.
 */
export function formatJournal(entry: JournalEntry): string {
  const accepted =
    entry.aiVerdict === 'accepted' ? 'true' : entry.aiVerdict === 'rejected' ? 'false' : 'null';
  const lines = [
    '---',
    `journal_version: ${entry.journalVersion ?? 1}`,
    `date: ${entry.date}`,
    `topic: ${quote(entry.topic)}`,
    ...listBlock('related_projects', entry.relatedProjects),
    `source_type: ${entry.sourceType}`,
    `source: ${quote(entry.source)}`,
    `sensitivity: ${entry.sensitivity ?? ''}`,
    ...listBlock('context', entry.context),
    ...listBlock('motivation', entry.motivation),
    ...listBlock('decisions', entry.decisions),
    ...listBlock('user_perspective', entry.userPerspective),
    'ai_feedback:',
    `  interpretation: ${quote(entry.aiInterpretation)}`,
    `  accepted: ${accepted}`,
    `  reason: ${quote(entry.aiReason)}`,
    ...listBlock('content_angles', entry.contentAngles),
    ...Object.entries(entry.extra).flatMap(([key, value]) =>
      Array.isArray(value) ? listBlock(key, value) : [`${key}: ${quote(value)}`],
    ),
    '---',
  ];
  if (entry.notes) {
    lines.push('', '# Notes', '', entry.notes);
  }
  return lines.join('\n');
}
