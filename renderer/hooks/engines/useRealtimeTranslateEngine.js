import { useRef, useEffect, useCallback } from 'react';
import {
  isHallucination,
  isRepeatedTranscription,
} from '../../constants';
import { createRealtimeSocket } from '../../utils/realtimeSocket';
import { createStreamSegmenter } from '../../utils/sentences';

const TRANSLATE_URL = 'wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate';
// Refresh before the server's 60-minute limit; the handoff has no audio gap
const SESSION_SOFT_MAX_AGE_MS = 45 * 60 * 1000;
const SESSION_HARD_MAX_AGE_MS = 55 * 60 * 1000;
const ROTATE_QUIET_MS = 1500;
const SESSION_CHECK_INTERVAL_MS = 5000;
// Deltas are grouped into lines: complete sentences go out immediately, a
// fragment after SEGMENT_IDLE_MS of silence, and run-on speech every SEGMENT_MAX_AGE_MS.
const SEGMENT_IDLE_MS = 900;
const SEGMENT_MAX_AGE_MS = 3500;
// A transcript arriving with no microphone energy in this window is a silence hallucination.
const TRANSCRIPT_SPEECH_WINDOW_MS = 8000;
// The translation trails the source speech, so it gets a wider window
const TRANSLATION_SPEECH_WINDOW_MS = 20000;

