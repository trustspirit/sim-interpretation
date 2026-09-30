export const TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';

// Long prompts are more likely to be read back as a transcript on silence
const MAX_PROMPT_CONTEXT_CHARS = 240;
const MAX_PROMPT_INSTRUCTION_CHARS = 400;

// Continuous speech never gives VAD a pause, so the client commits on its own:
// after SOFT_COMMIT_MS at the first short gap in speech, and at HARD_COMMIT_MS
// regardless, so a run-on speaker still gets translated every few seconds.
export const SOFT_COMMIT_MS = 4000;
export const HARD_COMMIT_MS = 8000;
export const COMMIT_GAP_MS = 300;

export function shouldForceCommit({ sinceCommitMs, hadSpeech, isQuiet }) {
  if (!hadSpeech) return false; // committing silence is what makes Whisper hallucinate
  if (sinceCommitMs >= HARD_COMMIT_MS) return true;
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

  if (direction === 'a-to-b') config.language = langA;
  else if (direction === 'b-to-a') config.language = langB;

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
