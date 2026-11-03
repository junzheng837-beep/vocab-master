import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { APK_DOWNLOAD_URL, LATEST_API, LATEST_RELEASE_URL, SETUP_DOWNLOAD_URL } from './brand'
import { logger } from './logger'

export interface UpdateInfo {
  hasUpdate: boolean
  current: string
  latest: string
  url: string
  notes: string
  publishedAt: string | null
  /** 桌面端可以直接下载安装 */
  desktopAutoUpdate: boolean
  /** 点「下载」时该打开的地址：安卓给 APK 直链，桌面给 exe 直链，网页给发布页 */
  downloadUrl: string
}

const CACHE_KEY = 'update-check-cache'
const CACHE_TTL = 1000 * 60 * 30

export function currentVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
}

/** 比较语义化版本，返回 a 是否比 b 新 */
export function isNewer(a: string, b: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((x) => Number.parseInt(x, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

interface ReleaseResp {
  tag_name: string
  html_url: string
  body: string
  published_at: string
  assets?: { name: string; browser_download_url: string; size: number }[]
}

export interface LatestRelease {
  tag: string
  url: string
  body: string
  publishedAt: string
  assets: { name: string; url: string; size: number }[]
}

/** 拉取最新 Release（带 30 分钟缓存，避免触发 GitHub API 限流） */
export async function fetchLatestRelease(force = false): Promise<LatestRelease | null> {
  if (!force) {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached) as { at: number; data: LatestRelease }
        if (Date.now() - parsed.at < CACHE_TTL) {
          logger.debug('update', '命中更新检查缓存', { tag: parsed.data.tag })
          return parsed.data
        }
      }
    } catch {
      /* 忽略缓存解析失败 */
    }
  }

  try {
    logger.debug('update', '请求最新版本信息', { url: LATEST_API })
    const res = await fetch(LATEST_API, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) {
      logger.warn('update', '获取版本信息失败', { status: res.status })
      return null
    }
    const data = (await res.json()) as ReleaseResp
    const release: LatestRelease = {
      tag: data.tag_name,
      url: data.html_url || LATEST_RELEASE_URL,
      body: data.body ?? '',
      publishedAt: data.published_at,
      assets: (data.assets ?? []).map((a) => ({
        name: a.name,
        url: a.browser_download_url,
        size: a.size,
      })),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: release }))
    logger.info('update', '最新版本信息', {
      当前: currentVersion(),
      最新: release.tag,
      附件: release.assets.map((a) => a.name),
    })
    return release
  } catch (err) {
    logger.warn('update', '检查更新时出错', err)
    return null
  }
}

/** 当前平台该下哪个包 */
export function downloadUrlForPlatform(): string {
  if (typeof window === 'undefined') return LATEST_RELEASE_URL
  if (window.shici?.isDesktop) return SETUP_DOWNLOAD_URL
  if (Capacitor.isNativePlatform()) return APK_DOWNLOAD_URL
  return LATEST_RELEASE_URL
}

/**
 * 打开下载地址。
 * 安卓 App 里 window.open 会被 WebView 吞掉，必须交给系统浏览器；
 * 而且给的是 APK 直链，浏览器会直接开始下载，不会跳到 GitHub 页面。
 */
export async function openDownload(url?: string) {
  const target = url || downloadUrlForPlatform()
  logger.info('update', '打开下载地址', { url: target })
  if (window.shici?.isDesktop) {
    await window.shici.openExternal(target)
    return
  }
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url: target })
    return
  }
  window.open(target, '_blank', 'noopener')
}

export async function checkUpdate(force = false): Promise<UpdateInfo | null> {
  const current = currentVersion()
  const release = await fetchLatestRelease(force)
  if (!release) return null
  const hasUpdate = isNewer(release.tag, current)
  logger.info('update', hasUpdate ? '发现新版本' : '当前已是最新版本', {
    当前: current,
    最新: release.tag,
  })
  return {
    hasUpdate,
    current,
    latest: release.tag,
    url: release.url,
    notes: release.body,
    publishedAt: release.publishedAt,
    desktopAutoUpdate: !!window.shici?.isDesktop,
    downloadUrl: downloadUrlForPlatform(),
  }
}