const IGNORED_ERROR_FRAGMENTS = ['no active response', 'buffer too small'];

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
  const hasOpenedRef = useRef(false);
  const errorShownRef = useRef(false);
  const sessionCheckIntervalRef = useRef(null);

  // Store callbacks in refs so socket closures always see latest version
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

  const getTargetLanguage = useCallback(() => {
    const dir = directionRef.current;
    if (dir === 'b-to-a') return langARef.current;
    return langBRef.current;
  }, []);

  const emitInputSegment = useCallback((transcript) => {
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

  const emitOutputSegment = useCallback((translation) => {
    const tracker = speechActivityRef.current;
    if (tracker && !tracker.hadSpeechWithin(TRANSLATION_SPEECH_WINDOW_MS)) {
      console.log('[RealtimeTranslate] Blocked translation (no mic activity):', translation.substring(0, 50));
      return;
    }
    console.log('[RealtimeTranslate] Translation:', translation.substring(0, 80));
    onTranslationRef.current?.(translation);
  }, []);

  const emitInputSegmentRef = useRef(emitInputSegment);
  const emitOutputSegmentRef = useRef(emitOutputSegment);
  emitInputSegmentRef.current = emitInputSegment;
  emitOutputSegmentRef.current = emitOutputSegment;

  // One pair of segmenters per live session, plus one for a session being
  // retired during a refresh, so the two streams' deltas never interleave.
  const createSegmenters = () => {
    const options = { idleMs: SEGMENT_IDLE_MS, maxAgeMs: SEGMENT_MAX_AGE_MS };
    return {
      input: createStreamSegmenter({ ...options, onSegment: (t) => emitInputSegmentRef.current(t) }),
      output: createStreamSegmenter({ ...options, onSegment: (t) => emitOutputSegmentRef.current(t) }),
    };
  };
  const segmentersRef = useRef(null);
  const retiredSegmentersRef = useRef(null);
  if (!segmentersRef.current) segmentersRef.current = createSegmenters();

  const flushSegments = useCallback(() => {
    segmentersRef.current.input.flush();
    segmentersRef.current.output.flush();
  }, []);

  const flushRetiredSegments = useCallback(() => {
    const retired = retiredSegmentersRef.current;
    retiredSegmentersRef.current = null;
    retired?.input.flush();
    retired?.output.flush();
  }, []);

  const handleServerEvent = useCallback((event, { retired = false } = {}) => {
    if (['error', 'session.updated', 'session.created'].includes(event.type)) {
      console.log('[RealtimeTranslate Event]', event.type, JSON.stringify(event).substring(0, 200));
    }
    const segmenters = retired ? retiredSegmentersRef.current : segmentersRef.current;
    if (!segmenters) return;
    const { input, output } = segmenters;

    switch (event.type) {
      case 'session.input_transcript.delta':
        input.push(event.delta);
        break;

      case 'session.input_transcript.done':
        input.flush();
        break;

      case 'session.output_transcript.delta':
        if (event.delta && errorShownRef.current) {
          errorShownRef.current = false;
          onStatusChangeRef.current?.('connected', 'Speak now');
        }
        output.push(event.delta);
        break;

      case 'session.output_transcript.done':
        output.flush();
        break;

      case 'session.output_audio.delta':
        if (event.delta && isVoiceModeRef.current) onAudioChunkRef.current?.(event.delta);
        break;

      case 'session.output_audio.done':
        onAudioDoneRef.current?.();
        break;

      case 'response.done': {
        const status = event.response?.status;
        if (status === 'failed') {
          const message = event.response?.status_details?.error?.message || 'Realtime response failed';
          console.error('[RealtimeTranslate] Response failed:', message);
          errorShownRef.current = true;
          onStatusChangeRef.current?.('error', message);
        }
        break;
      }

      case 'error': {
        const message = event.error?.message || '';
        if (IGNORED_ERROR_FRAGMENTS.some((f) => message.includes(f))) break;
        console.error('[RealtimeTranslate] Server error:', message);
        errorShownRef.current = true;
        onStatusChangeRef.current?.('error', message || 'Error');
        break;
      }
    }
  }, []);

  const socketHandlersRef = useRef({});
  const socketRef = useRef(null);
  if (!socketRef.current) {
    socketRef.current = createRealtimeSocket({
      url: TRANSLATE_URL,
      onOpen: () => socketHandlersRef.current.onOpen?.(),
      onEvent: (event, meta) => socketHandlersRef.current.onEvent?.(event, meta),
      onClose: (info) => socketHandlersRef.current.onClose?.(info),
      onRetire: () => socketHandlersRef.current.onRetire?.(),
      onRetireEnd: () => socketHandlersRef.current.onRetireEnd?.(),
      onStatus: (state, text) => onStatusChangeRef.current?.(state, text),
    });
  }

  const send = useCallback((data) => socketRef.current.send(data), []);
  const commitAudio = useCallback(() => true, []);

  socketHandlersRef.current = {
    onOpen: () => {
      send({
        type: 'session.update',
        session: {
          audio: {
            input: { noise_reduction: { type: 'near_field' } },
            output: { language: getTargetLanguage() },
          },
        },
      });
      errorShownRef.current = false;
      onStatusChangeRef.current?.('connected', hasOpenedRef.current ? 'Speak now' : 'Connected');
      hasOpenedRef.current = true;
    },
    onEvent: handleServerEvent,
    // Session refresh: the old session's pending text keeps its own segmenters
    onRetire: () => {
      flushRetiredSegments();
      retiredSegmentersRef.current = segmentersRef.current;
      segmentersRef.current = createSegmenters();
    },
    onRetireEnd: flushRetiredSegments,
    onClose: () => {
      // Deltas from the closed session will never be completed; show what arrived
      flushSegments();
      onDisconnectRef.current?.();
    },
  };

  // Refresh the session before the server's age limit, preferably during a pause
  const checkSession = useCallback(() => {
    const socket = socketRef.current;
    if (!socket.isOpen()) return;
    const age = socket.sessionAgeMs();
    const tracker = speechActivityRef.current;
    const longQuiet = tracker ? !tracker.hadSpeechWithin(ROTATE_QUIET_MS) : true;
    if (!socket.isRotating() && ((age >= SESSION_SOFT_MAX_AGE_MS && longQuiet) || age >= SESSION_HARD_MAX_AGE_MS)) {
      console.log('[RealtimeTranslate] Refreshing session');
      socket.rotate();
    }
  }, []);

  const stopSessionCheck = useCallback(() => {
    if (sessionCheckIntervalRef.current) {
      clearInterval(sessionCheckIntervalRef.current);
      sessionCheckIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback((apiKey) => {
    if (!apiKey) {
      onStatusChangeRef.current?.('error', 'API Key missing');
      return Promise.reject(new Error('API Key not found'));
    }
    hasOpenedRef.current = false;
    return socketRef.current.connect(apiKey)
      .then((result) => {
        stopSessionCheck();
        sessionCheckIntervalRef.current = setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);
        return result;
      })
      .catch((err) => {
        onStatusChangeRef.current?.('error', err.message);
        throw err;
      });
  }, [checkSession, stopSessionCheck]);

  const disconnect = useCallback(() => {
    stopSessionCheck();
    socketRef.current.disconnect();
    flushRetiredSegments();
    flushSegments();
  }, [stopSessionCheck, flushSegments, flushRetiredSegments]);

  // Cleanup on unmount — prevents timer/WebSocket leaks during hot reload or app teardown
  useEffect(() => {
    return () => {
      stopSessionCheck();
      socketRef.current.disconnect();
      segmentersRef.current.input.reset();
      segmentersRef.current.output.reset();
    };
  }, [stopSessionCheck]);

  // Audio is buffered while the socket reconnects, then flushed in order
  const sendAudio = useCallback((base64Audio) => (
    socketRef.current.sendBuffered({ type: 'session.input_audio_buffer.append', audio: base64Audio })
  ), []);

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
