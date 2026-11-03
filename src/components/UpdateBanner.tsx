import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { checkUpdate, openDownload, type UpdateInfo } from '../core/update'

const DISMISS_KEY = 'update-dismissed'

export default function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const apply = (r: UpdateInfo | null) => {
      if (!alive || !r) return
      setInfo(r)
      if (r.hasUpdate && localStorage.getItem(DISMISS_KEY) === r.latest) {
        setDismissed(true)
      }
    }

    checkUpdate().then(apply).catch(() => {})

    // 手机上 App 常常挂在后台好几天，切回前台时再查一次
    // （fetchLatestRelease 自带 30 分钟缓存，不会每次都打接口）
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      checkUpdate().then(apply).catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!info?.hasUpdate || dismissed) return null

  const download = () => void openDownload(info.downloadUrl)

  const desktopUpdate = async () => {
    if (!window.shici?.isDesktop) {
      download()
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
        {busy
          ? '准备中…'
          : info.desktopAutoUpdate
            ? '立即更新'
            : Capacitor.isNativePlatform()
              ? '下载 APK'
              : '去下载'}
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
