/**
 * 调试日志系统
 *
 * - 内存环形缓冲（默认 1000 条），可在 #/debug 页面查看
 * - 同时输出到浏览器控制台，前缀 [vocab:scope]
 * - 支持按级别、作用域筛选，支持导出为文本
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  ts: number
  level: LogLevel
  scope: string
  msg: string
  data?: unknown
}

const MAX_ENTRIES = 1000
/** 低于该级别的日志不进入缓冲区（控制台仍会输出 debug 以上的内容） */
const MIN_LEVEL: LogLevel = 'debug'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

let seq = 0
let buffer: LogEntry[] = []
let snapshot: LogEntry[] = buffer
const listeners = new Set<() => void>()

function emit() {
  snapshot = buffer.slice()
  for (const fn of listeners) fn()
}

function fmtData(data: unknown): unknown {
  if (data === undefined) return ''
  if (data instanceof Error) return `${data.name}: ${data.message}`
  return data
}

export function log(level: LogLevel, scope: string, msg: string, data?: unknown) {
  const entry: LogEntry = { id: (seq += 1), ts: Date.now(), level, scope, msg, data }

  if (LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[MIN_LEVEL]) {
    buffer.push(entry)
    if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(buffer.length - MAX_ENTRIES)
    emit()
  }

  // 控制台输出
  const tag = `%c[vocab:${scope}]`
  const style =
    level === 'error'
      ? 'color:#ff453a;font-weight:600'
      : level === 'warn'
        ? 'color:#ff9f0a;font-weight:600'
        : level === 'debug'
          ? 'color:#8e8e93'
          : 'color:#0a84ff;font-weight:600'
  const payload = fmtData(data)
  if (level === 'error') console.error(tag, style, msg, payload)
  else if (level === 'warn') console.warn(tag, style, msg, payload)
  else if (level === 'debug') console.debug(tag, style, msg, payload)
  else console.log(tag, style, msg, payload)
}

export const logger = {
  debug: (scope: string, msg: string, data?: unknown) => log('debug', scope, msg, data),
  info: (scope: string, msg: string, data?: unknown) => log('info', scope, msg, data),
  warn: (scope: string, msg: string, data?: unknown) => log('warn', scope, msg, data),
  error: (scope: string, msg: string, data?: unknown) => log('error', scope, msg, data),
}

/** 记录一段异步操作的耗时 */
export async function trace<T>(scope: string, msg: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now()
  logger.debug(scope, `${msg} · 开始`)
  try {
    const out = await fn()
    logger.debug(scope, `${msg} · 完成`, { 耗时: `${(performance.now() - t0).toFixed(0)}ms` })
    return out
  } catch (err) {
    logger.error(scope, `${msg} · 失败`, err)
    throw err
  }
}

export function getLogs(): LogEntry[] {
  return snapshot
}

export function subscribeLogs(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function clearLogs() {
  buffer = []
  emit()
  logger.info('logger', '日志已清空')
}

export function exportLogs(): string {
  const lines = snapshot.map((e) => {
    const t = new Date(e.ts)
    const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0')}`
    let extra = ''
    if (e.data !== undefined) {
      try {
        extra = ' ' + JSON.stringify(e.data)
      } catch {
        extra = ' [unserializable]'
      }
    }
    return `${time} ${e.level.toUpperCase().padEnd(5)} [${e.scope}] ${e.msg}${extra}`
  })
  return lines.join('\n')
}

/** 安装全局错误捕获，未处理的异常也会进日志 */
export function installGlobalErrorHandlers() {
  window.addEventListener('error', (ev) => {
    logger.error('global', '未捕获异常', ev.error ?? ev.message)
  })
  window.addEventListener('unhandledrejection', (ev) => {
    logger.error('global', '未处理的 Promise 拒绝', ev.reason)
  })
  logger.info('logger', '全局错误捕获已安装')
}
