import { useRef, useCallback } from 'react';

// Base64 to ArrayBuffer
const base64ToArrayBuffer = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

// Convert PCM16 to Float32 for Web Audio API
const pcm16ToFloat32 = (pcm16Buffer) => {
  const int16Array = new Int16Array(pcm16Buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768;
  }
  return float32Array;
};

export default function useRealtimeAudio() {
  const outputAudioContextRef = useRef(null);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const isEnabledRef = useRef(false);
  const currentAudioDurationRef = useRef(0);
  const pendingAudioDurationRef = useRef(0);

  const playAudioChunk = useCallback((base64Audio) => {
    if (!isEnabledRef.current) return;

    // Initialize output audio context if needed
    if (!outputAudioContextRef.current) {
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
    }

    const ctx = outputAudioContextRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const pcmBuffer = base64ToArrayBuffer(base64Audio);
    const float32Data = pcm16ToFloat32(pcmBuffer);

    // Create audio buffer
    const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    // Track total duration for subtitle sync
    pendingAudioDurationRef.current += audioBuffer.duration;

    // Schedule playback
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const currentTime = ctx.currentTime;
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;

    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
    }
    
    return true;
  }, []);

  const stopAudio = useCallback(() => {
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
  }, []);

  const onAudioDone = useCallback(() => {
    currentAudioDurationRef.current = pendingAudioDurationRef.current;
    pendingAudioDurationRef.current = 0;
  }, []);

  const resetTiming = useCallback(() => {
    nextPlayTimeRef.current = 0;
  }, []);

  const setEnabled = useCallback((enabled) => {
    isEnabledRef.current = enabled;
    if (!enabled) {
      stopAudio();
    }
  }, [stopAudio]);

  return {
    playAudioChunk,
    stopAudio,
    onAudioDone,
    resetTiming,
    setEnabled,
    isPlaying: () => isPlayingRef.current,
    isEnabled: () => isEnabledRef.current,
    getCurrentDuration: () => currentAudioDurationRef.current,
  };
}
