import { describe, it, expect } from 'vitest';
import { createAudioLedger } from './audioLedger';

describe('createAudioLedger', () => {
  it('forgets audio once its transcript arrived', () => {
    const l = createAudioLedger();
    ['a', 'b'].forEach((c) => l.record(c));
    l.committed('item_1');
    l.record('c');
    l.confirmed('item_1');
    expect(l.takeForReplay()).toEqual([{ chunks: ['c'], commit: false }]);
  });

  it('replays committed-but-untranscribed audio before the open segment', () => {
    const l = createAudioLedger();
    l.record('a');
    l.committed('item_1');
    l.record('b1'); l.record('b2');
    l.committed('item_2');
    l.record('c');
    l.confirmed('item_1');
    expect(l.takeForReplay()).toEqual([
      { chunks: ['b1', 'b2'], commit: true },
      { chunks: ['c'], commit: false },
    ]);
  });

  it('matches commit events of replayed segments before closing the open one', () => {
    const l = createAudioLedger();
    l.record('a1'); l.record('a2');
    l.committed('item_1');
    l.record('b');
    l.takeForReplay();
    l.committed('item_9'); // the replayed 'a' was committed on the new session
    l.record('c');
    l.confirmed('item_9');
    expect(l.takeForReplay()).toEqual([{ chunks: ['b', 'c'], commit: false }]);
  });

  it('bounds memory by dropping the oldest audio', () => {
    const l = createAudioLedger({ maxChunks: 3 });
    ['a', 'b'].forEach((c) => l.record(c));
    l.committed('item_1');
    ['c', 'd', 'e'].forEach((c) => l.record(c));
    expect(l.size()).toBe(3);
    expect(l.takeForReplay()).toEqual([{ chunks: ['c', 'd', 'e'], commit: false }]);
  });

  it('drops replayed commits too short for the server to accept', () => {
    const l = createAudioLedger();
    l.record('a');
    l.committed('item_1');
    l.record('b');
    expect(l.takeForReplay()).toEqual([{ chunks: ['b'], commit: false }]);
    expect(l.size()).toBe(1);
  });

  it('ignores commits with no new audio', () => {
    const l = createAudioLedger();
    l.committed('item_1');
    expect(l.takeForReplay()).toEqual([]);
  });
});
