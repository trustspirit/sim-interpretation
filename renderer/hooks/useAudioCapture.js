import { useRef, useCallback } from 'react';

const LEVEL_UPDATE_MS = 66;

// Convert ArrayBuffer to Base64
const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
  }
  return btoa(binary);
};

/**
 * Microphone capture → 24kHz PCM16 chunks.
 * The capture graph is independent from the playback graph in useRealtimeAudio,
 * so TTS output never blocks or gates the input. Echo cancellation keeps the
 * speaker output from re-entering the mic on the default device.
 */
export default function useAudioCapture({
  selectedMic,
  speechActivity,
  onAudioData,
  onError,
  onEnded,
}) {
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const animationIdRef = useRef(null);

  const isActiveRef = useRef(false);
  const captureIdRef = useRef(0);

  const startCapture = useCallback(async () => {
    try {
      const currentCaptureId = ++captureIdRef.current;
      isActiveRef.current = true;

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedMic ? { exact: selectedMic } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
            channelCount: 1,
          }
        });
      } catch {
        console.log('[Audio] Selected mic failed, falling back to default');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 }
        });
      }

      if (currentCaptureId !== captureIdRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return false;
      }

      mediaStreamRef.current = stream;
      // Unplugged or revoked microphone: surface it instead of silently sending nothing
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (isActiveRef.current && currentCaptureId === captureIdRef.current) {
            onEnded?.('Microphone disconnected');
          }
        };
      });
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      // The OS can suspend the context (device switch, sleep); resume while capturing
      const ctx = audioContextRef.current;
      ctx.onstatechange = () => {
        if (ctx.state === 'suspended' && isActiveRef.current && currentCaptureId === captureIdRef.current) {
          ctx.resume().catch(() => {});
        }
      };
      await audioContextRef.current.audioWorklet.addModule('audio-processor.js');

      if (currentCaptureId !== captureIdRef.current) {
        audioContextRef.current.close();
        stream.getTracks().forEach(t => t.stop());
        return false;
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Send ALL audio to server — no gating. Speech activity is tracked per chunk
      // from the worklet thread, so it stays accurate even when the window is hidden.
      const worklet = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
      worklet.port.onmessage = (event) => {
        if (event.data.type !== 'audio' || !isActiveRef.current || currentCaptureId !== captureIdRef.current) return;
        speechActivity?.onLevel(event.data.peak ?? 0);
        onAudioData?.(arrayBufferToBase64(event.data.buffer));
      };
      source.connect(worklet);
      audioWorkletNodeRef.current = worklet;

      return true;
    } catch (error) {
      onError?.(error?.name === 'NotFoundError' ? 'No microphone found' : 'Mic access denied');
      return false;
    }
  }, [selectedMic, speechActivity, onAudioData, onError, onEnded]);

  const stopCapture = useCallback(() => {
    isActiveRef.current = false;

    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }

    if (audioWorkletNodeRef.current?.port) {
      audioWorkletNodeRef.current.port.onmessage = null;
    }

    audioWorkletNodeRef.current?.disconnect();
    analyserRef.current?.disconnect();
    audioContextRef.current?.close();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());

    audioWorkletNodeRef.current = null;
    analyserRef.current = null;
    audioContextRef.current = null;
    mediaStreamRef.current = null;
  }, []);

  // Level meter for the UI only. Updated ~15 times a second: every update
  // re-renders the app on the same thread that forwards microphone audio.
  const lastLevelRef = useRef({ at: 0, value: 0 });
  const visualize = useCallback((onLevelChange) => {
    if (!analyserRef.current || !isActiveRef.current) return;

    const now = performance.now();
    if (now - lastLevelRef.current.at >= LEVEL_UPDATE_MS) {
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteTimeDomainData(dataArray);

      let max = 0;
      for (let i = 0; i < bufferLength; i++) {
        const amplitude = Math.abs(dataArray[i] - 128);
        if (amplitude > max) max = amplitude;
      }
      const level = max / 128;
      lastLevelRef.current.at = now;
      if (Math.abs(level - lastLevelRef.current.value) >= 0.01) {
        lastLevelRef.current.value = level;
        onLevelChange?.(level);
      }
    }

    animationIdRef.current = requestAnimationFrame(() => visualize(onLevelChange));
  }, []);

  const startVisualization = useCallback((onLevelChange) => {
    if (analyserRef.current && isActiveRef.current) {
      animationIdRef.current = requestAnimationFrame(() => visualize(onLevelChange));
    }
  }, [visualize]);

  return {
    startCapture,
    stopCapture,
    startVisualization,
  };
}
