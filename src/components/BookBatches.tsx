import { useEffect, useMemo, useState } from 'react'
import { store, useAppState } from '../core/store'
import type { BookBatch } from '../core/types'
import { IconChevronRight } from './Icons'

interface Props {
  bookId: string
  name: string
  onClose: () => void
  onStart: (scope: string) => void
}

/**
 * 「小词库」：同一本词书里按加词时间分开的几组词。
 * 可以只背某一组，也可以整本一起背。
 */
export default function BookBatches({ bookId, name, onClose, onStart }: Props) {
  const state = useAppState()
  const [batches, setBatches] = useState<BookBatch[] | null>(null)

  useEffect(() => {
    let alive = true
    void store.getBookBatches(bookId).then((list) => {
      if (alive) setBatches(list)
    })
    return () => {
      alive = false
    }
  }, [bookId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const learnedOf = (b: BookBatch) =>
    b.words.filter((w) => state.states[`${bookId}::${w.w.toLowerCase()}`]).length

  const total = useMemo(
    () => batches?.reduce((n, b) => n + b.count, 0) ?? 0,
    [batches]
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal preview-modal batch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-head">
          <div style={{ minWidth: 0 }}>
            <div className="preview-title">{name} · 小词库</div>
            <div className="preview-sub">
              {batches === null
                ? '正在整理…'
                : `按加入时间分成 ${batches.length} 组，共 ${total} 个单词`}
            </div>
          </div>
        </div>

        <div className="batch-list">
          {batches === null ? (
            <div className="batch-empty">正在整理…</div>
          ) : batches.length === 0 ? (
            <div className="batch-empty">这本词书还没有单词</div>
          ) : (
            batches.map((b) => {
              const learned = learnedOf(b)
              return (
                <button
                  key={b.key}
                  className="batch-row"
                  onClick={() => onStart(`${bookId}::${encodeURIComponent(b.key)}`)}
                  title={`只背这一组：${b.label}`}
                >
                  <span className="batch-main">
                    <span className="batch-label">{b.label}</span>
                    <span className="batch-meta">
                      {b.count} 个词 · 已学 {learned}
                      {learned >= b.count && b.count > 0 ? ' · 已背完' : ''}
                    </span>
                  </span>
                  <span className="batch-go">
                    背这组
                    <IconChevronRight size={13} />
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="preview-foot">
          <span className="tiny" style={{ color: 'var(--text-tertiary)' }}>
            点一组只背那一组；整本会从没背过的词接着来
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={onClose}>
              关闭
            </button>
            <button
              className="btn btn-primary"
              onClick={() => onStart(bookId)}
              title="整本词书一起背"
            >
              整本一起背
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
