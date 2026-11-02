/**
 * 存储层抽象。
 *
 * 目前使用 IndexedDB 本地存储，保证离线可用。
 * 后续接入云端同步时，只需实现一个新的 StorageDriver 并在 createDriver 里替换，
 * 上层业务代码完全不用改动。
 */

export interface StorageDriver {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  setMany(entries: [string, unknown][]): Promise<void>
  remove(key: string): Promise<void>
  /** 按前缀批量读取，返回 key -> value */
  entries<T>(prefix: string): Promise<Record<string, T>>
  clear(prefix: string): Promise<void>
}

const DB_NAME = 'vocab-master'
const STORE_NAME = 'kv'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class LocalStorageDriver implements StorageDriver {
  private dbPromise: Promise<IDBDatabase> | null = null

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDB()
    return this.dbPromise
  }

  async get<T>(key: string): Promise<T | undefined> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve(req.result as T | undefined)
      req.onerror = () => reject(req.error)
    })
  }

  async set<T>(key: string, value: T): Promise<void> {
    return this.setMany([[key, value]])
  }

  async setMany(entries: [string, unknown][]): Promise<void> {
    if (!entries.length) return
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      for (const [k, v] of entries) store.put(v, k)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async remove(key: string): Promise<void> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async entries<T>(prefix: string): Promise<Record<string, T>> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const out: Record<string, T> = {}
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'))
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          out[String(cursor.key)] = cursor.value as T
          cursor.continue()
        } else {
          resolve(out)
        }
      }
      req.onerror = () => reject(req.error)
    })
  }

  async clear(prefix: string): Promise<void> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'))
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}

/** 内存兜底：IndexedDB 不可用（如隐私模式）时使用，避免整个应用崩掉 */
export class MemoryDriver implements StorageDriver {
  private map = new Map<string, unknown>()
  async get<T>(key: string) {
    return this.map.get(key) as T | undefined
  }
  async set<T>(key: string, value: T) {
    this.map.set(key, value)
  }
  async setMany(entries: [string, unknown][]) {
    for (const [k, v] of entries) this.map.set(k, v)
  }
  async remove(key: string) {
    this.map.delete(key)
  }
  async entries<T>(prefix: string) {
    const out: Record<string, T> = {}
    for (const [k, v] of this.map) {
      if (k.startsWith(prefix)) out[k] = v as T
    }
    return out
  }
  async clear(prefix: string) {
    for (const k of [...this.map.keys()]) {
      if (k.startsWith(prefix)) this.map.delete(k)
    }
  }
}

export function createDriver(): StorageDriver {
  try {
    if (typeof indexedDB === 'undefined') return new MemoryDriver()
    return new LocalStorageDriver()
  } catch {
    return new MemoryDriver()
  }
}

export const K = {
  settings: 'cfg:settings',
  logs: 'cfg:logs',
  customBooks: 'cfg:customBooks',
  /** 单词状态按单词单独存储，键为 state:<wordKey> */
  statePrefix: 'state:',
} as const

export function stateStorageKey(key: string) {
  return K.statePrefix + key
}
