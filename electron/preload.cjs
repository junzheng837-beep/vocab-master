// @ts-check
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('shici', {
  isDesktop: true,
  version: process.env.APP_VERSION || '',
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadAndInstall: () => ipcRenderer.invoke('update:install'),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
})
