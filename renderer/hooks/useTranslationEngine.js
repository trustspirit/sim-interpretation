import { useRef, useEffect, useCallback } from 'react';
import useWhisperEngine from './engines/useWhisperEngine';
import useRealtimeTranslateEngine from './engines/useRealtimeTranslateEngine';

/**
 * Factory hook: returns the active translation engine based on mode.
 * Both engines are always instantiated (React hook rules), but only the
 * active one handles connections. Mode switching while connected triggers
 * an automatic disconnect → reconnect with the new engine.
 */
export default function useTranslationEngine({
  mode,
  langA, langB, direction, voiceType, customInstruction, isVoiceMode, speechActivity,
  onTranscript, onTranslation, onAudioChunk, onAudioDone, onStatusChange, onDisconnect,
}) {
  const sharedParams = {
    langA, langB, direction, voiceType, customInstruction, isVoiceMode, speechActivity,
    onTranscript, onTranslation, onAudioChunk, onAudioDone, onStatusChange, onDisconnect,
  };

  const whisper = useWhisperEngine(sharedParams);
  const realtimeTranslate = useRealtimeTranslateEngine(sharedParams);

  // Track whether we currently have an active connection and with which API key
  const isConnectedRef = useRef(false);
  const apiKeyRef = useRef(null);
  const prevModeRef = useRef(mode);
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  // Handle mode change while connected — disconnect old engine, connect new one
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    const prevMode = prevModeRef.current;
    prevModeRef.current = mode;

    if (!isConnectedRef.current || !apiKeyRef.current) return;

    const oldEngine = prevMode === 'whisper' ? whisper : realtimeTranslate;
    const newEngine = mode === 'whisper' ? whisper : realtimeTranslate;

    console.log(`[TranslationEngine] Switching mode: ${prevMode} → ${mode}`);
    onStatusChangeRef.current?.('connecting', 'Switching mode...');
    oldEngine.stopForceCommitTimer();
    oldEngine.disconnect();
    newEngine.connect(apiKeyRef.current)
      .then(() => {
        newEngine.startForceCommitTimer();
        onStatusChangeRef.current?.('connected', 'Speak now');
      })
      .catch(() => {
        onStatusChangeRef.current?.('error', 'Mode switch failed');
      });
  }, [mode, whisper, realtimeTranslate]);

  const activeEngine = mode === 'whisper' ? whisper : realtimeTranslate;

  const connect = useCallback((apiKey) => {
    apiKeyRef.current = apiKey;
    return activeEngine.connect(apiKey).then((result) => {
      isConnectedRef.current = true;
      return result;
    });
  }, [activeEngine]);

  const disconnect = useCallback(() => {
    isConnectedRef.current = false;
    apiKeyRef.current = null;
    // Disconnect both to handle edge cases (e.g. race conditions on rapid mode switching)
    whisper.disconnect();
    realtimeTranslate.disconnect();
  }, [whisper, realtimeTranslate]);

  return {
    capabilities: activeEngine.capabilities,
    connect,
    disconnect,
    sendAudio: activeEngine.sendAudio,
    commitAudio: activeEngine.commitAudio,
    send: activeEngine.send,
    startForceCommitTimer: activeEngine.startForceCommitTimer,
    stopForceCommitTimer: activeEngine.stopForceCommitTimer,
  };
}
