import { useState, useRef, useCallback } from 'react';
import { isHallucination, isAssistantResponse, isRepeatedTranscription, cleanTranslation } from '../constants';

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
}) {
  // Transcription & Translation state
  const [originalText, setOriginalText] = useState([]);
  const [translatedText, setTranslatedText] = useState([]);
  const [currentTranslation, setCurrentTranslation] = useState('');
  const currentTranslationRef = useRef('');

  // Response management refs
  const recentTranslationsRef = useRef([]);
  const conversationItemIdsRef = useRef([]);
  const isResponsePendingRef = useRef(false);
  const pendingCommitRef = useRef(false);
  const itemsInResponseRef = useRef([]);

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
          if (displayText.startsWith('{')) {
            // Match any {"key": "value..."} pattern
            const match = displayText.match(/^\{"[^"]*"\s*:\s*"(.*)$/s);
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
              const extracted = parsed.text || parsed.translation || parsed.output ||
                Object.values(parsed).find(v => typeof v === 'string');
              if (typeof extracted === 'string') {
                console.log('[Filter] Unwrapped JSON:', trimmed.substring(0, 60), '→', extracted.substring(0, 60));
                finalText = extracted;
              }
            } catch {
              // Not valid JSON — strip outer braces (e.g. {"some text"})
              let stripped = trimmed.slice(1, -1).trim();
              if (stripped.startsWith('"') && stripped.endsWith('"')) {
                stripped = stripped.slice(1, -1);
              }
              if (stripped.length > 0) {
                console.log('[Filter] Stripped braces:', trimmed.substring(0, 60), '→', stripped.substring(0, 60));
                finalText = stripped;
              }
            }
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
        {
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
        }

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
  }, [updateStatus, realtimeAudio, subtitle, websocketRef, audioCaptureRef, isVoiceModeRef, isSubtitleModeRef, isSpeakingTTSRef, setIsSpeakingTTS, ttsEndTimeoutRef, isListeningRef]);

  // Handle WebSocket disconnect — reset response pipeline state
  const handleDisconnect = useCallback(() => {
    conversationItemIdsRef.current = [];
    itemsInResponseRef.current = [];
    isResponsePendingRef.current = false;
    pendingCommitRef.current = false;
  }, []);

  // Clear all transcripts
  const clearTranscripts = useCallback(() => {
    setOriginalText([]);
    setTranslatedText([]);
    setCurrentTranslation('');
    currentTranslationRef.current = '';
  }, []);

  // Reset session-related refs (called on stop)
  const resetSession = useCallback(() => {
    recentTranslationsRef.current = [];
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
