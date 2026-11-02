/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface DesktopUpdateResult {
  available: boolean
  version?: string
  error?: string
}

interface DesktopBridge {
  isDesktop: true
  version: string
  checkForUpdates: () => Promise<DesktopUpdateResult>
  downloadAndInstall: () => Promise<void>
  openExternal: (url: string) => Promise<void>
}

interface Window {
  shici?: DesktopBridge
}
