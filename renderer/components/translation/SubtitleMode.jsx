import React, { useRef, useState, useEffect } from 'react';
import { 
  Play, 
  Square, 
  ArrowLeftRight, 
  Maximize2, 
  ArrowUp, 
  ArrowDown,
  Circle 
} from 'lucide-react';
import { AudioWave } from '../common';
import { getLanguageName } from '../../constants';

export default function SubtitleMode({
  currentSubtitle,
  currentTranslation,
  hasQueue,
  queueLength,
  isListening,
  audioLevel,
  status,
  langA,
  langB,
  subtitlePosition,
  onToggleSubtitleMode,
  onToggleSubtitlePosition,
  onStart,
  onStop,
  onMaxCharsCalculated,
}) {
  const containerRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef(null);

  const displayText = currentSubtitle || (isListening ? 'Listening...' : 'Ready');
  const isStreaming = !!currentTranslation;

  // Calculate max characters per line based on container size
  useEffect(() => {
    if (!containerRef.current) return;

    const calculateMaxChars = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth - 64; // px-8 = 32px * 2
      const containerHeight = container.clientHeight;

      // Font size is clamp(24px, 35vh, 120px)
      const fontSize = Math.min(120, Math.max(24, containerHeight * 0.35));

      // Approximate character width (varies by language, use conservative estimate)
      const avgCharWidth = fontSize * 0.6;
      const maxChars = Math.floor(containerWidth / avgCharWidth);

      onMaxCharsCalculated?.(Math.max(10, maxChars));
    };

    calculateMaxChars();

    const resizeObserver = new ResizeObserver(calculateMaxChars);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [onMaxCharsCalculated]);

  const handleMouseMove = () => {
    setIsHovered(true);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 2000);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsHovered(false);
  };

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-black/30 text-white relative drag-region"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Translation text - centered, fades when hovered */}
      <div className={`absolute inset-0 flex items-center justify-center px-8 pointer-events-none transition-opacity duration-200 ${
        isHovered ? 'opacity-30' : 'opacity-100'
      }`}>
        <p
          className="font-bold text-center leading-tight text-white"
          style={{
            fontSize: 'clamp(24px, 35vh, 120px)',
            textShadow: '0 2px 8px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.5)'
          }}
        >
          {displayText}
          {isStreaming && (
            <span
              className="inline-block w-[3px] bg-codex-live ml-1 animate-blink"
              style={{ height: '0.8em' }}
            />
          )}
        </p>
      </div>

      {/* Queue indicator */}
      {hasQueue && !isStreaming && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {Array(Math.min(5, queueLength)).fill(0).map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/40" />
          ))}
        </div>
      )}

      {/* Controls - center, only visible on hover */}
      <div className={`absolute inset-0 flex items-center justify-center no-drag z-10 transition-opacity duration-200 ${
        isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        <div className="flex items-center gap-3 px-5 py-2.5 bg-black/70 backdrop-blur-sm rounded-full">
          {/* Language indicator */}
          <div className="flex items-center gap-1.5 text-white/80 text-sm">
            <span>{getLanguageName(langA)}</span>
            <ArrowLeftRight size={14} className="text-white/50" />
            <span>{getLanguageName(langB)}</span>
          </div>
          
          <div className="w-px h-6 bg-white/30" />
          
          <button
            onClick={onToggleSubtitleMode}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
            title="Exit subtitle mode"
          >
            <Maximize2 size={18} className="text-white/90" />
          </button>
          
          <button
            onClick={onToggleSubtitlePosition}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
            title={subtitlePosition === 'bottom' ? 'Move to top' : 'Move to bottom'}
          >
            {subtitlePosition === 'bottom' 
              ? <ArrowUp size={18} className="text-white/90" /> 
              : <ArrowDown size={18} className="text-white/90" />
            }
          </button>
          
          <div className="w-px h-6 bg-white/30" />
          
          {!isListening ? (
            <button
              onClick={onStart}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              title="Start"
            >
              <Play size={20} className="text-white" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={onStop}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              title="Stop"
            >
              <Square size={16} className="text-codex-error" fill="currentColor" />
            </button>
          )}
          
          {isListening && (
            <>
              <div className="w-px h-6 bg-white/30" />
              <AudioWave isActive={audioLevel > 0.05} audioLevel={audioLevel} />
            </>
          )}
          
          <Circle
            size={8}
            className={`ml-1 transition-colors ${
              status === 'connected' || status === 'listening' 
                ? 'fill-emerald-400 text-emerald-400' 
                : status === 'connecting' 
                  ? 'fill-amber-400 text-amber-400 animate-pulse' 
                  : status === 'error' 
                    ? 'fill-red-400 text-red-400' 
                    : 'fill-codex-muted text-codex-muted'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
