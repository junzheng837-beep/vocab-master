import type { Rating, WordState } from './types'

const DAY = 86400000

/**
 * 评分对应的复习间隔（天）。
 * 完全按需求设定：困难 1 天、一般 3 天、容易 7 天。
 */
export const BASE_INTERVAL: Record<1 | 2 | 3, number> = {
  1: 1,
  2: 3,
  3: 7,
}

/** 连续答「容易」时间隔的放大系数，避免背熟后仍每 7 天被反复打扰 */
const EASY_GROWTH = 1.8
/** 间隔上限（天） */
const MAX_INTERVAL = 120
/** 间隔达到该值视为已掌握 */
const KNOWN_THRESHOLD = 30

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(ts: number): number {
  return startOfDay(ts) + DAY - 1
}

export function dateKey(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 距离到期还有几天（负数表示已过期） */
export function daysUntil(ts: number, now = Date.now()): number {
  return Math.round((startOfDay(ts) - startOfDay(now)) / DAY)
}

export function makeWordState(key: string, bookId: string, word: string, now = Date.now()): WordState {
  return {
    key,
    bookId,
    word,
    stage: 'new',
    interval: 0,
    dueAt: 0,
    reps: 0,
    lapses: 0,
    lastRating: null,
    lastSeenAt: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * 应用一次评分，返回新的单词状态。
 *
 * rating = 0 表示「没记得」：本轮内重新排队，当天到期，不改动长期间隔。
 * rating = 1/2/3：分别安排 1 / 3 / 7 天后复习；
 *   连续答「容易」时间隔会按 1.8 倍递增（7 → 13 → 23 …），上限 120 天。
 */
export function applyRating(state: WordState, rating: Rating, now = Date.now()): WordState {
  const next: WordState = {
    ...state,
    reps: state.reps + 1,
    lastRating: rating,
    lastSeenAt: now,
    updatedAt: now,
  }

  if (rating === 0) {
    next.stage = 'learning'
    next.interval = 0
    next.lapses = state.lapses + 1
    next.dueAt = now
    return next
  }

  let interval: number
  if (rating === 1) {
    interval = BASE_INTERVAL[1]
  } else if (rating === 2) {
    interval = BASE_INTERVAL[2]
  } else {
    interval = state.interval >= BASE_INTERVAL[3]
      ? Math.min(Math.round(state.interval * EASY_GROWTH), MAX_INTERVAL)
      : BASE_INTERVAL[3]
  }

  next.interval = interval
  next.dueAt = startOfDay(now) + interval * DAY
  next.stage = interval >= KNOWN_THRESHOLD ? 'known' : 'review'
  return next
}

/** 是否已到期待复习 */
export function isDue(state: WordState, now = Date.now()): boolean {
  if (state.stage === 'new') return false
  return state.dueAt <= endOfDay(now)
}

/** 今天是否已经学过（用于「待会再来」的单词当天继续排） */
export function studiedToday(state: WordState, now = Date.now()): boolean {
  return state.lastSeenAt > 0 && startOfDay(state.lastSeenAt) === startOfDay(now)
}
