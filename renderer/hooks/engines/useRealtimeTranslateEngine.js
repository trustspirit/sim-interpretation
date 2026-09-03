import { useRef, useEffect, useCallback } from 'react';
import {
  isHallucination,
  isRepeatedTranscription,
} from '../../constants';

const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const IDLE_THRESHOLD_MS = 10 * 1000;
const TRANSCRIPT_FLUSH_MS = 900;
// A transcript arriving with no microphone energy in this window is a silence hallucination.
const TRANSCRIPT_SPEECH_WINDOW_MS = 8000;

// The translations endpoint only accepts audio.output.language (see OpenAI docs):
// no bidirectional auto mode, no custom instructions, no voice choice.
export const capabilities = {
  autoDirection: false,
  customInstruction: false,
  voiceSelection: false,
};

/**
 * Engine 2: gpt-realtime-translate
 * - Single WebSocket connection handles both STT and translation
 * - Translation arrives via session.output_transcript.delta
 * - Audio output arrives via session.output_audio.delta
 * - direction 'auto' is not supported by this endpoint and behaves as A → B
 */
export default function useRealtimeTranslateEngine({
  langA, langB, direction, isVoiceMode, speechActivity,
  onTranscript, onTranslation, onAudioChunk, onAudioDone, onStatusChange, onDisconnect,
}) {
  // WebSocket state
  const wsRef = useRef(null);
  const apiKeyRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const sessionRefreshIntervalRef = useRef(null);
  const isIntentionalCloseRef = useRef(false);
  const hasRejectedRef = useRef(false);
  const connectedOnceRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const sessionStartRef = useRef(Date.now());

  // Translation endpoint streams transcript deltas without sentence objects.
  // Debounce them into readable chunks before adding to the transcript list.
  const inputTranscriptBufferRef = useRef('');
  const outputTranscriptBufferRef = useRef('');
  const inputFlushTimeoutRef = useRef(null);
  const outputFlushTimeoutRef = useRef(null);

  // Store callbacks in refs so WebSocket closures always see latest version
  const onTranscriptRef = useRef(onTranscript);
  const onTranslationRef = useRef(onTranslation);
  const onAudioChunkRef = useRef(onAudioChunk);
  const onAudioDoneRef = useRef(onAudioDone);
  const onStatusChangeRef = useRef(onStatusChange);
  const onDisconnectRef = useRef(onDisconnect);
  onTranscriptRef.current = onTranscript;
  onTranslationRef.current = onTranslation;
  onAudioChunkRef.current = onAudioChunk;
  onAudioDoneRef.current = onAudioDone;
  onStatusChangeRef.current = onStatusChange;
  onDisconnectRef.current = onDisconnect;

  // Store current params in refs for reconnect/refresh closures
  const langARef = useRef(langA);
  const langBRef = useRef(langB);
  const directionRef = useRef(direction);
  const isVoiceModeRef = useRef(isVoiceMode);
  const speechActivityRef = useRef(speechActivity);
  langARef.current = langA;
  langBRef.current = langB;
  directionRef.current = direction;
  isVoiceModeRef.current = isVoiceMode;
  speechActivityRef.current = speechActivity;

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const commitAudio = useCallback(() => true, []);

  const getTargetLanguage = useCallback(() => {
    const dir = directionRef.current;
    if (dir === 'b-to-a') return langARef.current;
    return langBRef.current;
  }, []);

  const flushInputTranscript = useCallback(() => {
    if (inputFlushTimeoutRef.current) {
      clearTimeout(inputFlushTimeoutRef.current);
      inputFlushTimeoutRef.current = null;
    }

    const transcript = inputTranscriptBufferRef.current.trim();
    inputTranscriptBufferRef.current = '';
    if (!transcript) return;
    const tracker = speechActivityRef.current;
    if (tracker && !tracker.hadSpeechWithin(TRANSCRIPT_SPEECH_WINDOW_MS)) {
      console.log('[RealtimeTranslate] Blocked (no mic activity):', transcript.substring(0, 50));
      return;
    }
    if (isHallucination(transcript)) {
      console.log('[RealtimeTranslate] Blocked hallucination:', transcript.substring(0, 50));
      return;
    }
    if (isRepeatedTranscription(transcript)) {
      console.log('[RealtimeTranslate] Blocked repeated:', transcript.substring(0, 50));
      return;
    }
    console.log('[RealtimeTranslate] Input transcript:', transcript.substring(0, 80));
    onTranscriptRef.current?.(transcript);
  }, []);

  const flushOutputTranscript = useCallback(() => {
    if (outputFlushTimeoutRef.current) {
      clearTimeout(outputFlushTimeoutRef.current);
      outputFlushTimeoutRef.current = null;
    }

    const translation = outputTranscriptBufferRef.current.trim();
    outputTranscriptBufferRef.current = '';
    if (!translation) return;
    const tracker = speechActivityRef.current;
    if (tracker && !tracker.hadSpeechWithin(TRANSCRIPT_SPEECH_WINDOW_MS)) {
      console.log('[RealtimeTranslate] Blocked translation (no mic activity):', translation.substring(0, 50));
      return;
    }
    console.log('[RealtimeTranslate] Translation:', translation.substring(0, 80));
    onTranslationRef.current?.(translation);
  }, []);

  const handleServerEvent = useCallback((event) => {
    if (['error', 'session.updated', 'session.created'].includes(event.type)) {
      console.log('[RealtimeTranslate Event]', event.type, JSON.stringify(event).substring(0, 200));
    }

    switch (event.type) {
      case 'session.input_transcript.delta':
        if (event.delta) {
          inputTranscriptBufferRef.current += event.delta;
          if (inputFlushTimeoutRef.current) clearTimeout(inputFlushTimeoutRef.current);
          inputFlushTimeoutRef.current = setTimeout(flushInputTranscript, TRANSCRIPT_FLUSH_MS);
        }
        break;

      case 'session.input_transcript.done':
        flushInputTranscript();
        break;

      case 'session.output_transcript.delta':
        if (event.delta) {
          outputTranscriptBufferRef.current += event.delta;
          if (outputFlushTimeoutRef.current) clearTimeout(outputFlushTimeoutRef.current);
          outputFlushTimeoutRef.current = setTimeout(flushOutputTranscript, TRANSCRIPT_FLUSH_MS);
        }
        break;

      case 'session.output_transcript.done':
        flushOutputTranscript();
        break;

      case 'session.output_audio.delta':
        if (event.delta && isVoiceModeRef.current) onAudioChunkRef.current?.(event.delta);
        break;

      case 'session.output_audio.done':
        onAudioDoneRef.current?.();
        break;

      case 'response.done': {
        const status = event.response?.status;
        console.log('[RealtimeTranslate] Response done:', status);
        if (status === 'failed') {
          const message = event.response?.status_details?.error?.message || 'Realtime response failed';
          console.error('[RealtimeTranslate] Response failed:', message);
          onStatusChangeRef.current?.('error', message);
        }
        break;
      }

      case 'error':
        if (
          event.error?.message?.includes('no active response') ||
          event.error?.message?.includes('buffer too small')
        ) break;
        console.error('[RealtimeTranslate] Server error:', event.error?.message);
        onStatusChangeRef.current?.('error', event.error?.message || 'Error');
        break;
    }
  }, [flushInputTranscript, flushOutputTranscript]);

  const connect = useCallback((apiKey) => {
    return new Promise((resolve, reject) => {
      if (!apiKey) {
        onStatusChangeRef.current?.('error', 'API Key missing');
        reject(new Error('API Key not found'));
        return;
      }

      apiKeyRef.current = apiKey;
      isIntentionalCloseRef.current = false;
      hasRejectedRef.current = false;
      connectedOnceRef.current = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (wsRef.current) {
        const oldWs = wsRef.current;
        wsRef.current = null;
        oldWs.onopen = oldWs.onmessage = oldWs.onerror = oldWs.onclose = null;
        oldWs.close();
      }

      const timeoutId = setTimeout(() => {
        wsRef.current = null;
        ws.onopen = ws.onerror = ws.onclose = null;
        ws.close();
        reject(new Error('Connection timeout'));
      }, 5000);

      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate',
        ['realtime', `openai-insecure-api-key.${apiKey}`]
      );

      ws.onopen = () => {
        clearTimeout(timeoutId);
        connectedOnceRef.current = true;
        onStatusChangeRef.current?.('connected', 'Connected');

        const sessionConfig = {
          audio: {
            input: { noise_reduction: { type: 'near_field' } },
            output: { language: getTargetLanguage() },
          },
        };

        ws.send(JSON.stringify({ type: 'session.update', session: sessionConfig }));

        pingIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'session.update',
              session: { audio: { output: { language: getTargetLanguage() } } },
            }));
          }
        }, 30000);

        sessionStartRef.current = Date.now();
        if (sessionRefreshIntervalRef.current) clearInterval(sessionRefreshIntervalRef.current);
        sessionRefreshIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN && apiKeyRef.current) {
            const now = Date.now();
            if (
              now - sessionStartRef.current >= SESSION_MAX_AGE_MS &&
              now - lastActivityRef.current >= IDLE_THRESHOLD_MS
            ) {
              wsRef.current.close();
            }
          }
        }, 60000);

        resolve(true);
      };

      ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        handleServerEvent(event);
      };

      ws.onerror = () => {
        clearTimeout(timeoutId);
        if (!connectedOnceRef.current) {
          hasRejectedRef.current = true;
          onStatusChangeRef.current?.('error', 'Connection error');
          reject(new Error('Connection error'));
        }
      };

      ws.onclose = () => {
        clearTimeout(timeoutId);
        if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
        if (sessionRefreshIntervalRef.current) { clearInterval(sessionRefreshIntervalRef.current); sessionRefreshIntervalRef.current = null; }

        // Reject promise if closed before ever opening (e.g. disconnect() during CONNECTING)
        if (!connectedOnceRef.current && !hasRejectedRef.current) {
          hasRejectedRef.current = true;
          reject(new Error('Connection closed before opening'));
          return;
        }

        flushInputTranscript();
        flushOutputTranscript();
        onDisconnectRef.current?.();

        if (!isIntentionalCloseRef.current && !hasRejectedRef.current && apiKeyRef.current) {
          onStatusChangeRef.current?.('connecting', 'Reconnecting...');
          reconnectTimeoutRef.current = setTimeout(() => {
            connect(apiKeyRef.current).catch(() => {
              onStatusChangeRef.current?.('error', 'Reconnect failed');
            });
          }, 1500);
        }
      };

      wsRef.current = ws;
    });
  }, [getTargetLanguage, handleServerEvent, flushInputTranscript, flushOutputTranscript]);

  const disconnect = useCallback(() => {
    isIntentionalCloseRef.current = true;
    apiKeyRef.current = null;
    if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
    if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
    if (sessionRefreshIntervalRef.current) { clearInterval(sessionRefreshIntervalRef.current); sessionRefreshIntervalRef.current = null; }
    flushInputTranscript();
    flushOutputTranscript();
    wsRef.current?.close();
    wsRef.current = null;
  }, [flushInputTranscript, flushOutputTranscript]);

  // Cleanup on unmount — prevents timer/WebSocket leaks during hot reload or app teardown
  useEffect(() => {
    return () => {
      isIntentionalCloseRef.current = true;
      apiKeyRef.current = null;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (sessionRefreshIntervalRef.current) clearInterval(sessionRefreshIntervalRef.current);
      if (inputFlushTimeoutRef.current) clearTimeout(inputFlushTimeoutRef.current);
      if (outputFlushTimeoutRef.current) clearTimeout(outputFlushTimeoutRef.current);
      wsRef.current?.close();
    };
  }, []);

  const sendAudio = useCallback((base64Audio) => {
    lastActivityRef.current = Date.now();
    return send({ type: 'session.input_audio_buffer.append', audio: base64Audio });
  }, [send]);

  // No-op for Realtime Translate. The translation session consumes continuous audio.
  const startForceCommitTimer = useCallback(() => {}, []);
  const stopForceCommitTimer = useCallback(() => {}, []);

  return {
    capabilities,
    connect,
    disconnect,
    sendAudio,
    commitAudio,
    send,
    startForceCommitTimer,
    stopForceCommitTimer,
  };
}
