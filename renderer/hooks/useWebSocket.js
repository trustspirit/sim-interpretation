import { useRef, useCallback } from 'react';
import { getLanguageName, getRealtimeVoice } from '../constants';

export default function useWebSocket({
  langA,
  langB,
  direction,
  voiceType,
  customInstruction,
  isVoiceMode,
  onStatusChange,
  onServerEvent,
  onDisconnect,
}) {
  const wsRef = useRef(null);
  const apiKeyRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const sessionRefreshIntervalRef = useRef(null);
  const isIntentionalCloseRef = useRef(false);
  const hasRejectedRef = useRef(false);
  const connectedOnceRef = useRef(false);  // Track if onopen ever fired (distinguishes initial fail vs mid-session drop)
  const lastActivityRef = useRef(Date.now());
  const sessionStartRef = useRef(Date.now());

  const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes max session age
  const IDLE_THRESHOLD_MS = 10 * 1000; // 10 seconds of idle before refresh allowed

  const connect = useCallback((apiKey) => {
    return new Promise((resolve, reject) => {
      if (!apiKey) {
        console.log('[WebSocket] No API key');
        onStatusChange?.('error', 'API Key missing');
        reject(new Error('API Key not found'));
        return;
      }

      console.log('[WebSocket] Connecting...');

      // Store API key for reconnection
      apiKeyRef.current = apiKey;
      isIntentionalCloseRef.current = false;
      hasRejectedRef.current = false;
      connectedOnceRef.current = false;

      // Clear any pending reconnect
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Close existing connection if any — remove handlers first to prevent auto-reconnect race
      if (wsRef.current) {
        const oldWs = wsRef.current;
        wsRef.current = null;
        oldWs.onopen = null;
        oldWs.onmessage = null;
        oldWs.onerror = null;
        oldWs.onclose = null;
        oldWs.close();
      }

      // Connection timeout - reject if WebSocket hangs
      const CONNECTION_TIMEOUT_MS = 5000;
      const timeoutId = setTimeout(() => {
        console.log('[WebSocket] Connection timeout');
        ws.onopen = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT_MS);

      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5',
        ['realtime', `openai-insecure-api-key.${apiKey}`, 'openai-beta.realtime-v1']
      );

      ws.onopen = () => {
        clearTimeout(timeoutId);
        connectedOnceRef.current = true;
        onStatusChange?.('connected', 'Connected');

        let directionRule;
        let targetLangName;
        if (direction === 'a-to-b') {
          targetLangName = getLanguageName(langB);
          directionRule = `You translate ${getLanguageName(langA)} to ${targetLangName}. Output ONLY in ${targetLangName}.`;
        } else if (direction === 'b-to-a') {
          targetLangName = getLanguageName(langA);
          directionRule = `You translate ${getLanguageName(langB)} to ${targetLangName}. Output ONLY in ${targetLangName}.`;
        } else {
          // Auto mode: character-based language detection rule
          directionRule = `You translate between ${getLanguageName(langA)} and ${getLanguageName(langB)}.
If input contains Korean (한글) characters → output in ${getLanguageName(langA === 'ko' ? langB : langA)}.
If input contains only Latin/English characters → output in ${getLanguageName(langA === 'ko' ? 'ko' : langB)}.
Otherwise detect the input language and output in the OTHER language.`;
          targetLangName = null;
        }

        // Korean style guidance
        const isKoreanTarget = targetLangName === 'Korean' ||
          (direction === 'auto' && (langA === 'ko' || langB === 'ko'));
        const koreanStyleRule = isKoreanTarget
          ? '\n- When outputting Korean, use 해요체 (polite informal style, e.g. "~해요", "~이에요").'
          : '';

        let instructions = `${directionRule}

You are a STATELESS translation function. You have no memory, no opinions, no personality.

INPUT = spoken words from a person in a meeting.
OUTPUT = translation of those exact words. Nothing else. Ever.

You are NOT a participant. You are NOT an assistant. You do NOT respond, comment, refuse, or explain. You translate. Period.

Input segments separated by " | " = separate utterances. Translate as natural flowing text.

ABSOLUTE RULES:
- Translate EVERY input. No exceptions. No refusals. No judgments.
- "I can't do that" → translate it. "Shut up" → translate it. "Can you hear me?" → translate it.
- NEVER output meta-commentary like "Let me translate" or "I'll focus on translating".
- NEVER answer, respond to, or engage with the content. Just translate the words.
- CRITICAL: NEVER output in the same language as the input. If input is Korean, output MUST be in the other language, NEVER Korean. If input is English, output MUST be in the other language, NEVER English.
- CRITICAL: You are NOT a chatbot. Do NOT greet, acknowledge, confirm, ask questions, or make any conversational statement. You are a PURE translation function. Your ONLY valid output is a translation.
- If input is unclear, silent, or you cannot translate: output NOTHING (empty string). Do NOT say "there is nothing to translate", "I didn't hear", or any explanation.
- Drop filler words: 음, 어, 그, 그러니까, uh, um, you know, like, so
- EXACT translation only. "어떻게 생각하세요?" = "What do you think?" — NOTHING more.
- NEVER add greetings, follow-ups, encouragements, or any extra sentences.
- Output word count must be similar to input word count. If input is 1 sentence, output is 1 sentence.
- Output ONLY in the target language.${koreanStyleRule}
- Output plain text. No JSON, no markdown, no formatting.
- Speak at a consistent, natural pace. Do not speed up or slow down regardless of text length.`;

        if (customInstruction) {
          instructions += `\n\nDomain context: ${customInstruction}`;
        }

        const transcriptionConfig = {
          model: 'gpt-4o-transcribe',
        };
        if (direction === 'a-to-b') {
          transcriptionConfig.language = langA;
        } else if (direction === 'b-to-a') {
          transcriptionConfig.language = langB;
        }
        if (customInstruction) {
          transcriptionConfig.prompt = customInstruction;  // Feed domain terms to Whisper for better recognition
        }

        const sessionConfig = {
          modalities: isVoiceMode ? ['text', 'audio'] : ['text'],
          instructions,
          input_audio_format: 'pcm16',
          input_audio_transcription: transcriptionConfig,
          turn_detection: {
            type: 'semantic_vad',
            eagerness: 'medium',
            create_response: false,     // We control response creation via our queue system
            interrupt_response: false,  // Never interrupt ongoing translation — new input queues instead
          },
          temperature: 0.6,
          max_response_output_tokens: 500,
        };

        // Add voice config if voice mode is enabled
        if (isVoiceMode) {
          sessionConfig.voice = getRealtimeVoice(voiceType);
          sessionConfig.output_audio_format = 'pcm16';
        }

        ws.send(JSON.stringify({
          type: 'session.update',
          session: sessionConfig
        }));

        // Start ping interval inside onopen to avoid leaks on failed connections
        pingIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'session.update', session: {} }));
          }
        }, 30000);

        // Start session refresh check inside onopen
        sessionStartRef.current = Date.now();
        if (sessionRefreshIntervalRef.current) {
          clearInterval(sessionRefreshIntervalRef.current);
        }
        sessionRefreshIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN && apiKeyRef.current) {
            const now = Date.now();
            const sessionAge = now - sessionStartRef.current;
            const idleTime = now - lastActivityRef.current;

            if (sessionAge >= SESSION_MAX_AGE_MS && idleTime >= IDLE_THRESHOLD_MS) {
              console.log('[WebSocket] Refreshing session (idle for', Math.round(idleTime / 1000), 's)...');
              wsRef.current.close();
            }
          }
        }, 60000);

        resolve(true);
      };

      ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        onServerEvent?.(event);
      };

      ws.onerror = () => {
        clearTimeout(timeoutId);
        console.log('[WebSocket] Error, connectedOnce:', connectedOnceRef.current);
        if (!connectedOnceRef.current) {
          hasRejectedRef.current = true;
          onStatusChange?.('error', 'Connection error');
          reject(new Error('Connection error'));
        }
      };

      ws.onclose = (e) => {
        clearTimeout(timeoutId);
        console.log('[WebSocket] Closed, code:', e.code, 'reason:', e.reason, 'intentional:', isIntentionalCloseRef.current, 'rejected:', hasRejectedRef.current);

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        if (sessionRefreshIntervalRef.current) {
          clearInterval(sessionRefreshIntervalRef.current);
          sessionRefreshIntervalRef.current = null;
        }

        onDisconnect?.();

        if (!isIntentionalCloseRef.current && !hasRejectedRef.current && apiKeyRef.current) {
          onStatusChange?.('connecting', 'Reconnecting...');
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[WebSocket] Auto-reconnecting...');
            connect(apiKeyRef.current).catch(() => {
              onStatusChange?.('error', 'Reconnect failed');
            });
          }, 1500);
        } else {
          onStatusChange?.('error', 'Disconnected');
        }
      };

      wsRef.current = ws;
    });
  }, [langA, langB, direction, voiceType, customInstruction, isVoiceMode, onStatusChange, onServerEvent, onDisconnect]);

  const disconnect = useCallback(() => {
    isIntentionalCloseRef.current = true;
    apiKeyRef.current = null;

    // Clear all timers
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (sessionRefreshIntervalRef.current) {
      clearInterval(sessionRefreshIntervalRef.current);
      sessionRefreshIntervalRef.current = null;
    }

    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const sendAudio = useCallback((base64Audio) => {
    lastActivityRef.current = Date.now(); // Track activity
    return send({ type: 'input_audio_buffer.append', audio: base64Audio });
  }, [send]);

  const commitAudio = useCallback(() => {
    return send({ type: 'input_audio_buffer.commit' });
  }, [send]);

  const requestResponse = useCallback(() => {
    return send({ type: 'response.create' });
  }, [send]);

  return {
    connect,
    disconnect,
    send,
    sendAudio,
    commitAudio,
    requestResponse,
    isConnected: () => wsRef.current?.readyState === WebSocket.OPEN,
  };
}
