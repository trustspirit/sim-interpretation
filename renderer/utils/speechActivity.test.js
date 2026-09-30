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

  it('detects speech on a quiet microphone whose peaks never reach the fixed threshold', () => {
    const t = createSpeechActivityTracker({ threshold: 0.06 });
    for (let i = 0; i < 20; i++) t.onLevel(0.002, i * 100); // room noise
    t.onLevel(0.03, 2500); // quiet speech
    expect(t.hadSpeechWithin(1000, 3000)).toBe(true);
  });

  it('does not treat steady background noise as speech', () => {
    const t = createSpeechActivityTracker({ threshold: 0.06 });
    for (let i = 0; i < 50; i++) t.onLevel(0.005, i * 100);
    expect(t.hadSpeechWithin(10000, 5000)).toBe(false);
  });

  it('never raises the threshold above the configured value during long speech', () => {
    const t = createSpeechActivityTracker({ threshold: 0.06 });
    for (let i = 0; i < 1000; i++) t.onLevel(0.3, i * 100);
    expect(t.threshold()).toBeLessThanOrEqual(0.06);
    t.onLevel(0.07, 200000);
    expect(t.hadSpeechSince(200000)).toBe(true);
  });

  it('reports an energy dip between words, not in the middle of one', () => {
    const t = createSpeechActivityTracker({ threshold: 0.06 });
    [0.3, 0.35, 0.32].forEach((l, i) => t.onLevel(l, i * 100));
    expect(t.energyDipped()).toBe(false);
    t.onLevel(0.08, 400);
    expect(t.energyDipped()).toBe(true);
  });
});
