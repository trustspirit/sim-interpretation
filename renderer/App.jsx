import React, { useState, useEffect, useRef, useCallback } from 'react';

// Components
import { Header, LanguageBar, ControlBar } from './components/layout';
import { TranslationDisplay, SubtitleMode } from './components/translation';

// Hooks
import {
  useAudioCapture,
  useRealtimeAudio,
  useWebSocket,
  useSubtitle,
  useMicrophones
} from './hooks';

// Constants
import { isHallucination, isAssistantResponse, isRepeatedTranscription, clearRecentTranscriptions, cleanTranslation, getRealtimeVoice } from './constants';

export default function App() {
  // Connection & Status
  const [status, setStatus] = useState('ready');
  const [statusText, setStatusText] = useState('Ready');
  const [isListening, setIsListening] = useState(false);

  // Language settings
  const [langA, setLangA] = useState('en');
  const [langB, setLangB] = useState('ko');
  const [direction, setDirection] = useState(() => localStorage.getItem('translatorDirection') || 'auto');

  // API & Settings
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('translatorApiKey') || '');
  const [customInstruction, setCustomInstruction] = useState(() => localStorage.getItem('translatorInstruction') || '');
  const envApiKey = window.electronAPI?.getApiKey?.() || '';

  // Audio level for visualization
  const [audioLevel, setAudioLevel] = useState(0);

  // Transcription & Translation
  const [originalText, setOriginalText] = useState([]);
  const [translatedText, setTranslatedText] = useState([]);
  const [currentTranslation, setCurrentTranslation] = useState('');
  const currentTranslationRef = useRef('');

  // UI Settings
  const [fontSize, setFontSize] = useState(2);
  const [textDirection, setTextDirection] = useState('down');
  const [isSubtitleMode, setIsSubtitleMode] = useState(false);
  const [subtitlePosition, setSubtitlePosition] = useState(() =>
    localStorage.getItem('translatorSubtitlePosition') || 'bottom'
  );
  const [maxCharsPerLine, setMaxCharsPerLine] = useState(50);

  // Voice Mode
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

  // Refs
  const isListeningRef = useRef(false);
  const isVoiceModeRef = useRef(false);
  const isSubtitleModeRef = useRef(false);
  const websocketRef = useRef(null);
  const recentTranslationsRef = useRef([]);
  const audioCaptureRef = useRef(null);
  const ttsEndTimeoutRef = useRef(null);
  const conversationItemIdsRef = useRef([]);
  const isResponsePendingRef = useRef(false);
  const pendingCommitRef = useRef(false);
  const itemsInResponseRef = useRef([]);  // Items being processed by current response

  // Hooks
  const { microphones, selectedMic, selectMic, error: micError } = useMicrophones();

  const updateStatus = useCallback((state, text) => {
    setStatus(state);
    setStatusText(text);
  }, []);

  // Realtime audio playback
  const realtimeAudio = useRealtimeAudio();

  // Subtitle management
  const subtitle = useSubtitle({
    isEnabled: isSubtitleMode,
    maxCharsPerLine
  });

  // Handle WebSocket events — server VAD handles commit & response automatically
  const handleServerEvent = useCallback((event) => {
    // Debug logging
    if (event.type === 'error' || event.type === 'session.updated') {
      console.log('[Event]', event.type, JSON.stringify(event).substring(0, 200));
    } else if (['input_audio_buffer.committed',
         'conversation.item.input_audio_transcription.completed',
         'conversation.item.input_audio_transcription.failed',
         'response.done', 'response.created'].includes(event.type)) {
      console.log('[Event]', event.type, event.transcript?.substring(0, 50) || event.error?.message || '');
    }

    switch (event.type) {
      case 'input_audio_buffer.committed':
        if (event.item_id) {
          conversationItemIdsRef.current.push(event.item_id);
        }
        if (isResponsePendingRef.current) {
          pendingCommitRef.current = true;
          console.log('[Committed] Queued — waiting for previous response');
        } else {
          isResponsePendingRef.current = true;
          // Snapshot items that this response will process
          itemsInResponseRef.current = [...conversationItemIdsRef.current];
          console.log('[Committed] Requesting response for', itemsInResponseRef.current.length, 'items');
          websocketRef.current?.requestResponse();
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        try {
          const transcript = event.transcript?.trim();
          console.log('[Transcription] Raw:', transcript?.substring(0, 80));

          if (transcript) {
            // Hallucination checks
            const hadSpeech = audioCaptureRef.current?.hadRecentSpeech?.(2000) ?? true;
            if (!hadSpeech) {
              console.log('[Transcription] Blocked - no recent speech');
              break;
            }
            if (isHallucination(transcript)) {
              console.log('[Transcription] Blocked - hallucination:', transcript.substring(0, 50));
              break;
            }
            if (isRepeatedTranscription(transcript)) {
              console.log('[Transcription] Blocked - repeated:', transcript.substring(0, 50));
              break;
            }

            // Show original text
            setOriginalText(prev => {
              const next = [...prev, transcript];
              return next.length > 50 ? next.slice(-50) : next;
            });
          }
        } catch (err) {
          console.error('[Transcription Error]', err);
        }
        break;

      case 'response.text.delta':
      case 'response.audio_transcript.delta':
        if (event.delta) {
          const newText = currentTranslationRef.current + event.delta;
          if (newText.length < 50 && isAssistantResponse(newText)) {
            console.log('[Filter] Streaming kill - assistant response:', newText.substring(0, 60));
            currentTranslationRef.current = '';
            setCurrentTranslation('');
            break;
          }
          currentTranslationRef.current = newText;
          // Strip JSON wrapper for display
          let displayText = newText;
          if (displayText.startsWith('{"')) {
            const match = displayText.match(/^\{"(?:text|translation|output)"\s*:\s*"(.*)$/s);
            if (match) displayText = match[1].replace(/"\s*\}$/, '');
          }
          setCurrentTranslation(displayText);
        }
        break;

      case 'response.text.done':
      case 'response.audio_transcript.done':
        if (currentTranslationRef.current) {
          let finalText = currentTranslationRef.current;
          currentTranslationRef.current = '';
          setCurrentTranslation('');

          // Unwrap JSON if model wrapped output
          const trimmed = finalText.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const parsed = JSON.parse(trimmed);
              const extracted = parsed.text || parsed.translation || parsed.output || Object.values(parsed)[0];
              if (typeof extracted === 'string') {
                console.log('[Filter] Unwrapped JSON:', trimmed.substring(0, 60), '→', extracted.substring(0, 60));
                finalText = extracted;
              }
            } catch { /* not JSON */ }
          }

          // Filter assistant responses
          if (isAssistantResponse(finalText)) {
            console.log('[Filter] Blocked assistant response:', finalText.substring(0, 50));
            break;
          }

          // Clean trailing assistant content
          const cleanedText = cleanTranslation(finalText);
          if (cleanedText !== finalText) {
            console.log('[Filter] Cleaned:', finalText.substring(0, 80), '→', cleanedText.substring(0, 80));
            finalText = cleanedText;
          }

          if (!finalText || finalText.trim().length === 0) break;

          // Duplicate check
          const normalizedText = finalText.trim().toLowerCase();
          const isDuplicate = recentTranslationsRef.current.some(r => r === normalizedText);
          if (isDuplicate) {
            console.log('[Filter] Blocked duplicate:', finalText.substring(0, 50));
            break;
          }

          recentTranslationsRef.current.push(normalizedText);
          if (recentTranslationsRef.current.length > 5) {
            recentTranslationsRef.current.shift();
          }

          setTranslatedText(prev => {
            const next = [...prev, finalText];
            return next.length > 50 ? next.slice(-50) : next;
          });
        }
        break;

      case 'response.audio.delta':
        if (event.delta && isVoiceModeRef.current) {
          realtimeAudio.playAudioChunk(event.delta);

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
        }
        break;

      case 'response.audio.done':
        realtimeAudio.onAudioDone();
        ttsEndTimeoutRef.current = setTimeout(() => {
          ttsEndTimeoutRef.current = null;
          isSpeakingTTSRef.current = false;
          setIsSpeakingTTS(false);
        }, 500);
        break;

      case 'response.done':
        {
          const output = event.response?.output;
          const textContent = output?.map(o => o.content?.map(c => c.text || c.transcript || '').join('')).join('') || '';
          console.log('[Response Done]', textContent ? `"${textContent.substring(0, 80)}"` : '(empty)', 'status:', event.response?.status);
        }

        // Delete only items that were part of THIS response (not future queued ones)
        const itemsToDelete = new Set(itemsInResponseRef.current);
        if (event.response?.output) {
          for (const output of event.response.output) {
            if (output.id) itemsToDelete.add(output.id);
          }
        }
        for (const id of itemsToDelete) {
          websocketRef.current?.send({ type: 'conversation.item.delete', item_id: id });
        }
        // Keep only items NOT processed by this response
        conversationItemIdsRef.current = conversationItemIdsRef.current.filter(
          id => !itemsToDelete.has(id)
        );
        itemsInResponseRef.current = [];

        isResponsePendingRef.current = false;

        // Process queued commits
        if (pendingCommitRef.current && conversationItemIdsRef.current.length > 0) {
          pendingCommitRef.current = false;
          isResponsePendingRef.current = true;
          itemsInResponseRef.current = [...conversationItemIdsRef.current];
          console.log('[Response Done] Processing queued items:', itemsInResponseRef.current.length);
          websocketRef.current?.requestResponse();
        } else {
          pendingCommitRef.current = false;
        }

        if (isListeningRef.current) {
          updateStatus('listening', 'Speak now');
        } else {
          updateStatus('connected', 'Connected');
        }
        break;

      case 'conversation.item.input_audio_transcription.failed':
        console.error('[Transcription Failed]', event.error?.message || JSON.stringify(event));
        break;

      case 'error':
        console.error('[Server Error]', event.error?.message, event.error?.code);
        updateStatus('error', event.error?.message || 'Error');
        break;
    }
  }, [updateStatus, realtimeAudio, subtitle]);

  // Handle WebSocket disconnect
  const handleDisconnect = useCallback(() => {
    conversationItemIdsRef.current = [];
    itemsInResponseRef.current = [];
    isResponsePendingRef.current = false;
    pendingCommitRef.current = false;
  }, []);

  // WebSocket connection
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

  websocketRef.current = websocket;

  // Audio capture — send ALL audio, server semantic_vad handles commit
  const audioCapture = useAudioCapture({
    selectedMic,
    onAudioData: (base64Audio) => websocket.sendAudio(base64Audio),
    onError: (msg) => updateStatus('error', msg),
  });

  audioCaptureRef.current = audioCapture;

  // Start listening
  const startListening = async () => {
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
  };

  // Stop listening
  const stopListening = () => {
    isListeningRef.current = false;
    setIsListening(false);
    setAudioLevel(0);
    recentTranslationsRef.current = [];
    clearRecentTranscriptions();
    if (ttsEndTimeoutRef.current) {
      clearTimeout(ttsEndTimeoutRef.current);
      ttsEndTimeoutRef.current = null;
    }
    isSpeakingTTSRef.current = false;
    setIsSpeakingTTS(false);
    audioCapture.stopCapture();
    websocket.disconnect();
    realtimeAudio.resetTiming();
    updateStatus('ready', 'Ready');
  };

  // Clear transcripts
  const clearTranscripts = () => {
    setOriginalText([]);
    setTranslatedText([]);
    setCurrentTranslation('');
    currentTranslationRef.current = '';
  };

  // UI Handlers
  const openSettings = () => window.electronAPI?.openSettings?.();
  const increaseFontSize = () => { if (fontSize < 5) setFontSize(fontSize + 1); };
  const decreaseFontSize = () => { if (fontSize > 0) setFontSize(fontSize - 1); };
  const toggleTextDirection = () => setTextDirection(prev => prev === 'down' ? 'up' : 'down');

  const toggleSubtitleMode = async () => {
    const position = localStorage.getItem('translatorSubtitlePosition') || 'bottom';
    const result = await window.electronAPI?.toggleSubtitleMode?.(position);
    if (result?.success) setIsSubtitleMode(result.isSubtitleMode);
  };

  const toggleSubtitlePosition = async () => {
    const newPosition = subtitlePosition === 'bottom' ? 'top' : 'bottom';
    setSubtitlePosition(newPosition);
    localStorage.setItem('translatorSubtitlePosition', newPosition);
    await window.electronAPI?.updateSubtitlePosition?.(newPosition);
  };

  const toggleVoiceMode = () => setIsVoiceMode(!isVoiceMode);

  const toggleVoiceOnlyMode = () => {
    const newValue = !voiceOnlyMode;
    setVoiceOnlyMode(newValue);
    localStorage.setItem('translatorVoiceOnly', newValue.toString());
  };

  const toggleShowOriginalText = () => {
    const newValue = !showOriginalText;
    setShowOriginalText(newValue);
    localStorage.setItem('translatorShowOriginal', newValue.toString());
  };

  // Effects
  useEffect(() => {
    const handleSettingsClosed = () => {
      setApiKey(localStorage.getItem('translatorApiKey') || '');
      setCustomInstruction(localStorage.getItem('translatorInstruction') || '');
      selectMic(localStorage.getItem('translatorMic') || '');
      setSubtitlePosition(localStorage.getItem('translatorSubtitlePosition') || 'bottom');
      setDirection(localStorage.getItem('translatorDirection') || 'auto');
      setAudioOutput(localStorage.getItem('translatorAudioOutput') || '');
    };
    window.electronAPI?.onSettingsClosed?.(handleSettingsClosed);
    window.electronAPI?.getSubtitleMode?.().then(mode => setIsSubtitleMode(mode || false));
  }, [selectMic]);

  useEffect(() => {
    isVoiceModeRef.current = isVoiceMode;
    realtimeAudio.setEnabled(isVoiceMode);

    // Update server session when voice mode or voice type changes mid-session
    if (!isListeningRef.current) return;
    const sessionUpdate = isVoiceMode
      ? { modalities: ['text', 'audio'], voice: getRealtimeVoice(voiceType), output_audio_format: 'pcm16' }
      : { modalities: ['text'] };
    websocketRef.current?.send({ type: 'session.update', session: sessionUpdate });
  }, [isVoiceMode, voiceType, realtimeAudio]);

  useEffect(() => {
    if (audioOutput) realtimeAudio.setOutputDevice(audioOutput);
  }, [audioOutput, realtimeAudio]);

  useEffect(() => { isSubtitleModeRef.current = isSubtitleMode; }, [isSubtitleMode]);

  useEffect(() => {
    return () => {
      if (ttsEndTimeoutRef.current) {
        clearTimeout(ttsEndTimeoutRef.current);
        ttsEndTimeoutRef.current = null;
      }
    };
  }, []);

  // Process translations into subtitle queue
  useEffect(() => {
    if (!isSubtitleMode) return;
    if (currentTranslation) return;

    const latestIndex = translatedText.length - 1;
    if (latestIndex < 0 || latestIndex <= subtitle.getLastProcessedIndex()) return;

    const newText = translatedText[latestIndex];
    subtitle.setLastProcessedIndex(latestIndex);
    subtitle.addTranslation(newText);

    if (!subtitle.isProcessing()) {
      if (isVoiceModeRef.current) {
        subtitle.setPendingStart(true);
        if (realtimeAudio.isPlaying()) {
          subtitle.startProcessing();
          subtitle.setPendingStart(false);
        }
      } else {
        subtitle.startProcessing();
      }
    }
  }, [isSubtitleMode, translatedText, currentTranslation, subtitle, realtimeAudio]);

  // Subtitle Mode
  if (isSubtitleMode) {
    return (
      <SubtitleMode
        currentSubtitle={subtitle.currentSubtitle}
        currentTranslation={currentTranslation}
        hasQueue={subtitle.hasQueue()}
        queueLength={subtitle.queue.length}
        isListening={isListening}
        audioLevel={audioLevel}
        status={status}
        langA={langA}
        langB={langB}
        subtitlePosition={subtitlePosition}
        onToggleSubtitleMode={toggleSubtitleMode}
        onToggleSubtitlePosition={toggleSubtitlePosition}
        onStart={startListening}
        onStop={stopListening}
        onMaxCharsCalculated={setMaxCharsPerLine}
      />
    );
  }

  // Normal Mode
  return (
    <div className="h-full bg-[#0a0a0a] text-codex-text flex flex-col overflow-hidden">
      <Header
        isListening={isListening}
        audioLevel={audioLevel}
        status={status}
        statusText={statusText}
        onSettingsClick={openSettings}
      />

      <LanguageBar
        langA={langA}
        langB={langB}
        direction={direction}
        onLangAChange={setLangA}
        onLangBChange={setLangB}
        onDirectionChange={setDirection}
        disabled={isListening}
      />

      <main className="flex-1 flex flex-col min-h-0 p-4">
        <TranslationDisplay
          translatedText={translatedText}
          currentTranslation={currentTranslation}
          originalText={originalText}
          fontSize={fontSize}
          textDirection={textDirection}
          isListening={isListening}
          isVoiceMode={isVoiceMode}
          voiceOnlyMode={voiceOnlyMode}
          isSpeakingTTS={isSpeakingTTS}
          showOriginalText={showOriginalText}
        />

        <ControlBar
          isListening={isListening}
          onStart={startListening}
          onStop={stopListening}
          fontSize={fontSize}
          onFontSizeIncrease={increaseFontSize}
          onFontSizeDecrease={decreaseFontSize}
          textDirection={textDirection}
          onToggleDirection={toggleTextDirection}
          onToggleSubtitleMode={toggleSubtitleMode}
          isVoiceMode={isVoiceMode}
          onToggleVoiceMode={toggleVoiceMode}
          voiceType={voiceType}
          onVoiceTypeChange={setVoiceType}
          isSpeakingTTS={isSpeakingTTS}
          voiceOnlyMode={voiceOnlyMode}
          onToggleVoiceOnlyMode={toggleVoiceOnlyMode}
          showOriginalText={showOriginalText}
          onToggleShowOriginalText={toggleShowOriginalText}
          onClear={clearTranscripts}
        />
      </main>
    </div>
  );
}
