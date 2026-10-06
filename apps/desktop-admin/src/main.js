const { app, BrowserWindow, shell, ipcMain, session, globalShortcut } = require('electron');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const PORTAL_URL = process.env.PORTAL_URL || (isDev ? 'http://localhost:3002' : 'https://odyssey-admin.pages.dev');
const APP_SECRET_KEY = process.env.APP_SECRET_KEY || 'odyssey_desktop_admin_secure_key';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Odyssey Healthcare OS - Admin & POS',
    icon: path.join(__dirname, '../assets/odc-logo.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Inject security headers on all outgoing requests for Cloudflare WAF verification
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['X-Odyssey-App-Key'] = APP_SECRET_KEY;
    details.requestHeaders['X-Odyssey-Client-Type'] = 'desktop-admin';
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  function loadPortal() {
    mainWindow.loadURL(PORTAL_URL).catch((err) => {
      console.warn(`Portal (${PORTAL_URL}) not reachable yet. Retrying in 2s...`);
      if (isDev) {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            loadPortal();
          }
        }, 2000);
      }
    });
  }

  loadPortal();

  // If page fails to load, render a friendly reconnecting UI
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (errorCode === -102 || errorCode === -105 || errorCode === -106) {
      const offlineHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connecting to Odyssey...</title>
            <style>
              body {
                background: #0f172a;
                color: #f8fafc;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                text-align: center;
              }
              .card {
                background: #1e293b;
                padding: 2.5rem;
                border-radius: 12px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                max-width: 440px;
                border: 1px solid #334155;
              }
              h2 { margin-top: 0; color: #38bdf8; }
              p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
              .spinner {
                border: 3px solid rgba(255,255,255,0.1);
                border-top: 3px solid #38bdf8;
                border-radius: 50%;
                width: 32px;
                height: 32px;
                animation: spin 1s linear infinite;
                margin: 1.5rem auto 1rem;
              }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              button {
                background: #0284c7;
                color: white;
                border: none;
                padding: 0.6rem 1.4rem;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                margin-top: 1rem;
              }
              button:hover { background: #0369a1; }
              code { background: #0f172a; padding: 0.2rem 0.4rem; border-radius: 4px; color: #e2e8f0; font-size: 0.85rem; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Odyssey Admin & POS</h2>
              <div class="spinner"></div>
              <p>Connecting to portal at <code>${PORTAL_URL}</code>...</p>
              <p style="font-size: 0.85rem; color: #64748b;">${isDev ? 'Please ensure <code>pnpm dev</code> is running in your terminal.' : 'Checking internet and server connection...'}</p>
              <button onclick="window.location.href='${PORTAL_URL}'">Retry Now</button>
            </div>
          </body>
        </html>
      `;
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(offlineHtml)}`);
      if (isDev) {
        setTimeout(loadPortal, 2500);
      }
    }
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for POS & Hardware
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  return mainWindow.webContents.getPrintersAsync();
});

ipcMain.handle('print-receipt', async (_event, options = {}) => {
  if (!mainWindow) return { success: false, error: 'Window not available' };
  const { deviceName, silent = true } = options;

  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent,
        printBackground: true,
        deviceName: deviceName || undefined,
        margins: { marginType: 'none' },
      },
      (success, failureReason) => {
        if (!success) {
          resolve({ success: false, error: failureReason });
        } else {
          resolve({ success: true });
        }
      }
    );
  });
});

app.whenReady().then(() => {
  createWindow();

  // Register developer shortcuts (F12 for DevTools, F5 for Reload)
  globalShortcut.register('F12', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });
  globalShortcut.register('F5', () => {
    if (mainWindow) mainWindow.webContents.reload();
  });
  globalShortcut.register('CommandOrControl+R', () => {
    if (mainWindow) mainWindow.webContents.reload();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
