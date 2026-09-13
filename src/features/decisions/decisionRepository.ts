import type { DecisionContext } from '@/features/chat/systemPrompt';
import { openDatabase } from '@/services/storage';

import {
  decisionFromRow,
  RECALL_LIMIT,
  toDecisionContext,
  type ActionStatus,
  type DecisionDraft,
  type DecisionRecord,
  type DecisionRow,
  type DecisionStatus,
} from './types';

// Moved to ./types so the server can share them; re-exported for existing imports.
export { RECALL_LIMIT, toDecisionContext } from './types';

/**
 * Decision persistence.
 *
 * `company_id` is `'current'` for the same reason it is in the conversation
 * repository: v0.1 has one company per device, and the column exists so a
 * second one does not need a migration.
 */
const COMPANY_ID = 'current';

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export interface SaveDecisionInput {
  draft: DecisionDraft;
  conversationId: string | null;
  sourceMessageId: string | null;
}

/**
 * Stores a confirmed decision and its next action together.
 *
 * One transaction, because a decision saved without the action it came with
 * would look complete on the Decisions screen while the thing to check on is
 * missing.
 */
export async function saveDecision({
  draft,
  conversationId,
  sourceMessageId,
}: SaveDecisionInput): Promise<string> {
  const db = await openDatabase();
  const now = new Date().toISOString();
  const decisionId = newId('decision');
  const dueDate = draft.dueDate.trim() || null;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cached_decisions
         (id, company_id, conversation_id, source_message_id, title, reason, status,
          follow_up_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?);`,
      decisionId,
      COMPANY_ID,
      conversationId,
      sourceMessageId,
      draft.title.trim(),
      draft.reason.trim() || null,
      // The action's due date is when this decision gets looked at again.
      dueDate,
      now,
      now,
    );
    if (draft.actionTitle.trim()) {
      await db.runAsync(
        `INSERT INTO cached_actions
           (id, decision_id, company_id, title, due_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?);`,
        newId('action'),
        decisionId,
        COMPANY_ID,
        draft.actionTitle.trim(),
        dueDate,
        now,
        now,
      );
    }
  });
  return decisionId;
}

/** Newest first. Each decision carries at most one action in v0.1. */
export async function listDecisions(): Promise<DecisionRecord[]> {
  try {
    const db = await openDatabase();
    const rows = await db.getAllAsync<DecisionRow>(
      `SELECT d.id, d.title, d.reason, d.status,
              d.follow_up_date AS followUpDate, d.created_at AS createdAt,
              a.id AS actionId, a.title AS actionTitle,
              a.due_date AS actionDueDate, a.status AS actionStatus
       FROM cached_decisions d
       LEFT JOIN cached_actions a ON a.decision_id = d.id
       WHERE d.company_id = ?
       ORDER BY d.created_at DESC;`,
      COMPANY_ID,
    );
    return rows.map(decisionFromRow);
  } catch {
    return [];
  }
}

export async function setDecisionStatus(id: string, status: DecisionStatus): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    'UPDATE cached_decisions SET status = ?, updated_at = ? WHERE id = ?;',
    status,
    new Date().toISOString(),
    id,
  );
}

export async function setActionStatus(id: string, status: ActionStatus): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    'UPDATE cached_actions SET status = ?, updated_at = ? WHERE id = ?;',
    status,
    new Date().toISOString(),
    id,
  );
}

/** Replies in a conversation that already have a saved decision. */
export async function savedSourceMessages(conversationId: string): Promise<Set<string>> {
  try {
    const db = await openDatabase();
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT source_message_id AS id FROM cached_decisions
       WHERE conversation_id = ? AND source_message_id IS NOT NULL;`,
      conversationId,
    );
    return new Set(rows.map((row) => row.id));
  } catch {
    return new Set();
  }
}

/**
 * The decisions MAYA should remember, for the system prompt.
 *
 * Recall is best effort in the same way saving a message is: a consultation
 * that cannot read its history is still a consultation, so a failure returns
 * nothing rather than failing the send.
 */
export async function loadDecisionsForPrompt(limit = RECALL_LIMIT): Promise<DecisionContext[]> {
  try {
    const db = await openDatabase();
    const rows = await db.getAllAsync<DecisionRow>(
      `SELECT d.id, d.title, d.reason, d.status,
              d.follow_up_date AS followUpDate, d.created_at AS createdAt,
              a.id AS actionId, a.title AS actionTitle,
              a.due_date AS actionDueDate, a.status AS actionStatus
       FROM cached_decisions d
       LEFT JOIN cached_actions a ON a.decision_id = d.id
       WHERE d.company_id = ? AND d.status != 'completed'
       ORDER BY d.created_at DESC
       LIMIT ?;`,
      COMPANY_ID,
      limit,
    );
    return rows.map(decisionFromRow).map(toDecisionContext);
  } catch {
    return [];
  }
}
