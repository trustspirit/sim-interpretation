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
import { isHallucination, isAssistantResponse, isRepeatedTranscription, clearRecentTranscriptions, cleanTranslation } from './constants';

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
  const accumulatedTextRef = useRef('');  // Accumulate transcriptions until sentence ends
  const sentenceTimeoutRef = useRef(null);  // Timeout to force response if no punctuation
  const recentTranslationsRef = useRef([]);  // Track recent translations to detect duplicates
  const isResponsePendingRef = useRef(false);  // Prevent multiple concurrent response requests
  const audioCaptureRef = useRef(null);  // For hallucination detection
  const ttsEndTimeoutRef = useRef(null);

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

  const endsWithPunctuation = useCallback((text) => {
    if (!text) return false;
    return /[.!?。！？]$/.test(text.trim());
  }, []);

  // Check if accumulated text is long enough to translate
  const isTextSufficientLength = useCallback((text) => {
    if (!text) return false;
    const trimmed = text.trim();

    // Check if it has CJK characters (Korean, Chinese, Japanese)
    const hasCJK = /[\u3131-\uD79D\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(trimmed);

    if (hasCJK) {
      // For CJK: 15+ characters is usually a meaningful phrase
      return trimmed.length >= 15;
    } else {
      // For alphabetic languages: 40+ characters or 5+ words
      const wordCount = trimmed.split(/\s+/).length;
      return trimmed.length >= 40 || wordCount >= 5;
    }
  }, []);

  // Check if we should request translation
  const shouldRequestTranslation = useCallback((text) => {
    if (!text) return { should: false, reason: '' };

    if (endsWithPunctuation(text)) {
      return { should: true, reason: 'ends with punctuation' };
    }
    if (isTextSufficientLength(text)) {
      return { should: true, reason: `sufficient length (${text.length} chars)` };
    }
    return { should: false, reason: '' };
  }, [endsWithPunctuation, isTextSufficientLength]);

  // Try to request a response - prevent concurrent requests
  const tryRequestResponse = useCallback(() => {
    if (!accumulatedTextRef.current) {
      return;
    }

    // Prevent concurrent response requests
    if (isResponsePendingRef.current) {
      console.log('[Response] Skipping - response already pending');
      return;
    }

    // Clear timeout if exists
    if (sentenceTimeoutRef.current) {
      clearTimeout(sentenceTimeoutRef.current);
      sentenceTimeoutRef.current = null;
    }

    const textToTranslate = accumulatedTextRef.current;
    accumulatedTextRef.current = '';  // Clear accumulated text immediately

    console.log('[Response] Requesting response for:', textToTranslate);
    isResponsePendingRef.current = true;
    websocketRef.current?.requestResponse();
  }, []);

  // Handle WebSocket events
  const handleServerEvent = useCallback((event) => {
    // Debug: log important events
    if (['input_audio_buffer.committed', 'conversation.item.input_audio_transcription.completed',
         'response.done'].includes(event.type)) {
      console.log('[Event]', event.type, event.transcript?.substring(0, 50) || '');
    }

    switch (event.type) {
      case 'input_audio_buffer.committed':
        // Audio buffer was committed (by our manual commit)
        console.log('[Committed] Audio buffer committed');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // Transcription completed - accumulate and check for sentence end
        try {
          const transcript = event.transcript?.trim();
          console.log('[Transcription] Raw:', transcript?.substring(0, 80));

          if (transcript) {
            // Check 1: Audio-level based hallucination detection
            const hadSpeech = audioCaptureRef.current?.hadRecentSpeech?.(3000) ?? true;
            if (!hadSpeech) {
              console.log('[Transcription] Blocked - no recent speech detected (likely hallucination):', transcript.substring(0, 50));
              break;
            }

            // Check 2: Pattern-based hallucination detection
            const isHalluc = isHallucination(transcript);
            if (isHalluc) {
              console.log('[Transcription] Blocked - pattern hallucination:', transcript.substring(0, 50));
              break;
            }

            // Check 3: Repetition detection (same text appearing multiple times)
            if (isRepeatedTranscription(transcript)) {
              console.log('[Transcription] Blocked - repeated text (likely hallucination):', transcript.substring(0, 50));
              break;
            }

            // Passed all checks - show original text
            setOriginalText(prev => [...prev, transcript]);

            // Accumulate transcription
            accumulatedTextRef.current += (accumulatedTextRef.current ? ' ' : '') + transcript;
            console.log('[Accumulated]', accumulatedTextRef.current.substring(0, 100));

            // Clear any existing timeout
            if (sentenceTimeoutRef.current) {
              clearTimeout(sentenceTimeoutRef.current);
              sentenceTimeoutRef.current = null;
            }

            // Check if we should translate now
            const result = shouldRequestTranslation(accumulatedTextRef.current);
            console.log('[Check]', result);

            if (result.should) {
              console.log(`[Ready to translate] Reason: ${result.reason}`);
              updateStatus('processing', 'Translating...');
              tryRequestResponse();
            } else {
              console.log(`[Waiting] ${accumulatedTextRef.current.length} chars`);
              updateStatus('listening', 'Listening...');
              // Set timeout as fallback
              sentenceTimeoutRef.current = setTimeout(() => {
                // Check if still listening before processing
                if (accumulatedTextRef.current && isListeningRef.current) {
                  console.log(`[Timeout] Forcing response (${accumulatedTextRef.current.length} chars)`);
                  updateStatus('processing', 'Translating...');
                  tryRequestResponse();
                }
              }, 2000);
            }
          }
        } catch (err) {
          console.error('[Transcription Error]', err);
        }
        break;

      case 'response.text.delta':
      case 'response.audio_transcript.delta':
        if (event.delta) {
          const newText = currentTranslationRef.current + event.delta;
          if (newText.length < 40 && isAssistantResponse(newText)) {
            currentTranslationRef.current = '';
            setCurrentTranslation('');
            break;
          }
          currentTranslationRef.current = newText;
          setCurrentTranslation(newText);
        }
        break;

      case 'response.text.done':
      case 'response.audio_transcript.done':
        if (currentTranslationRef.current) {
          let finalText = currentTranslationRef.current;
          currentTranslationRef.current = '';
          setCurrentTranslation('');

          // Filter out assistant responses (model acting as assistant instead of translator)
          if (isAssistantResponse(finalText)) {
            console.log('[Filter] Blocked assistant response:', finalText.substring(0, 50));
            break;
          }

          // Clean trailing assistant content from translation
          const cleanedText = cleanTranslation(finalText);
          if (cleanedText !== finalText) {
            console.log('[Filter] Cleaned trailing content:', finalText.substring(0, 80), '→', cleanedText.substring(0, 80));
            finalText = cleanedText;
          }

          // Skip if cleaning resulted in empty text
          if (!finalText || finalText.trim().length === 0) {
            break;
          }

          // Check for exact duplicate (only the last translation)
          const normalizedText = finalText.trim().toLowerCase();
          const lastTranslation = recentTranslationsRef.current[recentTranslationsRef.current.length - 1];

          if (lastTranslation === normalizedText) {
            console.log('[Filter] Blocked exact duplicate:', finalText.substring(0, 50));
            break;
          }

          // Add to recent translations (keep last 3)
          recentTranslationsRef.current.push(normalizedText);
          if (recentTranslationsRef.current.length > 3) {
            recentTranslationsRef.current.shift();
          }

          setTranslatedText(prev => [...prev, finalText]);
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

          // Start subtitle sync if pending
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
        console.log('[Response Done]');
        isResponsePendingRef.current = false;

        if (isListeningRef.current) {
          updateStatus('listening', 'Listening...');
          // Process any text that accumulated while waiting for this response
          if (accumulatedTextRef.current) {
            const pendingResult = shouldRequestTranslation(accumulatedTextRef.current);
            if (pendingResult.should) {
              console.log('[Response Done] Processing pending accumulated text:', accumulatedTextRef.current.substring(0, 50));
              updateStatus('processing', 'Translating...');
              tryRequestResponse();
            }
          }
        } else {
          updateStatus('connected', 'Connected');
        }
        break;

      case 'error':
        isResponsePendingRef.current = false;
        updateStatus('error', event.error?.message || 'Error');
        break;
    }
  }, [updateStatus, realtimeAudio, subtitle, shouldRequestTranslation, tryRequestResponse]);

  // Handle WebSocket disconnect - reset pending states
  const handleDisconnect = useCallback(() => {
    isResponsePendingRef.current = false;
    accumulatedTextRef.current = '';
    if (sentenceTimeoutRef.current) {
      clearTimeout(sentenceTimeoutRef.current);
      sentenceTimeoutRef.current = null;
    }
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

  // Sync websocket ref for use in event handlers
  websocketRef.current = websocket;

  // Audio capture - always send audio, commit on silence
  const audioCapture = useAudioCapture({
    selectedMic,
    onAudioData: (base64Audio) => websocket.sendAudio(base64Audio),
    onCommit: () => {
      console.log('[VAD] Committing audio buffer');
      websocket.commitAudio();
    },
    onError: (msg) => updateStatus('error', msg),
  });

  // Sync audioCapture ref for hallucination detection in event handlers
  audioCaptureRef.current = audioCapture;

  // Start listening
  const startListening = async () => {
    updateStatus('connecting', 'Connecting...');
    try {
      const key = apiKey || envApiKey;
      await websocket.connect(key);
      const audioStarted = await audioCapture.startCapture();
      if (!audioStarted) {
        stopListening();
        return;
      }
      isListeningRef.current = true;
      setIsListening(true);
      audioCapture.startVisualization(setAudioLevel);
      updateStatus('connected', 'Speak now');
    } catch {
      stopListening();
    }
  };

  // Stop listening
  const stopListening = () => {
    isListeningRef.current = false;
    setIsListening(false);
    setAudioLevel(0);
    accumulatedTextRef.current = '';
    isResponsePendingRef.current = false;
    recentTranslationsRef.current = [];
    clearRecentTranscriptions(); // Clear repetition detection history
    if (sentenceTimeoutRef.current) {
      clearTimeout(sentenceTimeoutRef.current);
      sentenceTimeoutRef.current = null;
    }
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
  
  const increaseFontSize = () => {
    if (fontSize < 5) setFontSize(fontSize + 1);
  };
  
  const decreaseFontSize = () => {
    if (fontSize > 0) setFontSize(fontSize - 1);
  };
  
  const toggleTextDirection = () => {
    setTextDirection(prev => prev === 'down' ? 'up' : 'down');
  };

  const toggleSubtitleMode = async () => {
    const position = localStorage.getItem('translatorSubtitlePosition') || 'bottom';
    const result = await window.electronAPI?.toggleSubtitleMode?.(position);
    if (result?.success) {
      setIsSubtitleMode(result.isSubtitleMode);
    }
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

    // Check if already in subtitle mode
    window.electronAPI?.getSubtitleMode?.().then(mode => {
      setIsSubtitleMode(mode || false);
    });
  }, [selectMic]);

  // Sync voice mode ref
  useEffect(() => {
    isVoiceModeRef.current = isVoiceMode;
    realtimeAudio.setEnabled(isVoiceMode);
  }, [isVoiceMode, realtimeAudio]);

  // Sync audio output device
  useEffect(() => {
    if (audioOutput) {
      realtimeAudio.setOutputDevice(audioOutput);
    }
  }, [audioOutput, realtimeAudio]);

  // Sync subtitle mode ref
  useEffect(() => {
    isSubtitleModeRef.current = isSubtitleMode;
  }, [isSubtitleMode]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (sentenceTimeoutRef.current) {
        clearTimeout(sentenceTimeoutRef.current);
        sentenceTimeoutRef.current = null;
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

  // Subtitle Mode Render
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

  // Normal Mode Render
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
