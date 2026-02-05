import { useState, useEffect, useCallback } from 'react';

export default function useMicrophones() {
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
      if (mics.length > 0 && !selectedMic) {
        setSelectedMic(mics[0].deviceId);
      }
      
      setError(null);
      return mics;
    } catch (err) {
      setError('Mic access required');
      return [];
    }
  }, [selectedMic]);

  const selectMic = useCallback((deviceId) => {
    setSelectedMic(deviceId);
    localStorage.setItem('translatorMic', deviceId);
  }, []);

  useEffect(() => {
    loadMicrophones();
  }, [loadMicrophones]);

  return {
    microphones,
    selectedMic,
    selectMic,
    error,
    reload: loadMicrophones,
  };
}
