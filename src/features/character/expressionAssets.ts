import type { EyeState, MayaEmotion, MouthState } from './mayaTypes';

/**
 * Bundled expression artwork.
 *
 * The generator cannot produce pixel-aligned variants, so each state is
 * pre-composited at build time: the master stays underneath and the blink or
 * open-mouth frame is painted in through the measured ellipse masks
 * (docs/NANO_BANANA_PIPELINE.md §3). The app only picks one of four images.
 *
 * The pipeline produces two eye states and two mouth states, while the runtime
 * types carry three of each. `resolveFrame` collapses the extra values; see
 * `EYE_FALLBACK` and `MOUTH_FALLBACK` for why each one maps where it does.
 */
export type AssetEye = 'open' | 'closed';
export type AssetMouth = 'closed' | 'open';

type FrameTable = Record<`${AssetEye}|${AssetMouth}`, number>;

const NEUTRAL: FrameTable = {
  'open|closed': require('../../../assets/maya/expressions/neutral/eyes_open__mouth_closed.webp'),
  'open|open': require('../../../assets/maya/expressions/neutral/eyes_open__mouth_open.webp'),
  'closed|closed': require('../../../assets/maya/expressions/neutral/eyes_closed__mouth_closed.webp'),
  'closed|open': require('../../../assets/maya/expressions/neutral/eyes_closed__mouth_open.webp'),
};

const SMILE: FrameTable = {
  'open|closed': require('../../../assets/maya/expressions/smile/eyes_open__mouth_closed.webp'),
  'open|open': require('../../../assets/maya/expressions/smile/eyes_open__mouth_open.webp'),
  'closed|closed': require('../../../assets/maya/expressions/smile/eyes_closed__mouth_closed.webp'),
  'closed|open': require('../../../assets/maya/expressions/smile/eyes_closed__mouth_open.webp'),
};

const THINKING: FrameTable = {
  'open|closed': require('../../../assets/maya/expressions/thinking/eyes_open__mouth_closed.webp'),
  'open|open': require('../../../assets/maya/expressions/thinking/eyes_open__mouth_open.webp'),
  'closed|closed': require('../../../assets/maya/expressions/thinking/eyes_closed__mouth_closed.webp'),
  'closed|open': require('../../../assets/maya/expressions/thinking/eyes_closed__mouth_open.webp'),
};

const SERIOUS: FrameTable = {
  'open|closed': require('../../../assets/maya/expressions/serious/eyes_open__mouth_closed.webp'),
  'open|open': require('../../../assets/maya/expressions/serious/eyes_open__mouth_open.webp'),
  'closed|closed': require('../../../assets/maya/expressions/serious/eyes_closed__mouth_closed.webp'),
  'closed|open': require('../../../assets/maya/expressions/serious/eyes_closed__mouth_open.webp'),
};

const CHALLENGE: FrameTable = {
  'open|closed': require('../../../assets/maya/expressions/challenge/eyes_open__mouth_closed.webp'),
  'open|open': require('../../../assets/maya/expressions/challenge/eyes_open__mouth_open.webp'),
  'closed|closed': require('../../../assets/maya/expressions/challenge/eyes_closed__mouth_closed.webp'),
  'closed|open': require('../../../assets/maya/expressions/challenge/eyes_closed__mouth_open.webp'),
};

const ANNOYED: FrameTable = {
  'open|closed': require('../../../assets/maya/expressions/annoyed/eyes_open__mouth_closed.webp'),
  'open|open': require('../../../assets/maya/expressions/annoyed/eyes_open__mouth_open.webp'),
  'closed|closed': require('../../../assets/maya/expressions/annoyed/eyes_closed__mouth_closed.webp'),
  'closed|open': require('../../../assets/maya/expressions/annoyed/eyes_closed__mouth_open.webp'),
};

const HAPPY: FrameTable = {
  'open|closed': require('../../../assets/maya/expressions/happy/eyes_open__mouth_closed.webp'),
  'open|open': require('../../../assets/maya/expressions/happy/eyes_open__mouth_open.webp'),
  'closed|closed': require('../../../assets/maya/expressions/happy/eyes_closed__mouth_closed.webp'),
  'closed|open': require('../../../assets/maya/expressions/happy/eyes_closed__mouth_open.webp'),
};

const CONCERNED: FrameTable = {
  'open|closed': require('../../../assets/maya/expressions/concerned/eyes_open__mouth_closed.webp'),
  'open|open': require('../../../assets/maya/expressions/concerned/eyes_open__mouth_open.webp'),
  'closed|closed': require('../../../assets/maya/expressions/concerned/eyes_closed__mouth_closed.webp'),
  'closed|open': require('../../../assets/maya/expressions/concerned/eyes_closed__mouth_open.webp'),
};

const RELAXED: FrameTable = {
  'open|closed': require('../../../assets/maya/expressions/relaxed/eyes_open__mouth_closed.webp'),
  'open|open': require('../../../assets/maya/expressions/relaxed/eyes_open__mouth_open.webp'),
  'closed|closed': require('../../../assets/maya/expressions/relaxed/eyes_closed__mouth_closed.webp'),
  'closed|open': require('../../../assets/maya/expressions/relaxed/eyes_closed__mouth_open.webp'),
};

/**
 * Every emotion except `wink` has artwork.
 *
 * `wink` needs none: the renderer holds one eye open and one closed from the
 * frames a neighbouring emotion already ships (assets/maya/README.md), so
 * generating it would be a tenth master for nothing.
 */
const SETS: Partial<Record<MayaEmotion, FrameTable>> = {
  neutral: NEUTRAL,
  smile: SMILE,
  thinking: THINKING,
  serious: SERIOUS,
  challenge: CHALLENGE,
  annoyed: ANNOYED,
  happy: HAPPY,
  concerned: CONCERNED,
  relaxed: RELAXED,
};

export function hasArtwork(emotion: MayaEmotion): boolean {
  return SETS[emotion] !== undefined;
}

export function artworkEmotions(): MayaEmotion[] {
  return Object.keys(SETS) as MayaEmotion[];
}

/**
 * A blink runs open → half → closed → half → open. Mapping `half` to the closed
 * frame would hold the eyes shut for most of the sequence, around 250ms, which
 * reads as a slow deliberate blink. Mapping it to open leaves roughly 125ms
 * closed, which is the natural range.
 */
const EYE_FALLBACK: Record<EyeState, AssetEye> = {
  open: 'open',
  half: 'open',
  closed: 'closed',
};

/** `small` is still an open mouth, just a narrower one, so it uses the open frame. */
const MOUTH_FALLBACK: Record<MouthState, AssetMouth> = {
  closed: 'closed',
  small: 'open',
  open: 'open',
};

export function resolveFrame(emotion: MayaEmotion, eye: EyeState, mouth: MouthState): number {
  const set = SETS[emotion] ?? NEUTRAL;
  return set[`${EYE_FALLBACK[eye]}|${MOUTH_FALLBACK[mouth]}`];
}
