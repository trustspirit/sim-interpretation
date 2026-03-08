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

  // Recent transcription context for Whisper prompt
  const recentTranscriptsRef = useRef([]);
  const MAX_WHISPER_CONTEXT = 3; // Keep last 3 transcriptions as context

  // Sentence buffering for forced commits
  const sentenceBufferRef = useRef('');
  const sentenceFlushTimeoutRef = useRef(null);
  const forceCommitIntervalRef = useRef(null);
  const FORCE_COMMIT_MS = 5000; // Force commit every 5 seconds
  const SENTENCE_FLUSH_TIMEOUT_MS = 3000; // Flush incomplete sentence after 3s of silence

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

  // Check if text contains a complete sentence (ends with punctuation)
  const extractCompleteSentences = useCallback((text) => {
    const match = text.match(/^([\s\S]*[.?!。？！])\s*([\s\S]*)$/);
    if (match) {
      return { complete: match[1].trim(), remainder: match[2].trim() };
    }
    return { complete: null, remainder: text.trim() };
  }, []);

  // Process sentence buffer: translate complete sentences, keep remainder
  const processSentenceBuffer = useCallback((force = false) => {
    if (sentenceFlushTimeoutRef.current) {
      clearTimeout(sentenceFlushTimeoutRef.current);
      sentenceFlushTimeoutRef.current = null;
    }

    const buffer = sentenceBufferRef.current;
    if (!buffer) return;

    if (force) {
      console.log('[Sentence] Force flush:', buffer.substring(0, 80));
      sentenceBufferRef.current = '';
      sendForTranslation(buffer);
      return;
    }

    const { complete, remainder } = extractCompleteSentences(buffer);
    if (complete) {
      console.log('[Sentence] Complete:', complete.substring(0, 80), remainder ? '| Remainder: ' + remainder.substring(0, 40) : '');
      sentenceBufferRef.current = remainder;
      sendForTranslation(complete);
    }

    // Set timeout to flush remainder if no new transcription arrives
    if (sentenceBufferRef.current) {
      sentenceFlushTimeoutRef.current = setTimeout(() => processSentenceBuffer(true), SENTENCE_FLUSH_TIMEOUT_MS);
    }
  }, [sendForTranslation, extractCompleteSentences]);

  // Start/stop force commit timer
  const startForceCommitTimer = useCallback(() => {
    if (forceCommitIntervalRef.current) clearInterval(forceCommitIntervalRef.current);
    forceCommitIntervalRef.current = setInterval(() => {
      if (websocketRef.current?.commitAudio?.()) {
        console.log('[ForceCommit] Forced audio commit');
      }
    }, FORCE_COMMIT_MS);
  }, [websocketRef]);

  const stopForceCommitTimer = useCallback(() => {
    if (forceCommitIntervalRef.current) {
      clearInterval(forceCommitIntervalRef.current);
      forceCommitIntervalRef.current = null;
    }
    if (sentenceBufferRef.current) {
      processSentenceBuffer(true);
    }
    if (sentenceFlushTimeoutRef.current) {
      clearTimeout(sentenceFlushTimeoutRef.current);
      sentenceFlushTimeoutRef.current = null;
    }
  }, [processSentenceBuffer]);

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
        // Reset force commit timer — VAD already committed, restart countdown
        if (forceCommitIntervalRef.current) {
          clearInterval(forceCommitIntervalRef.current);
          forceCommitIntervalRef.current = setInterval(() => {
            websocketRef.current?.commitAudio?.();
          }, FORCE_COMMIT_MS);
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

          // Update Whisper context with recent transcriptions to reduce hallucination
          recentTranscriptsRef.current.push(transcript);
          if (recentTranscriptsRef.current.length > MAX_WHISPER_CONTEXT) {
            recentTranscriptsRef.current.shift();
          }
          const whisperPrompt = recentTranscriptsRef.current.join(' ');
          websocketRef.current?.send({
            type: 'session.update',
            session: {
              input_audio_transcription: {
                model: 'gpt-4o-transcribe',
                prompt: whisperPrompt,
              },
            },
          });

          // Show original text immediately (so user sees input is working)
          setOriginalText(prev => {
            const next = [...prev, transcript];
            return next.length > 50 ? next.slice(-50) : next;
          });

          // Add to sentence buffer and check for complete sentences
          sentenceBufferRef.current = (sentenceBufferRef.current + ' ' + transcript).trim();
          console.log('[Sentence] Buffer:', sentenceBufferRef.current.substring(0, 80));
          processSentenceBuffer(false);
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

      case 'conversation.item.input_audio_transcription.failed':
        console.error('[Transcription Failed]', event.error?.message || JSON.stringify(event));
        // Clean up the audio item even on failure
        if (event.item_id) {
          websocketRef.current?.send({ type: 'conversation.item.delete', item_id: event.item_id });
          audioItemIdsRef.current = audioItemIdsRef.current.filter(id => id !== event.item_id);
        }
        break;

      case 'error':
        // Ignore harmless errors
        if (event.error?.message?.includes('no active response') ||
            event.error?.message?.includes('buffer too small')) {
          break;
        }
        console.error('[Server Error]', event.error?.message, event.error?.code);
        updateStatus('error', event.error?.message || 'Error');
        break;
    }
  }, [realtimeAudio, subtitle, websocketRef, audioCaptureRef, isVoiceModeRef, isSubtitleModeRef, isSpeakingTTSRef, setIsSpeakingTTS, ttsEndTimeoutRef, processSentenceBuffer, updateStatus]);

  // Handle WebSocket disconnect — reset response pipeline state
  const handleDisconnect = useCallback(() => {
    audioItemIdsRef.current = [];
    sentenceBufferRef.current = '';
    // Don't stop force commit timer here — auto-reconnect will resume the session
    // Timer is stopped only in resetSession (manual stop)
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
    recentTranscriptsRef.current = [];
    latestOriginalRef.current = '';
    audioItemIdsRef.current = [];
    sentenceBufferRef.current = '';
    stopForceCommitTimer();
  }, [stopForceCommitTimer]);

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
    startForceCommitTimer,
    stopForceCommitTimer,
  };
}
