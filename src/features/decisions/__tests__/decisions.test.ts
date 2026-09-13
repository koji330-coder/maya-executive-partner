import { buildSystemPrompt, formatDecisions, type DecisionContext } from '@/features/chat/systemPrompt';
import type { MayaResponse } from '@/features/chat/mayaResponse';

import { toDecisionContext } from '../decisionRepository';
import {
  draftFromResponse,
  isIsoDate,
  STATUS_LABEL,
  validateDraft,
  type DecisionRecord,
} from '../types';

const TODAY = new Date(2026, 8, 13); // 2026-09-13, local

function reply(overrides: Partial<MayaResponse> = {}): MayaResponse {
  return {
    message: '価格は据え置きます。',
    emotion: 'serious',
    pose: 'default',
    scene: 'work',
    voice: { shouldPlay: false },
    ...overrides,
  };
}

const priceHold: DecisionContext = {
  date: '2026-08-20',
  title: '競合の10%値下げに追従せず価格を維持',
  reason: '同じ粗利額には45%の増産が要り、工場が持たない',
  status: 'active',
  action: { title: '主要3社に価格据え置きを伝える', dueDate: '2026-09-01' },
};

describe('status labels', () => {
  it('does not call a made decision 検討中', () => {
    // The prompt teaches the model that "under consideration" is not a
    // decision. Labelling saved decisions that way inverted the meaning.
    expect(STATUS_LABEL.active).toBe('実行中');
    expect(Object.values(STATUS_LABEL)).not.toContain('検討中');
  });
});

describe('draftFromResponse', () => {
  it('starts from what the model detected', () => {
    const draft = draftFromResponse(
      reply({
        decision: { detected: true, title: '価格を維持', reason: '粗利が持たない' },
        nextAction: { detected: true, title: '3社に連絡', dueDate: '2026-09-20' },
      }),
    );
    expect(draft).toEqual({
      title: '価格を維持',
      reason: '粗利が持たない',
      actionTitle: '3社に連絡',
      dueDate: '2026-09-20',
    });
  });

  it('drops a due date the model wrote in prose', () => {
    // 「来週中」 cannot be sorted or compared with today, so it would silently
    // never count as overdue.
    const draft = draftFromResponse(
      reply({
        decision: { detected: true, title: '価格を維持' },
        nextAction: { detected: true, title: '3社に連絡', dueDate: '来週中' },
      }),
    );
    expect(draft.dueDate).toBe('');
  });

  it('ignores a next action the model did not actually detect', () => {
    const draft = draftFromResponse(
      reply({
        decision: { detected: true, title: '価格を維持' },
        nextAction: { detected: false, title: '残骸' },
      }),
    );
    expect(draft.actionTitle).toBe('');
  });
});

describe('validateDraft', () => {
  const base = { title: '価格を維持', reason: '', actionTitle: '', dueDate: '' };

  it('needs only a title', () => {
    expect(validateDraft(base)).toBeNull();
    expect(validateDraft({ ...base, title: '   ' })).toBe('no_title');
  });

  it('rejects a date that matches the pattern but does not exist', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(validateDraft({ ...base, dueDate: '2026-02-30' })).toBe('bad_date');
    expect(validateDraft({ ...base, dueDate: '2026-09-30' })).toBeNull();
  });
});

describe('toDecisionContext', () => {
  const record: DecisionRecord = {
    id: 'decision-1',
    title: '価格を維持',
    reason: '',
    status: 'active',
    createdAt: '2026-08-20T09:30:00.000Z',
    followUpDate: null,
    action: { id: 'action-1', title: '3社に連絡', dueDate: '2026-09-01', status: 'done' },
  };

  it('leaves out an action that is already done', () => {
    // A finished action is not something to remind him about.
    expect(toDecisionContext(record).action).toBeUndefined();
  });

  it('keeps an open action', () => {
    const context = toDecisionContext({
      ...record,
      action: { ...record.action!, status: 'open' },
    });
    expect(context.action).toEqual({ title: '3社に連絡', dueDate: '2026-09-01' });
  });
});

describe('formatDecisions', () => {
  it('says outright that there are none', () => {
    // With nothing written, the model fills the gap with an invented
    // "you decided last month".
    const text = formatDecisions([], TODAY);
    expect(text).toContain('まだありません');
    expect(text).toContain('記録に無い過去の判断を持ち出さないでください');
  });

  it('gives each decision its date, status and reason', () => {
    const text = formatDecisions([priceHold], TODAY);
    expect(text).toContain('2026-08-20［実行中］競合の10%値下げに追従せず価格を維持');
    expect(text).toContain('理由: 同じ粗利額には45%の増産が要り');
  });

  it('marks an overdue next action against today', () => {
    expect(formatDecisions([priceHold], TODAY)).toContain('（期限 2026-09-01） ※期限切れ');
    const notYet = { ...priceHold, action: { title: '連絡', dueDate: '2026-09-30' } };
    // The usage notes mention 期限切れ in prose, so look for the marker itself.
    expect(formatDecisions([notYet], TODAY)).not.toContain('※期限切れ');
  });

  it('tells her to raise a conflict, not to forbid the change', () => {
    const text = formatDecisions([priceHold], TODAY);
    expect(text).toContain('何が変わりましたか');
    expect(text).toContain('判断を変えること自体は止めません');
  });

  it('tells her not to detect a recorded decision twice', () => {
    expect(formatDecisions([priceHold], TODAY)).toContain('二重に記録されます');
  });
});

describe('buildSystemPrompt', () => {
  it('always carries a decisions section, even with none saved', () => {
    expect(buildSystemPrompt(undefined, [], TODAY)).toContain('社長が記録した過去の判断はまだありません');
  });

  it('puts the decisions before the protocol that asks her to check them', () => {
    const prompt = buildSystemPrompt(undefined, [priceHold], TODAY);
    expect(prompt.indexOf('競合の10%値下げ')).toBeLessThan(prompt.indexOf('過去の判断と矛盾しないか'));
  });
});
