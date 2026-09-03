import { useState, useRef, useCallback } from 'react';
import useAudioCapture from './useAudioCapture';
import { clearRecentTranscriptions } from '../constants';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export default function useConnectionManager({
  engine,
  selectedMic,
  speechActivity,
  apiKey,
  envApiKey,
  updateStatus,
  onStop,
}) {
  const [isListening, setIsListening] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const isListeningRef = useRef(false);
  const isConnectingRef = useRef(false);
  // Bumped by stop/start so a cancelled attempt can't finish connecting later
  const attemptGenerationRef = useRef(0);

  const engineRef = useRef(engine);
  engineRef.current = engine;

  const audioCapture = useAudioCapture({
    selectedMic,
    speechActivity,
    onAudioData: (base64Audio) => engineRef.current.sendAudio(base64Audio),
    onError: (msg) => updateStatus('error', msg),
  });

  const stopListening = useCallback(() => {
    attemptGenerationRef.current += 1;
    isListeningRef.current = false;
    isConnectingRef.current = false;
    setIsListening(false);
    setIsConnecting(false);
    setAudioLevel(0);
    clearRecentTranscriptions();
    speechActivity?.reset();
    audioCapture.stopCapture();
    engineRef.current.stopForceCommitTimer?.();
    engineRef.current.disconnect();
    onStop?.();
    updateStatus('ready', 'Ready');
  }, [audioCapture, speechActivity, onStop, updateStatus]);

  const startListening = useCallback(async () => {
    if (isListeningRef.current || isConnectingRef.current) return;
    const key = apiKey || envApiKey;
    console.log('[Start] API key present:', !!key, 'length:', key?.length);

    const generation = ++attemptGenerationRef.current;
    const cancelled = () => generation !== attemptGenerationRef.current;
    isConnectingRef.current = true;
    setIsConnecting(true);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      updateStatus('connecting', attempt > 1 ? `Retrying (${attempt}/${MAX_RETRIES})...` : 'Connecting...');
      try {
        console.log(`[Start] Attempt ${attempt}/${MAX_RETRIES}`);
        await engineRef.current.connect(key);
        if (cancelled()) { engineRef.current.disconnect(); return; }
        console.log('[Start] Connected successfully');

        const audioStarted = await audioCapture.startCapture();
        if (cancelled()) { audioCapture.stopCapture(); engineRef.current.disconnect(); return; }
        console.log('[Start] Audio capture:', audioStarted);
        if (!audioStarted) {
          stopListening();
          return;
        }

        isListeningRef.current = true;
        isConnectingRef.current = false;
        setIsListening(true);
        setIsConnecting(false);
        audioCapture.startVisualization(setAudioLevel);
        engineRef.current.startForceCommitTimer?.();
        updateStatus('connected', 'Speak now');
        return;
      } catch (err) {
        if (cancelled()) return;
        console.log(`[Start] Attempt ${attempt} failed:`, err?.message);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          if (cancelled()) return;
        }
      }
    }
    console.log('[Start] All retries failed');
    stopListening();
    updateStatus('error', 'Connection failed');
  }, [apiKey, envApiKey, audioCapture, stopListening, updateStatus]);

  return {
    isListening,
    isConnecting,
    audioLevel,
    isListeningRef,
    startListening,
    stopListening,
  };
}
