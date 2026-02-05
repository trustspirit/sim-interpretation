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
    icon: path.join(__dirname, 'assets', process.platform === 'darwin' ? 'icon.icns' : 'icon.png'),
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

  // Open DevTools with Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.meta && input.alt && input.key === 'i') ||
        (input.control && input.shift && input.key === 'I') ||
        input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });
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

ipcMain.on('toggle-devtools', () => {
  mainWindow?.webContents.toggleDevTools();
});

ipcMain.on('close-settings', () => {
  settingsWindow?.close();
});

// Helper function to calculate subtitle position
function getSubtitlePosition(position, subtitleHeight) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const bounds = primaryDisplay.bounds;
  const workArea = primaryDisplay.workArea;
  
  // Check if we're likely in fullscreen mode (no dock/menubar difference or minimal)
  const isFullscreen = (bounds.height - workArea.height) < 30;
  
  if (isFullscreen) {
    // Fullscreen: use full screen bounds
    const y = position === 'top' ? 0 : bounds.height - subtitleHeight;
    return { x: bounds.x, y, width: bounds.width };
  } else {
    // Normal desktop: respect dock and menubar
    const y = position === 'top' ? workArea.y : workArea.y + workArea.height - subtitleHeight;
    return { x: workArea.x, y, width: workArea.width };
  }
}

// Subtitle mode handlers
ipcMain.handle('toggle-subtitle-mode', (event, position) => {
  if (!mainWindow) return { success: false };
  
  const subtitleHeight = 160;
  
  if (!isSubtitleMode) {
    // Enter subtitle mode
    normalBounds = mainWindow.getBounds();
    
    const pos = getSubtitlePosition(position, subtitleHeight);
    
    // Set size constraints first
    mainWindow.setMinimumSize(400, 60);
    mainWindow.setMaximumSize(pos.width, subtitleHeight);
    
    // Make visible on all workspaces including fullscreen apps
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setHasShadow(false); // Disable shadow for transparency
    
    // Set size and position
    mainWindow.setSize(pos.width, subtitleHeight);
    mainWindow.setPosition(pos.x, pos.y);
    
    mainWindow.setResizable(true);
    isSubtitleMode = true;
    
    return { success: true, isSubtitleMode: true };
  } else {
    // Exit subtitle mode - remove size constraints first
    mainWindow.setMinimumSize(600, 500);
    mainWindow.setMaximumSize(10000, 10000); // Large number to effectively remove limit

    mainWindow.setVisibleOnAllWorkspaces(false);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setHasShadow(true); // Re-enable shadow
    mainWindow.setResizable(true);

    if (normalBounds) {
      mainWindow.setBounds(normalBounds);
    }
    isSubtitleMode = false;

    return { success: true, isSubtitleMode: false };
  }
});

ipcMain.handle('update-subtitle-position', (event, position) => {
  if (!mainWindow || !isSubtitleMode) return { success: false };
  
  const currentBounds = mainWindow.getBounds();
  const pos = getSubtitlePosition(position, currentBounds.height);
  
  mainWindow.setPosition(pos.x, pos.y);
  
  return { success: true };
});

ipcMain.handle('get-subtitle-mode', () => {
  return isSubtitleMode;
});

app.whenReady().then(() => {
  // Set dock icon on macOS
  if (process.platform === 'darwin') {
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
