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
