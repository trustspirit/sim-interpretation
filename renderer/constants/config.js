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

// Regex patterns for common Whisper hallucinations
const hallucinationPatterns = [
  // Korean YouTube/streaming hallucinations
  /구독.*좋아요/,
  /좋아요.*구독/,
  /부탁드립니다\s*$/,
  /시청.*감사/,
  /감사.*시청/,
  /채널.*구독/,
  /구독.*채널/,
  /알림.*설정/,
  /좋아요.*누르/,
  /구독.*눌러/,
  // English YouTube/streaming hallucinations
  /subscribe/i,
  /like and/i,
  /thanks for watching/i,
  /thank you for watching/i,
  /see you next/i,
  /don't forget to/i,
  /hit the bell/i,
  /notification/i,
  // Common Whisper artifacts
  /^\.+$/,  // Just dots
  /^\s*$/,  // Just whitespace
];

const normalizeQuotes = (s) => s.replace(/[\u2018\u2019\u0060\u00B4]/g, "'").replace(/[\u201C\u201D]/g, '"');

export const isHallucination = (text) => {
  if (!text || text.length < 2) return true;
  if (text.startsWith('♪') || text.startsWith('[') || text.startsWith('(')) return true;
  // Whisper internal token leakage (e.g. <|aesthetics_5|>, <|is_landscape_image|>)
  if (/\<\|[a-z_0-9]+\|\>/.test(text)) return true;
  if (exactHallucinations.includes(text)) return true;
  if (containsHallucinations.some((h) => text.includes(h))) return true;
  if (hallucinationPatterns.some((pattern) => pattern.test(normalizeQuotes(text)))) return true;
  return false;
};

// Repetition detector for transcriptions (hallucination often repeats)
const recentTranscriptions = [];
const MAX_RECENT = 5;
const REPEAT_THRESHOLD = 2; // Same text appearing this many times = hallucination

export const isRepeatedTranscription = (text) => {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();

  // Count occurrences in recent transcriptions
  const count = recentTranscriptions.filter(t => t === normalized).length;

  // Add to recent list
  recentTranscriptions.push(normalized);
  if (recentTranscriptions.length > MAX_RECENT) {
    recentTranscriptions.shift();
  }

  return count >= REPEAT_THRESHOLD;
};

export const clearRecentTranscriptions = () => {
  recentTranscriptions.length = 0;
};

// Patterns that indicate the model is responding as an assistant instead of translating
const assistantResponsePatterns = [
  // Apologies and refusals
  /^I'm sorry/i,
  /^I apologize/i,
  /^I can't assist/i,
  /^I cannot assist/i,
  /^I'm unable to/i,
  /^I am unable to/i,

  // Hearing/clarity issues
  /^I couldn't clearly hear/i,
  /^I didn't catch/i,
  /^I didn't hear/i,
  /^I couldn't hear/i,
  /^There was no speech/i,
  /^No speech detected/i,
  /^I don't hear/i,

  // Self-referential translator statements
  /^I can only assist with translation/i,
  /^I can only continue translating/i,
  /^I can only translate/i,
  /^I'm here to translate/i,
  /^I am here to translate/i,
  /^I'll translate/i,
  /^I will translate/i,
  /^I'm ready to translate/i,
  /^I am ready to translate/i,
  /^I'm listening/i,
  /^I am listening/i,

  // Requests to speak/continue
  /^Please continue speaking/i,
  /^Please go ahead/i,
  /^Please feel free/i,
  /^Please speak/i,
  /^Please say/i,
  /^Please provide/i,
  /^Could you please repeat/i,
  /^Can you repeat/i,
  /whenever you're ready/i,
  /whenever you are ready/i,

  // Goodbye/ending statements
  /^Got it\. I'll stop/i,
  /^Got it\. I will stop/i,
  /^I'll stop translating/i,
  /^I will stop translating/i,
  /^Goodbye/i,
  /^Bye/i,
  /^Take care/i,
  /if you need anything/i,
  /feel free to ask/i,

  // General assistant behavior
  /^Let me know if/i,
  /^How can I help/i,
  /^How may I help/i,
  /^What can I help/i,
  /^Is there anything/i,
  /^Do you need/i,
  /^Would you like/i,
  /^Sure thing/i,
  /^Of course/i,
  /^Certainly/i,
  /^Absolutely/i,
  /^Sure,/i,
  /^Okay,/i,
  /^Alright,/i,
  /^Understood/i,
  /^Got it/i,
  /^No problem/i,
  /^I understand/i,
  /^I see/i,
  /^Great!/i,
  /^Perfect!/i,

  // Offering to do something (assistant interpreting as request)
  /^I'll do that/i,
  /^I'll take care/i,
  /^I'll handle/i,
  /^I can do that/i,
  /^I can help/i,
  /^Let me help/i,
  /^Allow me to/i,

  // Meta responses about translation
  /^Nothing to translate/i,
  /^No translation needed/i,
  /^Unable to translate/i,
  /^Cannot translate/i,
  /^No speech/i,
  /^No audio/i,
  /^I didn't receive/i,
  /^There is nothing/i,
  /^There was nothing/i,
  /^Empty input/i,
  /^No input/i,
  /^번역할 내용이 없/,
  /^번역할 것이 없/,
  /^입력이 없/,

  // Korean assistant responses
  /^죄송합니다/,
  /^말씀하세요/,
  /^듣고 있습니다/,
  /^번역을 시작/,
  /^번역해 드리겠습니다/,
  /^안녕히 가세요/,
  /^다음에 또/,
  /도움이 필요하시면/,
  /^네,? 알겠습니다/,
  /^네,? 제가/,
  /^알겠습니다/,
  /^그렇게 하겠습니다/,
  /^도와드리겠습니다/,
  // Korean conversational/assistant patterns
  /^아,/,
  /^오,/,
  /^음,/,
  /^네!/,
  /^좋아요/,
  /^그렇군요/,
  /궁금하신/,
  /거군요/,
  /것 같아요/,
  /있을 것 같/,
  /해볼게요/,
  /해드릴게요/,
  /알려드릴게요/,
  /정리해/,
  /설명해/,
  /도와드릴/,
];

