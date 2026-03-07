import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const hideTimeoutRef = useRef(null);

  useEffect(() => {
    window.electronAPI?.onFullscreenChanged?.((fs) => {
      setIsFullscreen(fs);
      setHeaderVisible(!fs);
    });
  }, []);

  const showHeader = useCallback(() => {
    setHeaderVisible(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => setHeaderVisible(false), 2000);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!isFullscreen) return;
    setHeaderVisible(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  }, [isFullscreen]);

  const handleMouseLeave = useCallback(() => {
    if (!isFullscreen) return;
    hideTimeoutRef.current = setTimeout(() => setHeaderVisible(false), 500);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) {
      setHeaderVisible(true);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      return;
    }

    const handleMouseMove = (e) => {
      if (e.clientY <= 8) showHeader();
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isFullscreen, showHeader]);

  return (
    <>
      {isFullscreen && !headerVisible && (
        <div className="h-1 w-full hover:bg-white/10 transition-colors" />
      )}
      <header
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`flex items-center justify-between px-4 py-3 border-b border-codex-border bg-codex-bg drag-region transition-all duration-300 ${
          isFullscreen && !headerVisible ? 'h-0 py-0 overflow-hidden opacity-0 border-b-0' : 'opacity-100'
        }`}
      >
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
    </>
  );
}
