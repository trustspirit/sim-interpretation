import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { splitTextIntoChunks, computeChunkDisplayMs } from '../utils/subtitleChunks';

export default function useSubtitle({ isEnabled, maxCharsPerLine = 50 }) {
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [queue, setQueue] = useState([]);

  // Each entry carries its own display time, computed when it was enqueued
  const queueRef = useRef([]);
  const timerRef = useRef(null);
  const lastProcessedIndexRef = useRef(-1);
  const isProcessingRef = useRef(false);
  const pendingStartRef = useRef(false);

  // Process subtitle queue
  const processQueue = useCallback(() => {
    if (queueRef.current.length === 0) {
      isProcessingRef.current = false;
      timerRef.current = null;
      return;
    }

    const item = queueRef.current.shift();
    setQueue([...queueRef.current]);
    setCurrentSubtitle(item.text);
    timerRef.current = setTimeout(processQueue, item.displayMs);
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
    const durations = computeChunkDisplayMs(chunks);
    const items = chunks.map((chunk, i) => ({ text: chunk, displayMs: durations[i] }));

    queueRef.current = [...queueRef.current, ...items];
    setQueue([...queueRef.current]);

    return chunks;
  }, [maxCharsPerLine]);

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
