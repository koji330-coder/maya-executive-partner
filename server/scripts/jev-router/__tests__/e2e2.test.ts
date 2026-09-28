import { CASES } from '../cases';
import { floorSet, toppSet } from '../pipelines2';
import { assumedToolMs, HOP_MS } from '../report2';
import { OPTIONS } from '../tools';

describe('E2E v2 cases', () => {
  it('labels useful tools the router can offer', () => {
    for (const c of CASES) {
      for (const tool of [c.useful, ...(c.usefulAcceptable ?? [])].filter(Boolean)) expect(OPTIONS).toContain(tool);
    }
  });

  it('never expects a tool when the answer is already in the conversation', () => {
    for (const c of CASES.filter((c) => c.contextSufficient)) expect(c.expected).toBe('none');
  });
});

describe('candidate sets', () => {
  const p = { none: 0.5, fitlog_day: 0.3, fitlog_progress: 0.15, voice_recent: 0.04, search_memory: 0.01 };

  it('topp takes tools until 90% of the tool mass, ignoring none', () => {
    // Tool mass 0.5: day 60%, progress 30% → 90% reached with two.
    expect(toppSet(p)).toEqual(['fitlog_day', 'fitlog_progress']);
  });

  it('floor keeps tools at 5% or more', () => {
    expect(floorSet(p)).toEqual(['fitlog_day', 'fitlog_progress']);
    expect(floorSet({ none: 0.99, voice_recent: 0.01 })).toEqual(['voice_recent']);
  });
});

describe('assumed tool time', () => {
  it('runs calls made together in parallel and rounds one after another', () => {
    const fetched = [
      { tool: 'haksai_inventory', args: {}, result: null, at: 1000 },
      { tool: 'fitlog_day', args: {}, result: null, at: 1001 },
      { tool: 'voice_recent', args: {}, result: null, at: 5000 },
    ];
    expect(assumedToolMs(fetched)).toBe(2 * HOP_MS + HOP_MS);
    expect(assumedToolMs([])).toBe(0);
  });
});
