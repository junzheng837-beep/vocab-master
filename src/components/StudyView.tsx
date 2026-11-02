import { useEffect, useMemo } from 'react'
import { store, useAppState } from '../core/store'
import { speak } from '../core/speech'
import type { Rating } from '../core/types'
import { IconChevronLeft, IconChevronRight, IconSpeaker } from './Icons'

const RATE_META: { r: Rating; label: string; sub: string }[] = [
  { r: 0, label: '待会再来', sub: '本轮重来' },
  { r: 1, label: '困难', sub: '1 天后' },
  { r: 2, label: '一般', sub: '3 天后' },
  { r: 3, label: '容易', sub: '7 天后' },
]

function highlightSentence(en: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${escaped}[a-z]{0,3})`, 'ig')
  const parts = en.split(re)
  return parts.map((p, i) =>
    re.test(p) ? <b key={i}>{p}</b> : <span key={i}>{p}</span>
  )
}

export default function StudyView({ scope }: { scope: string | null }) {
  const state = useAppState()
  const { session, settings } = state
  const { entries, cursor, revealed } = session

  const entry = entries[cursor]
  const doneCount = useMemo(() => entries.filter((e) => e.done).length, [entries])
  const total = entries.length
  const progress = total ? (doneCount / total) * 100 : 0
  const finished = total > 0 && doneCount >= total

  const scopeName = useMemo(() => {
    if (!scope) return '全部词库'
    return (
      state.manifest.find((m) => m.id === scope)?.name ??
      state.customBooks.find((b) => b.id === scope)?.name ??
      '词书'
    )
  }, [scope, state.manifest, state.customBooks])

  // 进入页面时按当前词书准备会话；已经在学同一本则保持进度
  useEffect(() => {
    if (!state.ready) return
    if (session.built && session.scope === scope) return
    if (scope && !state.settings.activeBooks.includes(scope)) {
      // 从公共词库点进来的，先加入「我的词库」再开始
      void store.startBook(scope)
    } else {
      void store.rebuildSession(scope)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, session.built, session.scope, state.ready])

  const reveal = () => {
    store.reveal()
    if (settings.autoSpeak && entry) speak(entry.word.w)
  }

  const rate = (r: Rating) => {
    if (!revealed) return
    void store.rate(r)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.code === 'Space') {
        e.preventDefault()
        if (!revealed) reveal()
        return
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault()
        store.move(1)
        return
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault()
        store.move(-1)
        return
      }
      if (['0', '1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        rate(Number(e.key) as Rating)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (session.loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>正在准备今天的单词…</span>
      </div>
    )
  }

  if (!total) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <IconSpeaker size={24} />
        </div>
        <div className="empty-title">今天没有要背的单词</div>
        <div className="empty-desc">
          可能是所有到期单词都复习完了，或者你还没选择词书。去「词库」里挑一本，或者在「设置」里调整每天的新词数量。
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn" onClick={() => void store.rebuildSession(scope)}>
            重新生成今日计划
          </button>
          <button className="btn" onClick={() => (window.location.hash = '/study')}>
            换一本词书
          </button>
        </div>
      </div>
    )
  }

  if (finished) {
    const retried = entries.filter((e) => e.retried > 0).length
    return (
      <div className="empty">
        <div className="empty-icon" style={{ color: 'var(--green)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4.5 12.5 5 5 10-11" />
          </svg>
        </div>
        <div className="empty-title">这一轮背完了</div>
        <div className="empty-desc">
          共 {doneCount} 个单词，其中 {retried} 个是「待会再来」重新过了一遍的。
          到期的单词会按 1 / 3 / 7 天的节奏自动回到你的复习队列。
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn btn-primary" onClick={() => void store.rebuildSession(scope)}>
            再学一轮
          </button>
          <button className="btn" onClick={() => (window.location.hash = '/study')}>
            换一本词书
          </button>
        </div>
      </div>
    )
  }

  if (!entry) return null

  const hasContent = entry.word.t.length > 0

  return (
    <div className="study">
      <div className="study-top">
        <button
          className="icon-btn"
          onClick={() => (window.location.hash = '/study')}
          title="返回词库选择"
          aria-label="返回"
        >
          <IconChevronLeft size={18} />
        </button>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="study-scope">{scopeName}</div>
        <div className="study-counter">
          {doneCount} / {total}
        </div>
      </div>

      <div className={`study-body ${revealed ? 'is-revealed' : ''}`}>
        <button
          className="nav-arrow left"
          onClick={() => store.move(-1)}
          aria-label="上一个"
          title="上一个（←）"
        >
          <IconChevronLeft size={20} />
        </button>
        <button
          className="nav-arrow right"
          onClick={() => store.move(1)}
          aria-label="下一个"
          title="下一个（→）"
        >
          <IconChevronRight size={20} />
        </button>

        <div className="word-area">
          <div className="word-text" key={entry.entryId}>
            {entry.word.w}
          </div>
          <div className="word-meta">
            {entry.isNew && <span className="word-badge new">新词</span>}
            {!entry.isNew && entry.retried === 0 && <span className="word-badge">复习</span>}
            {entry.retried > 0 && <span className="word-badge retry">第 {entry.retried + 1} 次</span>}
            {entry.word.g && <span className="word-badge">{entry.word.g}</span>}
          </div>
        </div>

        <div className="reveal-zone" onClick={reveal}>
          {!revealed ? (
            <div className="reveal-hint">
              <span>点击此处查看释义</span>
              <span>
                或按 <span className="kbd">空格</span>
              </span>
            </div>
          ) : (
            <div className="reveal-content">
              {(entry.word.uk || entry.word.us) && (
                <div className="phonetics">
                  {entry.word.uk && (
                    <span className="phonetic-item">
                      <span className="phonetic-tag">UK</span>/{entry.word.uk}/
                      <button
                        className="icon-btn"
                        style={{ width: 22, height: 22 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          speak(entry.word.w, 'uk')
                        }}
                      >
                        <IconSpeaker size={13} />
                      </button>
                    </span>
                  )}
                  {entry.word.us && (
                    <span className="phonetic-item">
                      <span className="phonetic-tag">US</span>/{entry.word.us}/
                      <button
                        className="icon-btn"
                        style={{ width: 22, height: 22 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          speak(entry.word.w, 'us')
                        }}
                      >
                        <IconSpeaker size={13} />
                      </button>
                    </span>
                  )}
                </div>
              )}

              {hasContent ? (
                <div className="trans-list">
                  {entry.word.t.map(([pos, cn], i) => (
                    <div className="trans-item" key={i}>
                      {pos && <span className="trans-pos">{pos}</span>}
                      <span>{cn}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="trans-list">
                  <div className="trans-item muted">这个词还没有释义，去「词库」里补一下</div>
                </div>
              )}

              {entry.word.s.length > 0 && (
                <div className="block">
                  <div className="block-head">例句</div>
                  {entry.word.s.map(([en, cn], i) => (
                    <div className="sentence" key={i}>
                      <div className="sentence-en">{highlightSentence(en, entry.word.w)}</div>
                      <div className="sentence-cn">{cn}</div>
                    </div>
                  ))}
                </div>
              )}

              {entry.word.p.length > 0 && (
                <div className="block">
                  <div className="block-head">短语</div>
                  {entry.word.p.map(([en, cn], i) => (
                    <div className="sentence" key={i}>
                      <div className="sentence-en">{en}</div>
                      <div className="sentence-cn">{cn}</div>
                    </div>
                  ))}
                </div>
              )}

              {entry.word.r.length > 0 && (
                <div className="block">
                  <div className="block-head">词根词缀</div>
                  {entry.word.r.map(([root, meaning, cls], i) => (
                    <div className="root-item" key={i}>
                      <span className="root-name">{root}</span>
                      <span className="root-class">{cls}</span>
                      <span className="root-meaning">{meaning}</span>
                    </div>
                  ))}
                </div>
              )}

              {entry.word.syn && entry.word.syn.length > 0 && (
                <div className="block">
                  <div className="block-head">近义</div>
                  {entry.word.syn.map(([cn, words], i) => (
                    <div className="chips" key={i} style={{ marginBottom: 6 }}>
                      <span className="chip">{cn}</span>
                      {words.map((w) => (
                        <span className="chip chip-en" key={w}>
                          {w}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="study-bottom">
        <div className="rate-row">
          {RATE_META.map(({ r, label, sub }) => (
            <button
              key={r}
              className={`rate-btn r${r}`}
              disabled={!revealed}
              onClick={() => rate(r)}
            >
              <span className="rate-key">{r}</span>
              <span className="rate-label">{label}</span>
              <span className="rate-sub">{sub}</span>
            </button>
          ))}
        </div>
        <div className="study-hintbar">
          <span>
            <span className="kbd">空格</span> 显示释义
          </span>
          <span>
            <span className="kbd">←</span>
            <span className="kbd">→</span> 切换单词
          </span>
          <span>
            <span className="kbd">0</span>
            <span className="kbd">1</span>
            <span className="kbd">2</span>
            <span className="kbd">3</span> 评分
          </span>
        </div>
      </div>
    </div>
  )
}
