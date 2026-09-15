import { buildSystemPrompt, SEARCH_GUIDE } from '@/features/chat/systemPrompt';

import { journalText, likePattern, readSearchArgs, refersToPast } from '../memory/search';

describe('readSearchArgs', () => {
  it('keeps what is well-formed and drops the rest', () => {
    expect(
      readSearchArgs({
        keywords: [' 値上げ ', '', 3, 'a', 'b', 'c', 'd', 'e'],
        from: '2025-04-01',
        to: '去年',
        kinds: ['journal', 'secrets'],
      }),
    ).toEqual({ keywords: ['値上げ', 'a', 'b', 'c', 'd'], from: '2025-04-01', kinds: ['journal'] });
  });

  it('searches everything when no kinds are given', () => {
    expect(readSearchArgs({}).kinds).toEqual(['journal', 'topic', 'decision']);
  });
});

describe('likePattern', () => {
  it('treats % and _ in a keyword literally', () => {
    expect(likePattern('100%_off')).toBe('%100\\%\\_off%');
  });
});

describe('journalText', () => {
  it("gives the president's words and leaves out the AI interpretation", () => {
    const text = journalText({
      journalVersion: 1,
      date: '2025-04-02',
      topic: '価格改定',
      relatedProjects: ['MAYA'],
      sourceType: '',
      source: '',
      sensitivity: 'business',
      context: ['原価が上がった'],
      motivation: [],
      decisions: ['5月から10%上げる'],
      userPerspective: ['客離れより赤字が怖い'],
      aiInterpretation: 'AIの読み',
      aiVerdict: 'undecided',
      aiReason: '',
      contentAngles: [],
      notes: '',
      extra: {},
    });
    expect(text).toContain('決めたこと: 5月から10%上げる');
    expect(text).toContain('社長の考え: 客離れより赤字が怖い');
    expect(text).not.toContain('AIの読み');
  });
});

describe('search guide in the prompt', () => {
  it('appears only when the request can search', () => {
    const today = new Date(2026, 8, 14);
    expect(buildSystemPrompt(undefined, [], today)).not.toContain('search_memory');
    expect(buildSystemPrompt(undefined, [], today, undefined, true)).toContain(SEARCH_GUIDE);
  });
});

describe('refersToPast', () => {
  it('catches the ways the president points back', () => {
    for (const message of ['去年の春、値上げについて何か決めてたっけ？', '前に採用の件で何を決めたか覚えてる？', '先月話した件']) {
      expect(refersToPast(message)).toBe(true);
    }
  });

  it('leaves ordinary consultations alone', () => {
    for (const message of ['おはよう。今日もよろしく。', '来月の値上げ、どう思う？', '粗利率を計算して']) {
      expect(refersToPast(message)).toBe(false);
    }
  });
});
