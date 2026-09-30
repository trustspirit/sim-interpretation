import { useRef, useEffect, useCallback } from 'react';

const SWITCH_MAX_ATTEMPTS = 3;
const SWITCH_RETRY_DELAY_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  // Engine objects are recreated every render; the switch effect must only
  // react to the mode itself, or a status re-render would cancel the switch
  const enginesRef = useRef({ whisper, realtimeTranslate });
  enginesRef.current = { whisper, realtimeTranslate };

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

    const engines = enginesRef.current;
    const oldEngine = prevMode === 'whisper' ? engines.whisper : engines.realtimeTranslate;
    const newEngine = mode === 'whisper' ? engines.whisper : engines.realtimeTranslate;

    console.log(`[TranslationEngine] Switching mode: ${prevMode} → ${mode}`);
    onStatusChangeRef.current?.('connecting', 'Switching mode...');
    oldEngine.stopForceCommitTimer();
    oldEngine.disconnect();

    const apiKey = apiKeyRef.current;
    let cancelled = false;
    (async () => {
      for (let attempt = 1; attempt <= SWITCH_MAX_ATTEMPTS; attempt++) {
        try {
          await newEngine.connect(apiKey);
          if (cancelled) { newEngine.disconnect(); return; }
          newEngine.startForceCommitTimer();
          onStatusChangeRef.current?.('connected', 'Speak now');
          return;
        } catch (err) {
          if (cancelled) return;
          console.warn(`[TranslationEngine] Switch attempt ${attempt} failed:`, err?.message);
          if (attempt < SWITCH_MAX_ATTEMPTS) {
            onStatusChangeRef.current?.('connecting', `Switching mode (retry ${attempt}/${SWITCH_MAX_ATTEMPTS - 1})...`);
            await sleep(SWITCH_RETRY_DELAY_MS);
          }
        }
      }
      if (!cancelled) onStatusChangeRef.current?.('error', 'Mode switch failed — press Stop and Start again');
    })();

    // A further mode change or Stop cancels this switch
    return () => { cancelled = true; };
  }, [mode]);

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
