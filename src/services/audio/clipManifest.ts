import type { FixedClip } from './types';

/** Envelope resolution: one amplitude bucket every 50ms. */
const FRAME_MS = 50;

/**
 * Manifest of MAYA's fixed premium lines (docs/ASSET_PIPELINE.md §4).
 *
 * Rendered with the `MAYA v2` OmniVoice clone. Every duration and envelope here
 * was measured from its own render by `tools/measure_envelope.py`, never
 * estimated: lip sync reads the envelope rather than the audio stream, so a
 * guessed track closes her mouth while the clip is still playing.
 */
export const FIXED_CLIPS: Readonly<Record<string, FixedClip>> = {
  greeting_morning_01: clip(
    'greeting_morning_01',
    'おはようございます、社長。',
    'warm',
    2080,
    require('../../../assets/audio/fixed/greeting_morning_01.m4a'),
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.362, 0.217, 0.317, 0.383, 0.342, 0.359, 0.164, 0.324, 0.082, 0.3, 0.365, 0.264, 0.183, 0.351, 0.14, 0.053, 0.0, 0.0, 0.0, 0.0, 0.117, 0.397, 0.136, 0.07, 0.331, 0.385, 0.399, 0.389, 0.2, 0.0, 0.0, 0.0, 0.0],
  ),
  greeting_general_01: clip(
    'greeting_general_01',
    'お疲れさまです、社長。',
    'warm',
    1810,
    require('../../../assets/audio/fixed/greeting_general_01.m4a'),
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.272, 0.145, 0.106, 0.075, 0.378, 0.282, 0.25, 0.113, 0.329, 0.242, 0.353, 0.286, 0.326, 0.159, 0.167, 0.315, 0.195, 0.086, 0.351, 0.37, 0.37, 0.199, 0.0, 0.0, 0.0, 0.0, 0.0],
  ),
  strong_disagree_01: clip(
    'strong_disagree_01',
    '社長、それは私は反対です。',
    'calm_serious',
    2120,
    require('../../../assets/audio/fixed/strong_disagree_01.m4a'),
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.125, 0.308, 0.203, 0.092, 0.352, 0.384, 0.316, 0.122, 0.087, 0.09, 0.302, 0.272, 0.34, 0.371, 0.102, 0.279, 0.161, 0.109, 0.328, 0.377, 0.178, 0.332, 0.301, 0.23, 0.248, 0.346, 0.251, 0.277, 0.227, 0.114, 0.079, 0.0, 0.0, 0.0, 0.0],
  ),
  wait_01: clip(
    'wait_01',
    'ちょっと待ってください。',
    'calm_serious',
    1680,
    require('../../../assets/audio/fixed/wait_01.m4a'),
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.26, 0.366, 0.0, 0.0, 0.342, 0.303, 0.415, 0.439, 0.135, 0.0, 0.325, 0.04, 0.3, 0.322, 0.322, 0.12, 0.327, 0.405, 0.389, 0.309, 0.205, 0.041, 0.0, 0.0, 0.0, 0.0],
  ),
  numbers_01: clip(
    'numbers_01',
    '数字を見てみましょう。',
    'calm_serious',
    2000,
    require('../../../assets/audio/fixed/numbers_01.m4a'),
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.053, 0.169, 0.181, 0.393, 0.429, 0.413, 0.434, 0.19, 0.387, 0.407, 0.414, 0.442, 0.324, 0.383, 0.272, 0.15, 0.387, 0.393, 0.399, 0.404, 0.417, 0.393, 0.182, 0.311, 0.364, 0.305, 0.157, 0.0, 0.0, 0.0, 0.0],
  ),
  praise_01: clip(
    'praise_01',
    'いい判断だと思います。',
    'encouraging',
    1990,
    require('../../../assets/audio/fixed/praise_01.m4a'),
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.225, 0.355, 0.369, 0.319, 0.232, 0.435, 0.392, 0.378, 0.397, 0.419, 0.353, 0.366, 0.365, 0.176, 0.125, 0.326, 0.309, 0.364, 0.347, 0.333, 0.344, 0.36, 0.356, 0.263, 0.136, 0.094, 0.045, 0.0, 0.0, 0.0, 0.0],
  ),
};

export function getClip(key: string): FixedClip | undefined {
  return FIXED_CLIPS[key];
}

export function listClipKeys(): string[] {
  return Object.keys(FIXED_CLIPS);
}

function clip(
  key: string,
  text: string,
  style: FixedClip['style'],
  durationMs: number,
  file: number,
  envelope: readonly number[],
): FixedClip {
  return { key, text, style, file, durationMs, frameMs: FRAME_MS, envelope };
}
