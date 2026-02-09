import React, { useRef, useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { getFontSizeClasses } from '../../constants';

export default function TranslationDisplay({
  translatedText,
  currentTranslation,
  originalText,
  fontSize,
  textDirection,
  isListening,
  isVoiceMode,
  voiceOnlyMode,
  isSpeakingTTS,
  showOriginalText = true,
}) {
  const scrollRef = useRef(null);
  const fontClasses = getFontSizeClasses(fontSize);

  // Keep current text centered by scrolling
  useEffect(() => {
    if (scrollRef.current) {
      if (textDirection === 'down') {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      } else {
        scrollRef.current.scrollTop = 0;
      }
    }
  }, [translatedText, currentTranslation, textDirection]);

  // Voice only mode display
  if (isVoiceMode && voiceOnlyMode) {
    return (
      <div className="flex-1 flex flex-col min-h-0 mb-4">
        <div className="flex-1 bg-codex-surface border border-codex-border rounded-xl p-8 overflow-y-auto flex flex-col items-center justify-center gap-4">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
            isSpeakingTTS ? 'bg-codex-live/20 animate-pulse' : 'bg-codex-elevated'
          }`}>
            <Volume2 size={40} className={isSpeakingTTS ? 'text-codex-live' : 'text-codex-muted'} />
          </div>
          <p className="text-codex-muted text-lg">
            {isSpeakingTTS ? 'Speaking...' : isListening ? 'Listening...' : 'Voice mode active'}
          </p>
        </div>
      </div>
    );
  }

  // Empty state
  if (translatedText.length === 0 && !currentTranslation) {
    return (
      <div className="flex-1 flex flex-col min-h-0 mb-4">
        <div 
          ref={scrollRef} 
          className="flex-1 bg-codex-surface border border-codex-border rounded-xl p-8 overflow-y-auto flex flex-col items-center justify-center"
        >
          <p className="text-codex-muted text-base">
            {isListening ? 'Listening...' : 'Press Start to begin'}
          </p>
        </div>
        {showOriginalText && <OriginalTextDisplay text={originalText} />}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 mb-4">
      <div
        ref={scrollRef}
        className="flex-1 bg-codex-surface border border-codex-border rounded-xl p-8 overflow-y-auto flex flex-col"
      >
        {textDirection === 'down' ? (
          <TopToBottomLayout
            translatedText={translatedText}
            currentTranslation={currentTranslation}
            fontClasses={fontClasses}
          />
        ) : (
          <BottomToTopLayout
            translatedText={translatedText}
            currentTranslation={currentTranslation}
            fontClasses={fontClasses}
          />
        )}
      </div>
      {showOriginalText && <OriginalTextDisplay text={originalText} />}
    </div>
  );
}

// Top to bottom layout
function TopToBottomLayout({ translatedText, currentTranslation, fontClasses }) {
  return (
    <>
      <div className="flex-1 min-h-0" />
      <div className="space-y-6 text-center">
        {translatedText.map((text, i, arr) => {
          const isLast = i === arr.length - 1 && !currentTranslation;
          const opacity = isLast ? 1 : 0.4 + (i / arr.length) * 0.4;
          return (
            <p
              key={i}
              className={`leading-relaxed transition-all duration-300 ${
                isLast 
                  ? `${fontClasses.current} font-semibold text-codex-text` 
                  : `${fontClasses.previous} text-codex-text`
              }`}
              style={{ opacity }}
            >
              {text}
            </p>
          );
        })}
        {currentTranslation && (
          <p className={`${fontClasses.current} font-semibold leading-relaxed text-codex-text`}>
            {currentTranslation}
            <span className={`inline-block w-[4px] ${fontClasses.cursor} bg-codex-live ml-1.5 animate-blink`} />
          </p>
        )}
      </div>
      <div className="flex-1 min-h-0" />
    </>
  );
}

// Bottom to top layout
function BottomToTopLayout({ translatedText, currentTranslation, fontClasses }) {
  return (
    <>
      <div className="flex-1 min-h-0" />
      <div className="space-y-6 text-center">
        {currentTranslation && (
          <p className={`${fontClasses.current} font-semibold leading-relaxed text-codex-text`}>
            {currentTranslation}
            <span className={`inline-block w-[4px] ${fontClasses.cursor} bg-codex-live ml-1.5 animate-blink`} />
          </p>
        )}
        {[...translatedText].reverse().map((text, i, arr) => {
          const isFirst = i === 0 && !currentTranslation;
          const opacity = isFirst ? 1 : 0.4 + ((arr.length - i) / arr.length) * 0.4;
          return (
            <p
              key={translatedText.length - 1 - i}
              className={`leading-relaxed transition-all duration-300 ${
                isFirst 
                  ? `${fontClasses.current} font-semibold text-codex-text` 
                  : `${fontClasses.previous} text-codex-text`
              }`}
              style={{ opacity }}
            >
              {text}
            </p>
          );
        })}
      </div>
      <div className="flex-1 min-h-0" />
    </>
  );
}

// Original text display
function OriginalTextDisplay({ text }) {
  if (!text || text.length === 0) return null;
  
  return (
    <div className="mt-4 text-center">
      <p className="text-base text-codex-text-secondary/80 italic">
        "{text.slice(-1)[0]}"
      </p>
    </div>
  );
}
