import React from 'react';
import { LanguageSelector, DirectionSelector } from '../selectors';

export default function LanguageBar({ 
  langA, 
  langB, 
  direction, 
  onLangAChange, 
  onLangBChange, 
  onDirectionChange, 
  disabled 
}) {
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-3 border-b border-codex-border-subtle">
      <LanguageSelector value={langA} onChange={onLangAChange} disabled={disabled} />
      <DirectionSelector 
        value={direction} 
        onChange={onDirectionChange} 
        disabled={disabled} 
        langA={langA} 
        langB={langB} 
      />
      <LanguageSelector value={langB} onChange={onLangBChange} disabled={disabled} />
    </div>
  );
}
