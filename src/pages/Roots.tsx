import { useEffect, useMemo, useState } from 'react'
import { loadRoots } from '../core/dict'
import { scopeToParam } from '../core/scope'
import { logger } from '../core/logger'
import type { RootEntry } from '../core/types'
import { IconSparkle } from '../components/Icons'

interface Props {
  onStart: (scopeParam: string) => void
}

const CLASS_ORDER = ['词根', '前缀', '后缀']

export default function RootsPage({ onStart }: Props) {
  const [roots, setRoots] = useState<RootEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | '词根' | '前缀' | '后缀'>('all')

  useEffect(() => {
    let alive = true
    loadRoots()
      .then((r) => {
        if (!alive) return
        setRoots(r)
        logger.info('roots', '词根页数据就绪', { 数量: r.length })
      })
      .catch((err) => logger.error('roots', '词根数据加载失败', err))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const order: Record<string, number> = { 词根: 0, 前缀: 1, 后缀: 2 }
    const catOf = (x: RootEntry) => x.cat ?? x.c
    return roots
      .filter((r) => (filter === 'all' ? true : (r.cat ?? r.c) === filter))
      .filter((r) =>
        q
          ? r.r.toLowerCase().includes(q) ||
            r.m.toLowerCase().includes(q) ||
            r.w.some((w) => w.toLowerCase().includes(q))
          : true
      )
      .slice()
      .sort((a, b) => {
        const d = (order[catOf(a)] ?? 9) - (order[catOf(b)] ?? 9)
        if (d !== 0) return d
        if (b.w.length !== a.w.length) return b.w.length - a.w.length
        return a.r.localeCompare(b.r)
      })
  }, [roots, query, filter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { 词根: 0, 前缀: 0, 后缀: 0 }
    for (const r of roots) {
      const k = r.cat ?? r.c
      c[k] = (c[k] ?? 0) + 1
    }
    return c
  }, [roots])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>正在载入词根数据…</span>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">词根词缀</div>
        <div className="page-subtitle">
          掌握一个词根，往往能连带记住一串词。共 {roots.length} 个词根词缀，点开任意一个就能专项背它的例词。
        </div>
      </div>

      <div className="row" style={{ marginBottom: 18, gap: 10, flexWrap: 'wrap' }}>
        <div className="segmented">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            全部 {roots.length}
          </button>
          {CLASS_ORDER.map((c) => (
            <button
              key={c}
              className={filter === c ? 'active' : ''}
              onClick={() => setFilter(c as typeof filter)}
            >
              {c} {counts[c] ?? 0}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="搜索词根、含义或例词"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty" style={{ height: 'auto', padding: '50px 20px' }}>
          <div className="empty-title">没有匹配的词根</div>
          <div className="empty-desc">换个关键词试试，或者点「全部」看所有词根。</div>
        </div>
      ) : (
        <div className="root-grid">
          {filtered.map((r) => (
            <button
              key={`${r.r}-${r.c}`}
              className="root-card"
              onClick={() => onStart(scopeToParam({ kind: 'root', root: r.r }))}
              title={`背 ${r.r} 下的 ${r.w.length} 个例词`}
            >
              <div className="row-between" style={{ alignItems: 'baseline' }}>
                <span className="root-card-name">{r.r}</span>
                <span className="root-card-class">{r.c}</span>
              </div>
              <div className="root-card-meaning">{r.m}</div>
              <div className="root-card-words">
                {r.w.slice(0, 4).join(' · ')}
                {r.w.length > 4 ? ' …' : ''}
              </div>
              <div className="root-card-foot">
                <IconSparkle size={11} />
                {r.w.length} 个例词
                {r.o ? <span style={{ marginLeft: 8, opacity: 0.7 }}>{r.o}</span> : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
