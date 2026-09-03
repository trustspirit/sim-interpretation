import { useState, useRef, useCallback } from 'react';

export default function useUISettings() {
  const [fontSize, setFontSize] = useState(() => {
    const stored = parseInt(localStorage.getItem('translatorFontSize') ?? '', 10);
    return Number.isInteger(stored) && stored >= 0 && stored <= 5 ? stored : 2;
  });
  const [textDirection, setTextDirection] = useState(() =>
    localStorage.getItem('translatorTextDirection') === 'up' ? 'up' : 'down'
  );
  const [isSubtitleMode, setIsSubtitleMode] = useState(false);
  const [subtitlePosition, setSubtitlePosition] = useState(() =>
    localStorage.getItem('translatorSubtitlePosition') || 'bottom'
  );
  const [maxCharsPerLine, setMaxCharsPerLine] = useState(50);

  const isSubtitleModeRef = useRef(false);

  const updateFontSize = (compute) => setFontSize(prev => {
    const next = compute(prev);
    localStorage.setItem('translatorFontSize', String(next));
    return next;
  });

  const increaseFontSize = useCallback(() => {
    updateFontSize(prev => (prev < 5 ? prev + 1 : prev));
  }, []);

  const decreaseFontSize = useCallback(() => {
    updateFontSize(prev => (prev > 0 ? prev - 1 : prev));
  }, []);

  const toggleTextDirection = useCallback(() => {
    setTextDirection(prev => {
      const next = prev === 'down' ? 'up' : 'down';
      localStorage.setItem('translatorTextDirection', next);
      return next;
    });
  }, []);

  const toggleSubtitleMode = useCallback(async () => {
    const position = localStorage.getItem('translatorSubtitlePosition') || 'bottom';
    const result = await window.electronAPI?.toggleSubtitleMode?.(position);
    if (result?.success) setIsSubtitleMode(result.isSubtitleMode);
  }, []);

  const toggleSubtitlePosition = useCallback(async () => {
    setSubtitlePosition(prev => {
      const newPosition = prev === 'bottom' ? 'top' : 'bottom';
      localStorage.setItem('translatorSubtitlePosition', newPosition);
      window.electronAPI?.updateSubtitlePosition?.(newPosition);
      return newPosition;
    });
  }, []);

  const openSettings = useCallback(() => {
    window.electronAPI?.openSettings?.();
  }, []);

  return {
    fontSize,
    textDirection,
    isSubtitleMode,
    setIsSubtitleMode,
    subtitlePosition,
    setSubtitlePosition,
    maxCharsPerLine,
    setMaxCharsPerLine,
    isSubtitleModeRef,
    increaseFontSize,
    decreaseFontSize,
    toggleTextDirection,
    toggleSubtitleMode,
    toggleSubtitlePosition,
    openSettings,
  };
}
