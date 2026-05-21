/**
 * Codex Launcher - Multi-model launcher for OpenAI Codex
 * Electron main process: tray menu, proxy lifecycle, Codex integration
 * Supports: macOS / Windows / Linux
 */

const { app, Tray, Menu, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');

// Configuration paths
const CONFIG_DIR = path.join(app.getPath('home'), '.codex-launcher');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CODEX_CONFIG = path.join(app.getPath('home'), '.codex', 'config.toml');

// Default model presets (user can customize)
const DEFAULT_MODELS = [
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'deepseek',
    apiKey: '', apiHost: 'api.deepseek.com', pathPrefix: '' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'deepseek',
    apiKey: '', apiHost: 'api.deepseek.com', pathPrefix: '' },
  { id: 'qwen-max', name: 'Qwen Max', provider: 'qwen',
    apiKey: '', apiHost: 'dashscope.aliyuncs.com', pathPrefix: '/compatible-mode' },
  { id: 'qwen-plus', name: 'Qwen Plus', provider: 'qwen',
    apiKey: '', apiHost: 'dashscope.aliyuncs.com', pathPrefix: '/compatible-mode' },
  { id: 'openai/gpt-4o', name: 'GPT-4o (OpenRouter)', provider: 'openrouter',
    apiKey: '', apiHost: 'openrouter.ai', pathPrefix: '/api/v1' },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (OR)', provider: 'openrouter',
    apiKey: '', apiHost: 'openrouter.ai', pathPrefix: '/api/v1' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (OR)', provider: 'openrouter',
    apiKey: '', apiHost: 'openrouter.ai', pathPrefix: '/api/v1' },
];

// Global state
let config = { port: 53683, models: [...DEFAULT_MODELS], activeModel: DEFAULT_MODELS[0].id };
let tray = null, proxyProcess = null, mainWindow = null;

// ── Config persistence ──

function loadConfig() {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (fs.existsSync(CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } else {
      saveConfig();
    }
  } catch(e) { /* use defaults */ }
}

function saveConfig() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  writeCodexConfig();
  writeProxyToml();
}

// ── Write Codex configuration ──

function writeCodexConfig() {
  // Points Codex to our local proxy via config.toml base_url
  const codexDir = path.join(app.getPath('home'), '.codex');
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(CODEX_CONFIG,
`model_provider = "OpenAI"
model = "gpt-5.4"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.OpenAI]
requires_openai_auth = true
wire_api = "responses"
base_url = "http://127.0.0.1:${config.port}/v1"
name = "OpenAI"
`);
}

function writeProxyToml() {
  // Write proxy.toml with model mappings for the proxy process
  const proxyToml = path.join(app.getPath('home'), '.codex', 'proxy.toml');
  let tom = 'default_backend = "deepseek"\n\n[models]\n';
  for (const m of config.models) {
    tom += `"${m.id}" = { backend = "${m.provider}", model = "${m.id}" }\n`;
  }
  tom += '\n';
  for (const m of config.models) {
    if (!tom.includes(`[backends.${m.provider}]`)) {
      tom += `[backends.${m.provider}]\n`;
      tom += `host = "${m.apiHost || 'api.deepseek.com'}"\n`;
      if (m.pathPrefix) tom += `path_prefix = "${m.pathPrefix}"\n`;
      tom += 'protocol = "openai-compatible"\n';
      if (m.apiKey) tom += `api_key = "${m.apiKey}"\n`;
      tom += '\n';
    }
  }
  fs.writeFileSync(proxyToml, tom);
}

// ── Proxy lifecycle ──

function startProxy() {
  if (proxyProcess) return;
  const proxyPath = path.join(__dirname, 'proxy.js');
  proxyProcess = spawn(process.execPath, [proxyPath, String(config.port)], {
    env: { ...process.env, CONFIG_FILE },
    stdio: 'ignore'
  });
  proxyProcess.on('error', () => { proxyProcess = null; });
  proxyProcess.on('exit', () => { proxyProcess = null; });
}

