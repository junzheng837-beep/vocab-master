const fs = require('fs')
const path = require('path')
const LOG = path.join(__dirname, '.shot.log')
fs.writeFileSync(LOG, '')
const log = (...a) => fs.appendFileSync(LOG, a.join(' ') + '\n')

log('step: require electron')
const { app, BrowserWindow } = require('electron')
log('step: electron loaded, app=' + typeof app)

const url = process.argv[2] || 'http://localhost:5174/#/account'
const out = process.argv[3] || path.join(__dirname, '.shot.png')

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  log('step: app ready')
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
  })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message)
  })
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    errors.push(`did-fail-load ${code} ${desc}`)
  })

  try {
    log('step: loadURL ' + url)
    await win.loadURL(url)
    log('step: loaded')
    await new Promise((r) => setTimeout(r, 3500))
    const text = await win.webContents.executeJavaScript(
      'document.body.innerText.slice(0, 700)'
    )
    const img = await win.webContents.capturePage()
    fs.writeFileSync(out, img.toPNG())
    log('URL: ' + url)
    log('--- 页面文本 ---')
    log(text)
    log('--- 控制台错误 ---')
    log(errors.length ? errors.join('\n') : '(无)')
  } catch (err) {
    log('渲染失败: ' + (err && err.stack ? err.stack : String(err)))
  } finally {
    log('step: quit')
    app.quit()
  }
})
