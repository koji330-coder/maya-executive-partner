import type { MayaResponse } from '@/features/chat/mayaResponse';

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