// Check if translation output is an unwanted assistant response
export const isAssistantResponse = (text) => {
  if (!text) return false;
  const trimmed = normalizeQuotes(text.trim());
  return assistantResponsePatterns.some((pattern) => pattern.test(trimmed));
};

// Patterns that indicate assistant content was appended to a translation
const trailingAssistantPatterns = [
  // English trailing patterns
  /\. How can I help/i,
  /\. What (else )?can I/i,
  /\. Is there anything/i,
  /\. Let me know/i,
  /\. Feel free/i,
  /\. I('m| am) here/i,
  /\. I('ll| will) help/i,
  /\. Would you like/i,
  /\. Do you need/i,
  /\. If you need/i,
  /\. Please let me/i,
  // Korean trailing patterns
  /\. 도움이 필요하시면/,
  /\. 더 궁금한/,
  /\. 말씀해 주세요/,
  /\. 알려주세요/,
  /\. 도와드릴까요/,
  /\. 필요하시면/,
  /\. 있으시면/,
  /! 좋아요/,
  /! 네/,
];

// Detect primary script of text (korean, japanese, chinese, latin, or other)
export const detectPrimaryScript = (text) => {
  if (!text) return 'unknown';
  const cleaned = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (cleaned.length === 0) return 'unknown';

  const koreanChars = (cleaned.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length;
  const japaneseChars = (cleaned.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
  const cjkChars = (cleaned.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) || []).length;
  const latinChars = (cleaned.match(/[a-zA-Z\u00C0-\u024F]/g) || []).length;

  if (koreanChars / cleaned.length > 0.3) return 'korean';
  // Japanese: any kana present with CJK = japanese (e.g. "東京に行きます")
  if (japaneseChars > 0 && (japaneseChars + cjkChars) / cleaned.length > 0.3) return 'japanese';
  if (cjkChars / cleaned.length > 0.3) return 'chinese';
  if (latinChars / cleaned.length > 0.3) return 'latin';
  return 'other';
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

// Check if translation output is likely an untranslated echo
export const isLikelyEcho = (translatedText, originalText, direction, langA, langB) => {
  const outputScript = detectPrimaryScript(translatedText);
  if (outputScript === 'unknown' || outputScript === 'other') return false;

  if (direction === 'a-to-b') {
    const expectedScript = langScriptMap[langB];
    if (expectedScript && outputScript !== expectedScript) return true;
  } else if (direction === 'b-to-a') {
    const expectedScript = langScriptMap[langA];
    if (expectedScript && outputScript !== expectedScript) return true;
  } else {
    // Auto mode: output should differ from input script
    const inputScript = detectPrimaryScript(originalText);
    if (inputScript !== 'unknown' && inputScript !== 'other' && outputScript === inputScript) return true;
  }
  return false;
};

// Strip "original -> translation" format, keeping only the translation part
export const stripSourcePrefix = (text) => {
  if (!text) return text;
  // Match patterns like: "원문" -> "translation" or 원문 → translation
  const arrowMatch = text.match(/^.+?\s*(?:->|→|=>|：|:)\s*[""]?(.+?)[""]?\s*$/s);
  if (arrowMatch) {
    const before = text.substring(0, text.indexOf(arrowMatch[1]));
    const after = arrowMatch[1];
    // Only strip if the before part contains a different script (i.e., it's the source text)
    const beforeScript = detectPrimaryScript(before);
    const afterScript = detectPrimaryScript(after);
    if (beforeScript !== 'unknown' && afterScript !== 'unknown' && beforeScript !== afterScript) {
      return after.replace(/[""]$/,'').trim();
    }
  }
  return text;
};

// Clean translation by removing trailing assistant content
export const cleanTranslation = (text) => {
  if (!text) return text;
  let cleaned = text.trim();
  const normalized = normalizeQuotes(cleaned);

  for (const pattern of trailingAssistantPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      cleaned = cleaned.substring(0, match.index + 1).trim();
    }
  }

  return cleaned;
};
