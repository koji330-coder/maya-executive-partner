import { getClip } from './clipManifest';
import type { AudioEngine, PlaybackHandle, PlaybackHandlers } from './types';

export interface EnvelopeAudioEngineOptions {
  setInterval?: (handler: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval?: (handle: ReturnType<typeof setInterval>) => void;
}

/**
 * Plays a clip's amplitude envelope on a timer without producing sound.
 *
 * This is the v0.1 engine: the OmniVoice renders are not in the repo yet, but
 * the character runtime, the lip sync controller and the Talk screen all need a
 * real playback lifecycle to develop against. Phase 6 replaces this class with
 * an expo-audio implementation of the same `AudioEngine` interface and keeps
 * the envelope as the lip sync source.
 */
export class EnvelopeAudioEngine implements AudioEngine {
  private readonly setIntervalFn: NonNullable<EnvelopeAudioEngineOptions['setInterval']>;

  private readonly clearIntervalFn: NonNullable<EnvelopeAudioEngineOptions['clearInterval']>;

  private timer: ReturnType<typeof setInterval> | null = null;

  private current: { key: string; handlers: PlaybackHandlers } | null = null;

  constructor(options: EnvelopeAudioEngineOptions = {}) {
    this.setIntervalFn = options.setInterval ?? ((handler, ms) => setInterval(handler, ms));
    this.clearIntervalFn = options.clearInterval ?? ((handle) => clearInterval(handle));
  }

  isPlaying(): boolean {
    return this.timer !== null;
  }

  async play(clipKey: string, handlers: PlaybackHandlers = {}): Promise<PlaybackHandle> {
    const clip = getClip(clipKey);
    if (!clip) {
      const error = new Error(`Unknown MAYA voice clip: ${clipKey}`);
      handlers.onError?.(error);
      throw error;
    }

    await this.stop();

    this.current = { key: clipKey, handlers };
    let frame = 0;

    this.timer = this.setIntervalFn(() => {
      const amplitude = clip.envelope[frame] ?? 0;
      handlers.onAmplitude?.(amplitude, frame * clip.frameMs);
      frame += 1;
      if (frame >= clip.envelope.length) {
        this.finish('completed');
      }
    }, clip.frameMs);

    return {
      clipKey,
      stop: () => {
        void this.stop();
      },
    };
  }

  async stop(): Promise<void> {
    this.finish('stopped');
  }

  private finish(reason: 'completed' | 'stopped'): void {
    if (this.timer === null) {
      return;
    }
    this.clearIntervalFn(this.timer);
    this.timer = null;
    const handlers = this.current?.handlers;
    this.current = null;
    handlers?.onAmplitude?.(0, 0);
    handlers?.onEnd?.(reason);
  }
}
