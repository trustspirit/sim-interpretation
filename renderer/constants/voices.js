// Voice options for TTS
export const voiceOptions = [
  { code: 'alloy', name: 'Alloy', desc: 'Neutral' },
  { code: 'echo', name: 'Echo', desc: 'Male' },
  { code: 'fable', name: 'Fable', desc: 'British' },
  { code: 'onyx', name: 'Onyx', desc: 'Deep male' },
  { code: 'nova', name: 'Nova', desc: 'Female' },
  { code: 'shimmer', name: 'Shimmer', desc: 'Soft female' },
];

// Map TTS voices to Realtime API voices
export const realtimeVoiceMap = {
  'alloy': 'alloy',
  'echo': 'echo',
  'fable': 'sage',    // British-ish
  'onyx': 'ash',      // Deep male
  'nova': 'coral',    // Female
  'shimmer': 'shimmer'
};

// Get voice by code
export const getVoice = (code) => voiceOptions.find(v => v.code === code) || voiceOptions[4];

// Get realtime voice
export const getRealtimeVoice = (code) => realtimeVoiceMap[code] || 'alloy';
