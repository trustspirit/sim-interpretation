import { useState, useCallback } from 'react';

export default function useTranslationSession({
  realtimeAudio,
  subtitle,
  isVoiceModeRef,
  isSubtitleModeRef,
  isSpeakingTTSRef,
  setIsSpeakingTTS,
  ttsEndTimeoutRef,
}) {
  const [originalText, setOriginalText] = useState([]);
  const [translatedText, setTranslatedText] = useState([]);

  // Called by engine when a transcript (original speech) is ready
  const handleTranscript = useCallback((text) => {
    setOriginalText(prev => {
      const next = [...prev, text];
      return next.length > 50 ? next.slice(-50) : next;
    });
  }, []);

  // Called by engine when a translation result is ready
  const handleTranslation = useCallback((text) => {
    setTranslatedText(prev => {
      const next = [...prev, text];
      return next.length > 50 ? next.slice(-50) : next;
    });
  }, []);

  // Called by engine when a TTS audio chunk arrives
  const handleAudioChunk = useCallback((delta) => {
    if (!isVoiceModeRef.current) return;
    realtimeAudio.playAudioChunk(delta);

    if (ttsEndTimeoutRef.current) {
      clearTimeout(ttsEndTimeoutRef.current);
      ttsEndTimeoutRef.current = null;
    }

    if (!isSpeakingTTSRef.current) {
      isSpeakingTTSRef.current = true;
      setIsSpeakingTTS(true);
    }

    if (isSubtitleModeRef.current && subtitle.isPendingStart() && subtitle.hasQueue()) {
      subtitle.setPendingStart(false);
      subtitle.startProcessing();
    }
  }, [realtimeAudio, subtitle, isVoiceModeRef, isSubtitleModeRef, isSpeakingTTSRef, setIsSpeakingTTS, ttsEndTimeoutRef]);

  // Called by engine when a TTS audio stream ends
  const handleAudioDone = useCallback(() => {
    realtimeAudio.onAudioDone();
    ttsEndTimeoutRef.current = setTimeout(() => {
      ttsEndTimeoutRef.current = null;
      isSpeakingTTSRef.current = false;
      setIsSpeakingTTS(false);
    }, 500);
  }, [realtimeAudio, isSpeakingTTSRef, setIsSpeakingTTS, ttsEndTimeoutRef]);

  // Called by engine on WebSocket disconnect
  const handleDisconnect = useCallback(() => {
    // Engine handles its own state reset; no action needed here
  }, []);

  const clearTranscripts = useCallback(() => {
    setOriginalText([]);
    setTranslatedText([]);
  }, []);

  return {
    originalText,
    translatedText,

    handleTranscript,
    handleTranslation,
    handleAudioChunk,
    handleAudioDone,
    handleDisconnect,

    clearTranscripts,
  };
}
