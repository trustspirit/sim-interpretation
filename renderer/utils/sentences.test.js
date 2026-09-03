import { describe, it, expect } from 'vitest';
import { extractCompleteSentences } from './sentences';

describe('extractCompleteSentences', () => {
  it('splits completed sentences from a trailing fragment', () => {
    expect(extractCompleteSentences('Hello there. How are'))
      .toEqual({ complete: 'Hello there.', remainder: 'How are' });
  });

  it('handles CJK terminators', () => {
    expect(extractCompleteSentences('안녕하세요? 오늘 회의는'))
      .toEqual({ complete: '안녕하세요?', remainder: '오늘 회의는' });
  });

  it('returns no complete sentence when there is no terminator', () => {
    expect(extractCompleteSentences('still talking'))
      .toEqual({ complete: null, remainder: 'still talking' });
  });

  it('returns everything as complete when text ends with a terminator', () => {
    expect(extractCompleteSentences('Done. Really done!'))
      .toEqual({ complete: 'Done. Really done!', remainder: '' });
  });
});
