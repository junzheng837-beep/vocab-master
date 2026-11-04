/**
 * 品牌信息集中配置。
 * 界面、官网、桌面端、安装包统一从这里取值，改名只需要动这一处。
 */
export const BRAND = {
  /** 全称 */
  name: '拾词易记',
  /** 简称，界面里用 */
  short: '拾词',
  /** 英文名 */
  en: 'Shici',
  /** 一句话介绍 */
  slogan: '拾起每一个词，记得更久',
  /** 副标题 */
  tagline: '把阅读中遇到的生词收进口袋，按遗忘曲线安排复习',
  /** 域名/仓库用的 slug */
  slug: 'shici',
  /** GitHub 仓库 */
  repo: 'junzheng837-beep/vocab-master',
  /** 官网 */
  homepage: 'https://junzheng837-beep.github.io/vocab-master/',
  /** 在线使用 */
  appUrl: 'https://junzheng837-beep.github.io/vocab-master/app/',
} as const

export const REPO_URL = `https://github.com/${BRAND.repo}`
export const RELEASES_URL = `${REPO_URL}/releases`
export const LATEST_RELEASE_URL = `${REPO_URL}/releases/latest`
export const LATEST_API = `https://api.github.com/repos/${BRAND.repo}/releases/latest`
/**
 * 安装包也优先从站点下载，理由同下：GitHub 的 release 资源在国内经常卡住。
 * 站点上的包由 CI 每次发版后同步过去。
 */
export const SETUP_DOWNLOAD_URL = `${BRAND.homepage}download/shici-setup.exe`
/** 站点上没有包时退回 GitHub */
export const SETUP_DOWNLOAD_FALLBACK = `${REPO_URL}/releases/latest/download/shici-setup.exe`
/**
 * APK 优先从站点下载。
 * GitHub 的 release 资源走 objects.githubusercontent.com，国内经常卡在 0%；
 * Pages 走 Fastly，能打开这个站点一般就能下这个包。
 * 站点上的包由 CI 每次发版后同步过去。
 */
export const APK_DOWNLOAD_URL = `${BRAND.homepage}download/shici-android.apk`
/** 站点上没有包时（比如刚建仓库还没发版）退回 GitHub */
export const APK_DOWNLOAD_FALLBACK = `${REPO_URL}/releases/latest/download/shici-android.apk`
