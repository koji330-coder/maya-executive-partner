import type { FixedClip } from './types';

/** Envelope resolution: one amplitude bucket every 50ms. */
const FRAME_MS = 50;

/**
 * Manifest of MAYA's fixed premium lines (docs/ASSET_PIPELINE.md §4).
 *
 * The audio files do not exist yet, so `file` is null and each clip carries a
 * synthesized envelope. Adding a render is a two-line change: point `file` at
 * the require() and replace the envelope with the measured one.
 */
export const FIXED_CLIPS: Readonly<Record<string, FixedClip>> = {
  greeting_morning_01: clip('greeting_morning_01', 'おはようございます、社長。', 'warm', 2200),
  greeting_general_01: clip('greeting_general_01', 'お疲れさまです、社長。', 'warm', 2000),
  strong_disagree_01: clip(
    'strong_disagree_01',
    '社長、それは私は反対です。',
    'calm_serious',
    2600,
  ),
  wait_01: clip('wait_01', 'ちょっと待ってください。', 'calm_serious', 1800),
  numbers_01: clip('numbers_01', '数字を見てみましょう。', 'calm_serious', 2000),
  praise_01: clip('praise_01', 'いい判断だと思います。', 'encouraging', 2200),
};

export function getClip(key: string): FixedClip | undefined {
  return FIXED_CLIPS[key];
}

export function listClipKeys(): string[] {
  return Object.keys(FIXED_CLIPS);
}

function clip(key: string, text: string, style: FixedClip['style'], durationMs: number): FixedClip {
  return {
    key,
    text,
    style,
    file: null,
    durationMs,
    frameMs: FRAME_MS,
    envelope: synthesizeEnvelope(durationMs, FRAME_MS, key),
  };
}

/**
 * Placeholder amplitude track shaped like speech: syllable-rate pulses inside a
 * fade-in/fade-out envelope. Deterministic per clip so the placeholder mouth
 * movement is stable between runs.
 */
function synthesizeEnvelope(durationMs: number, frameMs: number, seed: string): number[] {
  const frames = Math.max(1, Math.round(durationMs / frameMs));
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  }
  const envelope: number[] = [];
  for (let i = 0; i < frames; i += 1) {
    const progress = i / frames;
    const fade = Math.min(1, Math.sin(Math.PI * progress) * 1.6);
    const syllable = 0.5 + 0.5 * Math.sin((i / 3.1) * Math.PI + hash);
    const jitter = 0.5 + 0.5 * Math.sin((i / 1.7) * Math.PI + hash * 0.37);
    envelope.push(Math.max(0, fade * (0.25 + 0.55 * syllable * jitter)));
  }
  return envelope;
}
