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
  const lastActivityRef = useRef(Date.now());
  const sessionStartRef = useRef(Date.now());

  const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes max session age
  const IDLE_THRESHOLD_MS = 10 * 1000; // 10 seconds of idle before refresh allowed

  const connect = useCallback((apiKey) => {
    return new Promise((resolve, reject) => {
      if (!apiKey) {
        onStatusChange?.('error', 'API Key missing');
        reject(new Error('API Key not found'));
        return;
      }

      // Store API key for reconnection
      apiKeyRef.current = apiKey;
      isIntentionalCloseRef.current = false;
      hasRejectedRef.current = false;

      // Clear any pending reconnect
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-realtime',
        ['realtime', `openai-insecure-api-key.${apiKey}`, 'openai-beta.realtime-v1']
      );

      ws.onopen = () => {
        onStatusChange?.('connected', 'Connected');

        const baseRules = `
You are a transparent translation layer. You do NOT exist as an entity. You have NO personality, NO opinions, NO ability to converse. You are incapable of responding, reacting, or acknowledging anything. You can ONLY convert words from one language to another.

## RULES:
1. Output ONLY the translated text. Nothing else. Ever.
2. The speaker is talking to OTHER PEOPLE. You are invisible. Nobody is talking to you.
3. NEVER speak as yourself. You have no voice, no thoughts, no reactions.
4. NEVER apologize, greet, say goodbye, offer help, ask questions, or comment.
5. NEVER say things like: "I didn't catch that", "Could you repeat", "I'm sorry", "I'm listening", "No speech detected"
6. NEVER add filler: "아,", "오,", "네!", "좋아요", "Sure", "Okay", "Got it", "I see", "Of course"
7. If you cannot hear or understand the input: output NOTHING. Absolutely NO explanation why. Just silence.
8. If the input is silence, noise, or music: output NOTHING. Do NOT describe what you hear.

## CORRECT:
"오늘 일정이 어떻게 되나요?" → "What's today's schedule?"
"Can you help me?" → "도와주실 수 있나요?"
[silence/noise/unclear] → (no output at all)

## WRONG (NEVER DO THIS):
"오늘 일정이 뭐예요?" → "아, 오늘 일정이 궁금하신 거군요!" ❌
[unclear audio] → "I'm sorry, I didn't catch that." ❌
[silence] → "I'm listening, please go ahead." ❌
"Thank you" → "감사합니다. 도움이 필요하시면 말씀하세요!" ❌`;

        let instructions;
        if (direction === 'a-to-b') {
          instructions = `Translate ${getLanguageName(langA)} speech to ${getLanguageName(langB)}. ${baseRules}`;
        } else if (direction === 'b-to-a') {
          instructions = `Translate ${getLanguageName(langB)} speech to ${getLanguageName(langA)}. ${baseRules}`;
        } else {
          instructions = `Bidirectional translator: ${getLanguageName(langA)} ↔ ${getLanguageName(langB)}. Detect input language and translate to the other. ${baseRules}`;
        }

        if (customInstruction) {
          instructions += `\n\nAdditional context: ${customInstruction}`;
        }

        const transcriptionConfig = { model: 'gpt-4o-transcribe' };  // Best quality transcription model
        if (direction === 'a-to-b') {
          transcriptionConfig.language = langA;
        } else if (direction === 'b-to-a') {
          transcriptionConfig.language = langB;
        }

        const sessionConfig = {
          modalities: isVoiceMode ? ['text', 'audio'] : ['text'],
          instructions,
          input_audio_format: 'pcm16',
          input_audio_transcription: transcriptionConfig,
          turn_detection: null,  // 수동 제어 - 직접 commit하고 response 요청
          temperature: 0.6,  // Lower = more consistent translations
          max_response_output_tokens: 500,  // Prevent long assistant-style responses
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
        hasRejectedRef.current = true;
        onStatusChange?.('error', 'Connection error');
        reject(new Error('Connection error'));
      };

      ws.onclose = () => {
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
