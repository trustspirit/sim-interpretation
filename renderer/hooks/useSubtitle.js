import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { MS_PER_WORD, MS_PER_CJK_CHAR, MIN_SUBTITLE_DISPLAY_MS, MAX_SUBTITLE_DISPLAY_MS } from '../constants';

export default function useSubtitle({ isEnabled, maxCharsPerLine = 50 }) {
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [queue, setQueue] = useState([]);
  
  const queueRef = useRef([]);
  const timerRef = useRef(null);
  const lastProcessedIndexRef = useRef(-1);
  const isProcessingRef = useRef(false);
  const chunkTimingsRef = useRef([]);
  const pendingStartRef = useRef(false);

  // Split text into chunks that fit on screen
  const splitTextIntoChunks = useCallback((text, maxChars) => {
    if (!text || text.length <= maxChars) return [text];

    const chunks = [];
    const hasSpaces = /\s/.test(text);
    
    if (hasSpaces) {
      const words = text.split(/\s+/);
      let current = '';
      
      for (const word of words) {
        const testLine = current ? `${current} ${word}` : word;
        
        if (testLine.length <= maxChars) {
          current = testLine;
        } else {
          if (current) chunks.push(current);
          
          if (word.length > maxChars) {
            for (let i = 0; i < word.length; i += maxChars) {
              chunks.push(word.slice(i, i + maxChars));
            }
            current = '';
          } else {
            current = word;
          }
        }
      }
      
      if (current) chunks.push(current);
    } else {
      // CJK languages: split at punctuation, then by character count
      const breakPoints = /([。！？，、；：])/g;
      const parts = text.split(breakPoints).filter(p => p);
      
      let current = '';
      for (const part of parts) {
        if ((current + part).length <= maxChars) {
          current += part;
        } else {
          if (current) chunks.push(current);
          
          if (part.length > maxChars) {
            for (let i = 0; i < part.length; i += maxChars) {
              const slice = part.slice(i, i + maxChars);
              if (i + maxChars < part.length) {
                chunks.push(slice);
              } else {
                current = slice;
              }
            }
          } else {
            current = part;
          }
        }
      }
      
      if (current) chunks.push(current);
    }
    
    return chunks.filter(c => c.trim());
  }, []);

  // Process subtitle queue
  const processQueue = useCallback(() => {
    if (queueRef.current.length === 0) {
      isProcessingRef.current = false;
      timerRef.current = null;
      chunkTimingsRef.current = [];
      return;
    }

    const chunk = queueRef.current.shift();
    setQueue([...queueRef.current]);
    setCurrentSubtitle(chunk);

    const timings = chunkTimingsRef.current;
    const hasSpaces = /\s/.test(chunk);
    let displayTime;
    
    if (hasSpaces) {
      const wordCount = chunk.split(/\s+/).length;
      displayTime = wordCount * MS_PER_WORD;
    } else {
      displayTime = chunk.length * MS_PER_CJK_CHAR;
    }
    
    if (timings.length > 1) {
      const totalChars = timings.reduce((sum, t) => sum + t.chunk.length, 0);
      const ratio = chunk.length / totalChars;
      const totalDuration = hasSpaces 
        ? timings.reduce((sum, t) => sum + t.chunk.split(/\s+/).length * MS_PER_WORD, 0)
        : totalChars * MS_PER_CJK_CHAR;
      displayTime = Math.max(MIN_SUBTITLE_DISPLAY_MS, totalDuration * ratio);
    }
    
    displayTime = Math.min(MAX_SUBTITLE_DISPLAY_MS, Math.max(MIN_SUBTITLE_DISPLAY_MS, displayTime));
    
    timerRef.current = setTimeout(processQueue, displayTime);
  }, []);

  // Start processing subtitles
  const startProcessing = useCallback(() => {
    if (queueRef.current.length === 0 || isProcessingRef.current) return;
    isProcessingRef.current = true;
    processQueue();
  }, [processQueue]);

  // Add translation to queue
  const addTranslation = useCallback((text) => {
    const chunks = splitTextIntoChunks(text, maxCharsPerLine);
    
    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);
    chunkTimingsRef.current = chunks.map(chunk => ({
      chunk,
      ratio: chunk.length / totalChars
    }));

    queueRef.current = [...queueRef.current, ...chunks];
    setQueue([...queueRef.current]);

    return chunks;
  }, [maxCharsPerLine, splitTextIntoChunks]);

  // Clear all subtitles
  const clear = useCallback(() => {
    queueRef.current = [];
    setQueue([]);
    setCurrentSubtitle('');
    lastProcessedIndexRef.current = -1;
    isProcessingRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Clean up on disable
  useEffect(() => {
    if (!isEnabled) {
      clear();
    }
  }, [isEnabled, clear]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return useMemo(() => ({
    currentSubtitle,
    queue,
    addTranslation,
    startProcessing,
    clear,
    isProcessing: () => isProcessingRef.current,
    setPendingStart: (value) => { pendingStartRef.current = value; },
    isPendingStart: () => pendingStartRef.current,
    hasQueue: () => queueRef.current.length > 0,
    getLastProcessedIndex: () => lastProcessedIndexRef.current,
    setLastProcessedIndex: (index) => { lastProcessedIndexRef.current = index; },
  }), [currentSubtitle, queue, addTranslation, startProcessing, clear]);
}
