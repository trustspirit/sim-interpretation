const { contextBridge, ipcRenderer } = require('electron');

// Subscribe to a main-process channel; returns an unsubscribe function
const subscribe = (channel, callback) => {
  const listener = (_, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('electronAPI', {
  // API key (stored encrypted in the main process; .env is the fallback)
  getApiKeyInfo: () => ipcRenderer.invoke('api-key:info'),
  getEffectiveApiKey: () => ipcRenderer.invoke('api-key:effective'),
  setApiKey: (value) => ipcRenderer.invoke('api-key:set', value),
  // Window controls
  closeWindow: () => ipcRenderer.send('window-close'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  fullscreenWindow: () => ipcRenderer.send('window-fullscreen'),
  isFullscreen: () => ipcRenderer.sendSync('window-fullscreen-status'),
  onFullscreenChanged: (callback) => subscribe('fullscreen-changed', callback),
  openSettings: () => ipcRenderer.send('open-settings'),
  closeSettings: () => ipcRenderer.send('close-settings'),
  onSettingsClosed: (callback) => subscribe('settings-closed', callback),
  // Subtitle mode APIs
  toggleSubtitleMode: (position) => ipcRenderer.invoke('toggle-subtitle-mode', position),
  updateSubtitlePosition: (position) => ipcRenderer.invoke('update-subtitle-position', position),
  getSubtitleMode: () => ipcRenderer.invoke('get-subtitle-mode'),
  // DevTools
  toggleDevTools: () => ipcRenderer.send('toggle-devtools')
});
