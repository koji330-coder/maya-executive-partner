import { ACTIVITY_BUDGET_CHARS, buildSystemPrompt, formatActivity, type JournalContext } from '../systemPrompt';

const journal = (i: number): JournalContext => ({
  date: `2026-09-${String(14 - (i % 14)).padStart(2, '0')}`,
  topic: `記録${i} ${'あ'.repeat(200)}`,
  decisions: ['決めた1', '決めた2', '決めた3'],
  userPerspective: ['考え1'],
});

describe('formatActivity', () => {
  it('adds nothing when there is no activity', () => {
    expect(formatActivity()).toBeNull();
    expect(formatActivity({ journals: [], topics: [] })).toBeNull();
    expect(buildSystemPrompt(undefined, [], new Date(2026, 8, 14))).not.toContain('最近の活動');
  });

  it('stays within the budget however many entries there are', () => {
    const many = { journals: Array.from({ length: 500 }, (_, i) => journal(i)), topics: [] };
    const text = formatActivity(many) ?? '';
    expect(text.length).toBeLessThanOrEqual(ACTIVITY_BUDGET_CHARS);
    // Newest kept, oldest dropped.
    expect(text).toContain('記録0');
    expect(text).not.toContain('記録499');
  });

  it("shows the president's own words, not the AI interpretation", () => {
    const text = formatActivity({
      journals: [journal(0)],
      topics: [{ date: '2026-09-13', text: 'https://x.com/a/status/1', note: 'あとで読む' }],
    });
    expect(text).toContain('決めたこと: 決めた1');
    expect(text).not.toContain('決めた3');
    expect(text).toContain('Gakky の考え: 考え1');
    expect(text).toContain('（メモ: あとで読む）');
  });
});
