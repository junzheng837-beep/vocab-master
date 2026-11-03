import type {
  BookData,
  BookMeta,
  LetterIndexEntry,
  LetterWord,
  RawWord,
  RootEntry,
  SpellLibrary,
} from './types'
import { dataUrl } from './paths'
import { logger, trace } from './logger'

const bookCache = new Map<string, BookData>()
const inflight = new Map<string, Promise<BookData>>()

export async function loadBook(id: string): Promise<BookData> {
  const cached = bookCache.get(id)
  if (cached) {
    logger.debug('dict', `词书 ${id} 命中缓存`, { 词数: cached.words.length })
    return cached
  }
  const running = inflight.get(id)
  if (running) {
    logger.debug('dict', `词书 ${id} 正在加载中，复用同一请求`)
    return running
  }

  const task = trace('dict', `加载词书 ${id}`, async () => {
    const url = dataUrl(`books/${id}.json`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`词书 ${id} 加载失败（HTTP ${res.status}）`)
    const data = (await res.json()) as BookData
    bookCache.set(id, data)
    logger.info('dict', `词书 ${id} 就绪`, {
      名称: data.name,
      词数: data.words.length,
      地址: url,
    })
    return data
  })

  inflight.set(id, task)
  try {
    return await task
  } finally {
    inflight.delete(id)
  }
}

export async function loadManifest(): Promise<BookMeta[]> {
  const res = await fetch(dataUrl('manifest.json'))
  if (!res.ok) throw new Error('词书清单加载失败')
  const data = (await res.json()) as { books: BookMeta[] }
  logger.info('dict', '词书清单载入', { 数量: data.books.length })
  return data.books
}

export function wordKey(bookId: string, word: string) {
  return `${bookId}::${word.toLowerCase()}`
}

/* ---------------------------------------------------------------- 查词字典 */

/**
 * 导入自定义词库时用的词典。
 *
 * 以前是 lookup.json（2MB）+ examples.json（8MB）两个大文件，不管用户要查几个词，
 * 都得先把 8MB 的例句索引下完——弱网下要几分钟，界面一直停在「正在查词」，
 * 看起来就像识别不出来。现在按首字母拆成 26 个小文件，粘的词是哪个字母开头就只下哪个。
 */

interface DictEntry {
  /** 音标 */
  ph?: string
  /** 释义 */
  t: [string, string][]
  /** 例句 */
  s?: [string, string][]
  /** 短语 */
  p?: [string, string][]
  /** 词根词缀 */
  r?: [string, string, string][]
  /** 近义词 */
  syn?: [string, string[]][]
}

const dictCache = new Map<string, Promise<Record<string, DictEntry>>>()

async function fetchShard(letter: string, timeoutMs: number): Promise<Record<string, DictEntry>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(dataUrl(`dict/${letter}.json`), { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as Record<string, DictEntry>
    logger.debug('dict', '词典分片载入', { 字母: letter, 词数: Object.keys(data).length })
    return data
  } finally {
    clearTimeout(timer)
  }
}

/** 单个分片的词典，带超时和一次自动重试；彻底失败返回空表，绝不让识别流程挂住 */
function loadDictLetter(letter: string, timeoutMs = 15000): Promise<Record<string, DictEntry>> {
  const cached = dictCache.get(letter)
  if (cached) return cached

  const task = (async () => {
    try {
      return await fetchShard(letter, timeoutMs)
    } catch (err) {
      // 弱网下第一次容易超时，再试一次往往就好了
      logger.warn('dict', '词典分片首次加载失败，重试', { letter, error: String(err) })
      return await fetchShard(letter, timeoutMs)
    }
  })().catch((err) => {
    logger.warn('dict', '词典分片加载失败', { letter, error: String(err) })
    dictCache.delete(letter) // 允许下次重试
    return {} as Record<string, DictEntry>
  })

  dictCache.set(letter, task)
  return task
}

/** 词落在哪个分片：取前两个字母，只有一个字母的词就取那一个 */
function bucketOf(word: string): string {
  const w = word.trim().toLowerCase()
  if (!/^[a-z]/.test(w)) return ''
  return /^[a-z]{2}/.test(w) ? w.slice(0, 2) : w.slice(0, 1)
}

/**
 * 批量查词：只加载这些词首字母对应的分片。
 * failedLetters 非空说明有分片没下来，调用方应该提示用户重试，
 * 否则那些词会被误判成「未收录」。
 */
