/** Voice styles available from the offline OmniVoice renders. */
export type VoiceStyle = 'warm' | 'calm_serious' | 'playful' | 'encouraging';

/**
 * One fixed, pre-rendered MAYA line.
 *
 * `file` stays null until the OmniVoice renders land in assets/audio/fixed/
 * (docs/ASSET_PIPELINE.md §4). `envelope` is an amplitude value per
 * `frameMs` slice, produced alongside the render, and is what drives lip sync:
 * React Native cannot read PCM from a playing file without a heavy native
 * dependency, so the amplitude track ships with the clip.
 */
export interface FixedClip {
  key: string;
  text: string;
  style: VoiceStyle;
  file: number | null;
  durationMs: number;
  frameMs: number;
  envelope: readonly number[];
}

export interface PlaybackHandlers {
  /** Amplitude bucket in 0–1, emitted roughly every `frameMs`. */
  onAmplitude?: (amplitude: number, elapsedMs: number) => void;
  onEnd?: (reason: 'completed' | 'stopped') => void;
  onError?: (error: Error) => void;
}

export interface PlaybackHandle {
  readonly clipKey: string;
  stop: () => void;
}

/**
 * Audio playback contract for the character runtime.
 *
 * Phase 6 swaps in an expo-audio backed implementation; nothing outside this
 * folder should need to change.
 */
export interface AudioEngine {
  isPlaying: () => boolean;
  play: (clipKey: string, handlers?: PlaybackHandlers) => Promise<PlaybackHandle>;
  stop: () => Promise<void>;
}
