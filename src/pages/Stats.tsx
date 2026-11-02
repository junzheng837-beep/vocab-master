import { useMemo } from 'react'
import { store, useAppState } from '../core/store'
import { dateKey, startOfDay } from '../core/scheduler'
import type { DailyLog } from '../core/types'

const DAY = 86400000
const WEEKS = 20

function dayTotal(log: DailyLog | undefined) {
  if (!log) return 0
  return log.learned + log.reviewed
}

function buildHeatmap(logs: Record<string, DailyLog>) {
  const today = startOfDay(Date.now())
  const dow = (new Date(today).getDay() + 6) % 7 // 0 = 周一
  const start = today - dow * DAY - (WEEKS - 1) * 7 * DAY

  const cells: { key: string; ts: number; value: number; future: boolean }[] = []
  for (let i = 0; i < WEEKS * 7; i += 1) {
    const ts = start + i * DAY
    cells.push({
      key: dateKey(ts),
      ts,
      value: dayTotal(logs[dateKey(ts)]),
      future: ts > today,
    })
  }
  // 月份标签：每周第一天
  const monthMarks: { col: number; label: string }[] = []
  for (let w = 0; w < WEEKS; w += 1) {
    const d = new Date(start + w * 7 * DAY)
    const prev = w === 0 ? null : new Date(start + (w - 1) * 7 * DAY)
    if (!prev || prev.getMonth() !== d.getMonth()) {
      monthMarks.push({ col: w, label: `${d.getMonth() + 1}月` })
    }
  }
  return { cells, monthMarks }
}

function heatLevel(v: number) {
  if (v <= 0) return 0
  if (v <= 10) return 1
  if (v <= 25) return 2
  if (v <= 50) return 3
  return 4
}

