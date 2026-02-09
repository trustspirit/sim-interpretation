import React from 'react';
import {
  Play,
  Square,
  Type,
  ArrowDown,
  ArrowUp,
  PanelTop,
  Volume2,
  VolumeX,
  Trash2,
  Eye,
  EyeOff,
  MessageSquare,
  MessageSquareOff
} from 'lucide-react';
import { VoiceSelector } from '../selectors';

export default function ControlBar({
  isListening,
  onStart,
  onStop,
  fontSize,
  onFontSizeIncrease,
  onFontSizeDecrease,
  textDirection,
  onToggleDirection,
  onToggleSubtitleMode,
  isVoiceMode,
  onToggleVoiceMode,
  voiceType,
  onVoiceTypeChange,
  isSpeakingTTS,
  voiceOnlyMode,
  onToggleVoiceOnlyMode,
  showOriginalText,
  onToggleShowOriginalText,
  onClear,
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Start/Stop Button */}
      {!isListening ? (
        <button
          onClick={onStart}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white text-black font-medium rounded-lg transition-all hover:bg-white/90 active:scale-[0.98]"
        >
          <Play size={16} fill="currentColor" />
          <span>Start</span>
        </button>
      ) : (
        <button
          onClick={onStop}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-codex-error/90 text-white font-medium rounded-lg transition-all hover:bg-codex-error active:scale-[0.98]"
        >
          <Square size={14} fill="currentColor" />
          <span>Stop</span>
        </button>
      )}

      {/* Font Size Controls */}
      <div className="flex items-center gap-1 bg-codex-surface border border-codex-border rounded-lg">
        <button
          onClick={onFontSizeDecrease}
          disabled={fontSize === 0}
          className={`p-2.5 text-codex-muted hover:text-codex-text transition-colors rounded-l-lg ${
            fontSize === 0 ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          title="Decrease font size"
        >
          <Type size={14} />
        </button>
        <div className="w-px h-4 bg-codex-border" />
        <button
          onClick={onFontSizeIncrease}
          disabled={fontSize === 5}
          className={`p-2.5 text-codex-muted hover:text-codex-text transition-colors rounded-r-lg ${
            fontSize === 5 ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          title="Increase font size"
        >
          <Type size={18} />
        </button>
      </div>

      {/* Text Direction Toggle */}
      <button
        onClick={onToggleDirection}
        className="p-2.5 bg-codex-surface border border-codex-border text-codex-muted hover:text-codex-text hover:bg-codex-elevated rounded-lg transition-colors"
        title={textDirection === 'down' ? 'Top to bottom' : 'Bottom to top'}
      >
        {textDirection === 'down' ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
      </button>

      {/* Show/Hide Original Text Toggle */}
      <button
        onClick={onToggleShowOriginalText}
        className={`p-2.5 border rounded-lg transition-colors ${
          showOriginalText
            ? 'bg-codex-surface border-codex-border text-codex-muted hover:text-codex-text hover:bg-codex-elevated'
            : 'bg-codex-warning/20 border-codex-warning text-codex-warning'
        }`}
        title={showOriginalText ? 'Hide original text' : 'Show original text'}
      >
        {showOriginalText ? <MessageSquare size={16} /> : <MessageSquareOff size={16} />}
      </button>

      {/* Subtitle Mode Toggle */}
      <button
        onClick={onToggleSubtitleMode}
        className="p-2.5 bg-codex-surface border border-codex-border text-codex-muted hover:text-codex-text hover:bg-codex-elevated rounded-lg transition-colors"
        title="Subtitle mode"
      >
        <PanelTop size={16} />
      </button>

      {/* Voice Mode Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleVoiceMode}
          className={`p-2.5 border rounded-lg transition-colors ${
            isVoiceMode
              ? 'bg-codex-live/20 border-codex-live text-codex-live'
              : 'bg-codex-surface border-codex-border text-codex-muted hover:text-codex-text hover:bg-codex-elevated'
          }`}
          title={isVoiceMode ? 'Voice mode ON' : 'Voice mode OFF'}
        >
          {isVoiceMode ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        
        {isVoiceMode && (
          <>
            <VoiceSelector 
              value={voiceType} 
              onChange={onVoiceTypeChange} 
              disabled={isSpeakingTTS} 
            />
            <button
              onClick={onToggleVoiceOnlyMode}
              className={`p-2 border rounded-lg transition-colors ${
                voiceOnlyMode
                  ? 'bg-codex-live/20 border-codex-live text-codex-live'
                  : 'bg-codex-surface border-codex-border text-codex-muted hover:text-codex-text hover:bg-codex-elevated'
              }`}
              title={voiceOnlyMode ? 'Text hidden (voice only)' : 'Text visible'}
            >
              {voiceOnlyMode ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </>
        )}
      </div>

      {/* Clear Button */}
      <button
        onClick={onClear}
        className="p-2.5 bg-codex-surface border border-codex-border text-codex-muted hover:text-codex-text hover:bg-codex-elevated rounded-lg transition-colors"
        title="Clear transcripts"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
