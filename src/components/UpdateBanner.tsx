import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { checkUpdate, type UpdateInfo } from '../core/update'
import { LATEST_RELEASE_URL } from '../core/brand'

const DISMISS_KEY = 'update-dismissed'

export default function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    checkUpdate()
      .then((r) => {
        if (!alive || !r) return
        setInfo(r)
        if (r.hasUpdate && localStorage.getItem(DISMISS_KEY) === r.latest) {
          setDismissed(true)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!info?.hasUpdate || dismissed) return null

  const openDownload = () => {
    const url = info.url || LATEST_RELEASE_URL
    if (window.shici?.isDesktop) {
      void window.shici.openExternal(url)
      return
    }
    // 安卓 App 里 window.open 会被 WebView 吞掉，得交给系统浏览器
    if (Capacitor.isNativePlatform()) {
      void Browser.open({ url })
      return
    }
    window.open(url, '_blank', 'noopener')
  }

  const desktopUpdate = async () => {
    if (!window.shici?.isDesktop) {
      openDownload()
      return
    }
    setBusy(true)
    try {
      await window.shici.downloadAndInstall()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="update-banner">
      <span className="dot" />
      <span>
        发现新版本 <strong>{info.latest}</strong>
        <span style={{ color: 'var(--text-tertiary)' }}> · 当前 {info.current}</span>
      </span>
      <div style={{ flex: 1 }} />
      <button className="btn" style={{ height: 26 }} disabled={busy} onClick={() => void desktopUpdate()}>
        {busy ? '准备中…' : info.desktopAutoUpdate ? '立即更新' : '去下载'}
      </button>
      <button
        className="icon-btn"
        style={{ width: 24, height: 24 }}
        title="本次不再提醒"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, info.latest)
          setDismissed(true)
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      </button>
    </div>
  )
}
