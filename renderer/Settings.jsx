import React, { useState, useEffect } from 'react';
import { Mic, Key, Eye, EyeOff, X, ChevronDown, ChevronRight, Save, Check, Monitor } from 'lucide-react';

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSection, setShowApiSection] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  const [preset1, setPreset1] = useState('');
  const [preset2, setPreset2] = useState('');
  const [activePreset, setActivePreset] = useState(0);
  const [microphones, setMicrophones] = useState([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [micDropdownOpen, setMicDropdownOpen] = useState(false);
  const [envApiKey, setEnvApiKey] = useState('');
  const [subtitlePosition, setSubtitlePosition] = useState('bottom');

  useEffect(() => {
    setApiKey(localStorage.getItem('translatorApiKey') || '');
    setCustomInstruction(localStorage.getItem('translatorInstruction') || '');
    setPreset1(localStorage.getItem('translatorPreset1') || '');
    setPreset2(localStorage.getItem('translatorPreset2') || '');
    setActivePreset(parseInt(localStorage.getItem('translatorActivePreset') || '0'));
    setSelectedMic(localStorage.getItem('translatorMic') || '');
    setEnvApiKey(window.electronAPI?.getApiKey?.() || '');
    setSubtitlePosition(localStorage.getItem('translatorSubtitlePosition') || 'bottom');
    
    async function loadMicrophones() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices
          .filter(d => d.kind === 'audioinput')
          .map((mic, index) => ({ deviceId: mic.deviceId, label: mic.label, index }));
        setMicrophones(mics);
      } catch (error) {
        console.error('Mic access error:', error);
      }
    }
    loadMicrophones();
  }, []);

  const handleApiKeyChange = (value) => {
    setApiKey(value);
    localStorage.setItem('translatorApiKey', value);
  };

  const handleInstructionChange = (value) => {
    setCustomInstruction(value);
    localStorage.setItem('translatorInstruction', value);
  };

  const handleMicChange = (deviceId) => {
    setSelectedMic(deviceId);
    localStorage.setItem('translatorMic', deviceId);
    setMicDropdownOpen(false);
  };

  const handleSubtitlePositionChange = (position) => {
    setSubtitlePosition(position);
    localStorage.setItem('translatorSubtitlePosition', position);
  };

  const saveToPreset = (presetNum) => {
    if (presetNum === 1) {
      setPreset1(customInstruction);
      localStorage.setItem('translatorPreset1', customInstruction);
    } else {
      setPreset2(customInstruction);
      localStorage.setItem('translatorPreset2', customInstruction);
    }
  };

  const loadFromPreset = (presetNum) => {
    const preset = presetNum === 1 ? preset1 : preset2;
    if (preset) {
      setCustomInstruction(preset);
      localStorage.setItem('translatorInstruction', preset);
      setActivePreset(presetNum);
      localStorage.setItem('translatorActivePreset', presetNum.toString());
    }
  };

  const handleClose = () => {
    window.electronAPI?.closeSettings?.();
  };

  const selectedMicLabel = selectedMic 
    ? (microphones.find(m => m.deviceId === selectedMic)?.label || 'Selected microphone')
    : 'Default microphone';

  return (
    <div className="h-screen bg-codex-bg text-codex-text flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-codex-border drag-region">
        <span className="text-sm font-medium no-drag">Settings</span>
        <button onClick={handleClose} className="p-1 hover:bg-white/5 rounded no-drag">
          <X size={16} className="text-codex-muted" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Mic size={16} className="text-codex-muted" />
            <h2 className="text-sm font-medium">Microphone</h2>
          </div>
          <div className="relative">
            <button
              onClick={() => setMicDropdownOpen(!micDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-codex-surface border border-codex-border rounded-lg text-sm hover:border-codex-border-hover"
            >
              <span className={selectedMic ? 'text-codex-text' : 'text-codex-muted'}>
                {selectedMicLabel}
              </span>
              <ChevronDown size={16} className={`text-codex-muted transition-transform ${micDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {micDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMicDropdownOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-codex-elevated border border-codex-border rounded-lg shadow-xl overflow-hidden">
                  {microphones.map((mic) => (
                    <button
                      key={mic.deviceId}
                      onClick={() => handleMicChange(mic.deviceId)}
                      className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                        selectedMic === mic.deviceId
                          ? 'bg-white/10 text-codex-text'
                          : 'text-codex-text-secondary hover:bg-white/5'
                      }`}
                    >
                      {mic.label || `Microphone ${mic.index + 1}`}
                    </button>
                  ))}
                  {microphones.length === 0 && (
                    <p className="text-xs text-codex-muted px-3 py-2.5">No microphones found</p>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <Monitor size={16} className="text-codex-muted" />
            <h2 className="text-sm font-medium">Subtitle Mode Position</h2>
          </div>
          <p className="text-xs text-codex-muted mb-3">Where the subtitle bar appears when in subtitle mode</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleSubtitlePositionChange('top')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                subtitlePosition === 'top'
                  ? 'bg-white/10 text-codex-text border border-codex-border'
                  : 'bg-codex-surface text-codex-text-secondary hover:bg-white/5 border border-transparent'
              }`}
            >
              Top
            </button>
            <button
              onClick={() => handleSubtitlePositionChange('bottom')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                subtitlePosition === 'bottom'
                  ? 'bg-white/10 text-codex-text border border-codex-border'
                  : 'bg-codex-surface text-codex-text-secondary hover:bg-white/5 border border-transparent'
              }`}
            >
              Bottom
            </button>
          </div>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-sm font-medium">Translation Instructions</h2>
            <p className="text-xs text-codex-muted mt-1">Add context to improve translation quality</p>
          </div>
          
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => loadFromPreset(1)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors ${
                activePreset === 1 && preset1
                  ? 'bg-white/10 text-codex-text border border-codex-border'
                  : 'bg-codex-surface text-codex-text-secondary hover:bg-white/5 border border-transparent'
              }`}
            >
              {activePreset === 1 && preset1 && <Check size={12} />}
              Preset 1 {preset1 ? '' : '(empty)'}
            </button>
            <button
              onClick={() => loadFromPreset(2)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors ${
                activePreset === 2 && preset2
                  ? 'bg-white/10 text-codex-text border border-codex-border'
                  : 'bg-codex-surface text-codex-text-secondary hover:bg-white/5 border border-transparent'
              }`}
            >
              {activePreset === 2 && preset2 && <Check size={12} />}
              Preset 2 {preset2 ? '' : '(empty)'}
            </button>
          </div>

          <textarea
            value={customInstruction}
            onChange={(e) => handleInstructionChange(e.target.value)}
            placeholder="Examples:&#10;• Use formal/informal tone&#10;• Technical terminology&#10;• Speaker names or context"
            className="w-full h-28 px-3 py-2.5 bg-codex-surface border border-codex-border rounded-lg text-sm resize-none focus:outline-none focus:border-codex-border-hover"
          />
          
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => saveToPreset(1)}
              disabled={!customInstruction}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-codex-surface border border-codex-border rounded-lg text-xs text-codex-text-secondary hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={12} />
              Save to Preset 1
            </button>
            <button
              onClick={() => saveToPreset(2)}
              disabled={!customInstruction}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-codex-surface border border-codex-border rounded-lg text-xs text-codex-text-secondary hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={12} />
              Save to Preset 2
            </button>
          </div>
        </section>

        <section>
          <button
            onClick={() => setShowApiSection(!showApiSection)}
            className="flex items-center gap-2 w-full text-left"
          >
            {showApiSection ? <ChevronDown size={16} className="text-codex-muted" /> : <ChevronRight size={16} className="text-codex-muted" />}
            <Key size={16} className="text-codex-muted" />
            <h2 className="text-sm font-medium">API Key</h2>
            {(apiKey || envApiKey) && !showApiSection && (
              <span className="ml-auto text-xs text-codex-muted">Configured</span>
            )}
          </button>
          
          {showApiSection && (
            <div className="mt-3 pl-6">
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder={envApiKey ? 'Using .env file' : 'sk-...'}
                  className="w-full px-3 py-2.5 pr-10 bg-codex-surface border border-codex-border rounded-lg text-sm focus:outline-none focus:border-codex-border-hover"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-codex-muted hover:text-codex-text"
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {envApiKey && !apiKey && (
                <p className="mt-2 text-xs text-codex-muted">Using API key from .env file</p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
