import { artworkEmotions, hasArtwork, resolveFrame } from '../expressionAssets';
import type { EyeState, MayaEmotion, MouthState } from '../mayaTypes';

const ALL: MayaEmotion[] = [
  'neutral', 'smile', 'thinking', 'serious', 'challenge',
  'annoyed', 'happy', 'concerned', 'relaxed', 'wink',
];
const EYES: EyeState[] = ['open', 'half', 'closed'];
const MOUTHS: MouthState[] = ['closed', 'small', 'open'];

describe('expressionAssets', () => {
  it('has artwork for every emotion except wink', () => {
    // wink is produced by holding one eye open and one closed, so a tenth
    // master would be a generation for nothing (assets/maya/README.md).
    expect(artworkEmotions().sort()).toEqual(ALL.filter((e) => e !== 'wink').sort());
    expect(hasArtwork('wink')).toBe(false);
  });

  it('resolves a frame for every state the contract can return', () => {
    for (const emotion of ALL) {
      for (const eye of EYES) {
        for (const mouth of MOUTHS) {
          // Never undefined: the response contract lets the model return any
          // emotion, and a missing frame would blank the character mid-reply.
          expect(resolveFrame(emotion, eye, mouth)).toBeDefined();
        }
      }
    }
  });

  it('gives each emotion its own frames rather than sharing neutral', () => {
    const neutral = resolveFrame('neutral', 'open', 'closed');
    for (const emotion of ALL.filter((e) => e !== 'neutral' && e !== 'wink')) {
      expect(resolveFrame(emotion, 'open', 'closed')).not.toBe(neutral);
    }
  });

  it('falls back to neutral for wink, which the renderer then splits', () => {
    expect(resolveFrame('wink', 'open', 'closed')).toBe(resolveFrame('neutral', 'open', 'closed'));
  });

  it('maps half-lidded to the open frame so a blink stays short', () => {
    for (const emotion of ALL) {
      expect(resolveFrame(emotion, 'half', 'closed')).toBe(resolveFrame(emotion, 'open', 'closed'));
    }
  });
});
