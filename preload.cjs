const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getApiKey: () => process.env.OPENAI_API_KEY
});
