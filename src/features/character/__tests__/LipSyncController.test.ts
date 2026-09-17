import { LipSyncController } from '../LipSyncController';
import type { MouthState } from '../mayaTypes';

describe('LipSyncController', () => {
  it('starts closed', () => {
    const controller = new LipSyncController();
    controller.start();
    expect(controller.getMouth()).toBe('closed');
  });

  it('maps amplitude buckets onto the three mouth states', () => {
    const controller = new LipSyncController({ minHoldMs: 0 });
    controller.start();

    expect(controller.push(0.02, 0)).toBe('closed');
    expect(controller.push(0.15, 10)).toBe('small');
    expect(controller.push(0.9, 20)).toBe('open');
    expect(controller.push(0, 30)).toBe('closed');
  });

  it('clamps out-of-range and non-finite amplitudes', () => {
    const controller = new LipSyncController({ minHoldMs: 0 });
    controller.start();

    expect(controller.push(5, 0)).toBe('open');
    expect(controller.push(-3, 10)).toBe('closed');
    expect(controller.push(Number.NaN, 20)).toBe('closed');
  });

  it('holds a state for minHoldMs to avoid flutter', () => {
    const controller = new LipSyncController({ minHoldMs: 60 });
    controller.start();

    controller.push(0.9, 100);
    expect(controller.getMouth()).toBe('open');

    // Too soon: the drop is ignored.
    controller.push(0, 130);
    expect(controller.getMouth()).toBe('open');

    controller.push(0, 200);
    expect(controller.getMouth()).toBe('closed');
  });

  it('returns to closed and stops accepting samples after stop()', () => {
    const states: MouthState[] = [];
    const controller = new LipSyncController({ minHoldMs: 0 });
    controller.subscribe((mouth) => states.push(mouth));
    controller.start();

    controller.push(0.9, 0);
    controller.stop();
    expect(controller.getMouth()).toBe('closed');

    controller.push(0.9, 100);
    expect(controller.getMouth()).toBe('closed');
    expect(states[states.length - 1]).toBe('closed');
  });

  it('exposes its engine kind for future viseme implementations', () => {
    expect(new LipSyncController().kind).toBe('amplitude');
  });
});
