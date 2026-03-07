const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getApiKey: () => process.env.OPENAI_API_KEY,
  closeWindow: () => ipcRenderer.send('window-close'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  fullscreenWindow: () => ipcRenderer.send('window-fullscreen'),
  isFullscreen: () => ipcRenderer.sendSync('window-fullscreen-status'),
  onFullscreenChanged: (callback) => ipcRenderer.on('fullscreen-changed', (_, isFullscreen) => callback(isFullscreen)),
  openSettings: () => ipcRenderer.send('open-settings'),
  closeSettings: () => ipcRenderer.send('close-settings'),
  onSettingsClosed: (callback) => ipcRenderer.on('settings-closed', callback),
  // Subtitle mode APIs
  toggleSubtitleMode: (position) => ipcRenderer.invoke('toggle-subtitle-mode', position),
  updateSubtitlePosition: (position) => ipcRenderer.invoke('update-subtitle-position', position),
  getSubtitleMode: () => ipcRenderer.invoke('get-subtitle-mode'),
  // DevTools
  toggleDevTools: () => ipcRenderer.send('toggle-devtools')
});
