import { describe, it, expect } from 'vitest';
import { isHallucination, isTranslationEcho } from './config';

describe('isHallucination', () => {
  it('blocks known Whisper artifacts and streaming outros', () => {
    expect(isHallucination('[BLANK_AUDIO]')).toBe(true);
    expect(isHallucination('구독과 좋아요 부탁드립니다')).toBe(true);
    expect(isHallucination('Thanks for watching!')).toBe(true);
    expect(isHallucination('Please subscribe to my channel.')).toBe(true);
    expect(isHallucination('<|aesthetics_5|>')).toBe(true);
    expect(isHallucination('...')).toBe(true);
  });

  it('keeps ordinary meeting sentences that merely contain streaming keywords', () => {
    expect(isHallucination('We will send a notification tomorrow.')).toBe(false);
    expect(isHallucination('See you next week at the review.')).toBe(false);
    expect(isHallucination("Don't forget to submit the report.")).toBe(false);
    expect(isHallucination('I like and support this plan.')).toBe(false);
    expect(isHallucination('Subscribe to the event bus in the handler.')).toBe(false);
    expect(isHallucination('알림 설정은 관리자 페이지에서 바꿀 수 있어요.')).toBe(false);
  });

  it('allows single-character CJK replies but blocks single Latin characters', () => {
    expect(isHallucination('네')).toBe(false);
    expect(isHallucination('a')).toBe(true);
  });
});

describe('isTranslationEcho', () => {
  const recent = ['Let me check the schedule.', '회의는 세 시에 시작해요.'];

  it('detects a transcript that is our own TTS output picked up by the mic', () => {
    expect(isTranslationEcho('let me check the schedule', recent)).toBe(true);
    expect(isTranslationEcho('회의는 세 시에 시작해요', recent)).toBe(true);
  });

  it('detects a transcript that is a long fragment of a recent translation', () => {
    expect(isTranslationEcho('check the schedule.', recent)).toBe(true);
  });

  it('keeps unrelated speech and very short overlaps', () => {
    expect(isTranslationEcho('What about the budget?', recent)).toBe(false);
    expect(isTranslationEcho('the', recent)).toBe(false);
    expect(isTranslationEcho('anything', [])).toBe(false);
  });
});
