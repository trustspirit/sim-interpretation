// Subtitle timing
export const MS_PER_WORD = 280;
export const MS_PER_CJK_CHAR = 135;
export const MIN_SUBTITLE_DISPLAY_MS = 300;
export const MAX_SUBTITLE_DISPLAY_MS = 3000;

// Font size configuration
export const fontSizeConfig = {
  current: ['text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl'],
  previous: ['text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl'],
  cursor: ['h-6', 'h-8', 'h-10', 'h-12', 'h-14', 'h-16'],
};

// Get font size classes by index
export const getFontSizeClasses = (fontSize) => ({
  current: fontSizeConfig.current[fontSize],
  previous: fontSizeConfig.previous[fontSize],
  cursor: fontSizeConfig.cursor[fontSize],
});

// Common hallucination patterns to filter out (exact match only)
export const exactHallucinations = [
  // Korean hallucinations - standalone phrases only
  '구독과 좋아요 부탁드립니다',
  '좋아요와 구독 부탁드립니다',
  '오늘도 시청해주셔서 감사합니다',
  '오늘도 시청해 주셔서 감사합니다',
  '시청해주셔서 감사합니다',
  '시청해 주셔서 감사합니다',
  '감사합니다',
  'MBC 뉴스',
  'KBS 뉴스',
  'SBS 뉴스',
  '이덕영입니다',
  // English hallucinations
  'Thank you for watching',
  'Thanks for watching',
  'Adjust the compressor',
  'Please subscribe',
  'Like and subscribe',
  // Short meaningless patterns
  '....',
  '...',
  '..',
  '♪',
];

// Patterns that indicate hallucination if text contains them
export const containsHallucinations = [
  '[음악]',
  '[박수]',
  '[웃음]',
  '[Music]',
  '[Applause]',
  '[Laughter]',
  '[BLANK_AUDIO]',
  '(upbeat music)',
  '(dramatic music)',
  '(sighs)',
];

// Regex patterns for common Whisper hallucinations.
// Keep these SPECIFIC: a false positive silently deletes a real sentence from
// the meeting, which is worse than letting an occasional outro slip through.
// Tune this list for your domain; the tests in config.test.js pin the policy.
const hallucinationPatterns = [
  // Korean YouTube/streaming outros
  /구독.*좋아요/,
  /좋아요.*구독/,
  /시청.*감사/,
  /감사.*시청/,
  /채널.*구독/,
  /구독.*채널/,
  /구독.*눌러/,
  /알림\s*설정.*(눌러|부탁)/,
  // English YouTube/streaming outros
  /please subscribe/i,
  /like and subscribe/i,
  /subscribe to (my|our|the) channel/i,
  /thanks for watching/i,
  /thank you for watching/i,
  /hit the bell/i,
  /see you in the next (video|episode)/i,
  // Common Whisper artifacts
  /^\.+$/,  // Just dots
  /^\s*$/,  // Just whitespace
];

const normalizeQuotes = (s) => s.replace(/[\u2018\u2019\u0060\u00B4]/g, "'").replace(/[\u201C\u201D]/g, '"');

const CJK_CHAR = /[\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF]/;

export const isHallucination = (text) => {
  if (!text) return true;
  // A lone Latin character is noise, but a single CJK syllable ("네") is a real reply
  if (text.length < 2 && !CJK_CHAR.test(text)) return true;
  if (text.startsWith('♪') || text.startsWith('[') || text.startsWith('(')) return true;
  // Whisper internal token leakage (e.g. <|aesthetics_5|>, <|is_landscape_image|>)
  if (/\<\|[a-z_0-9]+\|\>/.test(text)) return true;
  if (exactHallucinations.includes(text)) return true;
  if (containsHallucinations.some((h) => text.includes(h))) return true;
  if (hallucinationPatterns.some((pattern) => pattern.test(normalizeQuotes(text)))) return true;
  return false;
};

// Repetition detector for transcriptions (silence hallucinations loop the same line).
// Only repeats close together in time count, so a speaker saying "Yes." now and
// then over a meeting is never blocked.
const recentTranscriptions = [];
const MAX_RECENT = 5;
const REPEAT_THRESHOLD = 2; // Same text appearing this many times = hallucination
const REPEAT_WINDOW_MS = 30 * 1000;

