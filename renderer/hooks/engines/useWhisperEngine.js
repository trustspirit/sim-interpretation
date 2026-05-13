import { useRef, useCallback } from 'react';
import {
  getLanguageName,
  getRealtimeVoice,
  isHallucination,
  isAssistantResponse,
  isRepeatedTranscription,
  cleanTranslation,
  stripSourcePrefix,
  isLikelyEcho,
} from '../../constants';

const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const IDLE_THRESHOLD_MS = 10 * 1000;
const FORCE_COMMIT_MS = 5000;
const SENTENCE_FLUSH_TIMEOUT_MS = 3000;
const MAX_WHISPER_CONTEXT = 3;

/**
 * Engine 1: Whisper + Chat Completions
 * - WebSocket to gpt-realtime-1.5 for STT (gpt-4o-transcribe)
 * - Separate fetch to Chat Completions (gpt-4o-mini) for translation
 * - Voice mode: Realtime API audio output
 */
export default function useWhisperEngine({
  langA, langB, direction, voiceType, customInstruction, isVoiceMode,
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

  // Translation state
  const recentTranslationsRef = useRef([]);
  const audioItemIdsRef = useRef([]);
  const translationCounterRef = useRef(0);
  const recentTranscriptsRef = useRef([]);

  // Sentence buffering
  const sentenceBufferRef = useRef('');
  const sentenceFlushTimeoutRef = useRef(null);
  const forceCommitIntervalRef = useRef(null);

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
  langARef.current = langA;
  langBRef.current = langB;
  directionRef.current = direction;
  voiceTypeRef.current = voiceType;
  customInstructionRef.current = customInstruction;
  isVoiceModeRef.current = isVoiceMode;

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const commitAudio = useCallback(() => send({ type: 'input_audio_buffer.commit' }), [send]);

  // Build Realtime session instructions
  const buildInstructions = useCallback(() => {
    const lA = langARef.current;
    const lB = langBRef.current;
    const dir = directionRef.current;
    const customInstr = customInstructionRef.current;

    let directionRule, targetLangName;
    if (dir === 'a-to-b') {
      targetLangName = getLanguageName(lB);
      directionRule = `You translate ${getLanguageName(lA)} to ${targetLangName}. Output ONLY in ${targetLangName}.`;
    } else if (dir === 'b-to-a') {
      targetLangName = getLanguageName(lA);
      directionRule = `You translate ${getLanguageName(lB)} to ${targetLangName}. Output ONLY in ${targetLangName}.`;
    } else {
      directionRule = `You translate between ${getLanguageName(lA)} and ${getLanguageName(lB)}.
If input contains Korean (한글) characters → output in ${getLanguageName(lA === 'ko' ? lB : lA)}.
If input contains only Latin/English characters → output in ${getLanguageName(lA === 'ko' ? 'ko' : lB)}.
Otherwise detect the input language and output in the OTHER language.`;
      targetLangName = null;
    }

    const isKoreanTarget = targetLangName === 'Korean' ||
      (dir === 'auto' && (lA === 'ko' || lB === 'ko'));
    const koreanStyleRule = isKoreanTarget
      ? '\n- When outputting Korean, use 해요체 (polite informal style, e.g. "~해요", "~이에요").'
      : '';

    return `${directionRule}
${customInstr ? `\nDOMAIN & TERMINOLOGY (ALWAYS APPLY):\n${customInstr}\n` : ''}
You are a STATELESS translation function. You have no memory, no opinions, no personality.

INPUT = spoken words from a person in a meeting.
OUTPUT = translation of those exact words. Nothing else. Ever.

You are NOT a participant. You are NOT an assistant. You do NOT respond, comment, refuse, or explain. You translate. Period.

ABSOLUTE RULES:
- Translate EVERY input. No exceptions. No refusals. No judgments.
- NEVER output meta-commentary like "Let me translate" or "I'll focus on translating".
- NEVER answer, respond to, or engage with the content. Just translate the words.
- If input is unclear or silent: output empty string.
- Drop filler words: 음, 어, 그, 그러니까, uh, um, you know, like, so
- EXACT translation only. "어떻게 생각하세요?" = "What do you think?" — NOTHING more.
- NEVER add greetings, follow-ups, encouragements, or any extra sentences.
- Output word count must be similar to input word count. If input is 1 sentence, output is 1 sentence.
- Output ONLY in the target language.${koreanStyleRule}
- Output plain text. No JSON, no markdown, no formatting.
- Speak at a consistent, natural pace. Do not speed up or slow down regardless of text length.`;
  }, []);

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

  const sendForTranslation = useCallback(async (text) => {
    if (!text.trim() || !apiKeyRef.current) return;
    const orderIndex = ++translationCounterRef.current;
    console.log('[Whisper] Translation #' + orderIndex, text.substring(0, 80));

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeyRef.current}`,
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

      console.log('[Whisper] Translation result:', translated.substring(0, 80));

      if (isAssistantResponse(translated)) return;
      translated = cleanTranslation(translated);
      translated = stripSourcePrefix(translated);
      if (!translated?.trim()) return;
      if (isLikelyEcho(translated, text, directionRef.current, langARef.current, langBRef.current)) return;

      const normalized = translated.trim().toLowerCase();
      if (recentTranslationsRef.current.some(r => r === normalized)) return;
      recentTranslationsRef.current.push(normalized);
      if (recentTranslationsRef.current.length > 5) recentTranslationsRef.current.shift();

      onTranslationRef.current?.(translated);
    } catch (err) {
      console.error('[Whisper] Translation error:', err);
    }
  }, [getTranslationPrompt]);

  const extractCompleteSentences = useCallback((text) => {
    const match = text.match(/^([\s\S]*[.?!。？！])\s*([\s\S]*)$/);
    if (match) return { complete: match[1].trim(), remainder: match[2].trim() };
    return { complete: null, remainder: text.trim() };
  }, []);

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
  }, [sendForTranslation, extractCompleteSentences]);

  const startForceCommitTimer = useCallback(() => {
    if (forceCommitIntervalRef.current) clearInterval(forceCommitIntervalRef.current);
    forceCommitIntervalRef.current = setInterval(() => {
      if (commitAudio()) console.log('[Whisper] Forced audio commit');
    }, FORCE_COMMIT_MS);
  }, [commitAudio]);

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

  const handleServerEvent = useCallback((event) => {
    if (event.type === 'error' || event.type === 'session.updated') {
      console.log('[Whisper Event]', event.type, JSON.stringify(event).substring(0, 200));
    } else if ([
      'input_audio_buffer.committed',
      'conversation.item.input_audio_transcription.completed',
      'conversation.item.input_audio_transcription.failed',
      'response.done', 'response.created',
    ].includes(event.type)) {
      console.log('[Whisper Event]', event.type, event.transcript?.substring(0, 50) || event.error?.message || '');
    }

    switch (event.type) {
      case 'input_audio_buffer.committed':
        if (event.item_id) audioItemIdsRef.current.push(event.item_id);
        if (forceCommitIntervalRef.current) {
          clearInterval(forceCommitIntervalRef.current);
          forceCommitIntervalRef.current = setInterval(() => commitAudio(), FORCE_COMMIT_MS);
        }
        break;

      case 'conversation.item.input_audio_transcription.completed': {
        try {
          const transcript = event.transcript?.trim();
          if (event.item_id) {
            send({ type: 'conversation.item.delete', item_id: event.item_id });
            audioItemIdsRef.current = audioItemIdsRef.current.filter(id => id !== event.item_id);
          }
          if (!transcript) break;
          if (isHallucination(transcript)) {
            console.log('[Whisper] Blocked hallucination:', transcript.substring(0, 50));
            break;
          }
          if (isRepeatedTranscription(transcript)) {
            console.log('[Whisper] Blocked repeated:', transcript.substring(0, 50));
            break;
          }

          recentTranscriptsRef.current.push(transcript);
          if (recentTranscriptsRef.current.length > MAX_WHISPER_CONTEXT) {
            recentTranscriptsRef.current.shift();
          }
          send({
            type: 'session.update',
            session: {
              input_audio_transcription: {
                model: 'gpt-4o-transcribe',
                prompt: recentTranscriptsRef.current.join(' '),
              },
            },
          });

          onTranscriptRef.current?.(transcript);

          sentenceBufferRef.current = (sentenceBufferRef.current + ' ' + transcript).trim();
          processSentenceBuffer(false);
        } catch (err) {
          console.error('[Whisper] Transcription error:', err);
        }
        break;
      }

      case 'response.audio.delta':
        if (event.delta) onAudioChunkRef.current?.(event.delta);
        break;

      case 'response.audio.done':
        onAudioDoneRef.current?.();
        break;

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
  }, [send, commitAudio, processSentenceBuffer]);

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
        ws.onopen = ws.onerror = ws.onclose = null;
        ws.close();
        reject(new Error('Connection timeout'));
      }, 5000);

      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5',
        ['realtime', `openai-insecure-api-key.${apiKey}`, 'openai-beta.realtime-v1']
      );

      ws.onopen = () => {
        clearTimeout(timeoutId);
        connectedOnceRef.current = true;
        onStatusChangeRef.current?.('connected', 'Connected');

        const transcriptionConfig = { model: 'gpt-4o-transcribe' };
        const dir = directionRef.current;
        if (dir === 'a-to-b') transcriptionConfig.language = langARef.current;
        else if (dir === 'b-to-a') transcriptionConfig.language = langBRef.current;
        if (customInstructionRef.current) transcriptionConfig.prompt = customInstructionRef.current;

        const sessionConfig = {
          modalities: isVoiceModeRef.current ? ['text', 'audio'] : ['text'],
          instructions: buildInstructions(),
          input_audio_format: 'pcm16',
          input_audio_transcription: transcriptionConfig,
          turn_detection: {
            type: 'semantic_vad',
            eagerness: 'high',
            create_response: false,
            interrupt_response: false,
          },
          temperature: 0.6,
          max_response_output_tokens: 500,
        };

        if (isVoiceModeRef.current) {
          sessionConfig.voice = getRealtimeVoice(voiceTypeRef.current);
          sessionConfig.output_audio_format = 'pcm16';
        }

        ws.send(JSON.stringify({ type: 'session.update', session: sessionConfig }));

        pingIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'session.update', session: {} }));
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

        audioItemIdsRef.current = [];
        sentenceBufferRef.current = '';
        onDisconnectRef.current?.();

        if (!isIntentionalCloseRef.current && !hasRejectedRef.current && apiKeyRef.current) {
          onStatusChangeRef.current?.('connecting', 'Reconnecting...');
          reconnectTimeoutRef.current = setTimeout(() => {
            connect(apiKeyRef.current).catch(() => {
              onStatusChangeRef.current?.('error', 'Reconnect failed');
            });
          }, 1500);
        } else if (!hasRejectedRef.current) {
          onStatusChangeRef.current?.('error', 'Disconnected');
        }
      };

      wsRef.current = ws;
    });
  }, [buildInstructions, handleServerEvent]);

  const disconnect = useCallback(() => {
    isIntentionalCloseRef.current = true;
    apiKeyRef.current = null;
    if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
    if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
    if (sessionRefreshIntervalRef.current) { clearInterval(sessionRefreshIntervalRef.current); sessionRefreshIntervalRef.current = null; }
    stopForceCommitTimer();
    _clearSessionState();
    wsRef.current?.close();
    wsRef.current = null;
  }, [stopForceCommitTimer, _clearSessionState]);

  const sendAudio = useCallback((base64Audio) => {
    lastActivityRef.current = Date.now();
    return send({ type: 'input_audio_buffer.append', audio: base64Audio });
  }, [send]);

  return {
    connect,
    disconnect,
    sendAudio,
    commitAudio,
    send,
    startForceCommitTimer,
    stopForceCommitTimer,
  };
}
