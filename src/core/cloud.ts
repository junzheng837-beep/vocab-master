/**
 * 云同步（Supabase）
 *
 * 设计原则：
 * - 零依赖：直接调用 Supabase 的 REST 接口，不引入 supabase-js，构建体积不变。
 * - 本地优先：IndexedDB 始终是主存储，云端只是副本。读永远走本地，
 *   写先落本地再异步推送。断网、服务慢、超时都不影响背单词本身。
 * - 可降级：没有配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 时
 *   cloudConfigured 为 false，应用自动退回纯本地模式，功能完全不受影响。
 *
 * 账号体系仍然沿用「用户名 + 密码」的交互，内部把用户名映射成一个
 * 稳定的合成邮箱交给 Supabase Auth，用户感知不到邮箱的存在。
 */

import type { AuthProvider, AuthUser } from './auth'
import type { StorageDriver } from './storage'
import { logger } from './logger'

/* ------------------------------------------------------------------ 配置 */

const RAW_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const RAW_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

const BASE_URL = RAW_URL.replace(/\/+$/, '')
const ANON_KEY = RAW_KEY

/** 是否已配置云服务；false 时整个应用走纯本地模式 */
export const cloudConfigured = Boolean(BASE_URL && ANON_KEY)

/** 云端键值表名，需与 supabase/schema.sql 保持一致 */
const TABLE = 'user_kv'

/** 会话在 localStorage 里的键 */
const SESSION_KEY = 'shici:cloud:session'

/** 合成邮箱的域名，仅用于满足 Supabase 的邮箱格式校验，不接收邮件 */
const EMAIL_DOMAIN = 'shici.app'

/**
 * 用户名 → 合成邮箱。
 *
 * 已经带 @ 的输入按邮箱原样使用；否则把非 ASCII 字符转成码位十六进制，
 * 保证中文用户名也能映射成合法且稳定的邮箱地址。
 */
function toEmail(name: string): string {
  const raw = name.trim().toLowerCase()
  if (raw.includes('@')) return raw
  const safe = [...raw]
    .map((c) => (/[a-z0-9._-]/.test(c) ? c : `x${c.codePointAt(0)!.toString(16)}`))
    .join('')
  return `${safe || 'user'}@${EMAIL_DOMAIN}`
}

/* ------------------------------------------------------------------ 错误 */

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'CloudError'
  }
}

/** 把 Supabase 的英文报错换成界面上能看懂的说明 */
function humanize(raw: string, status?: number): string {
  const text = raw || ''
  const table: [RegExp, string][] = [
    [/invalid login credentials/i, '用户名或密码不正确'],
    [/user already registered|already been registered/i, '这个用户名已经被注册了'],
    [/email not confirmed/i, '账号还未验证，请在 Supabase 后台关闭「Confirm email」'],
    [/password should be at least/i, '密码至少 6 位'],
    [/invalid email/i, '用户名格式不被接受，换一个试试'],
    [/rate limit|too many requests/i, '操作太频繁，稍后再试'],
    [/jwt expired/i, '登录已过期，请重新登录'],
  ]
  for (const [re, msg] of table) if (re.test(text)) return msg
  if (status === 0 || /failed to fetch|networkerror|load failed/i.test(text)) {
    return '连不上云服务，请检查网络（数据已保存在本机）'
  }
  return text || `请求失败（HTTP ${status ?? '未知'}）`
}

/* ------------------------------------------------------------ HTTP 客户端 */

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  } catch (err) {
    logger.warn('cloud', '请求未送达', { path, err })
    throw new CloudError(humanize(String(err), 0), 0)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let detail = text
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      detail = String(
        parsed.msg ?? parsed.message ?? parsed.error_description ?? parsed.error ?? text
      )
    } catch {
      /* 响应不是 JSON，直接用原文 */
    }
    throw new CloudError(humanize(detail, res.status), res.status)
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

/* ---------------------------------------------------------------- 会话 */

interface GoTrueUser {
  id: string
  email?: string
  created_at?: string
  user_metadata?: { username?: string }
}

