/**
 * 选词生文：从预置的高考范文库里，挑一篇最能用上所选单词的。
 *
 * 这里是纯本地匹配，不调用任何 AI：
 * 每篇范文在打开时解析成词表，用户选的词只要在词表里（或作为词根出现）就算用上，
 * 最后按「用上的词数」排序。
 */

export interface Essay {
  id: string
  /** 话题，例如「环境保护」 */
  topic: string
  title: string
  /** 词数 */
  words: number
  text: string
}

export interface EssayMatch {
  essay: Essay
  /** 这篇里用上了哪些词（按用户选择顺序） */
  hits: string[]
  /** 没用上的词 */
  misses: string[]
  /** 命中率 0~1 */
  ratio: number
}

const DATA_URL = `${import.meta.env.BASE_URL}data/essays.json`

let cache: Promise<Essay[]> | null = null

export function loadEssays(): Promise<Essay[]> {
  if (!cache) {
    cache = fetch(DATA_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`范文库加载失败（HTTP ${r.status}）`)
        return r.json() as Promise<{ essays: Essay[] }>
      })
      .then((d) => d.essays)
      .catch((err) => {
        cache = null
        throw err
      })
  }
  return cache
}

/* ------------------------------------------------------------------ 选词 */

const STORAGE_KEY = 'essay-selection'
const MAX_SELECTION = 60

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, MAX_SELECTION) : []
  } catch {
    return []
  }
}

let selection: string[] = read()
const listeners = new Set<() => void>()

function write(next: string[]) {
  selection = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式下写不进去就算了，内存里还能用 */
  }
  listeners.forEach((fn) => fn())
}

export function getSelection(): string[] {
  return selection
}

export function subscribeSelection(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function isSelected(word: string): boolean {
  const key = word.trim().toLowerCase()
  return selection.some((w) => w.toLowerCase() === key)
}

/** 切换某个词的选中状态，返回切换后是否选中 */
export function toggleSelection(word: string): boolean {
  const raw = word.trim()
  if (!raw) return false
  const key = raw.toLowerCase()
  const exists = selection.some((w) => w.toLowerCase() === key)

  if (exists) {
    write(selection.filter((w) => w.toLowerCase() !== key))
    return false
  }
  if (selection.length >= MAX_SELECTION) return false
  write([...selection, raw])
  return true
}

export function clearSelection() {
  write([])
}

export function removeSelection(word: string) {
  const key = word.trim().toLowerCase()
  write(selection.filter((w) => w.toLowerCase() !== key))
}

/* ---------------------------------------------------------------- 匹配 */

const tokenCache = new WeakMap<Essay, Set<string>>()

function tokensOf(essay: Essay): Set<string> {
  let set = tokenCache.get(essay)
  if (!set) {
    set = new Set(essay.text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [])
    tokenCache.set(essay, set)
  }
  return set
}

/** 词形变化也算用上：protect 命中 protection / protecting */
function hitsToken(word: string, tokens: Set<string>): boolean {
  const w = word.toLowerCase()
  if (!w) return false
  if (tokens.has(w)) return true
  if (w.length < 5) return false
  for (const t of tokens) {
    if (t.startsWith(w)) return true
  }
  return false
}

export function matchEssays(essays: Essay[], words: string[]): EssayMatch[] {
  const list = words.map((w) => w.trim()).filter(Boolean)
  const out: EssayMatch[] = []

  for (const essay of essays) {
    const tokens = tokensOf(essay)
    const hits: string[] = []
    const misses: string[] = []
    for (const w of list) {
      if (hitsToken(w, tokens)) hits.push(w)
      else misses.push(w)
    }
    out.push({
      essay,
      hits,
      misses,
      ratio: list.length ? hits.length / list.length : 0,
    })
  }

  // 命中多的排前面；一样多时优先短一点的（读起来轻松）
  out.sort((a, b) => b.hits.length - a.hits.length || a.essay.words - b.essay.words)
  return out
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 把选中的词在正文里标出来。
 * 返回「普通片段 / 命中片段」交替的数组，交给渲染层拼。
 */
export function splitByHits(text: string, words: string[]): { text: string; hit: boolean }[] {
  const list = words.map((w) => w.trim().toLowerCase()).filter(Boolean)
  if (!list.length) return [{ text, hit: false }]

  const pattern = list
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeReg)
    .join('|')
  const re = new RegExp(`\\b(?:${pattern})[a-z']*`, 'gi')

  const parts: { text: string; hit: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push({ text: text.slice(last, idx), hit: false })
    parts.push({ text: m[0], hit: true })
    last = idx + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false })
  return parts.length ? parts : [{ text, hit: false }]
}
