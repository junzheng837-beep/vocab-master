import { useEffect, useState } from 'react'
import { store, useAppState } from './core/store'
import { logger } from './core/logger'
import Sidebar, { type PageId } from './components/Sidebar'
import MobileNav from './components/MobileNav'
import { useDevice } from './core/device'
import UpdateBanner from './components/UpdateBanner'
import HomePage from './pages/Home'
import StudyHome from './pages/StudyHome'
import StudyPage from './pages/Study'
import LibraryPage from './pages/Library'
import StatsPage from './pages/Stats'
import SettingsPage from './pages/Settings'
import ImportPage from './pages/Import'
import DebugPage from './pages/Debug'
import AccountPage from './pages/Account'
import RootsPage from './pages/Roots'
import SpellPage from './pages/Spell'
import LettersPage from './pages/Letters'

const PAGES: PageId[] = [
  'home',
  'study',
  'library',
  'stats',
  'settings',
  'import',
  'debug',
  'account',
  'roots',
  'spell',
  'letters',
]

interface Route {
  page: PageId
  param: string | null
}

function readRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [p, ...rest] = raw.split('/')
  const param = rest.join('/') || null
  if ((PAGES as string[]).includes(p)) return { page: p as PageId, param }
  return { page: 'home', param: null }
}

function navigate(path: string) {
  if (window.location.hash !== `#${path}`) {
    logger.debug('nav', `跳转 ${path}`)
    window.location.hash = path
  }
}

function useTheme() {
  const { settings } = useAppState()
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      if (settings.theme === 'auto') {
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
        root.dataset.theme = dark ? 'dark' : 'light'
      } else {
        root.dataset.theme = settings.theme
      }
    }
    apply()
    if (settings.theme !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme])
}

const TITLES: Record<PageId, string> = {
  home: '今日',
  study: '背单词',
  library: '词库',
  stats: '学习统计',
  settings: '设置',
  import: '导入词库',
  debug: '调试日志',
  account: '我的账号',
  roots: '词根词缀',
  spell: '拼写练习',
  letters: '首字母词库',
}

export default function App() {
  const state = useAppState()
  const [route, setRoute] = useState<Route>(readRoute)
  useTheme()
  const device = useDevice()
  const isMobile = device === 'mobile'

  useEffect(() => {
    void store.init()
  }, [])

  useEffect(() => {
    const onHash = () => {
      const r = readRoute()
      logger.info('nav', '页面切换', { page: r.page, param: r.param })
      setRoute(r)
      document.querySelector('.main')?.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // 首次进入后自动准备今日计划
  useEffect(() => {
    if (!state.ready || state.session.built) return
    if (!state.settings.activeBooks.length) return
    // 直接落在某个范围的学习页时，交给学习页自己按范围构建，
    // 否则会先白拉一遍全部词书（弱网下能差几十秒）
    if (route.page === 'study' && route.param) {
      logger.debug('app', '学习页已带范围，跳过默认计划构建', { scope: route.param })
      return
    }
    logger.info('app', '首次进入，自动准备今日计划')
    void store.rebuildSession(null)
  }, [state.ready, state.session.built, state.settings.activeBooks.length, route.page, route.param])

  if (!state.ready) {
    return (
      <div className="window">
        <div className="loading-screen">
          <div className="spinner" />
          <span>正在载入…</span>
        </div>
      </div>
    )
  }

  const { page, param } = route
  const inStudy = page === 'study'
  const inSession = inStudy && !!param

  return (
    <div className={`window${isMobile ? ' is-mobile' : ''}${inSession ? ' is-session' : ''}`}>
      <div className="titlebar">
        <div className="traffic">
          <span className="t-red" />
          <span className="t-yellow" />
          <span className="t-green" />
        </div>
        <div className="titlebar-title">
          {inStudy && param ? '背单词' : TITLES[page]}
        </div>
        <div className="titlebar-spacer" />
        <div className="titlebar-actions">
          {page !== 'home' && (
            <button className="btn btn-ghost" onClick={() => navigate('/home')}>
              今日
            </button>
          )}
          {!inStudy && (
            <button className="btn btn-primary" onClick={() => navigate('/study')}>
              开始背单词
            </button>
          )}
        </div>
      </div>

      <UpdateBanner />

      <div className="workspace">
        <Sidebar page={page} onNavigate={(p) => navigate(`/${p}`)} />
        <div className="main">
          {state.error && (
            <div className="page">
              <div className="card" style={{ borderColor: 'var(--red)' }}>
                <div className="card-title">载入出错了</div>
                <div className="card-desc">{state.error}</div>
              </div>
            </div>
          )}
          {page === 'home' && <HomePage onNavigate={(p) => navigate(`/${p}`)} />}
          {page === 'study' &&
            (param ? (
              <StudyPage scope={param} />
            ) : (
              <StudyHome onStart={(scopeParam) => navigate(`/study/${scopeParam}`)} />
            ))}
          {page === 'library' && <LibraryPage onNavigate={(p) => navigate(`/${p}`)} />}
          {page === 'stats' && <StatsPage />}
          {page === 'settings' && <SettingsPage onNavigate={(p) => navigate(`/${p}`)} />}
          {page === 'import' && <ImportPage onNavigate={(p) => navigate(`/${p}`)} />}
          {page === 'debug' && <DebugPage />}
          {page === 'account' && <AccountPage />}
          {page === 'roots' && (
            <RootsPage onStart={(scopeParam) => navigate(`/study/${scopeParam}`)} />
          )}
          {page === 'spell' && <SpellPage />}
          {page === 'letters' && (
            <LettersPage onStart={(scopeParam) => navigate(`/study/${scopeParam}`)} />
          )}
        </div>
      </div>

      {isMobile && !inSession && (
        <MobileNav page={page} onNavigate={(p) => navigate(`/${p}`)} />
      )}
    </div>
  )
}