interface GoTrueSession {
  access_token: string
  refresh_token: string
  expires_in?: number
  user: GoTrueUser
}

interface StoredSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  userId: string
  username: string
  email: string
  createdAt: number
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as StoredSession
    if (!s?.accessToken || !s?.refreshToken) return null
    return s
  } catch {
    return null
  }
}

function writeSession(s: StoredSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* 隐私模式下 localStorage 不可写，退化为仅本次会话有效 */
  }
}

function fromGoTrue(data: GoTrueSession, fallbackName: string): StoredSession {
  const s: StoredSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    userId: data.user.id,
    username: data.user.user_metadata?.username ?? fallbackName,
    email: data.user.email ?? toEmail(fallbackName),
    createdAt: data.user.created_at ? Date.parse(data.user.created_at) : Date.now(),
  }
  writeSession(s)
  return s
}

/** 并发刷新只跑一次，避免多请求同时刷新把 refresh token 用废 */
let refreshing: Promise<StoredSession | null> | null = null

async function currentSession(): Promise<StoredSession | null> {
  const s = readSession()
  if (!s) return null
  if (s.expiresAt - Date.now() > 60_000) return s

  if (!refreshing) {
    refreshing = (async () => {
      try {
        const data = await apiFetch<GoTrueSession>(
          '/auth/v1/token?grant_type=refresh_token',
          { method: 'POST', body: JSON.stringify({ refresh_token: s.refreshToken }) }
        )
        logger.debug('cloud', '登录凭证已刷新')
        return fromGoTrue(data, s.username)
      } catch (err) {
        logger.warn('cloud', '登录状态已失效，需要重新登录', err)
        writeSession(null)
        return null
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}

async function accessToken(): Promise<string | null> {
  const s = await currentSession()
  return s?.accessToken ?? null
}

/* ------------------------------------------------------------ 账号提供方 */

export class CloudAuthProvider implements AuthProvider {
  readonly kind = 'cloud' as const

  async current(): Promise<AuthUser | null> {
    const s = await currentSession()
    if (!s) return null
    return { id: s.userId, username: s.username, createdAt: s.createdAt }
  }

  async register(username: string, password: string): Promise<AuthUser> {
    const name = username.trim()
    if (name.length < 2) throw new Error('用户名至少 2 个字符')
    if (name.length > 20) throw new Error('用户名最多 20 个字符')
    if (password.length < 6) throw new Error('密码至少 6 位')

    // 关闭邮箱验证时 signup 直接返回平铺的会话字段；
    // 开着验证时只返回 user，没有 access_token，此时不能算登录成功。
    const data = await apiFetch<{
      access_token?: string
      refresh_token?: string
      expires_in?: number
      user?: GoTrueUser
    }>('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({
        email: toEmail(name),
        password,
        data: { username: name },
      }),
    })

    if (!data.access_token || !data.refresh_token || !data.user) {
      throw new Error(
        '账号已创建，但需要邮箱验证才能登录。请在 Supabase 后台 Authentication → Sign In / Providers 里关闭「Confirm email」，然后重新注册。'
      )
    }
    const s = fromGoTrue(data as GoTrueSession, name)
    logger.info('cloud', '云端账号注册成功', { userId: s.userId })
    return { id: s.userId, username: s.username, createdAt: s.createdAt }
  }

  async login(username: string, password: string): Promise<AuthUser> {
    const data = await apiFetch<GoTrueSession>('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: toEmail(username), password }),
    })
    const s = fromGoTrue(data, username.trim())
    logger.info('cloud', '云端账号登录成功', { userId: s.userId })
    return { id: s.userId, username: s.username, createdAt: s.createdAt }
  }

  async logout(): Promise<void> {
    const s = readSession()
    writeSession(null)
    if (!s) return
    try {
      await apiFetch('/auth/v1/logout', { method: 'POST' }, s.accessToken)
    } catch {
      /* 服务端登出失败不影响本地已经清除的会话 */
    }
    logger.info('cloud', '已退出云端账号')
  }

  async changePassword(_userId: string, oldPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 6) throw new Error('新密码至少 6 位')
    const s = readSession()
    if (!s) throw new Error('请先登录')

    // 先用旧密码换一次会话，验证旧密码确实正确
    await apiFetch<GoTrueSession>('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: s.email, password: oldPassword }),
    })

    const token = await accessToken()
    if (!token) throw new Error('登录已过期，请重新登录')
    await apiFetch('/auth/v1/user', {
      method: 'PUT',
      body: JSON.stringify({ password: newPassword }),
    }, token)
    logger.info('cloud', '云端密码已修改')
  }
}

