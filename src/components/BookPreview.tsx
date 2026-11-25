import { useEffect, useMemo, useRef, useState } from 'react'
import { store } from '../core/store'
import { formatBatchTime } from '../core/batch'
import {
  clearSelection,
  getSelection,
  isSelected,
  subscribeSelection,
  toggleSelection,
} from '../core/essay'
import { speak } from '../core/speech'
import { logger } from '../core/logger'
import type { RawWord } from '../core/types'
import { IconCheck, IconSpeaker } from './Icons'

interface Props {
  bookId: string
  name: string
  custom?: boolean
  onClose: () => void
  /** 选好词后跳到「选词生文」 */
  onOpenEssay: () => void
}

const PAGE = 300

/** 词库预览：把一个词书里的所有单词列出来，可搜索 */
export default function BookPreview({ bookId, name, custom, onClose, onOpenEssay }: Props) {
  const [words, setWords] = useState<RawWord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<string[]>(getSelection)
  const [msg, setMsg] = useState('')

  useEffect(() => subscribeSelection(() => setPicked(getSelection())), [])
  const [visible, setVisible] = useState(PAGE)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    logger.info('preview', '打开词库预览', { bookId, name, custom: !!custom })

    // 走 store 而不是直接读数据文件：这样追加词、删词、打乱后的顺序都能体现出来
    const task = store.getBookWords(bookId)

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

  // store 已经处理过追加词 / 删除 / 顺序，这里只需要滤掉刚点删的那几个（即时反馈）
  const allWords = useMemo(
    () => (removed.size ? words.filter((w) => !removed.has(w.w.toLowerCase())) : words),
    [words, removed]
  )

  /** 把勾选的词放进导出区 */
  const exportPicked = async () => {
    if (!picked.length) return
    const want = new Set(picked.map((w) => w.toLowerCase()))
    const words = allWords.filter((w) => want.has(w.w.toLowerCase()))
    const r = await store.addToExportZone(words)
    setMsg(r.added ? `已导出 ${r.added} 个到「${r.zoneName}」` : `这些词都在「${r.zoneName}」里了`)
    window.setTimeout(() => setMsg(''), 2600)
  }

  /** 把勾选的词加进拼写练习 */
  const addPickedToSpell = async () => {
    if (!picked.length) return
    const want = new Set(picked.map((w) => w.toLowerCase()))
    const words = allWords.filter((w) => want.has(w.w.toLowerCase()))
    const n = await store.addBookToSpellList(bookId, words)
    setMsg(n ? `已加入拼写 ${n} 个` : '这些词都已经在拼写里了')
    window.setTimeout(() => setMsg(''), 2600)
  }

  const removeWord = (w: RawWord) => {
    if (!window.confirm(`从「${name}」里删掉 “${w.w}”？`)) return
    setRemoved((prev) => new Set(prev).add(w.w.toLowerCase()))
    void store.removeWordFromBook(bookId, w.w)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allWords
    return allWords.filter(
      (w) =>
        w.w.toLowerCase().includes(q) ||
        w.t.some(([, cn]) => cn.toLowerCase().includes(q))
    )
  }, [allWords, query])

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
                : `共 ${allWords.length} 个单词${query ? ` · 匹配 ${filtered.length} 个` : ''}`}
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
            <div
              className={`preview-row ${isSelected(w.w) ? 'is-picked' : ''}`}
              key={`${w.w}-${i}`}
              title={w.addedAt ? `${formatBatchTime(w.addedAt)} 加入` : undefined}
              onClick={() => toggleSelection(w.w)}
            >
              <span className={`preview-check ${isSelected(w.w) ? 'on' : ''}`} aria-hidden="true">
                {isSelected(w.w) && <IconCheck size={10} />}
              </span>
              <div className="preview-word">
                <span className="preview-word-text">{w.w}</span>
                {(w.uk || w.us) && (
                  <span className="preview-phonetic">/{w.us || w.uk}/</span>
                )}
                <button
                  className="preview-speak"
                  title="朗读"
                  onClick={(e) => {
                    e.stopPropagation()
                    speak(w.w)
                  }}
                >
                  <IconSpeaker size={12} />
                </button>
                {w.g && <span className="preview-tag">{w.g}</span>}
                <button
                  className="preview-del"
                  title="从词书里删掉这个词"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeWord(w)
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.5 7l.8 12.1A1.9 1.9 0 0 0 9.2 21h5.6a1.9 1.9 0 0 0 1.9-1.9L17.5 7" />
                  </svg>
                </button>
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
            {msg ? <b style={{ color: 'var(--green)' }}>{msg}</b> : null}
            {msg ? ' · ' : ''}
            共 {filtered.length} 个单词
            {picked.length > 0 && (
              <>
                {' · '}
                <b style={{ color: 'var(--accent)' }}>已选 {picked.length} 个</b>
                <button
                  className="link-btn"
                  style={{ marginLeft: 8 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    clearSelection()
                  }}
                >
                  清空
                </button>
              </>
            )}
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={onClose}>
              关闭
            </button>
            <button
              className="btn"
              disabled={picked.length === 0}
              onClick={() => void exportPicked()}
              title="把勾选的词放进导出区"
            >
              导出
            </button>
            <button
              className="btn"
              disabled={picked.length === 0}
              onClick={() => void addPickedToSpell()}
              title="把勾选的词加入拼写练习"
            >
              加入拼写
            </button>
            <button
              className="btn btn-primary"
              disabled={picked.length === 0}
              onClick={onOpenEssay}
            >
              生成范文
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
