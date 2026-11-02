/** 词条原始数据（构建脚本产出的紧凑格式） */
export interface RawWord {
  /** 单词 */
  w: string
  /** 英式音标 */
  uk?: string
  /** 美式音标 */
  us?: string
  /** 释义 [词性, 中文] */
  t: [string, string][]
  /** 例句 [英文, 中文] */
  s: [string, string][]
  /** 短语 [英文, 中文] */
  p: [string, string][]
  /** 词根词缀 [词根, 含义, 类型] */
  r: [string, string, string][]
  /** 近义词 [中文释义, 英文词列表] */
  syn?: [string, string[]][]
  /** 所属主题（生活日常词书专用） */
  g?: string
}

export interface BookGroup {
  name: string
  start: number
  count: number
}

export interface BookData {
  id: string
  name: string
  desc: string
  wordCount: number
  groups?: BookGroup[]
  words: RawWord[]
}

export interface BookMeta {
  id: string
  name: string
  desc: string
  count: number
  tag: string
  /** 分类：中学 / 大学 / 实用 */
  category?: string
  /** 是否为用户自建词书 */
  custom?: boolean
}

/** 评分档次：0 待会再来 / 1 困难 / 2 一般 / 3 容易 */
export type Rating = 0 | 1 | 2 | 3

export type WordStage = 'new' | 'learning' | 'review' | 'known'

/** 单个单词的学习状态，按单词独立存储，便于多设备按词合并 */
export interface WordState {
  /** 唯一键 bookId::word */
  key: string
  bookId: string
  word: string
  stage: WordStage
  /** 当前复习间隔（天） */
  interval: number
  /** 到期时间戳（ms） */
  dueAt: number
  /** 累计作答次数 */
  reps: number
  /** 遗忘次数 */
  lapses: number
  /** 最近一次评分 */
  lastRating: Rating | null
  /** 最近一次作答时间 */
  lastSeenAt: number
  createdAt: number
  /** 用于多设备同步时取新 */
  updatedAt: number
}

export interface Settings {
  /** 每天新学单词数 */
  dailyNew: number
  /** 每天最多复习数 */
  dailyReview: number
  /** 参与学习的词书 */
  activeBooks: string[]
  theme: 'auto' | 'light' | 'dark'
  /** 显示释义后自动发音 */
  autoSpeak: boolean
  updatedAt: number
}

export interface DailyLog {
  date: string
  learned: number
  reviewed: number
  ratings: [number, number, number, number]
  updatedAt: number
}

export interface CustomBook {
  id: string
  name: string
  desc: string
  createdAt: number
  updatedAt: number
  words: RawWord[]
}

/** 会话中的一个条目 */
export interface SessionEntry {
  entryId: string
  key: string
  bookId: string
  word: RawWord
  isNew: boolean
  done: boolean
  /** 本轮内被重新排队的次数 */
  retried: number
}