export const isRepeatedTranscription = (text, now = Date.now()) => {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();

  const count = recentTranscriptions
    .filter((t) => t.text === normalized && now - t.at <= REPEAT_WINDOW_MS)
    .length;

  recentTranscriptions.push({ text: normalized, at: now });
  if (recentTranscriptions.length > MAX_RECENT) {
    recentTranscriptions.shift();
  }

  return count >= REPEAT_THRESHOLD;
};

export const clearRecentTranscriptions = () => {
  recentTranscriptions.length = 0;
};

// Detect the microphone picking up our own TTS output: the transcript matches
// (or is a long fragment of) a translation we recently spoke aloud.
const ECHO_MIN_FRAGMENT_CHARS = 10;
const normalizeForEcho = (s) => s.toLowerCase().replace(/[\s\p{P}]/gu, '');

export const isTranslationEcho = (transcript, recentTranslations) => {
  if (!transcript || !recentTranslations?.length) return false;
  const needle = normalizeForEcho(transcript);
  if (!needle) return false;
  return recentTranslations.some((t) => {
    const hay = normalizeForEcho(t);
    if (!hay) return false;
    if (hay === needle) return true;
    return needle.length >= ECHO_MIN_FRAGMENT_CHARS && hay.includes(needle);
  });
};

// The transcription prompt carries recent transcripts as context. On silence or
// noise the model sometimes "transcribes" that prompt back; drop such repeats.
const PROMPT_LEAK_MIN_CHARS = 12;

export const isPromptLeak = (transcript, promptContext) => {
  if (!transcript || !promptContext?.length) return false;
  const needle = normalizeForEcho(transcript);
  if (needle.length < PROMPT_LEAK_MIN_CHARS) return false;
  return normalizeForEcho(promptContext.join(' ')).includes(needle);
};

