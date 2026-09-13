import type { MayaResponse } from '@/features/chat/mayaResponse';
import type { DecisionContext } from '@/features/chat/systemPrompt';

export type DecisionStatus = 'active' | 'completed' | 'reconsider';
export type ActionStatus = 'open' | 'done' | 'cancelled';

/**
 * What each status means to the president.
 *
 * `active` used to read 検討中. That was backwards: a decision still under
 * consideration is exactly what the prompt tells the model NOT to detect as a
 * decision. A saved decision has been made and is being carried out.
 */
export const STATUS_LABEL: Record<DecisionStatus, string> = {
  active: '実行中',
  completed: '完了',
  reconsider: '見直し',
};

export interface ActionRecord {
  id: string;
  title: string;
  dueDate: string | null;
  status: ActionStatus;
}

export interface DecisionRecord {
  id: string;
  title: string;
  reason: string;
  status: DecisionStatus;
  createdAt: string;
  followUpDate: string | null;
  action: ActionRecord | null;
}

/** What the president confirms before a decision is stored. */
export interface DecisionDraft {
  title: string;
  reason: string;
  actionTitle: string;
  /** `YYYY-MM-DD`, or empty. */
  dueDate: string;
}

/**
 * Starts the editor from what the model detected.
 *
 * Prefilled rather than blank because the model is usually close, and blank
 * would ask the president to write the decision twice. Editable because
 * "usually" is the reason `docs/UX_SPEC.md` asks for correction at all.
 */
export function draftFromResponse(response: MayaResponse): DecisionDraft {
  const action = response.nextAction?.detected ? response.nextAction : undefined;
  return {
    title: response.decision?.title ?? '',
    reason: response.decision?.reason ?? '',
    actionTitle: action?.title ?? '',
    dueDate: action?.dueDate && isIsoDate(action.dueDate) ? action.dueDate : '',
  };
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  // 2026-02-30 matches the pattern and is not a date.
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export type DraftProblem = 'no_title' | 'bad_date';

/** Only what would make the stored record wrong. Everything else is optional. */
export function validateDraft(draft: DecisionDraft): DraftProblem | null {
  if (draft.title.trim().length === 0) {
    return 'no_title';
  }
  if (draft.dueDate.trim() && !isIsoDate(draft.dueDate.trim())) {
    return 'bad_date';
  }
  return null;
}

/** A decision joined to its action, as both the app and the server query it. */
export interface DecisionRow {
  id: string;
  title: string;
  reason: string | null;
  status: DecisionStatus;
  followUpDate: string | null;
  createdAt: string;
  actionId: string | null;
  actionTitle: string | null;
  actionDueDate: string | null;
  actionStatus: ActionStatus | null;
}

export function decisionFromRow(row: DecisionRow): DecisionRecord {
  return {
    id: row.id,
    title: row.title,
    reason: row.reason ?? '',
    status: row.status,
    createdAt: row.createdAt,
    followUpDate: row.followUpDate,
    action:
      row.actionId && row.actionTitle && row.actionStatus
        ? {
            id: row.actionId,
            title: row.actionTitle,
            dueDate: row.actionDueDate,
            status: row.actionStatus,
          }
        : null,
  };
}

/**
 * How many past decisions go into each prompt.
 *
 * Enough to cover a quarter of a busy president's decisions, few enough that
 * the list does not crowd out the company profile or the conversation. Oldest
 * falls off first; `completed` ones are left out entirely because a finished
 * decision is not something the new question can conflict with.
 */
export const RECALL_LIMIT = 12;

export function toDecisionContext(record: DecisionRecord): DecisionContext {
  return {
    date: record.createdAt.slice(0, 10),
    title: record.title,
    reason: record.reason || undefined,
    status: record.status,
    action:
      record.action && record.action.status === 'open'
        ? { title: record.action.title, dueDate: record.action.dueDate ?? undefined }
        : undefined,
  };
}
