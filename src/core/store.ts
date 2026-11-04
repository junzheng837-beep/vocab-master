import { useSyncExternalStore } from 'react'
import { createDriver, keysFor, type DataKeys, type StorageDriver } from './storage'
import { LocalAuthProvider, type AuthProvider, type AuthUser } from './auth'
import { CloudAuthProvider, SyncDriver, cloudConfigured } from './cloud'
import { applyRating, dateKey, isDue, makeWordState, startOfDay } from './scheduler'
import { loadBook, loadLetterWords, loadRoots } from './dict'
import { parseScope, type LetterSource } from './scope'
import { shuffle } from './utils'
import { dataUrl } from './paths'
import { logger } from './logger'
import type {
  BookData,
  BookMeta,
  CustomBook,
  DailyLog,
  RawWord,
  Rating,
  SessionEntry,
  Settings,
  SpellItem,
  WordState,
} from './types'

export interface SessionState {
  entries: SessionEntry[]
  cursor: number
  revealed: boolean
  /** 会话是否已开始构建过 */
  built: boolean
  loading: boolean
  /** 构建失败时的错误信息 */
  error: string | null
  /** 当前会话针对的词书；null 表示全部已选词书混合 */
  scope: string | null
}

/** 云同步的对外状态，供界面展示 */
export interface CloudState {
  /** 是否配置了云服务；false 表示纯本地模式 */
  enabled: boolean
  /** 上次成功同步的时间戳 */
  lastSyncAt: number | null
  /** 等待上传的变更数 */
  pending: number
  /** 最近一次同步失败原因 */
  error: string | null
}

export interface AppState {
  ready: boolean
  error: string | null
  /** 当前登录账号，null 表示游客 */
  user: AuthUser | null
  settings: Settings
  states: Record<string, WordState>
  logs: Record<string, DailyLog>
  customBooks: CustomBook[]
  /** 拼写练习列表 */
  spellList: SpellItem[]
  /** 内置词库里用户追加的单词 */
  bookExtras: Record<string, RawWord[]>
  manifest: BookMeta[]
  books: Record<string, BookData>
  session: SessionState
  cloud: CloudState
}

export const DEFAULT_SETTINGS: Settings = {
  dailyNew: 20,
  dailyReview: 200,
  activeBooks: ['cet4'],
  theme: 'auto',
  speakOnWord: true,
  autoSpeak: false,
  customOrder: 'import',
  spellMode: false,
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
  error: null,
  scope: null,
}

