import { describe, it, expect } from 'vitest';
import { resolveLanguagePair } from './languagePair';

describe('resolveLanguagePair', () => {
  it('keeps distinct languages unchanged', () => {
    expect(resolveLanguagePair({ langA: 'en', langB: 'ko' }, 'langA', 'ja')).toEqual({ langA: 'ja', langB: 'ko' });
  });

  it('swaps the other side when the user picks the same language on both', () => {
    expect(resolveLanguagePair({ langA: 'en', langB: 'ko' }, 'langA', 'ko')).toEqual({ langA: 'ko', langB: 'en' });
    expect(resolveLanguagePair({ langA: 'en', langB: 'ko' }, 'langB', 'en')).toEqual({ langA: 'ko', langB: 'en' });
  });
});
