import type { MouthState, Unsubscribe } from './mayaTypes';

/**
 * The character stage only ever consumes a `MouthState`.
 *
 * v0.1 ships the amplitude implementation below. A viseme-driven engine can be
 * added later by implementing this same interface and mapping visemes onto a
 * wider mouth vocabulary, without touching the character renderer.
 */
export interface LipSyncEngine {
  readonly kind: 'amplitude' | 'viseme';
  getMouth(): MouthState;
  subscribe(listener: (mouth: MouthState) => void): Unsubscribe;
  start(): void;
  stop(): void;
}

export interface LipSyncControllerOptions {
  /** Amplitude (0–1) at or above which the mouth opens slightly. */
  smallThreshold?: number;
  /** Amplitude (0–1) at or above which the mouth opens fully. */
  openThreshold?: number;
  /** Minimum time a mouth state is held, to stop per-frame flutter. */
  minHoldMs?: number;
  now?: () => number;
}

const DEFAULTS = {
  smallThreshold: 0.08,
  openThreshold: 0.3,
  minHoldMs: 60,
};

/**
 * Amplitude-based three-state lip sync.
 *
 * The audio layer pushes amplitude buckets over time; this controller turns
 * them into `closed | small | open`. It never touches audio playback itself.
 */
export class LipSyncController implements LipSyncEngine {
  readonly kind = 'amplitude' as const;

  private readonly smallThreshold: number;

  private readonly openThreshold: number;

  private readonly minHoldMs: number;

  private readonly now: () => number;

  private readonly listeners = new Set<(mouth: MouthState) => void>();

  private mouth: MouthState = 'closed';

  private lastChangeAt = 0;

  private running = false;

  constructor(options: LipSyncControllerOptions = {}) {
    this.smallThreshold = options.smallThreshold ?? DEFAULTS.smallThreshold;
    this.openThreshold = options.openThreshold ?? DEFAULTS.openThreshold;
    this.minHoldMs = options.minHoldMs ?? DEFAULTS.minHoldMs;
    this.now = options.now ?? Date.now;
  }

  getMouth(): MouthState {
    return this.mouth;
  }

  isRunning(): boolean {
    return this.running;
  }

  subscribe(listener: (mouth: MouthState) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    this.running = true;
    this.lastChangeAt = 0;
    this.emit('closed', true);
  }

  /**
   * Feeds one amplitude sample. Returns the resulting mouth state.
   * Samples received while stopped are ignored so a late audio callback cannot
   * reopen the mouth after playback ended.
   */
  push(amplitude: number, timestampMs: number = this.now()): MouthState {
    if (!this.running) {
      return this.mouth;
    }
    const clamped = clamp01(amplitude);
    const target: MouthState =
      clamped >= this.openThreshold ? 'open' : clamped >= this.smallThreshold ? 'small' : 'closed';

    if (target !== this.mouth && timestampMs - this.lastChangeAt >= this.minHoldMs) {
      this.lastChangeAt = timestampMs;
      this.emit(target, false);
    }
    return this.mouth;
  }

  /** docs/ACCEPTANCE_CRITERIA.md: the mouth must return to closed after audio ends. */
  stop(): void {
    this.running = false;
    this.emit('closed', false);
  }

  private emit(mouth: MouthState, force: boolean): void {
    if (mouth === this.mouth && !force) {
      return;
    }
    this.mouth = mouth;
    for (const listener of this.listeners) {
      listener(mouth);
    }
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