export default function StatsPage() {
  const state = useAppState()
  const { logs, states, manifest, customBooks } = state

  const stats = useMemo(() => store.stats(), [states])

  const totals = useMemo(() => {
    let learned = 0
    let reviewed = 0
    const ratings: [number, number, number, number] = [0, 0, 0, 0]
    for (const log of Object.values(logs)) {
      learned += log.learned
      reviewed += log.reviewed
      for (let i = 0; i < 4; i += 1) ratings[i] += log.ratings[i] ?? 0
    }
    return { learned, reviewed, ratings }
  }, [logs])

  // 连续学习天数
  const streak = useMemo(() => {
    const today = startOfDay(Date.now())
    let count = 0
    let cursor = today
    if (dayTotal(logs[dateKey(today)]) === 0) {
      cursor = today - DAY
      if (dayTotal(logs[dateKey(cursor)]) === 0) return 0
    }
    while (dayTotal(logs[dateKey(cursor)]) > 0) {
      count += 1
      cursor -= DAY
    }
    return count
  }, [logs])

  const activeDays = useMemo(
    () => Object.values(logs).filter((l) => dayTotal(l) > 0).length,
    [logs]
  )

  const heat = useMemo(() => buildHeatmap(logs), [logs])

  // 未来 7 天复习预测
  const forecast = useMemo(() => {
    const buckets = new Array(7).fill(0)
    const today = startOfDay(Date.now())
    for (const s of Object.values(states)) {
      if (s.stage === 'new' || s.stage === 'learning') continue
      const idx = Math.floor((startOfDay(s.dueAt) - today) / DAY)
      if (idx < 0) buckets[0] += 1
      else if (idx < 7) buckets[idx] += 1
    }
    const labels = ['今天', '明天', ...Array.from({ length: 5 }, (_, i) => {
      const d = new Date(today + (i + 2) * DAY)
      return `${d.getMonth() + 1}/${d.getDate()}`
    })]
    return buckets.map((v, i) => ({ label: labels[i], value: v }))
  }, [states])

  const maxForecast = Math.max(1, ...forecast.map((f) => f.value))
  const ratingTotal = totals.ratings.reduce((a, b) => a + b, 0) || 1

  const bookRows = useMemo(() => {
    const byBook: Record<string, { learned: number; known: number }> = {}
    for (const s of Object.values(states)) {
      const row = byBook[s.bookId] ?? { learned: 0, known: 0 }
      if (s.stage !== 'new') row.learned += 1
      if (s.stage === 'known') row.known += 1
      byBook[s.bookId] = row
    }
    return Object.entries(byBook)
      .map(([id, v]) => {
        const meta = manifest.find((m) => m.id === id) ?? customBooks.find((b) => b.id === id)
        const total =
          manifest.find((m) => m.id === id)?.count ??
          customBooks.find((b) => b.id === id)?.words.length ??
          0
        return { id, name: meta?.name ?? id, ...v, total }
      })
      .sort((a, b) => b.learned - a.learned)
  }, [states, manifest, customBooks])

  const ratingLabels = [
    { label: '待会再来', color: 'var(--red)' },
    { label: '困难', color: 'var(--orange)' },
    { label: '一般', color: 'var(--blue)' },
    { label: '容易', color: 'var(--green)' },
  ]

  const accuracy = stats.total
    ? Math.round(((totals.ratings[2] + totals.ratings[3]) / ratingTotal) * 100)
    : 0

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">学习统计</div>
        <div className="page-subtitle">
          累计学习 {totals.learned + totals.reviewed} 个单词次 · 接触过 {stats.total} 个单词
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">接触过的单词</div>
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
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--orange)' }}>
            {stats.dueNow}
          </div>
          <div className="stat-label">今天待复习</div>
        </div>
      </div>

      <div className="section-label">学习习惯</div>
      <div className="card">
        <div className="habit">
          <div className="habit-stats">
            <div>
              <div className="stat-value" style={{ color: 'var(--accent)' }}>
                {streak}
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>
                  {' '}
                  天
                </span>
              </div>
              <div className="stat-label">连续学习</div>
            </div>
            <div>
              <div className="stat-value">{activeDays}</div>
              <div className="stat-label">累计天数</div>
            </div>
            <div>
              <div className="stat-value" style={{ color: 'var(--green)' }}>
                {accuracy}
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>
                  %
                </span>
              </div>
              <div className="stat-label">记得住的比例</div>
            </div>
          </div>

          <div className="habit-heat">
            <div className="heatmap-months">
              {heat.monthMarks.map((m) => (
                <span key={m.col} style={{ gridColumn: m.col + 1 }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div className="heatmap">
              {heat.cells.map((c) => (
                <div
                  key={c.key}
                  className={`heat-cell lv${heatLevel(c.value)}${c.future ? ' future' : ''}`}
                  title={`${c.key}：${c.value} 个单词`}
                />
              ))}
            </div>
            <div className="row" style={{ gap: 5, marginTop: 10, justifyContent: 'flex-end' }}>
              <span className="tiny" style={{ color: 'var(--text-tertiary)' }}>
                少
              </span>
              {[0, 1, 2, 3, 4].map((l) => (
                <span key={l} className={`heat-cell lv${l}`} style={{ width: 10, height: 10 }} />
              ))}
              <span className="tiny" style={{ color: 'var(--text-tertiary)' }}>
                多
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="section-label">未来 7 天复习量</div>
      <div className="card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {forecast.map((f, i) => (
            <div className="row" key={f.label} style={{ gap: 12 }}>
              <span
                style={{
                  width: 46,
                  fontSize: 12.5,
                  color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: i === 0 ? 600 : 400,
                }}
              >
                {f.label}
              </span>
              <div className="progress-track" style={{ flex: 1, height: 8 }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${(f.value / maxForecast) * 100}%`,
                    background: i === 0 ? 'var(--orange)' : 'var(--accent)',
                  }}
                />
              </div>
              <span
                className="mono"
                style={{
                  width: 40,
                  textAlign: 'right',
                  fontSize: 12.5,
                  color: 'var(--text-secondary)',
                }}
              >
                {f.value}
              </span>
            </div>
          ))}
        </div>
        <div className="card-desc" style={{ marginTop: 14 }}>
          这是按你现在的评分情况推算的到期复习量。如果某天特别多，可以提前几天多背一点摊平。
        </div>
      </div>

      <div className="section-label">评分分布</div>
      <div className="card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {ratingLabels.map((r, i) => {
            const v = totals.ratings[i]
            const pct = (v / ratingTotal) * 100
            return (
              <div className="row" key={r.label} style={{ gap: 12 }}>
                <span style={{ width: 62, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  {r.label}
                </span>
                <div className="progress-track" style={{ flex: 1, height: 7 }}>
                  <div className="progress-fill" style={{ width: `${pct}%`, background: r.color }} />
                </div>
                <span
                  className="mono"
                  style={{
                    width: 44,
                    textAlign: 'right',
                    fontSize: 12.5,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {v}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="section-label">各词书进度</div>
      <div className="list">
        {bookRows.length === 0 && (
          <div className="list-item">
            <span className="muted tiny">还没有学习记录</span>
          </div>
        )}
        {bookRows.map((b) => {
          const pct = b.total ? (b.learned / b.total) * 100 : 0
          return (
            <div className="list-item" key={b.id}>
              <span style={{ width: 130, fontSize: 13 }}>{b.name}</span>
              <div className="progress-track" style={{ flex: 1 }}>
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <span
                className="mono tiny"
                style={{ width: 100, textAlign: 'right', color: 'var(--text-secondary)' }}
              >
                {b.learned} / {b.total}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
