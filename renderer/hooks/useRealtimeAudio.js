import { useRef, useCallback, useMemo, useEffect } from 'react';

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
  const mediaStreamDestRef = useRef(null);
  const audioElementRef = useRef(null);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);
  const isEnabledRef = useRef(false);
  const currentAudioDurationRef = useRef(0);
  const pendingAudioDurationRef = useRef(0);
  const selectedOutputRef = useRef('');

  // Initialize audio context and routing
  const initAudioContext = useCallback(async () => {
    if (outputAudioContextRef.current) return;

    const ctx = new AudioContext({ sampleRate: 24000 });
    outputAudioContextRef.current = ctx;

    // Create MediaStreamDestination for custom output routing
    const dest = ctx.createMediaStreamDestination();
    mediaStreamDestRef.current = dest;

    // Create audio element and connect to the stream
    const audioEl = new Audio();
    audioEl.srcObject = dest.stream;
    audioEl.autoplay = true;
    audioElementRef.current = audioEl;

    // Set output device if selected
    if (selectedOutputRef.current && audioEl.setSinkId) {
      try {
        await audioEl.setSinkId(selectedOutputRef.current);
      } catch (err) {
        console.warn('Failed to set audio output device:', err);
      }
    }
  }, []);

  const playAudioChunk = useCallback(async (base64Audio) => {
    if (!isEnabledRef.current) return;

    // Initialize if needed
    if (!outputAudioContextRef.current) {
      await initAudioContext();
    }

    const ctx = outputAudioContextRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const pcmBuffer = base64ToArrayBuffer(base64Audio);
    const float32Data = pcm16ToFloat32(pcmBuffer);

    // Create audio buffer
    const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    // Track total duration for subtitle sync
    pendingAudioDurationRef.current += audioBuffer.duration;

    // Schedule playback - connect to MediaStreamDestination for custom output
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(mediaStreamDestRef.current);

    const currentTime = ctx.currentTime;
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;

    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
    }

    source.onended = () => {
      source.disconnect();
      source.buffer = null;
      if (ctx.currentTime >= nextPlayTimeRef.current) {
        isPlayingRef.current = false;
      }
    };

    return true;
  }, [initAudioContext]);

  const stopAudio = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    mediaStreamDestRef.current = null;
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

  // Set output device
  const setOutputDevice = useCallback(async (deviceId) => {
    selectedOutputRef.current = deviceId || '';

    // Update existing audio element if it exists
    if (audioElementRef.current && audioElementRef.current.setSinkId) {
      try {
        await audioElementRef.current.setSinkId(deviceId || '');
        console.log('Audio output device set to:', deviceId || 'default');
      } catch (err) {
        console.warn('Failed to set audio output device:', err);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAudio();
  }, [stopAudio]);

  return useMemo(() => ({
    playAudioChunk,
    stopAudio,
    onAudioDone,
    resetTiming,
    setEnabled,
    setOutputDevice,
    isPlaying: () => isPlayingRef.current,
    isEnabled: () => isEnabledRef.current,
    getCurrentDuration: () => currentAudioDurationRef.current,
  }), [playAudioChunk, stopAudio, onAudioDone, resetTiming, setEnabled, setOutputDevice]);
}
