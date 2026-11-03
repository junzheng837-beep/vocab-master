import { useEffect, useState } from 'react'
import { useAppState } from '../core/store'
import { dateKey } from '../core/scheduler'
import type { PageId } from './Sidebar'
import {
  IconBooks,
  IconChart,
  IconHome,
  IconLetter,
  IconPlus,
  IconSettings,
  IconSparkle,
  IconSpell,
  IconStudy,
  IconUser,
} from './Icons'

interface Props {
  page: PageId
  onNavigate: (p: PageId) => void
}

const MORE_PAGES: PageId[] = ['roots', 'letters', 'spell', 'import', 'account', 'settings', 'debug']

function IconMore({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <circle cx="5.5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18.5" cy="12" r="1.7" />
    </svg>
  )
}

/** 移动端底部标签栏 + 「更多」面板 */
export default function MobileNav({ page, onNavigate }: Props) {
  const state = useAppState()
  const [sheetOpen, setSheetOpen] = useState(false)

  const today = state.logs[dateKey(Date.now())]
  const learnedToday = today?.learned ?? 0
  const spellCount = state.spellList.length
  const dueCount = (() => {
    let n = 0
    const now = Date.now()
    for (const s of Object.values(state.states)) {
      if (s.stage === 'new') continue
      if (s.dueAt <= now) n += 1
    }
    return n
  })()

  const moreActive = MORE_PAGES.includes(page)

  // 切页时收起面板
  useEffect(() => {
    setSheetOpen(false)
  }, [page])

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  const tabs: { id: PageId | 'more'; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'home', label: '今日', icon: <IconHome size={20} /> },
    { id: 'study', label: '背单词', icon: <IconStudy size={20} />, badge: learnedToday },
    { id: 'library', label: '词库', icon: <IconBooks size={20} /> },
    { id: 'stats', label: '统计', icon: <IconChart size={20} />, badge: dueCount },
    { id: 'more', label: '更多', icon: <IconMore size={20} /> },
  ]

  const moreItems: { id: PageId; label: string; desc: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'spell', label: '拼写练习', desc: '按释义拼出单词', icon: <IconSpell size={19} />, badge: spellCount },
    { id: 'letters', label: '首字母', desc: '按字母刷词', icon: <IconLetter size={19} /> },
    { id: 'roots', label: '词根词缀', desc: '按词根背一串', icon: <IconSparkle size={19} /> },
    { id: 'import', label: '导入词库', desc: '粘贴自己的生词', icon: <IconPlus size={19} /> },
    { id: 'account', label: state.user ? '我的账号' : '登录', desc: state.user ? state.user.username : '登录后词库归属账号', icon: <IconUser size={19} /> },
    { id: 'settings', label: '设置', desc: '节奏与外观', icon: <IconSettings size={19} /> },
  ]

  return (
    <>
      <nav className="mnav">
        {tabs.map((t) => {
          const active = t.id === 'more' ? moreActive || sheetOpen : page === t.id
          return (
            <button
              key={t.id}
              className={`mnav-item ${active ? 'active' : ''}`}
              onClick={() => {
                if (t.id === 'more') setSheetOpen((v) => !v)
                else onNavigate(t.id)
              }}
            >
              <span className="mnav-icon">
                {t.icon}
                {!!t.badge && t.badge > 0 && <span className="mnav-badge">{t.badge > 99 ? '99+' : t.badge}</span>}
              </span>
              <span className="mnav-label">{t.label}</span>
            </button>
          )
        })}
      </nav>

      {sheetOpen && (
        <div className="mnav-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="mnav-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mnav-sheet-grip" />
            <div className="mnav-sheet-grid">
              {moreItems.map((it) => (
                <button
                  key={it.id}
                  className={`mnav-sheet-item ${page === it.id ? 'active' : ''}`}
                  onClick={() => {
                    setSheetOpen(false)
                    onNavigate(it.id)
                  }}
                >
                  <span className="mnav-sheet-icon">
                    {it.icon}
                    {!!it.badge && it.badge > 0 && (
                      <span className="mnav-badge">{it.badge > 99 ? '99+' : it.badge}</span>
                    )}
                  </span>
                  <span className="mnav-sheet-text">
                    <span className="mnav-sheet-label">{it.label}</span>
                    <span className="mnav-sheet-desc">{it.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <button className="mnav-sheet-close" onClick={() => setSheetOpen(false)}>
              收起
            </button>
          </div>
        </div>
      )}
    </>
  )
}
