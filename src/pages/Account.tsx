import { useState } from 'react'
import { store, useAppState } from '../core/store'
import { BRAND } from '../core/brand'
import { IconCheck } from '../components/Icons'

function fmtDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

function fmtTime(ts: number) {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function AccountPage() {
  const state = useAppState()
  const { user, customBooks, states } = state

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const guestWordCount = Object.keys(states).length
  const guestBookCount = customBooks.length

  async function submit() {
    setErr(null)
    setOk(null)
    if (mode === 'register' && password !== password2) {
      setErr('两次输入的密码不一致')
      return
    }
    setBusy(true)
    try {
      if (mode === 'register') {
        const u = await store.register(username, password)
        setOk(`注册成功，已登录为「${u.username}」`)
      } else {
        const u = await store.login(username, password)
        setOk(`登录成功，欢迎回来「${u.username}」`)
      }
      setUsername('')
      setPassword('')
      setPassword2('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '操作失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  if (user) {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <div className="page-header">
          <div className="page-title">我的账号</div>
          <div className="page-subtitle">登录状态下，你导入的词库和学习记录都归属于这个账号</div>
        </div>

        <div className="card" style={{ padding: '22px 24px' }}>
          <div className="row" style={{ gap: 16 }}>
            <div className="avatar">{user.username.slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em' }}>
                {user.username}
              </div>
              <div className="card-desc">注册于 {fmtDate(user.createdAt)}</div>
            </div>
            <button className="btn" onClick={() => void store.logout()}>
              退出登录
            </button>
          </div>
        </div>

        <div className="section-label">账号里的数据</div>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{customBooks.length}</div>
            <div className="stat-label">自建词书</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {customBooks.reduce((s, b) => s + b.words.length, 0)}
            </div>
            <div className="stat-label">自建单词</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Object.keys(states).length}</div>
            <div className="stat-label">有学习记录的词</div>
          </div>
        </div>

        <div className="section-label">云同步</div>
        <div className="card">
          {state.cloud.enabled ? (
            <>
              <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-title">已开启 · 换设备登录即可接续</div>
                  <div className="card-desc">
                    {state.cloud.lastSyncAt
                      ? `上次同步：${fmtTime(state.cloud.lastSyncAt)}`
                      : '等待首次同步'}
                    {state.cloud.pending > 0 ? ` · ${state.cloud.pending} 项待上传` : ''}
                  </div>
                </div>
                <button className="btn" onClick={() => void store.syncNow()}>
                  立即同步
                </button>
              </div>
              {state.cloud.error && (
                <div className="form-msg error" style={{ marginTop: 12 }}>
                  {state.cloud.error}（数据已保存在本机，联网后会自动重试）
                </div>
              )}
            </>
          ) : (
            <div className="card-desc" style={{ lineHeight: 1.85 }}>
              当前版本还没有接入云端，数据只保存在这台设备上。
              换设备、重装系统前请先导出备份。
            </div>
          )}
        </div>

        <div className="section-label">关于数据</div>
        <div className="card">
          <div className="card-desc" style={{ lineHeight: 1.85 }}>
            你的词库和学习记录按账号隔离存放，切换账号不会互相影响。
            <br />
            <br />
            {state.cloud.enabled
              ? '数据先写入本机，再自动同步到云端。断网也能照常背单词，联网后会自动补传，不会因为网络问题卡住。'
              : '当前版本的数据只保存在这台设备上。换设备、重装系统前请先导出备份。'}
          </div>
        </div>

        <div className="section-label">安全</div>
        <div className="list">
          <div className="list-item">
            <div style={{ flex: 1 }}>
              <div className="card-title">修改密码</div>
              <div className="card-desc">密码使用随机盐 + SHA-256 存储，明文不会落盘</div>
            </div>
            <button
              className="btn"
              onClick={() => {
                const oldPwd = prompt('请输入原密码')
                if (!oldPwd) return
                const newPwd = prompt('请输入新密码（至少 6 位）')
                if (!newPwd) return
                void store.changePassword(user.id, oldPwd, newPwd).then(
                  () => alert('密码已修改'),
                  (e) => alert(e instanceof Error ? e.message : '修改失败')
                )
              }}
            >
              修改
            </button>
          </div>
        </div>
      </div>
    )
  }

  const cloudOn = state.cloud.enabled
  const subtitle =
    mode === 'login'
      ? cloudOn
        ? '登录后会自动拉取云端的词库和学习记录'
        : '登录后你的词库和学习记录会归属这个账号'
      : cloudOn
        ? '同一个账号可以在多台设备登录，数据自动同步'
        : '账号仅在本软件内有效，不会关联其他平台'

  return (
    <div className="page" style={{ maxWidth: 460, paddingTop: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div className="brand-mark" style={{ margin: '0 auto 16px' }}>
          拾
        </div>
        <div className="page-title" style={{ fontSize: 23 }}>
          {mode === 'login' ? `登录${BRAND.short}` : `注册${BRAND.short}账号`}
        </div>
        <div className="page-subtitle">{subtitle}</div>
      </div>

      <div className="segmented" style={{ display: 'flex', marginBottom: 18 }}>
        <button
          className={mode === 'login' ? 'active' : ''}
          style={{ flex: 1 }}
          onClick={() => {
            setMode('login')
            setErr(null)
          }}
        >
          登录
        </button>
        <button
          className={mode === 'register' ? 'active' : ''}
          style={{ flex: 1 }}
          onClick={() => {
            setMode('register')
            setErr(null)
          }}
        >
          注册
        </button>
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">用户名</label>
        <input
          className="input"
          placeholder="2-20 个字符，支持中文"
          value={username}
          autoFocus
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">密码</label>
        <input
          className="input"
          type="password"
          placeholder="至少 6 位"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
      </div>

      {mode === 'register' && (
        <div className="field" style={{ marginBottom: 12 }}>
          <label className="field-label">确认密码</label>
          <input
            className="input"
            type="password"
            placeholder="再输入一次"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
        </div>
      )}

      {err && (
        <div className="form-msg error">{err}</div>
      )}
      {ok && <div className="form-msg success">{ok}</div>}

      <button
        className="btn btn-primary btn-lg"
        style={{ width: '100%', marginTop: 6 }}
        disabled={busy || !username.trim() || !password}
        onClick={() => void submit()}
      >
        {busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
      </button>

      {mode === 'register' && (guestBookCount > 0 || guestWordCount > 0) && (
        <div className="form-hint">
          <IconCheck size={12} /> 你在游客模式下已有 {guestBookCount} 本自建词书、{guestWordCount} 个学习记录，
          注册后会自动归入这个账号
        </div>
      )}

      <div className="section-label">关于登录方式</div>
      <div className="card">
        <div className="card-desc" style={{ lineHeight: 1.8 }}>
          微信 / QQ 登录需要企业资质与开放平台审核，手机号登录需要接入短信服务商，
          目前都无法提供，所以先做了账号密码注册。
          <br />
          <br />
          账号体系已经做成可替换的结构，后续接入第三方登录后，原有账号和词库不受影响。
        </div>
      </div>
    </div>
  )
}
