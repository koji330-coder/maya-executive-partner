/**
 * Canonical character types for the MAYA character runtime.
 *
 * These types are the contract between the character subsystem and everything
 * else in the app. Chat, backend responses and developer tooling all drive the
 * character exclusively through these values — never by inspecting prose.
 *
 * See docs/TECH_ARCHITECTURE.md §3 and docs/AI_RESPONSE_CONTRACT.md.
 */

export type MayaEmotion =
  | 'neutral'
  | 'smile'
  | 'thinking'
  | 'serious'
  | 'challenge'
  | 'annoyed'
  | 'happy'
  | 'concerned'
  | 'relaxed'
  | 'wink';

export type MayaActivity = 'idle' | 'listening' | 'thinking' | 'speaking';

export type MayaPose =
  | 'default'
  | 'thinking'
  | 'arms_crossed'
  | 'lean_forward'
  | 'coffee'
  | 'tablet'
  | 'relaxed';

export type MayaScene = 'morning' | 'work' | 'strategy' | 'casual' | 'late_night';

/** Eyelid frames used by the blink sequence (open → half → closed → half → open). */
export type EyeState = 'open' | 'half' | 'closed';

/** v0.1 lip sync is amplitude-based and has exactly three mouth states. */
export type MouthState = 'closed' | 'small' | 'open';

export interface MayaVisualState {
  emotion: MayaEmotion;
  activity: MayaActivity;
  pose: MayaPose;
  scene: MayaScene;
  isSpeaking: boolean;
}

export const MAYA_EMOTIONS: readonly MayaEmotion[] = [
  'neutral',
  'smile',
  'thinking',
  'serious',
  'challenge',
  'annoyed',
  'happy',
  'concerned',
  'relaxed',
  'wink',
];

export const MAYA_POSES: readonly MayaPose[] = [
  'default',
  'thinking',
  'arms_crossed',
  'lean_forward',
  'coffee',
  'tablet',
  'relaxed',
];

export const MAYA_SCENES: readonly MayaScene[] = [
  'morning',
  'work',
  'strategy',
  'casual',
  'late_night',
];

export const DEFAULT_VISUAL_STATE: MayaVisualState = {
  emotion: 'neutral',
  activity: 'idle',
  pose: 'default',
  scene: 'work',
  isSpeaking: false,
};

/** Subset of a backend response that is allowed to move the character. */
export interface MayaVisualDirective {
  emotion: MayaEmotion;
  pose?: MayaPose;
  scene?: MayaScene;
}

export type Unsubscribe = () => void;
