/**
 * Codex Launcher - Preload script (IPC bridge)
 * Exposes safe API to the settings renderer process
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig:       () => ipcRenderer.invoke('get-config'),
  saveConfig:      (c) => ipcRenderer.invoke('save-config', c),
  getModels:       () => ipcRenderer.invoke('get-models'),
  addModel:        (m) => ipcRenderer.invoke('add-model', m),
  removeModel:     (id) => ipcRenderer.invoke('remove-model', id),
  setActiveModel:  (id) => ipcRenderer.invoke('set-active-model', id),
  startProxy:      () => ipcRenderer.invoke('start-proxy'),
  stopProxy:       () => ipcRenderer.invoke('stop-proxy'),
  launchCodex:     () => ipcRenderer.invoke('launch-codex'),
  getProxyStatus:  () => ipcRenderer.invoke('proxy-status'),
  getStats:       () => ipcRenderer.invoke('get-stats'),
  speedTest:      () => ipcRenderer.invoke('speed-test'),
});
