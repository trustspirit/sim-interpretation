import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Dropdown } from '../common';
import { languages } from '../../constants';

export default function LanguageSelector({ value, onChange, disabled }) {
  const selected = languages.find(l => l.code === value);

  return (
    <Dropdown
      value={value}
      options={languages}
      onChange={onChange}
      disabled={disabled}
      renderTrigger={(_, isOpen) => (
        <>
          <span className="text-codex-text">{selected?.name}</span>
          <ChevronDown 
            size={14} 
            className={`text-codex-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          />
        </>
      )}
      renderOption={(lang) => lang.name}
    />
  );
}
