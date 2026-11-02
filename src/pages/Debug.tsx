import { useMemo, useState, useSyncExternalStore } from 'react'
import { clearLogs, exportLogs, getLogs, subscribeLogs, type LogLevel } from '../core/logger'
import { useAppState } from '../core/store'
import { IconTrash } from '../components/Icons'

const LEVELS: { id: LogLevel | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'info', label: '信息' },
  { id: 'warn', label: '警告' },
  { id: 'error', label: '错误' },
  { id: 'debug', label: '调试' },
]

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: 'var(--text-tertiary)',
  info: 'var(--accent)',
  warn: 'var(--orange)',
  error: 'var(--red)',
}

function useLogs() {
  return useSyncExternalStore(subscribeLogs, getLogs, getLogs)
}

export default function DebugPage() {
  const logs = useLogs()
  const state = useAppState()
  const [level, setLevel] = useState<LogLevel | 'all'>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return logs
      .filter((l) => (level === 'all' ? true : l.level === level))
      .filter((l) =>
        q ? l.msg.toLowerCase().includes(q) || l.scope.toLowerCase().includes(q) : true
      )
      .slice()
      .reverse()
  }, [logs, level, query])

  const counts = useMemo(() => {
    const c: Record<string, number> = { debug: 0, info: 0, warn: 0, error: 0 }
    for (const l of logs) c[l.level] += 1
    return c
  }, [logs])

  function download() {
    const text = exportLogs()
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vocab-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <div className="page-header">
        <div className="page-title">调试日志</div>
        <div className="page-subtitle">
          共 {logs.length} 条 · 错误 {counts.error} · 警告 {counts.warn} · 每一步关键操作都有记录
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-value">{Object.keys(state.states).length}</div>
          <div className="stat-label">单词状态</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Object.keys(state.books).length}</div>
          <div className="stat-label">已加载词书</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{state.session.entries.length}</div>
          <div className="stat-label">当前队列</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 17 }}>
            {state.settings.theme}
          </div>
          <div className="stat-label">主题</div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <div className="segmented">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              className={level === l.id ? 'active' : ''}
              onClick={() => setLevel(l.id)}
            >
              {l.label}
              {l.id !== 'all' && counts[l.id] > 0 ? ` ${counts[l.id]}` : ''}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="搜索内容或模块"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={download} disabled={!logs.length}>
          导出 txt
        </button>
        <button className="btn btn-danger" onClick={clearLogs} disabled={!logs.length}>
          <IconTrash size={14} />
          清空
        </button>
      </div>

      <div className="log-list">
        {filtered.length === 0 && (
          <div className="log-empty">没有匹配的日志</div>
        )}
        {filtered.map((l) => {
          const t = new Date(l.ts)
          const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0')}`
          const hasData = l.data !== undefined
          return (
            <div
              key={l.id}
              className={`log-row ${hasData ? 'clickable' : ''}`}
              onClick={() => hasData && setExpanded(expanded === l.id ? null : l.id)}
            >
              <span className="log-time">{time}</span>
              <span className="log-level" style={{ color: LEVEL_COLOR[l.level] }}>
                {l.level.toUpperCase()}
              </span>
              <span className="log-scope">{l.scope}</span>
              <span className="log-msg">
                {l.msg}
                {hasData && expanded !== l.id && <span className="log-more"> ▸</span>}
              </span>
              {hasData && expanded === l.id && (
                <pre className="log-data">
                  {(() => {
                    try {
                      return JSON.stringify(l.data, null, 2)
                    } catch {
                      return String(l.data)
                    }
                  })()}
                </pre>
              )}
            </div>
          )
        })}
      </div>

      <div className="card-desc" style={{ marginTop: 16, lineHeight: 1.75 }}>
        日志同时会输出到浏览器控制台（F12 → Console），前缀 <code>[vocab:模块名]</code>。
        遇到问题时点「导出 txt」把日志发给我，能快速定位。
      </div>
    </div>
  )
}
