import React, { useState } from 'react';
import { getLanguageName } from '../../constants';

export default function DirectionSelector({ value, onChange, disabled, autoDisabled = false, langA, langB }) {
  const [isOpen, setIsOpen] = useState(false);

  const options = [
    {
      code: 'auto', label: 'Auto', icon: '↔',
      desc: autoDisabled ? 'Not available in Realtime mode' : 'Auto-detect language',
      unavailable: autoDisabled,
    },
    { code: 'a-to-b', label: `${getLanguageName(langA)} → ${getLanguageName(langB)}`, icon: '→', desc: `Speak ${getLanguageName(langA)}` },
    { code: 'b-to-a', label: `${getLanguageName(langB)} → ${getLanguageName(langA)}`, icon: '←', desc: `Speak ${getLanguageName(langB)}` },
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
        <span className={`text-lg font-medium transition-colors ${
          value !== 'auto' ? 'text-codex-live' : 'text-codex-muted'
        }`}>
          {selected.icon}
        </span>
      </button>

      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div 
            className="absolute top-full mt-1 z-50 flex justify-center" 
            style={{ left: '50%', transform: 'translateX(-50%)' }}
          >
            <div className="bg-codex-elevated border border-codex-border rounded-lg shadow-xl overflow-hidden min-w-48">
              {options.map((opt) => (
                <button
                  key={opt.code}
                  disabled={opt.unavailable}
                  onClick={() => {
                    if (opt.unavailable) return;
                    onChange(opt.code);
                    localStorage.setItem('translatorDirection', opt.code);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    opt.unavailable ? 'opacity-40 cursor-not-allowed' : value === opt.code ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-base ${
                      value === opt.code ? 'text-codex-live' : 'text-codex-muted'
                    }`}>
                      {opt.icon}
                    </span>
                    <div>
                      <div className={`text-sm ${
                        value === opt.code ? 'text-codex-text' : 'text-codex-text-secondary'
                      }`}>
                        {opt.label}
                      </div>
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
