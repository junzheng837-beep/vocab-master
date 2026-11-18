import { useMemo, useState } from 'react'
import { DEFAULT_EXPORT_ZONE, store, useAppState } from '../core/store'
import { logger } from '../core/logger'
import type { ExportWord } from '../core/types'
import type { PageId } from '../components/Sidebar'
import { IconBooks, IconPlus, IconTrash } from '../components/Icons'

interface Props {
  onNavigate: (p: PageId) => void
}

function meaningOf(w: ExportWord): string {
  if (!w.t.length) return ''
  return w.t.map(([pos, cn]) => (pos ? `${pos} ${cn}` : cn)).join('；')
}

function download(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(a.href), 3000)
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 导出区：把选中的词收进分区，再导出成文件 */
export default function ExportPage({ onNavigate }: Props) {
  const state = useAppState()
  const { exportData } = state
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')

  const zone = useMemo(
    () => exportData.zones.find((z) => z.id === exportData.activeId) ?? exportData.zones[0],
    [exportData]
  )

  const words = useMemo(() => {
    if (!zone) return []
    const q = query.trim().toLowerCase()
    if (!q) return zone.words
    return zone.words.filter(
      (w) => w.w.toLowerCase().includes(q) || meaningOf(w).toLowerCase().includes(q)
    )
  }, [zone, query])

  const flash = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 2600)
  }

  const createZone = async () => {
    const name = newName.trim()
    if (!name) return
    await store.createExportZone(name)
    setNewName('')
    setCreating(false)
    flash(`已新建分区「${name}」`)
  }

  const exportAs = (fmt: 'txt' | 'csv' | 'md') => {
    if (!zone?.words.length) return
    const stamp = new Date().toISOString().slice(0, 10)
    const base = `导出区-${zone.name}-${stamp}`

    if (fmt === 'txt') {
      const text = zone.words.map((w) => `${w.w}\t${meaningOf(w)}`).join('\n')
      download(`${base}.txt`, text, 'text/plain')
    } else if (fmt === 'csv') {
      const rows = [
        ['word', 'phonetic', 'meaning'].join(','),
        ...zone.words.map((w) => [w.w, w.ph ?? '', meaningOf(w)].map(csvCell).join(',')),
      ]
      download(`${base}.csv`, rows.join('\n'), 'text/csv')
    } else {
      const lines = [
        `# ${zone.name}`,
        '',
        `共 ${zone.words.length} 个单词`,
        '',
        '| 单词 | 音标 | 释义 |',
        '| --- | --- | --- |',
        ...zone.words.map(
          (w) => `| ${w.w} | ${w.ph ? `/${w.ph}/` : ''} | ${meaningOf(w).replace(/\|/g, '\\|')} |`
        ),
      ]
      download(`${base}.md`, lines.join('\n'), 'text/markdown')
    }
    logger.info('export', '导出文件', { 格式: fmt, 分区: zone.name, 词数: zone.words.length })
    flash(`已导出 ${zone.words.length} 个词（${fmt.toUpperCase()}）`)
  }

  const copyOne = (w: ExportWord) => {
    navigator.clipboard
      ?.writeText(w.w)
      .then(() => flash(`已复制「${w.w}」`))
      .catch(() => flash('复制失败'))
  }

  const copyAll = () => {
    if (!zone?.words.length) return
    const text = zone.words.map((w) => `${w.w}\t${meaningOf(w)}`).join('\n')
    navigator.clipboard
      ?.writeText(text)
      .then(() => flash(`已复制 ${zone.words.length} 个词`))
      .catch(() => flash('复制失败，可以改用导出文件'))
  }

  if (!zone) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">导出区</div>
        </div>
        <div className="card-desc">正在载入…</div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">导出区</div>
        <div className="page-subtitle">
          从词库导出的单词会先收到这里，按分区整理，再导出成 txt / csv / Markdown
        </div>
      </div>

      {notice && (
        <div
          className="card fade-in"
          style={{
            marginBottom: 14,
            borderColor: 'rgba(48,209,88,0.4)',
            background: 'rgba(48,209,88,0.08)',
          }}
        >
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontSize: 13 }}>{notice}</span>
          </div>
        </div>
      )}

      <div className="section-label">分区</div>
      <div className="zone-bar">
        {exportData.zones.map((z) => (
          <button
            key={z.id}
            className={`zone-chip ${z.id === zone.id ? 'on' : ''}`}
            onClick={() => void store.setActiveExportZone(z.id)}
          >
            {z.name}
            <span className="zone-chip-num">{z.words.length}</span>
          </button>
        ))}
        {creating ? (
          <span className="zone-new">
            <input
              className="input"
              style={{ height: 26, width: 120, fontSize: 12 }}
              placeholder="分区名"
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createZone()
                if (e.key === 'Escape') setCreating(false)
              }}
            />
            <button className="btn" style={{ height: 26 }} onClick={() => void createZone()}>
              建
            </button>
          </span>
        ) : (
          <button className="zone-chip add" onClick={() => setCreating(true)}>
            <IconPlus size={11} />
            新建分区
          </button>
        )}
      </div>

      <div className="row" style={{ marginTop: 16, marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={!zone.words.length} onClick={() => exportAs('txt')}>
          导出 TXT
        </button>
        <button className="btn" disabled={!zone.words.length} onClick={() => exportAs('csv')}>
          导出 CSV
        </button>
        <button className="btn" disabled={!zone.words.length} onClick={() => exportAs('md')}>
          导出 Markdown
        </button>
        <button className="btn" disabled={!zone.words.length} onClick={copyAll}>
          复制全部
        </button>
        <div style={{ flex: 1 }} />
        {zone.words.length > 0 && (
          <button
            className="btn"
            onClick={() => {
              if (confirm(`清空「${zone.name}」里的 ${zone.words.length} 个单词？`)) {
                void store.clearExportZone(zone.id)
                flash('已清空')
              }
            }}
          >
            清空
          </button>
        )}
        {zone.id !== DEFAULT_EXPORT_ZONE && (
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm(`删除分区「${zone.name}」？里面的单词也会一起删掉。`)) {
                void store.removeExportZone(zone.id)
                flash('分区已删除')
              }
            }}
          >
            <IconTrash size={13} />
            删除分区
          </button>
        )}
      </div>

      {zone.words.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <IconBooks size={24} />
          </div>
          <div className="empty-title">「{zone.name}」还是空的</div>
          <div className="empty-desc">
            去「词库」点卡片上的「导出」，或者在预览里勾选几个词再导出，单词就会收到这里。
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn btn-primary" onClick={() => onNavigate('library')}>
              去词库导出
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 10, gap: 10 }}>
            <span className="tiny" style={{ color: 'var(--text-tertiary)' }}>
              共 {zone.words.length} 个单词
              {query ? ` · 匹配 ${words.length} 个` : ''} · 点单词即可复制
            </span>
            <input
              className="input"
              style={{ height: 26, maxWidth: 220, marginLeft: 'auto', fontSize: 12 }}
              placeholder="搜索单词或释义"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="export-list">
            {words.map((w) => (
              <div
                className="export-row"
                key={w.w}
                onClick={() => copyOne(w)}
                title="点一下复制这个单词"
              >
                <div className="export-word">
                  <span className="export-word-text">{w.w}</span>
                  {w.ph && <span className="export-ph">/{w.ph}/</span>}
                </div>
                <div className="export-trans">{meaningOf(w) || '—'}</div>
                <button
                  className="preview-del"
                  style={{ opacity: 0.4, marginLeft: 0 }}
                  title="从分区里删掉"
                  onClick={(e) => {
                    e.stopPropagation()
                    void store.removeWordFromExportZone(zone.id, w.w)
                  }}
                >
                  <IconTrash size={12} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