/* ---------------------------------------------------------------- 同步层 */

interface KvRow {
  key: string
  value: unknown
}

export interface SyncStatus {
  /** 上次成功同步的时间戳 */
  lastSyncAt: number | null
  /** 等待上传的变更数 */
  pending: number
  /** 最近一次失败原因，成功后清空 */
  error: string | null
}

const PUSH_DELAY = 800
const MAX_RETRY_DELAY = 60_000

/**
 * 在本地驱动外面包一层同步。
 *
 * - get / entries 直接读本地，永远快、永远可用
 * - set / remove / clear 先写本地，再把变更排队异步推到云端
 * - pull() 在登录或手动同步时把云端数据合并回本地
 */
export class SyncDriver implements StorageDriver {
  private scope: string | null = null
  private queue = new Map<string, unknown>()
  private tombstones = new Set<string>()
  private clearPrefixes: string[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private flushing = false
  private retryDelay = 1000
  private status: SyncStatus = { lastSyncAt: null, pending: 0, error: null }

  constructor(private local: StorageDriver) {}

  getStatus(): SyncStatus {
    return { ...this.status }
  }

  /** 设定同步范围（形如 u:<userId>:），null 表示暂停同步 */
  setScope(prefix: string | null) {
    if (this.scope === prefix) return
    this.scope = prefix
    this.queue.clear()
    this.tombstones.clear()
    this.clearPrefixes = []
    this.status = { ...this.status, pending: 0 }
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    logger.info('cloud', prefix ? '同步范围已就绪' : '未登录，同步暂停', { prefix })
  }

  /* ------------------------------------------------------- StorageDriver */

  async get<T>(key: string): Promise<T | undefined> {
    return this.local.get<T>(key)
  }

  async entries<T>(prefix: string): Promise<Record<string, T>> {
    return this.local.entries<T>(prefix)
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.local.set(key, value)
    this.enqueue(key, value)
  }

  async setMany(entries: [string, unknown][]): Promise<void> {
    await this.local.setMany(entries)
    for (const [k, v] of entries) this.enqueue(k, v)
  }

  async remove(key: string): Promise<void> {
    await this.local.remove(key)
    if (!this.inScope(key)) return
    this.queue.delete(key)
    this.tombstones.add(key)
    this.touch()
  }

  async clear(prefix: string): Promise<void> {
    await this.local.clear(prefix)
    for (const k of [...this.queue.keys()]) {
      if (k.startsWith(prefix)) this.queue.delete(k)
    }
    for (const k of [...this.tombstones]) {
      if (k.startsWith(prefix)) this.tombstones.delete(k)
    }
    if (this.scope && prefix.startsWith(this.scope)) {
      this.clearPrefixes.push(prefix)
      this.touch()
    }
  }

  /* ------------------------------------------------------------ 内部 */

  private inScope(key: string): boolean {
    return Boolean(this.scope && key.startsWith(this.scope))
  }

  private enqueue(key: string, value: unknown) {
    if (!this.inScope(key)) return
    this.tombstones.delete(key)
    this.queue.set(key, value)
    this.touch()
  }

  private touch() {
    this.status.pending =
      this.queue.size + this.tombstones.size + this.clearPrefixes.length
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, PUSH_DELAY)
  }

