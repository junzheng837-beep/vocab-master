/**
 * 学习范围。
 *
 * URL 里用一个字符串表示，便于 hash 路由直接携带：
 *   all                 全部已选词书
 *   cet4                某一本词书
 *   <bookId>::<group>   自建词书的某个分组
 *   __wrong__           错词本
 *   __root__:gram       某个词根下的词
 */

export type Scope =
  | { kind: 'all' }
  | { kind: 'book'; bookId: string; group?: string }
  | { kind: 'wrong' }
  | { kind: 'root'; root: string }

export const WRONG_SCOPE = '__wrong__'
export const ROOT_PREFIX = '__root__:'
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
    case 'book':
      return scope.group
        ? `${scope.bookId}${GROUP_SEP}${encodeURIComponent(scope.group)}`
        : scope.bookId
  }
}
