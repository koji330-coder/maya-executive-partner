import { getTodayGreeting } from '../greeting';

describe('getTodayGreeting', () => {
  const at = (hour: number) => new Date(2026, 0, 15, hour, 0, 0);

  it('greets the morning with the morning scene', () => {
    const greeting = getTodayGreeting(at(8));
    expect(greeting.greeting).toContain('おはようございます');
    expect(greeting.scene).toBe('morning');
  });

  it('uses the late night scene after hours and before dawn', () => {
    expect(getTodayGreeting(at(23)).scene).toBe('late_night');
    expect(getTodayGreeting(at(3)).scene).toBe('late_night');
  });

  it('covers the working day and the evening', () => {
    expect(getTodayGreeting(at(13)).scene).toBe('work');
    expect(getTodayGreeting(at(19)).scene).toBe('strategy');
  });

  it('always addresses the user as 社長', () => {
    for (const hour of [0, 6, 12, 18, 22]) {
      expect(getTodayGreeting(at(hour)).greeting).toContain('社長');
    }
  });
});
