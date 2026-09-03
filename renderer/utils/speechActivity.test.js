import { describe, it, expect } from 'vitest';
import { createSpeechActivityTracker } from './speechActivity';

describe('createSpeechActivityTracker', () => {
  it('reports no speech before any loud sample', () => {
    const t = createSpeechActivityTracker({ threshold: 0.06 });
    expect(t.hadSpeechWithin(5000, 1000)).toBe(false);
  });

  it('remembers the last time the level crossed the threshold', () => {
    const t = createSpeechActivityTracker({ threshold: 0.06 });
    t.onLevel(0.01, 500);
    t.onLevel(0.2, 1000);
    t.onLevel(0.01, 1100);
    expect(t.hadSpeechWithin(5000, 3000)).toBe(true);
    expect(t.hadSpeechWithin(5000, 7000)).toBe(false);
    expect(t.hadSpeechSince(900)).toBe(true);
    expect(t.hadSpeechSince(1500)).toBe(false);
  });

  it('forgets everything on reset', () => {
    const t = createSpeechActivityTracker({ threshold: 0.06 });
    t.onLevel(0.5, 1000);
    t.reset();
    expect(t.hadSpeechWithin(5000, 1001)).toBe(false);
  });
});
