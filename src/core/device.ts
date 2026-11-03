import { useEffect, useState } from 'react'

/**
 * 设备判定。
 *
 * 布局主要靠 CSS 媒体查询，这里额外做两件事：
 * 1. 在 <html> 上打 data-device / data-touch，让样式和行为可以按「设备」而不是
 *    单纯按宽度分支（例如 iPad 宽度够但需要更大的点击区域）。
 * 2. 给 React 一个可订阅的当前设备类型，用来决定要不要渲染移动端导航、
 *    要不要显示键盘快捷键提示。
 */

export type DeviceKind = 'mobile' | 'tablet' | 'desktop'

function ua(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return (
    navigator.maxTouchPoints > 0 ||
    'ontouchstart' in window ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua())
  )
}

/** 是否 iPad（iPadOS 13+ 的 UA 伪装成 Macintosh，只能靠触摸点数区分） */
function isIPad(): boolean {
  const s = ua()
  return /iPad/.test(s) || (/Macintosh/.test(s) && navigator.maxTouchPoints > 1)
}

export function detectDevice(): DeviceKind {
  if (typeof window === 'undefined') return 'desktop'
  const w = window.innerWidth
  const h = window.innerHeight
  const s = ua()

  if (isIPad()) return 'tablet'

  // 手机：UA 明确是手机，或者短边很窄
  if (/iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini/i.test(s)) return 'mobile'
  if (Math.min(w, h) <= 500 && isTouchDevice()) return 'mobile'

  if (w < 720) return 'mobile'
  if (w < 1024 || (isTouchDevice() && w < 1180)) return 'tablet'
  return 'desktop'
}

/** 首屏渲染前调用，避免桌面布局闪一下再切到移动端 */
export function applyDeviceAttrs(): DeviceKind {
  const kind = detectDevice()
  const root = document.documentElement
  root.dataset.device = kind
  root.dataset.touch = String(isTouchDevice())
  root.dataset.mobile = String(kind === 'mobile')
  return kind
}

export function useDevice(): DeviceKind {
  const [kind, setKind] = useState<DeviceKind>(() =>
    typeof document === 'undefined'
      ? 'desktop'
      : ((document.documentElement.dataset.device as DeviceKind) || detectDevice())
  )

  useEffect(() => {
    const update = () => {
      const next = applyDeviceAttrs()
      setKind((prev) => (prev === next ? prev : next))
    }
    update()

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return kind
}
