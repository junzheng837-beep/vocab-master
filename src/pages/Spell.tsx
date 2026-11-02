import { useEffect, useMemo, useState } from 'react'
import { store, useAppState } from '../core/store'
import { speak } from '../core/speech'
import { shuffle } from '../core/utils'
import { logger } from '../core/logger'
import type { RawWord } from '../core/types'
import { IconSpeaker, IconSparkle, IconTrash } from '../components/Icons'

const HINT_LABELS = ['提示', '再提示', '直接看答案']

/** 把单词按提示等级遮罩，返回逐字数组（非字母原样显示） */
function maskWord(word: string, level: number): string[] {
  const chars = [...word]
  const letters = chars.map((c, i) => ({ c, i })).filter((x) => /[a-zA-Z]/.test(x.c))
  const visible = new Set<number>()
  if (level >= 3) {
    letters.forEach((x) => visible.add(x.i))
  } else if (level === 1) {
    if (letters[0]) visible.add(letters[0].i)
  } else if (level === 2) {
    if (letters[0]) visible.add(letters[0].i)
    if (letters[1]) visible.add(letters[1].i)
    if (letters.length > 2) visible.add(letters[letters.length - 1].i)
  }
  return chars.map((c, i) => {
    if (!/[a-zA-Z]/.test(c)) return c
    return visible.has(i) ? c : '_'
  })
}

/** 找这个词的后缀，用于第一次提示 */
function suffixHint(word: RawWord): string | null {
  const w = word.w.toLowerCase()
  for (const [root, meaning, cls] of word.r) {
    if (!cls.includes('后缀')) continue
    for (const part of root.split(/[,\s]+/)) {
      const clean = part.replace(/^-/, '').toLowerCase()
      if (clean.length < 2 || !w.endsWith(clean)) continue
      // 释义只取第一小段，英文释义过长时截断
      const short = meaning.split(/[;；]/)[0].split(/,/)[0].trim()
      const label = /[\u4e00-\u9fa5]/.test(short) ? short : short.slice(0, 14)
      return label ? `${part}（${label}）` : part
    }
  }
  return null
}

function hintText(word: RawWord, level: number): string {
  if (level === 0) return ''
  if (level === 1) {
    const first = [...word.w].find((c) => /[a-zA-Z]/.test(c)) ?? ''
    const suf = suffixHint(word)
    return `以 ${first.toUpperCase()} 开头，共 ${word.w.length} 个字母${suf ? `；后缀是 ${suf}` : ''}`
  }
  if (level === 2) return '已给出前两个字母和最后一个字母'
  return '完整单词已给出，跟着打一遍加深印象'
}

export default function SpellPage() {
  const state = useAppState()
  const { spellList } = state

  const [order, setOrder] = useState<number[]>([])
  const [pos, setPos] = useState(0)
  const [input, setInput] = useState('')
  const [hint, setHint] = useState(0)
  const [result, setResult] = useState<'idle' | 'correct' | 'wrong'>('idle')

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

  const masked = useMemo(
    () => (word ? maskWord(word.w, result === 'correct' ? 3 : hint) : []),
    [word, hint, result]
  )

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
      <div className="empty">
        <div className="empty-icon">
          <IconSparkle size={24} />
        </div>
        <div className="empty-title">拼写列表还是空的</div>
        <div className="empty-desc">
          去背单词页面，把想练拼写的单词点「加入拼写」，它们就会出现在这里。
          拼写时只给中文释义，你需要把单词完整拼出来。
        </div>
        <button
          className="btn btn-primary"
          style={{ marginTop: 6 }}
          onClick={() => (window.location.hash = '/study')}
        >
          去背单词
        </button>
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

      <div className="progress-track" style={{ height: 5, marginBottom: 26 }}>
        <div className="progress-fill" style={{ width: `${(pos / order.length) * 100}%` }} />
      </div>

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
              disabled={hint >= 3}
              onClick={() => setHint((h) => Math.min(3, h + 1))}
            >
              <IconSparkle size={13} />
              {HINT_LABELS[Math.min(hint, 2)]}
              {hint > 0 && ` (${hint}/3)`}
            </button>
            {hint > 0 && <span className="spell-hint-text">{hintText(word!, hint)}</span>}
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
