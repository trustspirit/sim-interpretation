import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
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
  PanelTop,
  Maximize2,
  Volume2,
  VolumeX,
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

// Voice selector for TTS
const voiceOptions = [
  { code: 'alloy', name: 'Alloy', desc: 'Neutral' },
  { code: 'echo', name: 'Echo', desc: 'Male' },
  { code: 'fable', name: 'Fable', desc: 'British' },
  { code: 'onyx', name: 'Onyx', desc: 'Deep male' },
  { code: 'nova', name: 'Nova', desc: 'Female' },
  { code: 'shimmer', name: 'Shimmer', desc: 'Soft female' },
];

function VoiceSelector({ value, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = voiceOptions.find(v => v.code === value) || voiceOptions[4];

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'
        } bg-codex-surface border border-codex-border`}
      >
        <Volume2 size={12} className="text-codex-muted" />
        <span className="text-codex-text">{selected.name}</span>
        <ChevronDown size={10} className={`text-codex-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full right-0 mb-1 z-50 bg-codex-elevated border border-codex-border rounded-lg shadow-xl overflow-hidden min-w-32">
            {voiceOptions.map((voice) => (
              <button
                key={voice.code}
                onClick={() => {
                  onChange(voice.code);
                  localStorage.setItem('translatorVoice', voice.code);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  value === voice.code ? 'bg-white/10 text-codex-text' : 'text-codex-text-secondary hover:bg-white/5'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span>{voice.name}</span>
                  <span className="text-[10px] text-codex-muted">{voice.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Speed selector for TTS
const speedOptions = [
  { value: 0.5, label: '0.5x', desc: 'Slow' },
  { value: 0.75, label: '0.75x', desc: '' },
  { value: 1.0, label: '1x', desc: 'Normal' },
  { value: 1.25, label: '1.25x', desc: '' },
  { value: 1.5, label: '1.5x', desc: 'Fast' },
  { value: 2.0, label: '2x', desc: 'Very fast' },
];

function SpeedSelector({ value, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = speedOptions.find(s => s.value === value) || speedOptions[2];

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'
        } bg-codex-surface border border-codex-border`}
      >
        <span className="text-codex-text">{selected.label}</span>
        <ChevronDown size={10} className={`text-codex-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full right-0 mb-1 z-50 bg-codex-elevated border border-codex-border rounded-lg shadow-xl overflow-hidden min-w-20">
            {speedOptions.map((speed) => (
              <button
                key={speed.value}
                onClick={() => {
                  onChange(speed.value);
                  localStorage.setItem('translatorVoiceSpeed', speed.value.toString());
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  value === speed.value ? 'bg-white/10 text-codex-text' : 'text-codex-text-secondary hover:bg-white/5'
                }`}
              >
                <div className="flex justify-between items-center gap-2">
                  <span>{speed.label}</span>
                  {speed.desc && <span className="text-[10px] text-codex-muted">{speed.desc}</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Direction selector (auto ↔, A→B, B←A)
function DirectionSelector({ value, onChange, disabled, langA, langB }) {
  const [isOpen, setIsOpen] = useState(false);

  const options = [
    { code: 'auto', label: 'Auto', icon: '↔', desc: 'Auto-detect language' },
    { code: 'a-to-b', label: `${languageNames[langA]} → ${languageNames[langB]}`, icon: '→', desc: `Speak ${languageNames[langA]}` },
    { code: 'b-to-a', label: `${languageNames[langB]} → ${languageNames[langA]}`, icon: '←', desc: `Speak ${languageNames[langB]}` },
  ];
  const selected = options.find(o => o.code === value) || options[0];

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        title={selected.desc}
        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'
        } ${value !== 'auto' ? 'bg-codex-live/10 border border-codex-live/30' : 'bg-white/5'}`}
      >
        <span className={`text-lg font-medium transition-colors ${value !== 'auto' ? 'text-codex-live' : 'text-codex-muted'}`}>
          {selected.icon}
        </span>
      </button>
      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full mt-1 z-50 flex justify-center" style={{ left: '50%', transform: 'translateX(-50%)' }}>
            <div className="bg-codex-elevated border border-codex-border rounded-lg shadow-xl overflow-hidden min-w-48">
              {options.map((opt) => (
                <button
                  key={opt.code}
                  onClick={() => {
                    onChange(opt.code);
                    localStorage.setItem('translatorDirection', opt.code);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    value === opt.code ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-base ${value === opt.code ? 'text-codex-live' : 'text-codex-muted'}`}>{opt.icon}</span>
                    <div>
                      <div className={`text-sm ${value === opt.code ? 'text-codex-text' : 'text-codex-text-secondary'}`}>{opt.label}</div>
                      <div className="text-[10px] text-codex-muted">{opt.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
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
  const [selectedMic, setSelectedMic] = useState(() => localStorage.getItem('translatorMic') || '');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('translatorApiKey') || '');
  const [customInstruction, setCustomInstruction] = useState(() => localStorage.getItem('translatorInstruction') || '');
  const envApiKey = window.electronAPI?.getApiKey?.() || '';
  const [audioLevel, setAudioLevel] = useState(0);
  const [originalText, setOriginalText] = useState([]);
  const [translatedText, setTranslatedText] = useState([]);
  const [currentTranslation, setCurrentTranslation] = useState('');
  const [fontSize, setFontSize] = useState(2); // 0: small, 1: medium, 2: large, 3: x-large, 4: xx-large, 5: xxx-large
  const [textDirection, setTextDirection] = useState('down'); // 'down': top to bottom, 'up': bottom to top
  const [isSubtitleMode, setIsSubtitleMode] = useState(false);
  const [subtitlePosition, setSubtitlePosition] = useState(() => localStorage.getItem('translatorSubtitlePosition') || 'bottom');
  const [subtitleHovered, setSubtitleHovered] = useState(false);
  const [direction, setDirection] = useState(() => localStorage.getItem('translatorDirection') || 'auto');
  const [subtitleQueue, setSubtitleQueue] = useState([]);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceType, setVoiceType] = useState(() => localStorage.getItem('translatorVoice') || 'nova');
  const [voiceSpeed, setVoiceSpeed] = useState(() => parseFloat(localStorage.getItem('translatorVoiceSpeed')) || 1.0);
  const [isSpeakingTTS, setIsSpeakingTTS] = useState(false);
  const [voiceOnlyMode, setVoiceOnlyMode] = useState(() => localStorage.getItem('translatorVoiceOnly') === 'true');

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
  const subtitleTimerRef = useRef(null);
  const subtitleQueueRef = useRef([]);
  const lastProcessedIndexRef = useRef(-1);
  const ttsQueueRef = useRef([]);
  const ttsAudioRef = useRef(null);
  const isPlayingTTSRef = useRef(false);
  const lastTTSIndexRef = useRef(-1);
  const isProcessingQueueRef = useRef(false);
  const subtitleContainerRef = useRef(null);
  const [maxCharsPerLine, setMaxCharsPerLine] = useState(50);

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

    const handleSettingsClosed = () => {
      setApiKey(localStorage.getItem('translatorApiKey') || '');
      setCustomInstruction(localStorage.getItem('translatorInstruction') || '');
      setSelectedMic(localStorage.getItem('translatorMic') || '');
      setSubtitlePosition(localStorage.getItem('translatorSubtitlePosition') || 'bottom');
      setDirection(localStorage.getItem('translatorDirection') || 'auto');
    };
    window.electronAPI?.onSettingsClosed?.(handleSettingsClosed);
    
    // Check if we're already in subtitle mode
    window.electronAPI?.getSubtitleMode?.().then(mode => {
      setIsSubtitleMode(mode || false);
    });
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
        let instructions;
        if (direction === 'a-to-b') {
          instructions = `You are a real-time translator. Translate ${languageNames[langA]} to ${languageNames[langB]}. Output ONLY the direct translation. NEVER add comments, questions, explanations, or any additional text. Do not ask questions. Do not offer help. Just translate.`;
        } else if (direction === 'b-to-a') {
          instructions = `You are a real-time translator. Translate ${languageNames[langB]} to ${languageNames[langA]}. Output ONLY the direct translation. NEVER add comments, questions, explanations, or any additional text. Do not ask questions. Do not offer help. Just translate.`;
        } else {
          instructions = `You are a real-time bidirectional translator between ${languageNames[langA]} and ${languageNames[langB]}. When you receive ${languageNames[langA]} text, translate to ${languageNames[langB]}. When you receive ${languageNames[langB]} text, translate to ${languageNames[langA]}. Output ONLY the direct translation. NEVER add comments, questions, explanations, or any additional text. Do not ask questions. Do not offer help. Just translate.`;
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
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions,
            input_audio_format: 'pcm16',
            input_audio_transcription: transcriptionConfig,
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
  }, [langA, langB, apiKey, envApiKey, customInstruction, direction, updateStatus, handleServerEvent, isListening]);

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

  const openSettings = () => {
    window.electronAPI?.openSettings?.();
  };

  const increaseFontSize = () => {
    if (fontSize < 5) setFontSize(fontSize + 1);
  };

  const decreaseFontSize = () => {
    if (fontSize > 0) setFontSize(fontSize - 1);
  };

  const getFontSizeClasses = () => {
    const sizes = {
      current: ['text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl'],
      previous: ['text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl'],
      cursor: ['h-6', 'h-8', 'h-10', 'h-12', 'h-14', 'h-16']
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

  const toggleSubtitleMode = async () => {
    const position = localStorage.getItem('translatorSubtitlePosition') || 'bottom';
    const result = await window.electronAPI?.toggleSubtitleMode?.(position);
    if (result?.success) {
      setIsSubtitleMode(result.isSubtitleMode);
    }
  };

  const toggleSubtitlePosition = async () => {
    const newPosition = subtitlePosition === 'bottom' ? 'top' : 'bottom';
    setSubtitlePosition(newPosition);
    localStorage.setItem('translatorSubtitlePosition', newPosition);
    await window.electronAPI?.updateSubtitlePosition?.(newPosition);
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

  // Calculate max characters per line based on container width and font size
  useEffect(() => {
    if (!isSubtitleMode || !subtitleContainerRef.current) return;

    const calculateMaxChars = () => {
      const container = subtitleContainerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth - 64; // px-8 = 32px * 2
      const containerHeight = container.clientHeight;

      // Font size is clamp(24px, 35vh, 120px)
      const fontSize = Math.min(120, Math.max(24, containerHeight * 0.35));

      // Approximate character width (varies by language, use conservative estimate)
      // For mixed content, assume average ~0.6em per character
      const avgCharWidth = fontSize * 0.6;
      const maxChars = Math.floor(containerWidth / avgCharWidth);

      setMaxCharsPerLine(Math.max(10, maxChars));
    };

    calculateMaxChars();

    const resizeObserver = new ResizeObserver(calculateMaxChars);
    resizeObserver.observe(subtitleContainerRef.current);

    return () => resizeObserver.disconnect();
  }, [isSubtitleMode]);

  // Subtitle queue processing
  const splitTextIntoChunks = useCallback((text, maxChars) => {
    if (!text || text.length <= maxChars) return [text];

    const chunks = [];
    // First, try to split by sentences
    const sentences = text.split(/(?<=[.!?。！？])\s*/);

    for (const sentence of sentences) {
      if (sentence.length <= maxChars) {
        chunks.push(sentence);
      } else {
        // Split long sentences by commas or natural breaks
        const parts = sentence.split(/(?<=[,，、;；])\s*/);
        let current = '';
        for (const part of parts) {
          if ((current + part).length <= maxChars) {
            current += (current ? ' ' : '') + part;
          } else {
            if (current) chunks.push(current);
            // If single part is still too long, force split by character count
            if (part.length > maxChars) {
              const words = part.split(/\s+/);
              current = '';
              for (const word of words) {
                if ((current + ' ' + word).length <= maxChars) {
                  current += (current ? ' ' : '') + word;
                } else {
                  if (current) chunks.push(current);
                  current = word;
                }
              }
            } else {
              current = part;
            }
          }
        }
        if (current) chunks.push(current);
      }
    }
    return chunks.filter(c => c.trim());
  }, []);

  // Start processing the subtitle queue - reads from queue dynamically
  const startQueueProcessing = useCallback(() => {
    if (isProcessingQueueRef.current) return;
    if (subtitleQueueRef.current.length === 0) return;

    isProcessingQueueRef.current = true;

    const showNextChunk = () => {
      if (subtitleQueueRef.current.length === 0) {
        isProcessingQueueRef.current = false;
        subtitleTimerRef.current = null;
        return;
      }

      const chunk = subtitleQueueRef.current.shift();
      setSubtitleQueue([...subtitleQueueRef.current]);

      // 짧은 문장은 빠르게, 긴 문장은 적당히
      const displayTime = Math.max(1200, 800 + chunk.length * 70);
      setCurrentSubtitle(chunk);

      subtitleTimerRef.current = setTimeout(showNextChunk, displayTime);
    };

    showNextChunk();
  }, []);

  // Process new translations into subtitle queue
  useEffect(() => {
    if (!isSubtitleMode) return;

    // Skip streaming updates in subtitle mode - only show completed translations via queue
    if (currentTranslation) {
      return;
    }

    // Process completed translations
    const latestIndex = translatedText.length - 1;
    if (latestIndex < 0 || latestIndex <= lastProcessedIndexRef.current) return;

    const newText = translatedText[latestIndex];
    lastProcessedIndexRef.current = latestIndex;

    const chunks = splitTextIntoChunks(newText, maxCharsPerLine);

    // ADD to existing queue instead of replacing
    subtitleQueueRef.current = [...subtitleQueueRef.current, ...chunks];
    setSubtitleQueue([...subtitleQueueRef.current]);

    // Start processing if not already running
    if (!isProcessingQueueRef.current) {
      setTimeout(() => startQueueProcessing(), 50);
    }
  }, [isSubtitleMode, translatedText, currentTranslation, splitTextIntoChunks, maxCharsPerLine, startQueueProcessing]);

  // Clear subtitle queue when exiting subtitle mode
  useEffect(() => {
    if (!isSubtitleMode) {
      subtitleQueueRef.current = [];
      setSubtitleQueue([]);
      setCurrentSubtitle('');
      lastProcessedIndexRef.current = -1;
      isProcessingQueueRef.current = false;
      if (subtitleTimerRef.current) {
        clearTimeout(subtitleTimerRef.current);
        subtitleTimerRef.current = null;
      }
    }
  }, [isSubtitleMode]);

  // TTS (Text-to-Speech) functions
  const playTTS = useCallback(async (text) => {
    const key = apiKey || envApiKey;
    if (!key || !text) return;

    try {
      setIsSpeakingTTS(true);
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          voice: voiceType,
          speed: voiceSpeed,
          input: text,
        }),
      });

      if (!response.ok) throw new Error('TTS request failed');

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        URL.revokeObjectURL(ttsAudioRef.current.src);
      }

      const audio = new Audio(audioUrl);
      ttsAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setIsSpeakingTTS(false);
        isPlayingTTSRef.current = false;
        // Process next in queue
        processNextTTS();
      };

      audio.onerror = () => {
        setIsSpeakingTTS(false);
        isPlayingTTSRef.current = false;
        processNextTTS();
      };

      await audio.play();
    } catch (error) {
      console.error('TTS error:', error);
      setIsSpeakingTTS(false);
      isPlayingTTSRef.current = false;
      processNextTTS();
    }
  }, [apiKey, envApiKey, voiceType, voiceSpeed]);

  const processNextTTS = useCallback(() => {
    if (ttsQueueRef.current.length === 0) {
      isPlayingTTSRef.current = false;
      return;
    }
    const nextText = ttsQueueRef.current.shift();
    playTTS(nextText);
  }, [playTTS]);

  const startTTSProcessing = useCallback(() => {
    if (isPlayingTTSRef.current) return;
    if (ttsQueueRef.current.length === 0) return;
    isPlayingTTSRef.current = true;
    processNextTTS();
  }, [processNextTTS]);

  // Queue translations for TTS when voice mode is enabled
  useEffect(() => {
    if (!isVoiceMode) return;
    if (currentTranslation) return; // Wait for complete translation

    const latestIndex = translatedText.length - 1;
    if (latestIndex < 0 || latestIndex <= lastTTSIndexRef.current) return;

    const newText = translatedText[latestIndex];
    lastTTSIndexRef.current = latestIndex;

    ttsQueueRef.current.push(newText);
    startTTSProcessing();
  }, [isVoiceMode, translatedText, currentTranslation, startTTSProcessing]);

  // Stop TTS when voice mode is disabled
  useEffect(() => {
    if (!isVoiceMode) {
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      ttsQueueRef.current = [];
      lastTTSIndexRef.current = -1;
      isPlayingTTSRef.current = false;
      setIsSpeakingTTS(false);
    }
  }, [isVoiceMode]);

  // Subtitle Mode UI
  const subtitleHoverTimeoutRef = useRef(null);
  
  const handleSubtitleMouseMove = () => {
    setSubtitleHovered(true);
    if (subtitleHoverTimeoutRef.current) {
      clearTimeout(subtitleHoverTimeoutRef.current);
    }
    subtitleHoverTimeoutRef.current = setTimeout(() => {
      setSubtitleHovered(false);
    }, 2000); // Hide after 2 seconds of no movement
  };
  
  const handleSubtitleMouseLeave = () => {
    if (subtitleHoverTimeoutRef.current) {
      clearTimeout(subtitleHoverTimeoutRef.current);
    }
    setSubtitleHovered(false);
  };
  
  if (isSubtitleMode) {
    const displayText = currentSubtitle || (isListening ? 'Listening...' : 'Ready');
    const isStreaming = !!currentTranslation;
    const hasQueue = subtitleQueueRef.current.length > 0;

    return (
      <div
        ref={subtitleContainerRef}
        className="h-full w-full bg-black/30 text-white relative drag-region"
        onMouseMove={handleSubtitleMouseMove}
        onMouseLeave={handleSubtitleMouseLeave}
      >

        {/* Translation text - centered, fades when hovered */}
        <div className={`absolute inset-0 flex items-center justify-center px-8 pointer-events-none transition-opacity duration-200 ${
          subtitleHovered ? 'opacity-30' : 'opacity-100'
        }`}>
          <p
            className="font-bold text-center leading-tight text-white"
            style={{
              fontSize: 'clamp(24px, 35vh, 120px)',
              textShadow: '0 2px 8px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.5)'
            }}
          >
            {displayText}
            {isStreaming && (
              <span
                className="inline-block w-[3px] bg-codex-live ml-1 animate-blink"
                style={{ height: '0.8em' }}
              />
            )}
          </p>
        </div>

        {/* Queue indicator */}
        {hasQueue && !isStreaming && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {subtitleQueueRef.current.slice(0, 5).map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/40" />
            ))}
          </div>
        )}
        
        {/* Controls - center, only visible on hover */}
        <div className={`absolute inset-0 flex items-center justify-center no-drag z-10 transition-opacity duration-200 ${
          subtitleHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
          <div className="flex items-center gap-3 px-5 py-2.5 bg-black/70 backdrop-blur-sm rounded-full">
            {/* Language indicator */}
            <div className="flex items-center gap-1.5 text-white/80 text-sm">
              <span>{languageNames[langA]}</span>
              <ArrowLeftRight size={14} className="text-white/50" />
              <span>{languageNames[langB]}</span>
            </div>
            <div className="w-px h-6 bg-white/30" />
            <button
              onClick={toggleSubtitleMode}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              title="Exit subtitle mode"
            >
              <Maximize2 size={18} className="text-white/90" />
            </button>
            <button
              onClick={toggleSubtitlePosition}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              title={subtitlePosition === 'bottom' ? 'Move to top' : 'Move to bottom'}
            >
              {subtitlePosition === 'bottom' ? <ArrowUp size={18} className="text-white/90" /> : <ArrowDown size={18} className="text-white/90" />}
            </button>
            <div className="w-px h-6 bg-white/30" />
            {!isListening ? (
              <button
                onClick={startListening}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
                title="Start"
              >
                <Play size={20} className="text-white" fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={stopListening}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
                title="Stop"
              >
                <Square size={16} className="text-codex-error" fill="currentColor" />
              </button>
            )}
            {isListening && (
              <>
                <div className="w-px h-6 bg-white/30" />
                <AudioWave isActive={audioLevel > 0.05} audioLevel={audioLevel} />
              </>
            )}
            <Circle
              size={8}
              className={`ml-1 transition-colors ${
                status === 'connected' || status === 'listening' ? 'fill-emerald-400 text-emerald-400' :
                status === 'connecting' ? 'fill-amber-400 text-amber-400 animate-pulse' :
                status === 'error' ? 'fill-red-400 text-red-400' :
                'fill-codex-muted text-codex-muted'
              }`}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#0a0a0a] text-codex-text flex flex-col overflow-hidden">
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
          <button
            onClick={openSettings}
            disabled={isListening}
            className={`p-1.5 rounded-md transition-colors ${
              isListening ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5'
            }`}
          >
            <Settings size={16} className="text-codex-text-secondary" />
          </button>
        </div>
      </header>

      {/* Language Bar */}
      <div className="flex items-center justify-center gap-3 px-4 py-3 border-b border-codex-border-subtle">
        <LanguageSelector value={langA} onChange={setLangA} disabled={isListening} />
        <DirectionSelector value={direction} onChange={setDirection} disabled={isListening} langA={langA} langB={langB} />
        <LanguageSelector value={langB} onChange={setLangB} disabled={isListening} />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 p-4">
        {/* Translation Display - Teleprompter Style */}
        <div className="flex-1 flex flex-col min-h-0 mb-4">
          <div ref={scrollRef} className="flex-1 bg-codex-surface border border-codex-border rounded-xl p-8 overflow-y-auto flex flex-col">
            {isVoiceMode && voiceOnlyMode ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                  isSpeakingTTS ? 'bg-codex-live/20 animate-pulse' : 'bg-codex-elevated'
                }`}>
                  <Volume2 size={40} className={isSpeakingTTS ? 'text-codex-live' : 'text-codex-muted'} />
                </div>
                <p className="text-codex-muted text-lg">
                  {isSpeakingTTS ? 'Speaking...' : isListening ? 'Listening...' : 'Voice mode active'}
                </p>
              </div>
            ) : translatedText.length === 0 && !currentTranslation ? (
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
              disabled={fontSize === 5}
              className={`p-2.5 text-codex-muted hover:text-codex-text transition-colors rounded-r-lg ${
                fontSize === 5 ? 'opacity-40 cursor-not-allowed' : ''
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
            onClick={toggleSubtitleMode}
            className="p-2.5 bg-codex-surface border border-codex-border text-codex-muted hover:text-codex-text hover:bg-codex-elevated rounded-lg transition-colors"
            title="Subtitle mode"
          >
            <PanelTop size={16} />
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsVoiceMode(!isVoiceMode)}
              className={`p-2.5 border rounded-lg transition-colors ${
                isVoiceMode
                  ? 'bg-codex-live/20 border-codex-live text-codex-live'
                  : 'bg-codex-surface border-codex-border text-codex-muted hover:text-codex-text hover:bg-codex-elevated'
              }`}
              title={isVoiceMode ? 'Voice mode ON' : 'Voice mode OFF'}
            >
              {isVoiceMode ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            {isVoiceMode && (
              <>
                <VoiceSelector value={voiceType} onChange={setVoiceType} disabled={isSpeakingTTS} />
                <SpeedSelector value={voiceSpeed} onChange={setVoiceSpeed} disabled={isSpeakingTTS} />
                <button
                  onClick={() => {
                    const newValue = !voiceOnlyMode;
                    setVoiceOnlyMode(newValue);
                    localStorage.setItem('translatorVoiceOnly', newValue.toString());
                  }}
                  className={`p-2 border rounded-lg transition-colors ${
                    voiceOnlyMode
                      ? 'bg-codex-live/20 border-codex-live text-codex-live'
                      : 'bg-codex-surface border-codex-border text-codex-muted hover:text-codex-text hover:bg-codex-elevated'
                  }`}
                  title={voiceOnlyMode ? 'Text hidden (voice only)' : 'Text visible'}
                >
                  {voiceOnlyMode ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </>
            )}
          </div>
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
