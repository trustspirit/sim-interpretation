import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Play,
  Square,
  Trash2,
  ArrowLeftRight,
  ChevronDown,
  Settings,
  X,
  Volume2
} from 'lucide-react';

// Language configuration
const languages = [
  { code: 'en', name: 'English', flag: 'EN' },
  { code: 'ko', name: 'Korean', flag: 'KO' },
  { code: 'ja', name: 'Japanese', flag: 'JA' },
  { code: 'zh', name: 'Chinese', flag: 'ZH' },
  { code: 'es', name: 'Spanish', flag: 'ES' },
  { code: 'fr', name: 'French', flag: 'FR' },
  { code: 'de', name: 'German', flag: 'DE' }
];

const languageNames = {
  en: 'English', ko: 'Korean', ja: 'Japanese',
  zh: 'Chinese', es: 'Spanish', fr: 'French', de: 'German'
};

// Audio wave component
function AudioWave({ isActive, audioLevel }) {
  const bars = 5;
  return (
    <div className="flex items-center gap-0.5 h-4">
      {[...Array(bars)].map((_, i) => {
        const baseHeight = isActive ? 0.3 + (audioLevel * 0.7) : 0.2;
        const delay = i * 0.1;
        const scale = isActive ? baseHeight + Math.sin(Date.now() / 150 + i) * 0.3 : 0.2;
        return (
          <div
            key={i}
            className="w-0.5 bg-emerald-500 rounded-full transition-all duration-75"
            style={{
              height: `${Math.max(4, scale * 16)}px`,
              opacity: isActive ? 0.8 + scale * 0.2 : 0.3
            }}
          />
        );
      })}
    </div>
  );
}

