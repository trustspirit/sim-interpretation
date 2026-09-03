const SENTENCE_END = /^([\s\S]*[.?!。？！])\s*([\s\S]*)$/;

/** Split text into the completed sentences (ending in a terminator) and the trailing fragment. */
export function extractCompleteSentences(text) {
  const match = text.match(SENTENCE_END);
  if (match) return { complete: match[1].trim(), remainder: match[2].trim() };
  return { complete: null, remainder: text.trim() };
}
