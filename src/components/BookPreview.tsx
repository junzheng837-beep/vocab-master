import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppState } from '../core/store'
import { loadBook } from '../core/dict'
import { speak } from '../core/speech'
import { logger } from '../core/logger'
import type { RawWord } from '../core/types'
import { IconSpeaker } from './Icons'

interface Props {
  bookId: string
  name: string
  custom?: boolean
  onClose: () => void
}

const PAGE = 300

/** 词库预览：把一个词书里的所有单词列出来，可搜索 */
export default function BookPreview({ bookId, name, custom, onClose }: Props) {
  const state = useAppState()
  const [words, setWords] = useState<RawWord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    logger.info('preview', '打开词库预览', { bookId, name, custom: !!custom })

    const task = custom
      ? Promise.resolve(
          state.customBooks.find((b) => b.id === bookId)?.words ?? []
        )
      : loadBook(bookId).then((b) => b.words)

    task
      .then((list) => {
        if (!alive) return
        setWords(list)
        logger.info('preview', '词库预览已载入', { bookId, 词数: list.length })
      })
      .catch((err) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : '词书加载失败')
        logger.error('preview', '词库预览加载失败', err)
      })
      .finally(() => alive && setLoading(false))

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, custom])

  // 换搜索词时回到顶部
  useEffect(() => {
    setVisible(PAGE)
    listRef.current?.scrollTo({ top: 0 })
  }, [query])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return words
    return words.filter(
      (w) =>
        w.w.toLowerCase().includes(q) ||
        w.t.some(([, cn]) => cn.toLowerCase().includes(q))
    )
  }, [words, query])

  const shown = filtered.slice(0, visible)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-head">
          <div style={{ minWidth: 0 }}>
            <div className="preview-title">{name}</div>
            <div className="preview-sub">
              {loading
                ? '正在载入…'
                : `共 ${words.length} 个单词${query ? ` · 匹配 ${filtered.length} 个` : ''}`}
            </div>
          </div>
          <button className="icon-btn" title="关闭" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="preview-search">
          <input
            className="input"
            placeholder="搜索单词或中文释义"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoFocus
          />
        </div>

        {error && <div className="preview-error">{error}</div>}

        <div
          className="preview-list"
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200 && visible < filtered.length) {
              setVisible((v) => v + PAGE)
            }
          }}
        >
          {loading && <div className="preview-empty">正在加载词书…</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="preview-empty">没有匹配的单词</div>
          )}
          {shown.map((w, i) => (
            <div className="preview-row" key={`${w.w}-${i}`}>
              <div className="preview-word">
                <span className="preview-word-text">{w.w}</span>
                {(w.uk || w.us) && (
                  <span className="preview-phonetic">/{w.us || w.uk}/</span>
                )}
                <button
                  className="preview-speak"
                  title="朗读"
                  onClick={() => speak(w.w)}
                >
                  <IconSpeaker size={12} />
                </button>
                {w.g && <span className="preview-tag">{w.g}</span>}
              </div>
              <div className="preview-trans">
                {w.t.length
                  ? w.t.map(([p, cn], j) => (
                      <span key={j} className="preview-trans-item">
                        {p && <span className="preview-pos">{p}</span>}
                        {cn}
                      </span>
                    ))
                  : '—'}
              </div>
            </div>
          ))}
          {visible < filtered.length && (
            <div className="preview-more">
              还有 {filtered.length - visible} 个，向下滚动继续加载
            </div>
          )}
        </div>

        <div className="preview-foot">
          <span className="tiny" style={{ color: 'var(--text-tertiary)' }}>
            共 {filtered.length} 个单词
          </span>
          <button className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
