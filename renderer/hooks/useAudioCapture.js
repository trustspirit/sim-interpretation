import { useRef, useCallback } from 'react';

// Audio detection thresholds (tuned for translation quality)
const SILENCE_THRESHOLD = 0.06;      // Higher = less noise triggers (was 0.04)
const SILENCE_DURATION_MS = 600;     // Wait 600ms of silence before commit (complete sentences)
const MIN_SPEECH_DURATION_MS = 600;  // Ignore speech shorter than 600ms (was 400ms, reduce noise/hallucination)

// Convert ArrayBuffer to Base64
const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export default function useAudioCapture({
  selectedMic,
  onAudioData,
  onCommit,
  onError
}) {
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const animationIdRef = useRef(null);

  const isActiveRef = useRef(false);
  const audioLevelRef = useRef(0);
  const captureIdRef = useRef(0); // Track capture session to handle race conditions

  // Silence detection refs
  const isSpeakingRef = useRef(false);
  const silenceStartRef = useRef(null);
  const speechStartRef = useRef(null);
  const lastSpeechEndRef = useRef(0); // Track when speech last ended (for hallucination detection)
  const hasAudioToCommitRef = useRef(false); // Track if audio has been sent since last commit
  const lastBufferClearRef = useRef(0);      // Track last buffer clear time
  const preBufferRef = useRef([]);           // Pre-buffer to capture speech onset
  const PRE_BUFFER_SIZE = 2;                 // Keep last 2 chunks (~200ms) for speech onset

  const startCapture = useCallback(async () => {
    try {
      // Increment capture ID to invalidate any in-flight async operations
      const currentCaptureId = ++captureIdRef.current;
      isActiveRef.current = true;

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedMic ? { exact: selectedMic } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch {
        // Selected mic not found — fallback to default mic
        console.log('[Audio] Selected mic failed, falling back to default');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      }

      // Check if this capture session is still valid
      if (currentCaptureId !== captureIdRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return false;
      }

      mediaStreamRef.current = stream;
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });

      await audioContextRef.current.audioWorklet.addModule('audio-processor.js');

      // Check again after async operation
      if (currentCaptureId !== captureIdRef.current) {
        audioContextRef.current.close();
        stream.getTracks().forEach(t => t.stop());
        return false;
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const worklet = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
      worklet.port.onmessage = (event) => {
        if (event.data.type === 'audio' && isActiveRef.current && currentCaptureId === captureIdRef.current) {
          const base64Audio = arrayBufferToBase64(event.data.buffer);

          if (isSpeakingRef.current) {
            // Speaking: flush pre-buffer first (captures speech onset), then send live
            if (preBufferRef.current.length > 0) {
              for (const buffered of preBufferRef.current) {
                onAudioData?.(buffered);
              }
              preBufferRef.current = [];
            }
            hasAudioToCommitRef.current = true;
            onAudioData?.(base64Audio);
          } else {
            // Silent: buffer locally, don't send to server
            preBufferRef.current.push(base64Audio);
            if (preBufferRef.current.length > PRE_BUFFER_SIZE) {
              preBufferRef.current.shift();
            }
          }
        }
      };
      source.connect(worklet);
      audioWorkletNodeRef.current = worklet;

      return true;
    } catch (error) {
      onError?.('Mic access denied');
      return false;
    }
  }, [selectedMic, onAudioData, onError]);

  const stopCapture = useCallback(() => {
    isActiveRef.current = false;
    audioLevelRef.current = 0;
    isSpeakingRef.current = false;
    silenceStartRef.current = null;
    speechStartRef.current = null;
    hasAudioToCommitRef.current = false;
    preBufferRef.current = [];

    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }

    // Clean up AudioWorkletNode message handler to prevent memory leak
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

  const visualize = useCallback((onLevelChange) => {
    if (!analyserRef.current || !isActiveRef.current) return 0;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);

    let max = 0;
    for (let i = 0; i < bufferLength; i++) {
      const amplitude = Math.abs(dataArray[i] - 128);
      if (amplitude > max) max = amplitude;
    }
    const level = max / 128;
    audioLevelRef.current = level;
    onLevelChange?.(level);

    // Silence detection for commit
    const now = Date.now();
    if (level > SILENCE_THRESHOLD) {
      if (!isSpeakingRef.current) {
        isSpeakingRef.current = true;
        speechStartRef.current = now;
      }
      silenceStartRef.current = null;
    } else if (isSpeakingRef.current) {
      if (!silenceStartRef.current) {
        silenceStartRef.current = now;
      } else if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
        const speechDuration = silenceStartRef.current - speechStartRef.current;
        isSpeakingRef.current = false;
        lastSpeechEndRef.current = now; // Track when speech ended
        silenceStartRef.current = null;
        speechStartRef.current = null;
        if (speechDuration >= MIN_SPEECH_DURATION_MS && hasAudioToCommitRef.current) {
          console.log(`[VAD] Silence detected after ${speechDuration}ms of speech, triggering commit`);
          hasAudioToCommitRef.current = false; // Reset after commit
          onCommit?.();
        }
      }
    }

    animationIdRef.current = requestAnimationFrame(() => visualize(onLevelChange));
    return level;
  }, [onCommit]);

  const startVisualization = useCallback((onLevelChange) => {
    if (analyserRef.current && isActiveRef.current) {
      animationIdRef.current = requestAnimationFrame(() => visualize(onLevelChange));
    }
  }, [visualize]);

  return {
    startCapture,
    stopCapture,
    startVisualization,
    isActive: () => isActiveRef.current,
    getAudioLevel: () => audioLevelRef.current,
    // For hallucination detection
    isSpeaking: () => isSpeakingRef.current,
    hadRecentSpeech: (thresholdMs = 3000) => {
      if (isSpeakingRef.current) return true; // Currently speaking
      if (lastSpeechEndRef.current === 0) return false; // Never spoke
      return (Date.now() - lastSpeechEndRef.current) < thresholdMs;
    },
  };
}
