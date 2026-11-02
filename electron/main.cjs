// @ts-check
const { app, BrowserWindow, protocol, shell, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const isDev = !app.isPackaged
/** 应用静态资源根目录 */
const ROOT = path.join(__dirname, '..', 'dist', 'app')

// 自定义协议：给桌面端一个稳定的 origin（app://shici），
// IndexedDB、fetch 都能正常工作，也不会因为端口变化丢数据。
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

/** 防止路径穿越，确保只能访问 ROOT 内的文件 */
function safePath(urlPath) {
  let p = decodeURIComponent(urlPath || '/')
  if (p === '/' || p === '') p = '/index.html'
  const resolved = path.normalize(path.join(ROOT, p))
  if (!resolved.startsWith(path.normalize(ROOT))) return null
  return resolved
}

function registerProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url)
      let file = safePath(url.pathname)
      if (!file) return new Response('forbidden', { status: 403 })
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        // SPA 兜底
        file = path.join(ROOT, 'index.html')
      }
      const data = await fs.promises.readFile(file)
      const ext = path.extname(file).toLowerCase()
      return new Response(data, {
        status: 200,
        headers: { 'content-type': MIME[ext] || 'application/octet-stream' },
      })
    } catch (err) {
      console.error('[main] 协议处理失败', err)
      return new Response('not found', { status: 404 })
    }
  })
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    title: '拾词易记',
    backgroundColor: '#1c1c1e',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // 外链走系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.loadURL('app://shici/index.html')

  if (isDev && process.env.SHICI_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

/* ---------------------------------------------------------------- 自动更新 */

let autoUpdater = null
try {
  // 只有打包后才启用，开发环境没有更新配置
  if (!isDev) {
    autoUpdater = require('electron-updater').autoUpdater
    autoUpdater.autoDownload = false
    autoUpdater.logger = console
    autoUpdater.on('error', (e) => console.error('[update] 出错', e))
    autoUpdater.on('update-available', (info) =>
      console.log('[update] 发现新版本', info.version)
    )
  }
} catch (err) {
  console.warn('[update] electron-updater 未就绪，跳过自动更新', err.message)
}

ipcMain.handle('update:check', async () => {
  if (!autoUpdater) return { available: false, error: '当前版本不支持自动更新' }
  try {
    const r = await autoUpdater.checkForUpdates()
    const latest = r?.updateInfo?.version
    return { available: !!latest && latest !== app.getVersion(), version: latest }
  } catch (err) {
    return { available: false, error: String(err) }
  }
})

ipcMain.handle('update:install', async () => {
  if (!autoUpdater) return
  try {
    await autoUpdater.downloadUpdate()
    autoUpdater.quitAndInstall()
  } catch (err) {
    console.error('[update] 下载安装失败', err)
  }
})

ipcMain.handle('shell:open', async (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) await shell.openExternal(url)
})

/* ---------------------------------------------------------------- 生命周期 */

app.whenReady().then(() => {
  registerProtocol()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
