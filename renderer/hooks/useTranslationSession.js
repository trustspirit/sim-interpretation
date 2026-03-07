import { useState, useRef, useCallback } from 'react';
import { isHallucination, isAssistantResponse, isRepeatedTranscription, cleanTranslation, stripSourcePrefix, isLikelyEcho, getLanguageName } from '../constants';

export default function useTranslationSession({
  websocketRef,
  audioCaptureRef,
  realtimeAudio,
  subtitle,
  isVoiceModeRef,
  isSubtitleModeRef,
  isSpeakingTTSRef,
  setIsSpeakingTTS,
  ttsEndTimeoutRef,
  isListeningRef,
  updateStatus,
  langA,
  langB,
  direction,
  apiKey,
  customInstruction,
}) {
  // Transcription & Translation state
  const [originalText, setOriginalText] = useState([]);
  const [translatedText, setTranslatedText] = useState([]);
  const [currentTranslation, setCurrentTranslation] = useState('');
  const currentTranslationRef = useRef('');

  // Track latest original transcription for echo detection
  const latestOriginalRef = useRef('');

  // Response management refs
  const recentTranslationsRef = useRef([]);
  const audioItemIdsRef = useRef([]);  // Track audio items to delete after transcription
  const translationCounterRef = useRef(0);

  // Build translation system prompt
  const getTranslationPrompt = useCallback(() => {
    let directionRule;
    if (direction === 'a-to-b') {
      directionRule = `Translate ${getLanguageName(langA)} to ${getLanguageName(langB)}. Output ONLY in ${getLanguageName(langB)}.`;
    } else if (direction === 'b-to-a') {
      directionRule = `Translate ${getLanguageName(langB)} to ${getLanguageName(langA)}. Output ONLY in ${getLanguageName(langA)}.`;
    } else {
      directionRule = `Translate between ${getLanguageName(langA)} and ${getLanguageName(langB)}. Detect the input language and output in the OTHER language.`;
    }
    let prompt = `${directionRule}\n${customInstruction ? `DOMAIN: ${customInstruction}\n` : ''}Translate exactly. No commentary. Output ONLY the translation in plain text.`;
    return prompt;
  }, [langA, langB, direction, customInstruction]);

  // Send text for translation via Chat Completions API (parallel, non-blocking)
  const sendForTranslation = useCallback(async (text) => {
    if (!text.trim() || !apiKey) return;

    const orderIndex = ++translationCounterRef.current;
    console.log('[Translation] #' + orderIndex, 'Requesting for:', text.substring(0, 80));

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: getTranslationPrompt() },
            { role: 'user', content: text },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });

      const data = await response.json();
      let translated = data.choices?.[0]?.message?.content?.trim();
      if (!translated) return;

      console.log('[Translation] #' + orderIndex, 'Result:', translated.substring(0, 80));

      // Apply filters
      if (isAssistantResponse(translated)) return;
      translated = cleanTranslation(translated);
      translated = stripSourcePrefix(translated);
      if (!translated?.trim()) return;
      if (isLikelyEcho(translated, text, direction, langA, langB)) return;

      // Duplicate check
      const normalized = translated.trim().toLowerCase();
      if (recentTranslationsRef.current.some(r => r === normalized)) return;
      recentTranslationsRef.current.push(normalized);
      if (recentTranslationsRef.current.length > 5) recentTranslationsRef.current.shift();

      setTranslatedText(prev => {
        const next = [...prev, translated];
        return next.length > 50 ? next.slice(-50) : next;
      });
    } catch (err) {
      console.error('[Translation] Error:', err);
    }
  }, [apiKey, getTranslationPrompt, langA, langB, direction]);

  // Handle WebSocket server events
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
        // Track audio item — will be deleted after transcription completes
        if (event.item_id) {
          audioItemIdsRef.current.push(event.item_id);
          console.log('[Committed] Waiting for transcription, item:', event.item_id);
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        try {
          const transcript = event.transcript?.trim();
          console.log('[Transcription] Raw:', transcript?.substring(0, 80));

          // Delete only THIS audio item now that its transcription is done
          if (event.item_id) {
            websocketRef.current?.send({ type: 'conversation.item.delete', item_id: event.item_id });
            audioItemIdsRef.current = audioItemIdsRef.current.filter(id => id !== event.item_id);
          }

          if (!transcript) break;

          // Hallucination checks
          if (isHallucination(transcript)) {
            console.log('[Transcription] Blocked - hallucination:', transcript.substring(0, 50));
            break;
          }
          if (isRepeatedTranscription(transcript)) {
            console.log('[Transcription] Blocked - repeated:', transcript.substring(0, 50));
            break;
          }

          // Track for echo detection
          latestOriginalRef.current = transcript;

          // Show original text
          setOriginalText(prev => {
            const next = [...prev, transcript];
            return next.length > 50 ? next.slice(-50) : next;
          });

          // Split into sentences and translate each in parallel
          const sentences = transcript.match(/[^.?!。？！]+[.?!。？！]+/g);
          if (sentences && sentences.length > 1) {
            console.log('[Transcription] Split into', sentences.length, 'sentences');
            for (const sentence of sentences) {
              const trimmed = sentence.trim();
              if (trimmed) sendForTranslation(trimmed);
            }
          } else {
            console.log('[Transcription] Sending for translation:', transcript.substring(0, 50));
            sendForTranslation(transcript);
          }
        } catch (err) {
          console.error('[Transcription Error]', err);
        }
        break;

      // Translation is now handled via fetch API — these events are only for voice mode TTS
      case 'response.text.delta':
      case 'response.text.done':
        break;

      case 'response.audio_transcript.delta':
        break;

      case 'response.audio_transcript.done':
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
        console.log('[Response Done]', event.response?.status);
        break;
        break;

      case 'conversation.item.input_audio_transcription.failed':
        console.error('[Transcription Failed]', event.error?.message || JSON.stringify(event));
        // Clean up the audio item even on failure
        if (event.item_id) {
          websocketRef.current?.send({ type: 'conversation.item.delete', item_id: event.item_id });
          audioItemIdsRef.current = audioItemIdsRef.current.filter(id => id !== event.item_id);
        }
        break;

      case 'error':
        // Ignore cancel failures — happens when response already completed
        if (event.error?.message?.includes('no active response')) {
          console.log('[Server Error] Ignored: cancel after response completed');
          break;
        }
        console.error('[Server Error]', event.error?.message, event.error?.code);
        updateStatus('error', event.error?.message || 'Error');
        break;
    }
  }, [realtimeAudio, subtitle, websocketRef, audioCaptureRef, isVoiceModeRef, isSubtitleModeRef, isSpeakingTTSRef, setIsSpeakingTTS, ttsEndTimeoutRef, sendForTranslation]);

  // Handle WebSocket disconnect — reset response pipeline state
  const handleDisconnect = useCallback(() => {
    audioItemIdsRef.current = [];
  }, []);

  // Clear all transcripts
  const clearTranscripts = useCallback(() => {
    setOriginalText([]);
    setTranslatedText([]);
    setCurrentTranslation('');
    currentTranslationRef.current = '';
    latestOriginalRef.current = '';
  }, []);

  // Reset session-related refs (called on stop)
  const resetSession = useCallback(() => {
    recentTranslationsRef.current = [];
    latestOriginalRef.current = '';
    audioItemIdsRef.current = [];
  }, []);

  return {
    // State
    originalText,
    translatedText,
    currentTranslation,

    // Event handlers
    handleServerEvent,
    handleDisconnect,

    // Actions
    clearTranscripts,
    resetSession,
  };
}
