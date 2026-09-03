import { useRef, useEffect, useCallback } from 'react';
import {
  getLanguageName,
  isHallucination,
  isAssistantResponse,
  isRepeatedTranscription,
  isTranslationEcho,
  cleanTranslation,
  stripSourcePrefix,
  isLikelyEcho,
} from '../../constants';
import { buildTranscriptionConfig, buildSessionConfig } from '../../utils/whisperSession';
import { extractCompleteSentences } from '../../utils/sentences';
import { createOrderedEmitter } from '../../utils/orderedEmitter';
import { createPcmChunker } from '../../utils/pcmChunker';

const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const IDLE_THRESHOLD_MS = 10 * 1000;
const FORCE_COMMIT_MS = 5000;
const SENTENCE_FLUSH_TIMEOUT_MS = 2000;
const MAX_WHISPER_CONTEXT = 3;
const MAX_RECENT_TRANSLATIONS = 5;
// A transcript arriving with no microphone energy in this window is a silence hallucination.
const TRANSCRIPT_SPEECH_WINDOW_MS = 8000;
const TRANSLATION_TIMEOUT_MS = 15000;
const TRANSLATION_MODEL = 'gpt-4o-mini';
const TTS_MODEL = 'gpt-4o-mini-tts';

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

/**
 * Engine 1: Whisper + Chat Completions
 * - WebSocket to the GA Realtime API (transcription session) for STT via gpt-4o-transcribe
 * - Chat Completions for translation, emitted strictly in utterance order
 * - Voice mode: streamed PCM from the Speech API, played through onAudioChunk.
 *   TTS runs on its own HTTP stream, so mic capture and playback never block each other.
 */
