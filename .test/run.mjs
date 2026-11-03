/**
 * 云同步逻辑的离线验证。
 * 编译后的 cloud.mjs 里 import.meta.env 已被替换成测试值，
 * 这里 mock 掉 fetch / localStorage，检查请求内容和合并规则。
 */
import assert from 'node:assert'

/* ---------------------------------------------------------------- mocks */

const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
}

const calls = []
let pullRows = []
let mode = 'empty'

globalThis.fetch = async (url, init = {}) => {
  const method = init.method || 'GET'
  calls.push({ url, method, body: init.body })
  if (url.includes('/rest/v1/user_kv') && method === 'GET') {
    return new Response(JSON.stringify(pullRows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (mode === 'signup') {
    return new Response(
      JSON.stringify({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        user: {
          id: '22222222-2222-2222-2222-222222222222',
          email: 'x@shici.app',
          created_at: '2026-01-01T00:00:00Z',
          user_metadata: { username: '张三' },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return new Response(null, { status: 204 })
}

class MockLocal {
  constructor() {
    this.map = new Map()
  }
  async get(k) {
    return this.map.get(k)
  }
  async set(k, v) {
    this.map.set(k, v)
  }
  async setMany(entries) {
    for (const [k, v] of entries) this.map.set(k, v)
  }
  async remove(k) {
    this.map.delete(k)
  }
  async entries(p) {
    const out = {}
    for (const [k, v] of this.map) if (k.startsWith(p)) out[k] = v
    return out
  }
  async clear(p) {
    for (const k of [...this.map.keys()]) if (k.startsWith(p)) this.map.delete(k)
  }
}

/* ---------------------------------------------------------------- 运行 */

const { SyncDriver, CloudAuthProvider, cloudConfigured } = await import('./cloud.mjs')

const results = []
function check(name, fn) {
  try {
    fn()
    results.push(`  PASS  ${name}`)
  } catch (err) {
    results.push(`  FAIL  ${name}\n        ${err.message}`)
  }
}

check('配置能被识别', () => assert.equal(cloudConfigured, true))

// 预置一个未过期的会话
const USER = '11111111-1111-1111-1111-111111111111'
const SCOPE = `u:${USER}:`
localStorage.setItem(
  'shici:cloud:session',
  JSON.stringify({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 3600_000,
    userId: USER,
    username: '测试',
    email: 'x@shici.app',
    createdAt: Date.now(),
  })
)

const local = new MockLocal()
const sync = new SyncDriver(local)
sync.setScope(SCOPE)

// 1. 账号数据范围内的写入会被推送到云端
await sync.set(`${SCOPE}cfg:settings`, { dailyNew: 20 })
await sync.flush()
const post = calls.find((c) => c.method === 'POST' && c.url.includes('/rest/v1/user_kv'))
check('写入会 upsert 到云端', () => {
  assert.ok(post, '没有发出 POST 请求')
  assert.ok(post.url.includes('on_conflict=user_id,key'), '缺少 on_conflict')
  const body = JSON.parse(post.body)
  assert.equal(body.length, 1)
  assert.equal(body[0].key, `${SCOPE}cfg:settings`)
  assert.deepEqual(body[0].value, { dailyNew: 20 })
})

// 2. 本地账号表（auth:users）不应该被同步出去
calls.length = 0
await sync.set('auth:users', { a: 1 })
await sync.flush()
check('账号数据不会上传', () => assert.equal(calls.length, 0, `意外的请求: ${calls.map((c) => c.url)}`))

// 3. 删除会发出 DELETE
calls.length = 0
await sync.remove(`${SCOPE}cfg:spellList`)
await sync.flush()
check('删除会同步到云端', () => {
  const del = calls.find((c) => c.method === 'DELETE')
  assert.ok(del, '没有发出 DELETE')
  assert.ok(del.url.includes('key=eq.'), 'DELETE 条件不对: ' + del.url)
})

// 4. pull 会把云端数据合并进本地
pullRows = [
  { key: `${SCOPE}cfg:logs`, value: { '2026-11-03': { date: '2026-11-03', learned: 5 } } },
  { key: `${SCOPE}state:cet4::apple`, value: { key: 'cet4::apple', reps: 3 } },
]
const merged = await sync.pull()
check('pull 合并云端数据', () => {
  assert.equal(merged, 2, `实际合并 ${merged} 条`)
  assert.deepEqual(local.map.get(`${SCOPE}cfg:logs`), {
    '2026-11-03': { date: '2026-11-03', learned: 5 },
  })
  assert.deepEqual(local.map.get(`${SCOPE}state:cet4::apple`), { key: 'cet4::apple', reps: 3 })
})

// 5. 本地独有的键在 pull 之后要补推
calls.length = 0
await sync.flush()
check('本地独有数据会补推', () => {
  const body = calls.filter((c) => c.method === 'POST').flatMap((c) => JSON.parse(c.body))
  const keys = body.map((r) => r.key)
  assert.ok(
    keys.includes(`${SCOPE}cfg:settings`),
    `补推的键里没有本地独有数据: ${keys.join(',')}`
  )
})

// 6. 用户名会被映射成合法邮箱
mode = 'signup'
calls.length = 0
const auth = new CloudAuthProvider()
const user = await auth.register('张三', '123456')
check('用户名映射成合法邮箱', () => {
  const body = JSON.parse(calls[0].body)
  assert.ok(
    /^[a-z0-9._-]+@shici\.app$/.test(body.email),
    '邮箱不合法: ' + body.email
  )
  assert.equal(body.data.username, '张三')
  assert.equal(user.username, '张三', '应回读注册时的用户名')
})

// 7. 未配置时不建同步层（模拟：直接用本地驱动即可）
check('同步状态可读', () => {
  const s = sync.getStatus()
  assert.equal(typeof s.pending, 'number')
  assert.ok(s.lastSyncAt === null || typeof s.lastSyncAt === 'number')
})

console.log(results.join('\n'))
const failed = results.filter((r) => r.includes('FAIL')).length
console.log(`\n${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
