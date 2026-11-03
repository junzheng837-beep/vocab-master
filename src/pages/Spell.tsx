import { useEffect, useMemo, useState } from 'react'
import { store, useAppState } from '../core/store'
import { loadSpellLibraries } from '../core/dict'
import { speak } from '../core/speech'
import { shuffle } from '../core/utils'
import { logger } from '../core/logger'
import type { RawWord, SpellLibWord, SpellLibrary } from '../core/types'
import { IconBooks, IconSpeaker, IconSparkle, IconTrash } from '../components/Icons'

const HINT_LABELS = ['提示读音', '提示骨架', '提示前半段', '直接看答案']
/** 提示一共 4 级：读音 → 骨架 → 前半段 → 完整答案 */
const MAX_HINT = 4

interface Affix {
  /** 展示用，如「pre-（在前）」 */
  label: string
  /** 实际匹配到的字母，用于遮罩时保留 */
  part: string
}

/** 词根表里的写法五花八门（-al2、con-、-ance, -ence），统一成能匹配的纯字母 */
function normalizeAffix(raw: string): string {
  return raw.replace(/\d+/g, '').replace(/[^a-zA-Z]/g, '').toLowerCase()
}

function prettyAffix(raw: string): string {
  return raw.replace(/\d+/g, '').trim()
}

/** 从词根词缀数据里找能匹配词首的前缀 */
function prefixOf(word: RawWord): Affix | null {
  const w = word.w.toLowerCase()
  for (const [root, meaning, cls] of word.r) {
    if (!cls.includes('前缀')) continue
    for (const raw of root.split(/[,\s]+/)) {
      const part = normalizeAffix(raw)
      if (part.length < 2 || !w.startsWith(part)) continue
      return { label: `${prettyAffix(raw)}${shortMeaning(meaning)}`, part }
    }
  }
  return null
}

/** 从词根词缀数据里找能匹配词尾的后缀 */
function suffixOf(word: RawWord): Affix | null {
  const w = word.w.toLowerCase()
  for (const [root, meaning, cls] of word.r) {
    if (!cls.includes('后缀')) continue
    for (const raw of root.split(/[,\s]+/)) {
      const part = normalizeAffix(raw)
      if (part.length < 2 || !w.endsWith(part)) continue
      return { label: `${prettyAffix(raw)}${shortMeaning(meaning)}`, part }
    }
  }
  return null
}

/** 释义只取一小段，避免提示里塞一大段英文解释 */
function shortMeaning(meaning: string): string {
  const first = meaning.split(/[;；]/)[0].trim()
  if (!first) return ''
  const isCn = /[\u4e00-\u9fa5]/.test(first)
  const label = isCn
    ? first.split(/,/)[0].trim()
    : first.split(/\s+/).slice(0, 3).join(' ').replace(/[,;:.]+$/, '')
  return label ? `（${label}）` : ''
}

/**
 * 按提示等级遮罩单词。
 *
 * 1 级只给读音，不动字母；
 * 2 级给「骨架」——有词缀就露出前后缀，没有就露首尾字母；
 * 3 级露出前半段（至少比上一级多，且始终留 3 个空）；
 * 4 级全露。
 */
function maskWord(
  word: string,
  level: number,
  prefixLen: number,
  suffixLen: number
): string[] {
  const chars = [...word]
  const letters = chars.map((c, i) => ({ c, i })).filter((x) => /[a-zA-Z]/.test(x.c))
  const visible = new Set<number>()

  const revealFirst = (n: number) => {
    letters.slice(0, Math.max(0, n)).forEach((x) => visible.add(x.i))
  }

  if (level >= 4) {
    letters.forEach((x) => visible.add(x.i))
  } else if (level === 3) {
    const half = Math.ceil(letters.length / 2)
    // 上一级如果已经靠词缀露了不少字母，这一级至少再多给两个，否则看不出进展
    const fromAffix = prefixLen + suffixLen
    const maxReveal = Math.max(1, letters.length - 3)
    revealFirst(Math.min(maxReveal, Math.max(half, fromAffix + 2)))
  } else if (level === 2) {
    if (prefixLen > 0 || suffixLen > 0) {
      revealFirst(prefixLen)
      letters
        .slice(Math.max(prefixLen, letters.length - suffixLen))
        .forEach((x) => visible.add(x.i))
    } else {
      if (letters[0]) visible.add(letters[0].i)
      if (letters.length > 1) visible.add(letters[letters.length - 1].i)
    }
  }

  return chars.map((c, i) => {
    if (!/[a-zA-Z]/.test(c)) return c
    return visible.has(i) ? c : '_'
  })
}

