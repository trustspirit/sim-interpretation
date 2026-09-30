import { useRef, useEffect, useCallback } from 'react';
import {
  isHallucination,
  isAssistantResponse,
  isRepeatedTranscription,
  isTranslationEcho,
  isPromptLeak,
  cleanTranslation,
  stripSourcePrefix,
  isLikelyEcho,
} from '../../constants';
import {
  buildTranscriptionConfig, buildSessionConfig, shouldForceCommit, COMMIT_GAP_MS,
} from '../../utils/whisperSession';
import {
  buildTranslationMessages, parseTranslationContent, resolveTargetLanguage, TRANSLATION_RESPONSE_FORMAT,
} from '../../utils/translationPrompt';
import { extractCompleteSentences } from '../../utils/sentences';
import { createOrderedEmitter } from '../../utils/orderedEmitter';
import { createPcmChunker } from '../../utils/pcmChunker';
import { createRealtimeSocket } from '../../utils/realtimeSocket';
import { createModelSelector, isModelRejection } from '../../utils/translationModels';
import { createAudioLedger } from '../../utils/audioLedger';

const REALTIME_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';
// Refresh the session before the server's 60-minute limit. The handoff has no
// gap, but a pause is still the nicest moment for it.
const SESSION_SOFT_MAX_AGE_MS = 45 * 60 * 1000;
const SESSION_HARD_MAX_AGE_MS = 55 * 60 * 1000;
const ROTATE_QUIET_MS = 1500;
const COMMIT_CHECK_INTERVAL_MS = 250;
const SENTENCE_FLUSH_TIMEOUT_MS = 1500;
const MAX_WHISPER_CONTEXT = 3;
// Rolling transcription context is updated at most this often, and only in a
// pause, so the session is never reconfigured while someone is mid-sentence.
const CONTEXT_UPDATE_MIN_INTERVAL_MS = 10 * 1000;
const CONTEXT_UPDATE_QUIET_MS = 700;
const MAX_RECENT_TRANSLATIONS = 5;
const MAX_TRANSLATION_CONTEXT = 3;
// A transcript arriving with no microphone energy in this window is a silence hallucination.
const TRANSCRIPT_SPEECH_WINDOW_MS = 8000;
// Translations are emitted in order, so one stuck request holds back the rest:
// keep each attempt short and retry once instead of waiting a long time.
const TRANSLATION_ATTEMPT_TIMEOUT_MS = 6000;
const TRANSLATION_MAX_ATTEMPTS = 2;
const TTS_MODEL = 'gpt-4o-mini-tts-2025-12-15';

// Server errors that don't affect the session (an empty commit, or deleting an
// item the server already dropped). Anything else, e.g. a rejected model, is shown.
const IGNORED_ERRORS = [/no active response/i, /buffer too small/i, /item.*(not found|does not exist)/i];

export const capabilities = {
  autoDirection: true,
  customInstruction: true,
  voiceSelection: true,
};

const bytesToBase64 = (bytes) => {
  let binary = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
  }
  return btoa(binary);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isRetryableError = (err) =>
  err?.name === 'AbortError' // attempt timeout
  || err?.name === 'TypeError' // network failure
  || err?.status === 429
  || err?.status >= 500;

/**
 * Engine 1: Realtime transcription + Chat Completions
 * - WebSocket to the GA Realtime API (transcription session) for STT via gpt-4o-transcribe
 * - Chat Completions for translation, with the previous lines as reference context,
 *   emitted strictly in utterance order
 * - Voice mode: streamed PCM from the Speech API, played through onAudioChunk.
 *   TTS runs on its own HTTP stream, so mic capture and playback never block each other.
 */
