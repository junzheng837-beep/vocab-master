/**
 * 静态资源路径。
 *
 * vite.config 里把 base 设成相对路径，这样同一份构建产物既能放在
 * 根目录（本地 / 自有服务器），也能放在子目录（GitHub Pages 的 /repo/）。
 * 应用用的是 hash 路由，路径不会随页面变化，所以相对路径是安全的。
 */
export const BASE = import.meta.env.BASE_URL

export function dataUrl(path: string): string {
  return `${BASE}data/${path.replace(/^\//, '')}`
}
