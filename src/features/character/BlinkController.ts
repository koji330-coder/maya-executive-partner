import type { EyeState, Unsubscribe } from './mayaTypes';

/** Minimal timer surface so tests can drive the controller with fake timers. */
export interface BlinkScheduler {
  setTimeout: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface BlinkControllerOptions {
  /** docs/TECH_ARCHITECTURE.md §4: random interval between blinks. */
  minIntervalMs?: number;
  maxIntervalMs?: number;
  /** Total open → half → closed → half → open duration. */
  minDurationMs?: number;
  maxDurationMs?: number;
  /** Probability that a blink is immediately followed by a second one. */
  doubleBlinkChance?: number;
  doubleBlinkGapMs?: number;
  random?: () => number;
  scheduler?: BlinkScheduler;
}

const DEFAULTS = {
  minIntervalMs: 3000,
  maxIntervalMs: 7000,
  minDurationMs: 250,
  maxDurationMs: 350,
  doubleBlinkChance: 0.18,
  doubleBlinkGapMs: 140,
};

/**
 * Frame boundaries as a fraction of the total blink duration.
 * The closing half-frame is shorter than the opening one, which reads as a
 * natural blink rather than a symmetric fade.
 */
const FRAMES: readonly { at: number; eye: EyeState }[] = [
  { at: 0, eye: 'half' },
  { at: 0.2, eye: 'closed' },
  { at: 0.62, eye: 'half' },
  { at: 0.82, eye: 'open' },
];

type Listener = (eye: EyeState) => void;

/**
 * Drives eyelid state on a randomized schedule.
 *
 * Blinking is client-only and must never be synchronized through the backend.
 * The timing is randomized per blink so the loop does not read as periodic,
 * which docs/ACCEPTANCE_CRITERIA.md calls out explicitly.
 */
export class BlinkController {
  private readonly options: Required<Omit<BlinkControllerOptions, 'random' | 'scheduler'>>;

  private readonly random: () => number;

  private readonly scheduler: BlinkScheduler;

  private readonly listeners = new Set<Listener>();

  private timers: ReturnType<typeof setTimeout>[] = [];

  private eye: EyeState = 'open';

  private running = false;

  constructor(options: BlinkControllerOptions = {}) {
    this.options = {
      minIntervalMs: options.minIntervalMs ?? DEFAULTS.minIntervalMs,
      maxIntervalMs: options.maxIntervalMs ?? DEFAULTS.maxIntervalMs,
      minDurationMs: options.minDurationMs ?? DEFAULTS.minDurationMs,
      maxDurationMs: options.maxDurationMs ?? DEFAULTS.maxDurationMs,
      doubleBlinkChance: options.doubleBlinkChance ?? DEFAULTS.doubleBlinkChance,
      doubleBlinkGapMs: options.doubleBlinkGapMs ?? DEFAULTS.doubleBlinkGapMs,
    };
    this.random = options.random ?? Math.random;
    this.scheduler = options.scheduler ?? {
      setTimeout: (handler, ms) => setTimeout(handler, ms),
      clearTimeout: (handle) => clearTimeout(handle),
    };
  }

  getEye(): EyeState {
    return this.eye;
  }

  isRunning(): boolean {
    return this.running;
  }

  subscribe(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    this.clearTimers();
    this.emit('open');
  }

  /** Triggers a blink now without disturbing the running schedule's randomness. */
  blinkNow(): void {
    if (!this.running) {
      return;
    }
    this.clearTimers();
    this.runBlink(false);
  }

  private scheduleNext(): void {
    const delay = this.randomBetween(this.options.minIntervalMs, this.options.maxIntervalMs);
    this.addTimer(() => this.runBlink(this.random() < this.options.doubleBlinkChance), delay);
  }

  private runBlink(isDouble: boolean): void {
    const duration = this.randomBetween(this.options.minDurationMs, this.options.maxDurationMs);

    for (const frame of FRAMES) {
      const at = Math.round(frame.at * duration);
      if (at === 0) {
        this.emit(frame.eye);
      } else {
        this.addTimer(() => this.emit(frame.eye), at);
      }
    }

    const tail = duration + (isDouble ? this.options.doubleBlinkGapMs : 0);
    this.addTimer(() => {
      if (!this.running) {
        return;
      }
      if (isDouble) {
        this.runBlink(false);
      } else {
        this.scheduleNext();
      }
    }, tail);
  }

  private addTimer(handler: () => void, ms: number): void {
    const handle = this.scheduler.setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== handle);
      handler();
    }, ms);
    this.timers.push(handle);
  }

  private clearTimers(): void {
    for (const handle of this.timers) {
      this.scheduler.clearTimeout(handle);
    }
    this.timers = [];
  }

  private randomBetween(min: number, max: number): number {
    return Math.round(min + this.random() * (max - min));
  }

  private emit(eye: EyeState): void {
    if (eye === this.eye) {
      return;
    }
    this.eye = eye;
    for (const listener of this.listeners) {
      listener(eye);
    }
  }
}