export default function useWhisperEngine({
  langA, langB, direction, voiceType, customInstruction, isVoiceMode, speechActivity,
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

  // Session generation: bumped on disconnect so late HTTP results are discarded
  const generationRef = useRef(0);
  const abortControllersRef = useRef(new Set());

  // Translation state
  const recentTranslationsRef = useRef([]);
  const recentTranscriptsRef = useRef([]);
  const audioItemIdsRef = useRef([]);
  const speakQueueRef = useRef(Promise.resolve());

  // Sentence buffering
  const sentenceBufferRef = useRef('');
  const sentenceFlushTimeoutRef = useRef(null);
  const forceCommitIntervalRef = useRef(null);
  const lastCommitAtRef = useRef(0);

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

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

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

  // Build Chat Completions translation prompt
  const getTranslationPrompt = useCallback(() => {
    const lA = langARef.current;
    const lB = langBRef.current;
    const dir = directionRef.current;
    const customInstr = customInstructionRef.current;

    let directionRule;
    if (dir === 'a-to-b') {
      directionRule = `Translate ${getLanguageName(lA)} to ${getLanguageName(lB)}. Output ONLY in ${getLanguageName(lB)}.`;
    } else if (dir === 'b-to-a') {
      directionRule = `Translate ${getLanguageName(lB)} to ${getLanguageName(lA)}. Output ONLY in ${getLanguageName(lA)}.`;
    } else {
      directionRule = `Translate between ${getLanguageName(lA)} and ${getLanguageName(lB)}. Detect the input language and output in the OTHER language.`;
    }
    return `${directionRule}\n${customInstr ? `DOMAIN: ${customInstr}\n` : ''}Translate exactly. No commentary. Output ONLY the translation in plain text.`;
  }, []);

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

  const sendForTranslation = useCallback(async (text) => {
    if (!text.trim() || !apiKeyRef.current) return;
    const slot = orderRef.current.reserve();
    const controller = trackRequest();
    const timeoutId = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);
    console.log('[Whisper] Translation #' + slot.index, text.substring(0, 80));

    let result = null;
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeyRef.current}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: TRANSLATION_MODEL,
          messages: [
            { role: 'system', content: getTranslationPrompt() },
            { role: 'user', content: text },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });
      if (!response.ok) throw new Error(`Translation HTTP ${response.status}`);

      const data = await response.json();
      let translated = data.choices?.[0]?.message?.content?.trim();
      if (translated && !isAssistantResponse(translated)) {
        translated = stripSourcePrefix(cleanTranslation(translated))?.trim();
        if (translated && !isLikelyEcho(translated, text, directionRef.current, langARef.current, langBRef.current)) {
          result = translated;
        }
      }
      console.log('[Whisper] Translation result #' + slot.index, result ? result.substring(0, 80) : '(filtered)');
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('[Whisper] Translation error:', err);
    } finally {
      clearTimeout(timeoutId);
      releaseRequest(controller);
      orderRef.current.resolve(slot, result);
    }
  }, [getTranslationPrompt, trackRequest, releaseRequest]);

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

  // Force a commit only when the mic actually heard speech since the last commit.
  // Committing silent buffers is the main source of Whisper hallucinations.
  const scheduleForceCommit = useCallback(() => {
    if (forceCommitIntervalRef.current) clearInterval(forceCommitIntervalRef.current);
    forceCommitIntervalRef.current = setInterval(() => {
      const tracker = speechActivityRef.current;
      if (tracker && !tracker.hadSpeechSince(lastCommitAtRef.current)) return;
      if (commitAudio()) console.log('[Whisper] Forced audio commit');
    }, FORCE_COMMIT_MS);
  }, [commitAudio]);

  const startForceCommitTimer = useCallback(() => {
    lastCommitAtRef.current = Date.now();
    scheduleForceCommit();
  }, [scheduleForceCommit]);

  const stopForceCommitTimer = useCallback(() => {
    if (forceCommitIntervalRef.current) {
      clearInterval(forceCommitIntervalRef.current);
      forceCommitIntervalRef.current = null;
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
    // Re-send the full input block so language and the custom prompt survive
    // alongside the rolling context, whatever the server's merge semantics are.
    send({
      type: 'session.update',
      session: buildSessionConfig(getTranscriptionConfig()),
    });

    onTranscriptRef.current?.(transcript);

    sentenceBufferRef.current = (sentenceBufferRef.current + ' ' + transcript).trim();
    processSentenceBuffer(false);
  }, [send, getTranscriptionConfig, processSentenceBuffer]);

  const handleServerEvent = useCallback((event) => {
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
        if (event.item_id) audioItemIdsRef.current.push(event.item_id);
        lastCommitAtRef.current = Date.now();
        if (forceCommitIntervalRef.current) scheduleForceCommit();
        break;

      case 'conversation.item.input_audio_transcription.completed': {
        try {
          const transcript = event.transcript?.trim();
          if (event.item_id) {
            send({ type: 'conversation.item.delete', item_id: event.item_id });
            audioItemIdsRef.current = audioItemIdsRef.current.filter(id => id !== event.item_id);
          }
          if (transcript) handleTranscript(transcript);
        } catch (err) {
          console.error('[Whisper] Transcription error:', err);
        }
        break;
      }

      case 'conversation.item.input_audio_transcription.failed':
        console.error('[Whisper] Transcription failed:', event.error?.message);
        if (event.item_id) {
          send({ type: 'conversation.item.delete', item_id: event.item_id });
          audioItemIdsRef.current = audioItemIdsRef.current.filter(id => id !== event.item_id);
        }
        break;

      case 'error':
        if (
          event.error?.message?.includes('no active response') ||
          event.error?.message?.includes('buffer too small')
        ) break;
        console.error('[Whisper] Server error:', event.error?.message);
        onStatusChangeRef.current?.('error', event.error?.message || 'Error');
        break;
    }
  }, [send, scheduleForceCommit, handleTranscript]);

  const _clearSessionState = useCallback(() => {
    recentTranslationsRef.current = [];
    recentTranscriptsRef.current = [];
    audioItemIdsRef.current = [];
    sentenceBufferRef.current = '';
  }, []);

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
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
        ws.close();
        reject(new Error('Connection timeout'));
      }, 5000);

      // GA Realtime API, transcription-only session (no model responses at all).
      // Translation and voice output go over separate HTTP requests.
      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?intent=transcription',
        ['realtime', `openai-insecure-api-key.${apiKey}`]
      );

      ws.onopen = () => {
        clearTimeout(timeoutId);
        connectedOnceRef.current = true;
        onStatusChangeRef.current?.('connected', 'Connected');

        ws.send(JSON.stringify({
          type: 'session.update',
          session: buildSessionConfig(getTranscriptionConfig()),
        }));

        pingIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'session.update', session: { type: 'transcription' } }));
          }
        }, 30000);

        sessionStartRef.current = Date.now();
        lastCommitAtRef.current = Date.now();
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

        audioItemIdsRef.current = [];
        // Don't lose the trailing fragment across a session refresh
        if (!isIntentionalCloseRef.current && sentenceBufferRef.current) processSentenceBuffer(true);
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
  }, [getTranscriptionConfig, handleServerEvent, processSentenceBuffer]);

  const disconnect = useCallback(() => {
    isIntentionalCloseRef.current = true;
    apiKeyRef.current = null;
    generationRef.current += 1;
    if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
    if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
    if (sessionRefreshIntervalRef.current) { clearInterval(sessionRefreshIntervalRef.current); sessionRefreshIntervalRef.current = null; }
    if (forceCommitIntervalRef.current) { clearInterval(forceCommitIntervalRef.current); forceCommitIntervalRef.current = null; }
    if (sentenceFlushTimeoutRef.current) { clearTimeout(sentenceFlushTimeoutRef.current); sentenceFlushTimeoutRef.current = null; }
    // Nothing translated or spoken after Stop
    abortAllRequests();
    orderRef.current.reset();
    speakQueueRef.current = Promise.resolve();
    _clearSessionState();
    wsRef.current?.close();
    wsRef.current = null;
  }, [abortAllRequests, _clearSessionState]);

  // Cleanup on unmount — prevents timer/WebSocket leaks during hot reload or app teardown
  useEffect(() => {
    return () => {
      isIntentionalCloseRef.current = true;
      apiKeyRef.current = null;
      generationRef.current += 1;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (sessionRefreshIntervalRef.current) clearInterval(sessionRefreshIntervalRef.current);
      if (forceCommitIntervalRef.current) clearInterval(forceCommitIntervalRef.current);
      if (sentenceFlushTimeoutRef.current) clearTimeout(sentenceFlushTimeoutRef.current);
      abortAllRequests();
      wsRef.current?.close();
    };
  }, [abortAllRequests]);

  const sendAudio = useCallback((base64Audio) => {
    lastActivityRef.current = Date.now();
    return send({ type: 'input_audio_buffer.append', audio: base64Audio });
  }, [send]);

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
