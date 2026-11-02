/**
 * 账号体系（本地实现）
 *
 * 说明：
 * - 微信 / QQ 登录需要企业资质与开放平台审核，手机号登录需要短信服务商，
 *   在当前环境下都无法落地，因此先提供账号密码注册。
 * - 密码使用随机盐 + SHA-256 存储，明文不落盘。
 * - 数据按账号命名空间隔离（u:<userId>: 前缀），切换账号不会串数据。
 * - AuthProvider 是抽象层：云端服务可用时实现一个 CloudAuthProvider 替换即可，
 *   上层的注册 / 登录 / 登出界面与数据隔离逻辑完全不用改。
 */

import type { StorageDriver } from './storage'

export interface AuthUser {
  id: string
  username: string
  createdAt: number
}

interface StoredUser {
  id: string
  username: string
  salt: string
  hash: string
  createdAt: number
}

export interface AuthProvider {
  readonly kind: 'local' | 'cloud'
  current(): Promise<AuthUser | null>
  register(username: string, password: string): Promise<AuthUser>
  login(username: string, password: string): Promise<AuthUser>
  logout(): Promise<void>
}

export const AUTH_KEYS = {
  users: 'auth:users',
  session: 'auth:session',
} as const

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomSalt(): string {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}::${password}::${salt}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

export class LocalAuthProvider implements AuthProvider {
  readonly kind = 'local' as const

  constructor(private driver: StorageDriver) {}

  private async users(): Promise<Record<string, StoredUser>> {
    return (await this.driver.get<Record<string, StoredUser>>(AUTH_KEYS.users)) ?? {}
  }

  async current(): Promise<AuthUser | null> {
    const id = await this.driver.get<string>(AUTH_KEYS.session)
    if (!id) return null
    const all = await this.users()
    const u = all[id]
    if (!u) return null
    return { id: u.id, username: u.username, createdAt: u.createdAt }
  }

  async register(username: string, password: string): Promise<AuthUser> {
    const name = username.trim()
    if (name.length < 2) throw new Error('用户名至少 2 个字符')
    if (name.length > 20) throw new Error('用户名最多 20 个字符')
    if (!/^[\w\u4e00-\u9fa5.@-]+$/.test(name)) throw new Error('用户名只能包含字母、数字、下划线、中文')
    if (password.length < 6) throw new Error('密码至少 6 位')

    const all = await this.users()
    const exists = Object.values(all).some(
      (u) => u.username.toLowerCase() === name.toLowerCase()
    )
    if (exists) throw new Error('这个用户名已经被注册了')

    const salt = randomSalt()
    const hash = await hashPassword(password, salt)
    const user: StoredUser = {
      id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      username: name,
      salt,
      hash,
      createdAt: Date.now(),
    }
    all[user.id] = user
    await this.driver.set(AUTH_KEYS.users, all)
    await this.driver.set(AUTH_KEYS.session, user.id)
    return { id: user.id, username: user.username, createdAt: user.createdAt }
  }

  async login(username: string, password: string): Promise<AuthUser> {
    const name = username.trim().toLowerCase()
    const all = await this.users()
    const user = Object.values(all).find((u) => u.username.toLowerCase() === name)
    if (!user) throw new Error('用户名或密码不正确')
    const hash = await hashPassword(password, user.salt)
    if (hash !== user.hash) throw new Error('用户名或密码不正确')
    await this.driver.set(AUTH_KEYS.session, user.id)
    return { id: user.id, username: user.username, createdAt: user.createdAt }
  }

  async logout(): Promise<void> {
    await this.driver.remove(AUTH_KEYS.session)
  }

  /** 修改密码（本地账号专用） */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const all = await this.users()
    const user = all[userId]
    if (!user) throw new Error('账号不存在')
    const oldHash = await hashPassword(oldPassword, user.salt)
    if (oldHash !== user.hash) throw new Error('原密码不正确')
    if (newPassword.length < 6) throw new Error('新密码至少 6 位')
    const salt = randomSalt()
    all[userId] = { ...user, salt, hash: await hashPassword(newPassword, salt) }
    await this.driver.set(AUTH_KEYS.users, all)
  }
}
