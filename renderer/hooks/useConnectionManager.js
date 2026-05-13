import { useState, useRef, useCallback } from 'react';
import useAudioCapture from './useAudioCapture';
import { clearRecentTranscriptions } from '../constants';

export default function useConnectionManager({
  engine,
  selectedMic,
  apiKey,
  envApiKey,
  status,
  statusText,
  updateStatus,
  onStop,
}) {
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const isListeningRef = useRef(false);

  const engineRef = useRef(engine);
  engineRef.current = engine;

  const audioCapture = useAudioCapture({
    selectedMic,
    onAudioData: (base64Audio) => engineRef.current.sendAudio(base64Audio),
    onError: (msg) => updateStatus('error', msg),
  });

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setAudioLevel(0);
    clearRecentTranscriptions();
    audioCapture.stopCapture();
    engineRef.current.stopForceCommitTimer?.();
    engineRef.current.disconnect();
    onStop?.();
    updateStatus('ready', 'Ready');
  }, [audioCapture, onStop, updateStatus]);

  const startListening = useCallback(async () => {
    const key = apiKey || envApiKey;
    console.log('[Start] API key present:', !!key, 'length:', key?.length);
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      updateStatus('connecting', attempt > 1 ? `Retrying (${attempt}/${MAX_RETRIES})...` : 'Connecting...');
      try {
        console.log(`[Start] Attempt ${attempt}/${MAX_RETRIES}`);
        await engineRef.current.connect(key);
        console.log('[Start] Connected successfully');
        const audioStarted = await audioCapture.startCapture();
        console.log('[Start] Audio capture:', audioStarted);
        if (!audioStarted) {
          stopListening();
          return;
        }
        isListeningRef.current = true;
        setIsListening(true);
        audioCapture.startVisualization(setAudioLevel);
        engineRef.current.startForceCommitTimer?.();
        updateStatus('connected', 'Speak now');
        return;
      } catch (err) {
        console.log(`[Start] Attempt ${attempt} failed:`, err?.message);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    console.log('[Start] All retries failed');
    stopListening();
  }, [apiKey, envApiKey, audioCapture, stopListening, updateStatus]);

  return {
    status,
    statusText,
    isListening,
    audioLevel,
    isListeningRef,
    updateStatus,
    startListening,
    stopListening,
  };
}
