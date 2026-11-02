import { useMemo } from 'react'
import { store, useAppState } from '../core/store'
import { dateKey, startOfDay } from '../core/scheduler'
import type { PageId } from '../components/Sidebar'
import { IconStudy } from '../components/Icons'

function last7Days() {
  const out: { key: string; label: string; ts: number }[] = []
  const now = Date.now()
  for (let i = 6; i >= 0; i -= 1) {
    const ts = startOfDay(now) - i * 86400000
    const d = new Date(ts)
    out.push({
      key: dateKey(ts),
      label: i === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`,
      ts,
    })
  }
  return out
}

export default function HomePage({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const state = useAppState()
  const { settings, logs, manifest, customBooks, session } = state
  const today = logs[dateKey(Date.now())]

  const stats = useMemo(() => store.stats(), [state.states])

  const activeNames = settings.activeBooks
    .map((id) => manifest.find((m) => m.id === id)?.name ?? customBooks.find((b) => b.id === id)?.name)
    .filter(Boolean) as string[]

  const days = last7Days()
  const maxVal = Math.max(
    1,
    ...days.map((d) => (logs[d.key]?.learned ?? 0) + (logs[d.key]?.reviewed ?? 0))
  )
  const total7 = days.reduce(
    (s, d) => s + (logs[d.key]?.learned ?? 0) + (logs[d.key]?.reviewed ?? 0),
    0
  )

  const goal = settings.dailyNew
  const learned = today?.learned ?? 0
  const pct = goal ? Math.min(100, (learned / goal) * 100) : 0

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">今日</div>
        <div className="page-subtitle">
          {activeNames.length ? `正在学习：${activeNames.join('、')}` : '还没有选择词书'}
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: '22px 24px',
          background: 'linear-gradient(135deg, rgba(10,132,255,0.10), rgba(10,132,255,0.02))',
          borderColor: 'rgba(10,132,255,0.22)',
        }}
      >
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              今日新学
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: '-0.035em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
              }}
            >
              {learned}
              <span style={{ fontSize: 17, color: 'var(--text-tertiary)', fontWeight: 500 }}>
                {' '}
                / {goal}
              </span>
            </div>
          </div>
          <button className="btn btn-primary btn-lg" onClick={() => onNavigate('study')}>
            <IconStudy size={16} />
            {session.built && session.entries.length ? '继续背单词' : '开始背单词'}
          </button>
        </div>

        <div className="progress-track" style={{ marginTop: 18, height: 5 }}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <div
          className="row"
          style={{ marginTop: 14, gap: 26, fontSize: 12.5, color: 'var(--text-secondary)' }}
        >
          <span>
            待复习 <strong style={{ color: 'var(--text-primary)' }}>{stats.dueNow}</strong> 个
          </span>
          <span>
            今日复习 <strong style={{ color: 'var(--text-primary)' }}>{today?.reviewed ?? 0}</strong> 个
          </span>
          <span>
            已掌握 <strong style={{ color: 'var(--text-primary)' }}>{stats.known}</strong> 个
          </span>
        </div>
      </div>

      <div className="section-label">近 7 天</div>
      <div className="card">
        <div className="row-between" style={{ marginBottom: 4 }}>
          <div>
            <div className="card-title">学习量</div>
            <div className="card-desc">共 {total7} 个单词次</div>
          </div>
        </div>
        <div className="bar-chart">
          {days.map((d) => {
            const v = (logs[d.key]?.learned ?? 0) + (logs[d.key]?.reviewed ?? 0)
            return (
              <div className="bar-col" key={d.key}>
                <div
                  className="bar"
                  style={{
                    height: `${Math.max(2, (v / maxVal) * 100)}%`,
                    opacity: v ? 0.9 : 0.18,
                  }}
                  title={`${d.label}: ${v} 个`}
                />
                <div className="bar-label">{d.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="section-label">学习状态</div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">已接触单词</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--orange)' }}>
            {stats.learning}
          </div>
          <div className="stat-label">还没记牢</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--blue)' }}>
            {stats.review}
          </div>
          <div className="stat-label">复习中</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {stats.known}
          </div>
          <div className="stat-label">已掌握</div>
        </div>
      </div>
    </div>
  )
}