class AppStore {
  /** 本地存储永远是主存储 */
  private localDriver: StorageDriver = createDriver()
  /** 配置了云服务时，在本地驱动外面再包一层同步 */
  private sync: SyncDriver | null = cloudConfigured ? new SyncDriver(this.localDriver) : null
  private driver: StorageDriver = this.sync ?? this.localDriver
  /** 账号始终存在本地，只有数据会同步 */
  private auth: AuthProvider = cloudConfigured
    ? new CloudAuthProvider()
    : new LocalAuthProvider(this.localDriver)
  /** 当前账号的数据命名空间 */
  private keys: DataKeys = keysFor(null)
  private listeners = new Set<() => void>()
  private state: AppState = {
    ready: false,
    error: null,
    user: null,
    settings: DEFAULT_SETTINGS,
    states: {},
    logs: {},
    customBooks: [],
    spellList: [],
    bookExtras: {},
    manifest: [],
    books: {},
    session: emptySession,
    cloud: { enabled: cloudConfigured, lastSyncAt: null, pending: 0, error: null },
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
      const user = await this.auth.current()
      this.keys = keysFor(user?.id ?? null)
      logger.info('auth', user ? '已恢复登录状态' : '当前为游客状态', {
        账号: user?.username ?? '游客',
        命名空间: this.keys.prefix,
      })

      const manifest = await fetch(dataUrl('manifest.json'))
        .then((r) => {
          logger.debug('store', '词书清单响应', { status: r.status, ok: r.ok })
          if (!r.ok) throw new Error(`词书清单加载失败（HTTP ${r.status}）`)
          return r.json()
        })
        .then((d: { books: BookMeta[] }) => d.books)

      this.set({ manifest })
      await this.loadUserData(user)
      this.set({ ready: true })
      logger.info('store', '应用初始化完成', this.state.settings)
    } catch (err) {
      logger.error('store', '应用初始化失败', err)
      this.set({ ready: true, error: err instanceof Error ? err.message : '初始化失败' })
    }
  }

  /** 按当前命名空间载入账号数据；skipPull 用于手动同步后避免重复拉取 */
  private async loadUserData(user: AuthUser | null, skipPull = false) {
    this.keys = keysFor(user?.id ?? null)

    // 登录后才开启同步；游客状态下所有数据只留在本机
    if (this.sync) {
      this.sync.setScope(user ? this.keys.prefix : null)
      if (user && !skipPull) await this.sync.pull()
      this.set({ cloud: { enabled: true, ...this.sync.getStatus() } })
    }

    const [settings, logs, customBooks, stateMap, spellList, bookExtras] = await Promise.all([
      this.driver.get<Settings>(this.keys.settings),
      this.driver.get<Record<string, DailyLog>>(this.keys.logs),
      this.driver.get<CustomBook[]>(this.keys.customBooks),
      this.driver.entries<WordState>(this.keys.statePrefix),
      this.driver.get<SpellItem[]>(this.keys.spellList),
      this.driver.get<Record<string, RawWord[]>>(this.keys.bookExtras),
    ])

    const states: Record<string, WordState> = {}
    for (const [k, v] of Object.entries(stateMap)) {
      states[k.slice(this.keys.statePrefix.length)] = v
    }

    logger.info('store', '账号数据载入完成', {
      账号: user?.username ?? '游客',
      命名空间: this.keys.prefix,
      单词状态数: Object.keys(states).length,
      自建词书: customBooks?.length ?? 0,
      自建词数: (customBooks ?? []).reduce((s, b) => s + b.words.length, 0),
      学习日志天数: Object.keys(logs ?? {}).length,
    })

    this.set({
      user,
      settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
      logs: logs ?? {},
      customBooks: customBooks ?? [],
      spellList: spellList ?? [],
      bookExtras: bookExtras ?? {},
      states,
      session: { ...emptySession },
    })
    this.mergedBooks.clear()
  }

  /* ------------------------------------------------------------ 账号 */

  async register(username: string, password: string) {
    logger.info('auth', '尝试注册', { username })
    const user = await this.auth.register(username, password)
    logger.info('auth', '注册成功', { id: user.id, username: user.username })
    await this.migrateGuestData(user.id)
    await this.loadUserData(user)
    await this.rebuildSession(null)
    return user
  }

  async login(username: string, password: string) {
    logger.info('auth', '尝试登录', { username })
    const user = await this.auth.login(username, password)
    logger.info('auth', '登录成功', { id: user.id, username: user.username })
    await this.loadUserData(user)
    await this.rebuildSession(null)
    return user
  }

  async logout() {
    logger.info('auth', '退出登录', { username: this.state.user?.username })
    await this.auth.logout()
    await this.loadUserData(null)
    await this.rebuildSession(null)
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    if (!this.auth.changePassword) throw new Error('当前登录方式不支持修改密码')
    await this.auth.changePassword(userId, oldPassword, newPassword)
    logger.info('auth', '密码已修改', { userId })
  }

  /** 手动同步：先推本地变更，再拉云端，然后刷新内存数据（不清空当前学习会话） */
  async syncNow() {
    if (!this.sync) return
    logger.info('cloud', '手动同步开始')
    await this.sync.flush()
    await this.sync.pull()

    const [settings, logs, customBooks, stateMap, spellList, bookExtras] = await Promise.all([
      this.driver.get<Settings>(this.keys.settings),
      this.driver.get<Record<string, DailyLog>>(this.keys.logs),
      this.driver.get<CustomBook[]>(this.keys.customBooks),
      this.driver.entries<WordState>(this.keys.statePrefix),
      this.driver.get<SpellItem[]>(this.keys.spellList),
      this.driver.get<Record<string, RawWord[]>>(this.keys.bookExtras),
    ])

    const states: Record<string, WordState> = {}
    for (const [k, v] of Object.entries(stateMap)) {
      states[k.slice(this.keys.statePrefix.length)] = v
    }

    this.set({
      settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
      logs: logs ?? {},
      customBooks: customBooks ?? [],
      spellList: spellList ?? [],
      bookExtras: bookExtras ?? {},
      states,
      cloud: { enabled: true, ...this.sync.getStatus() },
    })
    this.mergedBooks.clear()
    logger.info('cloud', '手动同步完成')
  }

  /**
   * 游客期间产生的自建词书，注册时归入新账号，
   * 避免「先试用后注册」把辛苦导入的词弄丢。
   */
  private async migrateGuestData(userId: string) {
    const guestKeys = keysFor(null)
    const userKeys = keysFor(userId)

    // 内置词书里追加的词也要跟着走
    const guestExtras = await this.driver.get<Record<string, RawWord[]>>(guestKeys.bookExtras)
    if (guestExtras && Object.keys(guestExtras).length) {
      const existingExtras =
        (await this.driver.get<Record<string, RawWord[]>>(userKeys.bookExtras)) ?? {}
      const mergedExtras: Record<string, RawWord[]> = { ...existingExtras }
      for (const [bookId, words] of Object.entries(guestExtras)) {
        const cur = mergedExtras[bookId] ?? []
        const seen = new Set(cur.map((w) => w.w.toLowerCase()))
        mergedExtras[bookId] = [...cur, ...words.filter((w) => !seen.has(w.w.toLowerCase()))]
      }
      await this.driver.set(userKeys.bookExtras, mergedExtras)
    }

    const guestBooks = await this.driver.get<CustomBook[]>(guestKeys.customBooks)
    if (!guestBooks?.length) return

    const existing = (await this.driver.get<CustomBook[]>(userKeys.customBooks)) ?? []
    const merged = [...existing]
    for (const b of guestBooks) {
      if (!merged.some((x) => x.id === b.id)) merged.push(b)
    }
    await this.driver.set(userKeys.customBooks, merged)

    // 迁移这些词书的学习记录
    const entries = await this.driver.entries<WordState>(guestKeys.statePrefix)
    const moved: [string, unknown][] = []
    for (const v of Object.values(entries)) {
      if (guestBooks.some((b) => b.id === v.bookId)) {
        moved.push([userKeys.state(v.key), v])
      }
    }
    if (moved.length) await this.driver.setMany(moved)
    logger.info('auth', '游客自建词书已并入账号', {
      词书数: guestBooks.length,
      迁移学习记录: moved.length,
    })
  }

  /* ------------------------------------------------------------ 设置 */

  async updateSettings(patch: Partial<Settings>) {
    const settings: Settings = { ...this.state.settings, ...patch, updatedAt: Date.now() }
    logger.info('settings', '设置更新', patch)
    this.set({ settings })
    await this.driver.set(this.keys.settings, settings)
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

  /** 合并后的词书缓存，键是 bookId，长度对不上就重建 */
  private mergedBooks = new Map<string, BookData>()

  private bookData(id: string): BookData | undefined {
    const base =
      this.state.books[id] ??
      (() => {
        const cb = this.state.customBooks.find((b) => b.id === id)
        return cb ? this.customAsBook(cb) : undefined
      })()
    if (!base) return undefined

    const extras = this.state.bookExtras[id]
    if (!extras?.length) return base

    const cached = this.mergedBooks.get(id)
    if (cached && cached.words.length === base.words.length + extras.length) return cached

    // 追加的词排在前面：内置词书按词频排序，几千个词排在队尾等于永远轮不到
    const merged: BookData = {
      ...base,
      wordCount: base.words.length + extras.length,
      words: [...extras, ...base.words],
    }
    this.mergedBooks.set(id, merged)
    return merged
  }

  /* ------------------------------------------------------------ 会话 */

  private sessionBuilding = false
  /** 构建期间又来了新的范围请求，排队等当前这次结束后再按最新范围重建 */
  private queuedScope: { value: string | null } | null = null

  async rebuildSession(scope: string | null = null) {
    // 正在构建时不丢弃请求，记下最新范围，等这一轮结束后补跑
    if (this.sessionBuilding) {
      this.queuedScope = { value: scope }
      logger.debug('session', '会话正在构建中，排队等待最新范围', { scope })
      return
    }
    this.sessionBuilding = true
    try {
      let current: string | null = scope
      for (;;) {
        this.queuedScope = null
        try {
          await this.doRebuildSession(current)
        } catch (err) {
          // 关键：无论哪一步失败，都不能让界面停在「加载中」
          logger.error('session', '会话构建失败', err)
          this.set({
            session: {
              ...emptySession,
              built: true,
              loading: false,
              scope: current,
              error: err instanceof Error ? err.message : String(err),
            },
          })
        }
        const queued = this.takeQueuedScope()
        if (!queued) break
        logger.info('session', '按排队的最新范围重建会话', { scope: queued.value })
        current = queued.value
      }
    } finally {
      this.sessionBuilding = false
    }
  }

  /** 取出排队中的范围，取的同时清空，避免重复构建 */
  private takeQueuedScope(): { value: string | null } | null {
    const queued = this.queuedScope
    this.queuedScope = null
    return queued
  }

  private async doRebuildSession(scopeParam: string | null = null) {
    this.set({ session: { ...emptySession, loading: true, built: true, error: null, scope: scopeParam } })
    const { settings } = this.state
    const scope = parseScope(scopeParam)
    const now = Date.now()
    const today = startOfDay(now)
    const entries: SessionEntry[] = []

    // 今天已经新学了多少
    let newToday = 0
    for (const s of Object.values(this.state.states)) {
      if (s.createdAt >= today) newToday += 1
    }
    const newQuota = Math.max(0, settings.dailyNew - newToday)

    /* ------------------------------------------------ 错词本 / 词根 / 首字母 */
    if (scope.kind === 'wrong' || scope.kind === 'root' || scope.kind === 'letter') {
      const built =
        scope.kind === 'wrong'
          ? await this.buildWrongEntries()
          : scope.kind === 'root'
            ? await this.buildRootEntries(scope.root)
            : await this.buildLetterEntries(scope.letter, scope.source)
      entries.push(...built)
      const label =
        scope.kind === 'wrong' ? '错词本' : scope.kind === 'root' ? '词根专项' : '首字母专项'
      logger.info('session', `${label}已构建`, {
        范围: scopeParam,
        词数: built.length,
      })
      this.set({ session: { entries, cursor: 0, revealed: false, built: true, loading: false, error: null, scope: scopeParam } })
      return
    }

    /* ------------------------------------------------ 词书范围 */
    const knownIds = new Set([
      ...this.state.manifest.map((m) => m.id),
      ...this.state.customBooks.map((b) => b.id),
    ])

    const activeIds =
      scope.kind === 'book'
        ? knownIds.has(scope.bookId) ? [scope.bookId] : []
        : settings.activeBooks.filter((id) => knownIds.has(id))

    await this.ensureBooks(activeIds.filter((id) => !id.startsWith('custom:')))

    // 1. 取新词（各词书轮转，保证混合）
    const pools: { bookId: string; words: BookData['words'] }[] = []
    for (const id of activeIds) {
      const book = this.bookData(id)
      if (!book) continue
      let words = book.words
      // 自建词书：按设置决定是导入顺序还是随机打乱
      if (id.startsWith('custom:')) {
        if (scope.kind === 'book' && scope.group) {
          words = words.filter((w) => w.g === scope.group)
        }
        if (settings.customOrder === 'random') {
          words = shuffle(words)
        }
      }
      pools.push({ bookId: id, words })
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
      范围: scopeParam ?? '全部已选词书',
      参与词书: activeIds,
      今日已学: newToday,
      新词配额: newQuota,
      新词数: entries.filter((e) => e.isNew).length,
      待复习总数: dueList.length,
      复习入队: entries.filter((e) => !e.isNew).length,
      队列总长: entries.length,
    })

    this.set({ session: { entries, cursor: 0, revealed: false, built: true, loading: false, error: null, scope: scopeParam } })
  }

  /** 错词本：评过「没记得」或「困难」的词 */
  private async buildWrongEntries(): Promise<SessionEntry[]> {
    const wrong = Object.values(this.state.states)
      .filter((s) => s.stage !== 'new' && (s.lapses > 0 || (s.lastRating ?? 3) <= 1))
      .sort((a, b) => a.dueAt - b.dueAt)

    const bookIds = [...new Set(wrong.map((s) => s.bookId))]
    await this.ensureBooks(bookIds.filter((id) => !id.startsWith('custom:')))

    const out: SessionEntry[] = []
    for (const s of wrong) {
      const book = this.bookData(s.bookId)
      const word = book?.words.find((w) => w.w.toLowerCase() === s.word.toLowerCase())
      if (!word) continue
      out.push({
        entryId: this.nextId('e'),
        key: s.key,
        bookId: s.bookId,
        word,
        isNew: false,
        done: false,
        retried: 0,
      })
    }
    return out
  }

  /** 词根专项：某个词根下的例词（数据已内嵌在 roots.json，无需额外请求） */
  private async buildRootEntries(root: string): Promise<SessionEntry[]> {
    const roots = await loadRoots()
    const entry = roots.find((r) => r.r === root)
    if (!entry) return []
    return entry.w.map((item) => {
      const word: RawWord = {
        w: item.w,
        uk: item.p,
        us: item.p,
        t: item.t,
        s: [],
        p: [],
        r: [[entry.r, entry.m, entry.c]],
      }
      return {
        entryId: this.nextId('e'),
        key: `__root__::${root}::${item.w.toLowerCase()}`,
        bookId: `__root__:${root}`,
        word,
        isNew: false,
        done: false,
        retried: 0,
      }
    })
  }

  /** 首字母专项：公共词库 或 我学过的单词 */
  private async buildLetterEntries(
    letter: string,
    source: LetterSource
  ): Promise<SessionEntry[]> {
    const l = letter.slice(0, 1).toLowerCase()
    if (!/^[a-z]$/.test(l)) return []

    /* ---------- 我学过的：直接用已有状态，评分会正常推进复习计划 ---------- */
    if (source === 'learned') {
      const picked = Object.values(this.state.states)
        .filter((s) => s.stage !== 'new' && s.word.slice(0, 1).toLowerCase() === l)
        .sort((a, b) => a.dueAt - b.dueAt)

      const bookIds = [...new Set(picked.map((s) => s.bookId))]
      await this.ensureBooks(
        bookIds.filter((id) => !id.startsWith('custom:') && !id.startsWith('__'))
      )

      const out: SessionEntry[] = []
      for (const s of picked) {
        const book = this.bookData(s.bookId)
        const word = book?.words.find((w) => w.w.toLowerCase() === s.word.toLowerCase())
        if (!word) continue
        out.push({
          entryId: this.nextId('e'),
          key: s.key,
          bookId: s.bookId,
          word,
          isNew: false,
          done: false,
          retried: 0,
        })
      }
      logger.info('session', '首字母（我学过的）词数', { 字母: l, 状态数: picked.length, 可背: out.length })
      return out
    }

    /* ---------- 公共词库：按需加载单个字母的数据文件 ---------- */
    const words = await loadLetterWords(l)
    // 同一个词可能已经在别的词书里学过，复用它的状态，避免重复学习
    const existingByWord = new Map<string, WordState>()
    for (const s of Object.values(this.state.states)) {
      const k = s.word.toLowerCase()
      if (!existingByWord.has(k)) existingByWord.set(k, s)
    }

    return words.map((item) => {
      const existing = existingByWord.get(item.w.toLowerCase())
      const bookId = existing?.bookId ?? item.b
      const key = existing?.key ?? `${bookId}::${item.w.toLowerCase()}`
      const word: RawWord = {
        w: item.w,
        uk: item.p,
        us: item.p,
        t: item.t,
        s: [],
        p: [],
        r: [],
      }
      return {
        entryId: this.nextId('e'),
        key,
        bookId,
        word,
        isNew: !existing,
        done: false,
        retried: 0,
      }
    })
  }

  /** 把词书加入「我的词库」，不触发会话重建 */
  async ensureActive(bookId: string) {
    const { settings } = this.state
    if (settings.activeBooks.includes(bookId)) return
    const next: Settings = {
      ...settings,
      activeBooks: [...settings.activeBooks, bookId],
      updatedAt: Date.now(),
    }
    logger.info('settings', '词书加入我的词库', { bookId, 现有: next.activeBooks })
    this.set({ settings: next })
    await this.driver.set(this.keys.settings, next)
  }

  /** 从词库选择页直接开始某一本词书 */
  async startBook(bookId: string) {
    logger.info('session', '从词库选择页开始学习', { bookId })
    await this.ensureActive(bookId)
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
      await this.driver.set(this.keys.state(entry.key), next)
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
    void this.driver.set(this.keys.logs, logs)

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
    await this.driver.set(this.keys.customBooks, customBooks)
    logger.info('import', '自建词书已保存', {
      名称: name,
      id: book.id,
      词数: words.length,
      带例句: words.filter((w) => w.s.length > 0).length,
    })
    return book
  }

  /**
   * 往已有的自建词书追加单词。
   * 已经在书里的词直接跳过，不会产生重复条目。
   */
  async appendToCustomBook(
    id: string,
    words: RawWord[]
  ): Promise<{ added: number; skipped: number; book: CustomBook | null }> {
    const target = this.state.customBooks.find((b) => b.id === id)
    if (!target) {
      logger.warn('import', '追加失败：词书不存在', { id })
      return { added: 0, skipped: 0, book: null }
    }

    const existing = new Set(target.words.map((w) => w.w.toLowerCase()))
    const fresh: RawWord[] = []
    for (const w of words) {
      const key = w.w.trim().toLowerCase()
      if (!key || existing.has(key)) continue
      existing.add(key)
      fresh.push(w)
    }

    const skipped = words.length - fresh.length
    if (!fresh.length) {
      logger.info('import', '追加跳过：全部已存在', { id, 名称: target.name, 重复: skipped })
      return { added: 0, skipped, book: target }
    }

    const updated: CustomBook = {
      ...target,
      words: [...target.words, ...fresh],
      updatedAt: Date.now(),
    }
    const customBooks = this.state.customBooks.map((b) => (b.id === id ? updated : b))
    this.set({ customBooks })
    await this.driver.set(this.keys.customBooks, customBooks)
    logger.info('import', '已追加到自建词书', {
      名称: updated.name,
      id,
      新增: fresh.length,
      跳过重复: skipped,
      现有: updated.words.length,
    })
    return { added: fresh.length, skipped, book: updated }
  }

  /**
   * 往任意词书追加单词。
   * 自建词书直接写进 words；内置词书存到 bookExtras，读取时和原始词表合并。
   */
  async addWordsToBook(
    bookId: string,
    words: RawWord[]
  ): Promise<{ added: number; skipped: number; bookName: string }> {
    const isCustom = this.state.customBooks.some((b) => b.id === bookId)
    if (isCustom) {
      const r = await this.appendToCustomBook(bookId, words)
      return { added: r.added, skipped: r.skipped, bookName: r.book?.name ?? '' }
    }

    await this.ensureBooks([bookId])
    const book = this.bookData(bookId)
    if (!book) {
      logger.warn('import', '追加失败：词书不存在', { bookId })
      return { added: 0, skipped: 0, bookName: '' }
    }

    const existing = new Set(book.words.map((w) => w.w.toLowerCase()))
    const fresh: RawWord[] = []
    for (const w of words) {
      const key = w.w.trim().toLowerCase()
      if (!key || existing.has(key)) continue
      existing.add(key)
      fresh.push(w)
    }
    const skipped = words.length - fresh.length
    if (!fresh.length) {
      logger.info('import', '追加跳过：全部已存在', { 名称: book.name, 重复: skipped })
      return { added: 0, skipped, bookName: book.name }
    }

    const prev = this.state.bookExtras[bookId] ?? []
    const bookExtras = { ...this.state.bookExtras, [bookId]: [...prev, ...fresh] }
    this.mergedBooks.delete(bookId)
    this.set({ bookExtras })
    await this.driver.set(this.keys.bookExtras, bookExtras)
    logger.info('import', '已追加到内置词书', {
      名称: book.name,
      bookId,
      新增: fresh.length,
      跳过重复: skipped,
      现有: book.words.length + fresh.length,
    })
    return { added: fresh.length, skipped, bookName: book.name }
  }

  async removeCustomBook(id: string) {
    const customBooks = this.state.customBooks.filter((b) => b.id !== id)
    const states: Record<string, WordState> = {}
    const toDelete: [string, unknown][] = []
    for (const [k, v] of Object.entries(this.state.states)) {
      if (v.bookId === id) toDelete.push([this.keys.state(k), v])
      else states[k] = v
    }
    this.set({ customBooks, states })
    await this.driver.set(this.keys.customBooks, customBooks)
    for (const [k] of toDelete) await this.driver.remove(k)
    logger.warn('import', '自建词书已删除', { id, 连带删除的学习记录: toDelete.length })
  }

  /* ------------------------------------------------------------ 拼写练习 */

  isInSpellList(key: string) {
    return this.state.spellList.some((s) => s.key === key)
  }

  async addToSpellList(key: string, word: RawWord) {
    if (this.state.spellList.some((s) => s.key === key)) {
      logger.debug('spell', '已在拼写列表中，跳过', { word: word.w })
      return
    }
    const item: SpellItem = { key, word, addedAt: Date.now() }
    const spellList = [...this.state.spellList, item]
    this.set({ spellList })
    await this.driver.set(this.keys.spellList, spellList)
    logger.info('spell', '加入拼写列表', { word: word.w, 总数: spellList.length })
  }

  async removeFromSpellList(key: string) {
    const spellList = this.state.spellList.filter((s) => s.key !== key)
    this.set({ spellList })
    await this.driver.set(this.keys.spellList, spellList)
    logger.info('spell', '从拼写列表移除', { key, 剩余: spellList.length })
  }

  /** 整本拼写库一次加入，重复的自动跳过 */
  async addManyToSpellList(libId: string, words: RawWord[]) {
    const existing = new Set(this.state.spellList.map((s) => s.key))
    const now = Date.now()
    const added: SpellItem[] = []
    for (const w of words) {
      const key = `lib:${libId}::${w.w.toLowerCase()}`
      if (existing.has(key)) continue
      existing.add(key)
      added.push({ key, word: w, addedAt: now })
    }
    if (!added.length) {
      logger.info('spell', '拼写库整本加入：全部已存在', { libId, 请求: words.length })
      return 0
    }
    const spellList = [...this.state.spellList, ...added]
    this.set({ spellList })
    await this.driver.set(this.keys.spellList, spellList)
    logger.info('spell', '拼写库整本加入', {
      libId,
      新增: added.length,
      跳过: words.length - added.length,
      总数: spellList.length,
    })
    return added.length
  }

  async clearSpellList() {
    const count = this.state.spellList.length
    this.set({ spellList: [] })
    await this.driver.set(this.keys.spellList, [])
    logger.warn('spell', '清空拼写列表', { 删除: count })
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
    await this.driver.clear(this.keys.statePrefix)
    await this.driver.set(this.keys.logs, {})
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
      await this.driver.remove(this.keys.state(k))
    }
    for (const k of revertedKeys) {
      await this.driver.set(this.keys.state(k), states[k])
    }

    const logs = { ...this.state.logs }
    delete logs[dk]
    await this.driver.set(this.keys.logs, logs)

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
