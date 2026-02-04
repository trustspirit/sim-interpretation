import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  Play,
  Square,
  Trash2,
  ArrowLeftRight,
  ChevronDown,
  X,
  Circle,
  Type,
  ArrowDown,
  ArrowUp,
  Settings,
  Key,
  Eye,
  EyeOff
} from 'lucide-react';

// Language configuration
const languages = [
  { code: 'en', name: 'English' },
  { code: 'ko', name: 'Korean' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' }
];

const languageNames = {
  en: 'English', ko: 'Korean', ja: 'Japanese',
  zh: 'Chinese', es: 'Spanish', fr: 'French', de: 'German'
};

// Window controls component
function WindowControls() {
  const [isHovered, setIsHovered] = useState(false);

  const handleClose = () => window.electronAPI?.closeWindow?.();
  const handleMinimize = () => window.electronAPI?.minimizeWindow?.();
  const handleMaximize = () => window.electronAPI?.maximizeWindow?.();

  return (
    <div
      className="flex items-center gap-2 mr-4"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={handleClose}
        className={`w-3 h-3 rounded-full transition-all duration-150 ${
          isHovered ? 'bg-[#ff5f57]' : 'bg-codex-muted/50'
        }`}
      />
      <button
        onClick={handleMinimize}
        className={`w-3 h-3 rounded-full transition-all duration-150 ${
          isHovered ? 'bg-[#febc2e]' : 'bg-codex-muted/50'
        }`}
      />
      <button
        onClick={handleMaximize}
        className={`w-3 h-3 rounded-full transition-all duration-150 ${
          isHovered ? 'bg-[#28c840]' : 'bg-codex-muted/50'
        }`}
      />
    </div>
  );
}

// Audio wave component
function AudioWave({ isActive, audioLevel }) {
  const bars = 4;
  return (
    <div className="flex items-center gap-[2px] h-3">
      {[...Array(bars)].map((_, i) => {
        const scale = isActive ? 0.3 + audioLevel * 0.7 + Math.sin(Date.now() / 120 + i * 0.8) * 0.2 : 0.15;
        return (
          <div
            key={i}
            className="w-[2px] bg-codex-live rounded-full transition-all duration-75"
            style={{ height: `${Math.max(3, scale * 12)}px` }}
          />
        );
      })}
    </div>
  );
}

// Settings popover
function SettingsPopover({ 
  isOpen, onClose, microphones, selectedMic, onSelectMic,
  apiKey, onApiKeyChange, hasEnvKey, showApiKey, setShowApiKey,
  customInstruction, onCustomInstructionChange 
}) {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full right-0 mt-2 z-50 bg-codex-elevated border border-codex-border rounded-lg shadow-2xl p-3 w-80 animate-fade-in max-h-[80vh] overflow-y-auto">
        <div className="mb-4">
          <div className="flex items-center gap-2 px-1 py-1.5 mb-2">
            <Key size={14} className="text-codex-muted" />
            <span className="text-xs font-medium text-codex-muted uppercase tracking-wider">OpenAI API Key</span>
          </div>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={hasEnvKey ? 'Using .env file' : 'sk-...'}
              className="w-full px-3 py-2 pr-10 bg-codex-surface border border-codex-border rounded-lg text-sm text-codex-text placeholder-codex-muted/50 focus:outline-none focus:border-codex-border-hover"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-codex-muted hover:text-codex-text"
            >
              {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {hasEnvKey && !apiKey && (
            <p className="mt-1.5 text-2xs text-codex-muted">Using key from .env file</p>
          )}
        </div>

        <div className="h-px bg-codex-border mb-4" />

        <div className="mb-4">
          <div className="flex items-center gap-2 px-1 py-1.5 mb-2">
            <Mic size={14} className="text-codex-muted" />
            <span className="text-xs font-medium text-codex-muted uppercase tracking-wider">Microphone</span>
          </div>
          <div className="space-y-0.5">
            {microphones.map((mic) => (
              <button
                key={mic.deviceId}
                onClick={() => onSelectMic(mic.deviceId)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                  selectedMic === mic.deviceId
                    ? 'bg-white/10 text-codex-text'
                    : 'text-codex-text-secondary hover:bg-white/5'
                }`}
              >
                {mic.label || `Microphone ${mic.index + 1}`}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-codex-border mb-4" />

        <div>
          <div className="px-1 py-1.5 mb-2">
            <span className="text-xs font-medium text-codex-muted uppercase tracking-wider">Translation Instructions</span>
          </div>
          <textarea
            value={customInstruction}
            onChange={(e) => onCustomInstructionChange(e.target.value)}
            placeholder="Add context for better translations..."
            className="w-full h-24 px-3 py-2 bg-codex-surface border border-codex-border rounded-lg text-sm text-codex-text placeholder-codex-muted/50 resize-none focus:outline-none focus:border-codex-border-hover"
          />
        </div>
      </div>
    </>
  );
}

// Language selector
function LanguageSelector({ value, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = languages.find(l => l.code === value);

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-2 bg-codex-surface border border-codex-border rounded-lg text-sm transition-all ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-codex-elevated hover:border-codex-border cursor-pointer'
        }`}
      >
        <span className="text-codex-text">{selected?.name}</span>
        <ChevronDown size={14} className={`text-codex-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-codex-elevated border border-codex-border rounded-lg shadow-xl overflow-hidden min-w-32 animate-fade-in">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { onChange(lang.code); setIsOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  value === lang.code ? 'bg-white/10 text-codex-text' : 'text-codex-text-secondary hover:bg-white/5'
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
  const [status, setStatus] = useState('ready');
  const [statusText, setStatusText] = useState('Ready');
  const [langA, setLangA] = useState('en');
  const [langB, setLangB] = useState('ko');
  const [isListening, setIsListening] = useState(false);
  const [microphones, setMicrophones] = useState([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('translatorApiKey') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [customInstruction, setCustomInstruction] = useState(() => localStorage.getItem('translatorInstruction') || '');
  const envApiKey = window.electronAPI?.getApiKey?.() || '';
  const [audioLevel, setAudioLevel] = useState(0);
  const [originalText, setOriginalText] = useState([]);
  const [translatedText, setTranslatedText] = useState([]);
  const [currentTranslation, setCurrentTranslation] = useState('');
  const [fontSize, setFontSize] = useState(2); // 0: small, 1: medium, 2: large, 3: x-large
  const [textDirection, setTextDirection] = useState('down'); // 'down': top to bottom, 'up': bottom to top

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioWorkletNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const animationIdRef = useRef(null);
  const pendingTranscriptionsRef = useRef([]);
  const micButtonRef = useRef(null);
  const currentTranslationRef = useRef('');

  const isSpeakingRef = useRef(false);
  const silenceStartRef = useRef(null);
  const speechStartRef = useRef(null);
  const isListeningRef = useRef(false);
  const scrollRef = useRef(null);

  const SILENCE_THRESHOLD = 0.05;
  const SILENCE_DURATION_MS = 600;
  const MIN_SPEECH_DURATION_MS = 500;

  useEffect(() => {
    async function loadMicrophones() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices
          .filter(d => d.kind === 'audioinput')
          .map((mic, index) => ({ deviceId: mic.deviceId, label: mic.label, index }));
        setMicrophones(mics);
        if (mics.length > 0 && !selectedMic) setSelectedMic(mics[0].deviceId);
      } catch (error) {
        updateStatus('error', 'Mic access required');
      }
    }
    loadMicrophones();
  }, []);

  const updateStatus = useCallback((state, text) => {
    setStatus(state);
    setStatusText(text);
  }, []);

  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const commitAudio = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    }
  }, []);

  const requestTranslation = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && pendingTranscriptionsRef.current.length > 0) {
      wsRef.current.send(JSON.stringify({ type: 'response.create' }));
      pendingTranscriptionsRef.current = [];
    }
  }, []);

  const handleServerEvent = useCallback((event) => {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        updateStatus('listening', 'Listening...');
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript?.trim()) {
          const text = event.transcript.trim();
          const hallucinations = [
            '구독과 좋아요 부탁드립니다',
            '좋아요와 구독 부탁드립니다',
            '오늘도 시청해주셔서 감사합니다',
            '오늘도 시청해 주셔서 감사합니다',
            '시청해주셔서 감사합니다',
            '시청해 주셔서 감사합니다',
            '감사합니다',
            '....', '...', '♪', '[음악]', '[박수]', '[웃음]',
            'Thank you for watching',
            'Thanks for watching'
          ];
          const isHallucination = hallucinations.some(h =>
            text === h || text.includes(h) || text.startsWith('♪')
          ) || text.length < 3;
          if (!isHallucination) {
            setOriginalText(prev => [...prev, text]);
            pendingTranscriptionsRef.current.push(text);
            if (pendingTranscriptionsRef.current.length >= 1) requestTranslation();
          }
        }
        break;
      case 'response.text.delta':
        if (event.delta) {
          currentTranslationRef.current += event.delta;
          setCurrentTranslation(prev => prev + event.delta);
        }
        break;
      case 'response.text.done':
        if (currentTranslationRef.current) {
          const finalText = currentTranslationRef.current;
          console.log('Adding to translated:', finalText);
          setTranslatedText(prev => {
            console.log('Previous translations:', prev);
            return [...prev, finalText];
          });
          currentTranslationRef.current = '';
          setCurrentTranslation('');
        }
        updateStatus('connected', 'Connected');
        break;
      case 'response.done':
        updateStatus('connected', 'Connected');
        break;
      case 'error':
        updateStatus('error', event.error?.message || 'Error');
        break;
    }
  }, [updateStatus, requestTranslation]);

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
    } else if (isSpeakingRef.current) {
      if (!silenceStartRef.current) {
        silenceStartRef.current = now;
      } else if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
        const speechDuration = silenceStartRef.current - speechStartRef.current;
        isSpeakingRef.current = false;
        silenceStartRef.current = null;
        speechStartRef.current = null;
        if (speechDuration >= MIN_SPEECH_DURATION_MS) commitAudio();
      }
    }
    animationIdRef.current = requestAnimationFrame(visualize);
  }, [commitAudio]);

  const connectWebSocket = useCallback(() => {
    return new Promise((resolve, reject) => {
      const key = apiKey || envApiKey;
      if (!key) {
        updateStatus('error', 'API Key missing');
        reject(new Error('API Key not found'));
        return;
      }
      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-realtime',
        ['realtime', `openai-insecure-api-key.${key}`, 'openai-beta.realtime-v1']
      );
      ws.onopen = () => {
        updateStatus('connected', 'Connected');
        let instructions = `You are a real-time bidirectional translator between ${languageNames[langA]} and ${languageNames[langB]}. When you receive ${languageNames[langA]} text, translate to ${languageNames[langB]}. When you receive ${languageNames[langB]} text, translate to ${languageNames[langA]}. Output ONLY the translation, nothing else.`;
        if (customInstruction) {
          instructions += `\n\nAdditional context: ${customInstruction}`;
        }
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions,
            input_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: null
          }
        }));
        resolve(true);
      };
      ws.onmessage = (e) => handleServerEvent(JSON.parse(e.data));
      ws.onerror = () => { updateStatus('error', 'Connection error'); reject(); };
      ws.onclose = () => { if (isListening) updateStatus('error', 'Disconnected'); };
      wsRef.current = ws;
    });
  }, [langA, langB, apiKey, envApiKey, customInstruction, updateStatus, handleServerEvent, isListening]);

  const startAudioCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedMic ? { exact: selectedMic } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
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
        if (event.data.type === 'audio' && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: arrayBufferToBase64(event.data.buffer) }));
        }
      };
      source.connect(worklet);
      audioWorkletNodeRef.current = worklet;
      return true;
    } catch {
      updateStatus('error', 'Mic access denied');
      return false;
    }
  }, [selectedMic, updateStatus]);

  const startListening = async () => {
    updateStatus('connecting', 'Connecting...');
    try {
      await connectWebSocket();
      const audioStarted = await startAudioCapture();
      if (!audioStarted) { stopListening(); return; }
      isListeningRef.current = true;
      setIsListening(true);
      updateStatus('connected', 'Speak now');
    } catch { stopListening(); }
  };

  const stopListening = () => {
    isListeningRef.current = false;
    setIsListening(false);
    setAudioLevel(0);
    isSpeakingRef.current = false;
    silenceStartRef.current = null;
    speechStartRef.current = null;
    pendingTranscriptionsRef.current = [];
    if (animationIdRef.current) { cancelAnimationFrame(animationIdRef.current); animationIdRef.current = null; }
    audioWorkletNodeRef.current?.disconnect();
    analyserRef.current?.disconnect();
    audioContextRef.current?.close();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    wsRef.current?.close();
    audioWorkletNodeRef.current = null;
    analyserRef.current = null;
    audioContextRef.current = null;
    mediaStreamRef.current = null;
    wsRef.current = null;
    updateStatus('ready', 'Ready');
  };

  const clearTranscripts = () => {
    setOriginalText([]);
    setTranslatedText([]);
    setCurrentTranslation('');
    currentTranslationRef.current = '';
  };

  const switchLanguages = () => {
    setLangA(langB);
    setLangB(langA);
  };

  const handleApiKeyChange = (value) => {
    setApiKey(value);
    localStorage.setItem('translatorApiKey', value);
  };

  const handleInstructionChange = (value) => {
    setCustomInstruction(value);
    localStorage.setItem('translatorInstruction', value);
  };

  const increaseFontSize = () => {
    if (fontSize < 3) setFontSize(fontSize + 1);
  };

  const decreaseFontSize = () => {
    if (fontSize > 0) setFontSize(fontSize - 1);
  };

  const getFontSizeClasses = () => {
    const sizes = {
      current: ['text-2xl', 'text-3xl', 'text-4xl', 'text-5xl'],
      previous: ['text-xl', 'text-2xl', 'text-3xl', 'text-4xl'],
      cursor: ['h-6', 'h-8', 'h-10', 'h-12']
    };
    return {
      current: sizes.current[fontSize],
      previous: sizes.previous[fontSize],
      cursor: sizes.cursor[fontSize]
    };
  };

  const toggleTextDirection = () => {
    setTextDirection(prev => prev === 'down' ? 'up' : 'down');
  };

  // Keep current text centered by scrolling
  useEffect(() => {
    if (scrollRef.current) {
      if (textDirection === 'down') {
        // Scroll to bottom for top-to-bottom flow
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      } else {
        // Scroll to top for bottom-to-top flow
        scrollRef.current.scrollTop = 0;
      }
    }
  }, [translatedText, currentTranslation, textDirection]);

  useEffect(() => {
    if (isListening && analyserRef.current) {
      animationIdRef.current = requestAnimationFrame(visualize);
    }
    return () => { if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current); };
  }, [isListening, visualize]);

  return (
    <div className="h-screen bg-codex-bg text-codex-text flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-codex-border bg-codex-bg drag-region">
        <div className="flex items-center no-drag">
          <WindowControls />
          <span className="text-sm font-medium text-codex-text">Translator</span>
        </div>
        <div className="flex items-center gap-3 no-drag">
          {isListening && (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-codex-live/10 border border-codex-live/20 rounded-full">
              <AudioWave isActive={audioLevel > 0.05} audioLevel={audioLevel} />
              <span className="text-xs text-codex-live">Live</span>
            </div>
          )}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors ${
            status === 'connected' || status === 'listening' ? 'bg-emerald-500/15' :
            status === 'connecting' ? 'bg-amber-500/15' :
            status === 'error' ? 'bg-red-500/15' : ''
          }`}>
            <Circle
              size={6}
              className={`transition-colors ${
                status === 'connected' || status === 'listening' ? 'fill-emerald-400 text-emerald-400' :
                status === 'connecting' ? 'fill-amber-400 text-amber-400 animate-pulse' :
                status === 'error' ? 'fill-red-400 text-red-400' :
                'fill-codex-muted text-codex-muted'
              }`}
            />
            <span className={`text-xs transition-colors ${
              status === 'connected' || status === 'listening' ? 'text-emerald-400' :
              status === 'connecting' ? 'text-amber-400' :
              status === 'error' ? 'text-red-400' :
              'text-codex-text-secondary'
            }`}>{statusText}</span>
          </div>
          <div className="relative" ref={micButtonRef}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              disabled={isListening}
              className={`p-1.5 rounded-md transition-colors ${
                isListening ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5'
              } ${showSettings ? 'bg-white/10' : ''}`}
            >
              <Settings size={16} className="text-codex-text-secondary" />
            </button>
            <SettingsPopover
              isOpen={showSettings}
              onClose={() => setShowSettings(false)}
              microphones={microphones}
              selectedMic={selectedMic}
              onSelectMic={setSelectedMic}
              apiKey={apiKey}
              onApiKeyChange={handleApiKeyChange}
              hasEnvKey={!!envApiKey}
              showApiKey={showApiKey}
              setShowApiKey={setShowApiKey}
              customInstruction={customInstruction}
              onCustomInstructionChange={handleInstructionChange}
            />
          </div>
        </div>
      </header>

      {/* Language Bar */}
      <div className="flex items-center justify-center gap-3 px-4 py-3 border-b border-codex-border-subtle">
        <LanguageSelector value={langA} onChange={setLangA} disabled={isListening} />
        <button
          onClick={switchLanguages}
          disabled={isListening}
          className={`p-1.5 rounded-md transition-all ${
            isListening ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5 active:scale-95'
          }`}
        >
          <ArrowLeftRight size={16} className="text-codex-muted" />
        </button>
        <LanguageSelector value={langB} onChange={setLangB} disabled={isListening} />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 p-4">
        {/* Translation Display - Teleprompter Style */}
        <div className="flex-1 flex flex-col min-h-0 mb-4">
          <div ref={scrollRef} className="flex-1 bg-codex-surface border border-codex-border rounded-xl p-8 overflow-y-auto flex flex-col">
            {translatedText.length === 0 && !currentTranslation ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-codex-muted text-base">
                  {isListening ? 'Listening...' : 'Press Start to begin'}
                </p>
              </div>
            ) : textDirection === 'down' ? (
              <>
                {/* Top-to-bottom flow: Spacer at top */}
                <div className="flex-1 min-h-0" />
                
                <div className="space-y-6 text-center">
                  {/* All previous translations - scrollable */}
                  {translatedText.map((text, i, arr) => {
                    const isLast = i === arr.length - 1 && !currentTranslation;
                    const opacity = isLast ? 1 : 0.4 + (i / arr.length) * 0.4;
                    const fontClasses = getFontSizeClasses();
                    return (
                      <p
                        key={i}
                        className={`leading-relaxed transition-all duration-300 ${
                          isLast ? `${fontClasses.current} font-semibold text-codex-text` : `${fontClasses.previous} text-codex-text`
                        }`}
                        style={{ opacity }}
                      >
                        {text}
                      </p>
                    );
                  })}
                  {/* Current streaming translation */}
                  {currentTranslation && (
                    <p className={`${getFontSizeClasses().current} font-semibold leading-relaxed text-codex-text`}>
                      {currentTranslation}
                      <span className={`inline-block w-[4px] ${getFontSizeClasses().cursor} bg-codex-live ml-1.5 animate-blink`} />
                    </p>
                  )}
                </div>
                
                {/* Spacer to center content */}
                <div className="flex-1 min-h-0" />
              </>
            ) : (
              <>
                {/* Bottom-to-top flow: Spacer at bottom */}
                <div className="flex-1 min-h-0" />
                
                <div className="space-y-6 text-center">
                  {/* Current streaming translation at top */}
                  {currentTranslation && (
                    <p className={`${getFontSizeClasses().current} font-semibold leading-relaxed text-codex-text`}>
                      {currentTranslation}
                      <span className={`inline-block w-[4px] ${getFontSizeClasses().cursor} bg-codex-live ml-1.5 animate-blink`} />
                    </p>
                  )}
                  {/* All previous translations in reverse order */}
                  {[...translatedText].reverse().map((text, i, arr) => {
                    const isFirst = i === 0 && !currentTranslation;
                    const opacity = isFirst ? 1 : 0.4 + ((arr.length - i) / arr.length) * 0.4;
                    const fontClasses = getFontSizeClasses();
                    return (
                      <p
                        key={translatedText.length - 1 - i}
                        className={`leading-relaxed transition-all duration-300 ${
                          isFirst ? `${fontClasses.current} font-semibold text-codex-text` : `${fontClasses.previous} text-codex-text`
                        }`}
                        style={{ opacity }}
                      >
                        {text}
                      </p>
                    );
                  })}
                </div>
                
                {/* Spacer at bottom */}
                <div className="flex-1 min-h-0" />
              </>
            )}
          </div>

          {/* Original Text - Subtitle style */}
          <div className="mt-4 text-center">
            <p className="text-base text-codex-text-secondary/80 italic">
              {originalText.length > 0 ? `"${originalText.slice(-1)[0]}"` : ''}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {!isListening ? (
            <button
              onClick={startListening}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white text-black font-medium rounded-lg transition-all hover:bg-white/90 active:scale-[0.98]"
            >
              <Play size={16} fill="currentColor" />
              <span>Start</span>
            </button>
          ) : (
            <button
              onClick={stopListening}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-codex-error/90 text-white font-medium rounded-lg transition-all hover:bg-codex-error active:scale-[0.98]"
            >
              <Square size={14} fill="currentColor" />
              <span>Stop</span>
            </button>
          )}
          <div className="flex items-center gap-1 bg-codex-surface border border-codex-border rounded-lg">
            <button
              onClick={decreaseFontSize}
              disabled={fontSize === 0}
              className={`p-2.5 text-codex-muted hover:text-codex-text transition-colors rounded-l-lg ${
                fontSize === 0 ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title="Decrease font size"
            >
              <Type size={14} />
            </button>
            <div className="w-px h-4 bg-codex-border" />
            <button
              onClick={increaseFontSize}
              disabled={fontSize === 3}
              className={`p-2.5 text-codex-muted hover:text-codex-text transition-colors rounded-r-lg ${
                fontSize === 3 ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title="Increase font size"
            >
              <Type size={18} />
            </button>
          </div>
          <button
            onClick={toggleTextDirection}
            className="p-2.5 bg-codex-surface border border-codex-border text-codex-muted hover:text-codex-text hover:bg-codex-elevated rounded-lg transition-colors"
            title={textDirection === 'down' ? 'Top to bottom' : 'Bottom to top'}
          >
            {textDirection === 'down' ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
          </button>
          <button
            onClick={clearTranscripts}
            className="p-2.5 bg-codex-surface border border-codex-border text-codex-muted hover:text-codex-text hover:bg-codex-elevated rounded-lg transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </main>
    </div>
  );
}
