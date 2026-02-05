import React from 'react';
import { Settings } from 'lucide-react';
import { WindowControls, AudioWave, StatusIndicator } from '../common';

export default function Header({ 
  isListening, 
  audioLevel, 
  status, 
  statusText, 
  onSettingsClick,
  title = 'Translator'
}) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-codex-border bg-codex-bg drag-region">
      <div className="flex items-center no-drag">
        <WindowControls />
        <span className="text-sm font-medium text-codex-text">{title}</span>
      </div>
      
      <div className="flex items-center gap-3 no-drag">
        {isListening && (
          <div className="flex items-center gap-2 px-2.5 py-1 bg-codex-live/10 border border-codex-live/20 rounded-full">
            <AudioWave isActive={audioLevel > 0.05} audioLevel={audioLevel} />
            <span className="text-xs text-codex-live">Live</span>
          </div>
        )}
        
        <StatusIndicator status={status} statusText={statusText} />
        
        <button
          onClick={onSettingsClick}
          disabled={isListening}
          className={`p-1.5 rounded-md transition-colors ${
            isListening ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5'
          }`}
        >
          <Settings size={16} className="text-codex-text-secondary" />
        </button>
      </div>
    </header>
  );
}
