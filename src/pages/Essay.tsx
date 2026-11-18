import { useEffect, useMemo, useState } from 'react'
import {
  clearSelection,
  getSelection,
  loadEssays,
  matchEssays,
  removeSelection,
  splitByHits,
  subscribeSelection,
  type Essay,
} from '../core/essay'
import { logger } from '../core/logger'
import type { PageId } from '../components/Sidebar'
import { IconBooks, IconSparkle } from '../components/Icons'

interface Props {
  onNavigate: (p: PageId) => void
}

/** 选词生文：从范文库里挑一篇最能用到所选单词的 */
export default function EssayPage({ onNavigate }: Props) {
  const [essays, setEssays] = useState<Essay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<string[]>(getSelection)
  const [pick, setPick] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => subscribeSelection(() => setSelection(getSelection())), [])

  useEffect(() => {
    let alive = true
    loadEssays()
      .then((list) => {
        if (!alive) return
        setEssays(list)
        logger.info('essay', '范文库已载入', { 篇数: list.length })
      })
      .catch((err) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : '范文库加载失败')
        logger.error('essay', '范文库加载失败', err)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // 选词变了就回到最匹配的那篇
  useEffect(() => {
    setPick(0)
  }, [selection.length])

  const matches = useMemo(() => {
    if (!essays.length || !selection.length) return []
    return matchEssays(essays, selection).slice(0, 8)
  }, [essays, selection])

  const current = matches[Math.min(pick, Math.max(0, matches.length - 1))]
  const parts = useMemo(
    () => (current ? splitByHits(current.essay.text, current.hits) : []),
    [current]
  )

  const exportMd = () => {
    if (!current) return
    const lines = [
      '# 选词生文',
      '',
      `选中的词（${selection.length} 个）：${selection.join(', ')}`,
      '',
      `## ${current.essay.title}`,
      '',
      `> ${current.essay.topic} · ${current.essay.words} 词 · 用上 ${current.hits.length} 个`,
      '',
      current.essay.text,
      '',
      current.misses.length ? `没用上的词：${current.misses.join(', ')}` : '',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `选词生文-${current.essay.title.replace(/[\\/:*?"<>|]/g, '')}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.setTimeout(() => URL.revokeObjectURL(a.href), 3000)
    logger.info('essay', '已导出范文', { 词数: selection.length })
  }

  const copy = () => {
    if (!current) return
    const text = `${current.essay.title}\n\n${current.essay.text}\n\n用上的词：${current.hits.join(', ')}`
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      })
      .catch(() => {})
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">选词生文</div>
        </div>
        <div className="card-desc">正在加载范文库…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">选词生文</div>
        </div>
        <div className="empty">
          <div className="empty-title">范文库没能加载出来</div>
          <div className="empty-desc">{error}</div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn" onClick={() => window.location.reload()}>
              重试
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!selection.length) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">选词生文</div>
          <div className="page-subtitle">
            从词库里挑几个词，给你一篇用得上这些词的高考范文
          </div>
        </div>
        <div className="empty">
          <div className="empty-icon">
            <IconSparkle size={24} />
          </div>
          <div className="empty-title">还没有选词</div>
          <div className="empty-desc">
            去「词库」打开任意一本，点单词左边的小圆圈就能选；选完点「生成范文」。
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn btn-primary" onClick={() => onNavigate('library')}>
              去词库选词
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">选词生文</div>
        <div className="page-subtitle">
          共 {essays.length} 篇高考范文，按用上你选的词多少排序
        </div>
      </div>

      <div className="section-label">
        已选 {selection.length} 个词
        <button
          className="link-btn"
          style={{ marginLeft: 10 }}
          onClick={() => {
            clearSelection()
            setPick(0)
          }}
        >
          清空
        </button>
      </div>
      <div className="essay-chips">
        {selection.map((w) => (
          <button key={w} className="essay-chip" onClick={() => removeSelection(w)} title="点一下去掉">
            {w}
            <span className="essay-chip-x">×</span>
          </button>
        ))}
        <button className="essay-chip add" onClick={() => onNavigate('library')}>
          ＋ 继续选
        </button>
      </div>

      {current && (
        <>
          <div className="section-label" style={{ marginTop: 20 }}>
            匹配到的范文
          </div>
          <div className="essay-match-list">
            {matches.map((m, i) => (
              <button
                key={m.essay.id}
                className={`essay-match ${i === pick ? 'active' : ''}`}
                onClick={() => setPick(i)}
              >
                <span className="essay-match-title">{m.essay.title}</span>
                <span className="essay-match-meta">
                  {m.essay.topic} · 用上 {m.hits.length} 个
                </span>
              </button>
            ))}
          </div>

          <div className="card essay-card">
            <div className="essay-head">
              <div>
                <div className="essay-title">{current.essay.title}</div>
                <div className="essay-meta">
                  {current.essay.topic} · {current.essay.words} 词 · 用上 {current.hits.length}/
                  {selection.length}
                </div>
              </div>
              <div className="row" style={{ gap: 8, marginLeft: 'auto', flex: '0 0 auto' }}>
                <button className="btn" onClick={copy}>
                  {copied ? '已复制' : '复制'}
                </button>
                <button className="btn" onClick={exportMd}>
                  导出
                </button>
              </div>
            </div>

            <p className="essay-body">
              {parts.map((p, i) =>
                p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>
              )}
            </p>

            {current.misses.length > 0 && (
              <div className="essay-miss">
                <div className="essay-miss-title">这篇没用上的词（{current.misses.length} 个）</div>
                <div className="essay-chips">
                  {current.misses.map((w) => (
                    <span key={w} className="essay-chip miss">
                      {w}
                    </span>
                  ))}
                </div>
                <div className="essay-miss-hint">
                  换一篇试试，或者先把这些词背熟再回来。
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="section-label">怎么用</div>
      <div className="card">
        <div className="card-desc" style={{ lineHeight: 1.9 }}>
          1. 在「词库」里点开任意一本，点单词左边的小圆圈选中<br />
          2. 选够 3 个以上，点底部的「生成范文」<br />
          3. 这里会按「用上了几个你选的词」排序，标黄的就是用上的<br />
          4. 范文是预置的高考范文，不会为了凑词硬编句子，所以不是每个词都能用上
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => onNavigate('library')}>
          <IconBooks size={13} />
          去词库选词
        </button>
      </div>
    </div>
  )
}
