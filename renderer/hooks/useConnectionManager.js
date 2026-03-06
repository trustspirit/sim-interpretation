import { useState, useRef, useCallback, useEffect } from 'react';
import useWebSocket from './useWebSocket';
import useAudioCapture from './useAudioCapture';
import { clearRecentTranscriptions } from '../constants';

// Ref-based late binding to break circular dependency with useTranslationSession
export default function useConnectionManager({
  langA,
  langB,
  direction,
  voiceType,
  customInstruction,
  isVoiceMode,
  selectedMic,
  apiKey,
  envApiKey,
  serverEventHandlerRef,
  disconnectHandlerRef,
  onStopHandlerRef,
}) {
  const [status, setStatus] = useState('ready');
  const [statusText, setStatusText] = useState('Ready');
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const isListeningRef = useRef(false);
  const websocketRef = useRef(null);
  const audioCaptureRef = useRef(null);

  const updateStatus = useCallback((state, text) => {
    setStatus(state);
    setStatusText(text);
  }, []);

  const handleServerEvent = useCallback((event) => {
    serverEventHandlerRef.current?.(event);
  }, [serverEventHandlerRef]);

  const handleDisconnect = useCallback(() => {
    disconnectHandlerRef.current?.();
  }, [disconnectHandlerRef]);

  const websocket = useWebSocket({
    langA,
    langB,
    direction,
    voiceType,
    customInstruction,
    isVoiceMode,
    onStatusChange: updateStatus,
    onServerEvent: handleServerEvent,
    onDisconnect: handleDisconnect,
  });

  useEffect(() => { websocketRef.current = websocket; }, [websocket]);

  const audioCapture = useAudioCapture({
    selectedMic,
    onAudioData: (base64Audio) => websocket.sendAudio(base64Audio),
    onError: (msg) => updateStatus('error', msg),
  });

  useEffect(() => { audioCaptureRef.current = audioCapture; }, [audioCapture]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setAudioLevel(0);
    clearRecentTranscriptions();
    audioCapture.stopCapture();
    websocket.disconnect();
    onStopHandlerRef.current?.();
    updateStatus('ready', 'Ready');
  }, [audioCapture, websocket, onStopHandlerRef, updateStatus]);

  const startListening = useCallback(async () => {
    const key = apiKey || envApiKey;
    console.log('[Start] API key present:', !!key, 'length:', key?.length);
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      updateStatus('connecting', attempt > 1 ? `Retrying (${attempt}/${MAX_RETRIES})...` : 'Connecting...');
      try {
        console.log(`[Start] Attempt ${attempt}/${MAX_RETRIES}`);
        await websocket.connect(key);
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
  }, [apiKey, envApiKey, websocket, audioCapture, stopListening, updateStatus]);

  return {
    status,
    statusText,
    isListening,
    audioLevel,
    isListeningRef,
    websocketRef,
    audioCaptureRef,
    updateStatus,
    startListening,
    stopListening,
  };
}