// The model answering or refusing instead of translating. Keep this list to
// meta-statements about the task itself: ordinary phrases ("Of course",
// "것 같아요", "I see") are things real speakers say and must be translated.
const assistantResponsePatterns = [
  /^(I'm sorry|I apologize|Sorry),? (but )?I (can't|cannot|am unable to|'m unable to) (assist|help|translate|provide|comply)/i,
  /^As an AI\b/i,
  /^I('m| am) (an AI|a language model|here to (help|translate)|ready to translate)/i,
  /^I can only (assist with )?(translate|translation)/i,
  /^(Please )?provide (the )?(text|sentence|content) (you('d| would) like|to (be )?translate)/i,
  /^(There is|There's) no (text|speech|content|input) to translate/i,
  /^(Nothing|No text|No content) to translate/i,
  /^(The )?(input|source) (text )?(is|was|appears to be) (empty|incomplete|unclear)/i,
  /^I (didn't|did not|couldn't|could not) (catch|hear|understand) (that|the audio|what)/i,
  /^Here is the translation/i,
  /^Translation:/i,
  /^번역할 (내용|텍스트|문장)이 없/,
  /^번역(해 드리겠습니다|을 시작하겠습니다)/,
  /^(저는|나는) (AI|인공지능|번역 (도우미|어시스턴트))/,
  /^입력(된 내용)?이 없/,
];

// Check if translation output is an unwanted assistant response
export const isAssistantResponse = (text) => {
  if (!text) return false;
  const trimmed = normalizeQuotes(text.trim());
  return assistantResponsePatterns.some((pattern) => pattern.test(trimmed));
};

// Assistant boilerplate appended after a translation. Only unambiguous
// assistant offers; anything a person might say in a meeting stays.
const trailingAssistantPatterns = [
  /[.!?]\s+(How (else )?can I (help|assist)( you)?( today)?\??)$/i,
  /[.!?]\s+(Is there anything else I can (help|assist)( you)? with\??)$/i,
  /[.!?]\s+(Let me know if you need (any )?(more|further|other) (help|assistance|translations?)\.?)$/i,
  /[.!?]\s+(Feel free to ask if you (have|need) (any )?(more|other) (questions|help)\.?)$/i,
  /[.!?]\s+(더 (도움이 필요하시면|궁금한 점이 있으시면) (언제든지 )?(말씀해 주세요|알려주세요)[.!]?)$/,
];

// Primary script of text. CJK characters are weighted because one character
// carries roughly what 2-3 Latin letters do, so "Kubernetes 클러스터를 배포했어요"
// still reads as Korean.
const CJK_WEIGHT = 2.5;

export const detectPrimaryScript = (text) => {
  if (!text) return 'unknown';
  const cleaned = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (cleaned.length === 0) return 'unknown';

  const korean = (cleaned.match(/[가-힯ᄀ-ᇿ㄰-㆏]/g) || []).length;
  const kana = (cleaned.match(/[぀-ゟ゠-ヿ]/g) || []).length;
  const han = (cleaned.match(/[一-鿿㐀-䶿]/g) || []).length;
  const latin = (cleaned.match(/[a-zA-ZÀ-ɏ]/g) || []).length;

  const scores = {
    korean: korean * CJK_WEIGHT,
    // Any kana means Japanese; Han characters then count toward Japanese too
    japanese: kana > 0 ? (kana + han) * CJK_WEIGHT : 0,
    chinese: kana > 0 ? 0 : han * CJK_WEIGHT,
    latin,
  };
  let best = 'other';
  let bestScore = 0;
  for (const [script, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = script;
      bestScore = score;
    }
  }
  return best;
};

// Expected script for language codes
const langScriptMap = {
  ko: 'korean',
  ja: 'japanese',
  zh: 'chinese',
  en: 'latin', es: 'latin', fr: 'latin', de: 'latin',
  it: 'latin', pt: 'latin', nl: 'latin', pl: 'latin',
  sv: 'latin', da: 'latin', no: 'latin', fi: 'latin',
  tr: 'latin', vi: 'latin', id: 'latin', ms: 'latin',
};

export const scriptForLanguage = (code) => langScriptMap[code] || null;

/**
 * True when the output is clearly not in the language it should be in (the model
 * echoed the source untranslated). Only decidable when the two languages use
 * different scripts; English ↔ Spanish can't be told apart this way.
 */
export const isLikelyEcho = (translatedText, originalText, direction, langA, langB) => {
  const outputScript = detectPrimaryScript(translatedText);
  if (outputScript === 'unknown' || outputScript === 'other') return false;

  const scriptA = scriptForLanguage(langA);
  const scriptB = scriptForLanguage(langB);
  if (!scriptA || !scriptB || scriptA === scriptB) return false;

  if (direction === 'a-to-b') return outputScript !== scriptB;
  if (direction === 'b-to-a') return outputScript !== scriptA;

  // Auto: the output must be in the script of the other language
  const inputScript = detectPrimaryScript(originalText);
  if (inputScript === scriptA) return outputScript !== scriptB;
  if (inputScript === scriptB) return outputScript !== scriptA;
  return false;
};

// Strip "original -> translation" format, keeping only the translation part.
// Arrows only: a colon is ordinary punctuation inside real translations.
export const stripSourcePrefix = (text) => {
  if (!text) return text;
  const arrowMatch = text.match(/^(.+?)\s*(?:->|→|=>)\s*["“]?(.+?)["”]?\s*$/s);
  if (arrowMatch) {
    const [, before, after] = arrowMatch;
    // Only strip if the before part is in a different script (i.e. it's the source text)
    const beforeScript = detectPrimaryScript(before);
    const afterScript = detectPrimaryScript(after);
    if (beforeScript !== 'unknown' && afterScript !== 'unknown' && beforeScript !== afterScript) {
      return after.trim();
    }
  }
  return text;
};

// Clean translation by removing trailing assistant content
export const cleanTranslation = (text) => {
  if (!text) return text;
  let cleaned = text.trim();

  for (const pattern of trailingAssistantPatterns) {
    const match = normalizeQuotes(cleaned).match(pattern);
    if (match) {
      // Keep the sentence terminator that precedes the appended boilerplate
      cleaned = cleaned.substring(0, match.index + 1).trim();
    }
  }

  return cleaned;
};
