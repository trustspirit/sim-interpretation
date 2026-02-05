import React, { useState } from 'react';
import { Volume2, ChevronDown } from 'lucide-react';
import { voiceOptions, getVoice } from '../../constants';

export default function VoiceSelector({ value, onChange, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = getVoice(value);

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
        <ChevronDown 
          size={10} 
          className={`text-codex-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full right-0 mb-1 z-50 bg-codex-elevated border border-codex-border rounded-lg shadow-xl overflow-hidden min-w-40">
            {voiceOptions.map((voice) => (
              <button
                key={voice.code}
                onClick={() => {
                  onChange(voice.code);
                  localStorage.setItem('translatorVoice', voice.code);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  value === voice.code 
                    ? 'bg-white/10 text-codex-text' 
                    : 'text-codex-text-secondary hover:bg-white/5'
                }`}
              >
                <div className="flex justify-between items-center gap-3">
                  <span>{voice.name}</span>
                  <span className="text-[10px] text-codex-muted whitespace-nowrap">{voice.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
