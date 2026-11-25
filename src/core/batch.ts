/**
 * 词书里的小词库（批次）。
 *
 * 每次往词书里加词都记一个批次 id，同一个批次的词算一个小词库。
 * 没有批次但有时间的词按「哪一天加的」归并；
 * 内置词书自带的词、以及这个功能上线之前加的词，都归到「早期 / 自带」那一组。
 */
import type { RawWord } from './types'

/** 没有记录加入时间的词 */
export const BATCH_LEGACY = 'legacy'

/** 这个词属于哪个小词库 */
export function batchKeyOf(w: RawWord): string {
  if (w.batchId) return `batch:${w.batchId}`
  if (w.addedAt) {
    const d = new Date(w.addedAt)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `day:${d.getFullYear()}-${m}-${day}`
  }
  return BATCH_LEGACY
}

export function formatBatchTime(ts: number, withSeconds = false): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${withSeconds ? `${hm}:${pad(d.getSeconds())}` : hm}`
}

/**
 * 从小词库 key 反推展示名。
 * 学习页顶部只有一个字符串 scope，拿不到批次列表，所以名字必须能从 key 算出来。
 */
export function batchLabelOf(key: string, legacyLabel = '早期加入'): string {
  if (!key || key === BATCH_LEGACY) return legacyLabel

  if (key.startsWith('day:')) {
    const [, y, m, d] = key.split(/[-:]/)
    if (!y || !m || !d) return key
    return `${Number(m)}月${Number(d)}日 加入`
  }

  if (key.startsWith('batch:')) {
    const ts = Number(key.slice(6))
    if (!ts || Number.isNaN(ts)) return '加词批次'
    return `${formatBatchTime(ts)} 加入`
  }

  return key
}
