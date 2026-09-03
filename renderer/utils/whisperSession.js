export const TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';

/**
 * Full input_audio_transcription config. session.update replaces this object
 * wholesale, so every update must carry language and the merged prompt.
 */
export function buildTranscriptionConfig({ direction, langA, langB, customInstruction, recentTranscripts }) {
  const config = { model: TRANSCRIPTION_MODEL };

  if (direction === 'a-to-b') config.language = langA;
  else if (direction === 'b-to-a') config.language = langB;

  const parts = [];
  if (customInstruction?.trim()) parts.push(customInstruction.trim());
  if (recentTranscripts?.length) parts.push(recentTranscripts.join(' '));
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
