import { app, BrowserWindow, systemPreferences, session, ipcMain, screen, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createApiKeyStore } from './main/apiKeyStore.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let settingsWindow = null;
let isSubtitleMode = false;
let normalBounds = null; // Store normal window bounds before subtitle mode
let apiKeyStore = null;

const webPreferences = {
  preload: path.join(__dirname, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 400,
    height: 500,
    minWidth: 350,
    minHeight: 400,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0a',
    parent: mainWindow ?? undefined,
    modal: false,
    webPreferences,
  });

  settingsWindow.loadFile(path.join(__dirname, 'dist', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings-closed');
    }
  });
}

async function createWindow() {
  // macOS microphone permission request
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    console.log('Microphone status:', micStatus);
    if (micStatus !== 'granted') {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      console.log('Microphone permission granted:', granted);
    }
  }

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    icon: path.join(__dirname, 'assets', process.platform === 'darwin' ? 'icon.icns' : 'icon.png'),
    webPreferences,
  });

  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

  // Notify renderer of fullscreen changes
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-changed', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    isSubtitleMode = false;
    normalBounds = null;
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!mainWindow) return;
    // DevTools: Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux)
    if ((input.meta && input.alt && input.code === 'KeyI') ||
        (input.control && input.shift && input.code === 'KeyI') ||
        input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
    // Fullscreen: Cmd+Ctrl+F (Mac) or F11 (Windows/Linux)
    if (input.key === 'F11' || (input.meta && input.control && input.code === 'KeyF')) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
    // Exit fullscreen with Escape
    if (input.key === 'Escape' && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  });
}

const liveMainWindow = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);

// Window control handlers
ipcMain.on('window-close', () => {
  liveMainWindow()?.close();
});

ipcMain.on('window-minimize', () => {
  liveMainWindow()?.minimize();
});

ipcMain.on('window-maximize', () => {
  const win = liveMainWindow();
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on('window-fullscreen', () => {
  const win = liveMainWindow();
  if (win) win.setFullScreen(!win.isFullScreen());
});

ipcMain.on('window-fullscreen-status', (event) => {
  event.returnValue = liveMainWindow()?.isFullScreen() ?? false;
});

ipcMain.on('open-settings', () => {
  createSettingsWindow();
});

ipcMain.on('toggle-devtools', () => {
  liveMainWindow()?.webContents.toggleDevTools();
});

ipcMain.on('close-settings', () => {
  settingsWindow?.close();
});

// API key: stored encrypted with safeStorage in userData, .env as fallback
ipcMain.handle('api-key:info', () => apiKeyStore.info());
ipcMain.handle('api-key:effective', () => apiKeyStore.getEffective());
ipcMain.handle('api-key:set', (event, value) => {
  try {
    apiKeyStore.set(typeof value === 'string' ? value : '');
    return { success: true };
  } catch (err) {
    console.error('[api-key] store failed:', err.message);
    return { success: false, error: err.message };
  }
});

// Helper function to calculate subtitle position on the display the window is on
function getSubtitlePosition(win, position, subtitleHeight) {
  const display = screen.getDisplayMatching(win.getBounds());
  const bounds = display.bounds;
  const workArea = display.workArea;

  // Check if we're likely in fullscreen mode (no dock/menubar difference or minimal)
  const isFullscreen = (bounds.height - workArea.height) < 30;

  if (isFullscreen) {
    // Fullscreen: use full screen bounds
    const y = position === 'top' ? bounds.y : bounds.y + bounds.height - subtitleHeight;
    return { x: bounds.x, y, width: bounds.width };
  } else {
    // Normal desktop: respect dock and menubar
    const y = position === 'top' ? workArea.y : workArea.y + workArea.height - subtitleHeight;
    return { x: workArea.x, y, width: workArea.width };
  }
}

// Subtitle mode handlers
ipcMain.handle('toggle-subtitle-mode', (event, position) => {
  const win = liveMainWindow();
  if (!win) return { success: false };

  const subtitleHeight = 160;

  if (!isSubtitleMode) {
    // Enter subtitle mode
    normalBounds = win.getBounds();

    const pos = getSubtitlePosition(win, position, subtitleHeight);

    // Set size constraints first
    win.setMinimumSize(400, 60);
    win.setMaximumSize(pos.width, subtitleHeight);

    // Make visible on all workspaces including fullscreen apps
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setHasShadow(false); // Disable shadow for transparency

    // Set size and position
    win.setSize(pos.width, subtitleHeight);
    win.setPosition(pos.x, pos.y);

    win.setResizable(true);
    isSubtitleMode = true;

    return { success: true, isSubtitleMode: true };
  } else {
    // Exit subtitle mode - remove size constraints first
    win.setMinimumSize(600, 500);
    win.setMaximumSize(10000, 10000); // Large number to effectively remove limit

    win.setVisibleOnAllWorkspaces(false);
    win.setAlwaysOnTop(false);
    win.setHasShadow(true); // Re-enable shadow
    win.setResizable(true);

    if (normalBounds) {
      win.setBounds(normalBounds);
    }
    isSubtitleMode = false;

    return { success: true, isSubtitleMode: false };
  }
});

ipcMain.handle('update-subtitle-position', (event, position) => {
  const win = liveMainWindow();
  if (!win || !isSubtitleMode) return { success: false };

  const currentBounds = win.getBounds();
  const pos = getSubtitlePosition(win, position, currentBounds.height);

  win.setPosition(pos.x, pos.y);

  return { success: true };
});

ipcMain.handle('get-subtitle-mode', () => {
  return isSubtitleMode;
});

app.whenReady().then(() => {
  apiKeyStore = createApiKeyStore({
    filePath: path.join(app.getPath('userData'), 'openai-api-key.enc'),
    env: process.env,
    safeStorage,
    fs,
  });

  // Only microphone/speaker access is ever needed by the renderer
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('Permission requested:', permission);
    callback(permission === 'media');
  });

  // Set dock icon on macOS
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    app.dock.setIcon(iconPath);
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
