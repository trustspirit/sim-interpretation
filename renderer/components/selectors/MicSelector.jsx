import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function MicSelector({ value, onChange, microphones, disabled }) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedMicLabel = value 
    ? (microphones.find(m => m.deviceId === value)?.label || 'Selected microphone')
    : 'Default microphone';

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-2.5 bg-codex-surface border border-codex-border rounded-lg text-sm ${
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-codex-border-hover cursor-pointer'
        }`}
      >
        <span className={value ? 'text-codex-text' : 'text-codex-muted'}>
          {selectedMicLabel}
        </span>
        <ChevronDown 
          size={16} 
          className={`text-codex-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-codex-elevated border border-codex-border rounded-lg shadow-xl overflow-hidden">
            {microphones.map((mic) => (
              <button
                key={mic.deviceId}
                onClick={() => {
                  onChange(mic.deviceId);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                  value === mic.deviceId
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
  );
}
