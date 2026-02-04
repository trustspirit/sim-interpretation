import { app, BrowserWindow, systemPreferences, session, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let settingsWindow;
let isSubtitleMode = false;
let normalBounds = null; // Store normal window bounds before subtitle mode

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
    parent: mainWindow,
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  settingsWindow.loadFile('dist/settings.html');
  
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Handle permission requests from renderer
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('Permission requested:', permission);
    if (permission === 'media') {
      callback(true);
    } else {
      callback(true);
    }
  });

  mainWindow.loadFile('dist/index.html');
}

// Window control handlers
ipcMain.on('window-close', () => {
  mainWindow?.close();
});

ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('open-settings', () => {
  createSettingsWindow();
});

ipcMain.on('close-settings', () => {
  settingsWindow?.close();
});

// Subtitle mode handlers
ipcMain.handle('toggle-subtitle-mode', (event, position) => {
  if (!mainWindow) return { success: false };
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const subtitleHeight = 120;
  
  if (!isSubtitleMode) {
    // Enter subtitle mode
    normalBounds = mainWindow.getBounds();
    
    const y = position === 'top' ? 0 : screenHeight - subtitleHeight;
    
    // Make visible on all workspaces including fullscreen apps
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setBounds({
      x: 0,
      y: y,
      width: screenWidth,
      height: subtitleHeight
    });
    mainWindow.setMinimumSize(400, 80);
    mainWindow.setResizable(true);
    isSubtitleMode = true;
    
    return { success: true, isSubtitleMode: true };
  } else {
    // Exit subtitle mode
    mainWindow.setVisibleOnAllWorkspaces(false);
    mainWindow.setAlwaysOnTop(false);
    if (normalBounds) {
      mainWindow.setBounds(normalBounds);
    }
    mainWindow.setMinimumSize(600, 500);
    isSubtitleMode = false;
    
    return { success: true, isSubtitleMode: false };
  }
});

ipcMain.handle('update-subtitle-position', (event, position) => {
  if (!mainWindow || !isSubtitleMode) return { success: false };
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { height: screenHeight } = primaryDisplay.workAreaSize;
  const currentBounds = mainWindow.getBounds();
  
  const y = position === 'top' ? 0 : screenHeight - currentBounds.height;
  
  mainWindow.setBounds({
    ...currentBounds,
    y: y
  });
  
  return { success: true };
});

ipcMain.handle('get-subtitle-mode', () => {
  return isSubtitleMode;
});

app.whenReady().then(createWindow);

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
