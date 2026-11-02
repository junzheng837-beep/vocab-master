import { useSyncExternalStore } from 'react'
import { createDriver, K, stateStorageKey, type StorageDriver } from './storage'
import { applyRating, dateKey, isDue, makeWordState, startOfDay } from './scheduler'
import { loadBook } from './dict'
import { dataUrl } from './paths'
import { logger } from './logger'
import type {
  BookData,
  BookMeta,
  CustomBook,
  DailyLog,
  Rating,
  SessionEntry,
  Settings,
  WordState,
} from './types'

export interface SessionState {
  entries: SessionEntry[]
  cursor: number
  revealed: boolean
  /** 会话是否已开始构建过 */
  built: boolean
  loading: boolean
  /** 当前会话针对的词书；null 表示全部已选词书混合 */
  scope: string | null
}

export interface AppState {
  ready: boolean
  error: string | null
  settings: Settings
  states: Record<string, WordState>
  logs: Record<string, DailyLog>
  customBooks: CustomBook[]
  manifest: BookMeta[]
  books: Record<string, BookData>
  session: SessionState
}

export const DEFAULT_SETTINGS: Settings = {
  dailyNew: 20,
  dailyReview: 200,
  activeBooks: ['cet4'],
  theme: 'auto',
  autoSpeak: false,
  updatedAt: 0,
}

function emptyLog(date: string): DailyLog {
  return { date, learned: 0, reviewed: 0, ratings: [0, 0, 0, 0], updatedAt: 0 }
}

const emptySession: SessionState = {
  entries: [],
  cursor: 0,
  revealed: false,
  built: false,
  loading: false,
  scope: null,
}

class AppStore {
  private driver: StorageDriver = createDriver()
  private listeners = new Set<() => void>()
  private state: AppState = {
    ready: false,
    error: null,
    settings: DEFAULT_SETTINGS,
    states: {},
    logs: {},
    customBooks: [],
    manifest: [],
    books: {},
    session: emptySession,
  }
  private seq = 0

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = () => this.state

