import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function AudioOutputSelector({ value, onChange, outputs, disabled }) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedLabel = value
    ? (outputs.find(o => o.deviceId === value)?.label || 'Selected output')
    : 'Default speaker';

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
          {selectedLabel}
        </span>
        <ChevronDown
          size={16}
          className={`text-codex-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-codex-elevated border border-codex-border rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
            {outputs.map((output) => (
              <button
                key={output.deviceId}
                onClick={() => {
                  onChange(output.deviceId);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                  value === output.deviceId
                    ? 'bg-white/10 text-codex-text'
                    : 'text-codex-text-secondary hover:bg-white/5'
                }`}
              >
                {output.label}
              </button>
            ))}
            {outputs.length === 0 && (
              <p className="text-xs text-codex-muted px-3 py-2.5">No audio outputs found</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
