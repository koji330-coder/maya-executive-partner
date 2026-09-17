import type { DecisionContext } from '@/features/chat/systemPrompt';
import {
  decisionFromRow,
  RECALL_LIMIT,
  toDecisionContext,
  validateDraft,
  type ActionStatus,
  type DecisionDraft,
  type DecisionRecord,
  type DecisionRow,
  type DecisionStatus,
} from '@/features/decisions/types';

import { invalid, newId, notFound, nowIso } from '../http';

/**
 * Decisions and their next actions, in D1.
 *
 * The validation, the row mapping and the recall rules are the app's own
 * (`src/features/decisions/types.ts`), imported rather than rewritten, so a
 * decision the server accepts is one the app would have accepted.
 */

const DECISION_STATUSES: readonly DecisionStatus[] = ['active', 'completed', 'reconsider'];
const ACTION_STATUSES: readonly ActionStatus[] = ['open', 'done', 'cancelled'];

const SELECT_JOINED = `
  SELECT d.id, d.title, d.reason, d.status,
         d.follow_up_date AS followUpDate, d.created_at AS createdAt,
         a.id AS actionId, a.title AS actionTitle,
         a.due_date AS actionDueDate, a.status AS actionStatus
  FROM decisions d
  LEFT JOIN actions a ON a.decision_id = d.id`;

export interface CreateDecisionInput {
  draft: DecisionDraft;
  conversationId: string | null;
  sourceMessageId: string | null;
  projectId: string | null;
}

export function readDraft(value: unknown): DecisionDraft {
  const d = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const text = (key: string) => (typeof d[key] === 'string' ? (d[key] as string) : '');
  const draft: DecisionDraft = {
    title: text('title'),
    reason: text('reason'),
    actionTitle: text('actionTitle'),
    dueDate: text('dueDate'),
  };
  const problem = validateDraft(draft);
  if (problem === 'no_title') throw invalid('何を決めたかがありません。');
  if (problem === 'bad_date') throw invalid('期限は YYYY-MM-DD の形にしてください。');
  return draft;
}

/**
 * Stores a decision and its action in one batch.
 *
 * `batch` runs as a single transaction in D1. A decision stored without the
 * action it came with would look complete while the thing to check on is gone,
 * which is the same half-written state the sales sync was found to risk.
 */
export async function createDecision(db: D1Database, input: CreateDecisionInput): Promise<string> {
  const now = nowIso();
  const id = newId('decision');
  const dueDate = input.draft.dueDate.trim() || null;
  const statements = [
    db
      .prepare(
        `INSERT INTO decisions
           (id, project_id, conversation_id, source_message_id, title, reason, status,
            follow_up_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?);`,
      )
      .bind(
        id,
        input.projectId,
        input.conversationId,
        input.sourceMessageId,
        input.draft.title.trim(),
        input.draft.reason.trim() || null,
        dueDate,
        now,
        now,
      ),
  ];
  if (input.draft.actionTitle.trim()) {
    statements.push(
      db
        .prepare(
          `INSERT INTO actions (id, decision_id, title, due_date, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'open', ?, ?);`,
        )
        .bind(newId('action'), id, input.draft.actionTitle.trim(), dueDate, now, now),
    );
  }
  await db.batch(statements);
  return id;
}

export async function listDecisions(db: D1Database): Promise<DecisionRecord[]> {
  const { results } = await db.prepare(`${SELECT_JOINED} ORDER BY d.created_at DESC;`).all<DecisionRow>();
  return results.map(decisionFromRow);
}

export async function setDecisionStatus(db: D1Database, id: string, status: string): Promise<void> {
  if (!(DECISION_STATUSES as readonly string[]).includes(status)) {
    throw invalid(`状態は ${DECISION_STATUSES.join(' / ')} のどれかです。`);
  }
  const result = await db
    .prepare('UPDATE decisions SET status = ?, updated_at = ? WHERE id = ?;')
    .bind(status, nowIso(), id)
    .run();
  if (result.meta.changes === 0) throw notFound('その判断はありません。');
}

export async function setActionStatus(db: D1Database, id: string, status: string): Promise<void> {
  if (!(ACTION_STATUSES as readonly string[]).includes(status)) {
    throw invalid(`状態は ${ACTION_STATUSES.join(' / ')} のどれかです。`);
  }
  const result = await db
    .prepare('UPDATE actions SET status = ?, updated_at = ? WHERE id = ?;')
    .bind(status, nowIso(), id)
    .run();
  if (result.meta.changes === 0) throw notFound('その次の一手はありません。');
}

/** Replies in a conversation that already have a saved decision. */
export async function savedSourceMessages(db: D1Database, conversationId: string): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT source_message_id AS id FROM decisions
       WHERE conversation_id = ? AND source_message_id IS NOT NULL;`,
    )
    .bind(conversationId)
    .all<{ id: string }>();
  return results.map((row) => row.id);
}

/**
 * What goes into the prompt. Best effort: a consultation that cannot read its
 * decisions is still a consultation.
 */
export async function decisionsForPrompt(db: D1Database, limit = RECALL_LIMIT): Promise<DecisionContext[]> {
  try {
    const { results } = await db
      .prepare(`${SELECT_JOINED} WHERE d.status != 'completed' ORDER BY d.created_at DESC LIMIT ?;`)
      .bind(limit)
      .all<DecisionRow>();
    return results.map(decisionFromRow).map(toDecisionContext);
  } catch {
    return [];
  }
}
