import { useMemo, useState } from 'react'
import { store, useAppState } from '../core/store'
import type { PageId } from '../components/Sidebar'
import BookPreview from '../components/BookPreview'
import { IconCheck, IconPlus, IconTrash } from '../components/Icons'

interface PreviewTarget {
  id: string
  name: string
  custom?: boolean
}

export default function LibraryPage({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const state = useAppState()
  const { manifest, customBooks, settings, states } = state
  const [preview, setPreview] = useState<PreviewTarget | null>(null)

  const progress = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of Object.values(states)) {
      if (s.stage === 'new') continue
      map[s.bookId] = (map[s.bookId] ?? 0) + 1
    }
    return map
  }, [states])

  const toggle = (id: string) => {
    const active = settings.activeBooks
    const next = active.includes(id) ? active.filter((x) => x !== id) : [...active, id]
    void store.updateSettings({ activeBooks: next })
  }

  const allBooks = [
    ...manifest.map((m) => ({
      ...m,
      count: m.count + (state.bookExtras[m.id]?.length ?? 0),
      custom: false,
    })),
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

  const totalSelected = allBooks
    .filter((b) => settings.activeBooks.includes(b.id))
    .reduce((s, b) => s + b.count, 0)

  const groups = useMemo(() => {
    const out: { category: string; books: typeof allBooks }[] = []
    for (const b of allBooks) {
      const cat = b.category ?? '其他'
      let g = out.find((x) => x.category === cat)
      if (!g) {
        g = { category: cat, books: [] }
        out.push(g)
      }
      g.books.push(b)
    }
    return out
  }, [allBooks])

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">词库</div>
        <div className="page-subtitle">
          已加入 {settings.activeBooks.length} 本，共 {totalSelected} 个单词参与学习
        </div>
      </div>

      {groups
        .filter((g) => g.category !== '自建')
        .map((g) => (
          <div key={g.category}>
            <div className="section-label">{g.category}</div>
            <div className="book-grid">
              {g.books.map((b) => {
                const selected = settings.activeBooks.includes(b.id)
                const learned = progress[b.id] ?? 0
                return (
                  <div
                    key={b.id}
                    className={`book-card ${selected ? 'selected' : ''}`}
                    onClick={() => toggle(b.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') toggle(b.id)
                    }}
                  >
                    <div className="row-between">
                      <span className="book-name">{b.name}</span>
                      <span className="book-check">
                        <IconCheck size={11} />
                      </span>
                    </div>
                    <div className="book-desc">{b.desc}</div>
                    <div className="book-foot">
                      <span className={`tag ${b.tag === '高频' ? 'accent' : ''}`}>{b.tag}</span>
                      <span className="book-foot-right">
                        <span>
                          {learned} / {b.count} 词
                        </span>
                        <button
                          className="preview-link"
                          onClick={(e) => {
                            e.stopPropagation()
                            window.location.hash = `/import/${b.id}`
                          }}
                        >
                          ＋ 添加单词
                        </button>
                        <button
                          className="preview-link"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPreview({ id: b.id, name: b.name })
                          }}
                        >
                          预览
                        </button>
                      </span>
                    </div>
                    <button
                      className={`book-add-btn ${selected ? 'added' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(b.id)
                      }}
                    >
                      {selected ? '已在词库 · 点击移出' : '加入我的词库'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

      <div className="section-label">自建词库</div>
      {customBooks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '26px 20px' }}>
          <div className="card-desc" style={{ marginBottom: 14 }}>
            还没有自建词库。你可以把自己遇到的单词整理进来，内置词库里有的词会自动补上释义。
          </div>
          <button className="btn" onClick={() => onNavigate('import')}>
            <IconPlus size={14} />
            导入自己的单词
          </button>
        </div>
      ) : (
        <div className="book-grid">
          {customBooks.map((b) => {
            const selected = settings.activeBooks.includes(b.id)
            const learned = progress[b.id] ?? 0
            return (
              <div
                key={b.id}
                className={`book-card ${selected ? 'selected' : ''}`}
                onClick={() => toggle(b.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') toggle(b.id)
                }}
              >
                <div className="row-between">
                  <span className="book-name">{b.name}</span>
                  <span className="row" style={{ gap: 4 }}>
                    <span
                      className="icon-btn"
                      role="button"
                      tabIndex={0}
                      title="删除这本词书"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`删除「${b.name}」？这本词书的学习记录也会一起删除。`)) {
                          void store.removeCustomBook(b.id)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.stopPropagation()
                      }}
                    >
                      <IconTrash size={14} />
                    </span>
                    <span className="book-check">
                      <IconCheck size={11} />
                    </span>
                  </span>
                </div>
                <div className="book-desc">{b.desc || '自建词书'}</div>
                <div className="book-foot">
                  <span className="tag">自建</span>
                  <span className="book-foot-right">
                    <span>
                      {learned} / {b.words.length} 词
                    </span>
                    <button
                      className="preview-link"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.location.hash = `/import/${b.id}`
                      }}
                    >
                      ＋ 添加单词
                    </button>
                    <button
                      className="preview-link"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPreview({ id: b.id, name: b.name, custom: true })
                      }}
                    >
                      预览
                    </button>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="section-label">说明</div>
      <div className="card">
        <div className="card-desc" style={{ lineHeight: 1.75 }}>
          选中的词书会一起进入每日学习队列，新词在各词书之间轮流出现。
          四级、六级、考研三本存在重叠词汇（同一个词不会重复学习）。
          生活日常用语按「餐饮、出行、购物、居家」等 12 个场景分好组。
          点任意词书右下角的「预览」，可以先翻一遍这本书里的全部单词再决定要不要学。
        </div>
      </div>

      {preview && (
        <BookPreview
          bookId={preview.id}
          name={preview.name}
          custom={preview.custom}
          extraWords={state.bookExtras[preview.id]}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}