export async function lookupWords(
  words: string[]
): Promise<{ hits: Map<string, RawWord>; misses: string[]; failedLetters: string[] }> {
  const cleaned = words.map((w) => w.trim()).filter(Boolean)
  const letters = new Set<string>()
  for (const w of cleaned) {
    const l = bucketOf(w)
    if (l) letters.add(l)
  }

  const failed: string[] = []
  const maps = await Promise.all(
    [...letters].map(async (l) => {
      const map = await loadDictLetter(l)
      if (!Object.keys(map).length) failed.push(l)
      return map
    })
  )

  const index: Record<string, DictEntry> = {}
  for (const m of maps) Object.assign(index, m)

  const hits = new Map<string, RawWord>()
  const misses: string[] = []
  for (const word of cleaned) {
    const hit = index[word.toLowerCase()]
    if (!hit) {
      misses.push(word)
      continue
    }
    hits.set(word, {
      w: word,
      uk: hit.ph ?? '',
      us: hit.ph ?? '',
      t: hit.t ?? [],
      s: hit.s ?? [],
      p: hit.p ?? [],
      r: hit.r ?? [],
      ...(hit.syn ? { syn: hit.syn } : {}),
    })
  }

  logger.info('dict', '批量查词完成', {
    词数: cleaned.length,
    词典分片: [...letters],
    命中: hits.size,
    未收录: misses.length,
    失败分片: failed,
  })

  return { hits, misses, failedLetters: failed }
}

/* ---------------------------------------------------------------- 词根 */

let rootsPromise: Promise<RootEntry[]> | null = null

export function loadRoots(): Promise<RootEntry[]> {
  if (!rootsPromise) {
    rootsPromise = fetch(dataUrl('roots.json'))
      .then((r) => {
        if (!r.ok) throw new Error('词根数据加载失败')
        return r.json()
      })
      .then((d: { roots: RootEntry[] }) => {
        logger.info('dict', '词根数据载入', { 数量: d.roots.length })
        return d.roots
      })
      .catch((err) => {
        rootsPromise = null
        throw err
      })
  }
  return rootsPromise
}

/* ------------------------------------------------------- 首字母 / 拼写库 */

let letterIndexPromise: Promise<LetterIndexEntry[]> | null = null
const letterCache = new Map<string, LetterWord[]>()

export function loadLetterIndex(): Promise<LetterIndexEntry[]> {
  if (!letterIndexPromise) {
    letterIndexPromise = fetch(dataUrl('letters/index.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`首字母索引加载失败（HTTP ${r.status}）`)
        return r.json()
      })
      .then((d: { letters: LetterIndexEntry[] }) => {
        logger.info('dict', '首字母索引载入', { 字母数: d.letters.length })
        return d.letters
      })
      .catch((err) => {
        letterIndexPromise = null
        throw err
      })
  }
  return letterIndexPromise
}

/** 单个字母的词表，每个文件只有几十 KB，点开哪个加载哪个 */
export async function loadLetterWords(letter: string): Promise<LetterWord[]> {
  const l = letter.slice(0, 1).toLowerCase()
  const cached = letterCache.get(l)
  if (cached) return cached
  const res = await fetch(dataUrl(`letters/${l}.json`))
  if (!res.ok) throw new Error(`首字母 ${l.toUpperCase()} 的数据加载失败（HTTP ${res.status}）`)
  const data = (await res.json()) as { words: LetterWord[] }
  letterCache.set(l, data.words)
  logger.debug('dict', '首字母词表载入', { 字母: l, 词数: data.words.length })
  return data.words
}

let spellLibPromise: Promise<SpellLibrary[]> | null = null

export function loadSpellLibraries(): Promise<SpellLibrary[]> {
  if (!spellLibPromise) {
    spellLibPromise = fetch(dataUrl('spell.json'))
      .then((r) => {
        if (!r.ok) throw new Error(`拼写库加载失败（HTTP ${r.status}）`)
        return r.json()
      })
      .then((d: { libraries: SpellLibrary[] }) => {
        logger.info('dict', '拼写库载入', {
          数量: d.libraries.length,
          词数: d.libraries.map((x) => x.words.length),
        })
        return d.libraries
      })
      .catch((err) => {
        spellLibPromise = null
        throw err
      })
  }
  return spellLibPromise
}
