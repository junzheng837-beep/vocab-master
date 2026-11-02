import { useMemo, useState } from 'react'
import { store, useAppState } from '../core/store'
import { dateKey } from '../core/scheduler'
import type { BookMeta } from '../core/types'
import { IconCheck, IconBooks, IconRefresh, IconStudy } from '../components/Icons'

interface Props {
  onStart: (bookId: string | null) => void
}

function BookCard({
  book,
  learned,
  due,
  selected,
  onClick,
}: {
  book: BookMeta & { custom?: boolean }
  learned: number
  due: number
  selected: boolean
  onClick: () => void
}) {
  const pct = book.count ? Math.min(100, (learned / book.count) * 100) : 0
  return (
    <button className={`book-card study-card ${selected ? 'selected' : ''}`} onClick={onClick}>
      <div className="row-between">
        <span className="book-name">{book.name}</span>
        {due > 0 ? (
          <span className="badge-due">{due}</span>
        ) : (
          <span className="book-check">
            <IconCheck size={11} />
          </span>
        )}
      </div>
      <div className="book-desc">{book.desc}</div>
      <div className="progress-track thin">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="book-foot">
        <span className="tag accent">{book.tag}</span>
        <span>
          {learned} / {book.count} 词
        </span>
      </div>
    </button>
  )
}

export default function StudyHome({ onStart }: Props) {
  const state = useAppState()
  const { settings, manifest, customBooks, states, logs, session } = state
  const [resetting, setResetting] = useState(false)

  const today = logs[dateKey(Date.now())]
  const learnedToday = today?.learned ?? 0
  const reviewedToday = today?.reviewed ?? 0
  const studiedToday = learnedToday + reviewedToday

  const stats = useMemo(() => store.stats(), [states])

  const progressOf = useMemo(() => {
    const map: Record<string, { learned: number; due: number }> = {}
    const now = Date.now()
    for (const s of Object.values(states)) {
      if (s.stage === 'new') continue
      const row = map[s.bookId] ?? { learned: 0, due: 0 }
      row.learned += 1
      if (s.dueAt <= now) row.due += 1
      map[s.bookId] = row
    }
    return map
  }, [states])

  const allBooks: (BookMeta & { custom?: boolean })[] = [
    ...manifest,
    ...customBooks.map((b) => ({
      id: b.id,
      name: b.name,
      desc: b.desc || '自建词书',
      count: b.words.length,
      tag: '自建',
      category: '自建',
      custom: true,
    })),
  ]

  // 只展示已加入学习的词库；公共词库只在「词库」页面出现
  const mine = allBooks.filter((b) => settings.activeBooks.includes(b.id))
  const continueScope = session.built && session.entries.length ? session.scope : undefined

  async function handleResetToday() {
    if (
      !confirm(
        `重置今天的进度？\n\n今天学的 ${learnedToday} 个新词会退回「新词」，今天复习的 ${reviewedToday} 个旧词会退回复习队列，今日统计清零。\n\n其他日期的学习记录不受影响。`
      )
    )
      return
    setResetting(true)
    try {
      const r = await store.resetToday()
      alert(`已重置：${r.removed} 个新词退回新词，${r.reverted} 个复习词退回队列。`)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">背单词</div>
        <div className="page-subtitle">
          {mine.length ? `从下面选一本开始，共 ${mine.length} 本词书` : '还没有加入学习的词库'}
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: '20px 22px',
          background: 'linear-gradient(135deg, rgba(10,132,255,0.10), rgba(10,132,255,0.02))',
          borderColor: 'rgba(10,132,255,0.22)',
        }}
      >
        <div className="row-between" style={{ alignItems: 'flex-start', gap: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
              今日新学
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: '-0.035em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.15,
              }}
            >
              {learnedToday}
              <span style={{ fontSize: 16, color: 'var(--text-tertiary)', fontWeight: 500 }}>
                {' '}
                / {settings.dailyNew}
              </span>
            </div>
            <div className="progress-track" style={{ marginTop: 12, height: 5, maxWidth: 320 }}>
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, (learnedToday / settings.dailyNew) * 100)}%` }}
              />
            </div>
            <div
              className="row"
              style={{ marginTop: 12, gap: 20, fontSize: 12.5, color: 'var(--text-secondary)' }}
            >
              <span>
                今日复习 <strong style={{ color: 'var(--text-primary)' }}>{reviewedToday}</strong>
              </span>
              <span>
                待复习 <strong style={{ color: 'var(--text-primary)' }}>{stats.dueNow}</strong>
              </span>
              <span>
                已掌握 <strong style={{ color: 'var(--text-primary)' }}>{stats.known}</strong>
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '0 0 auto' }}>
            <button
              className="btn btn-primary btn-lg"
              disabled={!mine.length}
              onClick={() => onStart(continueScope ?? null)}
            >
              <IconStudy size={16} />
              {continueScope ? '继续学习' : '混合学习全部'}
            </button>
            <button
              className="btn"
              disabled={!studiedToday || resetting}
              onClick={() => void handleResetToday()}
              title={studiedToday ? '把今天学过的单词全部退回，重新背' : '今天还没有学习记录'}
            >
              <IconRefresh size={14} />
              {resetting ? '重置中…' : '重置今天'}
            </button>
          </div>
        </div>
      </div>

      <div className="section-label">我的词库</div>
      {mine.length === 0 ? (
        <div className="empty" style={{ height: 'auto', padding: '48px 30px' }}>
          <div className="empty-icon">
            <IconBooks size={24} />
          </div>
          <div className="empty-title">还没有加入学习的词库</div>
          <div className="empty-desc">
            去「词库」页面挑一本加进来。那里有初中、高中、四六级、考研、日常用语等 8 本内置词书，也可以导入你自己的单词。
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 6 }}
            onClick={() => (window.location.hash = '/library')}
          >
            去词库添加
          </button>
        </div>
      ) : (
        <div className="book-grid">
          {mine.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              learned={progressOf[b.id]?.learned ?? 0}
              due={progressOf[b.id]?.due ?? 0}
              selected={session.scope === b.id}
              onClick={() => onStart(b.id)}
            />
          ))}
        </div>
      )}

      <div className="section-label">说明</div>
      <div className="card">
        <div className="card-desc" style={{ lineHeight: 1.8 }}>
          点任意一本词书就只背这一本；点顶部「混合学习全部」会把所有已加入的词书混在一起背。
          <br />
          「重置今天」只影响今天：今天学的新词退回新词，今天复习的旧词退回复习队列，其他日期不受影响。
          <br />
          想增删词库或导入自己的单词，去
          <button
            className="btn-ghost btn"
            style={{ height: 20, padding: '0 6px', display: 'inline-flex', color: 'var(--accent)' }}
            onClick={() => (window.location.hash = '/library')}
          >
            词库
          </button>
          页面。
        </div>
      </div>
    </div>
  )
}
