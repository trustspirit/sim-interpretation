import {
  MS_PER_WORD, MS_PER_CJK_CHAR, MIN_SUBTITLE_DISPLAY_MS, MAX_SUBTITLE_DISPLAY_MS,
} from '../constants/config';

const CJK_BREAKS = /([。！？，、；：])/g;

/** Split text into chunks that fit within maxChars, preferring word or punctuation boundaries. */
export function splitTextIntoChunks(text, maxChars) {
  if (!text || text.length <= maxChars) return [text];

  const chunks = [];
  let current = '';

  if (/\s/.test(text)) {
    for (const word of text.split(/\s+/)) {
      const testLine = current ? `${current} ${word}` : word;
      if (testLine.length <= maxChars) {
        current = testLine;
        continue;
      }
      if (current) chunks.push(current);
      if (word.length > maxChars) {
        for (let i = 0; i < word.length; i += maxChars) chunks.push(word.slice(i, i + maxChars));
        current = '';
      } else {
        current = word;
      }
    }
  } else {
    for (const part of text.split(CJK_BREAKS).filter(Boolean)) {
      if ((current + part).length <= maxChars) {
        current += part;
        continue;
      }
      if (current) chunks.push(current);
      if (part.length > maxChars) {
        for (let i = 0; i < part.length; i += maxChars) {
          const slice = part.slice(i, i + maxChars);
          if (i + maxChars < part.length) chunks.push(slice);
          else current = slice;
        }
      } else {
        current = part;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks.filter((c) => c.trim());
}

/** Display duration for each chunk, based on reading speed and clamped to the configured range. */
export function computeChunkDisplayMs(chunks) {
  return chunks.map((chunk) => {
    const raw = /\s/.test(chunk)
      ? chunk.split(/\s+/).length * MS_PER_WORD
      : chunk.length * MS_PER_CJK_CHAR;
    return Math.min(MAX_SUBTITLE_DISPLAY_MS, Math.max(MIN_SUBTITLE_DISPLAY_MS, raw));
  });
}
