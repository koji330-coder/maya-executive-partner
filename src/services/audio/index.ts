import { EnvelopeAudioEngine } from './EnvelopeAudioEngine';
import type { AudioEngine } from './types';

export * from './types';
export * from './clipManifest';
export { EnvelopeAudioEngine } from './EnvelopeAudioEngine';

let engine: AudioEngine = new EnvelopeAudioEngine();

export function getAudioEngine(): AudioEngine {
  return engine;
}

/** Swap the implementation (tests today, expo-audio in Phase 6). */
export function setAudioEngine(next: AudioEngine): void {
  engine = next;
}
