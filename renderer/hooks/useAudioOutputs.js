import { useState, useEffect, useCallback } from 'react';

export default function useAudioOutputs() {
  const [outputs, setOutputs] = useState([]);
  const [selectedOutput, setSelectedOutput] = useState(() =>
    localStorage.getItem('translatorAudioOutput') || ''
  );
  const [error, setError] = useState(null);

  const loadOutputs = useCallback(async () => {
    try {
      // Get device list (no permission needed for output devices)
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices
        .filter(d => d.kind === 'audiooutput')
        .map((output, index) => ({
          deviceId: output.deviceId,
          label: output.label || `Speaker ${index + 1}`,
          index
        }));

      setOutputs(audioOutputs);

      // Set default if none selected (use callback form to avoid dependency)
      setSelectedOutput(current => {
        if (audioOutputs.length > 0 && !current) {
          const defaultDevice = audioOutputs.find(d => d.deviceId === 'default') || audioOutputs[0];
          return defaultDevice.deviceId;
        }
        return current;
      });

      setError(null);
      return audioOutputs;
    } catch (err) {
      setError('Failed to load audio outputs');
      return [];
    }
  }, []); // No dependencies - uses callback form for state

  const selectOutput = useCallback((deviceId) => {
    setSelectedOutput(deviceId);
    localStorage.setItem('translatorAudioOutput', deviceId);
  }, []);

  useEffect(() => {
    loadOutputs();

    // Listen for device changes
    const handleDeviceChange = () => loadOutputs();
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [loadOutputs]);

  return {
    outputs,
    selectedOutput,
    selectOutput,
    error,
    reload: loadOutputs,
  };
}
