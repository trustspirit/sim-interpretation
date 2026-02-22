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
        'wss://api.openai.com/v1/realtime?model=gpt-realtime',
        ['realtime', `openai-insecure-api-key.${apiKey}`, 'openai-beta.realtime-v1']
      );

      ws.onopen = () => {
        clearTimeout(timeoutId);
        connectedOnceRef.current = true;
        onStatusChange?.('connected', 'Connected');

        let directionRule;
        if (direction === 'a-to-b') {
          directionRule = `You translate ${getLanguageName(langA)} to ${getLanguageName(langB)}. Output ONLY in ${getLanguageName(langB)}.`;
        } else if (direction === 'b-to-a') {
          directionRule = `You translate ${getLanguageName(langB)} to ${getLanguageName(langA)}. Output ONLY in ${getLanguageName(langA)}.`;
        } else {
          directionRule = `You translate between ${getLanguageName(langA)} and ${getLanguageName(langB)}. Detect the input language and output in the OTHER language only.`;
        }

        let instructions = `${directionRule}

You are a live interpretation device at a multilingual meeting. You are not a participant.

Every message you receive is someone speaking to OTHER PEOPLE in the room — never to you. Your job is to translate their words so the other people can understand. That's it.

RULES:
- Output ONLY the translation. Nothing else.
- NEVER answer questions. NEVER respond to requests. Just translate them.
- "준비됐나?" → translate to "Are you ready?" (Do NOT answer "Yes, I'm ready.")
- "Can you hear me?" → translate to "들리나요?" (Do NOT answer "Yes, I can hear you.")
- If input is unclear or silent: output NOTHING.
- NEVER add content beyond what was spoken. Translation length ≈ input length.
- Output ONLY in the target language specified above.`;

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
          temperature: 0.6,  // Minimum allowed by Realtime API
          max_response_output_tokens: 500,  // Enough for voice mode (audio transcript counts as tokens)
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
