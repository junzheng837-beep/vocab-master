import { useEffect, useState } from 'react'
import { checkUpdate, currentVersion, openDownload, type UpdateInfo } from '../core/update'
import { logger } from '../core/logger'

type Phase = 'idle' | 'checking' | 'latest' | 'found' | 'error'

/** 设置页的「检查新版本」 */
export default function UpdateChecker() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [opening, setOpening] = useState(false)
  const version = currentVersion()

  // 进设置页时先用缓存结果标一下，不主动请求（顶部提示条已经在查了）
  useEffect(() => {
    let alive = true
    checkUpdate()
      .then((r) => {
        if (!alive || !r) return
        setInfo(r)
        setPhase(r.hasUpdate ? 'found' : 'latest')
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  async function check() {
    setPhase('checking')
    logger.info('update', '手动检查更新', { 当前: version })
    try {
      const r = await checkUpdate(true)
      if (!r) {
        setPhase('error')
        return
      }
      setInfo(r)
      setPhase(r.hasUpdate ? 'found' : 'latest')
    } catch {
      setPhase('error')
    }
  }

  const desc = (() => {
    switch (phase) {
      case 'checking':
        return '正在检查…'
      case 'latest':
        return `已是最新版本 v${version}`
      case 'found':
        return `发现新版本 ${info?.latest}，当前 v${version}`
      case 'error':
        return '检查失败，请检查网络后重试'
      default:
        return `当前版本 v${version}`
    }
  })()

  return (
    <div className="list">
      <div className="list-item">
        <div style={{ flex: 1 }}>
          <div className="card-title">检查新版本</div>
          <div className="card-desc">{desc}</div>
        </div>
        {phase === 'found' ? (
          <button
            className="btn btn-primary"
            disabled={opening}
            onClick={() => {
              setOpening(true)
              void openDownload(info?.downloadUrl).finally(() =>
                window.setTimeout(() => setOpening(false), 1500)
              )
            }}
          >
            {opening ? '正在打开…' : `下载 ${info?.latest}`}
          </button>
        ) : (
          <button className="btn" disabled={phase === 'checking'} onClick={() => void check()}>
            {phase === 'checking' ? '检查中…' : '检查更新'}
          </button>
        )}
      </div>
    </div>
  )
}
