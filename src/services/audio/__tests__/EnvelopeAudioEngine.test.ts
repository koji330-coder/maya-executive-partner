import { EnvelopeAudioEngine } from '../EnvelopeAudioEngine';
import { FIXED_CLIPS, getClip, listClipKeys } from '../clipManifest';

describe('clipManifest', () => {
  it('lists the fixed clips from the asset pipeline', () => {
    expect(listClipKeys()).toEqual(
      expect.arrayContaining([
        'greeting_morning_01',
        'greeting_general_01',
        'strong_disagree_01',
        'wait_01',
        'numbers_01',
        'praise_01',
      ]),
    );
  });

  it('gives every clip an amplitude envelope within 0–1', () => {
    for (const clip of Object.values(FIXED_CLIPS)) {
      expect(clip.envelope.length).toBeGreaterThan(0);
      for (const sample of clip.envelope) {
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      }
    }
  });

  it('returns undefined for an unknown key', () => {
    expect(getClip('nope')).toBeUndefined();
  });
});

describe('EnvelopeAudioEngine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('emits amplitude samples and ends after the envelope', async () => {
    const engine = new EnvelopeAudioEngine();
    const amplitudes: number[] = [];
    const onEnd = jest.fn();

    await engine.play('wait_01', {
      onAmplitude: (amplitude) => amplitudes.push(amplitude),
      onEnd,
    });
    expect(engine.isPlaying()).toBe(true);

    const clip = getClip('wait_01');
    jest.advanceTimersByTime(clip!.durationMs + clip!.frameMs);

    expect(amplitudes.length).toBeGreaterThan(1);
    expect(onEnd).toHaveBeenCalledWith('completed');
    expect(engine.isPlaying()).toBe(false);
  });

  it('reports a stop and silences the last amplitude', async () => {
    const engine = new EnvelopeAudioEngine();
    const amplitudes: number[] = [];
    const onEnd = jest.fn();

    await engine.play('numbers_01', {
      onAmplitude: (amplitude) => amplitudes.push(amplitude),
      onEnd,
    });
    jest.advanceTimersByTime(200);
    await engine.stop();

    expect(onEnd).toHaveBeenCalledWith('stopped');
    expect(amplitudes[amplitudes.length - 1]).toBe(0);
    expect(engine.isPlaying()).toBe(false);
  });

  it('rejects an unknown clip key', async () => {
    const engine = new EnvelopeAudioEngine();
    const onError = jest.fn();
    await expect(engine.play('missing_clip', { onError })).rejects.toThrow('missing_clip');
    expect(onError).toHaveBeenCalled();
    expect(engine.isPlaying()).toBe(false);
  });
});
