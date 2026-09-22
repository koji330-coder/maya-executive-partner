import { validateMayaResponse } from '../mayaResponse';

const valid = {
  message: 'Gakky、その値下げは私は反対です。',
  emotion: 'challenge',
  pose: 'lean_forward',
  scene: 'strategy',
  voice: { shouldPlay: true, fixedClipKey: 'strong_disagree_01', style: 'calm_serious' },
};

describe('validateMayaResponse', () => {
  it('accepts a reply that matches the contract', () => {
    const result = validateMayaResponse(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.value.emotion).toBe('challenge');
    expect(result.value.voice.shouldPlay).toBe(true);
  });

  it('rejects a payload that is not an object', () => {
    expect(validateMayaResponse('Gakky、こんにちは')).toEqual({
      ok: false,
      errors: ['The response was not a JSON object.'],
    });
  });

  it('rejects a reply with nothing to say', () => {
    const result = validateMayaResponse({ ...valid, message: '   ' });
    expect(result.ok).toBe(false);
  });

  it('repairs enum values the contract does not list', () => {
    const result = validateMayaResponse({
      ...valid,
      emotion: 'sarcastic',
      pose: 'floating',
      scene: 'space',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.emotion).toBe('neutral');
    expect(result.value.pose).toBe('default');
    expect(result.value.scene).toBe('work');
    expect(result.warnings).toHaveLength(3);
  });

  it('stays silent when voice asks to play without a clip', () => {
    const result = validateMayaResponse({ ...valid, voice: { shouldPlay: true } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.voice.shouldPlay).toBe(false);
    expect(result.warnings.join(' ')).toContain('fixedClipKey');
  });

  it('marks a recommendation when options arrive without one', () => {
    const result = validateMayaResponse({
      ...valid,
      options: [{ label: '下げる' }, { label: '据え置く' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.options?.map((o) => o.recommended)).toEqual([false, true]);
  });

  it('keeps a single recommendation when several are marked', () => {
    const result = validateMayaResponse({
      ...valid,
      options: [
        { label: 'A', recommended: true },
        { label: 'B', recommended: true },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.options?.filter((o) => o.recommended)).toHaveLength(1);
  });

  it('trims more than three options', () => {
    const result = validateMayaResponse({
      ...valid,
      options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.options).toHaveLength(3);
  });

  it('will not save a decision that has no title', () => {
    const result = validateMayaResponse({ ...valid, decision: { detected: true } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.decision?.detected).toBe(false);
    expect(result.warnings.join(' ')).toContain('decision.detected');
  });

  it('keeps a detected decision that has one', () => {
    const result = validateMayaResponse({
      ...valid,
      decision: { detected: true, title: '値下げには追随しない', reason: '粗利が落ちる。' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.decision).toEqual({
      detected: true,
      title: '値下げには追随しない',
      reason: '粗利が落ちる。',
    });
  });
});
