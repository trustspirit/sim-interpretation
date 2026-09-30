import { describe, it, expect } from 'vitest';
import {
  buildTranslationMessages, buildSystemPrompt, parseTranslationContent, resolveTargetLanguage,
} from './translationPrompt';

const base = { langA: 'en', langB: 'ko', customInstruction: '' };

describe('buildSystemPrompt', () => {
  it('states the fixed direction explicitly', () => {
    expect(buildSystemPrompt({ ...base, direction: 'a-to-b' })).toContain('Translate from English into Korean');
    expect(buildSystemPrompt({ ...base, direction: 'b-to-a' })).toContain('Translate from Korean into English');
  });

  it('tells the model never to answer the source', () => {
    const prompt = buildSystemPrompt({ ...base, direction: 'auto' });
    expect(prompt).toMatch(/never answer/i);
    expect(prompt).toContain('not a chat assistant');
  });

  it('keeps user domain notes subordinate to the rules', () => {
    const prompt = buildSystemPrompt({ ...base, direction: 'auto', customInstruction: 'Terms: Overdare' });
    expect(prompt.indexOf('Terms: Overdare')).toBeGreaterThan(prompt.indexOf('Rules:'));
    expect(prompt).toContain('never override');
  });
});

describe('buildTranslationMessages', () => {
  it('wraps the source in tags and adds previous lines as reference context', () => {
    const [, user] = buildTranslationMessages({
      ...base,
      direction: 'a-to-b',
      text: 'Can you summarize this for me?',
      context: [{ source: 'We reviewed the budget.', translation: '예산을 검토했습니다.' }],
    });
    expect(user.content).toContain('<source>\nCan you summarize this for me?\n</source>');
    expect(user.content).toContain('<context>\n- We reviewed the budget. => 예산을 검토했습니다.\n</context>');
    expect(user.content.indexOf('<context>')).toBeLessThan(user.content.indexOf('<source>'));
  });

  it('trims old context to a bounded size but always keeps the newest line', () => {
    const context = Array.from({ length: 20 }, (_, i) => ({ source: `line ${i} ${'x'.repeat(80)}` }));
    const [, user] = buildTranslationMessages({ ...base, direction: 'auto', text: 'hi', context });
    expect(user.content).toContain('line 19');
    expect(user.content).not.toContain('line 0 ');
  });

  it('adds a corrective hint on retry', () => {
    const [, user] = buildTranslationMessages({ ...base, direction: 'a-to-b', text: 'Hello', retryTarget: 'ko' });
    expect(user.content).toContain('Translate the source into Korean');
  });
});

describe('parseTranslationContent', () => {
  it('reads the JSON translation field', () => {
    expect(parseTranslationContent('{"translation": " 안녕하세요 "}')).toBe('안녕하세요');
    expect(parseTranslationContent('{"translation": ""}')).toBe('');
  });

  it('falls back to plain text when the reply is not JSON', () => {
    expect(parseTranslationContent('<source>안녕하세요</source>')).toBe('안녕하세요');
  });

  it('returns null for empty or malformed replies', () => {
    expect(parseTranslationContent('')).toBeNull();
    expect(parseTranslationContent(undefined)).toBeNull();
    expect(parseTranslationContent('{"other": 1}')).toBeNull();
  });
});

describe('resolveTargetLanguage', () => {
  it('uses the fixed direction', () => {
    expect(resolveTargetLanguage('anything', 'a-to-b', 'en', 'ko')).toBe('ko');
    expect(resolveTargetLanguage('anything', 'b-to-a', 'en', 'ko')).toBe('en');
  });

  it('infers the target in auto mode from the source script', () => {
    expect(resolveTargetLanguage('Hello there', 'auto', 'en', 'ko')).toBe('ko');
    expect(resolveTargetLanguage('안녕하세요', 'auto', 'en', 'ko')).toBe('en');
    expect(resolveTargetLanguage('Hola', 'auto', 'en', 'es')).toBeNull();
  });
});
