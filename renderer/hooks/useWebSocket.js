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
}) {
  const wsRef = useRef(null);

  const connect = useCallback((apiKey) => {
    return new Promise((resolve, reject) => {
      if (!apiKey) {
        onStatusChange?.('error', 'API Key missing');
        reject(new Error('API Key not found'));
        return;
      }

      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-realtime',
        ['realtime', `openai-insecure-api-key.${apiKey}`, 'openai-beta.realtime-v1']
      );

      ws.onopen = () => {
        onStatusChange?.('connected', 'Connected');

        const baseRules = `
CRITICAL RULES:
- You are ONLY a translator. You are NOT an assistant.
- Output ONLY the direct translation of the input speech.
- NEVER greet, introduce yourself, or say "Hello".
- NEVER ask questions or offer help.
- NEVER add comments, explanations, or any extra text.
- If the input is unclear or empty, output NOTHING (stay silent).
- Do NOT respond to the content - just translate it literally.`;

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

        const transcriptionConfig = { model: 'whisper-1' };
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
          turn_detection: null  // 수동 제어 - 직접 commit하고 response 요청
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

        resolve(true);
      };

      ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        onServerEvent?.(event);
      };

      ws.onerror = () => {
        onStatusChange?.('error', 'Connection error');
        reject(new Error('Connection error'));
      };

      ws.onclose = () => {
        onStatusChange?.('error', 'Disconnected');
      };

      wsRef.current = ws;
    });
  }, [langA, langB, direction, voiceType, customInstruction, isVoiceMode, onStatusChange, onServerEvent]);

  const disconnect = useCallback(() => {
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
