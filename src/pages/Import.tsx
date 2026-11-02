import { useMemo, useState } from 'react'
import { store } from '../core/store'
import { lookupWords } from '../core/dict'
import { logger } from '../core/logger'
import type { PageId } from '../components/Sidebar'
import type { RawWord } from '../core/types'
import { IconCheck, IconSparkle } from '../components/Icons'

interface ParsedItem {
  word: string
  note: string
}

/** 解析用户粘贴的文本，支持「一行一个单词」和「单词 + 自定义释义」 */
function parseLines(text: string): ParsedItem[] {
  const out: ParsedItem[] = []
  const seen = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim()
    if (!raw || raw.startsWith('#')) continue

    let word = raw
    let note = ''

    // 常见分隔符：制表符、逗号、中文逗号、分号、两个以上空格
    const m = raw.match(/^([A-Za-z][A-Za-z'\-]*(?:\s[A-Za-z][A-Za-z'\-]*)?)\s*(?:[\t,，;；]|\s{2,})\s*(.+)$/)
    if (m) {
      word = m[1].trim()
      note = m[2].trim()
    } else if (/^[A-Za-z][A-Za-z'\- ]*$/.test(raw)) {
      word = raw
    } else {
      // 形如 "abandon 放弃"（单个空格 + 中文）
      const m2 = raw.match(/^([A-Za-z][A-Za-z'\-]*)\s+([\u4e00-\u9fa5].*)$/)
      if (m2) {
        word = m2[1]
        note = m2[2]
      }
    }

    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ word, note })
  }
  return out
}

export default function ImportPage({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [items, setItems] = useState<ParsedItem[]>([])
  const [hits, setHits] = useState<Map<string, RawWord>>(new Map())
  const [manual, setManual] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  const missList = useMemo(
    () => items.filter((it) => !hits.has(it.word)),
    [items, hits]
  )

  const recognized = items.length > 0

  async function analyze() {
    const parsed = parseLines(text)
    if (!parsed.length) {
      logger.warn('import', '识别失败：没有解析到任何单词')
      return
    }
    setBusy(true)
    setSaved(null)
    logger.info('import', '开始识别单词', { 行数: parsed.length, 原始字符数: text.length })
    try {
      const { hits: h, misses } = await lookupWords(parsed.map((p) => p.word))
      setItems(parsed)
      setHits(h)
      const m: Record<string, string> = {}
      for (const p of parsed) {
        if (!h.has(p.word) && p.note) m[p.word] = p.note
      }
      setManual(m)
      logger.info('import', '识别完成', {
        总数: parsed.length,
        命中: h.size,
        未收录: misses.length,
        带例句: [...h.values()].filter((w) => w.s.length > 0).length,
        未收录词: misses.slice(0, 20),
      })
    } catch (err) {
      logger.error('import', '识别过程出错', err)
      alert('识别失败，请检查网络后重试。详情见调试日志。')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    const bookName = name.trim() || '我的词书'
    const words: RawWord[] = items.map((it) => {
      const hit = hits.get(it.word)
      if (hit) return hit
      const note = (manual[it.word] ?? it.note ?? '').trim()
      return {
        w: it.word,
        t: note ? [['', note]] : [],
        s: [],
        p: [],
        r: [],
      }
    })
    logger.info('import', '保存自建词书', {
      名称: bookName,
      词数: words.length,
      无释义: words.filter((w) => w.t.length === 0).length,
    })
    const book = await store.addCustomBook(
      bookName,
      `${words.length} 个自定义单词`,
      words
    )
    setSaved(book.name)
    setName('')
    setText('')
    setItems([])
    setHits(new Map())
    setManual({})
  }

  const hitCount = items.filter((it) => hits.has(it.word)).length

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">导入词库</div>
        <div className="page-subtitle">
          粘贴你遇到的单词，内置词库有的会自动补上音标、释义和例句，你只需要给没收录的补一下
        </div>
      </div>

      {saved && (
        <div
          className="card fade-in"
          style={{
            marginBottom: 16,
            borderColor: 'rgba(48,209,88,0.4)',
            background: 'rgba(48,209,88,0.08)',
          }}
        >
          <div className="row" style={{ gap: 8 }}>
            <span style={{ color: 'var(--green)', display: 'flex' }}>
              <IconCheck size={15} />
            </span>
            <span style={{ fontSize: 13 }}>
              「{saved}」已保存。去「词库」里勾选它就能开始背了。
            </span>
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => onNavigate('library')}>
              去看词库
            </button>
          </div>
        </div>
      )}

      <div className="field" style={{ marginBottom: 16 }}>
        <label className="field-label">词书名称</label>
        <input
          className="input"
          placeholder="例如：我的生词本、雅思核心、专业术语"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">
          单词列表
          <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
            {' '}
            · 一行一个，也支持「单词 释义」的格式
          </span>
        </label>
        <textarea
          className="input"
          placeholder={'abandon\nubiquitous 无处不在的\nresilience\nmeticulous, 一丝不苟的'}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setItems([])
            setSaved(null)
          }}
          rows={9}
        />
      </div>

      <div className="row" style={{ marginBottom: 20 }}>
        <button className="btn btn-primary" disabled={!text.trim() || busy} onClick={() => void analyze()}>
          {busy ? '正在查词…' : '识别单词'}
        </button>
        {recognized && (
          <span className="tiny muted">
            共 {items.length} 个单词，{hitCount} 个自动匹配到释义
            {missList.length > 0 && `，${missList.length} 个需要你补充`}
          </span>
        )}
      </div>

      {recognized && (
        <>
          <div className="section-label">识别结果</div>
          <div className="import-preview">
            {items.map((it) => {
              const hit = hits.get(it.word)
              return (
                <div className="import-row" key={it.word}>
                  <span className="import-word">{it.word}</span>
                  {hit ? (
                    <>
                      <span className="import-trans">
                        {hit.t.map(([pos, cn]) => `${pos ? pos + ' ' : ''}${cn}`).join('；')}
                      </span>
                      <span className="import-ok">
                        <IconSparkle size={11} />
                        {hit.s.length > 0 ? `${hit.s.length} 条例句` : '仅释义'}
                      </span>
                    </>
                  ) : (
                    <>
                      <input
                        className="input"
                        style={{ height: 24, flex: 1, fontSize: 12 }}
                        placeholder="未收录，手动填一下中文释义"
                        value={manual[it.word] ?? it.note ?? ''}
                        onChange={(e) =>
                          setManual({ ...manual, [it.word]: e.target.value })
                        }
                      />
                      <span className="import-miss">未收录</span>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => void save()}>
              保存为词书
            </button>
            <button className="btn" onClick={() => onNavigate('library')}>
              取消
            </button>
          </div>
        </>
      )}

      <div className="section-label">怎么用</div>
      <div className="card">
        <div className="card-desc" style={{ lineHeight: 1.8 }}>
          1. 给词书起个名字，比如「阅读生词」<br />
          2. 把单词粘进上面的框，一行一个<br />
          3. 点「识别单词」，初中 / 高中 / 四级 / 六级 / 考研 / 日常词库里有的词会自动带出音标、释义和例句<br />
          4. 没收录的词在右边填一下中文意思，然后保存<br />
          5. 保存后回到「词库」勾选它，就会加入每日学习队列
        </div>
      </div>
    </div>
  )
}
