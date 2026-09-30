/**
 * Tracks when the microphone level last crossed the speech threshold.
 *
 * The effective threshold adapts to the noise floor so quiet microphones and
 * loopback devices still register speech, but it never rises above `threshold`:
 * a loud environment behaves exactly like a fixed threshold.
 */
export function createSpeechActivityTracker({
  threshold,
  minThreshold = 0.012,
  noiseMultiplier = 3,
}) {
  let lastSpeechAt = null;
  let noiseFloor = null;

  const currentThreshold = () => {
    if (noiseFloor === null) return threshold;
    return Math.min(threshold, Math.max(minThreshold, noiseFloor * noiseMultiplier));
  };

  return {
    onLevel(level, now = Date.now()) {
      if (level > currentThreshold()) lastSpeechAt = now;
      // Fall quickly toward quiet levels, rise slowly so speech doesn't become "noise"
      if (noiseFloor === null) noiseFloor = level;
      else if (level < noiseFloor) noiseFloor = noiseFloor * 0.7 + level * 0.3;
      else noiseFloor = noiseFloor * 0.995 + level * 0.005;
    },
    hadSpeechWithin(windowMs, now = Date.now()) {
      return lastSpeechAt !== null && now - lastSpeechAt <= windowMs;
    },
    hadSpeechSince(time) {
      return lastSpeechAt !== null && lastSpeechAt >= time;
    },
    threshold: currentThreshold,
    reset() {
      lastSpeechAt = null;
      noiseFloor = null;
    },
  };
}