function toRaw(w: SpellLibWord): RawWord {
  return { w: w.w, uk: w.p, us: w.p, t: w.t, s: [], p: [], r: w.r ?? [] }
}

/** 拼写库选择面板：整本加入拼写练习 */
function LibraryPicker({ onAdded }: { onAdded: (msg: string) => void }) {
  const [libs, setLibs] = useState<SpellLibrary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    loadSpellLibraries()
      .then((d) => {
        if (alive) setLibs(d)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : '拼写库加载失败')
      })
    return () => {
      alive = false
    }
  }, [])

  async function add(lib: SpellLibrary, words: SpellLibWord[], label: string) {
    setBusy(true)
    try {
      const n = await store.addManyToSpellList(lib.id, words.map(toRaw))
      onAdded(n ? `已加入 ${n} 个单词（${label}）` : '这些单词已经在拼写列表里了')
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return <div className="card-desc" style={{ color: 'var(--red)' }}>{error}</div>
  }

  return (
    <div className="lib-picker">
      <button className="lib-picker-head" onClick={() => setOpen((v) => !v)}>
        <IconBooks size={15} />
        <span>从拼写库添加</span>
        <span className="tiny" style={{ color: 'var(--text-tertiary)' }}>
          {libs.length ? `${libs.length} 个词库可选` : '加载中…'}
        </span>
        <span className={`lib-picker-arrow ${open ? 'open' : ''}`}>›</span>
      </button>

      {open && (
        <div className="lib-list">
          {libs.map((lib) => (
            <div className="lib-item" key={lib.id}>
              <div className="lib-item-main">
                <div className="lib-item-name">{lib.name}</div>
                <div className="lib-item-desc">{lib.desc}</div>
                <div className="lib-item-groups">
                  {lib.groups.map((g) => (
                    <button
                      key={g.name}
                      className="group-chip"
                      disabled={busy}
                      onClick={() => void add(lib, lib.words.slice(g.start, g.start + g.count), g.name)}
                    >
                      {g.name}
                      <span className="group-chip-num">{g.count}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="lib-item-side">
                <div className="lib-item-count">{lib.words.length} 词</div>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void add(lib, lib.words, lib.name)}
                >
                  全部加入
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SpellPage() {
  const state = useAppState()
  const { spellList } = state

  const [order, setOrder] = useState<number[]>([])
  const [pos, setPos] = useState(0)
  const [input, setInput] = useState('')
  const [hint, setHint] = useState(0)
  const [result, setResult] = useState<'idle' | 'correct' | 'wrong'>('idle')
  const [notice, setNotice] = useState('')

  const total = spellList.length

  // 每次进入或列表变化时重新洗牌
  useEffect(() => {
    setOrder(shuffle(spellList.map((_, i) => i)))
    setPos(0)
    setInput('')
    setHint(0)
    setResult('idle')
  }, [total])

  const item = order.length ? spellList[order[pos]] : undefined
  const word = item?.word

  // 前缀 / 后缀只算一次，遮罩和提示文案共用
  const affix = useMemo(() => {
    if (!word) return { pre: null as Affix | null, suf: null as Affix | null }
    return { pre: prefixOf(word), suf: suffixOf(word) }
  }, [word])

  const masked = useMemo(
    () =>
      word
        ? maskWord(
            word.w,
            result === 'correct' ? MAX_HINT : hint,
            affix.pre?.part.length ?? 0,
            affix.suf?.part.length ?? 0
          )
        : [],
    [word, hint, result, affix]
  )

  /** 当前已露出的字母数，第 3 级提示文案要用 */
  const revealed = useMemo(
    () => masked.filter((c) => c !== '_' && /[a-zA-Z]/.test(c)).length,
    [masked]
  )

  const phonetic = word?.us || word?.uk || ''

  const hintText = useMemo(() => {
    if (!word || hint === 0) return ''
    const first = [...word.w].find((c) => /[a-zA-Z]/.test(c))?.toUpperCase() ?? ''
    const last =
      [...word.w].reverse().find((c) => /[a-zA-Z]/.test(c))?.toUpperCase() ?? ''
    const letters = word.w.replace(/[^a-zA-Z]/g, '').length

    if (hint === 1) {
      // 只给读音，不给字母——拼写卡住的本质就是「音」到「形」的映射
      return phonetic
        ? `读音 /${phonetic}/，共 ${letters} 个字母。按读音一个音节一个音节地拼`
        : `这个词没有音标。共 ${letters} 个字母，以 ${first} 开头、${last} 结尾`
    }

    if (hint === 2) {
      if (affix.pre || affix.suf) {
        const parts = [
          affix.pre ? `前缀 ${affix.pre.label}` : '',
          affix.suf ? `后缀 ${affix.suf.label}` : '',
        ].filter(Boolean)
        return `由${parts.join('和')}组成，已给出这 ${revealed} 个字母`
      }
      return `以 ${first} 开头、${last} 结尾，共 ${letters} 个字母`
    }

    if (hint === 3) {
      return `已给出前 ${revealed} 个字母，剩下的顺着读音补完`
    }
    return '完整单词已给出，跟着打一遍加深印象'
  }, [word, hint, affix, revealed, phonetic])

  function check() {
    if (!word) return
    const got = input.trim().toLowerCase()
    if (!got) return
    const ok = got === word.w.trim().toLowerCase()
    setResult(ok ? 'correct' : 'wrong')
    if (ok) {
      speak(word.w)
      logger.info('spell', '拼写正确', { word: word.w, 提示次数: hint })
    } else {
      logger.debug('spell', '拼写错误', { word: word.w, 输入: got })
    }
  }

  function next() {
    setInput('')
    setHint(0)
    setResult('idle')
    setPos((p) => p + 1)
  }

  function restart() {
    setOrder(shuffle(spellList.map((_, i) => i)))
    setPos(0)
    setInput('')
    setHint(0)
    setResult('idle')
  }

  if (total === 0) {
    return (
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-header">
          <div className="page-title">拼写练习</div>
          <div className="page-subtitle">
            根据中文释义把单词完整拼出来 · 卡住了可以按提示：先给读音，再给骨架，最后给前半段
          </div>
        </div>

        <LibraryPicker
          onAdded={(msg) => {
            setNotice(msg)
            setTimeout(() => setNotice(''), 2600)
          }}
        />
        {notice && <div className="spell-notice">{notice}</div>}

        <div className="empty" style={{ paddingTop: 40 }}>
          <div className="empty-icon">
            <IconSparkle size={24} />
          </div>
          <div className="empty-title">拼写列表还是空的</div>
          <div className="empty-desc">
            从上面的拼写库整本加入，或者去背单词页面，把想练拼写的单词点「加入拼写」。
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 6 }}
            onClick={() => (window.location.hash = '/study')}
          >
            去背单词
          </button>
        </div>
      </div>
    )
  }

  if (!item || pos >= order.length) {
    return (
      <div className="empty">
        <div className="empty-icon" style={{ color: 'var(--green)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4.5 12.5 5 5 10-11" />
          </svg>
        </div>
        <div className="empty-title">这一轮拼写完了</div>
        <div className="empty-desc">共拼了 {total} 个单词。可以再来一轮，或者回背单词页面继续加词。</div>
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn btn-primary" onClick={restart}>
            再来一轮
          </button>
          <button className="btn" onClick={() => (window.location.hash = '/study')}>
            去背单词
          </button>
        </div>
      </div>
    )
  }

  const done = result === 'correct'

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="page-header">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">拼写练习</div>
            <div className="page-subtitle">
              根据中文释义把单词完整拼出来 · 第 {pos + 1} / {order.length} 个
            </div>
          </div>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm(`清空拼写列表？共 ${total} 个单词。`)) void store.clearSpellList()
            }}
          >
            <IconTrash size={14} />
            清空
          </button>
        </div>
      </div>

      <div className="progress-track" style={{ height: 5, marginBottom: 22 }}>
        <div className="progress-fill" style={{ width: `${(pos / order.length) * 100}%` }} />
      </div>

      <LibraryPicker
        onAdded={(msg) => {
          setNotice(msg)
          setTimeout(() => setNotice(''), 2600)
        }}
      />
      {notice && <div className="spell-notice">{notice}</div>}

      <div className="spell-card">
        <div className="spell-cn">
          {word!.t.length ? (
            word!.t.map(([p, cn], i) => (
              <div key={i} className="spell-cn-line">
                {p && <span className="spell-pos">{p}</span>}
                <span>{cn}</span>
              </div>
            ))
          ) : (
            <span className="muted">这个词还没有释义</span>
          )}
        </div>

        <div className={`spell-mask ${result === 'wrong' ? 'bad' : ''}`}>
          {masked.map((c, i) => (
            <span key={i} className={c === '_' ? 'mask-blank' : 'mask-char'}>
              {c === ' ' ? '\u00a0' : c}
            </span>
          ))}
        </div>

        <div className="spell-input-row">
          <input
            className={`input spell-main-input ${
              result === 'correct' ? 'ok' : result === 'wrong' ? 'bad' : ''
            }`}
            placeholder="在这里拼出单词，回车检查"
            value={input}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoFocus
            onChange={(e) => {
              setInput(e.target.value)
              if (result === 'wrong') setResult('idle')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (done) next()
                else check()
              }
            }}
          />
          {!done && (
            <button className="btn btn-primary" disabled={!input.trim()} onClick={check}>
              检查
            </button>
          )}
          {done && (
            <button className="btn btn-primary" onClick={next}>
              下一个
            </button>
          )}
        </div>

        {result === 'wrong' && (
          <div className="spell-feedback bad">还不对，再想想，或者按提示</div>
        )}
        {done && <div className="spell-feedback ok">拼对了</div>}

        {!done && (
          <div className="spell-hint-row">
            <button
              className="btn"
              disabled={hint >= MAX_HINT}
              onClick={() => setHint((h) => Math.min(MAX_HINT, h + 1))}
            >
              <IconSparkle size={13} />
              {HINT_LABELS[Math.min(hint, MAX_HINT - 1)]}
              {hint > 0 && `（已提示 ${hint} 次）`}
            </button>
            {hint > 0 && (
              <span className="spell-hint-text">
                {hintText}
                {hint === 1 && phonetic && (
                  <button
                    className="hint-speak"
                    title="听一遍读音"
                    onClick={() => speak(word!.w)}
                  >
                    <IconSpeaker size={12} />
                  </button>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {done && (
        <div className="spell-detail fade-in">
          <div className="row-between" style={{ marginBottom: 14 }}>
            <div className="spell-word-big">{word!.w}</div>
            <button className="icon-btn" title="朗读" onClick={() => speak(word!.w)}>
              <IconSpeaker size={17} />
            </button>
          </div>

          {(word!.uk || word!.us) && (
            <div className="phonetics" style={{ justifyContent: 'flex-start', marginBottom: 16 }}>
              {word!.uk && (
                <span className="phonetic-item">
                  <span className="phonetic-tag">UK</span>/{word!.uk}/
                </span>
              )}
              {word!.us && (
                <span className="phonetic-item">
                  <span className="phonetic-tag">US</span>/{word!.us}/
                </span>
              )}
            </div>
          )}

          {word!.s.length > 0 && (
            <div className="block">
              <div className="block-head">例句</div>
              {word!.s.map(([en, cn], i) => (
                <div className="sentence" key={i}>
                  <div className="sentence-en">{en}</div>
                  <div className="sentence-cn">{cn}</div>
                </div>
              ))}
            </div>
          )}

          {word!.r.length > 0 && (
            <div className="block">
              <div className="block-head">词根词缀</div>
              {word!.r.map(([root, meaning, cls], i) => (
                <div className="root-item" key={i}>
                  <span className="root-name">{root}</span>
                  <span className="root-class">{cls}</span>
                  <span className="root-meaning">{meaning}</span>
                </div>
              ))}
            </div>
          )}

          <button
            className="btn btn-ghost"
            style={{ marginTop: 6 }}
            onClick={() => {
              void store.removeFromSpellList(item.key)
              next()
            }}
          >
            已掌握，从列表移除
          </button>
        </div>
      )}
    </div>
  )
}
