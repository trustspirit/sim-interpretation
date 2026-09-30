import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { extractCompleteSentences, createStreamSegmenter, splitAtLastWordBoundary } from './sentences';

describe('extractCompleteSentences', () => {
  it('splits completed sentences from a trailing fragment', () => {
    expect(extractCompleteSentences('Hello there. How are'))
      .toEqual({ complete: 'Hello there.', remainder: 'How are' });
  });

  it('handles CJK terminators', () => {
    expect(extractCompleteSentences('안녕하세요? 오늘 회의는'))
      .toEqual({ complete: '안녕하세요?', remainder: '오늘 회의는' });
    expect(extractCompleteSentences('東京に行きます。明日'))
      .toEqual({ complete: '東京に行きます。', remainder: '明日' });
  });

  it('returns no complete sentence when there is no terminator', () => {
    expect(extractCompleteSentences('still talking'))
      .toEqual({ complete: null, remainder: 'still talking' });
  });

  it('returns everything as complete when text ends with a terminator', () => {
    expect(extractCompleteSentences('Done. Really done!'))
      .toEqual({ complete: 'Done. Really done!', remainder: '' });
  });

  it('does not split inside decimals or version numbers', () => {
    expect(extractCompleteSentences('Revenue grew 3.5 percent and'))
      .toEqual({ complete: null, remainder: 'Revenue grew 3.5 percent and' });
    expect(extractCompleteSentences('We shipped v1.2 today. Next'))
      .toEqual({ complete: 'We shipped v1.2 today.', remainder: 'Next' });
  });

  it('in strict mode waits for whitespace after an ASCII terminator at the end', () => {
    expect(extractCompleteSentences('It costs 3.', { strict: true }))
      .toEqual({ complete: null, remainder: 'It costs 3.' });
    expect(extractCompleteSentences('끝났습니다。', { strict: true }))
      .toEqual({ complete: '끝났습니다。', remainder: '' });
  });
});

describe('splitAtLastWordBoundary', () => {
  it('keeps the last partial word as the tail', () => {
    expect(splitAtLastWordBoundary('we are going to dep')).toEqual({ head: 'we are going to', tail: 'dep' });
    expect(splitAtLastWordBoundary('word')).toEqual({ head: 'word', tail: '' });
  });
});

describe('createStreamSegmenter', () => {
  let clock;
  let out;
  let seg;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
    out = [];
    seg = createStreamSegmenter({
      onSegment: (t) => out.push(t),
      idleMs: 900,
      maxAgeMs: 3000,
      now: () => clock,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('emits complete sentences as soon as the next delta confirms them', () => {
    seg.push('Hello there.');
    expect(out).toEqual([]);
    seg.push(' How');
    expect(out).toEqual(['Hello there.']);
    expect(seg.pending()).toBe('How');
  });

  it('flushes a trailing fragment after the idle timeout', () => {
    seg.push('still talking');
    vi.advanceTimersByTime(899);
    expect(out).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(out).toEqual(['still talking']);
  });

  it('emits run-on speech that never pauses once it exceeds the max age', () => {
    const words = 'so we keep talking without any pause at all and more words'.split(' ');
    for (const w of words) {
      seg.push(`${w} `);
      clock += 400; // faster than idleMs, so the idle timer never fires
      vi.advanceTimersByTime(400);
    }
    expect(out.length).toBeGreaterThan(0);
    expect(out.join(' ')).toContain('so we keep talking');
  });

  it('flush() emits whatever is pending and reset() drops it', () => {
    seg.push('partial');
    seg.flush();
    seg.push('dropped');
    seg.reset();
    vi.advanceTimersByTime(5000);
    expect(out).toEqual(['partial']);
  });
});