export default function useWhisperEngine({
  langA, langB, direction, voiceType, customInstruction, isVoiceMode, speechActivity,
  onTranscript, onTranslation, onAudioChunk, onAudioDone, onStatusChange, onDisconnect,
}) {
  const apiKeyRef = useRef(null);
  const hasOpenedRef = useRef(false);
  const errorShownRef = useRef(false);

  // Session generation: bumped on disconnect so late HTTP results are discarded
  const generationRef = useRef(0);
  const abortControllersRef = useRef(new Set());

  // Translation state
  const recentTranslationsRef = useRef([]);
  const recentTranscriptsRef = useRef([]);
  const translationHistoryRef = useRef([]);
  const lastContextUpdateAtRef = useRef(0);
  const contextDirtyRef = useRef(false);
  const speakQueueRef = useRef(Promise.resolve());

  // Sentence buffering and commit scheduling
  const sentenceBufferRef = useRef('');
  const sentenceFlushTimeoutRef = useRef(null);
  const commitCheckIntervalRef = useRef(null);
  const lastCommitAtRef = useRef(0);

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
  const voiceTypeRef = useRef(voiceType);
  const customInstructionRef = useRef(customInstruction);
  const isVoiceModeRef = useRef(isVoiceMode);
  const speechActivityRef = useRef(speechActivity);
  langARef.current = langA;
  langBRef.current = langB;
  directionRef.current = direction;
  voiceTypeRef.current = voiceType;
  customInstructionRef.current = customInstruction;
  isVoiceModeRef.current = isVoiceMode;
  speechActivityRef.current = speechActivity;

  // Audio is kept until its transcript arrives and replayed after a dropped
  // connection, so nothing said during a network hiccup is lost
  const ledgerRef = useRef(null);
  if (!ledgerRef.current) ledgerRef.current = createAudioLedger();
  const needsReplayRef = useRef(false);

  // Socket handlers are defined below; the socket reaches them through this ref
  const socketHandlersRef = useRef({});
  const socketRef = useRef(null);
  if (!socketRef.current) {
    socketRef.current = createRealtimeSocket({
      url: REALTIME_URL,
      onOpen: () => socketHandlersRef.current.onOpen?.(),
      onEvent: (event, meta) => socketHandlersRef.current.onEvent?.(event, meta),
      onClose: (info) => socketHandlersRef.current.onClose?.(info),
      onRetire: (sendToOld) => socketHandlersRef.current.onRetire?.(sendToOld),
      onStatus: (state, text) => onStatusChangeRef.current?.(state, text),
    });
  }

  const send = useCallback((data) => socketRef.current.send(data), []);

  const commitAudio = useCallback(() => {
    const sent = send({ type: 'input_audio_buffer.commit' });
    if (sent) lastCommitAtRef.current = Date.now();
    return sent;
  }, [send]);

  // ---- HTTP request tracking (translation + TTS) ----
  const trackRequest = useCallback(() => {
    const controller = new AbortController();
    abortControllersRef.current.add(controller);
    return controller;
  }, []);

  const releaseRequest = useCallback((controller) => {
    abortControllersRef.current.delete(controller);
  }, []);

  const abortAllRequests = useCallback(() => {
    for (const controller of abortControllersRef.current) controller.abort();
    abortControllersRef.current.clear();
  }, []);

  const getTranscriptionConfig = useCallback(() => buildTranscriptionConfig({
    direction: directionRef.current,
    langA: langARef.current,
    langB: langBRef.current,
    customInstruction: customInstructionRef.current,
    recentTranscripts: recentTranscriptsRef.current,
  }), []);

  const getSessionConfig = useCallback(
    () => buildSessionConfig(getTranscriptionConfig()),
    [getTranscriptionConfig]
  );

  // ---- Voice output: Speech API, streamed PCM16 @ 24kHz ----
  const synthesizeSpeech = useCallback(async (text, generation) => {
    if (generation !== generationRef.current) return;
    if (!isVoiceModeRef.current || !apiKeyRef.current) return;

    const controller = trackRequest();
    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeyRef.current}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: TTS_MODEL,
          voice: voiceTypeRef.current,
          input: text,
          response_format: 'pcm',
        }),
      });
      if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);

      const reader = response.body.getReader();
      const chunker = createPcmChunker();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (generation !== generationRef.current) {
          await reader.cancel();
          return;
        }
        const aligned = chunker.push(value);
        if (aligned) onAudioChunkRef.current?.(bytesToBase64(aligned));
      }
      onAudioDoneRef.current?.();
    } finally {
      releaseRequest(controller);
    }
  }, [trackRequest, releaseRequest]);

  // Serialize TTS so sentences are spoken in the order they were translated
  const speak = useCallback((text) => {
    const generation = generationRef.current;
    speakQueueRef.current = speakQueueRef.current
      .then(() => synthesizeSpeech(text, generation))
      .catch((err) => {
        if (err?.name !== 'AbortError') console.error('[Whisper] TTS error:', err);
      });
  }, [synthesizeSpeech]);

  const emitTranslation = useCallback((translated) => {
    recentTranslationsRef.current.push(translated);
    if (recentTranslationsRef.current.length > MAX_RECENT_TRANSLATIONS) recentTranslationsRef.current.shift();
    onTranslationRef.current?.(translated);
    if (isVoiceModeRef.current) speak(translated);
  }, [speak]);

  const emitTranslationRef = useRef(emitTranslation);
  emitTranslationRef.current = emitTranslation;

  // Translations resolve in parallel but are emitted in utterance order
  const orderRef = useRef(null);
  if (!orderRef.current) {
    orderRef.current = createOrderedEmitter((text) => emitTranslationRef.current(text));
  }

  // Shared across requests: once a model is rejected, later requests skip it
  const modelSelectorRef = useRef(null);
  if (!modelSelectorRef.current) modelSelectorRef.current = createModelSelector();

  const requestTranslation = useCallback(async (messages, signal) => {
    const selector = modelSelectorRef.current;
    for (;;) {
      const entry = selector.current();
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeyRef.current}`,
        },
        signal,
        body: JSON.stringify({
          model: entry.model,
          messages,
          ...entry.params,
          response_format: TRANSLATION_RESPONSE_FORMAT,
        }),
      });
      if (!response.ok) {
        let apiError = null;
        try { apiError = (await response.json())?.error ?? null; } catch { /* non-JSON body */ }
        if (isModelRejection(response.status, apiError) && selector.reject(entry)) {
          console.warn(`[Whisper] ${entry.model} unavailable (${apiError?.message || response.status}), using ${selector.current().model}`);
          continue;
        }
        const err = new Error(`Translation HTTP ${response.status}${apiError?.message ? `: ${apiError.message}` : ''}`);
        err.status = response.status;
        throw err;
      }
      const data = await response.json();
      return parseTranslationContent(data.choices?.[0]?.message?.content);
    }
  }, []);

  const sendForTranslation = useCallback(async (text) => {
    if (!text.trim() || !apiKeyRef.current) return;
    const generation = generationRef.current;
    const slot = orderRef.current.reserve();
    const dir = directionRef.current;
    const lA = langARef.current;
    const lB = langBRef.current;

    // Previous lines give the model the topic, pronouns and terminology
    const history = translationHistoryRef.current;
    const context = history.slice(-MAX_TRANSLATION_CONTEXT);
    const entry = { source: text, translation: null };
    history.push(entry);
    if (history.length > MAX_TRANSLATION_CONTEXT * 2) history.shift();

    console.log('[Whisper] Translation #' + slot.index, text.substring(0, 80));

    let result = null;
    let retryTarget = null;
    try {
      for (let attempt = 1; attempt <= TRANSLATION_MAX_ATTEMPTS; attempt++) {
        if (generation !== generationRef.current) return;
        const isLastAttempt = attempt === TRANSLATION_MAX_ATTEMPTS;
        const controller = trackRequest();
        const timeoutId = setTimeout(() => controller.abort(), TRANSLATION_ATTEMPT_TIMEOUT_MS);
        try {
          const raw = await requestTranslation(buildTranslationMessages({
            text,
            direction: dir,
            langA: lA,
            langB: lB,
            customInstruction: customInstructionRef.current,
            context,
            retryTarget,
          }), controller.signal);

          if (!raw) break; // empty: filler/noise only
          if (isAssistantResponse(raw)) {
            console.warn('[Whisper] Assistant-style reply, retrying:', raw.substring(0, 80));
            continue;
          }
          const translated = stripSourcePrefix(cleanTranslation(raw))?.trim();
          if (!translated) break;

          if (!isLastAttempt && isLikelyEcho(translated, text, dir, lA, lB)) {
            retryTarget = resolveTargetLanguage(text, dir, lA, lB);
            // Keep it as a fallback: showing something beats silently losing the line
            result = translated;
            console.warn('[Whisper] Output not in target language, retrying:', translated.substring(0, 80));
            continue;
          }
          result = translated;
          break;
        } catch (err) {
          if (generation !== generationRef.current) return;
          if (isLastAttempt || !isRetryableError(err)) {
            console.error('[Whisper] Translation error:', err?.message || err);
            break;
          }
          console.warn('[Whisper] Translation attempt failed, retrying:', err?.message || err);
          await sleep(err?.status === 429 ? 1000 : 300);
        } finally {
          clearTimeout(timeoutId);
          releaseRequest(controller);
        }
      }
      console.log('[Whisper] Translation result #' + slot.index, result ? result.substring(0, 80) : '(none)');
    } finally {
      entry.translation = result;
      orderRef.current.resolve(slot, result);
    }
  }, [requestTranslation, trackRequest, releaseRequest]);

  const processSentenceBuffer = useCallback((force = false) => {
    if (sentenceFlushTimeoutRef.current) {
      clearTimeout(sentenceFlushTimeoutRef.current);
      sentenceFlushTimeoutRef.current = null;
    }
    const buffer = sentenceBufferRef.current;
    if (!buffer) return;

    if (force) {
      sentenceBufferRef.current = '';
      sendForTranslation(buffer);
      return;
    }

    const { complete, remainder } = extractCompleteSentences(buffer);
    if (complete) {
      sentenceBufferRef.current = remainder;
      sendForTranslation(complete);
    }

    if (sentenceBufferRef.current) {
      sentenceFlushTimeoutRef.current = setTimeout(
        () => processSentenceBuffer(true),
        SENTENCE_FLUSH_TIMEOUT_MS
      );
    }
  }, [sendForTranslation]);

  // Runs every COMMIT_CHECK_INTERVAL_MS while listening: commits run-on speech
  // between words, updates the transcription context during pauses, and
  // refreshes the session before the server's age limit.
  const tick = useCallback(() => {
    const socket = socketRef.current;
    if (!socket.isOpen()) return;
    const tracker = speechActivityRef.current;
    const now = Date.now();

    const hadSpeech = tracker ? tracker.hadSpeechSince(lastCommitAtRef.current) : false;
    const isQuiet = tracker ? !tracker.hadSpeechWithin(COMMIT_GAP_MS, now) : true;
    if (shouldForceCommit({
      sinceCommitMs: now - lastCommitAtRef.current,
      hadSpeech,
      isQuiet,
      energyDipped: tracker?.energyDipped() ?? false,
    })) {
      if (commitAudio()) console.log('[Whisper] Forced audio commit');
    }

    // Only the transcription field is sent: session.update changes just the
    // fields present, so VAD and the audio buffer are left untouched.
    const pause = tracker ? !tracker.hadSpeechWithin(CONTEXT_UPDATE_QUIET_MS, now) : true;
    if (contextDirtyRef.current && pause && now - lastContextUpdateAtRef.current >= CONTEXT_UPDATE_MIN_INTERVAL_MS) {
      const sent = send({
        type: 'session.update',
        session: { type: 'transcription', audio: { input: { transcription: getTranscriptionConfig() } } },
      });
      if (sent) {
        contextDirtyRef.current = false;
        lastContextUpdateAtRef.current = now;
      }
    }

    const age = socket.sessionAgeMs();
    const longQuiet = tracker ? !tracker.hadSpeechWithin(ROTATE_QUIET_MS, now) : true;
    if (!socket.isRotating() && ((age >= SESSION_SOFT_MAX_AGE_MS && longQuiet) || age >= SESSION_HARD_MAX_AGE_MS)) {
      console.log('[Whisper] Refreshing session');
      socket.rotate();
    }
  }, [commitAudio, send, getTranscriptionConfig]);

  const startForceCommitTimer = useCallback(() => {
    lastCommitAtRef.current = Date.now();
    if (commitCheckIntervalRef.current) clearInterval(commitCheckIntervalRef.current);
    commitCheckIntervalRef.current = setInterval(tick, COMMIT_CHECK_INTERVAL_MS);
  }, [tick]);

  const stopForceCommitTimer = useCallback(() => {
    if (commitCheckIntervalRef.current) {
      clearInterval(commitCheckIntervalRef.current);
      commitCheckIntervalRef.current = null;
    }
    if (sentenceBufferRef.current) processSentenceBuffer(true);
    if (sentenceFlushTimeoutRef.current) {
      clearTimeout(sentenceFlushTimeoutRef.current);
      sentenceFlushTimeoutRef.current = null;
    }
  }, [processSentenceBuffer]);

  const handleTranscript = useCallback((transcript) => {
    const tracker = speechActivityRef.current;
    if (tracker && !tracker.hadSpeechWithin(TRANSCRIPT_SPEECH_WINDOW_MS)) {
      console.log('[Whisper] Blocked (no mic activity):', transcript.substring(0, 50));
      return;
    }
    if (isHallucination(transcript)) {
      console.log('[Whisper] Blocked hallucination:', transcript.substring(0, 50));
      return;
    }
    if (isPromptLeak(transcript, {
      recentTranscripts: recentTranscriptsRef.current,
      customInstruction: customInstructionRef.current,
    })) {
      console.log('[Whisper] Blocked prompt leak:', transcript.substring(0, 50));
      return;
    }
    if (isRepeatedTranscription(transcript)) {
      console.log('[Whisper] Blocked repeated:', transcript.substring(0, 50));
      return;
    }
    if (isTranslationEcho(transcript, recentTranslationsRef.current)) {
      console.log('[Whisper] Blocked TTS echo:', transcript.substring(0, 50));
      return;
    }

    recentTranscriptsRef.current.push(transcript);
    if (recentTranscriptsRef.current.length > MAX_WHISPER_CONTEXT) {
      recentTranscriptsRef.current.shift();
    }
    // Rolling context helps recognition of names and terms; tick() sends it in a pause
    contextDirtyRef.current = true;

    onTranscriptRef.current?.(transcript);

    sentenceBufferRef.current = (sentenceBufferRef.current + ' ' + transcript).trim();
    processSentenceBuffer(false);
  }, [processSentenceBuffer]);

  const handleServerEvent = useCallback((event, { retired = false } = {}) => {
    if (event.type === 'error' || event.type === 'session.updated') {
      console.log('[Whisper Event]', event.type, JSON.stringify(event).substring(0, 200));
    } else if ([
      'input_audio_buffer.committed',
      'conversation.item.input_audio_transcription.completed',
      'conversation.item.input_audio_transcription.failed',
    ].includes(event.type)) {
      console.log('[Whisper Event]', event.type, event.transcript?.substring(0, 50) || event.error?.message || '');
    }

    switch (event.type) {
      case 'input_audio_buffer.committed':
        if (!retired) {
          lastCommitAtRef.current = Date.now();
          ledgerRef.current.committed(event.item_id);
        }
        break;

      case 'conversation.item.input_audio_transcription.completed': {
        try {
          if (!retired) ledgerRef.current.confirmed(event.item_id);
          const transcript = event.transcript?.trim();
          // Items of a retired socket belong to that session; nothing to clean up here
          if (event.item_id && !retired) send({ type: 'conversation.item.delete', item_id: event.item_id });
          if (errorShownRef.current) {
            errorShownRef.current = false;
            onStatusChangeRef.current?.('connected', 'Speak now');
          }
          if (transcript) handleTranscript(transcript);
        } catch (err) {
          console.error('[Whisper] Transcription error:', err);
        }
        break;
      }

      case 'conversation.item.input_audio_transcription.failed':
        console.error('[Whisper] Transcription failed:', event.error?.message);
        if (!retired) ledgerRef.current.confirmed(event.item_id);
        if (event.item_id && !retired) send({ type: 'conversation.item.delete', item_id: event.item_id });
        break;

      case 'error': {
        const message = event.error?.message || '';
        if (IGNORED_ERRORS.some((re) => re.test(message))) break;
        console.error('[Whisper] Server error:', message);
        if (retired) break; // a draining session's errors don't concern the live one
        errorShownRef.current = true;
        onStatusChangeRef.current?.('error', message || 'Error');
        break;
      }
    }
  }, [send, handleTranscript]);

  socketHandlersRef.current = {
    onOpen: () => {
      send({ type: 'session.update', session: getSessionConfig() });
      if (needsReplayRef.current) {
        // Resend what the dropped session never transcribed, in order
        needsReplayRef.current = false;
        let replayed = 0;
        for (const { chunks, commit } of ledgerRef.current.takeForReplay()) {
          for (const audio of chunks) send({ type: 'input_audio_buffer.append', audio });
          if (commit) send({ type: 'input_audio_buffer.commit' });
          replayed += chunks.length;
        }
        if (replayed) console.log(`[Whisper] Replayed ${replayed * 100}ms of untranscribed audio`);
      }
      lastCommitAtRef.current = Date.now();
      lastContextUpdateAtRef.current = Date.now();
      contextDirtyRef.current = false;
      errorShownRef.current = false;
      onStatusChangeRef.current?.('connected', hasOpenedRef.current ? 'Speak now' : 'Connected');
      hasOpenedRef.current = true;
    },
    onEvent: handleServerEvent,
    // Session refresh: the old socket still holds the speech since the last
    // commit. Commit it there so it is transcribed, while new audio already
    // streams to the new session.
    onRetire: (sendToOld) => {
      const tracker = speechActivityRef.current;
      if (!tracker || tracker.hadSpeechSince(lastCommitAtRef.current)) {
        sendToOld({ type: 'input_audio_buffer.commit' });
      }
      // The old session finishes its own audio; track only the new one
      ledgerRef.current.reset();
    },
    onClose: ({ intentional }) => {
      if (!intentional) needsReplayRef.current = true;
      // Don't lose the trailing fragment across a dropped connection
      if (!intentional && sentenceBufferRef.current) processSentenceBuffer(true);
      onDisconnectRef.current?.();
    },
  };

  const clearSessionState = useCallback(() => {
    recentTranslationsRef.current = [];
    recentTranscriptsRef.current = [];
    translationHistoryRef.current = [];
    sentenceBufferRef.current = '';
  }, []);

  const connect = useCallback((apiKey) => {
    if (!apiKey) {
      onStatusChangeRef.current?.('error', 'API Key missing');
      return Promise.reject(new Error('API Key not found'));
    }
    apiKeyRef.current = apiKey;
    hasOpenedRef.current = false;
    needsReplayRef.current = false;
    ledgerRef.current.reset();
    return socketRef.current.connect(apiKey).catch((err) => {
      onStatusChangeRef.current?.('error', err.message);
      throw err;
    });
  }, []);

  const disconnect = useCallback(() => {
    apiKeyRef.current = null;
    generationRef.current += 1;
    if (commitCheckIntervalRef.current) { clearInterval(commitCheckIntervalRef.current); commitCheckIntervalRef.current = null; }
    if (sentenceFlushTimeoutRef.current) { clearTimeout(sentenceFlushTimeoutRef.current); sentenceFlushTimeoutRef.current = null; }
    // Nothing translated or spoken after Stop
    abortAllRequests();
    orderRef.current.reset();
    speakQueueRef.current = Promise.resolve();
    clearSessionState();
    socketRef.current.disconnect();
    ledgerRef.current.reset();
    needsReplayRef.current = false;
  }, [abortAllRequests, clearSessionState]);

  // Cleanup on unmount — prevents timer/WebSocket leaks during hot reload or app teardown
  useEffect(() => {
    return () => {
      apiKeyRef.current = null;
      generationRef.current += 1;
      if (commitCheckIntervalRef.current) clearInterval(commitCheckIntervalRef.current);
      if (sentenceFlushTimeoutRef.current) clearTimeout(sentenceFlushTimeoutRef.current);
      abortAllRequests();
      socketRef.current.disconnect();
    };
  }, [abortAllRequests]);

  // Every chunk goes into the ledger first; while disconnected it is only
  // recorded there and replayed after the reconnect
  const sendAudio = useCallback((base64Audio) => {
    if (!socketRef.current.isActive()) return false;
    ledgerRef.current.record(base64Audio);
    return socketRef.current.send({ type: 'input_audio_buffer.append', audio: base64Audio });
  }, []);

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
