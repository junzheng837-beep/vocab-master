import { useEffect, useMemo, useState } from 'react'
import { useAppState } from '../core/store'
import { loadLetterIndex } from '../core/dict'
import { scopeToParam } from '../core/scope'
import { logger } from '../core/logger'
import type { LetterIndexEntry } from '../core/types'
import { IconChevronRight } from '../components/Icons'

interface Props {
  onStart: (scopeParam: string) => void
}

type Source = 'public' | 'learned'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('')

export default function LettersPage({ onStart }: Props) {
  const state = useAppState()
  const [source, setSource] = useState<Source>('public')
  const [index, setIndex] = useState<LetterIndexEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadLetterIndex()
      .then((d) => {
        if (!alive) return
        setIndex(d)
        logger.info('letters', '首字母索引就绪', { 字母数: d.length })
      })
      .catch((err) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : '首字母索引加载失败')
        logger.error('letters', '首字母索引加载失败', err)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // 我学过的：按首字母统计已有状态
  const learnedCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of Object.values(state.states)) {
      if (s.stage === 'new') continue
      const c = s.word.slice(0, 1).toLowerCase()
      if (!/^[a-z]$/.test(c)) continue
      map[c] = (map[c] ?? 0) + 1
    }
    return map
  }, [state.states])

  const publicCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const x of index) map[x.l] = x.count
    return map
  }, [index])

  const counts = source === 'public' ? publicCounts : learnedCounts
  const totalPublic = index.reduce((s, x) => s + x.count, 0)
  const totalLearned = Object.values(learnedCounts).reduce((s, n) => s + n, 0)
  const activeTotal = source === 'public' ? totalPublic : totalLearned

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">首字母词库</div>
        <div className="page-subtitle">
          按首字母归类，点任意一个字母就只背这个字母开头的单词
        </div>
      </div>

      <div className="segmented" style={{ marginBottom: 20 }}>
        <button
          className={`segmented-item ${source === 'public' ? 'active' : ''}`}
          onClick={() => setSource('public')}
        >
          公共词库
          <span className="segmented-num">{totalPublic}</span>
        </button>
        <button
          className={`segmented-item ${source === 'learned' ? 'active' : ''}`}
          onClick={() => setSource('learned')}
        >
          我学过的
          <span className="segmented-num">{totalLearned}</span>
        </button>
      </div>

      {source === 'public' && (
        <div className="card-desc" style={{ marginBottom: 14, lineHeight: 1.7 }}>
          公共库收录了全部内置词书去重后的单词，共 {totalPublic} 个，按首字母分成 26 组。
          已经学过的词会自动接上原来的学习记录，不会重复计入新词。
        </div>
      )}
      {source === 'learned' && (
        <div className="card-desc" style={{ marginBottom: 14, lineHeight: 1.7 }}>
          这里只包含你已经背过的单词（{totalLearned} 个），按首字母分组。
          复习时按字母刷一遍，比按词书顺序更容易发现形近词。
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <div className="card-desc" style={{ color: 'var(--red)' }}>{error}</div>
        </div>
      )}

      {loading && <div className="card-desc">正在加载首字母索引…</div>}

      {!loading && !error && activeTotal === 0 && (
        <div className="empty" style={{ paddingTop: 30 }}>
          <div className="empty-title">
            {source === 'learned' ? '还没有背过的单词' : '没有可用的单词'}
          </div>
          <div className="empty-desc">
            {source === 'learned'
              ? '先去背几个单词，这里会自动按首字母归类。'
              : '词书数据可能没有正确加载，刷新页面再试试。'}
          </div>
        </div>
      )}

      {!loading && !error && activeTotal > 0 && (
        <div className="letter-grid">
          {ALPHABET.map((l) => {
            const count = counts[l] ?? 0
            const disabled = count === 0
            return (
              <button
                key={l}
                className={`letter-tile ${disabled ? 'empty' : ''}`}
                disabled={disabled}
                onClick={() =>
                  onStart(scopeToParam({ kind: 'letter', letter: l, source }))
                }
              >
                <span className="letter-char">{l.toUpperCase()}</span>
                <span className="letter-count">{disabled ? '—' : count}</span>
                {!disabled && (
                  <span className="letter-go">
                    <IconChevronRight size={13} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="section-label">说明</div>
      <div className="card">
        <div className="card-desc" style={{ lineHeight: 1.75 }}>
          背单词时的评分、复习间隔和平时完全一样，只是范围限定在某个字母。
          公共库每个字母单独一个数据文件，点开才加载，不会拖慢首屏。
        </div>
      </div>
    </div>
  )
}
