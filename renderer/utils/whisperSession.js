// gpt-transcribe transcribes committed turns (VAD or manual commit) and takes
// language hints; gpt-4o-transcribe is scheduled for shutdown in February 2027.
export const TRANSCRIPTION_MODEL = 'gpt-transcribe';

// Long prompts are more likely to be read back as a transcript on silence
const MAX_PROMPT_CONTEXT_CHARS = 240;
const MAX_PROMPT_INSTRUCTION_CHARS = 400;

// Continuous speech never gives VAD a pause, so the client commits on its own.
// Cutting inside a word loses it (each half is transcribed separately), so:
// - after SOFT_COMMIT_MS, commit at the first short silence;
// - after DIP_COMMIT_MS, commit at the first dip in loudness between words;
// - at HARD_COMMIT_MS, commit regardless so run-on speech is still translated.
export const SOFT_COMMIT_MS = 4000;
export const DIP_COMMIT_MS = 6000;
export const HARD_COMMIT_MS = 10000;
export const COMMIT_GAP_MS = 300;

export function shouldForceCommit({ sinceCommitMs, hadSpeech, isQuiet, energyDipped = false }) {
  if (!hadSpeech) return false; // committing silence is what makes Whisper hallucinate
  if (sinceCommitMs >= HARD_COMMIT_MS) return true;
  if (sinceCommitMs >= DIP_COMMIT_MS && (isQuiet || energyDipped)) return true;
  return sinceCommitMs >= SOFT_COMMIT_MS && isQuiet;
}

function tailContext(recentTranscripts) {
  let text = recentTranscripts.join(' ');
  if (text.length <= MAX_PROMPT_CONTEXT_CHARS) return text;
  text = text.slice(-MAX_PROMPT_CONTEXT_CHARS);
  // Don't start the prompt in the middle of a word
  const firstSpace = text.indexOf(' ');
  return firstSpace > 0 && firstSpace < 40 ? text.slice(firstSpace + 1) : text;
}

/**
 * Full input_audio_transcription config. session.update replaces this object
 * wholesale, so every update must carry language and the merged prompt.
 */
export function buildTranscriptionConfig({ direction, langA, langB, customInstruction, recentTranscripts }) {
  const config = { model: TRANSCRIPTION_MODEL };

  // Fixed direction: the source language is known. Auto: restrict detection to
  // the pair, so a short or accented utterance isn't transcribed as a third language.
  if (direction === 'a-to-b') config.languages = [langA];
  else if (direction === 'b-to-a') config.languages = [langB];
  else if (langA && langB) config.languages = [langA, langB];

  const parts = [];
  if (customInstruction?.trim()) parts.push(customInstruction.trim().slice(0, MAX_PROMPT_INSTRUCTION_CHARS));
  if (recentTranscripts?.length) parts.push(tailContext(recentTranscripts));
  if (parts.length) config.prompt = parts.join('\n');

  return config;
}

/**
 * GA Realtime transcription session config. Sent on connect and on every
 * context refresh so no field is lost if the server replaces nested objects.
 */
export function buildSessionConfig(transcription) {
  return {
    type: 'transcription',
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: 24000 },
        transcription,
        turn_detection: { type: 'semantic_vad', eagerness: 'high' },
        noise_reduction: { type: 'near_field' },
      },
    },
  };
}