  private set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch }
    for (const fn of this.listeners) fn()
  }

  private nextId(prefix: string) {
    this.seq += 1
    return `${prefix}-${Date.now().toString(36)}-${this.seq}`
  }

  /* ------------------------------------------------------------ 初始化 */

  private initStarted = false

  async init() {
    // StrictMode 下 effect 会执行两次，这里保证初始化只跑一遍
    if (this.initStarted) {
      logger.debug('store', '初始化已在进行或已完成，跳过重复调用')
      return
    }
    this.initStarted = true
    logger.info('store', '应用初始化开始', {
      存储驱动: this.driver.constructor.name,
      时间: new Date().toLocaleString('zh-CN'),
    })
    try {
      const [settings, logs, customBooks, stateMap, manifest] = await Promise.all([
        this.driver.get<Settings>(K.settings),
        this.driver.get<Record<string, DailyLog>>(K.logs),
        this.driver.get<CustomBook[]>(K.customBooks),
        this.driver.entries<WordState>(K.statePrefix),
        fetch(dataUrl('manifest.json'))
          .then((r) => {
            logger.debug('store', '词书清单响应', { status: r.status, ok: r.ok })
            if (!r.ok) throw new Error(`词书清单加载失败（HTTP ${r.status}）`)
            return r.json()
          })
          .then((d: { books: BookMeta[] }) => d.books),
      ])

      const states: Record<string, WordState> = {}
      for (const [k, v] of Object.entries(stateMap)) {
        states[k.slice(K.statePrefix.length)] = v
      }

      logger.info('store', '本地数据载入完成', {
        词书数: manifest.length,
        单词状态数: Object.keys(states).length,
        自定义词书: customBooks?.length ?? 0,
        学习日志天数: Object.keys(logs ?? {}).length,
        是否已有设置: !!settings,
      })

      this.set({
        ready: true,
        settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
        logs: logs ?? {},
        customBooks: customBooks ?? [],
        states,
        manifest,
      })
      logger.info('store', '应用初始化完成', this.state.settings)
    } catch (err) {
      logger.error('store', '应用初始化失败', err)
      this.set({ ready: true, error: err instanceof Error ? err.message : '初始化失败' })
    }
  }

  /* ------------------------------------------------------------ 设置 */

  async updateSettings(patch: Partial<Settings>) {
    const settings: Settings = { ...this.state.settings, ...patch, updatedAt: Date.now() }
    logger.info('settings', '设置更新', patch)
    this.set({ settings })
    await this.driver.set(K.settings, settings)
    // 学习范围变化后重建会话
    if (patch.activeBooks || patch.dailyNew !== undefined) {
      logger.debug('settings', '学习范围变化，重建会话')
      await this.rebuildSession()
    }
  }

  /* ------------------------------------------------------------ 词书加载 */

  async ensureBooks(ids: string[]) {
    const missing = ids.filter((id) => !this.state.books[id])
    if (!missing.length) return
    logger.debug('store', '需要加载的词书', { 待加载: missing })
    const loaded = await Promise.all(missing.map((id) => loadBook(id).catch(() => null)))
    const books = { ...this.state.books }
    for (const b of loaded) if (b) books[b.id] = b
    this.set({ books })
    logger.debug('store', '词书加载汇总', {
      成功: loaded.filter(Boolean).length,
      失败: loaded.filter((x) => !x).length,
      已缓存: Object.keys(books).length,
    })
  }

  /** 把自定义词书转成 BookData 结构 */
  private customAsBook(cb: CustomBook): BookData {
    return {
      id: cb.id,
      name: cb.name,
      desc: cb.desc,
      wordCount: cb.words.length,
      words: cb.words,
    }
  }

  private bookData(id: string): BookData | undefined {
    if (this.state.books[id]) return this.state.books[id]
    const cb = this.state.customBooks.find((b) => b.id === id)
    if (cb) return this.customAsBook(cb)
    return undefined
  }

  /* ------------------------------------------------------------ 会话 */

  private sessionBuilding = false

  async rebuildSession(scope: string | null = null) {
    // StrictMode 下 effect 会连跑两次，避免重复构建
    if (this.sessionBuilding) {
      logger.debug('session', '会话正在构建中，跳过本次重复调用', { scope })
      return
    }
    this.sessionBuilding = true
    try {
      await this.doRebuildSession(scope)
    } finally {
      this.sessionBuilding = false
    }
  }

  private async doRebuildSession(scope: string | null = null) {
    this.set({ session: { ...emptySession, loading: true, built: true, scope } })
    const { settings } = this.state
    const knownIds = new Set([
      ...this.state.manifest.map((m) => m.id),
      ...this.state.customBooks.map((b) => b.id),
    ])

    // 指定词书时只学这一本，否则学全部已选词书
    const activeIds = (scope ? [scope] : settings.activeBooks).filter((id) => knownIds.has(id))

    await this.ensureBooks(activeIds.filter((id) => !id.startsWith('custom:')))

    const now = Date.now()
    const today = startOfDay(now)
    const entries: SessionEntry[] = []

    // 今天已经新学了多少
    let newToday = 0
    for (const s of Object.values(this.state.states)) {
      if (s.createdAt >= today) newToday += 1
    }
    const newQuota = Math.max(0, settings.dailyNew - newToday)

    // 1. 取新词（各词书轮转，保证混合）
    const pools: { bookId: string; words: BookData['words'] }[] = []
    for (const id of activeIds) {
      const book = this.bookData(id)
      if (book) pools.push({ bookId: id, words: book.words })
    }

    let taken = 0
    let round = 0
    const cursorByBook = new Map<string, number>()
    while (taken < newQuota && round < 400) {
      let progressed = false
      for (const pool of pools) {
        if (taken >= newQuota) break
        let i = cursorByBook.get(pool.bookId) ?? 0
        while (i < pool.words.length) {
          const w = pool.words[i]
          i += 1
          const key = `${pool.bookId}::${w.w.toLowerCase()}`
          if (this.state.states[key]) continue
          entries.push({
            entryId: this.nextId('e'),
            key,
            bookId: pool.bookId,
            word: w,
            isNew: true,
            done: false,
            retried: 0,
          })
          taken += 1
          progressed = true
          break
        }
        cursorByBook.set(pool.bookId, i)
      }
      round += 1
      if (!progressed) break
    }

    // 2. 取到期复习
    const dueList: WordState[] = []
    for (const s of Object.values(this.state.states)) {
      if (s.stage === 'new') continue
      if (!activeIds.includes(s.bookId)) continue
      if (s.createdAt >= today) continue
      if (!isDue(s, now)) continue
      dueList.push(s)
    }
    dueList.sort((a, b) => a.dueAt - b.dueAt)

    const wordIndex = new Map<string, { bookId: string; word: BookData['words'][number] }>()
    for (const pool of pools) {
      for (const w of pool.words) {
        wordIndex.set(`${pool.bookId}::${w.w.toLowerCase()}`, { bookId: pool.bookId, word: w })
      }
    }

    for (const s of dueList.slice(0, settings.dailyReview)) {
      const hit = wordIndex.get(s.key)
      if (!hit) continue
      entries.push({
        entryId: this.nextId('e'),
        key: s.key,
        bookId: hit.bookId,
        word: hit.word,
        isNew: false,
        done: false,
        retried: 0,
      })
    }

    logger.info('session', '今日会话构建完成', {
      范围: scope ?? '全部已选词书',
      参与词书: activeIds,
      今日已学: newToday,
      新词配额: newQuota,
      新词数: entries.filter((e) => e.isNew).length,
      待复习总数: dueList.length,
      复习入队: entries.filter((e) => !e.isNew).length,
      队列总长: entries.length,
    })

    this.set({ session: { entries, cursor: 0, revealed: false, built: true, loading: false, scope } })
  }

  /** 从词库选择页直接开始某一本词书 */
  async startBook(bookId: string) {
    const { settings } = this.state
    logger.info('session', '从词库选择页开始学习', { bookId })
    if (!settings.activeBooks.includes(bookId)) {
      // 直接写设置，避免 updateSettings 触发一次多余的重建
      const next: Settings = {
        ...settings,
        activeBooks: [...settings.activeBooks, bookId],
        updatedAt: Date.now(),
      }
      logger.info('settings', '词书加入我的词库', { bookId, 现有: next.activeBooks })
      this.set({ settings: next })
      await this.driver.set(K.settings, next)
    }
    await this.rebuildSession(bookId)
  }

  /** 统计某本词书的进度 */
  bookProgress(bookId: string) {
    let learned = 0
    let known = 0
    let due = 0
    const now = Date.now()
    for (const s of Object.values(this.state.states)) {
      if (s.bookId !== bookId) continue
      if (s.stage !== 'new') learned += 1
      if (s.stage === 'known') known += 1
      if (s.stage !== 'new' && s.dueAt <= now) due += 1
    }
    return { learned, known, due }
  }

  /* ------------------------------------------------------------ 学习操作 */

  reveal() {
    if (this.state.session.revealed) return
    const idx = this.currentIndex()
    const word = this.state.session.entries[idx]?.word.w
    logger.debug('study', '显示释义', { word })
    this.set({ session: { ...this.state.session, revealed: true } })
  }

  private currentIndex(): number {
    const { entries, cursor } = this.state.session
    if (!entries.length) return -1
    return Math.min(cursor, entries.length - 1)
  }

  move(delta: 1 | -1) {
    const { entries, cursor } = this.state.session
    if (!entries.length) return
    let i = cursor
    for (let step = 0; step < entries.length; step += 1) {
      i += delta
      if (i < 0) i = entries.length - 1
      if (i >= entries.length) i = 0
      if (!entries[i].done) break
    }
    this.set({ session: { ...this.state.session, cursor: i, revealed: false } })
  }

  jumpTo(index: number) {
    const { entries } = this.state.session
    if (index < 0 || index >= entries.length) return
    this.set({ session: { ...this.state.session, cursor: index, revealed: false } })
  }

  async rate(rating: Rating) {
    const idx = this.currentIndex()
    if (idx < 0) {
      logger.warn('rate', '评分被忽略：没有当前单词')
      return
    }
    const { entries } = this.state.session
    const entry = entries[idx]
    if (entry.done) {
      logger.warn('rate', '评分被忽略：该词已评分', { word: entry.word.w })
      return
    }

    const now = Date.now()
    const prev = this.state.states[entry.key] ?? makeWordState(entry.key, entry.bookId, entry.word.w, now)
    const next = applyRating(prev, rating, now)

    logger.info('rate', `评分 ${rating} · ${entry.word.w}`, {
      词书: entry.bookId,
      是否新词: prev.reps === 0,
      评分前: { stage: prev.stage, interval: prev.interval, reps: prev.reps, lapses: prev.lapses },
      评分后: {
        stage: next.stage,
        interval: next.interval,
        reps: next.reps,
        lapses: next.lapses,
        到期: new Date(next.dueAt).toLocaleDateString('zh-CN'),
      },
    })

    const states = { ...this.state.states, [entry.key]: next }
    try {
      await this.driver.set(stateStorageKey(entry.key), next)
      logger.debug('storage', '单词状态已写入', { key: entry.key })
    } catch (err) {
      logger.error('storage', '单词状态写入失败', { key: entry.key, err })
    }

    // 学习日志
    const dk = dateKey(now)
    const log: DailyLog = { ...(this.state.logs[dk] ?? emptyLog(dk)) }
    log.ratings = [...log.ratings] as [number, number, number, number]
    log.ratings[rating] += 1
    if (prev.reps === 0) log.learned += 1
    else log.reviewed += 1
    log.updatedAt = now
    const logs = { ...this.state.logs, [dk]: log }
    logger.debug('rate', '今日统计更新', { 日期: dk, 新学: log.learned, 复习: log.reviewed, 评分分布: log.ratings })
    void this.driver.set(K.logs, logs)

    const nextEntries = entries.slice()
    nextEntries[idx] = { ...entry, done: true }

    // 没记得 → 过完后面的词之后再回来
    if (rating === 0) {
      nextEntries.push({
        entryId: this.nextId('r'),
        key: entry.key,
        bookId: entry.bookId,
        word: entry.word,
        isNew: false,
        done: false,
        retried: entry.retried + 1,
      })
      logger.info('rate', '评 0，单词已排到本轮队尾', {
        word: entry.word.w,
        第几次重来: entry.retried + 1,
      })
    }

    // 找下一个未完成的
    let nextCursor = -1
    for (let i = 1; i <= nextEntries.length; i += 1) {
      const j = (idx + i) % nextEntries.length
      if (!nextEntries[j].done) {
        nextCursor = j
        break
      }
    }

    if (nextCursor === -1) logger.info('rate', '本轮所有单词已评分完毕')

    this.set({
      states,
      logs,
      session: {
        ...this.state.session,
        entries: nextEntries,
        cursor: nextCursor === -1 ? idx : nextCursor,
        revealed: false,
      },
    })
  }

  /* ------------------------------------------------------------ 自定义词书 */

  async addCustomBook(name: string, desc: string, words: CustomBook['words']) {
    const book: CustomBook = {
      id: this.nextId('custom'),
      name,
      desc,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      words,
    }
    const customBooks = [...this.state.customBooks, book]
    this.set({ customBooks })
    await this.driver.set(K.customBooks, customBooks)
    logger.info('import', '自建词书已保存', {
      名称: name,
      id: book.id,
      词数: words.length,
      带例句: words.filter((w) => w.s.length > 0).length,
    })
    return book
  }

  async removeCustomBook(id: string) {
    const customBooks = this.state.customBooks.filter((b) => b.id !== id)
    const states: Record<string, WordState> = {}
    const toDelete: [string, unknown][] = []
    for (const [k, v] of Object.entries(this.state.states)) {
      if (v.bookId === id) toDelete.push([stateStorageKey(k), v])
      else states[k] = v
    }
    this.set({ customBooks, states })
    await this.driver.set(K.customBooks, customBooks)
    for (const [k] of toDelete) await this.driver.remove(k)
    logger.warn('import', '自建词书已删除', { id, 连带删除的学习记录: toDelete.length })
  }

  /* ------------------------------------------------------------ 统计与重置 */

  stats() {
    let total = 0
    let learning = 0
    let review = 0
    let known = 0
    const now = Date.now()
    let dueNow = 0
    for (const s of Object.values(this.state.states)) {
      total += 1
      if (s.stage === 'new') continue
      if (s.stage === 'learning') learning += 1
      else if (s.stage === 'known') known += 1
      else review += 1
      if (isDue(s, now)) dueNow += 1
    }
    return { total, learning, review, known, dueNow }
  }

  async resetAll() {
    logger.warn('reset', '开始清空全部学习记录', {
      将删除单词状态: Object.keys(this.state.states).length,
      将删除日志天数: Object.keys(this.state.logs).length,
    })
    await this.driver.clear(K.statePrefix)
    await this.driver.set(K.logs, {})
    this.set({
      states: {},
      logs: {},
      session: { ...emptySession },
    })
    logger.warn('reset', '全部学习记录已清空')
  }

  /**
   * 重置今天：把今天学过/复习过的单词退回未学状态，今日统计清零。
   *
   * - 今天才第一次学的词：直接删掉状态，回到「新词」，重新占用今日新词配额
   * - 今天复习过的旧词：回退一次评分（reps-1，若上次评 0 则 lapses-1），
   *   置为 learning 并今天到期，会重新出现在今日复习队列里
   */
  async resetToday() {
    const now = Date.now()
    const today = startOfDay(now)
    const dk = dateKey(now)

    const states: Record<string, WordState> = {}
    let removed = 0
    let reverted = 0
    const removedKeys: string[] = []
    const revertedKeys: string[] = []

    for (const [k, s] of Object.entries(this.state.states)) {
      const studiedToday = s.lastSeenAt >= today
      if (!studiedToday) {
        states[k] = s
        continue
      }
      if (s.createdAt >= today) {
        // 今天新学的，直接回到新词
        removed += 1
        removedKeys.push(k)
        continue
      }
      // 旧词今天复习过，回退一次评分
      reverted += 1
      revertedKeys.push(k)
      states[k] = {
        ...s,
        reps: Math.max(0, s.reps - 1),
        lapses: Math.max(0, s.lapses - (s.lastRating === 0 ? 1 : 0)),
        stage: 'learning',
        interval: 0,
        dueAt: today,
        lastSeenAt: 0,
        lastRating: null,
        updatedAt: now,
      }
    }

    logger.warn('reset', '重置今天', {
      今天新学将退回新词: removed,
      今天复习将回退一次: reverted,
      今日统计: this.state.logs[dk] ?? '无',
    })

    // 落盘
    for (const k of removedKeys) {
      await this.driver.remove(stateStorageKey(k))
    }
    for (const k of revertedKeys) {
      await this.driver.set(stateStorageKey(k), states[k])
    }

    const logs = { ...this.state.logs }
    delete logs[dk]
    await this.driver.set(K.logs, logs)

    this.set({ states, logs })
    await this.rebuildSession(this.state.session.scope)
    logger.info('reset', '重置今天完成，会话已重建')
    return { removed, reverted }
  }
}

export const store = new AppStore()

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function todayLog(state: AppState): DailyLog {
  return state.logs[dateKey(Date.now())] ?? emptyLog(dateKey(Date.now()))
}
