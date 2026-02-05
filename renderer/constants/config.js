// Subtitle timing
export const MS_PER_WORD = 280;
export const MS_PER_CJK_CHAR = 135;
export const MIN_SUBTITLE_DISPLAY_MS = 300;
export const MAX_SUBTITLE_DISPLAY_MS = 3000;

// Font size configuration
export const fontSizeConfig = {
  current: ['text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl'],
  previous: ['text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl'],
  cursor: ['h-6', 'h-8', 'h-10', 'h-12', 'h-14', 'h-16']
};

// Get font size classes by index
export const getFontSizeClasses = (fontSize) => ({
  current: fontSizeConfig.current[fontSize],
  previous: fontSizeConfig.previous[fontSize],
  cursor: fontSizeConfig.cursor[fontSize]
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
  'Thank you',
  'Adjust the compressor',
  'Please subscribe',
  'Like and subscribe',
  // Short meaningless patterns
  '....', '...', '..', '♪',
];

// Patterns that indicate hallucination if text contains them
export const containsHallucinations = [
  '[음악]', '[박수]', '[웃음]',
  '[Music]', '[Applause]', '[Laughter]', '[BLANK_AUDIO]',
  '(upbeat music)', '(dramatic music)', '(sighs)',
];

// Check if text is a hallucination
export const isHallucination = (text) => {
  if (!text || text.length < 4) return true;
  if (text.startsWith('♪') || text.startsWith('[') || text.startsWith('(')) return true;
  if (exactHallucinations.includes(text)) return true;
  if (containsHallucinations.some(h => text.includes(h))) return true;
  return false;
};
