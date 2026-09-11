import { CharacterStateMachine } from '../CharacterStateMachine';

describe('CharacterStateMachine', () => {
  it('starts idle and neutral', () => {
    const machine = new CharacterStateMachine();
    expect(machine.getState()).toEqual({
      emotion: 'neutral',
      activity: 'idle',
      pose: 'default',
      scene: 'work',
      isSpeaking: false,
    });
  });

  it('enters the thinking state synchronously', () => {
    const machine = new CharacterStateMachine();
    machine.beginThinking();
    const state = machine.getState();
    expect(state.activity).toBe('thinking');
    expect(state.emotion).toBe('thinking');
    expect(state.pose).toBe('thinking');
    expect(state.isSpeaking).toBe(false);
  });

  it('applies a response directive and leaves thinking', () => {
    const machine = new CharacterStateMachine();
    machine.beginThinking();
    machine.applyResponse({ emotion: 'challenge', pose: 'lean_forward', scene: 'strategy' });
    expect(machine.getState()).toEqual({
      emotion: 'challenge',
      activity: 'idle',
      pose: 'lean_forward',
      scene: 'strategy',
      isSpeaking: false,
    });
  });

  it('keeps the current scene when a directive omits it', () => {
    const machine = new CharacterStateMachine({ scene: 'late_night' });
    machine.applyResponse({ emotion: 'serious' });
    expect(machine.getState().scene).toBe('late_night');
  });

  it('restores the pre-thinking emotion when a request is cancelled', () => {
    const machine = new CharacterStateMachine();
    machine.setEmotion('relaxed');
    machine.beginThinking();
    machine.cancelThinking();
    expect(machine.getState()).toMatchObject({ activity: 'idle', emotion: 'relaxed' });
  });

  it('ignores cancelThinking outside the thinking state', () => {
    const machine = new CharacterStateMachine();
    machine.setEmotion('happy');
    machine.cancelThinking();
    expect(machine.getState()).toMatchObject({ activity: 'idle', emotion: 'happy' });
  });

  it('tracks the speaking flag', () => {
    const machine = new CharacterStateMachine();
    machine.beginSpeaking();
    expect(machine.getState()).toMatchObject({ activity: 'speaking', isSpeaking: true });
    machine.endSpeaking();
    expect(machine.getState()).toMatchObject({ activity: 'idle', isSpeaking: false });
  });

  it('ignores endSpeaking when not speaking', () => {
    const machine = new CharacterStateMachine();
    machine.setListening();
    machine.endSpeaking();
    expect(machine.getState().activity).toBe('listening');
  });

  it('notifies subscribers only on real changes', () => {
    const machine = new CharacterStateMachine();
    const listener = jest.fn();
    machine.subscribe(listener);

    machine.setEmotion('smile');
    machine.setEmotion('smile');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ emotion: 'smile' }));
  });

  it('stops notifying after unsubscribe', () => {
    const machine = new CharacterStateMachine();
    const listener = jest.fn();
    const unsubscribe = machine.subscribe(listener);
    unsubscribe();
    machine.setEmotion('serious');
    expect(listener).not.toHaveBeenCalled();
  });
});
