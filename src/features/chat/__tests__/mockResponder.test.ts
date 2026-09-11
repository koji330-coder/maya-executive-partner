import { MOCK_SCRIPTS, MockResponderError, pickScript, respondTo } from '../mockResponder';

describe('mockResponder', () => {
  it('every scripted payload survives the validator', () => {
    for (const script of MOCK_SCRIPTS) {
      if (script.failure) continue;
      expect(() => respondTo('', script.id)).not.toThrow();
    }
  });

  it('picks the price script for a pricing question', () => {
    expect(pickScript('競合が値下げしてきた').id).toBe('price-cut');
  });

  it('falls back to the general script', () => {
    expect(pickScript('なんとなく不安です').id).toBe('default');
  });

  it('returns the contract fields the Talk screen renders', () => {
    const reply = respondTo('値下げすべきか');
    expect(reply.response.emotion).toBe('challenge');
    expect(reply.response.options).toHaveLength(3);
    expect(reply.response.options?.filter((o) => o.recommended)).toHaveLength(1);
    expect(reply.response.nextAction?.detected).toBe(true);
    expect(reply.response.voice.fixedClipKey).toBe('strong_disagree_01');
  });

  it('surfaces a detected decision with its reason', () => {
    const reply = respondTo('値下げには追随しないと決めた');
    expect(reply.response.decision?.detected).toBe(true);
    expect(reply.response.decision?.title).toBeTruthy();
  });

  it('reports repairs rather than failing on an off-contract reply', () => {
    const reply = respondTo('', 'malformed');
    expect(reply.response.emotion).toBe('neutral');
    expect(reply.warnings.length).toBeGreaterThan(0);
  });

  it('throws for the scripted failure so the screen can offer a retry', () => {
    expect(() => respondTo('', 'failure')).toThrow(MockResponderError);
  });
});