  /** 把排队的变更推到云端；失败则原样放回队列并退避重试 */
  async flush(): Promise<void> {
    if (this.flushing) return
    const scope = this.scope
    if (!scope || !cloudConfigured) return
    if (!this.queue.size && !this.tombstones.size && !this.clearPrefixes.length) return

    const rows = [...this.queue.entries()]
    const keys = [...this.tombstones]
    const prefixes = [...this.clearPrefixes]
    this.queue.clear()
    this.tombstones.clear()
    this.clearPrefixes = []
    this.flushing = true

    try {
      const token = await accessToken()
      if (!token) throw new CloudError('未登录')

      for (const prefix of prefixes) {
        await apiFetch(
          `/rest/v1/${TABLE}?key=like.${encodeURIComponent(prefix)}*`,
          { method: 'DELETE' },
          token
        )
      }
      for (const key of keys) {
        await apiFetch(
          `/rest/v1/${TABLE}?key=eq.${encodeURIComponent(key)}`,
          { method: 'DELETE' },
          token
        )
      }
      if (rows.length) {
        await apiFetch(`/rest/v1/${TABLE}?on_conflict=user_id,key`, {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(
            rows.map(([key, value]) => ({
              key,
              value,
              updated_at: new Date().toISOString(),
            }))
          ),
        }, token)
      }

      this.retryDelay = 1000
      this.status = { lastSyncAt: Date.now(), pending: 0, error: null }
      logger.info('cloud', '变更已同步到云端', {
        上传: rows.length,
        删除: keys.length,
        清空: prefixes.length,
      })
    } catch (err) {
      for (const [k, v] of rows) if (!this.queue.has(k)) this.queue.set(k, v)
      for (const k of keys) this.tombstones.add(k)
      for (const p of prefixes) if (!this.clearPrefixes.includes(p)) this.clearPrefixes.push(p)

      const message = err instanceof Error ? err.message : String(err)
      this.status = {
        ...this.status,
        pending: this.queue.size + this.tombstones.size + this.clearPrefixes.length,
        error: message,
      }
      logger.warn('cloud', '同步失败，稍后自动重试', {
        原因: message,
        待推送: this.status.pending,
      })

      const wait = this.retryDelay
      this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_DELAY)
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        void this.flush()
      }, wait)
    } finally {
      this.flushing = false
    }
  }

  /**
   * 把云端数据合并回本地。
   *
   * 规则：云端有而本地没有 → 采用云端；两边都有且内容不同 → 以云端为准；
   * 本地有而云端没有 → 保留本地并补推上去。这样换设备登录不会丢数据，
   * 冲突时也不会出现「两边各一半」的错乱状态。
   */
  async pull(): Promise<number> {
    const scope = this.scope
    if (!scope || !cloudConfigured) return 0

    try {
      const token = await accessToken()
      if (!token) return 0

      const rows = await apiFetch<KvRow[]>(
        `/rest/v1/${TABLE}?select=key,value&key=like.${encodeURIComponent(scope)}*`,
        {},
        token
      )

      const local = await this.local.entries<unknown>(scope)
      const writes: [string, unknown][] = []
      const remoteKeys = new Set<string>()

      for (const row of rows) {
        remoteKeys.add(row.key)
        const cur = local[row.key]
        if (cur === undefined || JSON.stringify(cur) !== JSON.stringify(row.value)) {
          writes.push([row.key, row.value])
        }
      }
      if (writes.length) await this.local.setMany(writes)

      let pendingPush = 0
      for (const [k, v] of Object.entries(local)) {
        if (!remoteKeys.has(k)) {
          this.queue.set(k, v)
          pendingPush += 1
        }
      }
      if (pendingPush) this.touch()

      this.status = { ...this.status, lastSyncAt: Date.now(), error: null }
      logger.info('cloud', '已拉取云端数据', {
        云端行数: rows.length,
        覆盖本地: writes.length,
        待补推: pendingPush,
      })
      return writes.length
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.status = { ...this.status, error: message }
      logger.warn('cloud', '拉取云端数据失败，继续使用本地数据', message)
      return 0
    }
  }
}
