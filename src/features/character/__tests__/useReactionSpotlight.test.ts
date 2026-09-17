import { deservesSpotlight, firstSentence } from '../useReactionSpotlight';
import type { MayaResponse } from '@/features/chat/mayaResponse';

function reply(overrides: Partial<MayaResponse> = {}): MayaResponse {
  return {
    message: '値上げは通ります。取引先の反応は分かれますが、粗利は戻ります。',
    emotion: 'neutral',
    pose: 'default',
    scene: 'work',
    voice: { shouldPlay: false },
    ...overrides,
  };
}

describe('deservesSpotlight', () => {
  it('leaves an ordinary explanation alone', () => {
    // The reaction reads as a reaction because most replies do not move her.
    expect(deservesSpotlight(reply())).toBe(false);
    expect(deservesSpotlight(reply({ emotion: 'smile' }))).toBe(false);
    expect(deservesSpotlight(reply({ emotion: 'thinking' }))).toBe(false);
  });

  it('comes closer when a decision was detected', () => {
    expect(
      deservesSpotlight(reply({ decision: { detected: true, title: '値上げに踏み切る' } })),
    ).toBe(true);
    expect(deservesSpotlight(reply({ decision: { detected: false } }))).toBe(false);
  });

  it('comes closer when she actually speaks', () => {
    // The contract already reserves a clip for greetings, strong disagreement,
    // warnings and real praise, so this needs no second judgement.
    expect(
      deservesSpotlight(reply({ voice: { shouldPlay: true, fixedClipKey: 'strong_disagree_01' } })),
    ).toBe(true);
  });

  it('comes closer for the sharp emotions', () => {
    for (const emotion of ['challenge', 'serious', 'happy', 'annoyed'] as const) {
      expect(deservesSpotlight(reply({ emotion }))).toBe(true);
    }
  });
});

describe('firstSentence', () => {
  it('takes the opening statement, not the whole reply', () => {
    expect(firstSentence(reply().message)).toBe('値上げは通ります。');
  });

  it('handles a reply with no sentence break', () => {
    expect(firstSentence('わかりました')).toBe('わかりました');
  });

  it('truncates a runaway opening rather than filling the screen', () => {
    const long = `${'あ'.repeat(200)}。`;
    expect(firstSentence(long).length).toBeLessThanOrEqual(61);
    expect(firstSentence(long).endsWith('…')).toBe(true);
  });
});
