import { BlinkController } from '../BlinkController';
import type { EyeState } from '../mayaTypes';

/** Deterministic random: cycles through the supplied values. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}

describe('BlinkController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('does not blink before the first scheduled interval', () => {
    const frames: EyeState[] = [];
    // random() = 0 → minimum interval (3000ms) and minimum duration.
    const controller = new BlinkController({ random: sequence([0]) });
    controller.subscribe((eye) => frames.push(eye));
    controller.start();

    jest.advanceTimersByTime(2999);
    expect(frames).toEqual([]);
  });

  it('emits the full open → half → closed → half → open sequence', () => {
    const frames: EyeState[] = [];
    const controller = new BlinkController({ random: sequence([0, 1, 0]) });
    controller.subscribe((eye) => frames.push(eye));
    controller.start();

    // 3000ms interval, then a 250ms blink.
    jest.advanceTimersByTime(3000 + 250);

    expect(frames).toEqual(['half', 'closed', 'half', 'open']);
    expect(controller.getEye()).toBe('open');
  });

  it('varies the interval with the random source', () => {
    const intervals: number[] = [];
    const controller = new BlinkController({
      random: sequence([0, 1, 1, 1]),
      scheduler: {
        setTimeout: (handler, ms) => {
          intervals.push(ms);
          return setTimeout(handler, ms);
        },
        clearTimeout: (handle) => clearTimeout(handle),
      },
    });
    controller.start();

    // First scheduled delay uses random() = 0 → the 3000ms floor.
    expect(intervals[0]).toBe(3000);

    jest.advanceTimersByTime(10000);
    // A later interval draws random() = 1 → the 7000ms ceiling.
    expect(intervals).toContain(7000);
  });

  it('fires a second blink when the double-blink roll succeeds', () => {
    const frames: EyeState[] = [];
    // random(): interval → double-blink roll (0 < chance) → duration …
    const controller = new BlinkController({ random: sequence([0]), doubleBlinkChance: 1 });
    controller.subscribe((eye) => frames.push(eye));
    controller.start();

    jest.advanceTimersByTime(3000 + 250 + 140 + 250);

    const closedCount = frames.filter((frame) => frame === 'closed').length;
    expect(closedCount).toBe(2);
  });

  it('returns the eye to open and stops scheduling on stop()', () => {
    const controller = new BlinkController({ random: sequence([0]) });
    controller.start();
    jest.advanceTimersByTime(3000 + 60);
    expect(controller.getEye()).not.toBe('open');

    controller.stop();
    expect(controller.getEye()).toBe('open');
    expect(controller.isRunning()).toBe(false);

    const frames: EyeState[] = [];
    controller.subscribe((eye) => frames.push(eye));
    jest.advanceTimersByTime(30000);
    expect(frames).toEqual([]);
  });

  it('ignores a second start()', () => {
    const starts: number[] = [];
    const controller = new BlinkController({
      random: sequence([0]),
      scheduler: {
        setTimeout: (handler, ms) => {
          starts.push(ms);
          return setTimeout(handler, ms);
        },
        clearTimeout: (handle) => clearTimeout(handle),
      },
    });
    controller.start();
    controller.start();
    expect(starts).toHaveLength(1);
  });
});
