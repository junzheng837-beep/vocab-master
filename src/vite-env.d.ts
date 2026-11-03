/// <reference types="vite/client" />

declare const __APP_VERSION__: string

/** 云同步配置，见 .env.example；留空则应用运行在纯本地模式 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

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
