const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { pathToFileURL } = require('url');

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

const PORT = Number(process.env.LOCALSIMDASH_PORT) || 4317;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'build', 'icon.jpg'),
    webPreferences: {
      // The dashboard is an ordinary web page that talks to the local API over
      // HTTP and uses no Node or Electron API, so it is given none. It renders
      // item names and tooltip text that originate from addon exports and the
      // Blizzard API, and that is not content to hand Node access to.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(SERVER_URL);
}

/**
 * tsc emits to dist-server/server/ when the build also pulls in shared/, and
 * directly to dist-server/ when it does not. Accept either so a layout change
 * cannot silently leave the desktop app pointing at a file that is not there.
 */
function resolveServerEntry() {
  const candidates = [
    path.join(__dirname, 'dist-server', 'server', 'index.js'),
    path.join(__dirname, 'dist-server', 'index.js')
  ];
  return candidates.find(candidate => fs.existsSync(candidate));
}

function startServer() {
  const entry = resolveServerEntry();
  if (!entry) {
    throw new Error('The compiled dashboard server was not found. Run "npm run build:server" before packaging.');
  }
  // The compiled server is ESM and Electron 32 runs Node 20, where require() of
  // an ES module throws ERR_REQUIRE_ESM. It has to be imported dynamically, and
  // on Windows the specifier must be a file:// URL rather than a drive path.
  return import(pathToFileURL(entry).href);
}

/** Resolve once the API answers, so the window never opens on a refused connection. */
function waitForServer(timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(`${SERVER_URL}/api/health`, response => {
        response.resume();
        if (response.statusCode === 200) return resolve();
        retry();
      });
      request.on('error', retry);
      request.setTimeout(2000, () => request.destroy());
    };
    const retry = () => {
      // The first start downloads a SimC nightly before it listens, so this
      // waits minutes rather than seconds.
      if (Date.now() > deadline) return reject(new Error(`The dashboard server did not start within ${Math.round(timeoutMs / 1000)}s.`));
      setTimeout(attempt, 500);
    };
    attempt();
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
    await waitForServer();
  } catch (err) {
    // Failing loudly beats a window showing a connection error with no cause.
    console.error('Failed to start the dashboard server:', err);
    dialog.showErrorBox('Local Sim Dashboard', `The dashboard server could not start.\n\n${err && err.message ? err.message : err}`);
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
