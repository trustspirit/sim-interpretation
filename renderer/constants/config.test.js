import { describe, it, expect } from 'vitest';
import {
  isHallucination, isTranslationEcho, isAssistantResponse, cleanTranslation, stripSourcePrefix,
  detectPrimaryScript, isLikelyEcho, isRepeatedTranscription, clearRecentTranscriptions, isPromptLeak,
} from './config';

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

describe('isAssistantResponse', () => {
  it('flags meta replies about the translation task', () => {
    expect(isAssistantResponse("I'm sorry, but I can't assist with that.")).toBe(true);
    expect(isAssistantResponse('Please provide the text you would like me to translate.')).toBe(true);
    expect(isAssistantResponse('There is no text to translate.')).toBe(true);
    expect(isAssistantResponse('번역할 내용이 없습니다.')).toBe(true);
    expect(isAssistantResponse('As an AI, I cannot do that.')).toBe(true);
  });

  it('keeps ordinary speech that merely sounds conversational', () => {
    for (const text of [
      'Of course, we can move the meeting.',
      'Okay, let us start.',
      'I see what you mean.',
      'I understand the concern.',
      'Sure, I will send it today.',
      'Would you like some coffee?',
      'Got it, thanks.',
      '비가 올 것 같아요.',
      '아, 그렇군요.',
      '죄송합니다, 늦었습니다.',
      '알겠습니다. 내일 보내드릴게요.',
      '이 부분을 정리해 보겠습니다.',
      '좋아요, 그렇게 하죠.',
    ]) {
      expect(isAssistantResponse(text), text).toBe(false);
    }
  });
});

describe('cleanTranslation', () => {
  it('removes appended assistant boilerplate', () => {
    expect(cleanTranslation('The meeting starts at three. Is there anything else I can help you with?'))
      .toBe('The meeting starts at three.');
  });

  it('keeps questions the speaker actually asked', () => {
    expect(cleanTranslation('We are done. Do you need anything else from me?'))
      .toBe('We are done. Do you need anything else from me?');
    expect(cleanTranslation('Let me know if the numbers look wrong.'))
      .toBe('Let me know if the numbers look wrong.');
  });
});

describe('stripSourcePrefix', () => {
  it('strips an echoed source before an arrow', () => {
    expect(stripSourcePrefix('안녕하세요 -> Hello')).toBe('Hello');
  });

  it('keeps colons inside real translations', () => {
    expect(stripSourcePrefix('Agenda: 예산 검토')).toBe('Agenda: 예산 검토');
  });
});

describe('detectPrimaryScript', () => {
  it('reads Korean with embedded English terms as Korean', () => {
    expect(detectPrimaryScript('Kubernetes 클러스터를 배포했어요')).toBe('korean');
  });

  it('distinguishes Japanese from Chinese by kana', () => {
    expect(detectPrimaryScript('東京に行きます')).toBe('japanese');
    expect(detectPrimaryScript('我们明天开会')).toBe('chinese');
  });
});

describe('isLikelyEcho', () => {
  it('never flags same-script pairs such as English and Spanish in auto mode', () => {
    expect(isLikelyEcho('Hola a todos', 'Hello everyone', 'auto', 'en', 'es')).toBe(false);
  });

  it('flags untranslated output for different-script pairs', () => {
    expect(isLikelyEcho('Hello everyone', 'Hello everyone', 'auto', 'en', 'ko')).toBe(true);
    expect(isLikelyEcho('안녕하세요 여러분', 'Hello everyone', 'auto', 'en', 'ko')).toBe(false);
    expect(isLikelyEcho('Hello everyone', 'Hello everyone', 'a-to-b', 'en', 'ko')).toBe(true);
    expect(isLikelyEcho('여러분 안녕하세요', 'Hello everyone', 'a-to-b', 'en', 'ko')).toBe(false);
  });
});

describe('isRepeatedTranscription', () => {
  it('blocks a line looping quickly but not the same short reply spread over time', () => {
    clearRecentTranscriptions();
    expect(isRepeatedTranscription('Yes.', 0)).toBe(false);
    expect(isRepeatedTranscription('Yes.', 60_000)).toBe(false);
    expect(isRepeatedTranscription('Yes.', 120_000)).toBe(false);

    clearRecentTranscriptions();
    expect(isRepeatedTranscription('Loop', 0)).toBe(false);
    expect(isRepeatedTranscription('Loop', 1000)).toBe(false);
    expect(isRepeatedTranscription('Loop', 2000)).toBe(true);
  });
});

describe('isPromptLeak', () => {
  const recentTranscripts = ['We deploy on Kubernetes every Friday.', 'Then we scale the cluster.'];
  const customInstruction = 'Terms: Kubernetes, Overdare, Helm charts';

  it('drops the context prompt read back as a whole', () => {
    expect(isPromptLeak('We deploy on Kubernetes every Friday. Then we scale the cluster.', { recentTranscripts })).toBe(true);
  });

  it('drops the glossary read back', () => {
    expect(isPromptLeak('Terms: Kubernetes, Overdare, Helm charts', { customInstruction })).toBe(true);
  });

  it('keeps a speaker repeating their own last line', () => {
    expect(isPromptLeak('Then we scale the cluster.', { recentTranscripts })).toBe(false);
    expect(isPromptLeak('Can you hear me now? Can you hear me now?', { recentTranscripts: ['Can you hear me now?'] })).toBe(false);
    expect(isPromptLeak('Yes.', { recentTranscripts: ['Yes.'] })).toBe(false);
  });
});
