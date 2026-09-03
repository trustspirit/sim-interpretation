/** Tracks when the microphone level last crossed the speech threshold. */
export function createSpeechActivityTracker({ threshold }) {
  let lastSpeechAt = null;

  return {
    onLevel(level, now = Date.now()) {
      if (level > threshold) lastSpeechAt = now;
    },
    hadSpeechWithin(windowMs, now = Date.now()) {
      return lastSpeechAt !== null && now - lastSpeechAt <= windowMs;
    },
    hadSpeechSince(time) {
      return lastSpeechAt !== null && lastSpeechAt >= time;
    },
    reset() {
      lastSpeechAt = null;
    },
  };
}
