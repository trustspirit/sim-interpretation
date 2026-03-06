import { useState, useRef, useCallback } from 'react';

export default function useVoiceMode() {
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceType, setVoiceType] = useState(() => localStorage.getItem('translatorVoice') || 'nova');
  const [isSpeakingTTS, setIsSpeakingTTS] = useState(false);
  const isSpeakingTTSRef = useRef(false);
  const [voiceOnlyMode, setVoiceOnlyMode] = useState(() =>
    localStorage.getItem('translatorVoiceOnly') === 'true'
  );
  const [audioOutput, setAudioOutput] = useState(() =>
    localStorage.getItem('translatorAudioOutput') || ''
  );
  const [showOriginalText, setShowOriginalText] = useState(() =>
    localStorage.getItem('translatorShowOriginal') !== 'false'
  );

  const isVoiceModeRef = useRef(false);
  const ttsEndTimeoutRef = useRef(null);

  const toggleVoiceMode = useCallback(() => setIsVoiceMode(prev => !prev), []);

  const toggleVoiceOnlyMode = useCallback(() => {
    setVoiceOnlyMode(prev => {
      const newValue = !prev;
      localStorage.setItem('translatorVoiceOnly', newValue.toString());
      return newValue;
    });
  }, []);

  const toggleShowOriginalText = useCallback(() => {
    setShowOriginalText(prev => {
      const newValue = !prev;
      localStorage.setItem('translatorShowOriginal', newValue.toString());
      return newValue;
    });
  }, []);

  const cleanupTTS = useCallback(() => {
    if (ttsEndTimeoutRef.current) {
      clearTimeout(ttsEndTimeoutRef.current);
      ttsEndTimeoutRef.current = null;
    }
    isSpeakingTTSRef.current = false;
    setIsSpeakingTTS(false);
  }, []);

  return {
    isVoiceMode,
    voiceType,
    setVoiceType,
    isSpeakingTTS,
    setIsSpeakingTTS,
    isSpeakingTTSRef,
    voiceOnlyMode,
    audioOutput,
    setAudioOutput,
    showOriginalText,
    isVoiceModeRef,
    ttsEndTimeoutRef,
    toggleVoiceMode,
    toggleVoiceOnlyMode,
    toggleShowOriginalText,
    cleanupTTS,
  };
}
