import { describe, it, expect } from 'vitest';
import { TRANSLATION_MODELS, createModelSelector, isModelRejection } from './translationModels';

describe('TRANSLATION_MODELS', () => {
  it('never sends temperature to reasoning models', () => {
    for (const { params } of TRANSLATION_MODELS) {
      if ('reasoning_effort' in params) {
        expect(params).not.toHaveProperty('temperature');
        expect(params).not.toHaveProperty('max_tokens');
      }
    }
  });

  it('ends with a non-reasoning fallback', () => {
    expect(TRANSLATION_MODELS.at(-1).params).not.toHaveProperty('reasoning_effort');
  });
});

describe('createModelSelector', () => {
  const models = [{ model: 'a', params: {} }, { model: 'b', params: {} }];

  it('falls back to the next model once and stays there', () => {
    const s = createModelSelector(models);
    const first = s.current();
    expect(first.model).toBe('a');
    expect(s.reject(first)).toBe(true);
    expect(s.current().model).toBe('b');
    // A late rejection of the already-replaced model doesn't skip another one
    expect(s.reject(first)).toBe(true);
    expect(s.current().model).toBe('b');
  });

  it('reports when no fallback is left', () => {
    const s = createModelSelector(models);
    s.reject(s.current());
    expect(s.reject(s.current())).toBe(false);
    expect(s.current().model).toBe('b');
  });
});

describe('isModelRejection', () => {
  it('treats unknown models and unsupported parameters as rejections', () => {
    expect(isModelRejection(404, { message: 'The model `x` does not exist' })).toBe(true);
    expect(isModelRejection(400, { code: 'unsupported_value', param: 'reasoning_effort' })).toBe(true);
    expect(isModelRejection(400, { message: "Unsupported parameter: 'temperature'" })).toBe(true);
  });

  it('ignores transient and content errors', () => {
    expect(isModelRejection(429, { message: 'Rate limit' })).toBe(false);
    expect(isModelRejection(500, {})).toBe(false);
    expect(isModelRejection(400, { param: 'messages', message: 'Invalid content' })).toBe(false);
  });
});
