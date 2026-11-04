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
  /** 单词出现时自动朗读一遍 */
  speakOnWord: boolean
  /** 显示释义后自动发音 */
  autoSpeak: boolean
  /** 自定义词库的新词顺序：导入顺序 / 随机打乱 */
  customOrder: 'import' | 'random'
  /** 拼写测试：看完释义后要求打出单词 */
  spellMode: boolean
  updatedAt: number
}

export interface RootWord {
  /** 单词 */
  w: string
  /** 音标 */
  p: string
  /** 释义 */
  t: [string, string][]
}

export interface RootEntry {
  /** 词根 */
  r: string
  /** 含义（优先中文） */
  m: string
  /** 英文原义 */
  me?: string
  /** 细分类型：词根 / 前缀 / 名词后缀 … */
  c: string
  /** 归一化大类：词根 / 前缀 / 后缀 */
  cat?: string
  /** 语源 */
  o: string
  /** 例词（含音标和释义，内嵌避免额外请求） */
  w: RootWord[]
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

/** 拼写练习列表里的一项 */
export interface SpellItem {
  /** 唯一键，通常为 bookId::word */
  key: string
  /** 词条完整数据，自带释义、音标、例句，不依赖词书是否加载 */
  word: RawWord
  addedAt: number
}

/** 拼写库里的一个词（结构比词条轻，够拼写练习用） */
export interface SpellLibWord {
  w: string
  p: string
  t: [string, string][]
  /** 词根词缀，拼写提示用 */
  r?: [string, string, string][]
  /** 所属分组名（作文词专用） */
  g?: string
}

/** 拼写库：可以整本加入拼写练习 */
export interface SpellLibrary {
  id: string
  name: string
  desc: string
  groups: BookGroup[]
  words: SpellLibWord[]
}

/** 首字母索引里的一个词 */
export interface LetterWord {
  w: string
  /** 来源词书 id，学习时沿用这本书的记录，避免同一个词学两遍 */
  b: string
  p: string
  t: [string, string][]
}

export interface LetterIndexEntry {
  l: string
  count: number
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