// Microphone settings popover
function MicrophonePopover({ isOpen, onClose, microphones, selectedMic, onSelectMic, anchorRef }) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute top-full right-0 mt-2 z-50 bg-codex-surface border border-codex-border rounded-lg shadow-2xl p-3 min-w-64 animate-in fade-in slide-in-from-top-2 duration-200"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-codex-muted uppercase tracking-wider">Input Device</span>
          <button onClick={onClose} className="text-codex-muted hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="space-y-1">
          {microphones.map((mic) => (
            <button
              key={mic.deviceId}
              onClick={() => { onSelectMic(mic.deviceId); onClose(); }}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-all ${
                selectedMic === mic.deviceId
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-codex-text hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2">
                <Mic size={14} className={selectedMic === mic.deviceId ? 'text-emerald-400' : 'text-codex-muted'} />
                <span className="truncate">{mic.label || `Microphone ${mic.index + 1}`}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// Language selector component
function LanguageSelector({ label, value, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedLang = languages.find(l => l.code === value);

  return (
    <div className="relative flex-1">
      <label className="block text-xs font-medium text-codex-muted mb-1.5 uppercase tracking-wider">{label}</label>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-2.5 bg-codex-surface border border-codex-border rounded-lg text-sm transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-codex-muted cursor-pointer'
        }`}
      >
        <span className="text-codex-text">{selectedLang?.name}</span>
        <ChevronDown size={16} className={`text-codex-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-codex-surface border border-codex-border rounded-lg shadow-xl overflow-hidden">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { onChange(lang.code); setIsOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  value === lang.code ? 'bg-emerald-500/20 text-emerald-400' : 'text-codex-text hover:bg-white/5'
                }`}
              >
                {lang.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Main App
export default function App() {
  // State
  const [status, setStatus] = useState('ready'); // ready, connecting, connected, listening, error
  const [statusText, setStatusText] = useState('Ready');
  const [inputLang, setInputLang] = useState('en');
  const [outputLang, setOutputLang] = useState('ko');
  const [isListening, setIsListening] = useState(false);
  const [microphones, setMicrophones] = useState([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [showMicSettings, setShowMicSettings] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [originalText, setOriginalText] = useState([]);
  const [translatedText, setTranslatedText] = useState([]);
  const [currentTranslation, setCurrentTranslation] = useState('');
  const [currentOriginal, setCurrentOriginal] = useState('');

  // Refs
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const animationIdRef = useRef(null);
  const pendingTranscriptionsRef = useRef([]);
  const micButtonRef = useRef(null);
  const currentTranslationRef = useRef('');

  // Sentence detection refs
  const isSpeakingRef = useRef(false);
  const silenceStartRef = useRef(null);
  const speechStartRef = useRef(null);
  const isListeningRef = useRef(false);

  // Constants
  const SILENCE_THRESHOLD = 0.05;
  const SILENCE_DURATION_MS = 600;
  const MIN_SPEECH_DURATION_MS = 500;

  // Load microphones
  useEffect(() => {
    async function loadMicrophones() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices
          .filter(d => d.kind === 'audioinput')
          .map((mic, index) => ({
            deviceId: mic.deviceId,
            label: mic.label,
            index
          }));

        setMicrophones(mics);
        if (mics.length > 0 && !selectedMic) {
          setSelectedMic(mics[0].deviceId);
        }
      } catch (error) {
        console.error('Microphone permission denied:', error);
        updateStatus('error', 'Microphone access required');
      }
    }
    loadMicrophones();
  }, []);

  // Update status
  const updateStatus = useCallback((state, text) => {
    setStatus(state);
    setStatusText(text);
  }, []);

  // Array buffer to base64
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Commit audio
  const commitAudio = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    }
  }, []);

  // Request translation
  const requestTranslation = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && pendingTranscriptionsRef.current.length > 0) {
      wsRef.current.send(JSON.stringify({ type: 'response.create' }));
      pendingTranscriptionsRef.current = [];
    }
  }, []);

  // Handle server events
  const handleServerEvent = useCallback((event) => {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        updateStatus('listening', 'Listening...');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript && event.transcript.trim()) {
          const text = event.transcript.trim();
          const hallucinations = ['구독과 좋아요 부탁드립니다', '좋아요와 구독 부탁드립니다', '....', '♪', '[음악]', '[박수]', '[웃음]'];
          const isHallucination = hallucinations.some(h => text === h || text.startsWith('♪')) || text.length < 2;

          if (!isHallucination) {
            setCurrentOriginal('');
            setOriginalText(prev => [...prev, text]);
            pendingTranscriptionsRef.current.push(text);
            if (pendingTranscriptionsRef.current.length >= 1) {
              requestTranslation();
            }
          }
        }
        break;

      case 'response.text.delta':
        if (event.delta) {
          currentTranslationRef.current += event.delta;
          setCurrentTranslation(currentTranslationRef.current);
        }
        break;

      case 'response.text.done':
      case 'response.done':
        if (currentTranslationRef.current) {
          setTranslatedText(prev => [...prev, currentTranslationRef.current]);
        }
        currentTranslationRef.current = '';
        setCurrentTranslation('');
        updateStatus('connected', 'Connected');
        break;

      case 'error':
        console.error('Server error:', event.error);
        updateStatus('error', `Error: ${event.error?.message || 'Unknown'}`);
        break;
    }
  }, [updateStatus, requestTranslation]);

  // Visualize and detect sentences
  const visualize = useCallback(() => {
    if (!analyserRef.current || !isListeningRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);

    let max = 0;
    for (let i = 0; i < bufferLength; i++) {
      const amplitude = Math.abs(dataArray[i] - 128);
      if (amplitude > max) max = amplitude;
    }
    const level = max / 128;
    setAudioLevel(level);

    const now = Date.now();

    if (level > SILENCE_THRESHOLD) {
      if (!isSpeakingRef.current) {
        isSpeakingRef.current = true;
        speechStartRef.current = now;
      }
      silenceStartRef.current = null;
    } else {
      if (isSpeakingRef.current) {
        if (!silenceStartRef.current) {
          silenceStartRef.current = now;
        } else if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
          const speechDuration = silenceStartRef.current - speechStartRef.current;
          isSpeakingRef.current = false;
          silenceStartRef.current = null;
          speechStartRef.current = null;

          if (speechDuration >= MIN_SPEECH_DURATION_MS) {
            commitAudio();
          }
        }
      }
    }

    animationIdRef.current = requestAnimationFrame(visualize);
  }, [commitAudio]);

  // Connect WebSocket
  const connectWebSocket = useCallback(() => {
    return new Promise((resolve, reject) => {
      const apiKey = window.electronAPI.getApiKey();
      if (!apiKey) {
        updateStatus('error', 'API Key not found');
        reject(new Error('API Key not found'));
        return;
      }

      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-realtime',
        ['realtime', `openai-insecure-api-key.${apiKey}`, 'openai-beta.realtime-v1']
      );

      ws.onopen = () => {
        updateStatus('connected', 'Connected');
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions: `You are a real-time translator.
The user is speaking in ${languageNames[inputLang]}.
Your task: Translate what the user says into ${languageNames[outputLang]}.
Rules:
- Output ONLY the ${languageNames[outputLang]} translation
- Do NOT include the original text
- Do NOT add explanations or notes
- Keep translations natural and fluent
- If the input is already in ${languageNames[outputLang]}, just output it as-is`,
            input_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
              language: inputLang
            },
            turn_detection: null
          }
        }));
        resolve(true);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerEvent(data);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateStatus('error', 'Connection error');
        reject(error);
      };

      ws.onclose = () => {
        if (isListening) {
          updateStatus('error', 'Disconnected');
        }
      };

      wsRef.current = ws;
    });
  }, [inputLang, outputLang, updateStatus, handleServerEvent, isListening]);

  // Start audio capture
  const startAudioCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedMic ? { exact: selectedMic } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      mediaStreamRef.current = stream;
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      await audioContextRef.current.audioWorklet.addModule('audio-processor.js');

      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const worklet = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
      worklet.port.onmessage = (event) => {
        const data = event.data;
        if (data.type === 'audio') {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const base64Audio = arrayBufferToBase64(data.buffer);
            wsRef.current.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64Audio
            }));
          }
        }
      };

      source.connect(worklet);
      audioWorkletNodeRef.current = worklet;

      return true;
    } catch (error) {
      console.error('Audio capture error:', error);
      updateStatus('error', 'Microphone access denied');
      return false;
    }
  }, [selectedMic, updateStatus]);

  // Start listening
  const startListening = async () => {
    updateStatus('connecting', 'Connecting...');

    try {
      await connectWebSocket();
      const audioStarted = await startAudioCapture();

      if (!audioStarted) {
        stopListening();
        return;
      }

      isListeningRef.current = true;
      setIsListening(true);
      updateStatus('connected', 'Speak now');
    } catch (error) {
      console.error('Start error:', error);
      stopListening();
    }
  };

  // Stop listening
  const stopListening = () => {
    isListeningRef.current = false;
    setIsListening(false);
    setAudioLevel(0);

    // Reset sentence detection
    isSpeakingRef.current = false;
    silenceStartRef.current = null;
    speechStartRef.current = null;
    pendingTranscriptionsRef.current = [];

    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }

    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    updateStatus('ready', 'Ready');
  };

  // Clear transcripts
  const clearTranscripts = () => {
    setOriginalText([]);
    setTranslatedText([]);
    setCurrentTranslation('');
    setCurrentOriginal('');
    currentTranslationRef.current = '';
  };

  // Switch languages
  const switchLanguages = () => {
    setInputLang(outputLang);
    setOutputLang(inputLang);
  };

  // Effect for visualization
  useEffect(() => {
    if (isListening && analyserRef.current) {
      animationIdRef.current = requestAnimationFrame(visualize);
    }
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [isListening, visualize]);

  // Status indicator color
  const getStatusColor = () => {
    switch (status) {
      case 'connected': return 'bg-emerald-500 shadow-emerald-500/50';
      case 'listening': return 'bg-amber-500 shadow-amber-500/50 animate-pulse';
      case 'connecting': return 'bg-amber-500 shadow-amber-500/50 animate-pulse';
      case 'error': return 'bg-red-500 shadow-red-500/50';
      default: return 'bg-codex-muted';
    }
  };

  return (
    <div className="min-h-screen bg-codex-bg text-codex-text flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-codex-border bg-codex-bg/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Volume2 size={18} className="text-white" />
          </div>
          <h1 className="text-lg font-semibold text-codex-text">Translator</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Audio Wave Indicator */}
          {isListening && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <AudioWave isActive={audioLevel > 0.05} audioLevel={audioLevel} />
              <span className="text-xs text-emerald-400">Live</span>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-codex-surface rounded-full border border-codex-border">
            <div className={`w-2 h-2 rounded-full shadow-lg ${getStatusColor()}`} />
            <span className="text-xs text-codex-muted">{statusText}</span>
          </div>

          {/* Microphone Settings */}
          <div className="relative" ref={micButtonRef}>
            <button
              onClick={() => setShowMicSettings(!showMicSettings)}
              disabled={isListening}
              className={`p-2 rounded-lg border transition-all ${
                showMicSettings
                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                  : 'bg-codex-surface border-codex-border text-codex-muted hover:text-white hover:border-codex-muted'
              } ${isListening ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Mic size={18} />
            </button>
            <MicrophonePopover
              isOpen={showMicSettings}
              onClose={() => setShowMicSettings(false)}
              microphones={microphones}
              selectedMic={selectedMic}
              onSelectMic={setSelectedMic}
              anchorRef={micButtonRef}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-6 py-4 overflow-hidden">
        {/* Language Selection */}
        <div className="flex items-end gap-3 mb-4">
          <LanguageSelector
            label="From"
            value={inputLang}
            onChange={setInputLang}
            disabled={isListening}
          />
          <button
            onClick={switchLanguages}
            disabled={isListening}
            className={`p-2.5 mb-0.5 rounded-lg bg-codex-surface border border-codex-border text-codex-muted transition-all ${
              isListening ? 'opacity-50 cursor-not-allowed' : 'hover:text-white hover:border-codex-muted hover:rotate-180'
            }`}
          >
            <ArrowLeftRight size={18} />
          </button>
          <LanguageSelector
            label="To"
            value={outputLang}
            onChange={setOutputLang}
            disabled={isListening}
          />
        </div>

        {/* Translation Display */}
        <div className="flex-1 flex flex-col min-h-0 mb-4">
          {/* Main Translation Area */}
          <div className="flex-1 bg-codex-surface border border-codex-border rounded-xl p-6 overflow-y-auto min-h-0">
            {translatedText.length === 0 && !currentTranslation ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-codex-muted text-center">
                  {isListening ? 'Speak now to translate...' : 'Press start to begin translating'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {translatedText.map((text, i) => (
                  <p key={i} className="text-xl leading-relaxed text-codex-text animate-fade-in">
                    {text}
                  </p>
                ))}
                {currentTranslation && (
                  <p className="text-xl leading-relaxed text-emerald-400 animate-pulse-subtle">
                    {currentTranslation}
                    <span className="inline-block w-0.5 h-5 bg-emerald-400 ml-0.5 animate-blink" />
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Original Text Subtitle */}
          <div className="mt-3 px-4 py-2 bg-codex-surface/50 border border-codex-border/50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-1 rounded-full bg-codex-muted" />
              <span className="text-[10px] text-codex-muted uppercase tracking-wider">Original</span>
            </div>
            <div className="text-sm text-codex-muted/70 max-h-12 overflow-y-auto">
              {originalText.length > 0 || currentOriginal ? (
                <span className="opacity-60">
                  {[...originalText.slice(-2), currentOriginal].filter(Boolean).join(' ')}
                </span>
              ) : (
                <span className="opacity-40 italic">Original speech will appear here...</span>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {!isListening ? (
            <button
              onClick={startListening}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 px-6 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-medium rounded-xl transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Play size={20} fill="currentColor" />
              <span>Start</span>
            </button>
          ) : (
            <button
              onClick={stopListening}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 px-6 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-medium rounded-xl transition-all shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Square size={18} fill="currentColor" />
              <span>Stop</span>
            </button>
          )}

          <button
            onClick={clearTranscripts}
            className="p-3.5 bg-codex-surface border border-codex-border text-codex-muted hover:text-white hover:border-codex-muted rounded-xl transition-all"
            title="Clear"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </main>
    </div>
  );
}
