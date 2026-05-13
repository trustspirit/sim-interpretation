import { useRef, useEffect, useCallback } from 'react';
import {
  getLanguageName,
  getRealtimeVoice,
  isHallucination,
  isRepeatedTranscription,
} from '../../constants';

const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const IDLE_THRESHOLD_MS = 10 * 1000;

/**
 * Engine 2: gpt-realtime-translate
 * - Single WebSocket connection handles both STT and translation
 * - Translation arrives via response.text.delta/done (no Chat Completions call)
 * - Voice mode: same Realtime API audio output
 */
export default function useRealtimeTranslateEngine({
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

  // Translation streaming state
  const currentTranslationDeltaRef = useRef('');

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

  const buildInstructions = useCallback(() => {
    const lA = langARef.current;
    const lB = langBRef.current;
    const dir = directionRef.current;
    const customInstr = customInstructionRef.current;

    let directionRule;
    if (dir === 'a-to-b') {
      directionRule = `Translate ${getLanguageName(lA)} speech to ${getLanguageName(lB)}. Output ONLY in ${getLanguageName(lB)}.`;
    } else if (dir === 'b-to-a') {
      directionRule = `Translate ${getLanguageName(lB)} speech to ${getLanguageName(lA)}. Output ONLY in ${getLanguageName(lA)}.`;
    } else {
      directionRule = `Translate speech between ${getLanguageName(lA)} and ${getLanguageName(lB)}. Detect the spoken language and output ONLY in the OTHER language.`;
    }

    const isKoreanTarget =
      (dir === 'a-to-b' && lB === 'ko') ||
      (dir === 'b-to-a' && lA === 'ko') ||
      (dir === 'auto' && (lA === 'ko' || lB === 'ko'));
    const koreanStyleRule = isKoreanTarget
      ? ' Use 해요체 (polite informal style, e.g. "~해요", "~이에요").'
      : '';

    return `${directionRule}${koreanStyleRule}
${customInstr ? `\nDOMAIN & TERMINOLOGY:\n${customInstr}\n` : ''}
Output ONLY the translation. No commentary, no meta-text, no explanations. Plain text only.
Drop filler words: 음, 어, 그, uh, um, you know, like.`;
  }, []);

  const handleServerEvent = useCallback((event) => {
    if (['error', 'session.updated'].includes(event.type)) {
      console.log('[RealtimeTranslate Event]', event.type, JSON.stringify(event).substring(0, 200));
    }

    switch (event.type) {
      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = event.transcript?.trim();
        if (!transcript) break;
        if (isHallucination(transcript)) {
          console.log('[RealtimeTranslate] Blocked hallucination:', transcript.substring(0, 50));
          break;
        }
        if (isRepeatedTranscription(transcript)) {
          console.log('[RealtimeTranslate] Blocked repeated:', transcript.substring(0, 50));
          break;
        }
        console.log('[RealtimeTranslate] Transcript:', transcript.substring(0, 80));
        onTranscriptRef.current?.(transcript);
        break;
      }

      case 'response.text.delta':
        // Accumulate translation deltas
        if (event.delta) {
          currentTranslationDeltaRef.current += event.delta;
        }
        break;

      case 'response.text.done': {
        const translation = (event.text || currentTranslationDeltaRef.current).trim();
        currentTranslationDeltaRef.current = '';
        if (translation) {
          console.log('[RealtimeTranslate] Translation:', translation.substring(0, 80));
          onTranslationRef.current?.(translation);
        }
        break;
      }

      case 'response.audio.delta':
        if (event.delta) onAudioChunkRef.current?.(event.delta);
        break;

      case 'response.audio.done':
        onAudioDoneRef.current?.();
        break;

      case 'response.done':
        console.log('[RealtimeTranslate] Response done:', event.response?.status);
        break;

      case 'error':
        if (
          event.error?.message?.includes('no active response') ||
          event.error?.message?.includes('buffer too small')
        ) break;
        console.error('[RealtimeTranslate] Server error:', event.error?.message);
        onStatusChangeRef.current?.('error', event.error?.message || 'Error');
        break;
    }
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
        ws.onopen = ws.onerror = ws.onclose = null;
        ws.close();
        reject(new Error('Connection timeout'));
      }, 5000);

      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-realtime-translate',
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
            create_response: true,   // Model auto-creates translated response
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

        // Reject promise if closed before ever opening (e.g. disconnect() during CONNECTING)
        if (!connectedOnceRef.current && !hasRejectedRef.current) {
          hasRejectedRef.current = true;
          reject(new Error('Connection closed before opening'));
          return;
        }

        currentTranslationDeltaRef.current = '';
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
  }, [buildInstructions, handleServerEvent]);

  const disconnect = useCallback(() => {
    isIntentionalCloseRef.current = true;
    apiKeyRef.current = null;
    if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
    if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
    if (sessionRefreshIntervalRef.current) { clearInterval(sessionRefreshIntervalRef.current); sessionRefreshIntervalRef.current = null; }
    currentTranslationDeltaRef.current = '';
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  // Cleanup on unmount — prevents timer/WebSocket leaks during hot reload or app teardown
  useEffect(() => {
    return () => {
      isIntentionalCloseRef.current = true;
      apiKeyRef.current = null;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (sessionRefreshIntervalRef.current) clearInterval(sessionRefreshIntervalRef.current);
      wsRef.current?.close();
    };
  }, []);

  const sendAudio = useCallback((base64Audio) => {
    lastActivityRef.current = Date.now();
    return send({ type: 'input_audio_buffer.append', audio: base64Audio });
  }, [send]);

  // No-op for Realtime Translate (model handles timing via VAD + create_response: true)
  const startForceCommitTimer = useCallback(() => {}, []);
  const stopForceCommitTimer = useCallback(() => {}, []);

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
