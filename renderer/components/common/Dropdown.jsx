import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function Dropdown({
  value,
  options,
  onChange,
  disabled = false,
  renderTrigger,
  renderOption,
  triggerClassName = '',
  dropdownClassName = '',
  position = 'bottom', // 'top' or 'bottom'
  align = 'left', // 'left', 'right', or 'center'
}) {
  const [isOpen, setIsOpen] = useState(false);

  const getPositionClasses = () => {
    const vertical = position === 'top' ? 'bottom-full mb-1' : 'top-full mt-1';
    const horizontal = {
      left: 'left-0',
      right: 'right-0',
      center: 'left-1/2 -translate-x-1/2'
    }[align];
    return `${vertical} ${horizontal}`;
  };

  const defaultTriggerClass = `flex items-center gap-2 px-3 py-2 bg-codex-surface border border-codex-border rounded-lg text-sm transition-all ${
    disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-codex-elevated hover:border-codex-border cursor-pointer'
  }`;

  const defaultDropdownClass = 'bg-codex-elevated border border-codex-border rounded-lg shadow-xl overflow-hidden min-w-32 animate-fade-in';

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={triggerClassName || defaultTriggerClass}
      >
        {renderTrigger ? (
          renderTrigger(value, isOpen)
        ) : (
          <>
            <span className="text-codex-text">{value}</span>
            <ChevronDown 
              size={14} 
              className={`text-codex-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} 
            />
          </>
        )}
      </button>

      {isOpen && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className={`absolute z-50 ${getPositionClasses()} ${dropdownClassName || defaultDropdownClass}`}>
            {options.map((option, index) => (
              <button
                key={option.code || option.value || index}
                onClick={() => {
                  onChange(option.code || option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                  value === (option.code || option.value)
                    ? 'bg-white/10 text-codex-text'
                    : 'text-codex-text-secondary hover:bg-white/5'
                }`}
              >
                {renderOption ? renderOption(option, value === (option.code || option.value)) : option.name || option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
