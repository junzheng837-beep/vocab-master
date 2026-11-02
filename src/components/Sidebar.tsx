import { useAppState } from '../core/store'
import { dateKey } from '../core/scheduler'
import { BRAND } from '../core/brand'
import {
  IconBooks,
  IconChart,
  IconHome,
  IconPlus,
  IconSettings,
  IconStudy,
} from './Icons'

export type PageId =
  | 'home'
  | 'study'
  | 'library'
  | 'stats'
  | 'settings'
  | 'import'
  | 'debug'
  | 'account'

interface Props {
  page: PageId
  onNavigate: (p: PageId) => void
}

export default function Sidebar({ page, onNavigate }: Props) {
  const state = useAppState()
  const today = state.logs[dateKey(Date.now())]
  const learnedToday = today?.learned ?? 0
  const dueCount = (() => {
    let n = 0
    const now = Date.now()
    for (const s of Object.values(state.states)) {
      if (s.stage === 'new') continue
      if (s.dueAt <= now) n += 1
    }
    return n
  })()

  const items: { id: PageId; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'home', label: '今日', icon: <IconHome /> },
    {
      id: 'study',
      label: '背单词',
      icon: <IconStudy />,
      badge: learnedToday ? String(learnedToday) : undefined,
    },
    { id: 'library', label: '词库', icon: <IconBooks /> },
    {
      id: 'stats',
      label: '学习统计',
      icon: <IconChart />,
      badge: dueCount ? String(dueCount) : undefined,
    },
  ]

  return (
    <nav className="sidebar">
      {items.map((it) => (
        <button
          key={it.id}
          className={`nav-item ${page === it.id ? 'active' : ''}`}
          onClick={() => onNavigate(it.id)}
        >
          <span className="icon">{it.icon}</span>
          <span className="nav-label">{it.label}</span>
          {it.badge && <span className="nav-badge">{it.badge}</span>}
        </button>
      ))}

      <div className="sidebar-section">自建</div>
      <button
        className={`nav-item ${page === 'import' ? 'active' : ''}`}
        onClick={() => onNavigate('import')}
      >
        <span className="icon">
          <IconPlus />
        </span>
        <span className="nav-label">导入词库</span>
      </button>

      <div style={{ flex: 1 }} />

      <button
        className="sidebar-user"
        onClick={() => onNavigate('account')}
        title={state.user ? `已登录：${state.user.username}` : '登录后词库归属账号'}
      >
        <span className={`mini-avatar ${state.user ? '' : 'guest'}`}>
          {state.user ? state.user.username.slice(0, 1).toUpperCase() : '游'}
        </span>
        <span className="user-name">
          {state.user ? state.user.username : '未登录'}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: 11 }}>
          {state.user ? '' : '登录'}
        </span>
      </button>

      <button
        className={`nav-item ${page === 'settings' ? 'active' : ''}`}
        onClick={() => onNavigate('settings')}
      >
        <span className="icon">
          <IconSettings />
        </span>
        <span className="nav-label">设置</span>
      </button>

      <div className="sidebar-brand">{BRAND.short} v{__APP_VERSION__}</div>
    </nav>
  )
}
