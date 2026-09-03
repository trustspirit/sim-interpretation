import { describe, it, expect } from 'vitest';
import { splitTextIntoChunks, computeChunkDisplayMs } from './subtitleChunks';
import { MS_PER_WORD, MS_PER_CJK_CHAR, MIN_SUBTITLE_DISPLAY_MS, MAX_SUBTITLE_DISPLAY_MS } from '../constants/config';

describe('splitTextIntoChunks', () => {
  it('returns the text as a single chunk when it fits', () => {
    expect(splitTextIntoChunks('short line', 20)).toEqual(['short line']);
  });

  it('wraps on word boundaries for spaced text', () => {
    expect(splitTextIntoChunks('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });

  it('splits CJK text at punctuation then by length', () => {
    expect(splitTextIntoChunks('안녕하세요，오늘은날씨가좋네요。', 8))
      .toEqual(['안녕하세요，', '오늘은날씨가좋네', '요。']);
  });
});

describe('computeChunkDisplayMs', () => {
  it('scales spaced chunks by word count', () => {
    expect(computeChunkDisplayMs(['hello world there'])).toEqual([3 * MS_PER_WORD]);
  });

  it('scales CJK chunks by character count', () => {
    expect(computeChunkDisplayMs(['안녕하세요'])).toEqual([5 * MS_PER_CJK_CHAR]);
  });

  it('clamps to the configured min and max', () => {
    const [short, long] = computeChunkDisplayMs(['a', 'w '.repeat(40).trim()]);
    expect(short).toBe(MIN_SUBTITLE_DISPLAY_MS);
    expect(long).toBe(MAX_SUBTITLE_DISPLAY_MS);
  });
});
