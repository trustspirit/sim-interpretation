import { useRef, useCallback } from 'react';

// Convert ArrayBuffer to Base64
const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
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
  onError
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
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
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
      onError?.('Mic access denied');
      return false;
    }
  }, [selectedMic, speechActivity, onAudioData, onError]);

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

  // Level meter for the UI only
  const visualize = useCallback((onLevelChange) => {
    if (!analyserRef.current || !isActiveRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);

    let max = 0;
    for (let i = 0; i < bufferLength; i++) {
      const amplitude = Math.abs(dataArray[i] - 128);
      if (amplitude > max) max = amplitude;
    }
    onLevelChange?.(max / 128);

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
