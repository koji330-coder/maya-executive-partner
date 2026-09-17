import React from 'react';

import type { MayaResponse } from '@/features/chat/mayaResponse';

import type { StagePresentation } from './CharacterStage';

/**
 * How long she stays enlarged before settling back.
 *
 * Long enough to read a short line, short enough that it does not become the
 * normal state. The whole point is that it is rare.
 */
export const SPOTLIGHT_MS = 3200;

/**
 * Which replies are worth coming closer for.
 *
 * `docs/PRODUCT_REQUIREMENTS.md` §5 puts MAYA at 80% analysis, and the mock
 * enlarges her only on "重要回答や感情表現". Enlarging on every reply would
 * spend the effect: the reaction reads as a reaction because the other eight
 * replies out of ten did not move.
 *
 * These three are deliberately the same moments the contract already treats as
 * significant, rather than a new judgement the model has to make:
 *
 * - a decision was detected, which is the thing the whole product exists for,
 * - a fixed voice clip plays, which the contract already reserves for
 *   greetings, strong disagreement, warnings and real praise,
 * - the emotion is one of the sharp ones.
 *
 * UNDECIDED: whether `annoyed` belongs here. It is a signature expression in
 * `docs/MAYA_CHARACTER_BIBLE.md`, but it currently reads much like `serious`,
 * so enlarging it may just enlarge the ambiguity. Settle it when the reaction
 * artwork for `annoyed` exists and can be seen at this size.
 */
const SPOTLIGHT_EMOTIONS: ReadonlySet<MayaResponse['emotion']> = new Set([
  'challenge',
  'serious',
  'happy',
  'annoyed',
]);

export function deservesSpotlight(response: MayaResponse): boolean {
  return (
    response.decision?.detected === true ||
    response.voice.shouldPlay ||
    SPOTLIGHT_EMOTIONS.has(response.emotion)
  );
}

export interface ReactionSpotlight {
  /** What the stage should show right now. */
  presentation: StagePresentation;
  /** The line to float beside her while she is enlarged, or null. */
  line: string | null;
  active: boolean;
}

/**
 * Enlarges MAYA for a moment when a reply earns it.
 *
 * `base` is what she returns to, which differs by screen state: the chat band
 * normally, the small portrait while the keyboard is up. A spotlight that
 * fires with the keyboard open still returns to the portrait.
 */
export function useReactionSpotlight(
  latest: MayaResponse | null,
  base: StagePresentation,
  options: { enabled?: boolean; durationMs?: number } = {},
): ReactionSpotlight {
  const { enabled = true, durationMs = SPOTLIGHT_MS } = options;

  // Which reply is currently holding the spotlight, rather than a boolean.
  // Deriving it from the reply itself means a new reply that does not deserve
  // one simply is not this reply, so the previous spotlight ends without an
  // effect having to switch it off.
  const [held, setHeld] = React.useState<MayaResponse | null>(null);
  const candidate = latest && enabled && deservesSpotlight(latest) ? latest : null;
  const active = candidate !== null && candidate !== held;

  React.useEffect(() => {
    if (!active || !candidate) {
      return;
    }
    const id = setTimeout(() => setHeld(candidate), durationMs);
    return () => clearTimeout(id);
  }, [active, candidate, durationMs]);

  return {
    presentation: active ? 'reaction' : base,
    line: active && candidate ? firstSentence(candidate.message) : null,
    active,
  };
}

/**
 * The opening sentence, for the bubble beside her.
 *
 * The full reply stays in the transcript. A bubble is for the one line she
 * would actually say out loud, and `docs/AI_RESPONSE_CONTRACT.md` already asks
 * her to lead with the statement rather than build up to it.
 */
export function firstSentence(message: string, limit = 60): string {
  const trimmed = message.trim();
  const end = trimmed.search(/[。！？\n]/);
  const sentence = end === -1 ? trimmed : trimmed.slice(0, end + 1);
  return sentence.length > limit ? `${sentence.slice(0, limit)}…` : sentence;
}
