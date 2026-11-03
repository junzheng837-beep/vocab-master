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

/* ---------------------------------------------------------------- 查词索引 */

type LookupEntry = { p: string; t: [string, string][] }
let lookupPromise: Promise<Record<string, LookupEntry>> | null = null

/** 懒加载查词索引，仅在导入自定义词库时触发 */
export function loadLookup(): Promise<Record<string, LookupEntry>> {
  if (!lookupPromise) {
    lookupPromise = fetch(dataUrl('lookup.json'))
      .then((r) => {
        if (!r.ok) throw new Error('查词索引加载失败')
        return r.json()
      })
      .catch((err) => {
        lookupPromise = null
        throw err
      })
  }
  return lookupPromise
}

/** 例句 / 短语 / 词根索引，用于给自建词书补全例句 */
export interface EnrichEntry {
  s?: [string, string][]
  p?: [string, string][]
  r?: [string, string, string][]
  syn?: [string, string[]][]
}

let enrichPromise: Promise<Record<string, EnrichEntry>> | null = null

export function loadEnrich(): Promise<Record<string, EnrichEntry>> {
  if (!enrichPromise) {
    enrichPromise = fetch(dataUrl('examples.json'))
      .then((r) => {
        if (!r.ok) throw new Error('例句索引加载失败')
        return r.json()
      })
      .catch((err) => {
        enrichPromise = null
        throw err
      })
  }
  return enrichPromise
}

/** 把例句/短语/词根补到一个词条上（就地返回新对象） */
export function applyEnrich(word: RawWord, enrich: Record<string, EnrichEntry>): RawWord {
  const hit = enrich[word.w.toLowerCase()]
  if (!hit) return word
  return {
    ...word,
    s: word.s.length ? word.s : (hit.s ?? []),
    p: word.p.length ? word.p : (hit.p ?? []),
    r: word.r.length ? word.r : (hit.r ?? []),
    syn: word.syn?.length ? word.syn : hit.syn,
  }
}

/** 在内置词库中查词，命中则返回可直接使用的词条（含例句） */
export async function lookupWord(raw: string): Promise<RawWord | null> {
  const word = raw.trim()
  if (!word) return null
  const [index, enrich] = await Promise.all([loadLookup(), loadEnrich().catch(() => ({}))])
  const key = word.toLowerCase()
  const hit = index[key]
  if (!hit) return null
  return applyEnrich(
    {
      w: word,
      uk: hit.p,
      us: hit.p,
      t: hit.t,
      s: [],
      p: [],
      r: [],
    },
    enrich
  )
}

/** 批量查词，命中与未命中分开返回；命中的词会自动带上例句、短语、词根 */
export async function lookupWords(
  words: string[]
): Promise<{ hits: Map<string, RawWord>; misses: string[] }> {
  const index = await loadLookup()
  // 例句索引较大，网络慢时最多等 15 秒，超时就用纯释义继续，不阻塞导入
  const enrich = await Promise.race([
    loadEnrich().catch(() => ({}) as Record<string, EnrichEntry>),
    new Promise<Record<string, EnrichEntry>>((resolve) =>
      setTimeout(() => {
        logger.warn('dict', '例句索引加载超时，先只补释义')
        resolve({})
      }, 15000)
    ),
  ])
  const hits = new Map<string, RawWord>()
  const misses: string[] = []
  for (const raw of words) {
    const word = raw.trim()
    if (!word) continue
    const key = word.toLowerCase()
    const hit = index[key]
    if (hit) {
      hits.set(
        word,
        applyEnrich(
          {
            w: word,
            uk: hit.p,
            us: hit.p,
            t: hit.t,
            s: [],
            p: [],
            r: [],
          },
          enrich
        )
      )
    } else {
      misses.push(word)
    }
  }
  return { hits, misses }
}

/** 模糊前缀搜索，用于手动补注释时的候选提示 */
export async function searchLookup(prefix: string, limit = 8): Promise<string[]> {
  const p = prefix.trim().toLowerCase()
  if (p.length < 2) return []
  const index = await loadLookup()
  const out: string[] = []
  for (const k of Object.keys(index)) {
    if (k.startsWith(p)) {
      out.push(k)
      if (out.length >= limit) break
    }
  }
  return out
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

/** 直接用查词索引 + 例句索引拼出词条，不依赖具体词书 */
export async function wordsFromLookup(words: string[]): Promise<RawWord[]> {
  const [index, enrich] = await Promise.all([loadLookup(), loadEnrich().catch(() => ({}))])
  const out: RawWord[] = []
  for (const raw of words) {
    const key = raw.trim().toLowerCase()
    const hit = index[key]
    if (!hit) continue
    out.push(
      applyEnrich(
        { w: raw.trim(), uk: hit.p, us: hit.p, t: hit.t, s: [], p: [], r: [] },
        enrich
      )
    )
  }
  return out
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
