const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure that SIMC_PATH is read from settings before server boots if available
try {
  // Use Electron's userData path to store local settings/databases to avoid EPERM on Program Files
  const userHome = app.getPath('userData');
  process.env.LOCALSIMDASH_ROOT = userHome;
  
  const settingsPath = path.join(userHome, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.simcPath) {
      process.env.SIMC_PATH = settings.simcPath;
    }
  }
} catch (e) {
  console.error('Failed to load initial settings:', e);
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'build', 'icon.jpg'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // The server starts on port 4317 unless LOCALSIMDASH_PORT overrides it
  mainWindow.loadURL(`http://127.0.0.1:${process.env.LOCALSIMDASH_PORT || 4317}`);
}

// Make dialog available globally so the express server can require('electron') and use it
app.whenReady().then(() => {
  // Start the server. 
  // In a packaged environment, it runs from dist-server/index.js
  try {
    require('./dist-server/index.js');
  } catch (err) {
    console.error("Failed to start server from electron-main.cjs:", err);
  }

  // Wait a moment for server to listen before opening window
  setTimeout(createWindow, 500);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
