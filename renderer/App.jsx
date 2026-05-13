import React, { useState, useEffect, useRef, useCallback } from 'react';

// Components
import { Header, LanguageBar, ControlBar } from './components/layout';
import { TranslationDisplay, SubtitleMode } from './components/translation';

// Hooks
import {
  useSubtitle,
  useMicrophones,
  useRealtimeAudio,
  useConnectionManager,
  useTranslationSession,
  useVoiceMode,
  useUISettings,
} from './hooks';
import useTranslationEngine from './hooks/useTranslationEngine';

// Constants
import { getRealtimeVoice } from './constants';

export default function App() {
  // Language settings
  const [langA, setLangA] = useState('en');
  const [langB, setLangB] = useState('ko');
  const [direction, setDirection] = useState(() => localStorage.getItem('translatorDirection') || 'auto');

  // API & Settings
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('translatorApiKey') || '');
  const [customInstruction, setCustomInstruction] = useState(() => localStorage.getItem('translatorInstruction') || '');
  const envApiKey = window.electronAPI?.getApiKey?.() || '';

  // Translation mode
  const [translationMode, setTranslationMode] = useState(
    () => localStorage.getItem('translatorMode') || 'whisper'
  );

  // UI Settings
  const ui = useUISettings();

  // Voice Mode
  const voice = useVoiceMode();

  // Status state (lifted up to break circular dep between engine and connection manager)
  const [status, setStatus] = useState('ready');
  const [statusText, setStatusText] = useState('Ready');
  const updateStatus = useCallback((state, text) => {
    setStatus(state);
    setStatusText(text);
  }, []);

  // Microphones
  const { selectedMic, selectMic } = useMicrophones();
  const realtimeAudio = useRealtimeAudio();

  const subtitle = useSubtitle({
    isEnabled: ui.isSubtitleMode,
    maxCharsPerLine: ui.maxCharsPerLine,
  });

  // Translation session — manages state and provides engine callbacks
  const translationSession = useTranslationSession({
    realtimeAudio,
    subtitle,
    isVoiceModeRef: voice.isVoiceModeRef,
    isSubtitleModeRef: ui.isSubtitleModeRef,
    isSpeakingTTSRef: voice.isSpeakingTTSRef,
    setIsSpeakingTTS: voice.setIsSpeakingTTS,
    ttsEndTimeoutRef: voice.ttsEndTimeoutRef,
  });

  // Translation engine — selected by mode, routes audio → transcript → translation
  const engine = useTranslationEngine({
    mode: translationMode,
    langA, langB, direction,
    voiceType: voice.voiceType,
    customInstruction,
    isVoiceMode: voice.isVoiceMode,
    onTranscript: translationSession.handleTranscript,
    onTranslation: translationSession.handleTranslation,
    onAudioChunk: translationSession.handleAudioChunk,
    onAudioDone: translationSession.handleAudioDone,
    onStatusChange: updateStatus,
    onDisconnect: translationSession.handleDisconnect,
  });

  const handleStop = useCallback(() => {
    translationSession.resetSession();
    voice.cleanupTTS();
    realtimeAudio.resetTiming();
  }, [translationSession.resetSession, voice.cleanupTTS, realtimeAudio.resetTiming]);

  // Connection manager — orchestrates engine + audio capture
  const connection = useConnectionManager({
    engine,
    selectedMic,
    apiKey, envApiKey,
    updateStatus,
    onStop: handleStop,
  });

  const handleTranslationModeChange = useCallback((newMode) => {
    setTranslationMode(newMode);
    localStorage.setItem('translatorMode', newMode);
  }, []);

  // Effects
  useEffect(() => {
    const handleSettingsClosed = () => {
      setApiKey(localStorage.getItem('translatorApiKey') || '');
      setCustomInstruction(localStorage.getItem('translatorInstruction') || '');
      selectMic(localStorage.getItem('translatorMic') || '');
      ui.setSubtitlePosition(localStorage.getItem('translatorSubtitlePosition') || 'bottom');
      setDirection(localStorage.getItem('translatorDirection') || 'auto');
      voice.setAudioOutput(localStorage.getItem('translatorAudioOutput') || '');
    };
    window.electronAPI?.onSettingsClosed?.(handleSettingsClosed);
    window.electronAPI?.getSubtitleMode?.().then(mode => ui.setIsSubtitleMode(mode || false));
  }, [selectMic]);

  useEffect(() => {
    voice.isVoiceModeRef.current = voice.isVoiceMode;
    realtimeAudio.setEnabled(voice.isVoiceMode);

    if (!connection.isListeningRef.current) return;
    const sessionUpdate = voice.isVoiceMode
      ? { modalities: ['text', 'audio'], voice: getRealtimeVoice(voice.voiceType), output_audio_format: 'pcm16' }
      : { modalities: ['text'] };
    engine.send({ type: 'session.update', session: sessionUpdate });
  }, [voice.isVoiceMode, voice.voiceType, realtimeAudio]);

  useEffect(() => {
    if (voice.audioOutput) realtimeAudio.setOutputDevice(voice.audioOutput);
  }, [voice.audioOutput, realtimeAudio]);

  useEffect(() => { ui.isSubtitleModeRef.current = ui.isSubtitleMode; }, [ui.isSubtitleMode]);

  useEffect(() => {
    return () => voice.cleanupTTS();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Process translations into subtitle queue
  useEffect(() => {
    if (!ui.isSubtitleMode) return;
    if (translationSession.currentTranslation) return;

    const latestIndex = translationSession.translatedText.length - 1;
    if (latestIndex < 0 || latestIndex <= subtitle.getLastProcessedIndex()) return;

    const newText = translationSession.translatedText[latestIndex];
    subtitle.setLastProcessedIndex(latestIndex);
    subtitle.addTranslation(newText);

    if (!subtitle.isProcessing()) {
      if (voice.isVoiceModeRef.current) {
        subtitle.setPendingStart(true);
        if (realtimeAudio.isPlaying()) {
          subtitle.startProcessing();
          subtitle.setPendingStart(false);
        }
      } else {
        subtitle.startProcessing();
      }
    }
  }, [ui.isSubtitleMode, translationSession.translatedText, translationSession.currentTranslation, subtitle, realtimeAudio]);

  // Subtitle Mode
  if (ui.isSubtitleMode) {
    return (
      <SubtitleMode
        currentSubtitle={subtitle.currentSubtitle}
        currentTranslation={translationSession.currentTranslation}
        hasQueue={subtitle.hasQueue()}
        queueLength={subtitle.queue.length}
        isListening={connection.isListening}
        audioLevel={connection.audioLevel}
        status={status}
        langB={langB}
        subtitlePosition={ui.subtitlePosition}
        onToggleSubtitleMode={ui.toggleSubtitleMode}
        onToggleSubtitlePosition={ui.toggleSubtitlePosition}
        onStart={connection.startListening}
        onStop={connection.stopListening}
        onMaxCharsCalculated={ui.setMaxCharsPerLine}
      />
    );
  }

  // Normal Mode
  return (
    <div className="h-full bg-[#0a0a0a] text-codex-text flex flex-col overflow-hidden">
      <Header
        isListening={connection.isListening}
        audioLevel={connection.audioLevel}
        status={status}
        statusText={statusText}
        onSettingsClick={ui.openSettings}
      />

      <LanguageBar
        langA={langA}
        langB={langB}
        direction={direction}
        onLangAChange={setLangA}
        onLangBChange={setLangB}
        onDirectionChange={setDirection}
        disabled={connection.isListening}
      />

      <main className="flex-1 flex flex-col min-h-0 p-4">
        <TranslationDisplay
          translatedText={translationSession.translatedText}
          currentTranslation={translationSession.currentTranslation}
          originalText={translationSession.originalText}
          fontSize={ui.fontSize}
          textDirection={ui.textDirection}
          isListening={connection.isListening}
          isVoiceMode={voice.isVoiceMode}
          voiceOnlyMode={voice.voiceOnlyMode}
          isSpeakingTTS={voice.isSpeakingTTS}
          showOriginalText={voice.showOriginalText}
        />

        <ControlBar
          isListening={connection.isListening}
          onStart={connection.startListening}
          onStop={connection.stopListening}
          fontSize={ui.fontSize}
          onFontSizeIncrease={ui.increaseFontSize}
          onFontSizeDecrease={ui.decreaseFontSize}
          textDirection={ui.textDirection}
          onToggleDirection={ui.toggleTextDirection}
          onToggleSubtitleMode={ui.toggleSubtitleMode}
          isVoiceMode={voice.isVoiceMode}
          onToggleVoiceMode={voice.toggleVoiceMode}
          voiceType={voice.voiceType}
          onVoiceTypeChange={voice.setVoiceType}
          isSpeakingTTS={voice.isSpeakingTTS}
          voiceOnlyMode={voice.voiceOnlyMode}
          onToggleVoiceOnlyMode={voice.toggleVoiceOnlyMode}
          showOriginalText={voice.showOriginalText}
          onToggleShowOriginalText={voice.toggleShowOriginalText}
          onClear={translationSession.clearTranscripts}
          translationMode={translationMode}
          onTranslationModeChange={handleTranslationModeChange}
        />
      </main>
    </div>
  );
}
