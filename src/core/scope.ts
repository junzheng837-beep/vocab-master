/**
 * 学习范围。
 *
 * URL 里用一个字符串表示，便于 hash 路由直接携带：
 *   all                      全部已选词书
 *   cet4                     某一本词书
 *   <bookId>::<group>        自建词书的某个分组
 *   __wrong__                错词本
 *   __root__:gram            某个词根下的词
 *   __letter__:pub:a         首字母 a 的公共词库
 *   __letter__:learned:a     首字母 a 的已学单词
 */

export type LetterSource = 'public' | 'learned'

export type Scope =
  | { kind: 'all' }
  | { kind: 'book'; bookId: string; group?: string }
  | { kind: 'wrong' }
  | { kind: 'root'; root: string }
  | { kind: 'letter'; letter: string; source: LetterSource }

export const WRONG_SCOPE = '__wrong__'
export const ROOT_PREFIX = '__root__:'
export const LETTER_PREFIX = '__letter__:'
export const GROUP_SEP = '::'

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function parseScope(param: string | null | undefined): Scope {
  if (!param || param === 'all') return { kind: 'all' }
  if (param === WRONG_SCOPE) return { kind: 'wrong' }
  if (param.startsWith(ROOT_PREFIX)) {
    return { kind: 'root', root: safeDecode(param.slice(ROOT_PREFIX.length)) }
  }
  if (param.startsWith(LETTER_PREFIX)) {
    const rest = param.slice(LETTER_PREFIX.length)
    const idx = rest.indexOf(':')
    const src = idx >= 0 ? rest.slice(0, idx) : 'pub'
    const letter = (idx >= 0 ? rest.slice(idx + 1) : rest).slice(0, 1).toLowerCase()
    return {
      kind: 'letter',
      letter: /^[a-z]$/.test(letter) ? letter : 'a',
      source: src === 'learned' ? 'learned' : 'public',
    }
  }
  const idx = param.indexOf(GROUP_SEP)
  if (idx > 0) {
    return {
      kind: 'book',
      bookId: param.slice(0, idx),
      group: safeDecode(param.slice(idx + GROUP_SEP.length)),
    }
  }
  return { kind: 'book', bookId: param }
}

export function scopeToParam(scope: Scope): string {
  switch (scope.kind) {
    case 'all':
      return 'all'
    case 'wrong':
      return WRONG_SCOPE
    case 'root':
      return ROOT_PREFIX + encodeURIComponent(scope.root)
    case 'letter':
      return `${LETTER_PREFIX}${scope.source === 'public' ? 'pub' : 'learned'}:${scope.letter}`
    case 'book':
      return scope.group
        ? `${scope.bookId}${GROUP_SEP}${encodeURIComponent(scope.group)}`
        : scope.bookId
  }
}

/** 学习页顶部展示的范围名称 */
export function scopeTitle(scope: Scope): string {
  switch (scope.kind) {
    case 'letter':
      return `${scope.letter.toUpperCase()} 开头 · ${scope.source === 'public' ? '公共词库' : '我学过的'}`
    case 'root':
      return `词根 ${scope.root}`
    case 'wrong':
      return '错词本'
    case 'all':
      return '全部词库'
    case 'book':
      return scope.group ? `${scope.group}` : '词书'
  }
}
