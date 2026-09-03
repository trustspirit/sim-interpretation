import React, { useState, useEffect, useMemo, useCallback } from 'react';

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
import { createSpeechActivityTracker } from './utils/speechActivity';

// Mic peak level (0..1) above which a chunk counts as speech
const SPEECH_THRESHOLD = 0.06;

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

  // Shared between capture (writes) and engines (reads) to reject silence hallucinations
  const speechActivity = useMemo(() => createSpeechActivityTracker({ threshold: SPEECH_THRESHOLD }), []);

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
    speechActivity,
    onTranscript: translationSession.handleTranscript,
    onTranslation: translationSession.handleTranslation,
    onAudioChunk: translationSession.handleAudioChunk,
    onAudioDone: translationSession.handleAudioDone,
    onStatusChange: updateStatus,
    onDisconnect: translationSession.handleDisconnect,
  });

  const handleStop = useCallback(() => {
    voice.cleanupTTS();
    realtimeAudio.stopPlayback();
  }, [voice.cleanupTTS, realtimeAudio.stopPlayback]);

  // Connection manager — orchestrates engine + audio capture
  const connection = useConnectionManager({
    engine,
    selectedMic,
    speechActivity,
    apiKey, envApiKey,
    updateStatus,
    onStop: handleStop,
  });

  const handleTranslationModeChange = useCallback((newMode) => {
    setTranslationMode(newMode);
    localStorage.setItem('translatorMode', newMode);
  }, []);

  // Realtime Translate has no bidirectional auto mode; show what will actually happen
  const effectiveDirection = !engine.capabilities.autoDirection && direction === 'auto' ? 'a-to-b' : direction;

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

  // Voice mode only toggles local playback; engines read isVoiceMode through refs
  useEffect(() => {
    voice.isVoiceModeRef.current = voice.isVoiceMode;
    realtimeAudio.setEnabled(voice.isVoiceMode);
  }, [voice.isVoiceMode, realtimeAudio]);

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
  }, [ui.isSubtitleMode, translationSession.translatedText, subtitle, realtimeAudio]);

  // Subtitle Mode
  if (ui.isSubtitleMode) {
    return (
      <SubtitleMode
        currentSubtitle={subtitle.currentSubtitle}
        hasQueue={subtitle.hasQueue()}
        queueLength={subtitle.queue.length}
        isListening={connection.isListening}
        isConnecting={connection.isConnecting}
        audioLevel={connection.audioLevel}
        status={status}
        langA={langA}
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
        direction={effectiveDirection}
        autoDisabled={!engine.capabilities.autoDirection}
        onLangAChange={setLangA}
        onLangBChange={setLangB}
        onDirectionChange={setDirection}
        disabled={connection.isListening || connection.isConnecting}
      />

      <main className="flex-1 flex flex-col min-h-0 p-4">
        <TranslationDisplay
          translatedText={translationSession.translatedText}
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
          isConnecting={connection.isConnecting}
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
          capabilities={engine.capabilities}
        />
      </main>
    </div>
  );
}
