import { app, BrowserWindow, dialog } from "electron";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let shuttingDown = false;
let serviceManager = null;

const mainLogPath = path.join(
  os.homedir(),
  "Library",
  "Logs",
  "LitPanel-main.log"
);

function writeMainLog(message) {
  try {
    fs.mkdirSync(path.dirname(mainLogPath), { recursive: true });
    fs.appendFileSync(mainLogPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // ignore logging failures
  }
}

if (app.isPackaged) {
  const desktopDataDir = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "Lit Panel"
  );
  app.setPath("userData", desktopDataDir);
  process.env.NBER_DESKTOP_BUNDLE_ROOT = path.join(process.resourcesPath, "app-bundle");
  process.env.NBER_DESKTOP_RUNTIME_DIR = path.join(desktopDataDir, "runtime");
  process.env.NBER_DESKTOP_USER_DATA_DIR = desktopDataDir;
}

writeMainLog(`main process started; packaged=${app.isPackaged}; resourcesPath=${process.resourcesPath}`);

async function getServiceManager() {
  if (!serviceManager) {
    writeMainLog("loading service manager");
    serviceManager = await import("./src/service-manager.mjs");
    writeMainLog("service manager loaded");
  }
  return serviceManager;
}

function createLoadingWindow(logPaths = null) {
  const preloadPath = path.join(__dirname, "preload.mjs");
  writeMainLog("creating loading window");
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: "#f7f6f1",
    title: "Lit Panel",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const loadingHtml = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Lit Panel</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: Georgia, "Times New Roman", serif;
            background: #f7f6f1;
            color: #151512;
          }
          .shell {
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: clamp(32px, 6vw, 88px);
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 16px;
            padding-bottom: 18px;
            border-bottom: 1px solid #d8d5ca;
          }
          .mark {
            position: relative;
            width: 34px;
            height: 34px;
            border-left: 3px solid #151512;
            border-bottom: 3px solid #151512;
          }
          .mark span {
            position: absolute;
            bottom: 5px;
            width: 4px;
            background: #151512;
          }
          .mark span:nth-child(1) { left: 6px; height: 14px; }
          .mark span:nth-child(2) { left: 14px; height: 22px; }
          .mark span:nth-child(3) { left: 22px; height: 10px; }
          .mark::after {
            content: "";
            position: absolute;
            top: 2px;
            right: 0;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #168846;
          }
          .brand-name {
            font-size: 25px;
          }
          .brand-name em {
            color: #168846;
            font-weight: 400;
          }
          .status {
            width: min(760px, 100%);
            padding: 8vh 0;
          }
          .eyebrow {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 11px;
            letter-spacing: 0;
            text-transform: uppercase;
            color: #747064;
            margin-bottom: 18px;
          }
          h1 {
            margin: 0;
            max-width: 680px;
            font-size: clamp(40px, 6vw, 72px);
            line-height: 1.02;
            font-weight: 400;
          }
          p {
            margin: 20px 0 0;
            font-size: 16px;
            line-height: 1.55;
            color: #5f5b50;
          }
          .pulse {
            position: relative;
            margin-top: 34px;
            height: 2px;
            width: 100%;
            overflow: hidden;
            background: #d8d5ca;
          }
          .pulse::after {
            content: "";
            display: block;
            width: 24%;
            height: 100%;
            background: #168846;
            animation: move 1.3s cubic-bezier(.2,.8,.2,1) infinite;
          }
          .meta {
            padding-top: 16px;
            border-top: 1px solid #d8d5ca;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 10px;
            line-height: 1.7;
            color: #747064;
            overflow-wrap: anywhere;
          }
          @keyframes move {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(360%); }
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <div class="brand">
            <div class="mark" aria-hidden="true"><span></span><span></span><span></span></div>
            <div class="brand-name">Lit <em>Panel</em></div>
          </div>
          <div class="status">
            <div class="eyebrow">Local research workspace</div>
            <h1>Opening your reading room</h1>
            <p>Starting the local library and research interface.</p>
            <div class="pulse"></div>
          </div>
          <div class="meta">Library: ${logPaths?.backendLog ?? "preparing runtime..."}<br />Interface: ${logPaths?.frontendLog ?? "preparing runtime..."}</div>
        </div>
      </body>
    </html>
  `;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`);
  win.once("ready-to-show", () => {
    writeMainLog("loading window ready-to-show");
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void import("electron").then(({ shell }) => shell.openExternal(url));
    return { action: "deny" };
  });

  return win;
}

async function bootApp() {
  writeMainLog("bootApp start");
  mainWindow = createLoadingWindow();

  try {
    const manager = await getServiceManager();
    writeMainLog("starting services");
    await manager.startServices();
    writeMainLog("services started");
    if (!mainWindow || mainWindow.isDestroyed()) {
      writeMainLog("main window missing after services start");
      return;
    }
    writeMainLog(`loading frontend url ${manager.FRONTEND_URL}`);
    await mainWindow.loadURL(manager.FRONTEND_URL);
    writeMainLog("frontend loaded into window");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (shuttingDown) {
      writeMainLog(`boot interrupted during shutdown: ${message}`);
      return;
    }
    writeMainLog(`boot error: ${message}`);
    await dialog.showMessageBox({
      type: "error",
      title: "Lit Panel failed to start",
      message,
      detail: `Check logs:\n${mainLogPath}`,
    });
    await app.quit();
  }
}

async function shutdownApp() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  writeMainLog("shutdownApp start");
  const manager = await getServiceManager();
  await manager.stopServices();
  writeMainLog("shutdownApp complete");
}

app.on("window-all-closed", () => {
  writeMainLog("window-all-closed");
  app.quit();
});

app.on("before-quit", (event) => {
  if (shuttingDown) {
    return;
  }
  event.preventDefault();
  writeMainLog("before-quit intercepted");
  void shutdownApp().finally(() => {
    app.quit();
  });
});

app.on("activate", () => {
  writeMainLog("activate event");
  if (BrowserWindow.getAllWindows().length === 0) {
    void bootApp();
  }
});

app.whenReady()
  .then(() => {
    writeMainLog("app.whenReady resolved");
    void bootApp();
  })
  .catch((error) => {
    writeMainLog(`app.whenReady rejected: ${error instanceof Error ? error.message : String(error)}`);
  });
