import React, { useState, useEffect } from 'react';
import { Mic, Key, Eye, EyeOff, X, ChevronDown, ChevronRight, Save, Check, Monitor } from 'lucide-react';
import { MicSelector } from './components/selectors';
import { useMicrophones } from './hooks';

// Section component for consistent styling
function Section({ children, className = '' }) {
  return <section className={className}>{children}</section>;
}

// Section Header component
function SectionHeader({ icon: Icon, title, extra }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon size={16} className="text-codex-muted" />}
      <h2 className="text-sm font-medium">{title}</h2>
      {extra}
    </div>
  );
}

// Toggle Button Group component
function ToggleButtonGroup({ options, value, onChange }) {
  return (
    <div className="flex gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            value === option.value
              ? 'bg-white/10 text-codex-text border border-codex-border'
              : 'bg-codex-surface text-codex-text-secondary hover:bg-white/5 border border-transparent'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Preset Button component
function PresetButton({ label, isActive, hasContent, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors ${
        isActive && hasContent
          ? 'bg-white/10 text-codex-text border border-codex-border'
          : 'bg-codex-surface text-codex-text-secondary hover:bg-white/5 border border-transparent'
      }`}
    >
      {isActive && hasContent && <Check size={12} />}
      {label} {hasContent ? '' : '(empty)'}
    </button>
  );
}

// Save Preset Button component
function SavePresetButton({ label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-codex-surface border border-codex-border rounded-lg text-xs text-codex-text-secondary hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Save size={12} />
      {label}
    </button>
  );
}

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSection, setShowApiSection] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  const [preset1, setPreset1] = useState('');
  const [preset2, setPreset2] = useState('');
  const [activePreset, setActivePreset] = useState(0);
  const [envApiKey, setEnvApiKey] = useState('');
  const [subtitlePosition, setSubtitlePosition] = useState('bottom');

  const { microphones, selectedMic, selectMic } = useMicrophones();

  useEffect(() => {
    setApiKey(localStorage.getItem('translatorApiKey') || '');
    setCustomInstruction(localStorage.getItem('translatorInstruction') || '');
    setPreset1(localStorage.getItem('translatorPreset1') || '');
    setPreset2(localStorage.getItem('translatorPreset2') || '');
    setActivePreset(parseInt(localStorage.getItem('translatorActivePreset') || '0'));
    setEnvApiKey(window.electronAPI?.getApiKey?.() || '');
    setSubtitlePosition(localStorage.getItem('translatorSubtitlePosition') || 'bottom');
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
    selectMic(deviceId);
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

  return (
    <div className="h-screen bg-codex-bg text-codex-text flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-codex-border drag-region">
        <span className="text-sm font-medium no-drag">Settings</span>
        <button onClick={handleClose} className="p-1 hover:bg-white/5 rounded no-drag">
          <X size={16} className="text-codex-muted" />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Microphone Section */}
        <Section>
          <SectionHeader icon={Mic} title="Microphone" />
          <MicSelector
            value={selectedMic}
            onChange={handleMicChange}
            microphones={microphones}
          />
        </Section>

        {/* Subtitle Position Section */}
        <Section>
          <SectionHeader icon={Monitor} title="Subtitle Mode Position" />
          <p className="text-xs text-codex-muted mb-3">
            Where the subtitle bar appears when in subtitle mode
          </p>
          <ToggleButtonGroup
            options={[
              { value: 'top', label: 'Top' },
              { value: 'bottom', label: 'Bottom' }
            ]}
            value={subtitlePosition}
            onChange={handleSubtitlePositionChange}
          />
        </Section>

        {/* Translation Instructions Section */}
        <Section>
          <div className="mb-3">
            <h2 className="text-sm font-medium">Translation Instructions</h2>
            <p className="text-xs text-codex-muted mt-1">
              Add context to improve translation quality
            </p>
          </div>
          
          {/* Preset Buttons */}
          <div className="flex gap-2 mb-3">
            <PresetButton
              label="Preset 1"
              isActive={activePreset === 1}
              hasContent={!!preset1}
              onClick={() => loadFromPreset(1)}
            />
            <PresetButton
              label="Preset 2"
              isActive={activePreset === 2}
              hasContent={!!preset2}
              onClick={() => loadFromPreset(2)}
            />
          </div>

          {/* Instruction Textarea */}
          <textarea
            value={customInstruction}
            onChange={(e) => handleInstructionChange(e.target.value)}
            placeholder="Examples:&#10;• Use formal/informal tone&#10;• Technical terminology&#10;• Speaker names or context"
            className="w-full h-28 px-3 py-2.5 bg-codex-surface border border-codex-border rounded-lg text-sm resize-none focus:outline-none focus:border-codex-border-hover"
          />
          
          {/* Save Preset Buttons */}
          <div className="flex gap-2 mt-2">
            <SavePresetButton
              label="Save to Preset 1"
              onClick={() => saveToPreset(1)}
              disabled={!customInstruction}
            />
            <SavePresetButton
              label="Save to Preset 2"
              onClick={() => saveToPreset(2)}
              disabled={!customInstruction}
            />
          </div>
        </Section>

        {/* API Key Section */}
        <Section>
          <button
            onClick={() => setShowApiSection(!showApiSection)}
            className="flex items-center gap-2 w-full text-left"
          >
            {showApiSection 
              ? <ChevronDown size={16} className="text-codex-muted" /> 
              : <ChevronRight size={16} className="text-codex-muted" />
            }
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
                <p className="mt-2 text-xs text-codex-muted">
                  Using API key from .env file
                </p>
              )}
            </div>
          )}
        </Section>
      </main>
    </div>
  );
}
