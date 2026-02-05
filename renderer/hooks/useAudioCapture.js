import { useRef, useCallback } from 'react';
import { SILENCE_THRESHOLD, SILENCE_DURATION_MS, MIN_SPEECH_DURATION_MS } from '../constants';

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
  
  const isSpeakingRef = useRef(false);
  const silenceStartRef = useRef(null);
  const speechStartRef = useRef(null);
  const isActiveRef = useRef(false);
  const audioLevelRef = useRef(0);

  const startCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          deviceId: selectedMic ? { exact: selectedMic } : undefined, 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true 
        }
      });
      
      mediaStreamRef.current = stream;
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      
      await audioContextRef.current.audioWorklet.addModule('audio-processor.js');
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      const worklet = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
      worklet.port.onmessage = (event) => {
        if (event.data.type === 'audio' && isActiveRef.current) {
          const base64Audio = arrayBufferToBase64(event.data.buffer);
          onAudioData?.(base64Audio);
        }
      };
      source.connect(worklet);
      audioWorkletNodeRef.current = worklet;
      
      isActiveRef.current = true;
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
    
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
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
        silenceStartRef.current = null;
        speechStartRef.current = null;
        if (speechDuration >= MIN_SPEECH_DURATION_MS) {
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
  };
}
