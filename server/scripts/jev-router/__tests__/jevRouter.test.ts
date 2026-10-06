import { currentMayaSelection } from '../baseline';
import { CASES } from '../cases';
import { percentile, summarize, type EvalRow } from '../metrics';
import { buildQuestion, buildState } from '../prompts';
import { confidenceFromProbabilities } from '../routers';
import { OPTIONS } from '../tools';

function row(partial: Partial<EvalRow>): EvalRow {
  return {
    case_id: 'X',
    category: 'A_single',
    variant: 'minimal',
    router: 'test',
    user_message: '',
    context: [],
    expected_tool: 'none',
    acceptable_tools: [],
    ambiguous: false,
    jev_selected_tool: 'none',
    probabilities: {},
    confidence: null,
    confidence_derived: null,
    correct: true,
    correct_lenient: true,
    latency_ms: 100,
    input_tokens: null,
    estimated_cost_usd: null,
    model_version: null,
    error: null,
    ...partial,
  };
}

describe('jev router cases', () => {
  it('has at least 40 cases with unique ids', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  it('only expects options the router is offered', () => {
    for (const c of CASES) {
      expect(OPTIONS).toContain(c.expected);
      for (const alt of c.acceptable ?? []) expect(OPTIONS).toContain(alt);
    }
  });

  it('offers every production tool plus none', () => {
    expect(OPTIONS).toHaveLength(16);
    expect(OPTIONS).toContain('none');
  });

  it('keeps routing rules out of the minimal variant', () => {
    const c = CASES[0]!;
    expect(buildState('minimal', c)).not.toHaveProperty('maya_role');
    expect(typeof buildQuestion('minimal').instructions).toBe('string');
    const explicit = buildQuestion('explicit').instructions;
    expect(typeof explicit === 'object' && explicit.routing_rules.length).toBeGreaterThan(0);
    expect(Object.keys(buildQuestion('minimal').criteria)).toEqual(OPTIONS);
    expect(Object.keys(buildQuestion('explicit').criteria)).toEqual(OPTIONS);
  });
});

describe('jev router metrics', () => {
  it('derives confidence with the documented formula', () => {
    expect(confidenceFromProbabilities({ a: 1, b: 0, c: 0 })).toBeCloseTo(1);
    expect(confidenceFromProbabilities({ a: 0.5, b: 0.5 })).toBeCloseTo(0);
  });

  it('uses nearest-rank percentiles', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
  });

  it('counts high-confidence mistakes and none errors', () => {
    const summary = summarize([
      row({ expected_tool: 'fitlog_day', jev_selected_tool: 'none', correct: false, correct_lenient: false, confidence: 0.92 }),
      row({ expected_tool: 'none', jev_selected_tool: 'haksai_sales', correct: false, correct_lenient: false, confidence: 0.6 }),
      row({ expected_tool: 'fitlog_day', jev_selected_tool: 'fitlog_day', confidence: 1 }),
      row({ error: 'boom', jev_selected_tool: null }),
    ]);
    expect(summary.errors).toBe(1);
    expect(summary.top1.correct).toBe(1);
    expect(summary.highConfidenceWrong.map((r) => r.jev_selected_tool)).toEqual(['none']);
    expect(summary.toolNeededButNone.correct).toBe(1);
    expect(summary.noneNeededButTool.correct).toBe(1);
    expect(summary.bands.find((b) => b.label === '90–100')!.rate.total).toBe(2);
  });
});

describe('current MAYA baseline snapshot', () => {
  it('narrows a plain fitness question to FIT LOG and forces a tool', () => {
    const selection = currentMayaSelection({ id: 't', category: 'A_single', message: '今日の体重は？', expected: 'fitlog_day' });
    expect(selection.offered.every((name) => name.startsWith('fitlog_'))).toBe(true);
    expect(selection.forceTool).toBe(true);
  });
});
