// Voice options for TTS (names match the OpenAI Speech API voices)
export const voiceOptions = [
  { code: 'marin', name: 'Marin', desc: 'Natural female' },
  { code: 'cedar', name: 'Cedar', desc: 'Natural male' },
  { code: 'alloy', name: 'Alloy', desc: 'Neutral' },
  { code: 'echo', name: 'Echo', desc: 'Male' },
  { code: 'fable', name: 'Fable', desc: 'British' },
  { code: 'onyx', name: 'Onyx', desc: 'Deep male' },
  { code: 'nova', name: 'Nova', desc: 'Female' },
  { code: 'shimmer', name: 'Shimmer', desc: 'Soft female' },
];

// Get voice by code
export const getVoice = (code) => voiceOptions.find(v => v.code === code) || voiceOptions.find(v => v.code === 'nova');
