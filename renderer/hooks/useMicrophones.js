import { useState, useEffect, useCallback } from 'react';

/**
 * Microphone selection. Enumerating devices requires a getUserMedia grant, so
 * callers that only need the stored selection can pass { enumerate: false }.
 */
export default function useMicrophones({ enumerate = true } = {}) {
  const [microphones, setMicrophones] = useState([]);
  const [selectedMic, setSelectedMic] = useState(() =>
    localStorage.getItem('translatorMic') || ''
  );
  const [error, setError] = useState(null);

  const loadMicrophones = useCallback(async () => {
    try {
      // Request permission first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());

      // Get device list
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices
        .filter(d => d.kind === 'audioinput')
        .map((mic, index) => ({
          deviceId: mic.deviceId,
          label: mic.label,
          index
        }));

      setMicrophones(mics);

      // Set default if none selected
      setSelectedMic(current => (mics.length > 0 && !current ? mics[0].deviceId : current));

      setError(null);
      return mics;
    } catch (err) {
      setError('Mic access required');
      return [];
    }
  }, []);

  const selectMic = useCallback((deviceId) => {
    setSelectedMic(deviceId);
    localStorage.setItem('translatorMic', deviceId);
  }, []);

  useEffect(() => {
    if (!enumerate) return;
    loadMicrophones();

    const handleDeviceChange = () => loadMicrophones();
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  }, [enumerate, loadMicrophones]);

  return {
    microphones,
    selectedMic,
    selectMic,
    error,
    reload: loadMicrophones,
  };
}
