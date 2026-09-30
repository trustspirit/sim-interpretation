// CJK terminators always end a sentence. ASCII ones only when followed by
// whitespace (or the end of text, unless `strict`), so "3.5" or "v1.2" don't split.
const CJK_END = /[。？！]/;
const ASCII_END = /[.?!]/;

function lastSentenceEnd(text, strict) {
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (CJK_END.test(ch)) return i;
    if (ASCII_END.test(ch)) {
      const next = text[i + 1];
      if (next === undefined ? !strict : /\s/.test(next)) return i;
    }
  }
  return -1;
}

/**
 * Split text into the completed sentences (ending in a terminator) and the
 * trailing fragment. With `strict`, an ASCII terminator at the very end is not
 * trusted yet — the next streamed delta may turn "3." into "3.5".
 */
export function extractCompleteSentences(text, { strict = false } = {}) {
  const end = lastSentenceEnd(text, strict);
  if (end < 0) return { complete: null, remainder: text.trim() };
  const complete = text.slice(0, end + 1).trim();
  return { complete: complete || null, remainder: text.slice(end + 1).trim() };
}

/** Split text at its last word boundary, for flushing an over-long fragment. */
export function splitAtLastWordBoundary(text) {
  const idx = text.search(/\s\S*$/);
  if (idx <= 0) return { head: text.trim(), tail: '' };
  return { head: text.slice(0, idx).trim(), tail: text.slice(idx).trim() };
}

/**
 * Turns a stream of text deltas into readable segments.
 * - Complete sentences are emitted as soon as they're known to be complete.
 * - A trailing fragment is emitted after `idleMs` without new deltas.
 * - A fragment older than `maxAgeMs` is emitted even while deltas keep coming,
 *   so a speaker who never pauses still gets live output.
 */
export function createStreamSegmenter({
  onSegment,
  idleMs = 900,
  maxAgeMs = 3500,
  now = () => Date.now(),
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutFn = (id) => clearTimeout(id),
}) {
  let buffer = '';
  let startedAt = 0;
  let idleTimer = null;

  const clearIdle = () => {
    if (idleTimer !== null) {
      clearTimeoutFn(idleTimer);
      idleTimer = null;
    }
  };

  const emit = (text) => {
    const t = text.trim();
    if (t) onSegment(t);
  };

  const flush = () => {
    clearIdle();
    const text = buffer;
    buffer = '';
    startedAt = 0;
    emit(text);
  };

  return {
    push(delta) {
      if (!delta) return;
      if (!buffer) startedAt = now();
      buffer += delta;

      const { complete, remainder } = extractCompleteSentences(buffer, { strict: true });
      if (complete) {
        emit(complete);
        buffer = remainder;
        startedAt = remainder ? now() : 0;
      }

      if (buffer && now() - startedAt >= maxAgeMs) {
        // Long run-on speech: emit up to the last word boundary, keep the partial word
        const { head, tail } = /\s/.test(buffer.trim())
          ? splitAtLastWordBoundary(buffer)
          : { head: buffer, tail: '' };
        emit(head);
        buffer = tail;
        startedAt = tail ? now() : 0;
      }

      clearIdle();
      if (buffer) idleTimer = setTimeoutFn(flush, idleMs);
    },
    flush,
    reset() {
      clearIdle();
      buffer = '';
      startedAt = 0;
    },
    pending: () => buffer,
  };
}