function stopProxy() { if (proxyProcess) { proxyProcess.kill(); proxyProcess = null; } }

function hotReload() {
  // SIGHUP triggers config reload without restarting
  try { proxyProcess.kill('SIGHUP'); } catch(e) { startProxy(); }
}

// ── Codex application launcher ──

function launchCodex() {
  writeCodexConfig();
  startProxy();

  // Try desktop app first, fall back to CLI
  const desktopPaths = [
    '/Applications/Codex.app',
    path.join(app.getPath('home'), 'Applications/Codex.app'),
  ];
  for (const p of desktopPaths) {
    if (fs.existsSync(p)) { exec(`open "${p}"`); return; }
  }

  // Fall back to CLI (Windows / Linux)
  spawn('codex', [], { stdio: 'inherit', shell: true });
}

// ── Tray icon ──

function makeIcon() {
  // Generate a simple 16x16 tray icon on first run
  const iconPath = path.join(CONFIG_DIR, 'tray-icon.png');
  if (!fs.existsSync(iconPath)) {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABMklEQVQ4T2NkoDFgpLH5DK5' +
      'uXgx//vxh4ODgYJg6dQoDJRAZ5cXAwcFBeQM+f/nO4Ojiw1BZUcTgYO/E8O3rZ2BrmJiYKGrD' +
      'x48fGf7//0+xDQAxfJ0+LOszggAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(iconPath, png);
  }
  return nativeImage.createFromPath(iconPath);
}

// ── Tray menu ──

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: '🚀 Launch Codex', click: launchCodex },
    { type: 'separator' },
    { label: '▸ Select Model', enabled: false },
    ...config.models.map(m => ({
      label: (m.id === config.activeModel ? '✓ ' : '  ') + m.name,
      click: () => {
        config.activeModel = m.id;
        saveConfig();
        hotReload();
        tray.setContextMenu(buildMenu());
      }
    })),
    { type: 'separator' },
    { label: '⚙ Model Settings...', click: () => {
        if (mainWindow) mainWindow.show();
        else openSettings();
    }},
    { type: 'separator' },
    { label: `Proxy :${config.port} ${proxyProcess ? '🟢' : '🔴'}`, enabled: false },
    { label: proxyProcess ? 'Stop Proxy' : 'Start Proxy', click: () => {
        proxyProcess ? stopProxy() : startProxy();
        tray.setContextMenu(buildMenu());
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

// ── Settings window ──

function openSettings() {
  mainWindow = new BrowserWindow({
    width: 620, height: 700,
    title: 'Codex Launcher - Model Settings',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'settings.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC handlers ──

ipcMain.handle('get-config', () => config);
ipcMain.handle('save-config', (e, c) => {
  config = c; saveConfig(); stopProxy(); startProxy();
  tray.setContextMenu(buildMenu());
});
ipcMain.handle('get-models', () => config.models);
ipcMain.handle('add-model', (e, m) => {
  config.models.push(m); saveConfig(); hotReload();
  tray.setContextMenu(buildMenu());
});
ipcMain.handle('remove-model', (e, id) => {
  config.models = config.models.filter(m => m.id !== id);
  saveConfig(); hotReload(); tray.setContextMenu(buildMenu());
});
ipcMain.handle('set-active-model', (e, id) => {
  config.activeModel = id; saveConfig(); hotReload();
  tray.setContextMenu(buildMenu());
});
ipcMain.handle('start-proxy', () => { startProxy(); return !!proxyProcess; });
ipcMain.handle('stop-proxy', () => { stopProxy(); return true; });
ipcMain.handle('launch-codex', () => { launchCodex(); });
ipcMain.handle('proxy-status', () => !!proxyProcess);

// ── App lifecycle ──

app.whenReady().then(() => {
  loadConfig();
  startProxy();
  tray = new Tray(makeIcon());
  tray.setToolTip('Codex Launcher');
  tray.setContextMenu(buildMenu());
  tray.on('double-click', launchCodex);
});

app.on('before-quit', stopProxy);
